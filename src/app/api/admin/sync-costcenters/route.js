import { cookies } from "next/headers";
import { readFileSync, writeFileSync } from "fs";
import {
  getCachedInvoices,
  getCustomerCostCenterMappings,
  saveCustomerCostCenterMappings,
} from "@/lib/supabase";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getToken() {
  try {
    return readFileSync(".fortnox_token", "utf8").trim();
  } catch {
    return null;
  }
}

async function fetchJsonWithRetry(url, options = {}, retries = 5) {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    const res = await fetch(url, options);

    if (res.status === 429) {
      const waitTime = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
      await delay(waitTime + 500);
      continue;
    }

    const text = await res.text();
    try {
      const data = text ? JSON.parse(text) : null;
      return { ok: res.ok, status: res.status, data };
    } catch {
      if (!res.ok) {
        await delay(1000 * attempt);
        continue;
      }
      return { ok: true, status: res.status, data: null };
    }
  }
  throw new Error(`Misslyckades att hämta JSON från ${url} efter ${retries} försök`);
}

async function refreshToken(userId) {
  try {
    const refreshToken = readFileSync(".fortnox_refresh", "utf8").trim();
    const credentials = Buffer.from(
      `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch("https://apps.fortnox.se/oauth-v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      writeFileSync(".fortnox_token", data.access_token);
      writeFileSync(".fortnox_refresh", data.refresh_token);
      return data.access_token;
    }
  } catch {
    // ignore
  }
  return null;
}

function normalizeCostCenter(raw) {
  if (!raw) return "";
  if (typeof raw === "object") {
    return String(raw.CostCenter || raw.CostCenterCode || raw.CostCenterId || raw.Code || raw.code || raw.Id || "").trim();
  }
  return String(raw).trim();
}

function normalizeCustomerNumber(raw) {
  if (!raw) return "";
  return String(raw).trim();
}

function normalizeCustomerActive(rawCustomer = {}) {
  const activeRaw = rawCustomer?.Active ?? rawCustomer?.active;
  if (activeRaw === true) return true;
  if (activeRaw === false) return false;

  const inactiveRaw = rawCustomer?.Inactive ?? rawCustomer?.inactive;
  if (inactiveRaw === true) return false;
  if (inactiveRaw === false) return true;

  return true;
}

async function getCostCenterDictionary(token, userId) {
  const dict = new Map();
  let activeToken = token;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.fortnox.se/3/costcenters?limit=500&page=${page}`;
    let result = await fetchJsonWithRetry(url, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }, 4);

    if (!result || !result.data) break;

    if (result.data?.ErrorInformation) {
      const newToken = await refreshToken(userId);
      if (!newToken) break;
      activeToken = newToken;
      result = await fetchJsonWithRetry(url, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 4);
    }

    const rows = result?.data?.CostCenters || [];
    for (const row of rows) {
      const code = normalizeCostCenter(row.CostCenter || row.Code || row.CostCenterCode || row.Number);
      const name = String(row.Description || row.Name || row.CostCenterName || "").trim();
      if (code) dict.set(code, name);
    }

    hasMore = rows.length === 500;
    page++;
    await delay(120);
  }

  return { dict, token: activeToken };
}

async function getCustomerCard(customerNumber, token, userId) {
  const detailUrl = `https://api.fortnox.se/3/customers/${customerNumber}`;
  let activeToken = token;

  let result = await fetchJsonWithRetry(detailUrl, {
    headers: {
      Authorization: `Bearer ${activeToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  }, 5);

  if (result?.data?.ErrorInformation) {
    const newToken = await refreshToken(userId);
    if (newToken) {
      activeToken = newToken;
      result = await fetchJsonWithRetry(detailUrl, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 5);
    }
  }

  return {
    token: activeToken,
    customer: result?.data?.Customer || null,
  };
}

export async function POST(request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";
  let token = getToken();

  if (!token) {
    return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.max(1, Math.min(50, Number(body?.batchSize || 20)));

  const invoices = await getCachedInvoices("2025-01-01");
  const invoiceCustomerNumbers = Array.from(new Set(
    invoices
      .map(inv => normalizeCustomerNumber(inv.customer_number || inv.CustomerNumber || inv.CustomerNo || inv.CustomerId))
      .filter(Boolean)
  ));

  let mappings = await getCustomerCostCenterMappings(invoiceCustomerNumbers);
  const existingMap = new Map(mappings.map(m => [normalizeCustomerNumber(m.customer_number), m]));

  const numbersNeedingSync = invoiceCustomerNumbers.filter(num => {
    const row = existingMap.get(num);
    if (!row) return true;
    const hasCode = !!normalizeCostCenter(row.cost_center);
    const hasName = !!String(row.cost_center_name || "").trim();
    const hasActive = typeof row.active === "boolean";
    return !hasCode || !hasName || !hasActive;
  });

  const toSync = numbersNeedingSync.slice(0, batchSize);
  if (toSync.length === 0) {
    const withNames = mappings.filter(m => String(m.cost_center_name || "").trim() !== "").length;
    return Response.json({ ok: true, message: "All mapping already synced", total: mappings.length, withNames, syncedNow: 0 });
  }

  const dictionaryResult = await getCostCenterDictionary(token, userId);
  const costCenterDictionary = dictionaryResult.dict;
  token = dictionaryResult.token;

  const rowsToSave = [];
  const failed = [];

  for (const customerNumber of toSync) {
    try {
      const detail = await getCustomerCard(customerNumber, token, userId);
      token = detail.token;
      const customer = detail.customer || {};
      const code = normalizeCostCenter(customer.CostCenter || customer.CostCenterCode || customer.CostCenterId);
      rowsToSave.push({
        customer_number: customerNumber,
        customer_name: customer.Name || customer.CustomerName || "",
        cost_center: code,
        cost_center_name: String(costCenterDictionary.get(code) || "").trim(),
        active: normalizeCustomerActive(customer),
        updated_at: new Date().toISOString(),
      });
      await delay(450);
    } catch {
      failed.push(customerNumber);
    }
  }

  if (rowsToSave.length > 0) {
    await saveCustomerCostCenterMappings(rowsToSave);
  }

  mappings = await getCustomerCostCenterMappings(invoiceCustomerNumbers);
  const withNames = mappings.filter(m => String(m.cost_center_name || "").trim() !== "").length;

  return Response.json({
    ok: true,
    syncedNow: rowsToSave.length,
    failed: failed.length,
    failedNumbers: failed.slice(0, 10),
    totalMappings: mappings.length,
    withNames,
    remaining: Math.max(0, numbersNeedingSync.length - rowsToSave.length),
  });
}

import { cookies } from "next/headers";
import { readFileSync } from "fs";
import {
  saveCustomerCostCenterMappings,
  getCustomerCostCenterMappings,
  getTokenFromDb,
  saveToken,
  supabaseServer,
} from "@/lib/supabase";

export const maxDuration = 60;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRefreshTokenValue(cookieStore, userId) {
  const fromCookie = cookieStore.get("fortnox_refresh_token")?.value;
  if (fromCookie) return fromCookie;
  try {
    const { data } = await supabaseServer
      .from("tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .single();
    if (data?.refresh_token) return data.refresh_token;
  } catch {}
  try { return readFileSync(".fortnox_refresh", "utf8").trim(); } catch {}
  return null;
}

async function doRefreshToken(cookieStore, userId) {
  try {
    const refreshVal = await getRefreshTokenValue(cookieStore, userId);
    if (!refreshVal) return null;
    const credentials = Buffer.from(
      `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`
    ).toString("base64");
    const res = await fetch("https://apps.fortnox.se/oauth-v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${credentials}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshVal }),
    });
    const data = await res.json();
    if (data?.access_token) {
      await saveToken(userId, data.access_token, data.refresh_token || refreshVal);
      return data.access_token;
    }
  } catch {}
  return null;
}

async function getToken(cookieStore, userId) {
  const fromCookie = cookieStore.get("fortnox_access_token")?.value;
  if (fromCookie) return fromCookie;
  try {
    const fromDb = await getTokenFromDb(userId);
    if (fromDb) return fromDb;
  } catch {}
  try {
    const fromFile = readFileSync(".fortnox_token", "utf8").trim();
    if (fromFile) return fromFile;
  } catch {}
  return doRefreshToken(cookieStore, userId);
}

async function fetchJson(url, token, cookieStore, userId) {
  let activeToken = token;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${activeToken}`, Accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      await delay(600 * attempt);
      continue;
    }
    if (res.status === 429) {
      await delay((parseInt(res.headers.get("Retry-After") || "2", 10) + 1) * 1000);
      continue;
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (data?.ErrorInformation) {
      const newToken = await doRefreshToken(cookieStore, userId);
      if (newToken) { activeToken = newToken; continue; }
      return { data: null, token: activeToken };
    }
    return { data, token: activeToken };
  }
  return { data: null, token: activeToken };
}

function normalizeCostCenter(raw) {
  if (!raw) return "";
  if (typeof raw === "object") {
    return String(raw.CostCenter || raw.CostCenterCode || raw.CostCenterId || raw.Code || raw.code || "").trim();
  }
  return String(raw).trim();
}

function normalizeCustomerActive(c = {}) {
  const a = c?.Active ?? c?.active;
  if (a === true) return true;
  if (a === false) return false;
  const i = c?.Inactive ?? c?.inactive;
  if (i === true) return false;
  if (i === false) return true;
  return true;
}

function normalizeCustomerNumber(raw) {
  return raw ? String(raw).trim() : "";
}

export async function POST(request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";
  let token = await getToken(cookieStore, userId);

  if (!token) {
    return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.max(1, Math.min(50, Number(body?.batchSize || 20)));

  // Collect all customer numbers from invoices + crm_clients + customers
  const allNumbers = new Set();

  const [{ data: crmRows }, { data: customerRows }] = await Promise.all([
    supabaseServer.from("crm_clients").select("customer_number").not("customer_number", "is", null).limit(10000),
    supabaseServer.from("customers").select("customer_number").not("customer_number", "is", null).limit(10000),
  ]);
  for (const r of crmRows || []) { const n = normalizeCustomerNumber(r.customer_number); if (n) allNumbers.add(n); }
  for (const r of customerRows || []) { const n = normalizeCustomerNumber(r.customer_number); if (n) allNumbers.add(n); }

  const invoiceCustomerNumbers = Array.from(allNumbers);

  // Fetch all existing mappings (no filter, avoids Supabase 1000-row default limit issue)
  const mappings = await getCustomerCostCenterMappings([]);
  const existingMap = new Map(mappings.map(m => [normalizeCustomerNumber(m.customer_number), m]));

  // Only sync customers with no row yet — those already checked won't be re-queued
  const numbersNeedingSync = invoiceCustomerNumbers.filter(num => !existingMap.has(num));

  const toSync = numbersNeedingSync.slice(0, batchSize);
  if (toSync.length === 0) {
    const withCC = mappings.filter(m => normalizeCostCenter(m.cost_center)).length;
    return Response.json({ ok: true, message: "All synced", totalMappings: mappings.length, withCostCenter: withCC, syncedNow: 0, remaining: 0 });
  }

  // Fetch cost center dictionary for name lookup
  const ccDict = new Map();
  {
    const { data } = await fetchJson("https://api.fortnox.se/3/costcenters?limit=500", token, cookieStore, userId);
    token = data === null ? token : token; // token may have been refreshed inside fetchJson
    for (const row of data?.CostCenters || []) {
      const code = normalizeCostCenter(row.CostCenter || row.Code || row.CostCenterCode || row.Number);
      const name = String(row.Description || row.Name || row.CostCenterName || "").trim();
      if (code) ccDict.set(code, name);
    }
  }

  // Fetch individual customer cards — this is the only way to get CostCenter per customer
  const rowsToSave = [];
  const failed = [];

  for (const customerNumber of toSync) {
    try {
      const { data, token: newToken } = await fetchJson(
        `https://api.fortnox.se/3/customers/${customerNumber}`,
        token, cookieStore, userId
      );
      token = newToken;
      const customer = data?.Customer || {};
      const code = normalizeCostCenter(customer.CostCenter || customer.CostCenterCode || customer.CostCenterId);
      rowsToSave.push({
        customer_number: customerNumber,
        customer_name: String(customer.Name || customer.CustomerName || "").trim(),
        cost_center: code,
        cost_center_name: String(ccDict.get(code) || "").trim(),
        active: normalizeCustomerActive(customer),
        updated_at: new Date().toISOString(),
      });
      await delay(400);
    } catch {
      failed.push(customerNumber);
    }
  }

  if (rowsToSave.length > 0) {
    await saveCustomerCostCenterMappings(rowsToSave);
  }

  const withCC = rowsToSave.filter(r => r.cost_center).length;
  const remaining = Math.max(0, numbersNeedingSync.length - rowsToSave.length);

  return Response.json({
    ok: true,
    syncedNow: rowsToSave.length,
    withCostCenter: withCC,
    failed: failed.length,
    remaining,
  });
}

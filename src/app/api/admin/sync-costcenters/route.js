import { cookies } from "next/headers";
import { readFileSync } from "fs";
import {
  saveCustomerCostCenterMappings,
  getTokenFromDb,
  saveToken,
} from "@/lib/supabase";

export const maxDuration = 60;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getToken(cookieStore, userId) {
  const tokenFromCookie = cookieStore.get("fortnox_access_token")?.value;
  if (tokenFromCookie) return tokenFromCookie;
  try {
    const tokenFromDb = await getTokenFromDb(userId);
    if (tokenFromDb) return tokenFromDb;
  } catch {}
  try {
    const t = readFileSync(".fortnox_token", "utf8").trim();
    if (t) return t;
  } catch {}
  // No valid token found — try refreshing
  return refreshToken(cookieStore, userId);
}

async function getRefreshToken(cookieStore, userId) {
  const fromCookie = cookieStore.get("fortnox_refresh_token")?.value;
  if (fromCookie) return fromCookie;
  try {
    const { supabaseServer } = await import("@/lib/supabase");
    const { data } = await supabaseServer
      .from("tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .single();
    if (data?.refresh_token) return data.refresh_token;
  } catch {}
  try {
    return readFileSync(".fortnox_refresh", "utf8").trim();
  } catch {
    return null;
  }
}

async function refreshToken(cookieStore, userId) {
  try {
    const refreshTokenValue = await getRefreshToken(cookieStore, userId);
    if (!refreshTokenValue) return null;
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
        refresh_token: refreshTokenValue,
      }),
    });
    const data = await response.json();
    if (data?.access_token) {
      await saveToken(userId, data.access_token, data.refresh_token || refreshTokenValue);
      return data.access_token;
    }
  } catch {}
  return null;
}

async function fetchJson(url, activeToken, cookieStore, userId) {
  let token = activeToken;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
      await delay(wait + 500);
      continue;
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (data?.ErrorInformation) {
      const newToken = await refreshToken(cookieStore, userId);
      if (newToken) { token = newToken; continue; }
      break;
    }
    return { data, token };
  }
  return { data: null, token };
}

function normalizeCostCenter(raw) {
  if (!raw) return "";
  if (typeof raw === "object") {
    return String(raw.CostCenter || raw.CostCenterCode || raw.CostCenterId || raw.Code || raw.code || "").trim();
  }
  return String(raw).trim();
}

function normalizeCustomerActive(c = {}) {
  const activeRaw = c?.Active ?? c?.active;
  if (activeRaw === true) return true;
  if (activeRaw === false) return false;
  const inactiveRaw = c?.Inactive ?? c?.inactive;
  if (inactiveRaw === true) return false;
  if (inactiveRaw === false) return true;
  return true;
}

export async function POST(request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";

  // Diagnostic: collect token sources
  const hasCookie = !!cookieStore.get("fortnox_access_token")?.value;
  const hasRefreshCookie = !!cookieStore.get("fortnox_refresh_token")?.value;
  let tokenFromDb = null;
  try { tokenFromDb = await getTokenFromDb(userId); } catch (e) { tokenFromDb = `ERROR: ${e?.message}`; }

  let token = await getToken(cookieStore, userId);

  if (!token) {
    return Response.json({
      ok: false,
      error: "Ingen Fortnox-token. Logga in igen.",
      debug: { hasCookie, hasRefreshCookie, tokenFromDb: !!tokenFromDb, tokenFromDbValue: typeof tokenFromDb === "string" && tokenFromDb.startsWith("ERROR") ? tokenFromDb : (tokenFromDb ? "found" : "null") },
    }, { status: 401 });
  }

  // 1. Fetch cost center dictionary (code → name)
  const costCenterDict = new Map();
  {
    let page = 1;
    while (true) {
      const { data, token: t } = await fetchJson(
        `https://api.fortnox.se/3/costcenters?limit=500&page=${page}`,
        token, cookieStore, userId
      );
      token = t;
      const rows = data?.CostCenters || [];
      for (const row of rows) {
        const code = normalizeCostCenter(row.CostCenter || row.Code || row.CostCenterCode || row.Number);
        const name = String(row.Description || row.Name || row.CostCenterName || "").trim();
        if (code) costCenterDict.set(code, name);
      }
      if (rows.length < 500) break;
      page++;
      await delay(120);
    }
  }

  // 2. Fetch ALL customers from Fortnox customer register (paginated)
  const allCustomers = [];
  {
    let page = 1;
    while (true) {
      const { data, token: t } = await fetchJson(
        `https://api.fortnox.se/3/customers?limit=500&page=${page}`,
        token, cookieStore, userId
      );
      token = t;
      const rows = data?.Customers || [];
      allCustomers.push(...rows);
      if (rows.length < 500) break;
      page++;
      await delay(120);
    }
  }

  // 3. Build mappings — only save customers that have a CostCenter assigned
  const mappingsToSave = [];
  for (const customer of allCustomers) {
    const customerNumber = String(customer?.CustomerNumber || customer?.CustomerNo || "").trim();
    const code = normalizeCostCenter(customer?.CostCenter || customer?.CostCenterId);
    if (!customerNumber || !code) continue;
    mappingsToSave.push({
      customer_number: customerNumber,
      customer_name: String(customer?.Name || "").trim(),
      cost_center: code,
      cost_center_name: String(costCenterDict.get(code) || "").trim(),
      active: normalizeCustomerActive(customer),
      updated_at: new Date().toISOString(),
    });
  }

  if (mappingsToSave.length > 0) {
    await saveCustomerCostCenterMappings(mappingsToSave);
  }

  return Response.json({
    ok: true,
    customersScanned: allCustomers.length,
    syncedNow: mappingsToSave.length,
    remaining: 0,
    sampleCustomer: allCustomers[0] || null,
  });
}

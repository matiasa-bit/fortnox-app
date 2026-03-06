import { cookies } from "next/headers";
import { readFileSync } from "fs";
import {
  saveCustomerCostCenterMappings,
  getTokenFromDb,
  saveToken,
  supabaseServer,
} from "@/lib/supabase";

export const maxDuration = 60;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveToken(cookieStore, userId) {
  // 1. Cookie
  const fromCookie = cookieStore.get("fortnox_access_token")?.value;
  if (fromCookie) return fromCookie;
  // 2. Database
  try {
    const fromDb = await getTokenFromDb(userId);
    if (fromDb) return fromDb;
  } catch {}
  // 3. File (local dev)
  try {
    const fromFile = readFileSync(".fortnox_token", "utf8").trim();
    if (fromFile) return fromFile;
  } catch {}
  // 4. Refresh
  try {
    const refreshVal =
      cookieStore.get("fortnox_refresh_token")?.value ||
      readFileSync(".fortnox_refresh", "utf8").trim();
    if (!refreshVal) return null;
    const creds = Buffer.from(
      `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`
    ).toString("base64");
    const res = await fetch("https://apps.fortnox.se/oauth-v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${creds}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshVal }),
    });
    const d = await res.json();
    if (d?.access_token) {
      await saveToken(userId, d.access_token, d.refresh_token || refreshVal);
      return d.access_token;
    }
  } catch {}
  return null;
}

async function fortnoxGet(path, token, cookieStore, userId) {
  let t = token;
  for (let i = 0; i < 3; i++) {
    let res;
    try {
      res = await fetch(`https://api.fortnox.se/3${path}`, {
        headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
        cache: "no-store",
      });
    } catch { await delay(800); continue; }

    if (res.status === 429) { await delay((parseInt(res.headers.get("Retry-After") || "2", 10) + 1) * 1000); continue; }

    let data = null;
    try { data = JSON.parse(await res.text()); } catch {}

    if (data?.ErrorInformation) {
      const newT = await resolveToken(cookieStore, userId);
      if (newT && newT !== t) { t = newT; continue; }
      return { ok: false, data: null, token: t };
    }
    return { ok: res.ok, data, token: t };
  }
  return { ok: false, data: null, token: t };
}

export async function POST(request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";
  let token = await resolveToken(cookieStore, userId);
  if (!token) return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.max(1, Math.min(30, Number(body?.batchSize || 20)));
  const fromIndex = Math.max(0, Number(body?.fromIndex || 0));

  // Load ALL customer numbers (sorted, stable order)
  const [{ data: crmRows }, { data: custRows }] = await Promise.all([
    supabaseServer.from("crm_clients").select("customer_number").not("customer_number", "is", null).order("customer_number").limit(10000),
    supabaseServer.from("customers").select("customer_number").not("customer_number", "is", null).order("customer_number").limit(10000),
  ]);

  const allNumbers = Array.from(new Set([
    ...(crmRows || []).map(r => String(r.customer_number).trim()),
    ...(custRows || []).map(r => String(r.customer_number).trim()),
  ].filter(Boolean))).sort();

  const total = allNumbers.length;
  const batch = allNumbers.slice(fromIndex, fromIndex + batchSize);

  if (batch.length === 0) {
    return Response.json({ ok: true, syncedNow: 0, fromIndex, nextIndex: null, total, remaining: 0 });
  }

  // Fetch cost center catalog once
  const ccDict = new Map();
  {
    const { data } = await fortnoxGet("/costcenters?limit=500", token, cookieStore, userId);
    for (const row of data?.CostCenters || []) {
      const code = String(row.Code || row.CostCenter || "").trim();
      const name = String(row.Description || row.Name || "").trim();
      if (code) ccDict.set(code, name);
    }
  }

  // Fetch each customer card individually — only individual cards expose CostCenter
  const saved = [];
  const failed = [];

  for (const customerNumber of batch) {
    const { ok, data, token: newToken } = await fortnoxGet(`/customers/${customerNumber}`, token, cookieStore, userId);
    token = newToken;

    if (!ok || !data?.Customer) {
      failed.push(customerNumber);
      await delay(200);
      continue;
    }

    const c = data.Customer;
    const code = String(c.CostCenter || c.CostCenterCode || c.CostCenterId || "").trim();
    saved.push({
      customer_number: customerNumber,
      customer_name: String(c.Name || "").trim(),
      cost_center: code,
      cost_center_name: String(ccDict.get(code) || "").trim(),
      active: c.Active !== false && c.Inactive !== true,
      updated_at: new Date().toISOString(),
    });
    await delay(350);
  }

  if (saved.length > 0) {
    await saveCustomerCostCenterMappings(saved);
  }

  const nextIndex = fromIndex + batch.length;
  const remaining = Math.max(0, total - nextIndex);

  return Response.json({
    ok: true,
    syncedNow: saved.length,
    failed: failed.length,
    fromIndex,
    nextIndex: remaining > 0 ? nextIndex : null,
    total,
    remaining,
  });
}

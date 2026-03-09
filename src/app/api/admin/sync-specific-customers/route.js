import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { getTokenFromDb, saveToken, supabaseServer } from "@/lib/supabase";

export const maxDuration = 30;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveToken(cookieStore, userId) {
  const fromCookie = cookieStore.get("fortnox_access_token")?.value;
  if (fromCookie) return fromCookie;
  try { const t = await getTokenFromDb(userId); if (t) return t; } catch {}
  try { const t = readFileSync(".fortnox_token", "utf8").trim(); if (t) return t; } catch {}
  try {
    const refreshVal = cookieStore.get("fortnox_refresh_token")?.value || readFileSync(".fortnox_refresh", "utf8").trim();
    if (!refreshVal) return null;
    const creds = Buffer.from(`${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://apps.fortnox.se/oauth-v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${creds}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshVal }),
    });
    const d = await res.json();
    if (d?.access_token) { await saveToken(userId, d.access_token, d.refresh_token || refreshVal); return d.access_token; }
  } catch {}
  return null;
}

export async function POST(request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";
  let token = await resolveToken(cookieStore, userId);
  if (!token) return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rawNumbers = Array.isArray(body?.customerNumbers) ? body.customerNumbers : [];
  const customerNumbers = rawNumbers.map(n => String(n).trim()).filter(Boolean);

  if (customerNumbers.length === 0) {
    return Response.json({ ok: false, error: "Inga kundnummer angivna." }, { status: 400 });
  }
  if (customerNumbers.length > 50) {
    return Response.json({ ok: false, error: "Max 50 kundnummer per körning." }, { status: 400 });
  }

  // Hämta kostnadsställeskatalogen från Supabase
  const ccDict = new Map();
  const { data: ccRows } = await supabaseServer.from("cost_centers").select("code, name");
  for (const row of ccRows || []) {
    ccDict.set(row.code, row.name || "");
  }

  const saved = [];
  const failed = [];

  for (const customerNumber of customerNumbers) {
    let res;
    try {
      res = await fetch(`https://api.fortnox.se/3/customers/${customerNumber}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      failed.push(customerNumber);
      continue;
    }

    if (res.status === 401) {
      // Försök förnya token
      try {
        const refreshVal = cookieStore.get("fortnox_refresh_token")?.value || readFileSync(".fortnox_refresh", "utf8").trim();
        const creds = Buffer.from(`${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`).toString("base64");
        const rr = await fetch("https://apps.fortnox.se/oauth-v1/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${creds}` },
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshVal }),
        });
        const d = await rr.json();
        if (d?.access_token) {
          token = d.access_token;
          await saveToken(userId, token, d.refresh_token || refreshVal);
          res = await fetch(`https://api.fortnox.se/3/customers/${customerNumber}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store",
          });
        }
      } catch {}
    }

    if (!res.ok) { failed.push(customerNumber); await delay(200); continue; }

    const data = await res.json().catch(() => null);
    const c = data?.Customer;
    if (!c) { failed.push(customerNumber); continue; }

    const code = String(c.CostCenter || c.CostCenterCode || "").trim();
    saved.push({
      customer_number: customerNumber,
      customer_name: String(c.Name || "").trim(),
      cost_center: code,
      cost_center_name: String(ccDict.get(code) || "").trim(),
      active: c.Active !== false && c.Inactive !== true,
      updated_at: new Date().toISOString(),
    });
    await delay(200);
  }

  if (saved.length > 0) {
    const { error } = await supabaseServer
      .from("customer_costcenter_map")
      .upsert(saved, { onConflict: "customer_number", ignoreDuplicates: false });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, synced: saved.length, failed: failed.length, failedNumbers: failed, results: saved });
}

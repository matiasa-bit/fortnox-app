import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { getTokenFromDb, saveToken, supabaseServer } from "@/lib/supabase";

export const maxDuration = 60;

async function refreshToken(cookieStore, userId) {
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

async function resolveToken(cookieStore, userId) {
  const fromCookie = cookieStore.get("fortnox_access_token")?.value;
  if (fromCookie) return fromCookie;
  try { const t = await getTokenFromDb(userId); if (t) return t; } catch {}
  try { const t = readFileSync(".fortnox_token", "utf8").trim(); if (t) return t; } catch {}
  return refreshToken(cookieStore, userId);
}

async function fetchAllCustomers(token, filter) {
  const customers = [];
  let page = 1;
  let lastError = null;
  while (page <= 200) {
    const res = await fetch(`https://api.fortnox.se/3/customers?limit=500&page=${page}&filter=${filter}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      lastError = `HTTP ${res.status} vid filter=${filter} sida ${page}`;
      console.error("[sync-customer-list]", lastError, await res.text().catch(() => ""));
      break;
    }
    const data = await res.json().catch(() => ({}));
    if (data?.ErrorInformation) {
      lastError = `Fortnox fel: ${data.ErrorInformation.message || JSON.stringify(data.ErrorInformation)}`;
      console.error("[sync-customer-list]", lastError);
      break;
    }
    const batch = data?.Customers || [];
    customers.push(...batch);
    if (batch.length === 0) break;
    page++;
  }
  return { customers, lastError };
}

export async function POST() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";
  let token = await resolveToken(cookieStore, userId);
  if (!token) return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });

  // Hämta aktiva och inaktiva separat för att komma runt Fortnox 1000-gräns
  let [{ customers: activeList, lastError: e1 }, { customers: inactiveList, lastError: e2 }] = await Promise.all([
    fetchAllCustomers(token, "active"),
    fetchAllCustomers(token, "inactive"),
  ]);

  // Om 401 — refresha token och försök igen
  if ((e1?.includes("401") || e2?.includes("401")) && activeList.length === 0) {
    token = await refreshToken(cookieStore, userId);
    if (!token) return Response.json({ ok: false, error: "Token utgången och kunde inte refreshas. Logga in i Fortnox igen." }, { status: 401 });
    [{ customers: activeList, lastError: e1 }, { customers: inactiveList, lastError: e2 }] = await Promise.all([
      fetchAllCustomers(token, "active"),
      fetchAllCustomers(token, "inactive"),
    ]);
  }

  const seen = new Set();
  const rows = [];
  for (const [list, isActive] of [[activeList, true], [inactiveList, false]]) {
    for (const c of list) {
      const num = String(c.CustomerNumber || c.CustomerNo || "").trim();
      if (!num || seen.has(num)) continue;
      seen.add(num);
      rows.push({
        customer_number: num,
        customer_name: String(c.Name || "").trim(),
        active: isActive,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length === 0) {
    const errMsg = e1 || e2 || "Inga kunder hittades i Fortnox.";
    return Response.json({ ok: false, error: errMsg, activeCount: activeList.length, inactiveCount: inactiveList.length }, { status: 502 });
  }

  // Spara i omgångar om 500
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseServer
      .from("customer_costcenter_map")
      .upsert(rows.slice(i, i + 500), { onConflict: "customer_number", ignoreDuplicates: false });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Synka kostnadsstälskatalogen (koder + namn) från Fortnox
  let costCentersSaved = 0;
  try {
    const ccRes = await fetch("https://api.fortnox.se/3/costcenters?limit=500", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (ccRes.ok) {
      const ccData = await ccRes.json().catch(() => ({}));
      const ccRows = (ccData?.CostCenters || []).flatMap(row => {
        const code = String(row.Code || row.CostCenter || "").trim();
        const name = String(row.Description || row.Name || "").trim();
        const active = row.Active !== false;
        return code ? [{ code, name, active, updated_at: new Date().toISOString() }] : [];
      });
      if (ccRows.length > 0) {
        await supabaseServer.from("cost_centers").upsert(ccRows, { onConflict: "code" });
        costCentersSaved = ccRows.length;
      }
    }
  } catch {}

  const activeCount = rows.filter(r => r.active).length;
  return Response.json({ ok: true, total: rows.length, active: activeCount, inactive: rows.length - activeCount, costCentersSaved });
}

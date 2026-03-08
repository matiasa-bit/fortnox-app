import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { getTokenFromDb, saveToken, supabaseServer } from "@/lib/supabase";

export const maxDuration = 30;

async function resolveToken(cookieStore, userId) {
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

export async function POST() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value || "default_user";
  const token = await resolveToken(cookieStore, userId);
  if (!token) return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });

  const res = await fetch("https://api.fortnox.se/3/costcenters?limit=500", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    return Response.json({ ok: false, error: `Fortnox svarade ${res.status}` }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  const ccRows = [];

  for (const row of data?.CostCenters || []) {
    const code = String(row.Code || row.CostCenter || "").trim();
    const name = String(row.Description || row.Name || "").trim();
    const active = row.Active !== false;
    if (code) ccRows.push({ code, name, active, updated_at: new Date().toISOString() });
  }

  if (ccRows.length > 0) {
    const { error } = await supabaseServer
      .from("cost_centers")
      .upsert(ccRows, { onConflict: "code" });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, saved: ccRows.length });
}

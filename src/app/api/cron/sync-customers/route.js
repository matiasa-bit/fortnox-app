import { revalidateTag } from "next/cache";

export const maxDuration = 300;

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function syncFilter(filter) {
  let nextPage = 1;
  let fetched = 0;
  let upserted = 0;
  let rounds = 0;

  while (nextPage > 0 && rounds < 30) {
    rounds++;
    const res = await fetch(`${BASE_URL}/api/admin/sync-crm-clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPage: nextPage, maxPages: 1, maxDetailLookups: 0, fortnoxFilter: filter }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
    fetched += Number(data.fetched || 0);
    upserted += Number(data.upserted || 0);
    nextPage = Number(data.nextPage || 0) || 0;
    if (data.warning) break;
  }

  return { fetched, upserted };
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const inactive = await syncFilter("inactive");
    const active = await syncFilter("active");

    // Sync a nightly batch of cost centers (30 per run ≈ all customers every ~40 days)
    let costCenterSynced = 0;
    try {
      const ccRes = await fetch(`${BASE_URL}/api/admin/sync-costcenters`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: request.headers.get("authorization") || "" },
        body: JSON.stringify({ batchSize: 30 }),
      });
      const ccData = await ccRes.json().catch(() => ({}));
      costCenterSynced = Number(ccData.syncedNow || 0);
    } catch {}

    revalidateTag("crm-all-clients");

    return Response.json({
      ok: true,
      fetched: inactive.fetched + active.fetched,
      upserted: inactive.upserted + active.upserted,
      costCenterSynced,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron sync-customers misslyckades:", error);
    return Response.json({ ok: false, error: error?.message || "Okänt fel" }, { status: 500 });
  }
}

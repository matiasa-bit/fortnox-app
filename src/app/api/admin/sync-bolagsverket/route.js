import { supabaseServer } from "@/lib/supabase";
import {
  extractBolagsverketSnapshot,
  fetchBolagsverket,
  isBolagsverketConfigured,
  normalizeBolagsverketOrganizationNumber,
} from "@/lib/bolagsverket";

function parsePositiveInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function toResponseError(message, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

async function runSync(params = {}) {
  if (!isBolagsverketConfigured()) {
    return toResponseError("Bolagsverket är inte konfigurerat. Sätt BOLAGSVERKET_API_BASE_URL (eller BOLAGSVERKET_BASE_URL/BOLAGSVERKET_URL).", 500);
  }

  const clientId = params?.clientId ? Number(params.clientId) : null;
  const orgFromBody = String(params?.organizationNumber || "").trim();
  const limit = parsePositiveInt(params?.limit, 25, 1, 200);
  const offset = parsePositiveInt(params?.offset, 0, 0, 50000);

  let query = supabaseServer
    .from("crm_clients")
    .select("id, company_name, organization_number")
    .order("id", { ascending: true });

  if (Number.isFinite(clientId)) {
    query = query.eq("id", clientId).limit(1);
  } else if (orgFromBody) {
    query = query.eq("organization_number", orgFromBody).limit(1);
  } else {
    query = query.range(offset, offset + limit - 1);
  }

  const { data: clients, error } = await query;

  if (error) {
    return toResponseError(error.message || "Kunde inte läsa CRM-klienter", 500);
  }

  const rows = clients || [];
  if (rows.length === 0) {
    return Response.json({ ok: true, synced: 0, skipped: 0, failed: 0, rows: [] });
  }

  const results = [];
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const orgNumber = normalizeBolagsverketOrganizationNumber(row.organization_number);
    if (!orgNumber || orgNumber.length < 10) {
      skipped += 1;
      results.push({
        id: row.id,
        company_name: row.company_name,
        organization_number: row.organization_number,
        ok: false,
        skipped: true,
        reason: "Ogiltigt organisationsnummer",
      });
      continue;
    }

    const [companyRes, boardRes] = await Promise.all([
      fetchBolagsverket("company", orgNumber),
      fetchBolagsverket("board", orgNumber),
    ]);

    if (!companyRes.ok && !boardRes.ok) {
      failed += 1;
      results.push({
        id: row.id,
        company_name: row.company_name,
        organization_number: row.organization_number,
        ok: false,
        error: `Bolagsverket-fel (company: ${companyRes.status}, board: ${boardRes.status})`,
        details: {
          company: companyRes.error || null,
          board: boardRes.error || null,
        },
      });
      continue;
    }

    const snapshot = extractBolagsverketSnapshot(companyRes.data, boardRes.data);

    const { error: updateError } = await supabaseServer
      .from("crm_clients")
      .update(snapshot)
      .eq("id", row.id);

    if (updateError) {
      failed += 1;
      results.push({
        id: row.id,
        company_name: row.company_name,
        organization_number: row.organization_number,
        ok: false,
        error: updateError.message || "Kunde inte spara Bolagsverket-data",
      });
      continue;
    }

    synced += 1;
    results.push({
      id: row.id,
      company_name: row.company_name,
      organization_number: row.organization_number,
      ok: true,
      bolagsverket_status: snapshot.bolagsverket_status,
      bolagsverket_board_count: snapshot.bolagsverket_board_count,
      company_http_status: companyRes.status,
      board_http_status: boardRes.status,
    });
  }

  return Response.json({
    ok: true,
    synced,
    skipped,
    failed,
    limit,
    offset,
    totalProcessed: rows.length,
    rows: results,
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return runSync(body || {});
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  return runSync({
    clientId: searchParams.get("clientId"),
    organizationNumber: searchParams.get("organizationNumber"),
    limit: searchParams.get("limit"),
    offset: searchParams.get("offset"),
  });
}

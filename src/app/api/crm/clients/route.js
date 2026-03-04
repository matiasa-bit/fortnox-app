import { supabaseServer } from "@/lib/supabase";

function parseNullableString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseNullableInteger(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function normalizeClientPayload(input = {}) {
  return {
    company_name: String(input.company_name || "").trim(),
    organization_number: String(input.organization_number || "").trim(),
    industry: parseNullableString(input.industry),
    revenue: parseNullableNumber(input.revenue),
    employees: parseNullableInteger(input.employees),
    client_status: ["active", "paused", "former"].includes(String(input.client_status || ""))
      ? String(input.client_status)
      : "active",
    start_date: parseNullableString(input.start_date),
    responsible_consultant: parseNullableString(input.responsible_consultant),
    office: parseNullableString(input.office),
    notes: parseNullableString(input.notes),
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const payload = normalizeClientPayload(body);

  if (!payload.company_name || !payload.organization_number) {
    return Response.json(
      { ok: false, error: "company_name och organization_number är obligatoriska." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("crm_clients")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte skapa klient." }, { status: 500 });
  }

  try {
    await supabaseServer
      .from("customers")
      .upsert([
        {
          customer_number: payload.organization_number,
          name: payload.company_name,
        },
      ], { onConflict: "customer_number" });
  } catch {
  }

  return Response.json({ ok: true, client: data });
}

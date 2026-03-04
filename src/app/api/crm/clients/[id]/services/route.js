import { supabaseServer } from "@/lib/supabase";

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function POST(request, { params }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!Number.isFinite(clientId)) {
    return Response.json({ ok: false, error: "Ogiltigt klient-id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const serviceType = String(body?.service_type || "").trim();

  if (!serviceType) {
    return Response.json({ ok: false, error: "Tjänstetyp är obligatoriskt." }, { status: 400 });
  }

  const payload = {
    client_id: clientId,
    service_type: serviceType,
    price: nullableNumber(body?.price),
    billing_model: text(body?.billing_model),
    start_date: text(body?.start_date),
    responsible_consultant: text(body?.responsible_consultant),
    notes: text(body?.notes),
  };

  const { data, error } = await supabaseServer
    .from("crm_services")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte skapa tjänst." }, { status: 500 });
  }

  return Response.json({ ok: true, service: data });
}

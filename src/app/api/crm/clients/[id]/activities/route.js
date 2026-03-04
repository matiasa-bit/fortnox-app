import { supabaseServer } from "@/lib/supabase";

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request, { params }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!Number.isFinite(clientId)) {
    return Response.json({ ok: false, error: "Ogiltigt klient-id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const description = String(body?.description || body?.note || "").trim();

  if (!description) {
    return Response.json({ ok: false, error: "Anteckning är obligatorisk." }, { status: 400 });
  }

  const payload = {
    client_id: clientId,
    date: String(body?.date || "").trim() || today(),
    activity_type: "note",
    description,
    created_by: text(body?.created_by),
  };

  const { data, error } = await supabaseServer
    .from("crm_activities")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte skapa anteckning." }, { status: 500 });
  }

  return Response.json({ ok: true, activity: data });
}

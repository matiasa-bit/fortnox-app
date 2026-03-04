import { supabaseServer } from "@/lib/supabase";

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export async function POST(request, { params }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!Number.isFinite(clientId)) {
    return Response.json({ ok: false, error: "Ogiltigt klient-id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name || "").trim();

  if (!name) {
    return Response.json({ ok: false, error: "Namn är obligatoriskt." }, { status: 400 });
  }

  const payload = {
    client_id: clientId,
    name,
    role: text(body?.role),
    email: text(body?.email),
    phone: text(body?.phone),
    linkedin: text(body?.linkedin),
    notes: text(body?.notes),
  };

  const { data, error } = await supabaseServer
    .from("crm_contacts")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte skapa kontakt." }, { status: 500 });
  }

  return Response.json({ ok: true, contact: data });
}

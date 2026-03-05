import { supabaseServer } from "@/lib/supabase";

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const contactId = Number(id);

  if (!Number.isFinite(contactId)) {
    return Response.json({ ok: false, error: "Ogiltigt kontakt-id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name || "").trim();

  if (!name) {
    return Response.json({ ok: false, error: "Namn ar obligatoriskt." }, { status: 400 });
  }

  const payload = {
    name,
    role: text(body?.role),
    email: text(body?.email),
    phone: text(body?.phone),
    linkedin: text(body?.linkedin),
    notes: text(body?.notes),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseServer
    .from("crm_contact_directory")
    .update(payload)
    .eq("id", contactId)
    .select("id, name, role, email, phone, linkedin, notes")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte uppdatera kontakt." }, { status: 500 });
  }

  return Response.json({ ok: true, contact: data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const contactId = Number(id);

  if (!Number.isFinite(contactId)) {
    return Response.json({ ok: false, error: "Ogiltigt kontakt-id." }, { status: 400 });
  }

  // Ta bort länkarna först, sedan kontakten
  await supabaseServer.from("crm_client_contacts").delete().eq("contact_id", contactId);

  const { error } = await supabaseServer
    .from("crm_contact_directory")
    .delete()
    .eq("id", contactId);

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte ta bort kontakt." }, { status: 500 });
  }

  return Response.json({ ok: true });
}

import { supabaseServer } from "@/lib/supabase";

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function isMissingTable(error) {
  return error?.code === "PGRST205";
}

export async function POST(request, { params }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!Number.isFinite(clientId)) {
    return Response.json({ ok: false, error: "Ogiltigt klient-id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const contactId = Number(body?.contact_id);
  const name = String(body?.name || "").trim();

  if (!Number.isFinite(contactId) && !name) {
    return Response.json({ ok: false, error: "Namn eller contact_id ar obligatoriskt." }, { status: 400 });
  }

  // New model: shared contact directory + many-to-many links.
  let resolvedContactId = Number.isFinite(contactId) ? contactId : null;

  if (!Number.isFinite(resolvedContactId)) {
    const createPayload = {
      name,
      role: text(body?.role),
      email: text(body?.email),
      phone: text(body?.phone),
      linkedin: text(body?.linkedin),
      notes: text(body?.notes),
      updated_at: new Date().toISOString(),
    };

    const createRes = await supabaseServer
      .from("crm_contact_directory")
      .insert(createPayload)
      .select("id")
      .single();

    if (createRes.error) {
      if (isMissingTable(createRes.error)) {
        // Legacy fallback.
        const legacyPayload = {
          client_id: clientId,
          name,
          role: text(body?.role),
          email: text(body?.email),
          phone: text(body?.phone),
          linkedin: text(body?.linkedin),
          notes: text(body?.notes),
        };

        const legacyCreate = await supabaseServer
          .from("crm_contacts")
          .insert(legacyPayload)
          .select("*")
          .single();

        if (legacyCreate.error) {
          return Response.json({ ok: false, error: legacyCreate.error.message || "Kunde inte skapa kontakt." }, { status: 500 });
        }

        return Response.json({ ok: true, contact: legacyCreate.data, legacy: true });
      }

      return Response.json({ ok: false, error: createRes.error.message || "Kunde inte skapa kontakt i kontaktlistan." }, { status: 500 });
    }

    resolvedContactId = Number(createRes.data?.id);
  }

  const linkRes = await supabaseServer
    .from("crm_client_contacts")
    .upsert([{ client_id: clientId, contact_id: resolvedContactId }], { onConflict: "client_id,contact_id", ignoreDuplicates: true });

  if (linkRes.error) {
    return Response.json({ ok: false, error: linkRes.error.message || "Kunde inte koppla kontakt till kund." }, { status: 500 });
  }

  const contactRes = await supabaseServer
    .from("crm_contact_directory")
    .select("id, name, role, email, phone, linkedin, notes")
    .eq("id", resolvedContactId)
    .single();

  if (contactRes.error) {
    return Response.json({ ok: true, contact: { id: resolvedContactId }, linked: true });
  }

  return Response.json({ ok: true, contact: contactRes.data, linked: true });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!Number.isFinite(clientId)) {
    return Response.json({ ok: false, error: "Ogiltigt klient-id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const contactId = Number(body?.contact_id);

  if (!Number.isFinite(contactId)) {
    return Response.json({ ok: false, error: "contact_id saknas." }, { status: 400 });
  }

  const updatePayload = {
    name: text(body?.name),
    role: text(body?.role),
    email: text(body?.email),
    phone: text(body?.phone),
    updated_at: new Date().toISOString(),
  };

  if (!updatePayload.name) {
    return Response.json({ ok: false, error: "Namn är obligatoriskt." }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("crm_contact_directory")
    .update(updatePayload)
    .eq("id", contactId);

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte uppdatera kontakt." }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!Number.isFinite(clientId)) {
    return Response.json({ ok: false, error: "Ogiltigt klient-id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const contactId = Number(body?.contact_id);

  if (!Number.isFinite(contactId)) {
    return Response.json({ ok: false, error: "contact_id saknas." }, { status: 400 });
  }

  // Clear all primary flags for this client, then set the chosen one
  await supabaseServer
    .from("crm_client_contacts")
    .update({ is_primary: false })
    .eq("client_id", clientId);

  const { error } = await supabaseServer
    .from("crm_client_contacts")
    .update({ is_primary: true })
    .eq("client_id", clientId)
    .eq("contact_id", contactId);

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte sätta primärkontakt." }, { status: 500 });
  }

  return Response.json({ ok: true });
}

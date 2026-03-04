import { supabaseServer } from "@/lib/supabase";

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from("crm_contact_directory")
    .select("id, name, role, email, phone, linkedin, notes")
    .order("name", { ascending: true })
    .limit(5000);

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte hamta kontakter." }, { status: 500 });
  }

  return Response.json({ ok: true, contacts: data || [] });
}

export async function POST(request) {
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
    .insert(payload)
    .select("id, name, role, email, phone, linkedin, notes")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message || "Kunde inte skapa kontakt." }, { status: 500 });
  }

  return Response.json({ ok: true, contact: data });
}

import { supabaseServer } from "@/lib/supabase";

export async function PATCH(request, { params }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) {
    return Response.json({ ok: false, error: "Ogiltigt id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const update = {};
  if (body?.name !== undefined) update.name = String(body.name).trim();
  if (body?.color !== undefined) update.color = String(body.color).trim();

  if (Object.keys(update).length === 0) {
    return Response.json({ ok: false, error: "Ingenting att uppdatera" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("crm_tags")
    .update(update)
    .eq("id", id)
    .select("id, name, color")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, tag: data });
}

export async function DELETE(request, { params }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) {
    return Response.json({ ok: false, error: "Ogiltigt id" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("crm_tags")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

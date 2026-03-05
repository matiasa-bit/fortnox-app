import { supabaseServer } from "@/lib/supabase";

export async function GET(request, { params }) {
  const clientId = Number((await params).id);
  if (!Number.isFinite(clientId)) {
    return Response.json({ tags: [] }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("crm_client_tags")
    .select("tag_id, crm_tags(id, name, color)")
    .eq("client_id", clientId);

  if (error) {
    return Response.json({ tags: [], error: error.message }, { status: 500 });
  }

  const tags = (data || [])
    .map(row => row.crm_tags)
    .filter(Boolean);

  return Response.json({ tags });
}

export async function POST(request, { params }) {
  const clientId = Number((await params).id);
  if (!Number.isFinite(clientId)) {
    return Response.json({ ok: false, error: "Ogiltigt id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const tagId = Number(body?.tagId);
  if (!Number.isFinite(tagId)) {
    return Response.json({ ok: false, error: "Ogiltigt tagId" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("crm_client_tags")
    .upsert({ client_id: clientId, tag_id: tagId }, { onConflict: "client_id,tag_id", ignoreDuplicates: true });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const clientId = Number((await params).id);
  if (!Number.isFinite(clientId)) {
    return Response.json({ ok: false, error: "Ogiltigt id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const tagId = Number(body?.tagId);
  if (!Number.isFinite(tagId)) {
    return Response.json({ ok: false, error: "Ogiltigt tagId" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("crm_client_tags")
    .delete()
    .eq("client_id", clientId)
    .eq("tag_id", tagId);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

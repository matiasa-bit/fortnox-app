import { supabaseServer } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("crm_tags")
    .select("id, name, color")
    .order("name");

  if (error) {
    return Response.json({ tags: [], error: error.message }, { status: 500 });
  }

  return Response.json({ tags: data || [] });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  const color = String(body?.color || "#3b9eff").trim();

  if (!name) {
    return Response.json({ ok: false, error: "Namn krävs" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("crm_tags")
    .insert({ name, color })
    .select("id, name, color")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, tag: data });
}

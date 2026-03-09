import { supabaseServer } from "@/lib/supabase";

async function fetchAllRows() {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabaseServer
      .from("customer_costcenter_map")
      .select("customer_number, customer_name, cost_center, cost_center_name, active, updated_at")
      .order("customer_number")
      .range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { data: all, error: null };
}

export async function GET() {
  const [{ data: customers, error: e1 }, { data: costCenters }] = await Promise.all([
    fetchAllRows(),
    supabaseServer.from("cost_centers").select("code, name, active").order("code"),
  ]);

  if (e1) return Response.json({ ok: false, error: e1.message }, { status: 500 });

  return Response.json({ ok: true, rows: customers || [], costCenters: costCenters || [] });
}

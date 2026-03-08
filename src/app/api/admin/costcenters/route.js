import { supabaseServer } from "@/lib/supabase";

export async function GET() {
  const [{ data: customers, error: e1 }, { data: costCenters, error: e2 }] = await Promise.all([
    supabaseServer
      .from("customer_costcenter_map")
      .select("customer_number, customer_name, cost_center, cost_center_name, active, updated_at")
      .order("customer_number")
      .limit(10000),
    supabaseServer
      .from("cost_centers")
      .select("code, name, active")
      .order("code"),
  ]);

  if (e1) return Response.json({ ok: false, error: e1.message }, { status: 500 });

  return Response.json({ ok: true, rows: customers || [], costCenters: costCenters || [] });
}

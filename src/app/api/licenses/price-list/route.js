import { getLicensePriceList, saveLicensePriceList } from "@/lib/supabase";

export async function GET() {
  const rows = await getLicensePriceList();
  return Response.json({ ok: true, rows });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) {
    return Response.json({ ok: false, error: "Inga rader att spara" }, { status: 400 });
  }
  await saveLicensePriceList(rows);
  return Response.json({ ok: true, saved: rows.length });
}

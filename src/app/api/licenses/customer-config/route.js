import { getLicenseCustomerConfigs, saveLicenseCustomerConfigs } from "@/lib/supabase";

export async function GET() {
  const configs = await getLicenseCustomerConfigs();
  return Response.json({ ok: true, configs });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body?.configs) ? body.configs : [];
  if (rows.length === 0) {
    return Response.json({ ok: false, error: "Inga konfigurationer att spara" }, { status: 400 });
  }
  await saveLicenseCustomerConfigs(rows);
  return Response.json({ ok: true, saved: rows.length });
}

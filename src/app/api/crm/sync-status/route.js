import { getAppSetting } from "@/lib/supabase";

export async function GET() {
  const [crm, contacts, bolagsverket] = await Promise.all([
    getAppSetting("last_crm_sync"),
    getAppSetting("last_contact_sync"),
    getAppSetting("last_bolagsverket_sync"),
  ]);

  return Response.json({
    ok: true,
    last_crm_sync: crm?.value || null,
    last_contact_sync: contacts?.value || null,
    last_bolagsverket_sync: bolagsverket?.value || null,
  });
}

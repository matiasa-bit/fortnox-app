import { getAppSetting, saveAppSetting } from "@/lib/supabase";

const DEFAULTS = {
  reda_price_per_invoice: "2.5",
  reda_article_number: "",
};

export async function GET() {
  const settings = {};
  for (const key of Object.keys(DEFAULTS)) {
    const val = await getAppSetting(key);
    settings[key] = val ?? DEFAULTS[key];
  }
  return Response.json({ ok: true, settings });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const updates = body?.settings || {};
  for (const [key, value] of Object.entries(updates)) {
    if (key in DEFAULTS) {
      await saveAppSetting(key, String(value ?? ""));
    }
  }
  return Response.json({ ok: true });
}

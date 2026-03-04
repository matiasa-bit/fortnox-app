import {
  getCachedArticleRegistry,
  getArticleGroupMappings,
  saveArticleGroupMappings,
} from "@/lib/supabase";

function normalizeText(value) {
  return String(value || "").trim();
}

export async function GET() {
  const [mappings, articles] = await Promise.all([
    getArticleGroupMappings(),
    getCachedArticleRegistry(),
  ]);

  const mapByNumber = new Map();

  for (const row of mappings || []) {
    const articleNumber = normalizeText(row.article_number);
    if (!articleNumber) continue;

    mapByNumber.set(articleNumber, {
      article_number: articleNumber,
      article_name: normalizeText(row.article_name),
      group_name: normalizeText(row.group_name),
      active: row.active === false ? false : true,
      updated_at: row.updated_at || null,
    });
  }

  const rows = [];
  for (const article of articles || []) {
    const articleNumber = normalizeText(article.article_number);
    if (!articleNumber) continue;

    const mapped = mapByNumber.get(articleNumber);
    rows.push({
      article_number: articleNumber,
      article_name: normalizeText(article.article_name || article.description),
      group_name: mapped?.group_name || "",
      active: mapped?.active === false ? false : true,
      updated_at: mapped?.updated_at || article.updated_at || null,
    });

    mapByNumber.delete(articleNumber);
  }

  // Behåll mappings som saknas i article_registry (manuellt tillagda)
  for (const mapped of mapByNumber.values()) {
    rows.push(mapped);
  }

  rows.sort((a, b) => {
    const byName = normalizeText(a.article_name).localeCompare(normalizeText(b.article_name), "sv-SE", { numeric: true });
    if (byName !== 0) return byName;
    return normalizeText(a.article_number).localeCompare(normalizeText(b.article_number), "sv-SE", { numeric: true });
  });

  return Response.json({
    ok: true,
    rows,
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  if (rows.length === 0) {
    return Response.json({ ok: false, error: "Inga rader att spara." }, { status: 400 });
  }

  const normalized = rows
    .map(row => ({
      article_number: normalizeText(row.article_number),
      article_name: normalizeText(row.article_name),
      group_name: normalizeText(row.group_name),
      active: row.active === false ? false : true,
    }))
    .filter(row => row.article_number && row.group_name);

  if (normalized.length === 0) {
    return Response.json({ ok: false, error: "article_number och group_name krävs." }, { status: 400 });
  }

  const saved = await saveArticleGroupMappings(normalized);
  if (saved === null) {
    return Response.json({ ok: false, error: "Kunde inte spara artikelmappning." }, { status: 500 });
  }

  return Response.json({ ok: true, saved: normalized.length });
}

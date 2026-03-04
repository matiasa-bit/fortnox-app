import { supabaseServer } from "@/lib/supabase";

export async function POST(request) {
  try {
    if (!supabaseServer) {
      return new Response(JSON.stringify({ error: "Server-side supabase not configured" }), { status: 500 });
    }

    // Radera rader utan article_number eller med total <= 0
    const { data: deletedNull, error: errNull } = await supabaseServer
      .from('invoice_rows')
      .delete()
      .is('article_number', null);
    if (errNull) {
      const msg = String(errNull?.message || "");
      const missingArticleNumber =
        errNull?.code === "PGRST204" &&
        msg.includes("article_number") &&
        msg.includes("invoice_rows");

      if (missingArticleNumber) {
        return new Response(JSON.stringify({
          error: "Databasschema saknar kolumnen invoice_rows.article_number. Kör setup.sql (eller en ALTER TABLE-migrering) i Supabase och prova igen.",
          code: errNull.code,
        }), { status: 500 });
      }

      console.error('Error deleting null article_number:', errNull);
    }

    const { data: deletedZero, error: errZero } = await supabaseServer
      .from('invoice_rows')
      .delete()
      .lte('total', 0);
    if (errZero) console.error('Error deleting total<=0:', errZero);

    const removed = (deletedNull?.length || 0) + (deletedZero?.length || 0);

    return new Response(JSON.stringify({ removed }), { status: 200 });
  } catch (err) {
    console.error('Cleanup failed:', err);
    return new Response(JSON.stringify({ error: 'Cleanup failed' }), { status: 500 });
  }
}

import { getCachedTimeReports } from "@/lib/supabase";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate = String(searchParams.get("fromDate") || "2025-01-01").slice(0, 10);

    const rows = await getCachedTimeReports(fromDate);

    return Response.json(
      {
        rows,
        count: Array.isArray(rows) ? rows.length : 0,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("Fel vid hämtning av cachad tidsredovisning:", err);
    return Response.json({ error: "Fel vid hämtning av tidsredovisning" }, { status: 500 });
  }
}

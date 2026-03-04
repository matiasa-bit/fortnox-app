import { getCachedContractAccruals } from "@/lib/supabase";

export async function GET() {
  try {
    const rows = await getCachedContractAccruals();

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
    console.error("Fel vid hämtning av cachade kundavtal:", err);
    return Response.json({ error: "Fel vid hämtning av kundavtal" }, { status: 500 });
  }
}

import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase";

// Anpassa denna funktion om du har token-hantering på annat ställe
async function fetchFortnoxContacts(token) {
  // OBS! Byt ut URL och fält enligt din Fortnox-kontaktstruktur
  const url = "https://api.fortnox.se/3/contacts";
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error("Kunde inte hämta kontakter från Fortnox");
  const data = await res.json();
  return data?.Contacts || [];
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    // Hämta token på samma sätt som i kundsyncen
    const token = cookieStore.get("fortnox_access_token")?.value;
    if (!token) return Response.json({ ok: false, error: "Ingen Fortnox-token" }, { status: 401 });

    const contacts = await fetchFortnoxContacts(token);

    // Mappa och upserta kontakter i crm_contact_directory
    const toUpsert = contacts.map(c => ({
      name: c.Name || "okänd",
      role: c.Role || null,
      email: c.Email || null,
      phone: c.Phone || null,
      linkedin: c.Linkedin || null,
      notes: c.Notes || null,
    }));

    if (toUpsert.length > 0) {
      await supabaseServer
        .from("crm_contact_directory")
        .upsert(toUpsert, { onConflict: "email" });
    }

    return Response.json({ ok: true, synced: toUpsert.length });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Okänt fel vid kontakt-sync" }, { status: 500 });
  }
}

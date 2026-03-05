import { supabaseServer } from "@/lib/supabase";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "active";
  const consultant = searchParams.get("consultant") || "";

  try {
    // Get all client IDs matching status filter
    let clientQuery = supabaseServer
      .from("crm_clients")
      .select("id, company_name, customer_number, fortnox_active, client_status, responsible_consultant")
      .limit(10000);

    if (status === "active") {
      clientQuery = clientQuery.eq("fortnox_active", true);
    } else if (status === "inactive") {
      clientQuery = clientQuery.eq("fortnox_active", false);
    }

    const { data: clients, error: clientError } = await clientQuery;
    if (clientError) {
      return Response.json({ ok: false, error: clientError.message }, { status: 500 });
    }

    let filteredClients = clients || [];

    // Filter by consultant/cost center if provided
    if (consultant) {
      const { data: costCenterRows } = await supabaseServer
        .from("customer_costcenter_map")
        .select("customer_number, cost_center, cost_center_name")
        .limit(10000);

      const consultantNumbers = new Set(
        (costCenterRows || [])
          .filter(row => {
            const label = row.cost_center && row.cost_center_name
              ? `${row.cost_center} - ${row.cost_center_name}`
              : row.cost_center || row.cost_center_name || "";
            return label === consultant;
          })
          .map(row => String(row.customer_number || "").trim())
      );

      filteredClients = filteredClients.filter(c =>
        consultantNumbers.has(String(c.customer_number || "").trim())
      );
    }

    const clientIds = filteredClients.map(c => Number(c.id)).filter(Boolean);
    if (clientIds.length === 0) {
      return Response.json({ ok: true, recipients: [] });
    }

    // Get primary contacts with email for these clients
    const { data: linkRows, error: linkError } = await supabaseServer
      .from("crm_client_contacts")
      .select("client_id, is_primary, crm_contact_directory(id, name, email, phone)")
      .in("client_id", clientIds)
      .limit(10000);

    if (linkError) {
      return Response.json({ ok: false, error: linkError.message }, { status: 500 });
    }

    // Pick primary contact per client, fallback to first
    const primaryByClient = new Map();
    const fallbackByClient = new Map();
    for (const row of linkRows || []) {
      const id = Number(row.client_id);
      const c = row.crm_contact_directory;
      if (!c?.email) continue;
      if (row.is_primary) {
        primaryByClient.set(id, c);
      } else if (!fallbackByClient.has(id)) {
        fallbackByClient.set(id, c);
      }
    }

    const clientById = new Map(filteredClients.map(c => [Number(c.id), c]));
    const recipients = [];

    for (const [clientId, client] of clientById) {
      const contact = primaryByClient.get(clientId) || fallbackByClient.get(clientId);
      if (!contact?.email) continue;
      recipients.push({
        contact_id: contact.id,
        name: contact.name || "",
        email: contact.email,
        company_name: client.company_name || "",
        client_id: clientId,
      });
    }

    recipients.sort((a, b) => a.company_name.localeCompare(b.company_name, "sv-SE"));

    return Response.json({ ok: true, recipients });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Okänt fel" }, { status: 500 });
  }
}

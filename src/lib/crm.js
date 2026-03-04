import { supabaseServer } from "@/lib/supabase";

function isMissingCrmTable(error) {
  return error?.code === "PGRST205";
}

export async function getCrmClients(search = "") {
  const term = typeof search === "string" ? String(search || "").trim() : String(search?.search || "").trim();
  const consultant = typeof search === "object" ? String(search?.consultant || "").trim() : "";
  const status = typeof search === "object" ? String(search?.status || "").trim() : "";

  let query = supabaseServer
    .from("crm_clients")
    .select("id, company_name, organization_number, client_status, responsible_consultant")
    .order("company_name", { ascending: true })
    .limit(500);

  if (consultant) {
    query = query.eq("responsible_consultant", consultant);
  }

  if (["active", "paused", "former"].includes(status)) {
    query = query.eq("client_status", status);
  }

  if (term) {
    const escaped = term.replace(/,/g, "\\,");
    query = query.or(`company_name.ilike.%${escaped}%,organization_number.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    if (!isMissingCrmTable(error)) {
      console.error("Fel vid hämtning av crm_clients:", error);
    }
    return [];
  }

  const clients = data || [];
  const clientIds = clients.map(row => row.id).filter(id => Number.isFinite(Number(id)));

  if (clientIds.length === 0) {
    return clients.map(row => ({ ...row, last_activity_date: null }));
  }

  const { data: activityRows, error: activityError } = await supabaseServer
    .from("crm_activities")
    .select("client_id, date")
    .in("client_id", clientIds)
    .order("date", { ascending: false })
    .limit(5000);

  if (activityError && !isMissingCrmTable(activityError)) {
    console.error("Fel vid hämtning av senaste crm_activities:", activityError);
  }

  const latestByClientId = new Map();
  for (const row of activityRows || []) {
    const id = Number(row?.client_id);
    if (!Number.isFinite(id) || latestByClientId.has(id)) continue;
    latestByClientId.set(id, row?.date || null);
  }

  return clients.map(row => ({
    ...row,
    last_activity_date: latestByClientId.get(Number(row.id)) || null,
  }));
}

export async function getCrmConsultants() {
  const { data, error } = await supabaseServer
    .from("crm_clients")
    .select("responsible_consultant")
    .limit(1000);

  if (error) {
    if (!isMissingCrmTable(error)) {
      console.error("Fel vid hämtning av crm-konsulter:", error);
    }
    return [];
  }

  return Array.from(new Set(
    (data || [])
      .map(row => String(row?.responsible_consultant || "").trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, "sv-SE"));
}

export async function getCrmClientById(clientId) {
  const id = Number(clientId);
  if (!Number.isFinite(id)) return null;

  const { data, error } = await supabaseServer
    .from("crm_clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (!isMissingCrmTable(error)) {
      console.error("Fel vid hämtning av crm_client:", error);
    }
    return null;
  }

  return data || null;
}

export async function getCrmClientDetails(clientId) {
  const id = Number(clientId);
  if (!Number.isFinite(id)) return null;

  const [clientRes, contactsRes, servicesRes, activitiesRes, docsRes] = await Promise.all([
    supabaseServer.from("crm_clients").select("*").eq("id", id).single(),
    supabaseServer.from("crm_contacts").select("*").eq("client_id", id).order("name", { ascending: true }),
    supabaseServer.from("crm_services").select("*").eq("client_id", id).order("start_date", { ascending: false }),
    supabaseServer.from("crm_activities").select("*").eq("client_id", id).order("date", { ascending: false }).limit(100),
    supabaseServer.from("crm_document_links").select("*").eq("client_id", id).order("created_at", { ascending: false }),
  ]);

  if (clientRes.error) {
    if (!isMissingCrmTable(clientRes.error)) {
      console.error("Fel vid hämtning av crm_client detaljer:", clientRes.error);
    }
    return null;
  }

  return {
    client: clientRes.data || null,
    contacts: contactsRes.data || [],
    services: servicesRes.data || [],
    activities: activitiesRes.data || [],
    documents: docsRes.data || [],
  };
}

export async function getRecentCrmActivities(limit = 100) {
  const size = Math.max(1, Math.min(500, Number(limit || 100)));

  const { data, error } = await supabaseServer
    .from("crm_activities")
    .select("id, client_id, date, activity_type, description, created_by, created_at, crm_clients(company_name, organization_number)")
    .order("date", { ascending: false })
    .limit(size);

  if (error) {
    if (!isMissingCrmTable(error)) {
      console.error("Fel vid hämtning av crm_activities:", error);
    }
    return [];
  }

  return data || [];
}

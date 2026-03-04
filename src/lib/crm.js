import { supabaseServer } from "@/lib/supabase";

function isMissingCrmTable(error) {
  return error?.code === "PGRST205";
}

export async function getCrmClients(search = "") {
  const term = typeof search === "string" ? String(search || "").trim() : String(search?.search || "").trim();
  const consultant = typeof search === "object" ? String(search?.consultant || "").trim() : "";
  const status = typeof search === "object" ? String(search?.status || "").trim() : "";

  const [{ data: crmRows, error }, { data: customerRows, error: customerError }] = await Promise.all([
    supabaseServer
      .from("crm_clients")
      .select("id, company_name, organization_number, customer_number, fortnox_active, client_status, responsible_consultant")
      .order("company_name", { ascending: true })
      .limit(2000),
    supabaseServer
      .from("customers")
      .select("customer_number, name")
      .order("name", { ascending: true })
      .limit(5000),
  ]);

  if (error) {
    if (!isMissingCrmTable(error)) {
      console.error("Fel vid hämtning av crm_clients:", error);
    }
    return [];
  }

  if (customerError) {
    console.error("Fel vid hämtning av customers:", customerError);
  }

  const crmClients = crmRows || [];
  const customersRaw = customerRows || [];

  // customers table can contain duplicate customer_number rows; keep one row per number.
  const customerByNumber = new Map();
  customersRaw.forEach(row => {
    const customerNumber = String(row?.customer_number || "").trim();
    if (!customerNumber) return;

    if (!customerByNumber.has(customerNumber)) {
      customerByNumber.set(customerNumber, {
        customer_number: customerNumber,
        name: String(row?.name || "").trim() || null,
      });
      return;
    }

    const existing = customerByNumber.get(customerNumber);
    if (!existing?.name && row?.name) {
      existing.name = String(row.name).trim() || existing.name;
    }
  });
  const customers = Array.from(customerByNumber.values());

  const crmByCustomerNumber = new Map();
  crmClients.forEach(row => {
    const key = String(row.customer_number || "").trim();
    if (key && !crmByCustomerNumber.has(key)) crmByCustomerNumber.set(key, row);
  });

  const merged = [];
  const seenCrmIds = new Set();

  customers.forEach(customer => {
    const customerNumber = String(customer.customer_number || "").trim();
    if (!customerNumber) return;

    const matched = crmByCustomerNumber.get(customerNumber);
    if (matched) {
      seenCrmIds.add(Number(matched.id));
      merged.push({
        ...matched,
        customer_number: customerNumber,
        company_name: matched.company_name || String(customer.name || "").trim() || matched.company_name,
      });
      return;
    }

    merged.push({
      id: null,
      company_name: String(customer.name || "").trim() || `Kund ${customerNumber}`,
      organization_number: null,
      customer_number: customerNumber,
      fortnox_active: null,
      client_status: null,
      responsible_consultant: null,
      last_activity_date: null,
      source: "customers",
    });
  });

  crmClients.forEach(row => {
    const id = Number(row.id);
    if (Number.isFinite(id) && seenCrmIds.has(id)) return;
    merged.push(row);
  });

  const dedupedClientsMap = new Map();
  merged.forEach(row => {
    const id = Number(row?.id);
    const key = Number.isFinite(id)
      ? `id:${id}`
      : `noid:${String(row?.customer_number || "").trim()}::${String(row?.organization_number || "").trim()}::${String(row?.company_name || "").trim().toLowerCase()}`;

    if (!dedupedClientsMap.has(key)) {
      dedupedClientsMap.set(key, row);
    }
  });

  let clients = Array.from(dedupedClientsMap.values());

  if (consultant) {
    clients = clients.filter(row => String(row.responsible_consultant || "").trim() === consultant);
  }

  if (["active", "paused", "former"].includes(status)) {
    clients = clients.filter(row => String(row.client_status || "").trim() === status);
  } else if (status === "fortnox_active") {
    clients = clients.filter(row => row.fortnox_active === true);
  } else if (status === "fortnox_inactive") {
    clients = clients.filter(row => row.fortnox_active === false);
  }

  if (term) {
    const normalized = term.toLowerCase();
    clients = clients.filter(row => {
      const haystack = [row.company_name, row.organization_number, row.customer_number]
        .map(value => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(normalized);
    });
  }

  clients = clients
    .slice()
    .sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || ""), "sv-SE"))
    .slice(0, 500);

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

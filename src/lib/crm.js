import { supabaseServer } from "@/lib/supabase";

const CRM_CLIENTS_FETCH_LIMIT = 10000;
const CUSTOMERS_FETCH_LIMIT = 20000;
const CRM_CLIENTS_RESULT_LIMIT = 10000;

async function fetchAllRowsPaged({ table, columns, orderBy, maxRows }) {
  const pageSize = 1000;
  const maxAllowed = Math.max(pageSize, Number(maxRows || pageSize));
  const rows = [];
  let from = 0;

  while (from < maxAllowed) {
    const to = Math.min(from + pageSize - 1, maxAllowed - 1);
    const query = supabaseServer
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, to);

    const { data, error } = await query;
    if (error) {
      return { data: rows, error };
    }

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return { data: rows, error: null };
}

function isMissingCrmTable(error) {
  return error?.code === "PGRST205";
}

function formatCostCenterLabel(row = {}) {
  const code = String(row?.cost_center || "").trim();
  const name = String(row?.cost_center_name || "").trim();
  if (code && name) return `${code} - ${name}`;
  return code || name || null;
}

export async function getCrmClients(search = "") {
  const term = typeof search === "string" ? String(search || "").trim() : String(search?.search || "").trim();
  const consultant = typeof search === "object" ? String(search?.consultant || "").trim() : "";
  const status = typeof search === "object" ? String(search?.status || "").trim() : "";
  const tag = typeof search === "object" ? String(search?.tag || "").trim() : "";

  const [{ data: crmRows, error }, { data: customerRows, error: customerError }] = await Promise.all([
    fetchAllRowsPaged({
      table: "crm_clients",
      columns: "id, company_name, organization_number, customer_number, fortnox_active, client_status, responsible_consultant",
      orderBy: "company_name",
      maxRows: CRM_CLIENTS_FETCH_LIMIT,
    }),
    fetchAllRowsPaged({
      table: "customers",
      columns: "customer_number, name",
      orderBy: "name",
      maxRows: CUSTOMERS_FETCH_LIMIT,
    }),
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

  const customerNumbers = Array.from(new Set(
    clients.map(row => String(row?.customer_number || "").trim()).filter(Boolean)
  ));

  const costCenterByCustomer = new Map();
  if (customerNumbers.length > 0) {
    const { data: costCenterRows, error: costCenterError } = await supabaseServer
      .from("customer_costcenter_map")
      .select("customer_number, cost_center, cost_center_name")
      .in("customer_number", customerNumbers)
      .limit(10000);

    if (costCenterError) {
      if (!isMissingCrmTable(costCenterError)) {
        console.error("Fel vid hämtning av customer_costcenter_map:", costCenterError);
      }
    } else {
      for (const row of costCenterRows || []) {
        const number = String(row?.customer_number || "").trim();
        if (!number) continue;
        if (!costCenterByCustomer.has(number)) {
          costCenterByCustomer.set(number, row);
        }
      }
    }
  }

  clients = clients.map(row => {
    const number = String(row?.customer_number || "").trim();
    const costCenterRow = number ? costCenterByCustomer.get(number) : null;
    return {
      ...row,
      cost_center: String(costCenterRow?.cost_center || "").trim() || null,
      cost_center_name: String(costCenterRow?.cost_center_name || "").trim() || null,
      cost_center_label: formatCostCenterLabel(costCenterRow),
    };
  });

  if (consultant) {
    clients = clients.filter(row => String(row.cost_center_label || "").trim() === consultant);
  }

  if (status === "fortnox_active") {
    clients = clients.filter(row => row.fortnox_active === true);
  } else if (status === "fortnox_inactive") {
    clients = clients.filter(row => row.fortnox_active === false);
  } else if (status === "fortnox_unknown") {
    clients = clients.filter(row => row.fortnox_active !== true && row.fortnox_active !== false);
  }

  if (tag) {
    const tagId = Number(tag);
    if (Number.isFinite(tagId)) {
      const { data: tagRows } = await supabaseServer
        .from("crm_client_tags")
        .select("client_id")
        .eq("tag_id", tagId)
        .limit(10000);
      const taggedIds = new Set((tagRows || []).map(r => Number(r.client_id)));
      clients = clients.filter(row => taggedIds.has(Number(row.id)));
    }
  }

  if (term) {
    const normalized = term.toLowerCase();
    clients = clients.filter(row => {
      const haystack = [row.company_name, row.organization_number, row.customer_number, row.cost_center, row.cost_center_name, row.cost_center_label]
        .map(value => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(normalized);
    });
  }

  clients = clients
    .slice()
    .sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || ""), "sv-SE"))
    .slice(0, CRM_CLIENTS_RESULT_LIMIT);

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

  const { data: contactLinkRows, error: contactLinkError } = await supabaseServer
    .from("crm_client_contacts")
    .select("client_id, is_primary, crm_contact_directory(name, email, phone)")
    .in("client_id", clientIds)
    .limit(10000);

  if (contactLinkError && !isMissingCrmTable(contactLinkError)) {
    console.error("Fel vid hämtning av kontakter till klientlista:", contactLinkError);
  }

  const primaryContactByClientId = new Map();
  const fallbackContactByClientId = new Map();
  for (const row of contactLinkRows || []) {
    const id = Number(row?.client_id);
    if (!Number.isFinite(id)) continue;
    const c = row?.crm_contact_directory;
    if (!c) continue;
    if (row.is_primary) {
      primaryContactByClientId.set(id, c);
    } else if (!fallbackContactByClientId.has(id)) {
      fallbackContactByClientId.set(id, c);
    }
  }

  return clients.map(row => {
    const id = Number(row.id);
    const contact = primaryContactByClientId.get(id) || fallbackContactByClientId.get(id) || null;
    return {
      ...row,
      last_activity_date: latestByClientId.get(id) || null,
      contact_name: contact?.name || null,
      contact_email: contact?.email || null,
      contact_phone: contact?.phone || null,
    };
  });
}

export async function getCrmConsultants() {
  const { data, error } = await supabaseServer
    .from("customer_costcenter_map")
    .select("cost_center, cost_center_name")
    .limit(10000);

  if (error) {
    if (!isMissingCrmTable(error)) {
      console.error("Fel vid hämtning av crm-kostnadsstallen:", error);
    }
    return [];
  }

  return Array.from(new Set(
    (data || [])
      .map(row => formatCostCenterLabel(row))
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

  const [clientRes, servicesRes, activitiesRes, docsRes] = await Promise.all([
    supabaseServer.from("crm_clients").select("*").eq("id", id).single(),
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

  let contacts = [];
  const linksRes = await supabaseServer
    .from("crm_client_contacts")
    .select("contact_id, is_primary")
    .eq("client_id", id)
    .limit(5000);

  if (!linksRes.error) {
    const linkRows = linksRes.data || [];
    const contactIds = Array.from(new Set(
      linkRows.map(row => Number(row?.contact_id)).filter(value => Number.isFinite(value))
    ));

    if (contactIds.length > 0) {
      const directoryRes = await supabaseServer
        .from("crm_contact_directory")
        .select("id, name, role, email, phone, linkedin, notes")
        .in("id", contactIds)
        .order("name", { ascending: true });

      if (!directoryRes.error) {
        const isPrimaryById = new Map(
          linkRows.map(row => [Number(row.contact_id), !!row.is_primary])
        );
        contacts = (directoryRes.data || []).map(c => ({
          ...c,
          is_primary: isPrimaryById.get(Number(c.id)) || false,
        }));
      }
    }
  }

  // Backward-compatible fallback for environments that still use old crm_contacts model.
  if (contacts.length === 0) {
    const legacyContacts = await supabaseServer
      .from("crm_contacts")
      .select("id, name, role, email, phone, linkedin, notes")
      .eq("client_id", id)
      .order("name", { ascending: true });

    if (!legacyContacts.error) {
      contacts = legacyContacts.data || [];
    }
  }

  const contactDirectory = await getCrmContactDirectory();

  return {
    client: clientRes.data || null,
    contacts,
    contactDirectory,
    services: servicesRes.data || [],
    activities: activitiesRes.data || [],
    documents: docsRes.data || [],
  };
}

export async function getCrmContactDirectory() {
  const directoryRes = await supabaseServer
    .from("crm_contact_directory")
    .select("id, name, role, email, phone, linkedin, notes")
    .order("name", { ascending: true })
    .limit(5000);

  if (!directoryRes.error) {
    return directoryRes.data || [];
  }

  if (!isMissingCrmTable(directoryRes.error)) {
    console.error("Fel vid hämtning av crm_contact_directory:", directoryRes.error);
  }

  // Backward-compatible fallback: dedupe old per-client contacts as best effort.
  const legacyRes = await supabaseServer
    .from("crm_contacts")
    .select("id, name, role, email, phone, linkedin, notes")
    .order("name", { ascending: true })
    .limit(5000);

  if (legacyRes.error) {
    if (!isMissingCrmTable(legacyRes.error)) {
      console.error("Fel vid hämtning av legacy crm_contacts:", legacyRes.error);
    }
    return [];
  }

  const dedup = new Map();
  for (const row of legacyRes.data || []) {
    const key = [
      String(row?.name || "").trim().toLowerCase(),
      String(row?.email || "").trim().toLowerCase(),
      String(row?.phone || "").trim(),
    ].join("::");

    if (!dedup.has(key)) {
      dedup.set(key, row);
    }
  }

  return Array.from(dedup.values());
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

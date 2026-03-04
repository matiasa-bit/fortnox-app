import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

console.log("[supabase.js] url/anon/service", supabaseUrl, supabaseAnonKey ? "(key present)" : "(no anon key)", supabaseServiceKey ? "(service key present)" : "(no service key)");

// Klient för browser/client-side
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      // stubbed interface to avoid crashes when keys missing
      from: () => ({ select: async () => ({ data: [], error: null }) }),
      auth: { signIn: async () => null },
    };

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase URL or anon key is missing. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local.");
}
// Klient för server-side (med högre behörigheter)
export const supabaseServer = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : {
      from: () => ({ select: async () => ({ data: [], error: null }) }),
    };

if (!supabaseServiceKey) {
  console.warn("Supabase service role key missing. Some server-side calls may fail.");
}
// Spara token
export async function saveToken(userId, accessToken, refreshToken) {
  const { data, error } = await supabaseServer
    .from("tokens")
    .upsert(
      { user_id: userId, access_token: accessToken, refresh_token: refreshToken, updated_at: new Date() },
      { onConflict: "user_id" }
    );
  if (error) console.error("Fel vid sparande av token:", error);
  return data;
}

// Hämta token
export async function getTokenFromDb(userId) {
  const { data, error } = await supabaseServer.from("tokens").select("access_token").eq("user_id", userId).single();
  if (error) console.error("Fel vid hämtning av token:", error);
  return data?.access_token || null;
}

// Spara/uppdatera fakturor
export async function saveInvoices(invoices) {
  try {
    const fromObj = supabaseServer.from("invoices");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('invoices').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY och supabaseServer-instans.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }
    const { data, error } = await fromObj.upsert(invoices, { onConflict: "document_number" });
    if (error) console.error("Fel vid sparande av fakturor:", JSON.stringify(error, null, 2));
    return data;
  } catch (err) {
    console.error("Exception vid saveInvoices:", err);
    return null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function compactErrorMessage(error) {
  const raw = String(error?.message || "").trim();
  if (!raw) return "";

  const withoutTags = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const msg = withoutTags || raw;
  return msg.length > 260 ? `${msg.slice(0, 260)}...` : msg;
}

function isTransientGatewayError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (code.includes("502") || code.includes("503") || code.includes("504")) {
    return true;
  }

  return (
    message.includes("bad gateway") ||
    message.includes("error code 502") ||
    message.includes("cloudflare") ||
    message.includes("<!doctype html") ||
    message.includes("gateway")
  );
}

// Hämta cachade fakturor
export async function getCachedInvoices(fromDate) {
  try {
    const allRows = [];
    const chunkSize = 1000;
    const maxRetries = 3;
    let from = 0;

    while (true) {
      const to = from + chunkSize - 1;
      let data = null;
      let error = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await supabaseServer
          .from("invoices")
          .select("document_number, customer_name, customer_number, invoice_date, total, balance")
          .gte("invoice_date", fromDate)
          .order("invoice_date", { ascending: false })
          .range(from, to);

        data = result?.data || null;
        error = result?.error || null;

        if (!error) break;

        if (isTransientGatewayError(error) && attempt < maxRetries) {
          const waitMs = 400 * attempt;
          console.warn(`Tillfälligt Supabase-fel vid fakturahämtning (försök ${attempt}/${maxRetries}), väntar ${waitMs}ms...`, {
            fromDate,
            rangeFrom: from,
            rangeTo: to,
            message: compactErrorMessage(error),
          });
          await delay(waitMs);
          continue;
        }

        break;
      }

      if (error) {
        const logger = isTransientGatewayError(error) ? console.warn : console.error;
        logger("Fel vid hämtning av fakturor:", JSON.stringify({
          code: error?.code || null,
          message: compactErrorMessage(error) || null,
          details: error?.details || null,
          hint: error?.hint || null,
          fromDate,
          rangeFrom: from,
          rangeTo: to,
        }, null, 2));
        break;
      }

      const batch = data || [];
      allRows.push(...batch);

      if (batch.length < chunkSize) {
        break;
      }

      from += chunkSize;
    }

    return allRows;
  } catch (err) {
    console.error("Exception vid getCachedInvoices:", err);
    return [];
  }
}

// Spara artikeldetaljer
export async function saveInvoiceRows(rows) {
  try {
    const fromObj = supabaseServer.from("invoice_rows");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('invoice_rows').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }
    const { data, error } = await fromObj.upsert(rows, { onConflict: "id" });
    if (error) {
      const msg = String(error?.message || "");
      const isMissingArticleNumber =
        error?.code === "PGRST204" &&
        msg.includes("article_number") &&
        msg.includes("invoice_rows");

      if (isMissingArticleNumber) {
        error.hint = "invoice_rows.article_number saknas i databasen. Kör setup.sql eller en ALTER TABLE-migrering för att lägga till kolumnen.";
      }

      console.error("Fel vid sparande av artiklar:", JSON.stringify(error, null, 2));
      return { data: null, error };
    }
    return data;
  } catch (err) {
    console.error("Exception vid saveInvoiceRows:", err);
    return null;
  }
}

// Hämta artikardetaljer för en faktura
export async function getInvoiceRowsFromDb(invoiceNumber) {
  const { data, error } = await supabaseServer
    .from("invoice_rows")
    .select("*")
    .eq("invoice_number", invoiceNumber);
  if (error) console.error("Fel vid hämtning av artiklar:", error);
  return data || [];
}

// Hämta artikeldetaljer för flera fakturor i en query
export async function getInvoiceRowsForInvoices(invoiceNumbers = []) {
  try {
    const numbers = Array.isArray(invoiceNumbers)
      ? invoiceNumbers.map(v => String(v || "").trim()).filter(Boolean)
      : [];

    if (numbers.length === 0) return [];

    const chunkSize = 200;
    const allRows = [];

    for (let idx = 0; idx < numbers.length; idx += chunkSize) {
      const chunk = numbers.slice(idx, idx + chunkSize);
      const { data, error } = await supabaseServer
        .from("invoice_rows")
        .select("invoice_number, article_number, article_name, description, quantity, unit_price, total")
        .in("invoice_number", chunk);

      if (error) {
        console.error("Fel vid hämtning av invoice_rows för flera fakturor:", JSON.stringify(error, null, 2), { chunkStart: idx, chunkSize: chunk.length });
        continue;
      }

      if (Array.isArray(data) && data.length > 0) {
        allRows.push(...data);
      }
    }

    return allRows;
  } catch (err) {
    console.error("Exception vid getInvoiceRowsForInvoices:", err);
    return [];
  }
}

// Spara/uppdatera artikelregister
export async function saveArticleRegistry(rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const fromObj = supabaseServer.from("article_registry");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('article_registry').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }
    const { data, error } = await fromObj.upsert(rows, { onConflict: "article_number" });
    if (error) console.error("Fel vid sparande av article_registry:", JSON.stringify(error, null, 2));
    return data;
  } catch (err) {
    console.error("Exception vid saveArticleRegistry:", err);
    return null;
  }
}

// Hämta artikelregister, valfritt filtrerat på artikelnummer
export async function getCachedArticleRegistry(articleNumbers = []) {
  try {
    const numbers = Array.isArray(articleNumbers)
      ? articleNumbers.map(v => String(v || "").trim()).filter(Boolean)
      : [];

    if (numbers.length === 0) {
      const { data, error } = await supabaseServer
        .from("article_registry")
        .select("article_number, article_name, description, unit, active, updated_at")
        .order("article_number", { ascending: true });
      if (error) console.error("Fel vid hämtning av article_registry:", JSON.stringify(error, null, 2));
      return data || [];
    }

    const chunkSize = 300;
    const allRows = [];
    for (let idx = 0; idx < numbers.length; idx += chunkSize) {
      const chunk = numbers.slice(idx, idx + chunkSize);
      const { data, error } = await supabaseServer
        .from("article_registry")
        .select("article_number, article_name, description, unit, active, updated_at")
        .in("article_number", chunk);

      if (error) {
        console.error("Fel vid hämtning av article_registry (chunk):", JSON.stringify(error, null, 2), { chunkStart: idx, chunkSize: chunk.length });
        continue;
      }

      if (Array.isArray(data) && data.length > 0) {
        allRows.push(...data);
      }
    }

    return allRows;
  } catch (err) {
    console.error("Exception vid getCachedArticleRegistry:", err);
    return [];
  }
}

// Spara/uppdatera tidsredovisning
export async function saveTimeReports(rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const fromObj = supabaseServer.from("time_reports");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('time_reports').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }
    const { data, error } = await fromObj.upsert(rows, { onConflict: "unique_key" });
    if (error) console.error("Fel vid sparande av time_reports:", JSON.stringify(error, null, 2));
    return data;
  } catch (err) {
    console.error("Exception vid saveTimeReports:", err);
    return null;
  }
}

// Hämta cachad tidsredovisning
export async function getCachedTimeReports(fromDate = "2025-01-01") {
  try {
    const allRows = [];
    const chunkSize = 1000;
    let from = 0;

    while (true) {
      const to = from + chunkSize - 1;
      const { data, error } = await supabaseServer
        .from("time_reports")
        .select("report_date, employee_id, employee_name, customer_number, customer_name, project_name, activity, hours, description, updated_at")
        .gte("report_date", fromDate)
        .order("report_date", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("Fel vid hämtning av time_reports:", JSON.stringify(error, null, 2));
        break;
      }

      const batch = data || [];
      allRows.push(...batch);

      if (batch.length < chunkSize) {
        break;
      }

      from += chunkSize;
    }

    return allRows;
  } catch (err) {
    console.error("Exception vid getCachedTimeReports:", err);
    return [];
  }
}

// Spara/uppdatera kundkort
export async function saveCustomers(customers) {
  // customers: [{ customer_number, name, cost_center }]
  try {
    const fromObj = supabaseServer.from("customers");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('customers').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }
    const { data, error } = await fromObj.upsert(customers, { onConflict: "customer_number" });
    if (error) console.error("Fel vid sparande av customers:", JSON.stringify(error, null, 2));
    return data;
  } catch (err) {
    console.error("Exception vid saveCustomers:", err);
    return null;
  }
}

// Hämta cachade kundkort
export async function getCachedCustomers() {
  const { data, error } = await supabaseServer.from("customers").select("*").order("name", { ascending: true });
  if (error) console.error("Fel vid hämtning av customers:", error);
  return data || [];
}

// Spara/uppdatera customer_number -> cost_center mapping
export async function saveCustomerCostCenterMappings(rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const fromObj = supabaseServer.from("customer_costcenter_map");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('customer_costcenter_map').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }
    const { data, error } = await fromObj.upsert(rows, { onConflict: "customer_number" });
    if (error) console.error("Fel vid sparande av customer_costcenter_map:", JSON.stringify(error, null, 2));
    return data;
  } catch (err) {
    console.error("Exception vid saveCustomerCostCenterMappings:", err);
    return null;
  }
}

// Hämta mapping för en uppsättning kundnummer
export async function getCustomerCostCenterMappings(customerNumbers = []) {
  try {
    const numbers = Array.isArray(customerNumbers)
      ? customerNumbers.map(v => String(v || "").trim()).filter(Boolean)
      : [];

    const runQuery = async (withActiveColumn) => {
      let query = supabaseServer
        .from("customer_costcenter_map")
        .select(withActiveColumn
          ? "customer_number, customer_name, cost_center, cost_center_name, active, updated_at"
          : "customer_number, customer_name, cost_center, cost_center_name, updated_at"
        );

      if (numbers.length > 0) {
        query = query.in("customer_number", numbers);
      }

      return query;
    };

    let { data, error } = await runQuery(true);

    if (error) {
      const message = String(error.message || "").toLowerCase();
      const details = String(error.details || "").toLowerCase();
      const missingActiveColumn = message.includes("active") || details.includes("active");

      if (missingActiveColumn) {
        const fallback = await runQuery(false);
        data = fallback.data;
        error = fallback.error;

        if (!error) {
          return (data || []).map(row => ({ ...row, active: true }));
        }
      }
    }

    if (error) console.error("Fel vid hämtning av customer_costcenter_map:", JSON.stringify(error, null, 2));
    return data || [];
  } catch (err) {
    console.error("Exception vid getCustomerCostCenterMappings:", err);
    return [];
  }
}

// Spara/uppdatera mappning employee_id -> namn + grupp
export async function saveEmployeeMappings(rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const normalized = rows
      .map(row => ({
        employee_id: String(row.employee_id || "").trim(),
        employee_name: String(row.employee_name || "").trim(),
        group_name: String(row.group_name || "").trim(),
        cost_center: String(row.cost_center || "").trim(),
        active: row.active === false ? false : true,
        updated_at: new Date().toISOString(),
      }))
      .filter(row => row.employee_id);

    if (normalized.length === 0) return [];

    const fromObj = supabaseServer.from("employee_mappings");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('employee_mappings').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }

    const { data, error } = await fromObj.upsert(normalized, { onConflict: "employee_id" });
    if (error) {
      if (error.code === "PGRST205") {
        return null;
      }
      console.error("Fel vid sparande av employee_mappings:", JSON.stringify(error, null, 2));
      return null;
    }
    return data || [];
  } catch (err) {
    console.error("Exception vid saveEmployeeMappings:", err);
    return null;
  }
}

// Hämta sparade employee-mappningar
export async function getEmployeeMappings() {
  try {
    const { data, error } = await supabaseServer
      .from("employee_mappings")
      .select("employee_id, employee_name, group_name, cost_center, active, updated_at")
      .order("employee_name", { ascending: true });

    if (error) {
      if (error.code === "PGRST205") {
        return [];
      }
      console.error("Fel vid hämtning av employee_mappings:", JSON.stringify(error, null, 2));
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Exception vid getEmployeeMappings:", err);
    return [];
  }
}

// Hämta unika anställda från tidsrader för förifyllning i inställningar
export async function getDistinctEmployeesFromTimeReports() {
  try {
    const allRows = [];
    const chunkSize = 1000;
    let from = 0;

    while (true) {
      const to = from + chunkSize - 1;
      const { data, error } = await supabaseServer
        .from("time_reports")
        .select("employee_id, employee_name")
        .order("employee_id", { ascending: true })
        .range(from, to);

      if (error) {
        console.error("Fel vid hämtning av employee från time_reports:", JSON.stringify(error, null, 2));
        break;
      }

      const batch = data || [];
      allRows.push(...batch);

      if (batch.length < chunkSize) break;
      from += chunkSize;
    }

    const map = new Map();
    for (const row of allRows) {
      const employeeId = String(row.employee_id || "").trim();
      const employeeName = String(row.employee_name || "").trim();
      if (!employeeId) continue;

      if (!map.has(employeeId)) {
        map.set(employeeId, { employee_id: employeeId, employee_name: employeeName });
      } else if (!map.get(employeeId).employee_name && employeeName) {
        map.set(employeeId, { employee_id: employeeId, employee_name: employeeName });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.employee_id.localeCompare(b.employee_id, "sv-SE", { numeric: true }));
  } catch (err) {
    console.error("Exception vid getDistinctEmployeesFromTimeReports:", err);
    return [];
  }
}

// Spara/uppdatera mappning article_number -> grupp
export async function saveArticleGroupMappings(rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const normalized = rows
      .map(row => ({
        article_number: String(row.article_number || "").trim(),
        article_name: String(row.article_name || "").trim(),
        group_name: String(row.group_name || "").trim(),
        active: row.active === false ? false : true,
        updated_at: new Date().toISOString(),
      }))
      .filter(row => row.article_number && row.group_name);

    if (normalized.length === 0) return [];

    const fromObj = supabaseServer.from("article_group_mappings");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('article_group_mappings').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }

    const { data, error } = await fromObj.upsert(normalized, { onConflict: "article_number" });
    if (error) {
      if (error.code === "PGRST205") {
        return null;
      }
      console.error("Fel vid sparande av article_group_mappings:", JSON.stringify(error, null, 2));
      return null;
    }

    return data || [];
  } catch (err) {
    console.error("Exception vid saveArticleGroupMappings:", err);
    return null;
  }
}

// Hämta sparade artikelgrupp-mappningar
export async function getArticleGroupMappings(articleNumbers = []) {
  try {
    const numbers = Array.isArray(articleNumbers)
      ? articleNumbers.map(v => String(v || "").trim()).filter(Boolean)
      : [];

    let query = supabaseServer
      .from("article_group_mappings")
      .select("article_number, article_name, group_name, active, updated_at")
      .order("group_name", { ascending: true })
      .order("article_number", { ascending: true });

    if (numbers.length > 0) {
      query = query.in("article_number", numbers);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === "PGRST205") {
        return [];
      }
      console.error("Fel vid hämtning av article_group_mappings:", JSON.stringify(error, null, 2));
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Exception vid getArticleGroupMappings:", err);
    return [];
  }
}

// Spara/uppdatera kundavtal (ContractAccruals)
export async function saveContractAccruals(rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const normalized = rows
      .map(row => ({
        contract_number: String(row.contract_number || "").trim(),
        customer_number: String(row.customer_number || "").trim(),
        customer_name: String(row.customer_name || "").trim() || null,
        description: String(row.description || "").trim() || null,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        status: String(row.status || "").trim() || null,
        accrual_type: String(row.accrual_type || "").trim() || null,
        period: String(row.period || "").trim() || null,
        total: row.total ?? null,
        currency_code: String(row.currency_code || "").trim() || null,
        raw_data: row.raw_data || null,
        updated_at: new Date().toISOString(),
      }))
      .filter(row => row.contract_number && row.customer_number);

    if (normalized.length === 0) return [];

    const fromObj = supabaseServer.from("contract_accruals");
    if (!fromObj || typeof fromObj.upsert !== "function") {
      console.error("supabaseServer.from('contract_accruals').upsert saknas. Kontrollera SUPABASE_SERVICE_ROLE_KEY.", { hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      return null;
    }

    const { data, error } = await fromObj.upsert(normalized, { onConflict: "customer_number,contract_number" });
    if (error) {
      if (error.code === "PGRST205") {
        return null;
      }
      console.error("Fel vid sparande av contract_accruals:", JSON.stringify(error, null, 2));
      return null;
    }

    return data || [];
  } catch (err) {
    console.error("Exception vid saveContractAccruals:", err);
    return null;
  }
}

// Hämta sparade kundavtal
export async function getCachedContractAccruals() {
  try {
    const allRows = [];
    const chunkSize = 1000;
    let from = 0;

    while (true) {
      const to = from + chunkSize - 1;
      const { data, error } = await supabaseServer
        .from("contract_accruals")
        .select("contract_number, customer_number, customer_name, description, start_date, end_date, status, accrual_type, period, total, currency_code, raw_data, updated_at")
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) {
        if (error.code === "PGRST205") {
          return [];
        }
        console.error("Fel vid hämtning av contract_accruals:", JSON.stringify(error, null, 2));
        return [];
      }

      const batch = data || [];
      allRows.push(...batch);

      if (batch.length < chunkSize) {
        break;
      }

      from += chunkSize;
    }

    return allRows;
  } catch (err) {
    console.error("Exception vid getCachedContractAccruals:", err);
    return [];
  }
}

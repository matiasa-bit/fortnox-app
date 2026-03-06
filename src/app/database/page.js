import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";

async function fetchPreviewRows(tableName, orderBy = "updated_at", limit = 300) {
  let query = supabaseServer
    .from(tableName)
    .select("*")
    .limit(limit);

  if (orderBy) {
    query = query.order(orderBy, { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    return { rows: [], error: error.message, truncated: false };
  }

  return {
    rows: data || [],
    error: null,
    truncated: (data || []).length >= limit,
  };
}

async function getTableSummary(tableName, orderBy = "updated_at") {
  const { count, error: countError } = await supabaseServer
    .from(tableName)
    .select("*", { count: "planned", head: true });

  if (countError) {
    return { tableName, count: 0, latestUpdated: null, rows: [], error: countError.message };
  }

  let latestUpdated = null;
  let latestError = null;

  const latest = await supabaseServer
    .from(tableName)
    .select(orderBy)
    .order(orderBy, { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) {
    latestError = latest.error.message;
  } else {
    latestUpdated = latest.data?.[orderBy] || latest.data?.updated_at || null;
  }

  const previewRowsResult = await fetchPreviewRows(tableName, orderBy, 300);
  const rows = previewRowsResult.rows;
  const rowsError = previewRowsResult.error;

  return {
    tableName,
    count: count || 0,
    latestUpdated,
    rows: rows || [],
    truncated: !!previewRowsResult.truncated,
    error: rowsError?.message || latestError || null,
  };
}

function Section({ title, source, summary }) {
  const columns = Array.from(
    summary.rows.reduce((set, row) => {
      Object.keys(row || {}).forEach(key => set.add(key));
      return set;
    }, new Set())
  );

  const formatValue = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <section style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 14, padding: 20, marginBottom: 18 }}>
      <h2 style={{ color: "#fff", margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>{title}</h2>
      <p style={{ color: "#64748b", margin: "0 0 10px", fontSize: 13 }}>Källa: {source}</p>
      <p style={{ color: "#e2e8f0", margin: "0 0 8px", fontSize: 14 }}>
        Antal rader: <strong>{summary.count}</strong>
      </p>
      <p style={{ color: "#e2e8f0", margin: "0 0 12px", fontSize: 14 }}>
        Senast uppdaterad: <strong>{summary.latestUpdated || "okänt"}</strong>
      </p>
      {summary.truncated && (
        <p style={{ color: "#f6d365", margin: "0 0 12px", fontSize: 13 }}>
          Visar senaste 300 rader (preview-läge för snabb laddning).
        </p>
      )}
      {summary.error && (
        <p style={{ color: "#ff8a8a", margin: "0 0 12px", fontSize: 13 }}>Fel: {summary.error}</p>
      )}

      {summary.rows.length === 0 ? (
        <div style={{ background: "#080c10", borderRadius: 10, padding: 12, color: "#cde3f0", fontSize: 13 }}>
          Inga rader att visa.
        </div>
      ) : (
        <div style={{ background: "#080c10", borderRadius: 10, padding: 12, overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {columns.map(column => (
                  <th
                    key={column}
                    style={{ color: "#64748b", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row, index) => (
                <tr key={index} style={{ borderBottom: "1px solid #141c24" }}>
                  {columns.map(column => (
                    <td
                      key={`${index}-${column}`}
                      style={{ color: "#e2e8f0", padding: "8px 10px", fontSize: 12, maxWidth: 280, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={formatValue(row[column])}
                    >
                      {formatValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function DatabasePage() {
  const [invoices, mapping, customers, articleRegistry, timeReports, contractAccruals] = await Promise.all([
    getTableSummary("invoices"),
    getTableSummary("customer_costcenter_map"),
    getTableSummary("customers"),
    getTableSummary("article_registry"),
    getTableSummary("time_reports", "report_date"),
    getTableSummary("contract_accruals"),
  ]);

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #080c10 0%, #0f1419 100%)", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 28 }}>Databasöversikt</h1>
          <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 14 }}>
            Här ser du exakt vad som finns i databasen och vilken Fortnox-källa datat kommer från.
          </p>
        </div>
        <Link href="/" style={{ color: "#fff", textDecoration: "none", border: "1px solid #1e293b", borderRadius: 10, padding: "8px 12px", background: "#0f1419" }}>
          Till dashboard
        </Link>
      </div>

      <Section title="Fakturor (invoices)" source="Fortnox /3/invoices" summary={invoices} />
      <Section title="Kund->Kostnadsställe (customer_costcenter_map)" source="Fortnox /3/customers/{customerNumber}" summary={mapping} />
      <Section title="Kunder (customers)" source="Fortnox /3/customers" summary={customers} />
      <Section title="Artikelregister (article_registry)" source="Fortnox /3/articles" summary={articleRegistry} />
      <Section title="Kundavtal (contract_accruals)" source="Fortnox /3/contracts (fallback /3/contractaccruals)" summary={contractAccruals} />
      <Section title="Tidsredovisning (time_reports)" source="Fortnox /3/timereports" summary={timeReports} />
    </main>
  );
}

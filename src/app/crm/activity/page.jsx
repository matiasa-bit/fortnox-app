import Link from "next/link";
import { getRecentCrmActivities } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function CrmActivityPage() {
  const rows = await getRecentCrmActivities(200);

  return (
    <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 18 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Aktivitetslogg</h2>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a4a5e" }}>
              {["Datum", "Klient", "Typ", "Beskrivning", "Skapad av"].map(h => (
                <th key={h} style={{ textAlign: "left", color: "#6b8fa3", fontSize: 12, padding: "0 10px 10px 0", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const client = Array.isArray(row.crm_clients) ? row.crm_clients[0] : row.crm_clients;
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid #1e3545" }}>
                  <td style={{ padding: "10px 10px 10px 0", color: "#dbe7ef", fontSize: 13 }}>{row.date || "-"}</td>
                  <td style={{ padding: "10px 10px 10px 0", color: "#fff", fontSize: 13 }}>
                    <Link href={`/crm/clients/${row.client_id}`} style={{ color: "#fff", textDecoration: "underline", textUnderlineOffset: 2 }}>
                      {client?.company_name || `Klient #${row.client_id}`}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 10px 10px 0", color: "#8fb1c3", fontSize: 13 }}>{row.activity_type || "-"}</td>
                  <td style={{ padding: "10px 10px 10px 0", color: "#dbe7ef", fontSize: 13 }}>{row.description || "-"}</td>
                  <td style={{ padding: "10px 0", color: "#8fb1c3", fontSize: 13 }}>{row.created_by || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <p style={{ color: "#6b8fa3", fontSize: 13, marginTop: 12 }}>Inga aktiviteter ännu.</p>}
    </section>
  );
}

import Link from "next/link";
import { getCrmClients, getCrmConsultants } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function CrmClientsPage({ searchParams }) {
  const params = await searchParams;
  const query = String(params?.q || "").trim();
  const consultant = String(params?.consultant || "").trim();
  const status = String(params?.status || "").trim();

  const [clients, consultants] = await Promise.all([
    getCrmClients({ search: query, consultant, status }),
    getCrmConsultants(),
  ]);

  const cellLinkStyle = {
    display: "block",
    color: "inherit",
    textDecoration: "none",
    padding: "10px 10px 10px 0",
    fontSize: 13,
  };

  return (
    <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Klientlista</h2>
        <Link href="/crm/clients/new" style={{ background: "#00c97a", color: "#0f1923", borderRadius: 8, padding: "8px 12px", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
          Ny klient
        </Link>
      </div>

      <form action="/crm/clients" method="get" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Sök bolagsnamn eller org.nr"
          style={{ flex: 1, minWidth: 260, background: "#0f1923", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 8, padding: "10px 12px", fontSize: 14 }}
        />

        <select
          name="consultant"
          defaultValue={consultant}
          style={{ background: "#0f1923", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 8, padding: "10px 12px", fontSize: 14, minWidth: 190 }}
        >
          <option value="">Alla konsulter</option>
          {consultants.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={status}
          style={{ background: "#0f1923", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 8, padding: "10px 12px", fontSize: 14, minWidth: 140 }}
        >
          <option value="">Alla statusar</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="former">former</option>
        </select>

        <button type="submit" style={{ background: "#2f7ef7", color: "#fff", border: "none", borderRadius: 8, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
          Sök
        </button>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a4a5e" }}>
              {["Företagsnamn", "Org.nr", "Ansvarig konsult", "Status", "Senaste aktivitet"].map(h => (
                <th key={h} style={{ textAlign: "left", color: "#6b8fa3", fontSize: 12, padding: "0 10px 10px 0", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map(client => (
              <tr key={client.id} style={{ borderBottom: "1px solid #1e3545" }}>
                <td style={{ color: "#fff", fontWeight: 600 }}>
                  <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#fff", fontWeight: 600 }}>
                    {client.company_name}
                  </Link>
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.organization_number || "-"}</Link>
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.responsible_consultant || "-"}</Link>
                </td>
                <td style={{ color: client.client_status === "active" ? "#00c97a" : client.client_status === "paused" ? "#f59e0b" : "#94a3b8", fontWeight: 700 }}>
                  <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "inherit", fontWeight: 700 }}>{client.client_status || "-"}</Link>
                </td>
                <td style={{ color: "#8fb1c3" }}>
                  <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#8fb1c3" }}>
                    {client.last_activity_date || "-"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {clients.length === 0 && (
        <p style={{ color: "#6b8fa3", fontSize: 13, marginTop: 12 }}>
          Inga klienter hittades.
        </p>
      )}
    </section>
  );
}

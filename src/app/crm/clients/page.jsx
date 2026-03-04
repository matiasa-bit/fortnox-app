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
    <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Klientlista</h2>
        <Link href="/crm/clients/new" style={{ background: "#00c97a", color: "#0f1923", borderRadius: 10, padding: "8px 12px", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
          Ny klient
        </Link>
      </div>

      <form action="/crm/clients" method="get" style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Sök bolagsnamn, org.nr eller kundnummer"
          style={{ flex: 1, minWidth: 260, background: "#0f1923", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 10, padding: "10px 12px", fontSize: 14 }}
        />

        <select
          name="consultant"
          defaultValue={consultant}
          style={{ background: "#0f1923", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 10, padding: "10px 12px", fontSize: 14, minWidth: 190 }}
        >
          <option value="">Alla konsulter</option>
          {consultants.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={status}
          style={{ background: "#0f1923", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 10, padding: "10px 12px", fontSize: 14, minWidth: 140 }}
        >
          <option value="">Alla statusar</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="former">former</option>
        </select>

        <button type="submit" style={{ background: "#2f7ef7", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
          Sök
        </button>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a4a5e" }}>
              {["Företagsnamn", "Org.nr", "Kundnummer", "Ansvarig konsult", "Status", "Senaste aktivitet"].map(h => (
                <th key={h} style={{ textAlign: "left", color: "#6b8fa3", fontSize: 12, fontWeight: 600, padding: "0 10px 12px 0", textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map(client => (
              <tr key={client.id || client.customer_number || client.organization_number || client.company_name} style={{ borderBottom: "1px solid #1e3545" }}>
                <td style={{ color: "#fff", fontWeight: 600 }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#fff", fontWeight: 600 }}>
                      {client.company_name}
                    </Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#fff", fontWeight: 600 }}>{client.company_name}</div>
                  )}
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.organization_number || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.organization_number || "-"}</div>
                  )}
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.customer_number || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.customer_number || "-"}</div>
                  )}
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.responsible_consultant || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#dbe7ef" }}>
                      <Link
                        href={`/crm/clients/new?company_name=${encodeURIComponent(client.company_name || "")}&customer_number=${encodeURIComponent(client.customer_number || "")}`}
                        style={{ color: "#3b9eff", textDecoration: "underline" }}
                      >
                        Skapa CRM-profil
                      </Link>
                    </div>
                  )}
                </td>
                <td style={{ color: client.client_status === "active" ? "#00c97a" : client.client_status === "paused" ? "#f59e0b" : "#94a3b8", fontWeight: 700 }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "inherit", fontWeight: 700 }}>{client.client_status || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#94a3b8", fontWeight: 700 }}>-</div>
                  )}
                </td>
                <td style={{ color: "#8fb1c3" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#8fb1c3" }}>
                      {client.last_activity_date || "-"}
                    </Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#8fb1c3" }}>-</div>
                  )}
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

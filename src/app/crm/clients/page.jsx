import Link from "next/link";
import { getCrmClients, getCrmConsultants } from "@/lib/crm";
import { supabaseServer } from "@/lib/supabase";
import CrmClientsFilters from "@/app/crm/clients/CrmClientsFilters";

export const dynamic = "force-dynamic";

export default async function CrmClientsPage({ searchParams }) {
  const params = await searchParams;
  const query = String(params?.q || "").trim();
  const consultant = String(params?.consultant || "").trim();
  const status = String(params?.status || "fortnox_active").trim() || "fortnox_active";
  const tag = String(params?.tag || "").trim();

  const [clients, consultants, tagsResult] = await Promise.all([
    getCrmClients({ search: query, consultant, status, tag }),
    getCrmConsultants(),
    supabaseServer.from("crm_tags").select("id, name, color").order("name"),
  ]);
  const allTags = tagsResult?.data || [];

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

      <CrmClientsFilters
        initialQuery={query}
        initialConsultant={consultant}
        initialStatus={status}
        consultants={consultants}
        initialTag={tag}
        allTags={allTags}
      />

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a4a5e" }}>
              {["Företagsnamn", "Org.nr", "Kundnummer", "Fortnox", "Kostnadsstalle", "Kontakt", "Telefon", "E-post", "Senaste aktivitet"].map(h => (
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
                <td style={{ color: "#dbe7ef", fontWeight: 700 }}>
                  {client.id ? (
                    <Link
                      href={`/crm/clients/${client.id}`}
                      style={{
                        ...cellLinkStyle,
                        color: client.fortnox_active === true ? "#00c97a" : client.fortnox_active === false ? "#fda4af" : "#94a3b8",
                        fontWeight: 700,
                      }}
                    >
                      {client.fortnox_active === true ? "Aktiv" : client.fortnox_active === false ? "Inaktiv" : "-"}
                    </Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#94a3b8", fontWeight: 700 }}>-</div>
                  )}
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.cost_center_label || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#dbe7ef" }}>
                      {client.cost_center_label || "-"}
                    </div>
                  )}
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.contact_name || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.contact_name || "-"}</div>
                  )}
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.contact_phone || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.contact_phone || "-"}</div>
                  )}
                </td>
                <td style={{ color: "#dbe7ef" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.contact_email || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#dbe7ef" }}>{client.contact_email || "-"}</div>
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

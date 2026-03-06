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
    <section style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Klientlista</h2>
        <Link href="/crm/clients/new" style={{ background: "#f59e0b", color: "#080c10", borderRadius: 10, padding: "8px 12px", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
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
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Företagsnamn", "Org.nr", "Kundnummer", "Fortnox", "Kostnadsstalle", "Taggar", "Kontakt", "Telefon", "E-post", "Senaste aktivitet"].map(h => (
                <th key={h} style={{ textAlign: "left", color: "#64748b", fontSize: 12, fontWeight: 600, padding: "0 10px 12px 0", textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map(client => (
              <tr key={client.id || client.customer_number || client.organization_number || client.company_name} style={{ borderBottom: "1px solid #141c24" }}>
                <td style={{ color: "#fff", fontWeight: 600 }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#fff", fontWeight: 600 }}>
                      {client.company_name}
                    </Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#fff", fontWeight: 600 }}>{client.company_name}</div>
                  )}
                </td>
                <td style={{ color: "#e2e8f0" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.organization_number || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.organization_number || "-"}</div>
                  )}
                </td>
                <td style={{ color: "#e2e8f0" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.customer_number || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.customer_number || "-"}</div>
                  )}
                </td>
                <td style={{ color: "#e2e8f0", fontWeight: 700 }}>
                  {client.id ? (
                    <Link
                      href={`/crm/clients/${client.id}`}
                      style={{
                        ...cellLinkStyle,
                        color: client.fortnox_active === true ? "#f59e0b" : client.fortnox_active === false ? "#fda4af" : "#94a3b8",
                        fontWeight: 700,
                      }}
                    >
                      {client.fortnox_active === true ? "Aktiv" : client.fortnox_active === false ? "Inaktiv" : "-"}
                    </Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#94a3b8", fontWeight: 700 }}>-</div>
                  )}
                </td>
                <td style={{ color: "#e2e8f0" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.cost_center_label || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#e2e8f0" }}>
                      {client.cost_center_label || "-"}
                    </div>
                  )}
                </td>
                <td style={{ padding: "6px 10px 6px 0" }}>
                  {client.tags?.length > 0 ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {client.tags.map(tag => (
                        <span
                          key={tag.id}
                          style={{
                            background: tag.color + "22",
                            color: tag.color,
                            border: `1px solid ${tag.color}55`,
                            borderRadius: 20,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: "#3a5368", fontSize: 12 }}>—</span>
                  )}
                </td>
                <td style={{ color: "#e2e8f0" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.contact_name || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.contact_name || "-"}</div>
                  )}
                </td>
                <td style={{ color: "#e2e8f0" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.contact_phone || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.contact_phone || "-"}</div>
                  )}
                </td>
                <td style={{ color: "#e2e8f0" }}>
                  {client.id ? (
                    <Link href={`/crm/clients/${client.id}`} style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.contact_email || "-"}</Link>
                  ) : (
                    <div style={{ ...cellLinkStyle, color: "#e2e8f0" }}>{client.contact_email || "-"}</div>
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
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 12 }}>
          Inga klienter hittades.
        </p>
      )}
    </section>
  );
}

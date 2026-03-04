import Link from "next/link";
import { getCrmClientDetails } from "@/lib/crm";
import ClientProfileTabs from "@/app/crm/clients/[id]/ClientProfileTabs";

export const dynamic = "force-dynamic";

function sectionStyle() {
  return { background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 16, padding: 24 };
}

export default async function CrmClientProfilePage({ params }) {
  const { id } = await params;
  const details = await getCrmClientDetails(id);

  if (!details?.client) {
    return (
      <section style={sectionStyle()}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Klient hittades inte</h2>
        <Link href="/crm/clients" style={{ color: "#3b9eff" }}>Till klientlistan</Link>
      </section>
    );
  }

  const { client, contacts, services, activities, documents } = details;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={sectionStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{client.company_name}</h2>
            <p style={{ margin: "6px 0 0", color: "#8fb1c3", fontSize: 13 }}>Org.nr: {client.organization_number || "-"}</p>
            <p style={{ margin: "4px 0 0", color: "#8fb1c3", fontSize: 13 }}>Kundnummer: {client.customer_number || "-"}</p>
          </div>
          <Link
            href={`/crm/clients/${client.id}/edit`}
            style={{
              background: "#1a2e3b",
              color: "#fff",
              border: "1px solid #2a4a5e",
              borderRadius: 10,
              padding: "8px 12px",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Redigera klient
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
          <div style={{ color: "#dbe7ef" }}><strong style={{ color: "#8fb1c3" }}>Status:</strong> {client.client_status || "-"}</div>
          <div style={{ color: "#dbe7ef" }}><strong style={{ color: "#8fb1c3" }}>Bransch:</strong> {client.industry || "-"}</div>
          <div style={{ color: "#dbe7ef" }}><strong style={{ color: "#8fb1c3" }}>Omsättning:</strong> {client.revenue ?? "-"}</div>
          <div style={{ color: "#dbe7ef" }}><strong style={{ color: "#8fb1c3" }}>Anställda:</strong> {client.employees ?? "-"}</div>
          <div style={{ color: "#dbe7ef" }}><strong style={{ color: "#8fb1c3" }}>Startdatum:</strong> {client.start_date || "-"}</div>
          <div style={{ color: "#dbe7ef" }}><strong style={{ color: "#8fb1c3" }}>Ansvarig:</strong> {client.responsible_consultant || "-"}</div>
          <div style={{ color: "#dbe7ef" }}><strong style={{ color: "#8fb1c3" }}>Kontor:</strong> {client.office || "-"}</div>
        </div>

        <p style={{ margin: "16px 0 0", color: "#dbe7ef", fontSize: 14 }}>
          <strong style={{ color: "#8fb1c3" }}>Anteckningar:</strong> {client.notes || "-"}
        </p>
      </section>

      <ClientProfileTabs
        clientId={client.id}
        contacts={contacts}
        services={services}
        activities={activities}
        documents={documents}
      />
    </div>
  );
}

import Link from "next/link";
import { getCrmClientDetails } from "@/lib/crm";
import ClientProfileTabs from "@/app/crm/clients/[id]/ClientProfileTabs";

export const dynamic = "force-dynamic";

function sectionStyle() {
  return { background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 16 };
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
            <h2 style={{ margin: 0, fontSize: 22 }}>{client.company_name}</h2>
            <p style={{ margin: "6px 0 0", color: "#8fb1c3", fontSize: 13 }}>Org.nr: {client.organization_number || "-"}</p>
            <p style={{ margin: "4px 0 0", color: "#8fb1c3", fontSize: 13 }}>Kundnummer: {client.customer_number || "-"}</p>
          </div>
          <Link href={`/crm/clients/${client.id}/edit`} style={{ color: "#3b9eff", textDecoration: "none", fontSize: 13 }}>Redigera klient</Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 14 }}>
          <div><strong>Status:</strong> {client.client_status || "-"}</div>
          <div><strong>Bransch:</strong> {client.industry || "-"}</div>
          <div><strong>Omsättning:</strong> {client.revenue ?? "-"}</div>
          <div><strong>Anställda:</strong> {client.employees ?? "-"}</div>
          <div><strong>Startdatum:</strong> {client.start_date || "-"}</div>
          <div><strong>Ansvarig:</strong> {client.responsible_consultant || "-"}</div>
          <div><strong>Kontor:</strong> {client.office || "-"}</div>
        </div>

        <p style={{ margin: "12px 0 0", color: "#dbe7ef", fontSize: 14 }}>
          <strong>Anteckningar:</strong> {client.notes || "-"}
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

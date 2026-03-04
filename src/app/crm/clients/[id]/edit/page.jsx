import Link from "next/link";
import { getCrmClientById } from "@/lib/crm";
import ClientForm from "@/app/crm/clients/ClientForm";

export default async function CrmEditClientPage({ params }) {
  const { id } = await params;
  const client = await getCrmClientById(id);

  if (!client) {
    return (
      <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 18 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Klient hittades inte</h2>
        <Link href="/crm/clients" style={{ color: "#3b9eff" }}>Till klientlistan</Link>
      </section>
    );
  }

  return (
    <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 18 }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Redigera klient</h2>
      <p style={{ margin: "0 0 14px", color: "#8fb1c3", fontSize: 14 }}>
        Uppdatera uppgifter för {client.company_name}.
      </p>

      <ClientForm mode="edit" initialClient={client} clientId={client.id} />
    </section>
  );
}

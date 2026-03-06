import ClientForm from "@/app/crm/clients/ClientForm";

export default async function CrmCreateClientPage({ searchParams }) {
  const params = await searchParams;
  const initialClient = {
    company_name: String(params?.company_name || "").trim() || null,
    customer_number: String(params?.customer_number || "").trim() || null,
  };

  return (
    <section style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 14, padding: 18 }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Skapa klient</h2>
      <p style={{ margin: "0 0 14px", color: "#8fb1c3", fontSize: 14 }}>
        Fyll i grunduppgifter för den nya klienten.
      </p>

      <ClientForm mode="create" initialClient={initialClient} />
    </section>
  );
}

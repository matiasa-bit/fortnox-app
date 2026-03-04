import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [clients, contacts, services, activities, docs] = await Promise.all([
    supabaseServer.from("crm_clients").select("id", { count: "exact", head: true }),
    supabaseServer.from("crm_contacts").select("id", { count: "exact", head: true }),
    supabaseServer.from("crm_services").select("id", { count: "exact", head: true }),
    supabaseServer.from("crm_activities").select("id", { count: "exact", head: true }),
    supabaseServer.from("crm_document_links").select("id", { count: "exact", head: true }),
  ]);

  return {
    clients: clients.count || 0,
    contacts: contacts.count || 0,
    services: services.count || 0,
    activities: activities.count || 0,
    documents: docs.count || 0,
  };
}

export default async function CrmDashboardPage() {
  const counts = await getCounts();

  const cards = [
    { label: "Klienter", value: counts.clients, color: "#00c97a" },
    { label: "Kontakter", value: counts.contacts, color: "#3b9eff" },
    { label: "Tjänster", value: counts.services, color: "#f59e0b" },
    { label: "Aktiviteter", value: counts.activities, color: "#1db3a7" },
    { label: "Dokumentlänkar", value: counts.documents, color: "#9b59ff" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
        {cards.map(card => (
          <div key={card.label} style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: "18px 16px" }}>
            <p style={{ margin: "0 0 8px", color: "#6b8fa3", fontSize: 12, textTransform: "uppercase", fontWeight: 700 }}>{card.label}</p>
            <p style={{ margin: 0, color: card.color, fontSize: 28, fontWeight: 800 }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 18 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Kom igång</h2>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#dbe7ef", lineHeight: 1.7 }}>
          <li>Skapa första klienten via <Link href="/crm/clients/new" style={{ color: "#3b9eff" }}>Ny klient</Link>.</li>
          <li>Hantera klienter i <Link href="/crm/clients" style={{ color: "#3b9eff" }}>Klientlistan</Link>.</li>
          <li>Följ händelser i <Link href="/crm/activity" style={{ color: "#3b9eff" }}>Aktivitetsloggen</Link>.</li>
        </ul>
      </div>
    </div>
  );
}

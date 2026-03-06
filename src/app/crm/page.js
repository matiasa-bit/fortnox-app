import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [clients, contacts, services, activities, docs] = await Promise.all([
    supabaseServer.from("crm_clients").select("id", { count: "exact", head: true }).eq("fortnox_active", true),
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
    { label: "Aktiva klienter", value: counts.clients, color: "#f59e0b" },
    { label: "Kontakter", value: counts.contacts, color: "#38bdf8" },
    { label: "Tjänster", value: counts.services, color: "#f59e0b" },
    { label: "Aktiviteter", value: counts.activities, color: "#1db3a7" },
    { label: "Dokumentlänkar", value: counts.documents, color: "#9b59ff" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginBottom: 24 }}>
        {cards.map(card => (
          <div key={card.label} style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 16, padding: "20px 18px" }}>
            <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>{card.label}</p>
            <p style={{ margin: 0, color: card.color, fontSize: 28, fontWeight: 800 }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 16, padding: 24 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700 }}>Kom igång</h2>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#e2e8f0", lineHeight: 1.7 }}>
          <li>Skapa första klienten via <Link href="/crm/clients/new" style={{ color: "#38bdf8", textUnderlineOffset: 2 }}>Ny klient</Link>.</li>
          <li>Hantera klienter i <Link href="/crm/clients" style={{ color: "#38bdf8", textUnderlineOffset: 2 }}>Klientlistan</Link>.</li>
          <li>Följ händelser i <Link href="/crm/activity" style={{ color: "#38bdf8", textUnderlineOffset: 2 }}>Aktivitetsloggen</Link>.</li>
        </ul>
      </div>
    </div>
  );
}

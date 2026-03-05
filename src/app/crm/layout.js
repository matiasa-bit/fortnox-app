import Link from "next/link";
import SyncCrmCustomersButton from "@/app/crm/SyncCrmCustomersButton";

const navItems = [
  { href: "/crm", label: "Dashboard" },
  { href: "/crm/clients", label: "Klienter" },
  { href: "/crm/contacts", label: "Kontakter" },
  { href: "/crm/activity", label: "Aktivitetslogg" },
  { href: "/crm/clients/new", label: "Ny klient" },
  { href: "/crm/mail", label: "Mail" },
];

export default function CrmLayout({ children }) {
  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f1923 0%, #1a2e3b 100%)", color: "#fff", padding: "32px" }}>
      <div style={{ width: "100%" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Internt CRM</h1>
            <p style={{ margin: "4px 0 0", color: "#6b8fa3", fontSize: 14 }}>Klienthantering för redovisningsbyrå</p>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <SyncCrmCustomersButton />
            <Link
              href="/crm/settings"
              title="CRM-inställningar"
              style={{
                background: "#1a2e3b",
                color: "#fff",
                border: "1px solid #2a4a5e",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 16,
                textDecoration: "none",
                lineHeight: 1,
              }}
            >
              ⚙
            </Link>
            <Link
              href="/"
              style={{
                background: "#1a2e3b",
                color: "#fff",
                border: "1px solid #2a4a5e",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Till dashboard
            </Link>
          </div>
        </header>

        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
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
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </main>
  );
}

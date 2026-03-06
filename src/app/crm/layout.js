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

const linkStyle = {
  background: "#0f1419",
  color: "#e2e8f0",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "7px 14px",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: "0.01em",
  transition: "border-color 0.15s ease, color 0.15s ease",
};

export default function CrmLayout({ children }) {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#080c10",
      color: "#f1f5f9",
      padding: "36px 40px",
    }}>
      <div style={{ width: "100%", maxWidth: 1600, margin: "0 auto" }}>

        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 28,
          paddingBottom: 24,
          borderBottom: "1px solid #1e293b",
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "#f1f5f9",
            }}>
              Internt CRM
            </h1>
            <p style={{ margin: "3px 0 0", color: "#475569", fontSize: 13 }}>
              Klienthantering för redovisningsbyrå
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <SyncCrmCustomersButton />
            <Link
              href="/crm/settings"
              title="CRM-inställningar"
              style={{ ...linkStyle, padding: "7px 12px", fontSize: 16, lineHeight: 1 }}
            >
              ⚙
            </Link>
            <Link href="/" style={linkStyle}>
              Till dashboard
            </Link>
          </div>
        </header>

        <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 28 }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} style={{
              ...linkStyle,
              fontWeight: 600,
            }}>
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </main>
  );
}

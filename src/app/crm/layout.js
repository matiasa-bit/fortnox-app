import Link from "next/link";

const navItems = [
  { href: "/crm", label: "Dashboard" },
  { href: "/crm/clients", label: "Klienter" },
  { href: "/crm/activity", label: "Aktivitetslogg" },
  { href: "/crm/clients/new", label: "Ny klient" },
];

export default function CrmLayout({ children }) {
  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f1923 0%, #1a2e3b 100%)", color: "#fff", padding: "24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Internt CRM</h1>
            <p style={{ margin: "4px 0 0", color: "#8fb1c3", fontSize: 13 }}>Klienthantering för redovisningsbyrå</p>
          </div>
          <Link href="/" style={{ color: "#3b9eff", textDecoration: "none", fontSize: 13 }}>Till dashboard</Link>
        </header>

        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                background: "#1a2e3b",
                border: "1px solid #2a4a5e",
                color: "#dbe7ef",
                borderRadius: 10,
                padding: "8px 12px",
                textDecoration: "none",
                fontSize: 13,
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

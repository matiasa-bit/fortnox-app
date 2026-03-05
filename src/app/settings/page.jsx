import Link from "next/link";
import SyncPanel from "./SyncPanel";

export default function SettingsPage() {
  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f1923 0%, #1a2e3b 100%)", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 28 }}>Inställningar</h1>
          <p style={{ color: "#6b8fa3", margin: "6px 0 0", fontSize: 14 }}>
            Hantera appens inställningar och konsultmappning.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", border: "1px solid #2a4a5e", borderRadius: 10, padding: "8px 12px", background: "#1a2e3b" }}>
            Till dashboard
          </Link>
          <Link href="/settings/consultants" style={{ color: "#fff", textDecoration: "none", border: "1px solid #2a4a5e", borderRadius: 10, padding: "8px 12px", background: "#2f7ef7" }}>
            Konsultmappning
          </Link>
          <Link href="/settings/articles" style={{ color: "#fff", textDecoration: "none", border: "1px solid #2a4a5e", borderRadius: 10, padding: "8px 12px", background: "#9b59ff" }}>
            Artikelmappning
          </Link>
        </div>
      </div>

      <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <h2 style={{ color: "#fff", margin: "0 0 12px", fontSize: 18 }}>Inställningsöversikt</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={{ background: "#0f1923", border: "1px solid #2a4a5e", borderRadius: 12, padding: 14 }}>
            <h3 style={{ color: "#fff", margin: "0 0 6px", fontSize: 15 }}>Konsultmappning</h3>
            <p style={{ color: "#6b8fa3", margin: "0 0 10px", fontSize: 13 }}>
              Mappa Fortnox user-id till namn, grupp och kostnadsställe.
            </p>
            <Link
              href="/settings/consultants"
              style={{ display: "inline-block", background: "#2f7ef7", color: "#fff", textDecoration: "none", borderRadius: 9, padding: "7px 11px", fontSize: 13 }}
            >
              Öppna konsultmappning
            </Link>
          </div>

          <div style={{ background: "#0f1923", border: "1px solid #2a4a5e", borderRadius: 12, padding: 14 }}>
            <h3 style={{ color: "#fff", margin: "0 0 6px", fontSize: 15 }}>Synk & datakällor</h3>
            <p style={{ color: "#6b8fa3", margin: "0 0 0", fontSize: 13 }}>
              Hämta och uppdatera data från Fortnox.
            </p>
          </div>

          <div style={{ background: "#0f1923", border: "1px solid #2a4a5e", borderRadius: 12, padding: 14 }}>
            <h3 style={{ color: "#fff", margin: "0 0 6px", fontSize: 15 }}>Artikelgrupper</h3>
            <p style={{ color: "#6b8fa3", margin: "0 0 10px", fontSize: 13 }}>
              Gruppera flera artiklar för egen uppföljning i dashboardens statistik.
            </p>
            <Link
              href="/settings/articles"
              style={{ display: "inline-block", background: "#9b59ff", color: "#fff", textDecoration: "none", borderRadius: 9, padding: "7px 11px", fontSize: 13 }}
            >
              Öppna artikelmappning
            </Link>
          </div>
        </div>
      </section>

      <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <h2 style={{ color: "#fff", margin: "0 0 14px", fontSize: 18 }}>Synk & datakällor</h2>
        <SyncPanel />
      </section>
    </main>
  );
}

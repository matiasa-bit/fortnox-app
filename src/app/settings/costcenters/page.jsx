"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const BTN = (extra) => ({
  padding: "10px 16px",
  borderRadius: 9,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
  color: "#fff",
  ...extra,
});

export default function CostCentersPage() {
  const [rows, setRows] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("aktiva"); // "alla" | "aktiva" | "inaktiva"

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/costcenters", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        setError(data?.error || "Kunde inte hämta kostnadsställen.");
        setRows([]);
      } else {
        setRows(data.rows || []);
        setCostCenters(data.costCenters || []);
      }
    } catch {
      setError("Kunde inte hämta kostnadsställen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function syncCatalog() {
    if (busy) return;
    setBusy(true);
    setStatus("Hämtar kostnadsställekatalog från Fortnox…");
    try {
      const res = await fetch("/api/admin/sync-costcenter-catalog", { method: "POST" });
      const data = await res.json();
      if (data.ok === false) throw new Error(data.error || "okänt fel");
      setStatus(`Katalog importerad! ${data.saved} kostnadsställen hämtade från Fortnox.`);
      await loadRows();
    } catch (err) {
      setStatus(`Fel: ${err?.message || "okänt"}`);
    } finally {
      setBusy(false);
    }
  }

  async function syncCostcenters() {
    if (busy) return;
    setBusy(true);
    setStatus("Hämtar kostnadsställekatalog från Fortnox…");
    try {
      let totalSynced = 0;
      let nextIndex = 0;
      while (nextIndex !== null) {
        const res = await fetch("/api/admin/sync-costcenters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 20, fromIndex: nextIndex }),
        });
        const data = await res.json();
        if (data.ok === false) throw new Error(data.error || "okänt fel");
        totalSynced += Number(data.syncedNow || 0);
        const processed = nextIndex + Number(data.syncedNow || 0) + Number(data.failed || 0);
        const fortnoxInfo = data.fortnoxTotalResources ? ` · Fortnox rapporterar ${data.fortnoxTotalResources} aktiva` : "";
        setStatus(`Hämtar kundkortsdata… kund ${processed} av ${data.total || "?"}${fortnoxInfo}`);
        nextIndex = data.nextIndex ?? null;
      }
      setStatus(`Klart! Gick igenom ${totalSynced} kunder och sparade deras kostnadsställen.`);
      await loadRows();
    } catch (err) {
      setStatus(`Fel: ${err?.message || "okänt"}`);
    } finally {
      setBusy(false);
    }
  }

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      String(r.customer_number || "").toLowerCase().includes(q) ||
      String(r.customer_name || "").toLowerCase().includes(q) ||
      String(r.cost_center || "").toLowerCase().includes(q) ||
      String(r.cost_center_name || "").toLowerCase().includes(q);
    const matchesActive =
      activeFilter === "alla" ||
      (activeFilter === "aktiva" && r.active) ||
      (activeFilter === "inaktiva" && !r.active);
    return matchesSearch && matchesActive;
  });

  // Use cost centers from Fortnox catalog (with real active status), fall back to deriving from rows
  const costCenterSummary = (
    costCenters.length > 0
      ? costCenters.map((cc) => ({ code: cc.code, name: cc.name, ccActive: cc.active }))
      : [...new Map(rows.filter((r) => r.cost_center).map((r) => [r.cost_center, { code: r.cost_center, name: r.cost_center_name }])).values()]
          .map((cc) => ({ ...cc, ccActive: null }))
  ).map((cc) => ({
    ...cc,
    customerCount: rows.filter((r) => r.cost_center === cc.code).length,
  })).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #080c10 0%, #0f1419 100%)", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 28 }}>Kostnadsställen</h1>
          <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 14 }}>
            {rows.length} kunder inlästa · {costCenterSummary.length} unika kostnadsställen
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/settings" style={{ color: "#fff", textDecoration: "none", border: "1px solid #1e293b", borderRadius: 10, padding: "8px 12px", background: "#0f1419" }}>
            Tillbaka till inställningar
          </Link>
          <button
            onClick={syncCatalog}
            disabled={busy}
            style={BTN({ background: "#059669", opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" })}
          >
            {busy ? "Synkar…" : "Importera katalog"}
          </button>
          <button
            onClick={syncCostcenters}
            disabled={busy}
            style={BTN({ background: "#2f7ef7", opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" })}
          >
            {busy ? "Synkar…" : "Sync kundkopplingar"}
          </button>
        </div>
      </div>

      {status && (
        <div style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 14px", marginBottom: 14, color: "#6ee7b7", fontSize: 13 }}>
          {status}
        </div>
      )}

      {/* Summary list */}
      {costCenterSummary.length > 0 && (
        <section style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <h2 style={{ color: "#fff", margin: "0 0 12px", fontSize: 16 }}>Kostnadsställen ({costCenterSummary.length})</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {["Kod", "Namn", "Aktiv i Fortnox", "Antal kunder"].map((h) => (
                  <th key={h} style={{ color: "#64748b", textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costCenterSummary.map((cc) => (
                <tr key={cc.code} style={{ borderBottom: "1px solid #0f1929" }}>
                  <td style={{ padding: "7px 10px" }}>
                    <span style={{ background: "#1e3a5f", color: "#2f7ef7", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>{cc.code}</span>
                  </td>
                  <td style={{ color: "#94a3b8", padding: "7px 10px" }}>{cc.name || "—"}</td>
                  <td style={{ padding: "7px 10px" }}>
                    {cc.ccActive === null
                      ? <span style={{ color: "#475569", fontSize: 12 }}>—</span>
                      : <span style={{ color: cc.ccActive ? "#6ee7b7" : "#f87171", fontSize: 12, fontWeight: 600 }}>{cc.ccActive ? "Ja" : "Nej"}</span>
                    }
                  </td>
                  <td style={{ color: "#64748b", padding: "7px 10px" }}>{cc.customerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Table */}
      <section style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Alla kunder ({filtered.length})</h2>
            <div style={{ display: "flex", gap: 4 }}>
              {[["alla", "Alla"], ["aktiva", "Aktiva"], ["inaktiva", "Inaktiva"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setActiveFilter(val)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #1e293b",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    background: activeFilter === val ? (val === "aktiva" ? "#065f46" : val === "inaktiva" ? "#7f1d1d" : "#1e293b") : "#080c10",
                    color: activeFilter === val ? "#fff" : "#64748b",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            placeholder="Sök kund, kostnadsställe…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "#080c10",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: "7px 12px",
              color: "#fff",
              fontSize: 13,
              width: 240,
              outline: "none",
            }}
          />
        </div>

        {error && <p style={{ color: "#f87171", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}
        {loading && <p style={{ color: "#64748b", fontSize: 13 }}>Laddar…</p>}

        {!loading && !error && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e293b" }}>
                  {["Kundnr", "Kundnamn", "KS-kod", "KS-namn", "Aktiv", "Uppdaterad"].map((h) => (
                    <th key={h} style={{ color: "#64748b", textAlign: "left", padding: "6px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.customer_number} style={{ borderBottom: "1px solid #0f1929" }}>
                    <td style={{ color: "#94a3b8", padding: "7px 10px", whiteSpace: "nowrap" }}>{r.customer_number}</td>
                    <td style={{ color: "#fff", padding: "7px 10px" }}>{r.customer_name || "—"}</td>
                    <td style={{ padding: "7px 10px" }}>
                      {r.cost_center
                        ? <span style={{ background: "#1e3a5f", color: "#2f7ef7", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>{r.cost_center}</span>
                        : <span style={{ color: "#475569" }}>—</span>
                      }
                    </td>
                    <td style={{ color: "#94a3b8", padding: "7px 10px" }}>{r.cost_center_name || "—"}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ color: r.active ? "#6ee7b7" : "#f87171", fontSize: 12 }}>
                        {r.active ? "Ja" : "Nej"}
                      </span>
                    </td>
                    <td style={{ color: "#475569", padding: "7px 10px", whiteSpace: "nowrap", fontSize: 12 }}>
                      {r.updated_at ? new Date(r.updated_at).toLocaleDateString("sv-SE") : "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "#475569", padding: "16px 10px", textAlign: "center" }}>
                      {search ? "Inga träffar." : "Inga kostnadsställen inlästa ännu. Kör Sync kostnadsställen."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CustomersPage() {
  const [rows, setRows] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("aktiva");
  const [ccFilter, setCcFilter] = useState("");
  const [specificInput, setSpecificInput] = useState("");
  const [specificBusy, setSpecificBusy] = useState(false);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/costcenters", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        setError(data?.error || "Kunde inte hämta kunder.");
        setRows([]);
      } else {
        setRows(data.rows || []);
        setCostCenters(data.costCenters || []);
      }
    } catch {
      setError("Kunde inte hämta kunder.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRows(); }, []);

  async function syncCustomers() {
    if (busy) return;
    setBusy(true);
    setStatus("Hämtar alla kunder från Fortnox…");
    try {
      const res = await fetch("/api/admin/sync-customer-list", { method: "POST" });
      const data = await res.json();
      if (data.ok === false) throw new Error(data.error || "okänt fel");
      const ccInfo = data.costCentersSaved ? ` · ${data.costCentersSaved} kostnadsställen synkade.` : "";
      setStatus(`Klart! ${data.total} kunder synkade — ${data.active} aktiva, ${data.inactive} inaktiva.${ccInfo}`);
      await loadRows();
    } catch (err) {
      setStatus(`Fel: ${err?.message || "okänt"}`);
    } finally {
      setBusy(false);
    }
  }

  async function syncSpecific() {
    if (specificBusy) return;
    const numbers = specificInput.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (numbers.length === 0) return;
    setSpecificBusy(true);
    setStatus(`Synkar kundkort för ${numbers.length} kunder…`);
    try {
      const res = await fetch("/api/admin/sync-specific-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerNumbers: numbers }),
      });
      const data = await res.json();
      if (data.ok === false) throw new Error(data.error || "okänt fel");
      const failInfo = data.failed > 0 ? ` · ${data.failed} misslyckades (${data.failedNumbers?.join(", ")})` : "";
      const results = (data.results || []).map(r => `${r.customer_number}: KS ${r.cost_center || "–"}`).join(" · ");
      setStatus(`Klart! ${data.synced} kunder uppdaterade.${failInfo}${results ? ` · ${results}` : ""}`);
      setSpecificInput("");
      await loadRows();
    } catch (err) {
      setStatus(`Fel: ${err?.message || "okänt"}`);
    } finally {
      setSpecificBusy(false);
    }
  }

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      String(r.customer_number || "").toLowerCase().includes(q) ||
      String(r.customer_name || "").toLowerCase().includes(q);
    const matchesActive =
      activeFilter === "alla" ||
      (activeFilter === "aktiva" && r.active) ||
      (activeFilter === "inaktiva" && !r.active);
    const matchesCc =
      !ccFilter ||
      (ccFilter === "__ingen__" ? !r.cost_center : r.cost_center === ccFilter);
    return matchesSearch && matchesActive && matchesCc;
  });

  const totalActive = rows.filter(r => r.active).length;
  const totalInactive = rows.filter(r => !r.active).length;

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #080c10 0%, #0f1419 100%)", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 28 }}>Kunder</h1>
          <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 14 }}>
            {rows.length} kunder totalt · {totalActive} aktiva · {totalInactive} inaktiva
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/settings" style={{ color: "#fff", textDecoration: "none", border: "1px solid #1e293b", borderRadius: 10, padding: "8px 12px", background: "#0f1419" }}>
            Tillbaka
          </Link>
          <button
            onClick={syncCustomers}
            disabled={busy}
            style={{ padding: "10px 16px", borderRadius: 9, border: "none", cursor: busy ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14, color: "#fff", background: "#2f7ef7", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Synkar…" : "Sync kunder från Fortnox"}
          </button>
        </div>
      </div>

      {status && (
        <div style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 10, padding: "10px 14px", marginBottom: 14, color: "#6ee7b7", fontSize: 13 }}>
          {status}
        </div>
      )}

      <section style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: "#94a3b8", fontSize: 13, whiteSpace: "nowrap" }}>Uppdatera specifika kunder:</span>
        <input
          type="text"
          placeholder="t.ex. 1234, 5678"
          value={specificInput}
          onChange={(e) => setSpecificInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && syncSpecific()}
          style={{ flex: 1, minWidth: 180, background: "#080c10", border: "1px solid #1e293b", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 13, outline: "none" }}
        />
        <button
          onClick={syncSpecific}
          disabled={specificBusy || !specificInput.trim()}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: (specificBusy || !specificInput.trim()) ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13, color: "#fff", background: "#059669", opacity: (specificBusy || !specificInput.trim()) ? 0.5 : 1, whiteSpace: "nowrap" }}
        >
          {specificBusy ? "Synkar…" : "Hämta kundkort"}
        </button>
      </section>

      <section style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Alla kunder ({filtered.length})</h2>
            <div style={{ display: "flex", gap: 4 }}>
              {[["alla", "Alla"], ["aktiva", "Aktiva"], ["inaktiva", "Inaktiva"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setActiveFilter(val)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: activeFilter === val ? (val === "aktiva" ? "#065f46" : val === "inaktiva" ? "#7f1d1d" : "#1e293b") : "#080c10",
                    color: activeFilter === val ? "#fff" : "#64748b",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={ccFilter}
              onChange={(e) => setCcFilter(e.target.value)}
              style={{ background: "#080c10", border: "1px solid #1e293b", borderRadius: 8, padding: "7px 12px", color: ccFilter ? "#fff" : "#64748b", fontSize: 13, outline: "none", cursor: "pointer" }}
            >
              <option value="">Alla kostnadsställen</option>
              <option value="__ingen__">Utan kostnadsställe</option>
              {costCenters.map(cc => (
                <option key={cc.code} value={cc.code}>{cc.code}{cc.name ? ` – ${cc.name}` : ""}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Sök kundnr, namn…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: "#080c10", border: "1px solid #1e293b", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 13, width: 200, outline: "none" }}
            />
          </div>
        </div>

        {error && <p style={{ color: "#f87171", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}
        {loading && <p style={{ color: "#64748b", fontSize: 13 }}>Laddar…</p>}

        {!loading && !error && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e293b" }}>
                  {["Kundnr", "Kundnamn", "Status", "Kostnadsställe", "Uppdaterad"].map(h => (
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
                      <span style={{ color: r.active ? "#6ee7b7" : "#f87171", fontSize: 12, fontWeight: 600 }}>{r.active ? "Aktiv" : "Inaktiv"}</span>
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      {r.cost_center
                        ? <span style={{ background: "#1e3a5f", color: "#2f7ef7", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>{r.cost_center}</span>
                        : <span style={{ color: "#475569" }}>—</span>}
                    </td>
                    <td style={{ color: "#475569", padding: "7px 10px", whiteSpace: "nowrap", fontSize: 12 }}>
                      {r.updated_at ? new Date(r.updated_at).toLocaleDateString("sv-SE") : "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} style={{ color: "#475569", padding: "16px 10px", textAlign: "center" }}>
                    {rows.length === 0 ? "Inga kunder synkade ännu. Klicka på \"Sync kunder från Fortnox\"." : "Inga träffar."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

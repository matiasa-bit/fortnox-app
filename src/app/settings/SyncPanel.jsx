"use client";
import { useState } from "react";

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

export default function SyncPanel() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => ({}));
  }

  async function run(label, fn) {
    if (busy) return;
    setBusy(true);
    setStatus(`${label} startar…`);
    try {
      await fn();
    } catch (err) {
      setStatus(`Fel: ${err?.message || "okänt"}`);
    } finally {
      setBusy(false);
    }
  }

  async function syncInvoices() {
    await run("Sync fakturor", async () => {
      const data = await post("/api/admin/sync-invoices", { fromDate: "2025-01-01" });
      if (data.ok === false) throw new Error(data.error || "okänt fel");
      setStatus(`Fakturor synkade! Sparade: ${data.saved}`);
    });
  }

  async function syncTime() {
    await run("Sync tid", async () => {
      const data = await post("/api/admin/sync-time-reports", { maxPages: 100, fromDate: "2025-01-01" });
      if (data.ok === false) throw new Error(data.error || "okänt fel");
      setStatus(`Tidsredovisning synkad. Sparade: ${data.saved || 0}`);
    });
  }

  async function syncArticleRegistry() {
    await run("Sync artikelregister", async () => {
      const data = await post("/api/admin/sync-article-registry", { maxPages: 200 });
      if (data.ok === false) throw new Error(data.error || "okänt fel");
      setStatus(`Artikelregister synkat. Sparade: ${data.saved || 0}`);
    });
  }

  async function syncContracts() {
    await run("Sync kundavtal", async () => {
      const data = await post("/api/admin/sync-contract-accruals", { maxPages: 50 });
      if (data.ok === false) throw new Error(data.error || "okänt fel");
      setStatus(`Kundavtal synkade. Sparade: ${data.saved || 0}`);
    });
  }

  async function syncAllArticleRows(force = false) {
    if (force && !window.confirm("Tvingar omsynk av ALLA fakturors artikelrader från Fortnox. Kan ta lång tid. Fortsätta?")) return;
    await run(force ? "Force omsynk artikelrader" : "Synka alla artikelrader", async () => {
      const fromDate = "2025-01-01";
      let rounds = 0;
      let totalSynced = 0;
      const maxRounds = force ? 200 : 100;
      while (rounds < maxRounds) {
        rounds += 1;
        const data = await post("/api/admin/sync-invoice-rows", { batchSize: 50, fromDate, ...(force ? { forceResync: true } : {}) });
        if (data.ok === false) throw new Error(data.error || "okänt fel");
        const syncedNow = Number(data.syncedNow || 0);
        const remaining = Number(data.remaining || 0);
        totalSynced += syncedNow;
        setStatus(`${force ? "Force-synk" : "Synk"} runda ${rounds}: ${totalSynced} fakturor klara, kvar ${remaining}`);
        if (syncedNow === 0 || remaining === 0) break;
      }
      setStatus(`${force ? "Force-synk klar" : "Klar"}! Totalt synkade ${totalSynced} fakturars artikelrader.`);
    });
  }

  async function syncCostcenters() {
    await run("Sync kostnadsställen", async () => {
      const data = await post("/api/admin/sync-costcenters", { batchSize: 20 });
      if (data.ok === false) throw new Error(data.error || "okänt fel");
      setStatus(`Kostnadsställen synkade. Uppdaterade: ${data.syncedNow || 0}, kvar: ${data.remaining || 0}`);
    });
  }

  async function fullSync() {
    await run("Full sync alla moduler", async () => {
      setStatus("Synkar fakturor…");
      await post("/api/admin/sync-invoices", { fromDate: "2025-01-01" });

      setStatus("Synkar tidsredovisning…");
      await post("/api/admin/sync-time-reports", { fromDate: "2025-01-01", maxPages: 100 });

      setStatus("Synkar artikelregister…");
      await post("/api/admin/sync-article-registry", { maxPages: 200 });

      setStatus("Synkar kundavtal…");
      await post("/api/admin/sync-contract-accruals", { maxPages: 50 });

      setStatus("Synkar kostnadsställen…");
      await post("/api/admin/sync-costcenters", { batchSize: 20 });

      setStatus("Synkar artikelrader (flera rundor)…");
      let rounds = 0;
      let totalSynced = 0;
      while (rounds < 50) {
        rounds += 1;
        const data = await post("/api/admin/sync-invoice-rows", { batchSize: 50, fromDate: "2025-01-01" });
        const syncedNow = Number(data.syncedNow || 0);
        totalSynced += syncedNow;
        if (syncedNow === 0 || Number(data.remaining || 0) === 0) break;
      }

      setStatus(`Full sync klar! Artikelrader synkade: ${totalSynced}`);
    });
  }

  const buttons = [
    { label: "Full sync alla moduler", color: "#f59e0b", textColor: "#0f1923", onClick: fullSync },
    { label: "Sync fakturor", color: "#2563eb", onClick: syncInvoices },
    { label: "Sync tid", color: "#1db3a7", onClick: syncTime },
    { label: "Sync artikelregister", color: "#9b59ff", onClick: syncArticleRegistry },
    { label: "Sync kundavtal", color: "#8a6f42", onClick: syncContracts },
    { label: "Synka alla artikelrader", color: "#059669", onClick: () => syncAllArticleRows(false) },
    { label: "Force omsynk artikelrader", color: "#b45309", onClick: () => syncAllArticleRows(true) },
    { label: "Sync kostnadsställen", color: "#2f7ef7", onClick: syncCostcenters },
  ];

  return (
    <div style={{ background: "#0f1923", border: "1px solid #2a4a5e", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: status ? 14 : 0 }}>
        {buttons.map(({ label, color, textColor, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={busy}
            style={BTN({ background: color, color: textColor || "#fff", opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" })}
          >
            {label}
          </button>
        ))}
      </div>
      {status && (
        <p style={{ margin: 0, color: "#6ee7b7", fontSize: 13 }}>{status}</p>
      )}
    </div>
  );
}

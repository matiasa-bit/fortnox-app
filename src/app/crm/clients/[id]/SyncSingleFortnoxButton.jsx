"use client";

import { useState } from "react";

export default function SyncSingleFortnoxButton({ clientId }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function runSync() {
    if (!clientId || loading) return;

    setLoading(true);
    setStatus("Hamta kund fran Fortnox...");

    try {
      const res = await fetch("/api/admin/sync-crm-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      setStatus("Klar. Kundkortet uppdateras...");
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setStatus(`Sync misslyckades: ${error?.message || "okant fel"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button
        type="button"
        onClick={runSync}
        disabled={loading}
        style={{
          background: loading ? "#5a6f82" : "#1db3a7",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Synkar kund..." : "Synka denna kund (Fortnox)"}
      </button>
      {status ? <span style={{ color: "#8fb1c3", fontSize: 12 }}>{status}</span> : null}
    </div>
  );
}

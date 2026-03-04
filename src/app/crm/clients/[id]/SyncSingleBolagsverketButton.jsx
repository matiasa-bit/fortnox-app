"use client";

import { useState } from "react";

export default function SyncSingleBolagsverketButton({ clientId }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function handleClick() {
    if (!clientId || loading) return;

    setLoading(true);
    setStatus("Hamtar bolagsdata...");

    try {
      const res = await fetch("/api/admin/sync-bolagsverket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      const row = Array.isArray(payload?.rows) ? payload.rows[0] : null;
      if (row?.ok) {
        setStatus("Klar. Kundkortet uppdateras...");
        setTimeout(() => window.location.reload(), 700);
      } else {
        setStatus(`Kunde inte uppdatera: ${row?.error || "okant fel"}`);
      }
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
        onClick={handleClick}
        disabled={loading}
        style={{
          background: loading ? "#5a6f82" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Synkar bolag..." : "Hamta bolagsdata"}
      </button>
      {status ? <span style={{ color: "#8fb1c3", fontSize: 12 }}>{status}</span> : null}
    </div>
  );
}

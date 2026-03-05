"use client";

import { useState, useEffect } from "react";

function formatSyncTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("sv-SE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

export default function SyncCrmCustomersButton() {
  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [syncingBolagsverket, setSyncingBolagsverket] = useState(false);
  const [status, setStatus] = useState("");
  const [lastSync, setLastSync] = useState({ crm: null, contacts: null, bolagsverket: null });

  useEffect(() => {
    fetch("/api/crm/sync-status")
      .then(r => r.json())
      .then(d => {
        if (d?.ok) {
          setLastSync({
            crm: formatSyncTime(d.last_crm_sync),
            contacts: formatSyncTime(d.last_contact_sync),
            bolagsverket: formatSyncTime(d.last_bolagsverket_sync),
          });
        }
      })
      .catch(() => {});
  }, []);

  async function refreshSyncStatus() {
    try {
      const d = await fetch("/api/crm/sync-status").then(r => r.json());
      if (d?.ok) {
        setLastSync({
          crm: formatSyncTime(d.last_crm_sync),
          contacts: formatSyncTime(d.last_contact_sync),
          bolagsverket: formatSyncTime(d.last_bolagsverket_sync),
        });
      }
    } catch {
    }
  }

  async function runContactSync() {
    if (syncingCustomers || syncingContacts || syncingBolagsverket) return;

    setSyncingContacts(true);
    setStatus("Startar kontakt-sync...");

    try {
      const res = await fetch("/api/admin/sync-fortnox-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      setStatus(`Klar. Synkade ${payload?.synced || 0} kontakter.`);
      await refreshSyncStatus();
      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      setStatus(`Kontakt-sync misslyckades: ${error?.message || "okänt fel"}`);
    } finally {
      setSyncingContacts(false);
    }
  }

  async function runSync() {
    if (syncingCustomers || syncingBolagsverket) return;

    setSyncingCustomers(true);
    setStatus("Startar CRM-sync...");

    let fetched = 0;
    let upserted = 0;

    async function syncWithFilter(filter) {
      let nextPage = 1;
      let maxGuard = 20;
      while (nextPage && maxGuard > 0) {
        maxGuard -= 1;
        setStatus(`Synkar ${filter === "active" ? "aktiva" : "inaktiva"} kunder, sida ${nextPage}...`);
        const res = await fetch("/api/admin/sync-crm-clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromPage: nextPage, maxPages: 1, maxDetailLookups: 0, fortnoxFilter: filter }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        fetched += Number(payload?.fetched || 0);
        upserted += Number(payload?.upserted || 0);
        nextPage = Number(payload?.nextPage || 0) || 0;
        if (payload?.warning) {
          setStatus(`Delvis klar: ${payload.warning}`);
          return;
        }
      }
    }

    try {
      await syncWithFilter("inactive");
      await syncWithFilter("active");

      setStatus(`Klar. Hämtade ${fetched} och uppdaterade ${upserted} kunder.`);
      await refreshSyncStatus();
      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      setStatus(`Sync misslyckades: ${error?.message || "okänt fel"}`);
    } finally {
      setSyncingCustomers(false);
    }
  }

  async function runBolagsverketSync() {
    if (syncingCustomers || syncingBolagsverket) return;

    setSyncingBolagsverket(true);
    setStatus("Startar Bolagsverket-sync...");

    let offset = 0;
    const limit = 25;
    let maxGuard = 80;
    let synced = 0;
    let failed = 0;
    let skipped = 0;

    try {
      while (maxGuard > 0) {
        maxGuard -= 1;
        setStatus(`Synkar bolagsdata (${offset + 1}-${offset + limit})...`);

        const res = await fetch("/api/admin/sync-bolagsverket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }

        synced += Number(payload?.synced || 0);
        failed += Number(payload?.failed || 0);
        skipped += Number(payload?.skipped || 0);

        const totalProcessed = Number(payload?.totalProcessed || 0);
        if (totalProcessed < limit) break;
        offset += limit;
      }

      setStatus(`Bolagsverket klart. Synkade ${synced}, fel ${failed}, hoppade over ${skipped}.`);
      await refreshSyncStatus();
      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      setStatus(`Bolagsverket-sync misslyckades: ${error?.message || "okänt fel"}`);
    } finally {
      setSyncingBolagsverket(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={runSync}
          disabled={syncingCustomers || syncingContacts || syncingBolagsverket}
          style={{
            background: syncingCustomers ? "#5a6f82" : "#1db3a7",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 14,
            fontWeight: 700,
            cursor: syncingCustomers || syncingContacts || syncingBolagsverket ? "not-allowed" : "pointer",
          }}
        >
          {syncingCustomers ? "Synkar kunder..." : "Synka kunder från Fortnox"}
        </button>
        <button
          type="button"
          onClick={runContactSync}
          disabled={syncingCustomers || syncingContacts || syncingBolagsverket}
          style={{
            background: syncingContacts ? "#5a6f82" : "#0ea5e9",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 14,
            fontWeight: 700,
            cursor: syncingCustomers || syncingContacts || syncingBolagsverket ? "not-allowed" : "pointer",
          }}
        >
          {syncingContacts ? "Synkar kontakter..." : "Synka kontakter från Fortnox"}
        </button>
        <button
          type="button"
          onClick={runBolagsverketSync}
          disabled={syncingCustomers || syncingContacts || syncingBolagsverket}
          style={{
            background: syncingBolagsverket ? "#5a6f82" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 14,
            fontWeight: 700,
            cursor: syncingCustomers || syncingContacts || syncingBolagsverket ? "not-allowed" : "pointer",
          }}
        >
          {syncingBolagsverket ? "Synkar bolagsdata..." : "Synka bolagsdata"}
        </button>
      </div>
      {(lastSync.crm || lastSync.contacts || lastSync.bolagsverket) && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {lastSync.crm && (
            <span style={{ color: "#8fb1c3", fontSize: 11 }}>Kunder: {lastSync.crm}</span>
          )}
          {lastSync.contacts && (
            <span style={{ color: "#8fb1c3", fontSize: 11 }}>Kontakter: {lastSync.contacts}</span>
          )}
          {lastSync.bolagsverket && (
            <span style={{ color: "#8fb1c3", fontSize: 11 }}>Bolagsdata: {lastSync.bolagsverket}</span>
          )}
        </div>
      )}
      {status && <span style={{ color: "#8fb1c3", fontSize: 12 }}>{status}</span>}
    </div>
  );
}

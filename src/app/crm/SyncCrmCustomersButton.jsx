"use client";

import { useState } from "react";

export default function SyncCrmCustomersButton() {
  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [syncingBolagsverket, setSyncingBolagsverket] = useState(false);
  const [status, setStatus] = useState("");
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

    let nextPage = 1;
    let fetched = 0;
    let upserted = 0;
    let maxGuard = 20;

    try {
      while (nextPage && maxGuard > 0) {
        maxGuard -= 1;
        setStatus(`Synkar sida ${nextPage}...`);

        const res = await fetch("/api/admin/sync-crm-clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromPage: nextPage,
            maxPages: 1,
            maxDetailLookups: 1000,
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }

        const fetchedBatch = Number(payload?.fetched || 0);
        const upsertedBatch = Number(payload?.upserted || 0);
        fetched += fetchedBatch;
        upserted += upsertedBatch;
        nextPage = Number(payload?.nextPage || 0) || 0;

        const activeCount = Number(payload?.fortnoxActive || 0);
        const inactiveCount = Number(payload?.fortnoxInactive || 0);
        const unknownCount = Number(payload?.fortnoxUnknown || 0);
        const detailLookups = Number(payload?.detailLookups || 0);
        const unresolvedAfterLookup = Number(payload?.detailStatusesStillUnknown || 0);
        setStatus(
          `Sida ${Number(payload?.fromPage || nextPage || 0)} klar: ${fetchedBatch} hämtade, ${upsertedBatch} sparade, ` +
          `status A:${activeCount} I:${inactiveCount} O:${unknownCount}, detaljuppslag ${detailLookups}, okända kvar ${unresolvedAfterLookup}.`
        );

        if (payload?.warning) {
          setStatus(`Delvis klar: ${payload.warning}`);
          break;
        }
      }

      setStatus(`Klar. Hämtade ${fetched} och uppdaterade ${upserted} kunder.`);
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
      {status && <span style={{ color: "#8fb1c3", fontSize: 12 }}>{status}</span>}
    </div>
  );
}

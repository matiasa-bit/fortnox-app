"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function normalizeText(value) {
  return String(value || "").trim();
}

function isRemovedGroup(value) {
  return normalizeText(value).toLowerCase() === "borttagen";
}

export default function ConsultantsSettingsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/admin/employee-mappings", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        setError(data?.error || "Kunde inte läsa user-mappning.");
        setRows([]);
      } else {
        setRows(Array.isArray(data?.rows) ? data.rows : []);
      }
    } catch (err) {
      setError("Kunde inte läsa user-mappning.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aIsRemoved = isRemovedGroup(a.group_name);
      const bIsRemoved = isRemovedGroup(b.group_name);

      if (aIsRemoved !== bIsRemoved) {
        return aIsRemoved ? 1 : -1;
      }

      const left = normalizeText(a.employee_name) || normalizeText(a.employee_id);
      const right = normalizeText(b.employee_name) || normalizeText(b.employee_id);
      return left.localeCompare(right, "sv-SE", { numeric: true });
    });
  }, [rows]);

  function updateRow(employeeId, key, value) {
    setRows(prev => prev.map(row => {
      if (row.employee_id !== employeeId) return row;
      return { ...row, [key]: value };
    }));
  }

  function addEmptyRow() {
    const timestamp = Date.now();
    setRows(prev => [
      ...prev,
      {
        employee_id: `new-${timestamp}`,
        employee_name: "",
        group_name: "",
        cost_center: "",
        active: true,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");

    const payloadRows = rows
      .map(row => ({
        employee_id: normalizeText(row.employee_id),
        employee_name: normalizeText(row.employee_name),
        group_name: normalizeText(row.group_name),
        cost_center: normalizeText(row.cost_center),
        active: row.active === false ? false : true,
      }))
      .filter(row => row.employee_id);

    try {
      const res = await fetch("/api/admin/employee-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows }),
      });
      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        setError(data?.error || "Kunde inte spara user-mappning.");
      } else {
        setMessage(`Sparat: ${data.saved || payloadRows.length} rader`);
        await loadRows();
      }
    } catch (err) {
      setError("Kunde inte spara user-mappning.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f1923 0%, #1a2e3b 100%)", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 28 }}>Konsultmappning</h1>
          <p style={{ color: "#6b8fa3", margin: "6px 0 0", fontSize: 14 }}>
            Mappa Fortnox user-id till namn, grupp och kostnadsställe.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/settings" style={{ color: "#fff", textDecoration: "none", border: "1px solid #2a4a5e", borderRadius: 10, padding: "8px 12px", background: "#1a2e3b" }}>
            Till inställningar
          </Link>
          <Link href="/settings/articles" style={{ color: "#fff", textDecoration: "none", border: "1px solid #2a4a5e", borderRadius: 10, padding: "8px 12px", background: "#9b59ff" }}>
            Artikelmappning
          </Link>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", border: "1px solid #2a4a5e", borderRadius: 10, padding: "8px 12px", background: "#1a2e3b" }}>
            Till dashboard
          </Link>
          <button
            onClick={addEmptyRow}
            style={{ background: "#2f7ef7", color: "#fff", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
          >
            Lägg till rad
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            style={{ background: "#00c97a", color: "#fff", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
          >
            {saving ? "Sparar..." : "Spara"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#ff6b6b22", border: "1px solid #ff6b6b", borderRadius: 10, padding: 12, color: "#ff8a8a", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {message && (
        <div style={{ background: "#00c97a22", border: "1px solid #00c97a", borderRadius: 10, padding: 12, color: "#8ff0c5", marginBottom: 12 }}>
          {message}
        </div>
      )}

      <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 20 }}>
        {loading ? (
          <p style={{ color: "#6b8fa3", margin: 0 }}>Laddar...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2a4a5e" }}>
                  <th style={{ color: "#6b8fa3", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase" }}>User ID</th>
                  <th style={{ color: "#6b8fa3", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase" }}>Namn</th>
                  <th style={{ color: "#6b8fa3", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase" }}>Grupp</th>
                  <th style={{ color: "#6b8fa3", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase" }}>Kostnadsställe</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(row => {
                  const rowIsRemoved = isRemovedGroup(row.group_name);
                  return (
                  <tr key={row.employee_id} style={{ borderBottom: "1px solid #1e3545", opacity: rowIsRemoved ? 0.72 : 1 }}>
                    <td style={{ padding: "10px" }}>
                      <input
                        value={row.employee_id || ""}
                        onChange={e => updateRow(row.employee_id, "employee_id", e.target.value)}
                        style={{ width: "100%", background: "#0f1923", color: rowIsRemoved ? "#6b8fa3" : "#fff", border: "1px solid #2a4a5e", borderRadius: 8, padding: "8px 10px" }}
                      />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <input
                        value={row.employee_name || ""}
                        onChange={e => updateRow(row.employee_id, "employee_name", e.target.value)}
                        style={{ width: "100%", background: "#0f1923", color: rowIsRemoved ? "#6b8fa3" : "#fff", border: "1px solid #2a4a5e", borderRadius: 8, padding: "8px 10px" }}
                      />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <input
                        value={row.group_name || ""}
                        onChange={e => updateRow(row.employee_id, "group_name", e.target.value)}
                        style={{ width: "100%", background: "#0f1923", color: rowIsRemoved ? "#6b8fa3" : "#fff", border: "1px solid #2a4a5e", borderRadius: 8, padding: "8px 10px" }}
                      />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <input
                        value={row.cost_center || ""}
                        onChange={e => updateRow(row.employee_id, "cost_center", e.target.value)}
                        placeholder="t.ex. -4"
                        style={{ width: "100%", background: "#0f1923", color: rowIsRemoved ? "#6b8fa3" : "#fff", border: "1px solid #2a4a5e", borderRadius: 8, padding: "8px 10px" }}
                      />
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

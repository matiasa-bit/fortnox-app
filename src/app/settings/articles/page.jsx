"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function normalizeText(value) {
  return String(value || "").trim();
}

export default function ArticleMappingSettingsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedArticles, setSelectedArticles] = useState(new Set());
  const [bulkGroupName, setBulkGroupName] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/admin/article-group-mappings", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        setError(data?.error || "Kunde inte läsa artikelmappning.");
        setRows([]);
        setSelectedArticles(new Set());
      } else {
        setRows(Array.isArray(data?.rows) ? data.rows : []);
        setSelectedArticles(new Set());
      }
    } catch (err) {
      setError("Kunde inte läsa artikelmappning.");
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
      const left = normalizeText(a.group_name) || normalizeText(a.article_number);
      const right = normalizeText(b.group_name) || normalizeText(b.article_number);
      return left.localeCompare(right, "sv-SE", { numeric: true });
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = normalizeText(search).toLowerCase();
    if (!term) return sortedRows;

    return sortedRows.filter(row => {
      const number = normalizeText(row.article_number).toLowerCase();
      const name = normalizeText(row.article_name).toLowerCase();
      const group = normalizeText(row.group_name).toLowerCase();
      return number.includes(term) || name.includes(term) || group.includes(term);
    });
  }, [sortedRows, search]);

  function updateRow(articleNumber, key, value) {
    setRows(prev => prev.map(row => {
      if (row.article_number !== articleNumber) return row;
      return { ...row, [key]: value };
    }));
  }

  function toggleSelected(articleNumber) {
    const number = normalizeText(articleNumber);
    if (!number) return;

    setSelectedArticles(prev => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const visibleNumbers = filteredRows
      .map(row => normalizeText(row.article_number))
      .filter(Boolean);

    if (visibleNumbers.length === 0) return;

    const allVisibleSelected = visibleNumbers.every(number => selectedArticles.has(number));

    setSelectedArticles(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleNumbers.forEach(number => next.delete(number));
      } else {
        visibleNumbers.forEach(number => next.add(number));
      }
      return next;
    });
  }

  function applyBulkGroup() {
    const groupName = normalizeText(bulkGroupName);
    if (!groupName) {
      setError("Ange ett gruppnamn för massuppdatering.");
      return;
    }

    if (selectedArticles.size === 0) {
      setError("Välj minst en artikel att uppdatera.");
      return;
    }

    setError("");
    setRows(prev => prev.map(row => {
      const articleNumber = normalizeText(row.article_number);
      if (!selectedArticles.has(articleNumber)) return row;
      return { ...row, group_name: groupName };
    }));

    setMessage(`Uppdaterade grupp till "${groupName}" för ${selectedArticles.size} artiklar. Klicka på Spara för att skriva till databasen.`);
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");

    const payloadRows = rows
      .map(row => ({
        article_number: normalizeText(row.article_number),
        article_name: normalizeText(row.article_name),
        group_name: normalizeText(row.group_name),
        active: row.active === false ? false : true,
      }))
      .filter(row => row.article_number && row.group_name);

    try {
      const res = await fetch("/api/admin/article-group-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows }),
      });
      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        setError(data?.error || "Kunde inte spara artikelmappning.");
      } else {
        setMessage(`Sparat: ${data.saved || payloadRows.length} rader`);
        await loadRows();
      }
    } catch (err) {
      setError("Kunde inte spara artikelmappning.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #080c10 0%, #0f1419 100%)", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: "#fff", margin: 0, fontSize: 28 }}>Artikelmappning</h1>
          <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 14 }}>
            Gruppera alla artiklar till egna rapportgrupper för statistik i dashboarden.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/settings" style={{ color: "#fff", textDecoration: "none", border: "1px solid #1e293b", borderRadius: 10, padding: "8px 12px", background: "#0f1419" }}>
            Till inställningar
          </Link>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", border: "1px solid #1e293b", borderRadius: 10, padding: "8px 12px", background: "#0f1419" }}>
            Till dashboard
          </Link>
          <button
            onClick={save}
            disabled={saving || loading}
            style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}
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
        <div style={{ background: "#f59e0b22", border: "1px solid #f59e0b", borderRadius: 10, padding: 12, color: "#8ff0c5", marginBottom: 12 }}>
          {message}
        </div>
      )}

      <section style={{ background: "#0f1419", border: "1px solid #1e293b", borderRadius: 14, padding: 20 }}>
        {loading ? (
          <p style={{ color: "#64748b", margin: 0 }}>Laddar...</p>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Sök artikelnummer, namn eller grupp"
                  style={{ width: "min(460px, 100%)", background: "#080c10", color: "#fff", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px" }}
                />
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  style={{ background: "#0f1419", color: "#fff", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 12 }}
                >
                  Markera alla synliga
                </button>
              </div>
              <div style={{ color: "#64748b", fontSize: 12 }}>
                Visar {filteredRows.length} av {sortedRows.length} artiklar · Markerade: {selectedArticles.size}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <input
                value={bulkGroupName}
                onChange={(e) => setBulkGroupName(e.target.value)}
                placeholder="Massuppdatera grupp, t.ex. Lön"
                style={{ width: "min(320px, 100%)", background: "#080c10", color: "#fff", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px" }}
              />
              <button
                type="button"
                onClick={applyBulkGroup}
                style={{ background: "#9b59ff", color: "#fff", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 12 }}
              >
                Applicera på markerade
              </button>
            </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e293b" }}>
                  <th style={{ color: "#64748b", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase", width: 34 }}>✓</th>
                  <th style={{ color: "#64748b", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase" }}>Artikelnr</th>
                  <th style={{ color: "#64748b", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase" }}>Artikelnamn</th>
                  <th style={{ color: "#64748b", textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase" }}>Rapportgrupp</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.article_number} style={{ borderBottom: "1px solid #141c24" }}>
                    <td style={{ padding: "10px" }}>
                      <input
                        type="checkbox"
                        checked={selectedArticles.has(normalizeText(row.article_number))}
                        onChange={() => toggleSelected(row.article_number)}
                      />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <input
                        value={row.article_number || ""}
                        onChange={e => updateRow(row.article_number, "article_number", e.target.value)}
                        style={{ width: "100%", background: "#080c10", color: "#fff", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px" }}
                      />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <input
                        value={row.article_name || ""}
                        onChange={e => updateRow(row.article_number, "article_name", e.target.value)}
                        style={{ width: "100%", background: "#080c10", color: "#fff", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px" }}
                      />
                    </td>
                    <td style={{ padding: "10px" }}>
                      <input
                        value={row.group_name || ""}
                        onChange={e => updateRow(row.article_number, "group_name", e.target.value)}
                        placeholder="t.ex. Lön, Bokslut, Rådgivning"
                        style={{ width: "100%", background: "#080c10", color: "#fff", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </main>
  );
}

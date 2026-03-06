"use client";

import { useState, useEffect, useMemo } from "react";

const cardStyle = { background: "#0f1419", border: "1px solid #1e293b", borderRadius: 14, padding: 20 };
const inputStyle = {
  width: "100%",
  background: "#080c10",
  color: "#fff",
  border: "1px solid #1e293b",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 13,
  boxSizing: "border-box",
};
const labelStyle = { color: "#8fb1c3", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 };

const TEMPLATES = [
  { id: "newsletter", label: "Nyhetsbrev", description: "HTML-mail med logotyp, rubrik och footer" },
  { id: "simple", label: "Enkelt textmail", description: "Rent textmail med hälsning och signatur" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Aktiva kunder (Fortnox)" },
  { value: "inactive", label: "Inaktiva kunder (Fortnox)" },
  { value: "all", label: "Alla kunder" },
];

export default function MailComposerPage() {
  const [statusFilter, setStatusFilter] = useState("active");
  const [consultantFilter, setConsultantFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [consultants, setConsultants] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [templateId, setTemplateId] = useState("newsletter");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Load consultants and tags once
  useEffect(() => {
    fetch("/api/crm/consultants")
      .then(r => r.json())
      .then(d => setConsultants(d?.consultants || []))
      .catch(() => {});
    fetch("/api/crm/tags")
      .then(r => r.json())
      .then(d => setAllTags(d?.tags || []))
      .catch(() => {});
  }, []);

  // Load recipients when filter changes
  useEffect(() => {
    let cancelled = false;
    setLoadingRecipients(true);
    setRecipients([]);
    setSelectedIds(new Set());
    setResult(null);

    const params = new URLSearchParams({ status: statusFilter });
    if (consultantFilter) params.set("consultant", consultantFilter);
    if (tagFilter) params.set("tag", tagFilter);

    fetch(`/api/crm/mail/recipients?${params}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          const list = d?.recipients || [];
          setRecipients(list);
          setSelectedIds(new Set(list.map(r => r.contact_id)));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingRecipients(false); });

    return () => { cancelled = true; };
  }, [statusFilter, consultantFilter, tagFilter]);

  const selectedRecipients = useMemo(
    () => recipients.filter(r => selectedIds.has(r.contact_id)),
    [recipients, selectedIds]
  );

  function toggleAll() {
    if (selectedIds.size === recipients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recipients.map(r => r.contact_id)));
    }
  }

  function toggleOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (sending || selectedRecipients.length === 0 || !subject.trim()) return;
    setResult(null);
    setSending(true);

    try {
      const res = await fetch("/api/crm/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: selectedRecipients, subject, templateId, bodyText }),
      });
      const data = await res.json().catch(() => ({}));
      setResult(data);
    } catch (err) {
      setResult({ ok: false, error: err?.message || "Nätverksfel" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1000 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Mailutskick</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Filtrera mottagare, välj mall och skicka mail direkt från CRM.</p>
      </div>

      {/* Mottagarfilter */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>1. Välj mottagare</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Kundstatus</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputStyle}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Kostnadsställe / Ansvarig</label>
            <select value={consultantFilter} onChange={e => setConsultantFilter(e.target.value)} style={inputStyle}>
              <option value="">Alla</option>
              {consultants.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tagg</label>
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} style={inputStyle}>
              <option value="">Alla taggar</option>
              {allTags.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {loadingRecipients ? (
          <p style={{ color: "#8fb1c3", fontSize: 13, margin: 0 }}>Hämtar kontakter...</p>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "#8fb1c3", fontSize: 13 }}>
                {recipients.length} kontakter hittade · {selectedIds.size} valda
              </span>
              <button
                type="button"
                onClick={toggleAll}
                style={{ background: "none", color: "#38bdf8", border: "none", cursor: "pointer", fontSize: 13, padding: 0 }}
              >
                {selectedIds.size === recipients.length ? "Avmarkera alla" : "Välj alla"}
              </button>
            </div>

            {recipients.length > 0 && (
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #1e293b", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    {recipients.map(r => (
                      <tr
                        key={r.contact_id}
                        onClick={() => toggleOne(r.contact_id)}
                        style={{ borderBottom: "1px solid #1e3447", cursor: "pointer", background: selectedIds.has(r.contact_id) ? "#0f2030" : "transparent" }}
                      >
                        <td style={{ padding: "7px 10px", width: 32 }}>
                          <input type="checkbox" readOnly checked={selectedIds.has(r.contact_id)} style={{ cursor: "pointer" }} />
                        </td>
                        <td style={{ padding: "7px 0", color: "#e2e8f0", fontWeight: 600 }}>{r.company_name}</td>
                        <td style={{ padding: "7px 10px", color: "#8fb1c3" }}>{r.name}</td>
                        <td style={{ padding: "7px 10px", color: "#8fb1c3" }}>{r.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {recipients.length === 0 && (
              <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Inga kontakter med e-post hittades för detta filter.</p>
            )}
          </>
        )}
      </div>

      {/* Compose */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>2. Skriv mail</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Ämnesrad</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="T.ex. Nyhet från Saldoredo"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Mall</label>
          <div style={{ display: "flex", gap: 10 }}>
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                style={{
                  background: templateId === t.id ? "#2f7ef7" : "#080c10",
                  color: "#fff",
                  border: `1px solid ${templateId === t.id ? "#2f7ef7" : "#1e293b"}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div>{t.label}</div>
                <div style={{ fontSize: 11, color: templateId === t.id ? "#bfdbfe" : "#64748b", fontWeight: 400, marginTop: 2 }}>{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Brödtext</label>
          <textarea
            value={bodyText}
            onChange={e => setBodyText(e.target.value)}
            placeholder="Skriv ditt meddelande här..."
            rows={8}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
          />
        </div>
      </div>

      {/* Skicka */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>3. Skicka</h3>

        {!subject.trim() && (
          <p style={{ color: "#fda4af", fontSize: 13, margin: "0 0 12px" }}>Fyll i ämnesrad innan du skickar.</p>
        )}

        <button
          type="button"
          disabled={sending || selectedRecipients.length === 0 || !subject.trim()}
          onClick={handleSend}
          style={{
            background: sending || selectedRecipients.length === 0 || !subject.trim() ? "#5a6f82" : "#f59e0b",
            color: sending || selectedRecipients.length === 0 || !subject.trim() ? "#fff" : "#080c10",
            border: "none",
            borderRadius: 10,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 700,
            cursor: sending || selectedRecipients.length === 0 || !subject.trim() ? "not-allowed" : "pointer",
          }}
        >
          {sending ? "Skickar..." : `Skicka till ${selectedRecipients.length} mottagare`}
        </button>

        {result && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: result.ok ? "#0a2a1a" : "#2a0f0f", border: `1px solid ${result.ok ? "#f59e0b" : "#fda4af"}` }}>
            {result.ok ? (
              <p style={{ margin: 0, color: "#f59e0b", fontSize: 13 }}>
                ✓ Klart — {result.sent} mail skickade
                {result.failed > 0 && `, ${result.failed} misslyckades`}
                {result.skipped > 0 && `, ${result.skipped} saknade e-post`}
              </p>
            ) : (
              <p style={{ margin: 0, color: "#fda4af", fontSize: 13 }}>Fel: {result.error}</p>
            )}
            {result.errors?.length > 0 && (
              <ul style={{ margin: "8px 0 0", padding: "0 0 0 16px", color: "#fda4af", fontSize: 12 }}>
                {result.errors.map((e, i) => <li key={i}>{e.email}: {e.error}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

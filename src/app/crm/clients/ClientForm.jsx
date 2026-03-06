"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function toInputValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

const inputStyle = {
  width: "100%",
  background: "#080c10",
  color: "#fff",
  border: "1px solid #1e293b",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
};

export default function ClientForm({ mode, initialClient, clientId }) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [form, setForm] = useState({
    company_name: toInputValue(initialClient?.company_name),
    organization_number: toInputValue(initialClient?.organization_number),
    customer_number: toInputValue(initialClient?.customer_number),
    industry: toInputValue(initialClient?.industry),
    revenue: toInputValue(initialClient?.revenue),
    employees: toInputValue(initialClient?.employees),
    client_status: toInputValue(initialClient?.client_status || "active"),
    start_date: toInputValue(initialClient?.start_date),
    responsible_consultant: toInputValue(initialClient?.responsible_consultant),
    office: toInputValue(initialClient?.office),
    notes: toInputValue(initialClient?.notes),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");

    const endpoint = isEdit ? `/api/crm/clients/${clientId}` : "/api/crm/clients";
    const method = isEdit ? "PATCH" : "POST";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);

    if (!response) {
      setError("Kunde inte nå servern. Försök igen.");
      setSaving(false);
      return;
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Något gick fel vid sparning.");
      setSaving(false);
      return;
    }

    const id = payload?.client?.id || clientId;
    router.push(`/crm/clients/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Företagsnamn *</div>
          <input required value={form.company_name} onChange={e => updateField("company_name", e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Org.nr *</div>
          <input required value={form.organization_number} onChange={e => updateField("organization_number", e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Kundnummer (gamla appen/Fortnox)</div>
          <input value={form.customer_number} onChange={e => updateField("customer_number", e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Bransch</div>
          <input value={form.industry} onChange={e => updateField("industry", e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Status</div>
          <select value={form.client_status} onChange={e => updateField("client_status", e.target.value)} style={inputStyle}>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="former">former</option>
          </select>
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Omsättning</div>
          <input type="number" step="0.01" value={form.revenue} onChange={e => updateField("revenue", e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Anställda</div>
          <input type="number" step="1" value={form.employees} onChange={e => updateField("employees", e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Startdatum</div>
          <input type="date" value={form.start_date} onChange={e => updateField("start_date", e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Ansvarig konsult</div>
          <input value={form.responsible_consultant} onChange={e => updateField("responsible_consultant", e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Kontor</div>
          <input value={form.office} onChange={e => updateField("office", e.target.value)} style={inputStyle} />
        </label>
      </div>

      <label>
        <div style={{ marginBottom: 6, color: "#e2e8f0", fontSize: 13 }}>Anteckningar</div>
        <textarea
          rows={5}
          value={form.notes}
          onChange={e => updateField("notes", e.target.value)}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>

      {error && <p style={{ margin: 0, color: "#fda4af", fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            background: saving ? "#5a6f82" : "#f59e0b",
            color: "#080c10",
            border: "none",
            borderRadius: 8,
            padding: "10px 14px",
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Sparar..." : isEdit ? "Spara ändringar" : "Skapa klient"}
        </button>

        <Link
          href={isEdit ? `/crm/clients/${clientId}` : "/crm/clients"}
          style={{
            background: "#233a49",
            color: "#e2e8f0",
            border: "1px solid #1e293b",
            borderRadius: 8,
            padding: "10px 14px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Avbryt
        </Link>
      </div>
    </form>
  );
}

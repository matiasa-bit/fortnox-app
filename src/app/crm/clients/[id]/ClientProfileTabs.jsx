"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const cardStyle = { background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 14, padding: 16 };
const inputStyle = {
  width: "100%",
  background: "#0f1923",
  color: "#fff",
  border: "1px solid #2a4a5e",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 13,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function TabButton({ tab, activeTab, label, onClick }) {
  const active = activeTab === tab;
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      style={{
        background: active ? "#2f7ef7" : "#233a49",
        color: "#fff",
        border: "1px solid #2a4a5e",
        borderRadius: 8,
        padding: "8px 12px",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function ClientProfileTabs({ clientId, contacts = [], services = [], activities = [], documents = [] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("contacts");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "" });
  const [serviceForm, setServiceForm] = useState({ service_type: "", billing_model: "", price: "", start_date: "" });
  const [noteForm, setNoteForm] = useState({ description: "", date: today() });

  const tabs = useMemo(() => ([
    { key: "contacts", label: `Kontaktpersoner (${contacts.length})` },
    { key: "services", label: `Tjänster (${services.length})` },
    { key: "activity", label: `Aktivitetslogg (${activities.length})` },
    { key: "documents", label: `Dokumentlänkar (${documents.length})` },
  ]), [contacts.length, services.length, activities.length, documents.length]);

  async function submit(path, payload, onSuccess) {
    if (saving) return;
    setError("");
    setSaving(true);

    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (!res) {
      setSaving(false);
      setError("Kunde inte nå servern.");
      return;
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setSaving(false);
      setError(json?.error || "Kunde inte spara.");
      return;
    }

    onSuccess();
    setSaving(false);
    router.refresh();
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map(tab => (
          <TabButton key={tab.key} tab={tab.key} activeTab={activeTab} label={tab.label} onClick={setActiveTab} />
        ))}
      </div>

      {activeTab === "contacts" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Lägg till kontaktperson</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <input placeholder="Namn *" value={contactForm.name} onChange={e => setContactForm(prev => ({ ...prev, name: e.target.value }))} style={inputStyle} />
              <input placeholder="Roll" value={contactForm.role} onChange={e => setContactForm(prev => ({ ...prev, role: e.target.value }))} style={inputStyle} />
              <input placeholder="E-post" value={contactForm.email} onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))} style={inputStyle} />
              <input placeholder="Telefon" value={contactForm.phone} onChange={e => setContactForm(prev => ({ ...prev, phone: e.target.value }))} style={inputStyle} />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(`/api/crm/clients/${clientId}/contacts`, contactForm, () => setContactForm({ name: "", role: "", email: "", phone: "" }))}
              style={{ marginTop: 10, background: "#00c97a", color: "#0f1923", border: "none", borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
            >
              Lägg till kontakt
            </button>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Kontaktpersoner</h3>
            {contacts.length === 0 ? <p style={{ margin: 0, color: "#8fb1c3" }}>Inga kontakter ännu.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                {contacts.map(c => <li key={c.id}>{c.name} · {c.role || "-"} · {c.email || "-"} · {c.phone || "-"}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === "services" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Lägg till tjänst</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <input placeholder="Tjänstetyp *" value={serviceForm.service_type} onChange={e => setServiceForm(prev => ({ ...prev, service_type: e.target.value }))} style={inputStyle} />
              <input placeholder="Debiteringsmodell" value={serviceForm.billing_model} onChange={e => setServiceForm(prev => ({ ...prev, billing_model: e.target.value }))} style={inputStyle} />
              <input placeholder="Pris" type="number" step="0.01" value={serviceForm.price} onChange={e => setServiceForm(prev => ({ ...prev, price: e.target.value }))} style={inputStyle} />
              <input placeholder="Startdatum" type="date" value={serviceForm.start_date} onChange={e => setServiceForm(prev => ({ ...prev, start_date: e.target.value }))} style={inputStyle} />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(`/api/crm/clients/${clientId}/services`, serviceForm, () => setServiceForm({ service_type: "", billing_model: "", price: "", start_date: "" }))}
              style={{ marginTop: 10, background: "#00c97a", color: "#0f1923", border: "none", borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
            >
              Lägg till tjänst
            </button>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Tjänster</h3>
            {services.length === 0 ? <p style={{ margin: 0, color: "#8fb1c3" }}>Inga tjänster ännu.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                {services.map(s => <li key={s.id}>{s.service_type} · {s.billing_model || "-"} · {s.price ?? "-"} · {s.start_date || "-"}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Lägg till anteckning</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <input type="date" value={noteForm.date} onChange={e => setNoteForm(prev => ({ ...prev, date: e.target.value }))} style={{ ...inputStyle, maxWidth: 220 }} />
              <textarea rows={4} placeholder="Skriv anteckning..." value={noteForm.description} onChange={e => setNoteForm(prev => ({ ...prev, description: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(`/api/crm/clients/${clientId}/activities`, noteForm, () => setNoteForm({ description: "", date: today() }))}
              style={{ marginTop: 10, background: "#00c97a", color: "#0f1923", border: "none", borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
            >
              Lägg till anteckning
            </button>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Aktivitetslogg</h3>
            {activities.length === 0 ? <p style={{ margin: 0, color: "#8fb1c3" }}>Inga aktiviteter ännu.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                {activities.map(a => <li key={a.id}>{a.date || "-"} · {a.activity_type || "-"} · {a.description || "-"}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Dokumentlänkar</h3>
          {documents.length === 0 ? <p style={{ margin: 0, color: "#8fb1c3" }}>Inga dokumentlänkar ännu.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {documents.map(d => (
                <li key={d.id}>
                  <a href={d.url} target="_blank" rel="noreferrer" style={{ color: "#3b9eff" }}>{d.title}</a>
                  {d.document_type ? ` · ${d.document_type}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p style={{ margin: "12px 0 0", color: "#fda4af", fontSize: 13 }}>{error}</p>}
    </section>
  );
}

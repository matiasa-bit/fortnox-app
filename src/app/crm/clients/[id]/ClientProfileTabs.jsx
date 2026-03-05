"use client";

import { useMemo, useState, useEffect } from "react";
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

export default function ClientProfileTabs({ clientId, contacts = [], contactDirectory = [], services = [], activities = [], documents = [] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("contacts");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [clientTags, setClientTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [tagsLoading, setTagsLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/crm/clients/${clientId}/tags`).then(r => r.json()).then(d => setClientTags(d?.tags || [])).catch(() => {});
    fetch("/api/crm/tags").then(r => r.json()).then(d => setAllTags(d?.tags || [])).catch(() => {});
  }, [clientId]);

  async function addTag(tagId) {
    if (!tagId || tagsLoading) return;
    setTagsLoading(true);
    const res = await fetch(`/api/crm/clients/${clientId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: Number(tagId) }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      const tag = allTags.find(t => t.id === Number(tagId));
      if (tag) setClientTags(prev => [...prev, tag]);
      setSelectedTagId("");
    }
    setTagsLoading(false);
  }

  async function removeTag(tagId) {
    setTagsLoading(true);
    await fetch(`/api/crm/clients/${clientId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    setClientTags(prev => prev.filter(t => t.id !== tagId));
    setTagsLoading(false);
  }

  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "" });
  const [selectedContactId, setSelectedContactId] = useState("");
  const [editingContactId, setEditingContactId] = useState(null);
  const [editContactForm, setEditContactForm] = useState({ name: "", role: "", email: "", phone: "" });
  const [serviceForm, setServiceForm] = useState({ service_type: "", billing_model: "", price: "", start_date: "" });
  const [noteForm, setNoteForm] = useState({ description: "", date: today() });

  const tabs = useMemo(() => ([
    { key: "contacts", label: `Kontaktpersoner (${contacts.length})` },
    { key: "tags", label: `Taggar (${clientTags.length})` },
    { key: "services", label: `Tjänster (${services.length})` },
    { key: "activity", label: `Aktivitetslogg (${activities.length})` },
    { key: "documents", label: `Dokumentlänkar (${documents.length})` },
  ]), [contacts.length, clientTags.length, services.length, activities.length, documents.length]);

  async function submit(path, payload, onSuccess, method = "POST") {
    if (saving) return;
    setError("");
    setSaving(true);

    const res = await fetch(path, {
      method,
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
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Koppla kontakt fran kontaktlista</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
              <select
                value={selectedContactId}
                onChange={e => setSelectedContactId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Valj kontakt</option>
                {contactDirectory.map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name || "-"} · {contact.email || "-"} · {contact.phone || "-"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving || !selectedContactId}
                onClick={() => submit(
                  `/api/crm/clients/${clientId}/contacts`,
                  { contact_id: Number(selectedContactId) },
                  () => setSelectedContactId("")
                )}
                style={{ background: "#2f7ef7", color: "#fff", border: "none", borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
              >
                Koppla kontakt
              </button>
            </div>
          </div>

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
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Kontaktpersoner</h3>
            {contacts.length === 0 ? (
              <p style={{ margin: 0, color: "#8fb1c3" }}>Inga kontakter ännu.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "#8fb1c3", textAlign: "left" }}>
                    <th style={{ padding: "4px 10px 8px 0", fontWeight: 600 }}>Namn</th>
                    <th style={{ padding: "4px 10px 8px 0", fontWeight: 600 }}>Roll</th>
                    <th style={{ padding: "4px 10px 8px 0", fontWeight: 600 }}>E-post</th>
                    <th style={{ padding: "4px 10px 8px 0", fontWeight: 600 }}>Telefon</th>
                    <th style={{ padding: "4px 0 8px 0", fontWeight: 600 }} />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => editingContactId === c.id ? (
                    <tr key={c.id} style={{ background: "#0f1923" }}>
                      <td style={{ padding: "4px 10px 4px 0" }}>
                        <input value={editContactForm.name} onChange={e => setEditContactForm(p => ({ ...p, name: e.target.value }))} style={{ ...inputStyle, padding: "5px 8px" }} />
                      </td>
                      <td style={{ padding: "4px 10px 4px 0" }}>
                        <input value={editContactForm.role} onChange={e => setEditContactForm(p => ({ ...p, role: e.target.value }))} style={{ ...inputStyle, padding: "5px 8px" }} />
                      </td>
                      <td style={{ padding: "4px 10px 4px 0" }}>
                        <input value={editContactForm.email} onChange={e => setEditContactForm(p => ({ ...p, email: e.target.value }))} style={{ ...inputStyle, padding: "5px 8px" }} />
                      </td>
                      <td style={{ padding: "4px 10px 4px 0" }}>
                        <input value={editContactForm.phone} onChange={e => setEditContactForm(p => ({ ...p, phone: e.target.value }))} style={{ ...inputStyle, padding: "5px 8px" }} />
                      </td>
                      <td style={{ padding: "4px 0", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => submit(
                            `/api/crm/clients/${clientId}/contacts`,
                            { contact_id: c.id, ...editContactForm },
                            () => setEditingContactId(null),
                            "PATCH"
                          )}
                          style={{ background: "#00c97a", color: "#0f1923", border: "none", borderRadius: 6, padding: "5px 10px", fontWeight: 700, cursor: "pointer", marginRight: 6 }}
                        >
                          Spara
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingContactId(null)}
                          style={{ background: "#233a49", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}
                        >
                          Avbryt
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id} style={{ borderTop: "1px solid #1e3447" }}>
                      <td style={{ padding: "8px 10px 8px 0", color: "#dbe7ef" }}>
                        {c.name || "-"}
                        {c.is_primary && <span style={{ marginLeft: 6, fontSize: 11, color: "#00c97a", fontWeight: 700 }}>PRIMÄR</span>}
                      </td>
                      <td style={{ padding: "8px 10px 8px 0", color: "#8fb1c3" }}>{c.role || "-"}</td>
                      <td style={{ padding: "8px 10px 8px 0", color: "#dbe7ef" }}>{c.email || "-"}</td>
                      <td style={{ padding: "8px 10px 8px 0", color: "#dbe7ef" }}>{c.phone || "-"}</td>
                      <td style={{ padding: "8px 0", whiteSpace: "nowrap", display: "flex", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => { setEditingContactId(c.id); setEditContactForm({ name: c.name || "", role: c.role || "", email: c.email || "", phone: c.phone || "" }); }}
                          style={{ background: "none", color: "#3b9eff", border: "none", cursor: "pointer", fontSize: 13, padding: 0 }}
                        >
                          Redigera
                        </button>
                        {!c.is_primary && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => submit(
                              `/api/crm/clients/${clientId}/contacts`,
                              { contact_id: c.id },
                              () => {},
                              "PUT"
                            )}
                            style={{ background: "none", color: "#00c97a", border: "none", cursor: "pointer", fontSize: 13, padding: 0 }}
                          >
                            Sätt som primär
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === "tags" && (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>Taggar</h3>

          {/* Tilldelade taggar */}
          {clientTags.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {clientTags.map(tag => (
                <span
                  key={tag.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: tag.color + "22",
                    color: tag.color,
                    border: `1px solid ${tag.color}55`,
                    borderRadius: 20,
                    padding: "4px 10px",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => removeTag(tag.id)}
                    disabled={tagsLoading}
                    style={{ background: "none", border: "none", color: tag.color, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Lägg till tagg */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
            <select
              value={selectedTagId}
              onChange={e => setSelectedTagId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Välj tagg att lägga till...</option>
              {allTags.filter(t => !clientTags.some(ct => ct.id === t.id)).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedTagId || tagsLoading}
              onClick={() => addTag(selectedTagId)}
              style={{
                background: !selectedTagId || tagsLoading ? "#5a6f82" : "#2f7ef7",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "9px 12px",
                fontWeight: 700,
                cursor: !selectedTagId || tagsLoading ? "not-allowed" : "pointer",
              }}
            >
              Lägg till
            </button>
          </div>

          {allTags.length === 0 && (
            <p style={{ margin: "12px 0 0", color: "#6b8fa3", fontSize: 13 }}>
              Inga taggar skapade ännu. Gå till{" "}
              <a href="/crm/settings" style={{ color: "#3b9eff" }}>CRM-inställningar</a> för att skapa taggar.
            </p>
          )}
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

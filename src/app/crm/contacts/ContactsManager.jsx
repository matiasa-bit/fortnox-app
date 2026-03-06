"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const inputStyle = {
  width: "100%",
  background: "#080c10",
  color: "#fff",
  border: "1px solid #1e293b",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 13,
};

function toForm(contact = {}) {
  return {
    name: String(contact?.name || ""),
    role: String(contact?.role || ""),
    email: String(contact?.email || ""),
    phone: String(contact?.phone || ""),
  };
}

export default function ContactsManager({ initialContacts = [] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState(0);
  const [error, setError] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", role: "", email: "", phone: "" });
  const [editId, setEditId] = useState(0);
  const [editForm, setEditForm] = useState({ name: "", role: "", email: "", phone: "" });

  const contacts = useMemo(() => initialContacts || [], [initialContacts]);

  async function createContact() {
    if (creating) return;
    setError("");
    setCreating(true);

    const res = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    }).catch(() => null);

    if (!res) {
      setCreating(false);
      setError("Kunde inte na servern.");
      return;
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setCreating(false);
      setError(json?.error || "Kunde inte skapa kontakt.");
      return;
    }

    setCreateForm({ name: "", role: "", email: "", phone: "" });
    setCreating(false);
    router.refresh();
  }

  async function deleteContact(contactId, name) {
    if (!window.confirm(`Ta bort kontakt "${name || "kontakten"}"? Den kopplas även bort från alla kunder.`)) return;
    setError("");
    setSavingId(contactId);

    const res = await fetch(`/api/crm/contacts/${contactId}`, {
      method: "DELETE",
    }).catch(() => null);

    setSavingId(0);

    if (!res) { setError("Kunde inte nå servern."); return; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) { setError(json?.error || "Kunde inte ta bort kontakt."); return; }

    router.refresh();
  }

  async function saveEdit(contactId) {
    if (!contactId || savingId) return;
    setError("");
    setSavingId(contactId);

    const res = await fetch(`/api/crm/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    }).catch(() => null);

    if (!res) {
      setSavingId(0);
      setError("Kunde inte na servern.");
      return;
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setSavingId(0);
      setError(json?.error || "Kunde inte uppdatera kontakt.");
      return;
    }

    setSavingId(0);
    setEditId(0);
    setEditForm({ name: "", role: "", email: "", phone: "" });
    router.refresh();
  }

  return (
    <>
      <div style={{ background: "#223746", border: "1px solid #1e293b", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Skapa ny kontakt</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <input placeholder="Namn *" value={createForm.name} onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))} style={inputStyle} />
          <input placeholder="Roll" value={createForm.role} onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value }))} style={inputStyle} />
          <input placeholder="E-post" value={createForm.email} onChange={e => setCreateForm(prev => ({ ...prev, email: e.target.value }))} style={inputStyle} />
          <input placeholder="Telefon" value={createForm.phone} onChange={e => setCreateForm(prev => ({ ...prev, phone: e.target.value }))} style={inputStyle} />
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={createContact}
          style={{ marginTop: 10, background: "#f59e0b", color: "#080c10", border: "none", borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
        >
          {creating ? "Skapar..." : "Skapa kontakt"}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Namn", "Roll", "E-post", "Telefon", ""].map(h => (
                <th key={h || "actions"} style={{ textAlign: "left", color: "#64748b", fontSize: 12, fontWeight: 600, padding: "0 10px 12px 0", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map(contact => {
              const isEditing = editId === Number(contact.id);
              return (
                <tr key={contact.id} style={{ borderBottom: "1px solid #141c24" }}>
                  <td style={{ padding: "10px 10px 10px 0", color: "#fff", fontWeight: 600, fontSize: 13 }}>
                    {isEditing ? <input value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} style={inputStyle} /> : (contact.name || "-")}
                  </td>
                  <td style={{ padding: "10px 10px 10px 0", color: "#e2e8f0", fontSize: 13 }}>
                    {isEditing ? <input value={editForm.role} onChange={e => setEditForm(prev => ({ ...prev, role: e.target.value }))} style={inputStyle} /> : (contact.role || "-")}
                  </td>
                  <td style={{ padding: "10px 10px 10px 0", color: "#e2e8f0", fontSize: 13 }}>
                    {isEditing ? <input value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} style={inputStyle} /> : (contact.email || "-")}
                  </td>
                  <td style={{ padding: "10px 10px 10px 0", color: "#e2e8f0", fontSize: 13 }}>
                    {isEditing ? <input value={editForm.phone} onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))} style={inputStyle} /> : (contact.phone || "-")}
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right", whiteSpace: "nowrap" }}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          disabled={savingId === Number(contact.id)}
                          onClick={() => saveEdit(Number(contact.id))}
                          style={{ background: "#2f7ef7", color: "#fff", border: "none", borderRadius: 8, padding: "8px 10px", fontWeight: 700, marginRight: 6, cursor: "pointer" }}
                        >
                          Spara
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(0);
                            setEditForm({ name: "", role: "", email: "", phone: "" });
                          }}
                          style={{ background: "#233a49", color: "#fff", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}
                        >
                          Avbryt
                        </button>
                      </>
                    ) : (
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(Number(contact.id));
                            setEditForm(toForm(contact));
                          }}
                          style={{ background: "#233a49", color: "#fff", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}
                        >
                          Redigera
                        </button>
                        <button
                          type="button"
                          disabled={savingId === Number(contact.id)}
                          onClick={() => deleteContact(Number(contact.id), contact.name)}
                          style={{ background: "none", color: "#fda4af", border: "1px solid #fda4af", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer" }}
                        >
                          Ta bort
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {contacts.length === 0 && (
        <p style={{ marginTop: 12, color: "#8fb1c3", fontSize: 13 }}>Inga kontakter hittades.</p>
      )}

      {error && <p style={{ marginTop: 12, color: "#fda4af", fontSize: 13 }}>{error}</p>}
    </>
  );
}

"use client";

import { useState, useEffect } from "react";

const PRESET_COLORS = [
  "#38bdf8", // blå
  "#f59e0b", // grön
  "#fda4af", // rosa/röd
  "#a78bfa", // lila
  "#fb923c", // orange
  "#fbbf24", // gul
  "#f472b6", // rosa
  "#94a3b8", // grå
];

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

export default function CrmSettingsPage() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  async function loadTags() {
    setLoading(true);
    const res = await fetch("/api/crm/tags").catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setTags(data?.tags || []);
    setLoading(false);
  }

  async function createTag(e) {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    const res = await fetch("/api/crm/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.tag) {
      setTags(prev => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name, "sv-SE")));
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
    }
    setCreating(false);
  }

  function startEdit(tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id) {
    if (!editName.trim() || saving) return;
    setSaving(true);
    const res = await fetch(`/api/crm/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.tag) {
      setTags(prev => prev.map(t => t.id === id ? data.tag : t).sort((a, b) => a.name.localeCompare(b.name, "sv-SE")));
      setEditingId(null);
    }
    setSaving(false);
  }

  async function deleteTag(id, name) {
    if (!window.confirm(`Ta bort taggen "${name}"? Den tas bort från alla kunder.`)) return;
    const res = await fetch(`/api/crm/tags/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setTags(prev => prev.filter(t => t.id !== id));
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 700 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>CRM-inställningar</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Hantera taggbibliotek och andra CRM-inställningar.</p>
      </div>

      {/* Ny tagg */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Taggbibliotek</h3>

        <form onSubmit={createTag} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 20, alignItems: "end" }}>
          <div>
            <label style={labelStyle}>Ny tagg</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="T.ex. Prioriterad, VIP, Ny kund..."
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            style={{
              background: !newName.trim() || creating ? "#5a6f82" : "#f59e0b",
              color: !newName.trim() || creating ? "#fff" : "#080c10",
              border: "none",
              borderRadius: 8,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 700,
              cursor: !newName.trim() || creating ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {creating ? "Skapar..." : "Lägg till"}
          </button>
        </form>

        {/* Färgväljare */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Färg på ny tagg</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: c,
                  border: newColor === c ? "3px solid #fff" : "3px solid transparent",
                  cursor: "pointer",
                  outline: newColor === c ? "2px solid #38bdf8" : "none",
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
        </div>

        {/* Tagg-lista */}
        {loading ? (
          <p style={{ color: "#8fb1c3", fontSize: 13, margin: 0 }}>Laddar taggar...</p>
        ) : tags.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Inga taggar skapade ännu.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {tags.map(tag => (
              <div
                key={tag.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#080c10",
                  border: "1px solid #1e293b",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                {editingId === tag.id ? (
                  <>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditColor(c)}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: c,
                            border: editColor === c ? "2px solid #fff" : "2px solid transparent",
                            cursor: "pointer",
                            outline: editColor === c ? "2px solid #38bdf8" : "none",
                            outlineOffset: 1,
                          }}
                        />
                      ))}
                    </div>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      style={{ ...inputStyle, width: "auto", flex: 1 }}
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(tag.id)}
                      disabled={saving}
                      style={{ background: "#f59e0b", color: "#080c10", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      Spara
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{ background: "none", color: "#8fb1c3", border: "1px solid #1e293b", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}
                    >
                      Avbryt
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: tag.color, display: "inline-block", flexShrink: 0 }} />
                    <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600, flex: 1 }}>{tag.name}</span>
                    <button
                      onClick={() => startEdit(tag)}
                      style={{ background: "none", color: "#38bdf8", border: "none", fontSize: 12, cursor: "pointer", padding: "2px 8px" }}
                    >
                      Redigera
                    </button>
                    <button
                      onClick={() => deleteTag(tag.id, tag.name)}
                      style={{ background: "none", color: "#fda4af", border: "none", fontSize: 12, cursor: "pointer", padding: "2px 8px" }}
                    >
                      Ta bort
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

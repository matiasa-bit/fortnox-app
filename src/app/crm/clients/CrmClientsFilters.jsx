"use client";

import { useEffect, useRef, useState } from "react";

const inputStyle = {
  flex: 1,
  minWidth: 260,
  background: "#0f1923",
  color: "#fff",
  border: "1px solid #2a4a5e",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
};

const selectStyle = {
  background: "#0f1923",
  color: "#fff",
  border: "1px solid #2a4a5e",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
};

export default function CrmClientsFilters({ initialQuery = "", initialConsultant = "", initialStatus = "fortnox_active", consultants = [] }) {
  const formRef = useRef(null);
  const [query, setQuery] = useState(initialQuery);
  const [consultant, setConsultant] = useState(initialConsultant);
  const [status, setStatus] = useState(initialStatus || "fortnox_active");

  useEffect(() => {
    const timer = setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  function submitNow() {
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action="/crm/clients" method="get" style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
      <input
        type="text"
        name="q"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Sök bolagsnamn, org.nr eller kundnummer"
        style={inputStyle}
      />

      <select
        name="consultant"
        value={consultant}
        onChange={e => {
          setConsultant(e.target.value);
          setTimeout(submitNow, 0);
        }}
        style={{ ...selectStyle, minWidth: 190 }}
      >
        <option value="">Alla kostnadsstallen</option>
        {consultants.map(name => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>

      <select
        name="status"
        value={status}
        onChange={e => {
          setStatus(e.target.value);
          setTimeout(submitNow, 0);
        }}
        style={{ ...selectStyle, minWidth: 170 }}
      >
        <option value="fortnox_active">Aktiv</option>
        <option value="fortnox_inactive">Inaktiv</option>
        <option value="fortnox_unknown">Okand</option>
        <option value="">Alla Fortnox-statusar</option>
      </select>
    </form>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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
  const router = useRouter();
  const pathname = usePathname();
  const hasInteractedRef = useRef(false);
  const [query, setQuery] = useState(initialQuery);
  const [consultant, setConsultant] = useState(initialConsultant);
  const [status, setStatus] = useState(initialStatus || "fortnox_active");

  function buildHref(nextValues) {
    const params = new URLSearchParams();
    const nextQuery = String(nextValues?.query || "").trim();
    const nextConsultant = String(nextValues?.consultant || "").trim();
    const nextStatus = String(nextValues?.status || "").trim();

    if (nextQuery) params.set("q", nextQuery);
    if (nextConsultant) params.set("consultant", nextConsultant);
    if (nextStatus) params.set("status", nextStatus);

    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }

  function navigate(nextValues) {
    const href = buildHref(nextValues);
    if (typeof window !== "undefined") {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current === href) return;
    }

    router.replace(href);
  }

  useEffect(() => {
    if (!hasInteractedRef.current) return;

    const timer = setTimeout(() => {
      navigate({ query, consultant, status });
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        hasInteractedRef.current = true;
        navigate({ query, consultant, status });
      }}
      style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}
    >
      <input
        type="text"
        name="q"
        value={query}
        onChange={e => {
          hasInteractedRef.current = true;
          setQuery(e.target.value);
        }}
        placeholder="Sök bolagsnamn, org.nr eller kundnummer"
        style={inputStyle}
      />

      <select
        name="consultant"
        value={consultant}
        onChange={e => {
          const nextConsultant = e.target.value;
          hasInteractedRef.current = true;
          setConsultant(nextConsultant);
          navigate({ query, consultant: nextConsultant, status });
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
          const nextStatus = e.target.value;
          hasInteractedRef.current = true;
          setStatus(nextStatus);
          navigate({ query, consultant, status: nextStatus });
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

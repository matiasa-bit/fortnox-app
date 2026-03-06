"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const inputStyle = {
  flex: 1,
  minWidth: 260,
  background: "#0f1419",
  color: "#e2e8f0",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  letterSpacing: "0.01em",
};

const selectStyle = {
  background: "#0f1419",
  color: "#e2e8f0",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  letterSpacing: "0.01em",
};

export default function CrmClientsFilters({ initialQuery = "", initialConsultant = "", initialStatus = "fortnox_active", consultants = [], initialTag = "", allTags = [] }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasInteractedRef = useRef(false);
  const [query, setQuery] = useState(initialQuery);
  const [consultant, setConsultant] = useState(initialConsultant);
  const [status, setStatus] = useState(initialStatus || "fortnox_active");
  const [tag, setTag] = useState(initialTag);

  function buildHref(nextValues) {
    const params = new URLSearchParams();
    const nextQuery = String(nextValues?.query || "").trim();
    const nextConsultant = String(nextValues?.consultant || "").trim();
    const nextStatus = String(nextValues?.status || "").trim();
    const nextTag = String(nextValues?.tag || "").trim();

    if (nextQuery) params.set("q", nextQuery);
    if (nextConsultant) params.set("consultant", nextConsultant);
    if (nextStatus) params.set("status", nextStatus);
    if (nextTag) params.set("tag", nextTag);

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
      navigate({ query, consultant, status, tag });
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
          navigate({ query, consultant: nextConsultant, status, tag });
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
          navigate({ query, consultant, status: nextStatus, tag });
        }}
        style={{ ...selectStyle, minWidth: 170 }}
      >
        <option value="fortnox_active">Aktiv</option>
        <option value="fortnox_inactive">Inaktiv</option>
        <option value="fortnox_unknown">Okand</option>
        <option value="">Alla Fortnox-statusar</option>
      </select>

      {allTags.length > 0 && (
        <select
          name="tag"
          value={tag}
          onChange={e => {
            const nextTag = e.target.value;
            hasInteractedRef.current = true;
            setTag(nextTag);
            navigate({ query, consultant, status, tag: nextTag });
          }}
          style={{ ...selectStyle, minWidth: 150 }}
        >
          <option value="">Alla taggar</option>
          {allTags.map(t => (
            <option key={t.id} value={String(t.id)}>{t.name}</option>
          ))}
        </select>
      )}
    </form>
  );
}

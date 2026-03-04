"use client";

import { Fragment, useMemo, useState } from "react";

function formatSEK(value) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNum(value, fractionDigits = 0) {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value || 0);
}

function ToggleButton({ expanded, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        marginRight: 8,
        width: 18,
        height: 18,
        borderRadius: 4,
        border: "1px solid #7e906f",
        background: "#d6e0ce",
        color: "#0f1923",
        fontWeight: 700,
        cursor: "pointer",
        lineHeight: "14px",
        padding: 0,
      }}
    >
      {expanded ? "−" : "+"}
    </button>
  );
}

export default function AgencyTeamTable({ groupRows = [] }) {
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [expandedConsultants, setExpandedConsultants] = useState(() => new Set());

  const collapsedGroupLookup = useMemo(() => new Set(collapsedGroups), [collapsedGroups]);
  const expandedConsultantLookup = useMemo(() => new Set(expandedConsultants), [expandedConsultants]);

  const toggleGroup = (groupKey) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const toggleConsultant = (consultantKey) => {
    setExpandedConsultants(prev => {
      const next = new Set(prev);
      if (next.has(consultantKey)) {
        next.delete(consultantKey);
      } else {
        next.add(consultantKey);
      }
      return next;
    });
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1750 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a4a5e" }}>
            {[
              "Team - Ansvarig - Kund",
              "Antal kunder",
              "Fakturerat hittills totalt",
              "Årsbudget avtal + extra",
              "Prognos helår (utfall + beräknad)",
              "Kundtid totalt",
              "Interna timmar",
              "Kundtid/månad planerat",
              "Kundtid/månad kvar",
              "Intäkt/timme hittills i år",
              "Gap mot avtal",
              "Antal tidsrader",
              "Samarbetar med",
              "Toppsamarbete",
            ].map(h => (
              <th key={h} style={{ color: "#6b8fa3", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "left", padding: "10px 14px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupRows.map(group => {
            const groupCollapsed = collapsedGroupLookup.has(group.key);

            return (
              <Fragment key={`group-${group.key}`}>
                <tr style={{ background: "#c8d4c0", borderBottom: "1px solid #b6c5aa" }}>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 800 }}>
                    <ToggleButton
                      expanded={!groupCollapsed}
                      onClick={() => toggleGroup(group.key)}
                      label={groupCollapsed ? `Expandera ${group.groupName}` : `Fäll ihop ${group.groupName}`}
                    />
                    {group.groupName}
                  </td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{formatNum(group.customerCountYear)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 800 }}>{formatSEK(group.invoiceTotalYear)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{formatSEK(group.contractTotal)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{formatSEK(group.forecastRevenueYear)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{formatNum(group.hoursYear, 1)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{formatNum(group.internalHoursYear || 0, 1)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{formatNum(group.plannedHoursPerMonth, 1)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{group.requiredHoursPerMonth != null ? formatNum(group.requiredHoursPerMonth, 1) : "-"}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{group.revenuePerHourYear ? formatSEK(group.revenuePerHourYear) : "-"}</td>
                  <td style={{ padding: "8px 14px", color: group.contractGapYear > 0 ? "#9b2c2c" : "#0f1923", fontWeight: 700 }}>{formatSEK(group.contractGapYear)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{formatNum(group.rowsYear)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700 }}>{formatNum(group.consultants.length)}</td>
                  <td style={{ padding: "8px 14px", color: "#0f1923", fontWeight: 700, fontSize: 12, lineHeight: 1.25 }}>-</td>
                </tr>

                {!groupCollapsed && group.consultants.map(consultant => {
                  const consultantExpanded = expandedConsultantLookup.has(consultant.key);
                  const hasCustomers = (consultant.customerRows || []).length > 0;

                  return (
                    <Fragment key={`consultant-${consultant.key}`}>
                      <tr style={{ borderBottom: "1px solid #1e3545" }}>
                        <td style={{ padding: "8px 14px", color: "#fff", fontWeight: 500 }}>
                          <span style={{ marginLeft: 18, display: "inline-flex", alignItems: "center", maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={consultant.name}>
                            {hasCustomers ? (
                              <ToggleButton
                                expanded={consultantExpanded}
                                onClick={() => toggleConsultant(consultant.key)}
                                label={consultantExpanded ? `Fäll ihop ${consultant.name}` : `Expandera ${consultant.name}`}
                              />
                            ) : (
                              <span style={{ display: "inline-block", width: 26 }} />
                            )}
                            ↳ {consultant.name}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", color: "#dbe7ef" }}>{formatNum(consultant.customerCountYear)}</td>
                        <td style={{ padding: "8px 14px", color: "#dbe7ef", fontWeight: 700 }}>{formatSEK(consultant.invoiceTotalYear || 0)}</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3" }}>-</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3" }}>-</td>
                        <td style={{ padding: "8px 14px", color: "#1db3a7", fontWeight: 700 }}>{formatNum(consultant.hoursYear || 0, 1)}</td>
                        <td style={{ padding: "8px 14px", color: "#f59e0b", fontWeight: 700 }}>{formatNum(consultant.internalHoursYear || 0, 1)}</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3" }}>-</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3" }}>-</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3" }}>-</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3" }}>-</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3" }}>{formatNum(consultant.rowsYear || 0)}</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3" }}>{formatNum(consultant.collaboratorCount)}</td>
                        <td style={{ padding: "8px 14px", color: "#6b8fa3", fontSize: 12, lineHeight: 1.25 }}>{consultant.topCollaborator}</td>
                      </tr>

                      {consultantExpanded && (consultant.customerRows || []).map(customer => (
                        <tr key={customer.key} style={{ borderBottom: "1px solid #1a3040", background: "#102433" }}>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>
                            <span
                              style={{ marginLeft: 58, display: "inline-block", maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}
                              title={customer.customerLabel}
                            >
                              ↳ {customer.customerLabel}
                            </span>
                          </td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{formatNum(customer.customerCount)}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{formatSEK(customer.invoiceTotalYear || 0)}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{formatSEK(customer.contractTotal)}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{formatSEK(customer.forecastRevenueYear)}</td>
                          <td style={{ padding: "7px 14px", color: "#1db3a7", fontWeight: 700, fontSize: 13 }}>{formatNum(customer.hoursYear, 1)}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{customer.customerNumber === "1" ? formatNum(customer.hoursYear, 1) : "-"}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{formatNum(customer.plannedHoursPerMonth, 1)}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{customer.requiredHoursPerMonth != null ? formatNum(customer.requiredHoursPerMonth, 1) : "-"}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{customer.revenuePerHour ? formatSEK(customer.revenuePerHour) : "-"}</td>
                          <td style={{ padding: "7px 14px", color: customer.contractGapYear > 0 ? "#ff8e8e" : "#b8cfdd", fontSize: 13 }}>{formatSEK(customer.contractGapYear)}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{formatNum(customer.rowsYear)}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 13 }}>{formatNum(customer.collaboratorCount)}</td>
                          <td style={{ padding: "7px 14px", color: "#b8cfdd", fontSize: 12, lineHeight: 1.25 }}>{customer.topCollaborator}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

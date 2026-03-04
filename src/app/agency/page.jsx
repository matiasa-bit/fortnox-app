import Link from "next/link";
import { cookies } from "next/headers";
import {
  getCachedInvoices,
  getCachedTimeReports,
  getCachedContractAccruals,
  getCustomerCostCenterMappings,
  getEmployeeMappings,
} from "@/lib/supabase";
import AgencyTeamTable from "./AgencyTeamTable";

function exMoms(total) {
  const num = parseFloat(total);
  if (Number.isNaN(num)) return 0;
  return Math.round(num / 1.25);
}

function normalizeCustomerNumber(raw) {
  if (!raw) return "";
  return String(raw).trim();
}

const INTERNAL_CUSTOMER_NUMBER = "1";

function normalizeEmployeeName(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

export default async function AgencyPage() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("fortnox_auth")?.value;
  const allowSharedView = process.env.ALLOW_SHARED_VIEW_WITHOUT_LOGIN === "true";

  if (!isLoggedIn && !allowSharedView) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0f1923 0%, #1a2e3b 100%)" }}>
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Byråvy</h1>
          <p className="text-gray-400 mb-8">Logga in för att se översikten.</p>
          <a
            href="/api/auth/login"
            className="inline-block px-8 py-4 rounded-xl text-white font-semibold text-lg"
            style={{ background: "linear-gradient(135deg, #00c97a, #00a862)", boxShadow: "0 8px 32px rgba(0,201,122,0.3)" }}
          >
            Logga in med Fortnox
          </a>
        </div>
      </main>
    );
  }

  const fromDate = "2025-01-01";
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const elapsedMonths = Math.max(1, now.getMonth() + 1);
  const remainingMonths = Math.max(0, 12 - elapsedMonths);

  const [invoices, timeReports, contractAccruals, employeeMappings] = await Promise.all([
    getCachedInvoices(fromDate),
    getCachedTimeReports(fromDate),
    getCachedContractAccruals(),
    getEmployeeMappings(),
  ]);

  const allCustomerNumbers = new Set();
  (invoices || []).forEach(inv => {
    const num = normalizeCustomerNumber(inv.customer_number || inv.CustomerNumber || inv.CustomerNo);
    if (num && num !== INTERNAL_CUSTOMER_NUMBER) allCustomerNumbers.add(num);
  });
  (timeReports || []).forEach(row => {
    const num = normalizeCustomerNumber(row.customer_number || row.CustomerNumber);
    if (num && num !== INTERNAL_CUSTOMER_NUMBER) allCustomerNumbers.add(num);
  });
  (contractAccruals || []).forEach(row => {
    const num = normalizeCustomerNumber(row.customer_number);
    if (num && num !== INTERNAL_CUSTOMER_NUMBER) allCustomerNumbers.add(num);
  });

  const customerMappings = await getCustomerCostCenterMappings(Array.from(allCustomerNumbers));

  const customerInfoByNumber = new Map();
  const costcenterToCustomers = new Map();

  (customerMappings || []).forEach(row => {
    const customerNumber = normalizeCustomerNumber(row.customer_number);
    if (!customerNumber) return;

    const customerName = String(row.customer_name || "").trim() || "Okänd kund";
    const costCenter = String(row.cost_center || "").trim();
    const costCenterName = String(row.cost_center_name || "").trim();

    customerInfoByNumber.set(customerNumber, {
      customerNumber,
      customerName,
      costCenter,
      costCenterName,
      customerLabel: `${customerNumber} - ${customerName}`,
    });

    if (!costcenterToCustomers.has(costCenter || "UNASSIGNED")) {
      costcenterToCustomers.set(costCenter || "UNASSIGNED", new Set());
    }
    costcenterToCustomers.get(costCenter || "UNASSIGNED").add(customerNumber);
  });

  const customerMetrics = new Map();
  const ensureCustomerMetrics = (customerNumber) => {
    const key = customerNumber || "UNKNOWN";
    if (!customerMetrics.has(key)) {
      const info = customerInfoByNumber.get(customerNumber) || {
        customerNumber,
        customerName: customerNumber ? "Okänd kund" : "Okänd kund",
        customerLabel: customerNumber ? `${customerNumber} - Okänd kund` : "Okänd kund",
      };

      customerMetrics.set(key, {
        customerNumber,
        customerLabel: info.customerLabel,
        invoiceTotal: 0,
        invoiceTotalYear: 0,
        contractTotal: 0,
      });
    }
    return customerMetrics.get(key);
  };

  (invoices || []).forEach(inv => {
    const customerNumber = normalizeCustomerNumber(inv.customer_number || inv.CustomerNumber || inv.CustomerNo);
    const total = parseFloat(inv.total || inv.Total || 0) || 0;
    if (!customerNumber || customerNumber === INTERNAL_CUSTOMER_NUMBER || total === 0) return;

    const invoiceDate = String(inv.invoice_date || inv.InvoiceDate || "");
    const isCurrentYear = invoiceDate.startsWith(currentYear);

    const customer = ensureCustomerMetrics(customerNumber);
    const exVat = exMoms(total);
    customer.invoiceTotal += exVat;
    if (isCurrentYear) customer.invoiceTotalYear += exVat;
  });

  (contractAccruals || []).forEach(row => {
    const customerNumber = normalizeCustomerNumber(row.customer_number);
    const total = parseFloat(row.total || 0) || 0;
    if (!customerNumber || customerNumber === INTERNAL_CUSTOMER_NUMBER || total === 0) return;

    const customer = ensureCustomerMetrics(customerNumber);
    customer.contractTotal += total;
  });

  const consultants = new Map();
  const consultantCollaborators = new Map();
  const customerConsultantHoursYear = new Map();
  const employeeIdByNormalizedName = new Map();
  const consultantIdByNormalizedName = new Map();

  (employeeMappings || []).forEach(row => {
    const employeeId = String(row.employee_id || "").trim();
    const normalizedName = normalizeEmployeeName(row.employee_name);
    if (!employeeId || !normalizedName) return;
    if (!employeeIdByNormalizedName.has(normalizedName)) {
      employeeIdByNormalizedName.set(normalizedName, employeeId);
    }
  });

  const ensureConsultant = (employeeId, fallbackName = "") => {
    const normalizedFallbackName = normalizeEmployeeName(fallbackName);
    let id = String(employeeId || "").trim();

    if (!id && normalizedFallbackName) {
      id = employeeIdByNormalizedName.get(normalizedFallbackName)
        || consultantIdByNormalizedName.get(normalizedFallbackName)
        || "";
    }

    if (!id) {
      id = `UNKNOWN:${normalizedFallbackName || fallbackName || "Okänd"}`;
    }

    if (!consultants.has(id)) {
      const mapping = (employeeMappings || []).find(m => String(m.employee_id || "").trim() === id);
      const mappedName = String(mapping?.employee_name || "").trim();
      const mappedGroup = String(mapping?.group_name || "").trim() || "Ej grupp";
      const mappedCostCenter = String(mapping?.cost_center || "").trim();
      const resolvedName = mappedName || fallbackName || id;

      consultants.set(id, {
        employeeId: id,
        employeeName: resolvedName,
        groupName: mappedGroup,
        costCenter: mappedCostCenter,
        hoursYear: 0,
        internalHoursYear: 0,
        rowsYear: 0,
        customerHoursYear: new Map(),
        customerRowsYear: new Map(),
      });

      const normalizedResolvedName = normalizeEmployeeName(resolvedName);
      if (normalizedResolvedName && !consultantIdByNormalizedName.has(normalizedResolvedName)) {
        consultantIdByNormalizedName.set(normalizedResolvedName, id);
      }
    }
    return consultants.get(id);
  };

  (employeeMappings || []).forEach(row => {
    const id = String(row.employee_id || "").trim();
    if (!id) return;
    const consultant = ensureConsultant(id, String(row.employee_name || "").trim());
    consultant.groupName = String(row.group_name || "").trim() || consultant.groupName || "Ej grupp";
    consultant.costCenter = String(row.cost_center || "").trim() || consultant.costCenter || "";
  });

  const customerConsultantsYear = new Map();

  (timeReports || []).forEach(row => {
    const hours = parseFloat(row.hours || row.Hours || 0) || 0;
    if (hours <= 0) return;

    const reportDate = String(row.report_date || row.ReportDate || row.Date || "").slice(0, 10);
    const isCurrentYear = reportDate.startsWith(currentYear);
    if (!isCurrentYear) return;

    const employeeId = String(row.employee_id || row.EmployeeId || "").trim();
    const employeeName = String(row.employee_name || row.EmployeeName || "").trim();
    const customerNumber = normalizeCustomerNumber(row.customer_number || row.CustomerNumber);
    if (!customerNumber) return;
    const isInternalCustomer = customerNumber === INTERNAL_CUSTOMER_NUMBER;

    const consultant = ensureConsultant(employeeId, employeeName);
    consultant.hoursYear += hours;
    if (isInternalCustomer) {
      consultant.internalHoursYear += hours;
    }
    consultant.rowsYear += 1;

    if (isInternalCustomer) return;

    consultant.customerHoursYear.set(customerNumber, (consultant.customerHoursYear.get(customerNumber) || 0) + hours);
    consultant.customerRowsYear.set(customerNumber, (consultant.customerRowsYear.get(customerNumber) || 0) + 1);

    if (!customerConsultantsYear.has(customerNumber)) {
      customerConsultantsYear.set(customerNumber, new Set());
    }
    customerConsultantsYear.get(customerNumber).add(consultant.employeeId);

    if (!customerConsultantHoursYear.has(customerNumber)) {
      customerConsultantHoursYear.set(customerNumber, new Map());
    }
    customerConsultantHoursYear.get(customerNumber).set(
      consultant.employeeId,
      (customerConsultantHoursYear.get(customerNumber).get(consultant.employeeId) || 0) + hours
    );
  });

  customerConsultantsYear.forEach((consultantIds) => {
    const ids = Array.from(consultantIds);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = 0; j < ids.length; j += 1) {
        if (i === j) continue;
        const left = ids[i];
        const right = ids[j];
        if (!consultantCollaborators.has(left)) consultantCollaborators.set(left, new Map());
        const map = consultantCollaborators.get(left);
        map.set(right, (map.get(right) || 0) + 1);
      }
    }
  });

  const groupMap = new Map();
  const UNASSIGNED_GROUP_LABEL = "Inget kostnadsställe";
  const unassignedCustomerSet = new Set(costcenterToCustomers.get("UNASSIGNED") || []);
  const coveredUnassignedCustomers = new Set();

  const ensureGroup = (groupName) => {
    const key = groupName || "Ej grupp";
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        groupName: key,
        consultants: [],
        customerSet: new Set(),
      });
    }
    return groupMap.get(key);
  };

  consultants.forEach((consultant) => {
    const groupName = consultant.costCenter ? consultant.groupName : UNASSIGNED_GROUP_LABEL;
    const group = ensureGroup(groupName);

    const costCenterCustomers = consultant.costCenter
      ? Array.from(costcenterToCustomers.get(consultant.costCenter) || [])
      : [];
    const touchedCustomers = Array.from(consultant.customerHoursYear.keys());

    const customerNumbers = (consultant.costCenter
      ? costCenterCustomers
      : touchedCustomers.filter(num => unassignedCustomerSet.has(num))
    ).sort((a, b) => a.localeCompare(b, "sv-SE", { numeric: true }));

    if (customerNumbers.length === 0) {
      return;
    }

    customerNumbers.forEach(num => group.customerSet.add(num));
    if (!consultant.costCenter) {
      customerNumbers.forEach(num => coveredUnassignedCustomers.add(num));
    }

    const collaboratorMap = consultantCollaborators.get(consultant.employeeId) || new Map();
    const topCollaboratorPair = Array.from(collaboratorMap.entries()).sort((a, b) => b[1] - a[1])[0];
    const topCollaboratorName = topCollaboratorPair
      ? (consultants.get(topCollaboratorPair[0])?.employeeName || topCollaboratorPair[0])
      : "-";

    const customerRows = customerNumbers.map(customerNumber => {
      const metrics = customerMetrics.get(customerNumber) || {
        customerNumber,
        customerLabel: customerInfoByNumber.get(customerNumber)?.customerLabel || `${customerNumber} - Okänd kund`,
        invoiceTotal: 0,
        invoiceTotalYear: 0,
        contractTotal: 0,
      };

      const hoursYear = consultant.customerHoursYear.get(customerNumber) || 0;
      const rowsYear = consultant.customerRowsYear.get(customerNumber) || 0;
      const plannedHoursPerMonth = hoursYear / elapsedMonths;
      const revenuePerHour = hoursYear > 0 ? metrics.invoiceTotalYear / hoursYear : null;
      const requiredHoursPerMonth =
        remainingMonths > 0 && metrics.contractTotal > 0 && revenuePerHour
          ? Math.max(0, (metrics.contractTotal / revenuePerHour) - hoursYear) / remainingMonths
          : null;

      const consultantHoursOnCustomer = customerConsultantHoursYear.get(customerNumber) || new Map();
      const others = Array.from(consultantHoursOnCustomer.entries()).filter(([id]) => id !== consultant.employeeId);
      const topOther = others.sort((a, b) => b[1] - a[1])[0];
      const topOtherName = topOther ? (consultants.get(topOther[0])?.employeeName || topOther[0]) : "-";

      return {
        key: `${consultant.employeeId}::${customerNumber}`,
        customerNumber,
        customerLabel: metrics.customerLabel,
        customerCount: 1,
        invoiceTotal: metrics.invoiceTotal,
        invoiceTotalYear: metrics.invoiceTotalYear,
        contractTotal: metrics.contractTotal,
        forecastRevenueYear: (metrics.invoiceTotalYear / elapsedMonths) * 12,
        hoursYear,
        plannedHoursPerMonth,
        requiredHoursPerMonth,
        revenuePerHour,
        contractGapYear: metrics.contractTotal - metrics.invoiceTotalYear,
        rowsYear,
        collaboratorCount: others.length,
        topCollaborator: topOtherName === "-" ? "-" : `${topOtherName}`,
      };
    });

    group.consultants.push({
      key: consultant.employeeId,
      name: consultant.employeeName,
      customerCountYear: customerNumbers.length,
      invoiceTotalYear: customerRows.reduce((sum, row) => sum + (row.invoiceTotalYear || 0), 0),
      hoursYear: consultant.hoursYear,
      internalHoursYear: consultant.internalHoursYear,
      rowsYear: consultant.rowsYear,
      collaboratorCount: collaboratorMap.size,
      topCollaborator: topCollaboratorName === "-" ? "-" : `${topCollaboratorName} (${topCollaboratorPair?.[1] || 0} kunder)`,
      customerRows,
    });
  });

  const remainingUnassignedCustomers = Array.from(unassignedCustomerSet)
    .filter(num => !coveredUnassignedCustomers.has(num))
    .sort((a, b) => a.localeCompare(b, "sv-SE", { numeric: true }));

  if (remainingUnassignedCustomers.length > 0) {
    const group = ensureGroup(UNASSIGNED_GROUP_LABEL);
    remainingUnassignedCustomers.forEach(num => group.customerSet.add(num));

    const customerRows = remainingUnassignedCustomers.map(customerNumber => {
      const metrics = customerMetrics.get(customerNumber) || {
        customerNumber,
        customerLabel: customerInfoByNumber.get(customerNumber)?.customerLabel || `${customerNumber} - Okänd kund`,
        invoiceTotal: 0,
        invoiceTotalYear: 0,
        contractTotal: 0,
      };

      return {
        key: `UNASSIGNED::${customerNumber}`,
        customerNumber,
        customerLabel: metrics.customerLabel,
        customerCount: 1,
        invoiceTotal: metrics.invoiceTotal,
        invoiceTotalYear: metrics.invoiceTotalYear,
        contractTotal: metrics.contractTotal,
        forecastRevenueYear: (metrics.invoiceTotalYear / elapsedMonths) * 12,
        hoursYear: 0,
        plannedHoursPerMonth: 0,
        requiredHoursPerMonth: null,
        revenuePerHour: null,
        contractGapYear: metrics.contractTotal - metrics.invoiceTotalYear,
        rowsYear: 0,
        collaboratorCount: 0,
        topCollaborator: "-",
      };
    });

    group.consultants.push({
      key: "UNASSIGNED_CONSULTANT",
      name: "Ej tilldelad konsult",
      customerCountYear: remainingUnassignedCustomers.length,
      invoiceTotalYear: customerRows.reduce((sum, row) => sum + (row.invoiceTotalYear || 0), 0),
      hoursYear: 0,
      internalHoursYear: 0,
      rowsYear: 0,
      collaboratorCount: 0,
      topCollaborator: "-",
      customerRows,
    });
  }

  const groupRows = Array.from(groupMap.values()).map(group => {
    const customerNumbers = Array.from(group.customerSet);
    const totals = customerNumbers.reduce((acc, customerNumber) => {
      const metrics = customerMetrics.get(customerNumber);
      if (!metrics) return acc;
      acc.invoiceTotal += metrics.invoiceTotal;
      acc.invoiceTotalYear += metrics.invoiceTotalYear;
      acc.contractTotal += metrics.contractTotal;
      return acc;
    }, { invoiceTotal: 0, invoiceTotalYear: 0, contractTotal: 0 });

    const hoursYear = group.consultants.reduce((sum, c) => sum + (c.hoursYear || 0), 0);
    const internalHoursYear = group.consultants.reduce((sum, c) => sum + (c.internalHoursYear || 0), 0);
    const rowsYear = group.consultants.reduce((sum, c) => sum + (c.rowsYear || 0), 0);
    const forecastRevenueYear = (totals.invoiceTotalYear / elapsedMonths) * 12;
    const plannedHoursPerMonth = hoursYear / elapsedMonths;
    const revenuePerHourYear = hoursYear > 0 ? totals.invoiceTotalYear / hoursYear : null;
    const requiredHoursPerMonth =
      remainingMonths > 0 && totals.contractTotal > 0 && revenuePerHourYear
        ? Math.max(0, (totals.contractTotal / revenuePerHourYear) - hoursYear) / remainingMonths
        : null;

    return {
      key: group.key,
      groupName: group.groupName,
      customerCountYear: customerNumbers.length,
      invoiceTotal: totals.invoiceTotal,
      invoiceTotalYear: totals.invoiceTotalYear,
      contractTotal: totals.contractTotal,
      forecastRevenueYear,
      hoursYear,
      internalHoursYear,
      plannedHoursPerMonth,
      requiredHoursPerMonth,
      revenuePerHourYear,
      contractGapYear: totals.contractTotal - totals.invoiceTotalYear,
      rowsYear,
      consultants: group.consultants.sort((a, b) => b.hoursYear - a.hoursYear || a.name.localeCompare(b.name, "sv-SE")),
    };
  }).sort((a, b) => b.invoiceTotal - a.invoiceTotal || b.hoursYear - a.hoursYear);

  const revenueYearFromGroups = groupRows.reduce((sum, g) => {
    const inferredYear = (g.forecastRevenueYear / 12) * elapsedMonths;
    return sum + inferredYear;
  }, 0);

  const bureauKpis = {
    omsattningYear: revenueYearFromGroups,
    prognosYear: groupRows.reduce((sum, g) => sum + (g.forecastRevenueYear || 0), 0),
    avtalsvarde: groupRows.reduce((sum, g) => sum + (g.contractTotal || 0), 0),
    timmarYear: groupRows.reduce((sum, g) => sum + (g.hoursYear || 0), 0),
    kunder: new Set(Array.from(customerMetrics.keys())).size,
    konsulter: consultants.size,
  };

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f1923 0%, #1a2e3b 100%)", padding: "32px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Byråvy</h1>
          <p style={{ color: "#6b8fa3", margin: "4px 0 0", fontSize: 14 }}>Grupperad enligt inställningar · {currentYear}</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" style={{ background: "#1a2e3b", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 10, padding: "8px 12px", fontSize: 14, textDecoration: "none" }}>
            Dashboard
          </Link>
          <Link href="/settings" style={{ background: "#1a2e3b", color: "#fff", border: "1px solid #2a4a5e", borderRadius: 10, padding: "8px 12px", fontSize: 14, textDecoration: "none" }}>
            Inställningar
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { label: `Fakturerat i år`, value: formatSEK(revenueYearFromGroups), color: "#00c97a" },
          { label: "Prognos helår", value: formatSEK(bureauKpis.prognosYear), color: "#13d07c" },
          { label: "Avtalsvärde", value: formatSEK(bureauKpis.avtalsvarde), color: "#8a6f42" },
          { label: "Nedlagda timmar i år", value: formatNum(bureauKpis.timmarYear, 1), color: "#1db3a7" },
          { label: "Intäkt/timme i år", value: bureauKpis.timmarYear > 0 ? formatSEK(revenueYearFromGroups / bureauKpis.timmarYear) : "-", color: "#3b9eff" },
          { label: "Gap mot avtal", value: formatSEK(bureauKpis.avtalsvarde - revenueYearFromGroups), color: "#ff6b6b" },
        ].map(card => (
          <div key={card.label} style={{ background: "#1a2e3b", borderRadius: 16, padding: "18px 20px", border: "1px solid #2a4a5e" }}>
            <p style={{ color: "#6b8fa3", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px" }}>{card.label}</p>
            <p style={{ fontSize: 25, fontWeight: 800, color: card.color, margin: 0 }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: "#1a2e3b", borderRadius: 16, border: "1px solid #2a4a5e", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #2a4a5e" }}>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: "0 0 6px" }}>Gruppöversikt</h2>
          <p style={{ color: "#6b8fa3", fontSize: 12, margin: 0 }}>Gul nivå motsvarar gruppnamn från inställningarna. Under gruppen visas konsulter, och under konsult visas kunder enligt konsultens kostnadsställe.</p>
        </div>

        <AgencyTeamTable groupRows={groupRows} />
      </div>
    </main>
  );
}

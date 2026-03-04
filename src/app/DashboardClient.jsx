"use client";
import { Fragment, useState, useMemo, useEffect } from "react";
import Link from "next/link";
// no supabase import on client any more (fetches via server endpoint)
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const MONTHS = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
const INVOICE_ROWS_ARE_EX_VAT = process.env.NEXT_PUBLIC_INVOICE_ROWS_ARE_EX_VAT !== "false";
const DEFAULT_SELECTED_YEAR = "2026";

function exMoms(total) {
  const num = parseFloat(total);
  if (isNaN(num)) return 0;
  return Math.round(num / 1.25);
}

function normalizeInvoiceRowAmount(value) {
  if (INVOICE_ROWS_ARE_EX_VAT) return value;
  return exMoms(value);
}

function parseLocalizedNumber(value) {
  if (value == null) return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function resolveInvoiceRowNumbers(row = {}) {
  const quantity = parseLocalizedNumber(
    row.Quantity ?? row.quantity ?? row.Qty ?? row.DeliveredQuantity ?? row.delivered_quantity
  );
  const unitPrice = parseLocalizedNumber(
    row.UnitPrice ?? row.unit_price ?? row.Price ?? row.price ?? row.PriceExcludingVAT ?? row.price_excluding_vat
  );
  const rawTotal =
    row.Total ?? row.total ?? row.TotalAmount ?? row.total_amount ?? row.RowTotal ?? row.row_total ?? row.Sum ?? row.sum;
  const total = rawTotal != null && String(rawTotal).trim() !== ""
    ? parseLocalizedNumber(rawTotal)
    : quantity * unitPrice;

  return { quantity, unitPrice, total };
}

function normalizeCostCenter(raw) {
  if (!raw) return "";
  if (typeof raw === "object") {
    return String(raw.CostCenter || raw.CostCenterCode || raw.CostCenterId || raw.Code || "").trim();
  }
  return String(raw).trim();
}

function normalizeCustomerNumber(raw) {
  if (!raw) return "";
  return String(raw).trim();
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isCustomerActiveInFortnox(customer = {}) {
  const activeRaw = customer?.active ?? customer?.Active;
  if (activeRaw === false) return false;
  if (activeRaw === true) return true;

  const inactiveRaw = customer?.inactive ?? customer?.Inactive;
  if (inactiveRaw === true) return false;

  const status = normalizeSearchText(customer?.status || customer?.Status || "");
  if (["inactive", "inaktiv", "disabled", "passive", "passiv"].includes(status)) {
    return false;
  }

  return true;
}

function getContractLineItems(row = {}) {
  const raw = row?.raw_data;
  if (!raw || typeof raw !== "object") return [];

  const candidates = [
    raw.ContractRows,
    raw.Rows,
    raw.ArticleRows,
    raw.InvoiceRows,
    raw.ContractRow,
    raw.ArticleRow,
  ];

  let sourceRows = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      sourceRows = candidate;
      break;
    }
    if (candidate && typeof candidate === "object") {
      sourceRows = [candidate];
      break;
    }
  }

  return sourceRows
    .map(item => {
      const articleNumber = String(item?.ArticleNumber || item?.article_number || item?.ArticleNo || item?.articleNo || "").trim();
      const name = String(item?.Description || item?.description || item?.ArticleName || item?.article_name || item?.Text || item?.text || "").trim();
      const qty = parseLocalizedNumber(item?.Quantity ?? item?.quantity ?? item?.Qty ?? item?.qty);
      const qtyText = qty > 0 ? ` (${qty})` : "";

      if (!articleNumber && !name) return null;
      return `${articleNumber || "-"} ${name || "-"}${qtyText}`.trim();
    })
    .filter(Boolean);
}

function isAbsenceTimeRow(row = {}) {
  const customerNumber = String(row.customer_number || "").trim();
  const isExternalCustomerRow = !!customerNumber && customerNumber !== "1";
  if (isExternalCustomerRow) return false;

  const combinedText = normalizeSearchText([
    row.activity,
    row.project_name,
    row.customer_name,
  ].filter(Boolean).join(" "));

  if (!combinedText) return false;

  return [
    "franvaro",
    "semester",
    "sjuk",
    "sjukdom",
    "vab",
    "foraldra",
    "permission",
    "tjanstledig",
    "ledig",
    "fritid",
    "absence",
    "vacation",
    "sick",
    "parental",
    "leave",
  ].some(keyword => combinedText.includes(keyword));
}

function findOptionByInput(options = [], input = "") {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;

  return (
    options.find(opt => String(opt.label || "").trim().toLowerCase() === value) ||
    options.find(opt => String(opt.value || "").trim().toLowerCase() === value) ||
    null
  );
}

export default function DashboardClient({
  invoices,
  customers: customersProp = [],
  initialInvoiceRows = [],
  articleCacheStatus = {},
  articleRegistry = [],
  articleRegistryStatus = {},
  timeReports = [],
  timeReportsFromDate = "2025-01-01",
  employeeMappings = [],
  articleGroupMappings = [],
  contractAccruals = [],
}) {

  // konvertera poster till en enhetlig form (stora/små fält)
  const data = useMemo(() => {
    return invoices.map(inv => ({
      document_number: inv.document_number || inv.DocumentNumber,
      customer_name: inv.customer_name || inv.CustomerName,
      customer_number: inv.customer_number || inv.CustomerNumber || "",
      invoice_date: inv.invoice_date || inv.InvoiceDate,
      total: inv.total || inv.Total,
      balance: inv.balance || inv.Balance,
      InvoiceRows: inv.InvoiceRows || inv.invoice_rows || [],
      your_reference: inv.your_reference || inv.YourReference || inv.YourReferenceNumber || null,
    }));
  }, [invoices]);

  const years = useMemo(() => {
    const s = new Set(data.map(i => i.invoice_date?.slice(0,4)).filter(Boolean));
    return [...s].sort().reverse();
  }, [data]);

  const customerNumberToName = useMemo(() => {
    const map = new Map();

    customersProp.forEach(c => {
      const num = normalizeCustomerNumber(c.customer_number || c.CustomerNumber || c.CustomerNo || c.CustomerId);
      const name = (c.name || c.Name || c.CustomerName || "").trim();
      if (num && name) map.set(num, name);
    });

    data.forEach(inv => {
      const num = normalizeCustomerNumber(inv.customer_number);
      const name = (inv.customer_name || "").trim();
      if (num && name && !map.has(num)) map.set(num, name);
    });

    return map;
  }, [customersProp, data]);

  const customerNumberToCostCenter = useMemo(() => {
    const map = new Map();
    customersProp.forEach(c => {
      const num = normalizeCustomerNumber(c.customer_number || c.CustomerNumber || c.CustomerNo || c.CustomerId);
      const cc = normalizeCostCenter(c.cost_center || c.CostCenter || c.CostCenterCode || c.CostCenterId);
      if (num) map.set(num, cc);
    });
    return map;
  }, [customersProp]);

  // Lista över kunder baserat på customer_number (för dropdown)
  const customers = useMemo(() => {
    const totalsByNumber = {};
    const inactiveCustomerNumbers = new Set(
      (customersProp || [])
        .filter(c => !isCustomerActiveInFortnox(c))
        .map(c => normalizeCustomerNumber(c.customer_number || c.CustomerNumber || c.CustomerNo || c.CustomerId))
        .filter(Boolean)
    );

    data.forEach(inv => {
      const num = normalizeCustomerNumber(inv.customer_number);
      const total = parseFloat(inv.total) || 0;
      if (num) totalsByNumber[num] = (totalsByNumber[num] || 0) + total;
    });

    const options = Object.entries(totalsByNumber)
      .filter(([num, value]) => value !== 0 && !inactiveCustomerNumbers.has(num))
      .map(([num]) => ({
        value: num,
        label: `${num} - ${customerNumberToName.get(num) || "Okänd kund"}`,
      }))
      .sort((a, b) => a.value.localeCompare(b.value, "sv-SE", { numeric: true }));

    return [{ value: "ALL", label: "Alla kunder" }, ...options];
  }, [data, customerNumberToName, customersProp]);

  // Kostnadsställen hämtade från kundkort (prop)
  const costcenters = useMemo(() => {
    const map = new Map();

    customersProp.forEach(c => {
      const code = normalizeCostCenter(c.cost_center || c.CostCenter || c.CostCenterCode || c.CostCenterId);
      const name = String(c.cost_center_name || c.CostCenterName || c.CostCenterDescription || "").trim();
      if (!code) return;
      if (!map.has(code) || (!map.get(code) && name)) {
        map.set(code, name);
      }
    });

    const options = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "sv-SE", { numeric: true }))
      .map(([code, name]) => ({
        value: code,
        label: name ? `${code} - ${name}` : code,
      }));

    return [{ value: "ALL", label: "Alla kostnadsställen" }, ...options];
  }, [customersProp]);

  const [selectedYear, setSelectedYear] = useState(DEFAULT_SELECTED_YEAR);
  const [selectedCustomer, setSelectedCustomer] = useState("ALL");
  const [selectedGroup, setSelectedGroup] = useState("ALL");
  const [selectedCostcenter, setSelectedCostcenter] = useState("ALL");
  const [yearInput, setYearInput] = useState(DEFAULT_SELECTED_YEAR);
  const [customerInput, setCustomerInput] = useState("");
  const [costcenterInput, setCostcenterInput] = useState("");
  const [groupInput, setGroupInput] = useState("");
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [timeEntriesModal, setTimeEntriesModal] = useState(null);
  const [contractModal, setContractModal] = useState(null);
  const [expandedCustomerContracts, setExpandedCustomerContracts] = useState(new Set());
  const [expandedModalContracts, setExpandedModalContracts] = useState(new Set());
  const [modalExpandedInvoices, setModalExpandedInvoices] = useState(new Set());
  const [modalHoveredInvoice, setModalHoveredInvoice] = useState(null);
  const [modalInvoiceRowsLoading, setModalInvoiceRowsLoading] = useState({});
  const [modalInvoiceRowsError, setModalInvoiceRowsError] = useState({});
  const [invoiceRows, setInvoiceRows] = useState(() => {
    const grouped = {};
    (initialInvoiceRows || []).forEach(row => {
      const invoiceNumber = String(row.invoice_number || "").trim();
      if (!invoiceNumber) return;
      if (!grouped[invoiceNumber]) grouped[invoiceNumber] = [];
      grouped[invoiceNumber].push(row);
    });
    return grouped;
  });
  const [syncingArticles, setSyncingArticles] = useState(false);
  const [syncingArticleRegistry, setSyncingArticleRegistry] = useState(false);
  const [syncingTimeReports, setSyncingTimeReports] = useState(false);
  const [syncingCostcenters, setSyncingCostcenters] = useState(false);
  const [syncingContracts, setSyncingContracts] = useState(false);
  const [timeReportsData, setTimeReportsData] = useState(() => (Array.isArray(timeReports) ? timeReports : []));
  const [timeReportsLoading, setTimeReportsLoading] = useState(() => !Array.isArray(timeReports) || timeReports.length === 0);
  const [contractAccrualsData, setContractAccrualsData] = useState(() => (Array.isArray(contractAccruals) ? contractAccruals : []));
  const [contractAccrualsLoading, setContractAccrualsLoading] = useState(() => !Array.isArray(contractAccruals) || contractAccruals.length === 0);

  useEffect(() => {
    let isCancelled = false;

    if (Array.isArray(timeReports) && timeReports.length > 0) {
      setTimeReportsData(timeReports);
      setTimeReportsLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    const loadTimeReports = async () => {
      setTimeReportsLoading(true);
      try {
        const query = new URLSearchParams({ fromDate: timeReportsFromDate }).toString();
        const res = await fetch(`/api/time-reports?${query}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (!isCancelled) {
            setTimeReportsData([]);
          }
          return;
        }

        if (!isCancelled) {
          setTimeReportsData(Array.isArray(data.rows) ? data.rows : []);
        }
      } catch {
        if (!isCancelled) {
          setTimeReportsData([]);
        }
      } finally {
        if (!isCancelled) {
          setTimeReportsLoading(false);
        }
      }
    };

    loadTimeReports();

    return () => {
      isCancelled = true;
    };
  }, [timeReports, timeReportsFromDate]);

  useEffect(() => {
    let isCancelled = false;

    if (Array.isArray(contractAccruals) && contractAccruals.length > 0) {
      setContractAccrualsData(contractAccruals);
      setContractAccrualsLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    const loadContractAccruals = async () => {
      setContractAccrualsLoading(true);
      try {
        const res = await fetch("/api/contract-accruals", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (!isCancelled) {
            setContractAccrualsData([]);
          }
          return;
        }

        if (!isCancelled) {
          setContractAccrualsData(Array.isArray(data.rows) ? data.rows : []);
        }
      } catch {
        if (!isCancelled) {
          setContractAccrualsData([]);
        }
      } finally {
        if (!isCancelled) {
          setContractAccrualsLoading(false);
        }
      }
    };

    loadContractAccruals();

    return () => {
      isCancelled = true;
    };
  }, [contractAccruals]);

  const totalInvoicesInCacheStatus = Number(articleCacheStatus.totalInvoices || 0);
  const invoicesWithRowsInCacheStatus = Number(articleCacheStatus.withRows || 0);
  const missingInvoiceRowsInCacheStatus = Number(articleCacheStatus.missing || 0);
  const usedArticleNumbersInStatus = Number(articleRegistryStatus.usedArticleNumbers || 0);
  const withRegistryMatchInStatus = Number(articleRegistryStatus.withRegistryMatch || 0);
  const missingRegistryMatchInStatus = Number(articleRegistryStatus.missing || 0);

  const articleNumberToName = useMemo(() => {
    const map = new Map();
    (articleRegistry || []).forEach(a => {
      const number = String(a.article_number || a.ArticleNumber || "").trim();
      const name = String(a.article_name || a.description || a.Description || "").trim();
      if (number) map.set(number, name || number);
    });
    return map;
  }, [articleRegistry]);

  const employeeMappingById = useMemo(() => {
    const map = new Map();
    (employeeMappings || []).forEach(row => {
      const employeeId = String(row.employee_id || "").trim();
      if (!employeeId) return;

      map.set(employeeId, {
        employee_name: String(row.employee_name || "").trim(),
        group_name: String(row.group_name || "").trim(),
        cost_center: String(row.cost_center || "").trim(),
      });
    });
    return map;
  }, [employeeMappings]);

  const normalizedTimeReports = useMemo(() => {
    return (timeReportsData || []).map(row => ({
      report_date: String(row.report_date || row.ReportDate || row.Date || "").slice(0, 10),
      employee_id: String(row.employee_id || row.EmployeeId || "").trim(),
      employee_name: String(row.employee_name || row.EmployeeName || row.Name || "").trim(),
      customer_number: String(row.customer_number || row.CustomerNumber || "").trim(),
      customer_name: String(row.customer_name || row.CustomerName || "").trim(),
      project_name: String(row.project_name || row.ProjectName || "").trim(),
      activity: String(row.activity || row.Activity || "").trim(),
      hours: parseFloat(row.hours || row.Hours || 0) || 0,
      description: String(row.description || row.Description || "").trim(),
      updated_at: String(row.updated_at || row.UpdatedAt || "").trim(),
    })).map(row => {
      const mapping = employeeMappingById.get(row.employee_id);
      const mappedName = mapping?.employee_name || row.employee_name;
      const groupName = mapping?.group_name || "Ej grupp";

      return {
        ...row,
        employee_name: mappedName || row.employee_id || "Okänd",
        employee_group: groupName,
      };
    });
  }, [timeReportsData, employeeMappingById]);

  const latestTimeSyncLabel = useMemo(() => {
    const latest = normalizedTimeReports
      .map(row => String(row.updated_at || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);

    if (!latest) return "-";

    const date = new Date(latest);
    if (Number.isNaN(date.getTime())) return latest;

    return new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }, [normalizedTimeReports]);

  const groups = useMemo(() => {
    const allGroups = Array.from(new Set(
      normalizedTimeReports
        .map(row => String(row.employee_group || "").trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, "sv-SE"));

    return [{ value: "ALL", label: "Alla grupper" }, ...allGroups.map(g => ({ value: g, label: g }))];
  }, [normalizedTimeReports]);

  const customerNumbersForSelectedGroup = useMemo(() => {
    if (selectedGroup === "ALL") return null;

    const numbers = new Set();
    normalizedTimeReports.forEach(row => {
      const yearMatch = !selectedYear || row.report_date.startsWith(selectedYear);
      const cc = customerNumberToCostCenter.get(row.customer_number) || "";
      const costcenterMatch = selectedCostcenter === "ALL" || cc === selectedCostcenter;
      const groupMatch = row.employee_group === selectedGroup;

      if (yearMatch && costcenterMatch && groupMatch && row.customer_number) {
        numbers.add(row.customer_number);
      }
    });

    return numbers;
  }, [normalizedTimeReports, selectedGroup, selectedYear, selectedCostcenter, customerNumberToCostCenter]);

  const employeeIdsForSelectedCostcenter = useMemo(() => {
    if (selectedCostcenter === "ALL") return null;

    const ids = new Set();
    (employeeMappings || []).forEach(row => {
      const employeeId = String(row.employee_id || "").trim();
      const costCenter = String(row.cost_center || "").trim();
      if (employeeId && costCenter && costCenter === selectedCostcenter) {
        ids.add(employeeId);
      }
    });

    return ids;
  }, [employeeMappings, selectedCostcenter]);

  const customerNumbersForSelectedCostcenter = useMemo(() => {
    if (selectedCostcenter === "ALL") return null;

    const numbers = new Set();

    data.forEach(inv => {
      const customerNumber = normalizeCustomerNumber(inv.customer_number);
      if (!customerNumber) return;
      const cc = customerNumberToCostCenter.get(customerNumber) || "";
      if (cc === selectedCostcenter) {
        numbers.add(customerNumber);
      }
    });

    normalizedTimeReports.forEach(row => {
      const customerNumber = normalizeCustomerNumber(row.customer_number);
      if (!customerNumber) return;
      const cc = customerNumberToCostCenter.get(customerNumber) || "";
      if (cc === selectedCostcenter) {
        numbers.add(customerNumber);
      }
    });

    return numbers;
  }, [selectedCostcenter, data, normalizedTimeReports, customerNumberToCostCenter]);

  const timeCostcenterFilterMode = useMemo(() => {
    if (selectedCostcenter === "ALL") return null;

    const mappedUsersCount = employeeIdsForSelectedCostcenter?.size || 0;
    if (mappedUsersCount > 0) {
      return { mode: "employee", mappedUsersCount };
    }

    const selectedCostcenterOption = costcenters.find(c => c.value === selectedCostcenter);
    const selectedCostcenterLabelForMatch = selectedCostcenterOption ? selectedCostcenterOption.label : selectedCostcenter;
    const selectedCostcenterName = String(selectedCostcenterLabelForMatch || "").includes(" - ")
      ? String(selectedCostcenterLabelForMatch).split(" - ").slice(1).join(" - ").trim()
      : "";

    if (selectedCostcenterName) {
      const targetName = normalizeSearchText(selectedCostcenterName);
      const matchedEmployeeIds = new Set(
        (employeeMappings || [])
          .map(row => ({
            employeeId: String(row.employee_id || "").trim(),
            employeeName: normalizeSearchText(row.employee_name || ""),
          }))
          .filter(row => row.employeeId && row.employeeName === targetName)
          .map(row => row.employeeId)
      );

      if (matchedEmployeeIds.size > 0) {
        return { mode: "employee-name-fallback", mappedUsersCount: matchedEmployeeIds.size, employeeIds: matchedEmployeeIds };
      }
    }

    return { mode: "customer", mappedUsersCount: 0 };
  }, [selectedCostcenter, costcenters, employeeIdsForSelectedCostcenter, employeeMappings]);

  const filtered = useMemo(() => {
    return data.filter(inv => {
      const yearMatch = !selectedYear || inv.invoice_date?.startsWith(selectedYear);
      const invCustomerNumber = normalizeCustomerNumber(inv.customer_number);
      const custMatch = selectedCustomer === "ALL" || invCustomerNumber === selectedCustomer;
      const cc = customerNumberToCostCenter.get(invCustomerNumber) || "";
      const costcenterMatch = selectedCostcenter === "ALL" || cc === selectedCostcenter;
      const groupMatch = selectedGroup === "ALL" || customerNumbersForSelectedGroup?.has(invCustomerNumber);
      const hasTotal = parseFloat(inv.total) !== 0;
      return yearMatch && custMatch && costcenterMatch && groupMatch && hasTotal;
    });
  }, [data, selectedYear, selectedCustomer, selectedCostcenter, selectedGroup, customerNumberToCostCenter, customerNumbersForSelectedGroup]);

  const filteredInvoiceNumbers = useMemo(() => {
    return Array.from(new Set(
      filtered
        .map(inv => String(inv.document_number || "").trim())
        .filter(Boolean)
    ));
  }, [filtered]);

  useEffect(() => {
    let cancelled = false;

    const missingInvoiceNumbers = filteredInvoiceNumbers
      .filter(invoiceNumber => invoiceRows[invoiceNumber] === undefined)
      .slice(0, 200);

    if (missingInvoiceNumbers.length === 0) return () => { cancelled = true; };

    const loadInvoiceRowsFromDb = async () => {
      try {
        const res = await fetch("/api/invoice-rows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceNumbers: missingInvoiceNumbers }),
          cache: "no-store",
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok === false) return;

        if (!cancelled) {
          const rowsByInvoice = payload?.rowsByInvoice || {};
          setInvoiceRows(prev => {
            const next = { ...prev };
            missingInvoiceNumbers.forEach(invoiceNumber => {
              if (next[invoiceNumber] !== undefined) return;
              next[invoiceNumber] = Array.isArray(rowsByInvoice[invoiceNumber]) ? rowsByInvoice[invoiceNumber] : [];
            });
            return next;
          });
        }
      } catch {
        // no-op: behåll befintlig vy, nästa filterändring kan försöka igen
      }
    };

    loadInvoiceRowsFromDb();

    return () => {
      cancelled = true;
    };
  }, [filteredInvoiceNumbers, invoiceRows]);

  const selectedCustomerLabel = useMemo(() => {
    const selected = customers.find(c => c.value === selectedCustomer);
    return selected ? selected.label : selectedCustomer;
  }, [customers, selectedCustomer]);

  const yearOptions = useMemo(() => {
    return [{ value: "", label: "Alla år" }, ...years.map(y => ({ value: y, label: y }))];
  }, [years]);

  const monthlyData = useMemo(() => {
    if (selectedYear) {
      const map = {};
      filtered.forEach(inv => {
        const month = inv.invoice_date?.slice(5,7);
        if (!month) return;
        const idx = parseInt(month, 10) - 1;
        if (!map[idx]) map[idx] = { month: MONTHS[idx], omsattning: 0, antal: 0 };
        map[idx].omsattning += exMoms(inv.total || inv.Total);
        map[idx].antal += 1;
      });
      return Array.from({length: 12}, (_, i) => map[i] || { month: MONTHS[i], omsattning: 0, antal: 0 });
    }

    const map = {};
    filtered.forEach(inv => {
      const date = String(inv.invoice_date || "");
      const yearMonth = date.slice(0, 7);
      const month = date.slice(5, 7);
      const year = date.slice(0, 4);
      if (!yearMonth || !month || !year) return;
      const idx = parseInt(month, 10) - 1;
      if (idx < 0 || idx > 11) return;
      if (!map[yearMonth]) {
        map[yearMonth] = {
          month: `${MONTHS[idx]} ${year}`,
          omsattning: 0,
          antal: 0,
          sortKey: yearMonth,
        };
      }
      map[yearMonth].omsattning += exMoms(inv.total || inv.Total);
      map[yearMonth].antal += 1;
    });

    return Object.values(map).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filtered, selectedYear]);

  const customerData = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const number = normalizeCustomerNumber(inv.customer_number);
      const key = number || `NAME:${inv.customer_name || "Okänd"}`;
      const name = number
        ? (customerNumberToName.get(number) || inv.customer_name || "Okänd")
        : (inv.customer_name || "Okänd");

      if (!map[key]) map[key] = { key, number, name, omsattning: 0, antal: 0 };
      map[key].omsattning += exMoms(inv.total || inv.Total);
      map[key].antal += 1;
    });
    return Object.values(map).filter(c => c.omsattning !== 0).sort((a,b) => b.omsattning - a.omsattning).slice(0, 10);
  }, [filtered, customerNumberToName]);

  const costcenterFocusedInvoices = useMemo(() => {
    if (selectedCostcenter === "ALL") return [];
    return data.filter(inv => {
      const yearMatch = !selectedYear || inv.invoice_date?.startsWith(selectedYear);
      const invCustomerNumber = normalizeCustomerNumber(inv.customer_number);
      const cc = customerNumberToCostCenter.get(invCustomerNumber) || "";
      const groupMatch = selectedGroup === "ALL" || customerNumbersForSelectedGroup?.has(invCustomerNumber);
      const hasTotal = parseFloat(inv.total) !== 0;
      return yearMatch && cc === selectedCostcenter && groupMatch && hasTotal;
    });
  }, [data, selectedCostcenter, selectedYear, selectedGroup, customerNumberToCostCenter, customerNumbersForSelectedGroup]);

  const costcenterCustomerData = useMemo(() => {
    const map = {};
    costcenterFocusedInvoices.forEach(inv => {
      const number = normalizeCustomerNumber(inv.customer_number);
      const key = number || `NAME:${inv.customer_name || "Okänd"}`;
      const name = number
        ? (customerNumberToName.get(number) || inv.customer_name || "Okänd")
        : (inv.customer_name || "Okänd");

      if (!map[key]) {
        map[key] = {
          key,
          number,
          name,
          omsattning: 0,
          antal: 0,
          senasteFaktura: "",
        };
      }

      map[key].omsattning += exMoms(inv.total || inv.Total);
      map[key].antal += 1;
      const currentDate = inv.invoice_date || "";
      if (!map[key].senasteFaktura || currentDate > map[key].senasteFaktura) {
        map[key].senasteFaktura = currentDate;
      }
    });

    return Object.values(map)
      .filter(c => c.omsattning !== 0)
      .sort((a, b) => b.omsattning - a.omsattning);
  }, [costcenterFocusedInvoices, customerNumberToName]);

  const contractStatsByCustomer = useMemo(() => {
    const map = new Map();

    (contractAccrualsData || []).forEach(row => {
      const customerNumber = normalizeCustomerNumber(row.customer_number);
      if (!customerNumber) return;

      const total = parseFloat(row.total || 0) || 0;
      const prev = map.get(customerNumber) || { count: 0, total: 0 };
      map.set(customerNumber, {
        count: prev.count + 1,
        total: prev.total + total,
      });
    });

    return map;
  }, [contractAccrualsData]);

  const contractRowsByCustomer = useMemo(() => {
    const map = new Map();

    (contractAccrualsData || []).forEach(row => {
      const customerNumber = normalizeCustomerNumber(row.customer_number);
      if (!customerNumber) return;

      if (!map.has(customerNumber)) {
        map.set(customerNumber, []);
      }

      map.get(customerNumber).push(row);
    });

    map.forEach((rows, customerNumber) => {
      rows.sort((a, b) => {
        const aDate = String(a.start_date || a.end_date || "");
        const bDate = String(b.start_date || b.end_date || "");
        return bDate.localeCompare(aDate);
      });
      map.set(customerNumber, rows);
    });

    return map;
  }, [contractAccrualsData]);

  const selectedCustomerContracts = useMemo(() => {
    if (!selectedCustomer || selectedCustomer === "ALL") return [];
    return contractRowsByCustomer.get(selectedCustomer) || [];
  }, [selectedCustomer, contractRowsByCustomer]);

  const selectedCostcenterLabel = useMemo(() => {
    const selected = costcenters.find(c => c.value === selectedCostcenter);
    return selected ? selected.label : selectedCostcenter;
  }, [costcenters, selectedCostcenter]);

  const articleData = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const invoiceNumber = String(inv.document_number || "").trim();
      const cachedRows = invoiceRows[invoiceNumber];
      const rows = Array.isArray(cachedRows) ? cachedRows : (inv.InvoiceRows || []);
      rows.forEach(row => {
        const articleNumber = String(row.ArticleNumber || row.article_number || row.ArticleNo || row.article_no || "").trim();
        const fallbackName = row.ArticleName || row.article_name || row.Description || row.description || "Okänd artikel";
        const resolvedName = (articleNumberToName.get(articleNumber) || fallbackName || "Okänd artikel").trim();
        const key = articleNumber || `NAME:${resolvedName}`;

        if (!map[key]) map[key] = { key, articleNumber, name: resolvedName, omsattning: 0, antal: 0, quantity: 0 };
        const { total: rowTotal, quantity: rowQuantity } = resolveInvoiceRowNumbers(row);
        map[key].omsattning += normalizeInvoiceRowAmount(rowTotal);
        map[key].quantity += rowQuantity;
        map[key].antal += 1;
      });
    });
    return Object.values(map).filter(a => a.omsattning !== 0).sort((a,b) => b.omsattning - a.omsattning);
  }, [filtered, invoiceRows, articleNumberToName]);

  const articleGroupStats = useMemo(() => {
    const mappingByArticle = new Map();
    (articleGroupMappings || []).forEach(row => {
      const articleNumber = String(row.article_number || "").trim();
      const groupName = String(row.group_name || "").trim();
      const active = row.active === false ? false : true;
      if (articleNumber && groupName && active) {
        mappingByArticle.set(articleNumber, {
          groupName,
          articleName: String(row.article_name || "").trim(),
        });
      }
    });

    const grouped = {};
    articleData.forEach(article => {
      const articleNumber = String(article.articleNumber || "").trim();
      if (!articleNumber) return;

      const mapping = mappingByArticle.get(articleNumber);
      if (!mapping) return;

      const key = mapping.groupName;
      if (!grouped[key]) {
        grouped[key] = {
          key,
          groupName: mapping.groupName,
          omsattning: 0,
          antal: 0,
          quantity: 0,
          articleNumbers: new Set(),
        };
      }

      grouped[key].omsattning += parseFloat(article.omsattning || 0) || 0;
      grouped[key].antal += parseFloat(article.antal || 0) || 0;
      grouped[key].quantity += parseFloat(article.quantity || 0) || 0;
      grouped[key].articleNumbers.add(articleNumber);
    });

    return Object.values(grouped)
      .map(group => ({
        ...group,
        articleCount: group.articleNumbers.size,
      }))
      .sort((a, b) => b.omsattning - a.omsattning);
  }, [articleData, articleGroupMappings]);

  const filteredTimeReports = useMemo(() => {
    return normalizedTimeReports.filter(row => {
      const yearMatch = !selectedYear || row.report_date.startsWith(selectedYear);
      const customerMatch = selectedCustomer === "ALL" || row.customer_number === selectedCustomer;
      const cc = customerNumberToCostCenter.get(row.customer_number) || "";
      const mappedEmployeeFilterEnabled = timeCostcenterFilterMode?.mode === "employee";
      const mappedByNameFilterEnabled = timeCostcenterFilterMode?.mode === "employee-name-fallback";
      const effectiveEmployeeIds = mappedEmployeeFilterEnabled
        ? employeeIdsForSelectedCostcenter
        : (mappedByNameFilterEnabled ? timeCostcenterFilterMode?.employeeIds : null);
      const isMappedEmployee = !!(effectiveEmployeeIds && effectiveEmployeeIds.has(row.employee_id));
      const isCollaboratorOnCostcenterCustomer = mappedEmployeeFilterEnabled && customerNumbersForSelectedCostcenter?.has(row.customer_number);
      const costcenterMatch = selectedCostcenter === "ALL"
        ? true
        : mappedEmployeeFilterEnabled
          ? (isMappedEmployee || isCollaboratorOnCostcenterCustomer)
          : mappedByNameFilterEnabled
            ? isMappedEmployee
            : cc === selectedCostcenter;
      const groupMatch = selectedGroup === "ALL" || row.employee_group === selectedGroup;
      const hasHours = row.hours > 0;
      return yearMatch && customerMatch && costcenterMatch && groupMatch && hasHours;
    });
  }, [normalizedTimeReports, selectedYear, selectedCustomer, selectedCostcenter, selectedGroup, customerNumberToCostCenter, employeeIdsForSelectedCostcenter, customerNumbersForSelectedCostcenter, timeCostcenterFilterMode]);

  const totalHours = useMemo(
    () => filteredTimeReports.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0),
    [filteredTimeReports]
  );

  const monthlyRevenuePerHourData = useMemo(() => {
    const map = {};

    const ensureEntry = (dateValue) => {
      const date = String(dateValue || "");
      const year = date.slice(0, 4);
      const month = date.slice(5, 7);
      if (!year || !month) return null;

      const idx = parseInt(month, 10) - 1;
      if (idx < 0 || idx > 11) return null;

      const key = `${year}-${month}`;
      if (!map[key]) {
        map[key] = {
          key,
          month: `${MONTHS[idx]} ${year}`,
          omsattning: 0,
          timmar: 0,
        };
      }
      return map[key];
    };

    filtered.forEach(inv => {
      const entry = ensureEntry(inv.invoice_date);
      if (!entry) return;
      entry.omsattning += exMoms(inv.total || inv.Total);
    });

    filteredTimeReports.forEach(row => {
      const entry = ensureEntry(row.report_date);
      if (!entry) return;
      entry.timmar += parseFloat(row.hours) || 0;
    });

    if (selectedYear) {
      return Array.from({ length: 12 }, (_, i) => {
        const month = String(i + 1).padStart(2, "0");
        const key = `${selectedYear}-${month}`;
        const row = map[key] || {
          key,
          month: `${MONTHS[i]} ${selectedYear}`,
          omsattning: 0,
          timmar: 0,
        };

        return {
          ...row,
          omsattningPerTimme: row.timmar > 0 ? row.omsattning / row.timmar : null,
        };
      });
    }

    return Object.values(map)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(row => ({
        ...row,
        omsattningPerTimme: row.timmar > 0 ? row.omsattning / row.timmar : null,
      }));
  }, [filtered, filteredTimeReports, selectedYear]);

  const timeByEmployee = useMemo(() => {
    const map = {};
    const requireCustomerNumberForCustomerHours = selectedCostcenter !== "ALL";

    filteredTimeReports.forEach(row => {
      const key = row.employee_id || row.employee_name || "Okänd";
      if (!map[key]) {
        map[key] = {
          key,
          employeeId: row.employee_id || "",
          employee: row.employee_name || row.employee_id || "Okänd",
          group: row.employee_group || "Ej grupp",
          hours: 0,
          internalHours: 0,
          absenceHours: 0,
          isMappedEmployee: false,
          rows: 0,
        };
      }
      const rowHours = parseFloat(row.hours) || 0;
      const customerNumber = String(row.customer_number || "").trim();
      const isInternal = customerNumber === "1";
      const isAbsence = isAbsenceTimeRow(row);
      const isExternalCustomerRow = !!customerNumber && customerNumber !== "1";

      if (isAbsence) {
        map[key].absenceHours += rowHours;
      } else if (isInternal) {
        // Internal hours are calculated in a dedicated pass below to avoid
        // mixing collaborator filters and double counting in cost center mode.
      } else if (!requireCustomerNumberForCustomerHours || isExternalCustomerRow) {
        map[key].hours += rowHours;
        map[key].rows += 1;
      }
      map[key].isMappedEmployee = !!(map[key].employeeId && employeeIdsForSelectedCostcenter?.has(map[key].employeeId));
    });

    const employeeKeys = new Set(Object.keys(map));
    const includeInternal = selectedCustomer === "ALL" || selectedCustomer === "1";

    if (selectedCostcenter !== "ALL" && includeInternal) {
      normalizedTimeReports.forEach(row => {
        const key = row.employee_id || row.employee_name || "Okänd";
        if (!employeeKeys.has(key)) return;

        const yearMatch = !selectedYear || row.report_date.startsWith(selectedYear);
        const groupMatch = selectedGroup === "ALL" || row.employee_group === selectedGroup;
        const isInternal = String(row.customer_number || "").trim() === "1";
        const isAbsence = isAbsenceTimeRow(row);
        if (yearMatch && groupMatch && isInternal && !isAbsence) {
          map[key].internalHours += parseFloat(row.hours) || 0;
        }
      });
    }

    const rows = Object.values(map);
    const sortedRows = rows.sort((a, b) => b.hours - a.hours);

    if (selectedCostcenter !== "ALL") {
      return sortedRows.slice(0, 1);
    }

    return sortedRows.slice(0, 20);
  }, [filteredTimeReports, normalizedTimeReports, selectedYear, selectedGroup, selectedCustomer, selectedCostcenter, employeeIdsForSelectedCostcenter]);

  const totalDisplayedTimeHours = useMemo(
    () => timeByEmployee.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0),
    [timeByEmployee]
  );

  const visibleEmployeesMissingCostCenterMapping = useMemo(() => {
    if (selectedCostcenter === "ALL") return [];

    return timeByEmployee
      .filter(row => {
        const employeeId = String(row.employeeId || "").trim();
        if (!employeeId) return true;
        const mapping = employeeMappingById.get(employeeId);
        const groupName = String(mapping?.group_name || "").trim();
        const isRemovedGroup = normalizeSearchText(groupName) === "borttagen";
        if (isRemovedGroup) return false;
        const mappedCostCenter = String(mapping?.cost_center || "").trim();
        return !mappedCostCenter;
      })
      .map(row => row.employee)
      .filter(Boolean);
  }, [selectedCostcenter, timeByEmployee, employeeMappingById]);

  const totalCustomerHoursOnSelectedCostcenterCustomers = useMemo(() => {
    if (selectedCostcenter === "ALL") return totalDisplayedTimeHours;

    return filteredTimeReports.reduce((sum, row) => {
      const customerNumber = String(row.customer_number || "").trim();
      const isExternalCustomerRow = !!customerNumber && customerNumber !== "1";
      if (!isExternalCustomerRow) return sum;
      if (isAbsenceTimeRow(row)) return sum;
      if (customerNumbersForSelectedCostcenter && !customerNumbersForSelectedCostcenter.has(customerNumber)) return sum;
      return sum + (parseFloat(row.hours) || 0);
    }, 0);
  }, [selectedCostcenter, filteredTimeReports, customerNumbersForSelectedCostcenter, totalDisplayedTimeHours]);

  const collaborationInsight = useMemo(() => {
    if (selectedCostcenter === "ALL") return null;
    const customerHoursByEmployee = new Map();

    filteredTimeReports.forEach(row => {
      const customerNumber = String(row.customer_number || "").trim();
      const isExternalCustomerRow = !!customerNumber && customerNumber !== "1";
      if (!isExternalCustomerRow || isAbsenceTimeRow(row)) return;

      if (customerNumbersForSelectedCostcenter && !customerNumbersForSelectedCostcenter.has(customerNumber)) {
        return;
      }

      const employeeId = String(row.employee_id || "").trim();
      const employeeKey = employeeId || String(row.employee_name || "Okänd").trim();
      if (!employeeKey) return;

      const current = customerHoursByEmployee.get(employeeKey) || {
        employeeKey,
        employeeId: employeeId || null,
        employeeName: row.employee_name || employeeId || "Okänd",
        customerHours: 0,
        customerHoursByNumber: new Map(),
      };
      const rowHours = parseFloat(row.hours) || 0;
      current.customerHours += rowHours;
      current.customerHoursByNumber.set(
        customerNumber,
        (current.customerHoursByNumber.get(customerNumber) || 0) + rowHours
      );
      customerHoursByEmployee.set(employeeKey, current);
    });

    const allEmployees = Array.from(customerHoursByEmployee.values()).sort((a, b) => b.customerHours - a.customerHours);
    if (allEmployees.length === 0) return null;

    const visiblePrimaryKey = String(timeByEmployee?.[0]?.employeeId || timeByEmployee?.[0]?.key || "").trim();
    const primary =
      allEmployees.find(employee => employee.employeeKey === visiblePrimaryKey || (visiblePrimaryKey && employee.employeeId === visiblePrimaryKey)) ||
      allEmployees[0];

    const collaborators = allEmployees
      .filter(employee => employee.employeeKey !== primary.employeeKey)
      .sort((a, b) => b.customerHours - a.customerHours);

    const withDebugCustomers = (employee) => {
      const debugCustomers = Array.from(employee.customerHoursByNumber?.entries() || [])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([customerNumber, hours]) => {
          const costCenter = String(customerNumberToCostCenter.get(customerNumber) || "?").trim() || "?";
          return {
            customerNumber,
            costCenter,
            hours,
          };
        });

      return {
        ...employee,
        debugCustomers,
      };
    };

    return {
      primary: withDebugCustomers(primary),
      collaborators: collaborators.map(withDebugCustomers),
    };
  }, [selectedCostcenter, filteredTimeReports, customerNumbersForSelectedCostcenter, timeByEmployee, customerNumberToCostCenter]);

  const helpedColleaguesInsight = useMemo(() => {
    if (selectedCostcenter === "ALL" || !collaborationInsight?.primary) return null;

    const primaryKey = collaborationInsight.primary.employeeKey;
    if (!primaryKey) return null;

    const mappingsByCostcenter = new Map();
    (employeeMappings || []).forEach(row => {
      const employeeId = String(row.employee_id || "").trim();
      const employeeName = String(row.employee_name || "").trim();
      const costCenter = String(row.cost_center || "").trim();
      if (!employeeId || !costCenter) return;

      const current = mappingsByCostcenter.get(costCenter) || [];
      current.push({
        employeeId,
        employeeName: employeeName || employeeId,
      });
      mappingsByCostcenter.set(costCenter, current);
    });

    const candidateHoursByCustomerAndEmployee = new Map();
    normalizedTimeReports.forEach(row => {
      const yearMatch = !selectedYear || row.report_date.startsWith(selectedYear);
      const groupMatch = selectedGroup === "ALL" || row.employee_group === selectedGroup;
      if (!yearMatch || !groupMatch) return;

      const customerNumber = String(row.customer_number || "").trim();
      const isExternalCustomerRow = !!customerNumber && customerNumber !== "1";
      if (!isExternalCustomerRow || isAbsenceTimeRow(row)) return;

      const customerCostcenter = String(customerNumberToCostCenter.get(customerNumber) || "").trim();
      if (!customerCostcenter || customerCostcenter === selectedCostcenter) return;

      const employeeId = String(row.employee_id || "").trim();
      const employeeKey = employeeId || String(row.employee_name || "Okänd").trim();
      if (!employeeKey || employeeKey === primaryKey) return;

      const employeeCostcenter = String(employeeMappingById.get(employeeId)?.cost_center || "").trim();
      if (!employeeCostcenter || employeeCostcenter !== customerCostcenter) return;

      const customerMap = candidateHoursByCustomerAndEmployee.get(customerNumber) || new Map();
      const existing = customerMap.get(employeeKey) || {
        employeeKey,
        employeeId: employeeId || null,
        employeeName: row.employee_name || employeeId || "Okänd",
        hours: 0,
      };
      existing.hours += parseFloat(row.hours) || 0;
      customerMap.set(employeeKey, existing);
      candidateHoursByCustomerAndEmployee.set(customerNumber, customerMap);
    });

    const helpedByColleague = new Map();
    filteredTimeReports.forEach(row => {
      const customerNumber = String(row.customer_number || "").trim();
      const isExternalCustomerRow = !!customerNumber && customerNumber !== "1";
      if (!isExternalCustomerRow || isAbsenceTimeRow(row)) return;

      const employeeId = String(row.employee_id || "").trim();
      const employeeKey = employeeId || String(row.employee_name || "Okänd").trim();
      if (employeeKey !== primaryKey) return;

      const customerCostcenter = String(customerNumberToCostCenter.get(customerNumber) || "").trim();
      if (!customerCostcenter || customerCostcenter === selectedCostcenter) return;

      const rowHours = parseFloat(row.hours) || 0;
      if (rowHours <= 0) return;

      let owner = null;
      const scoredCandidates = Array.from(candidateHoursByCustomerAndEmployee.get(customerNumber)?.values() || [])
        .sort((a, b) => b.hours - a.hours);

      if (scoredCandidates.length > 0) {
        owner = scoredCandidates[0];
      } else {
        const mappedCandidates = (mappingsByCostcenter.get(customerCostcenter) || [])
          .filter(candidate => candidate.employeeId !== collaborationInsight.primary.employeeId)
          .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "sv-SE"));

        if (mappedCandidates.length > 0) {
          owner = {
            employeeKey: mappedCandidates[0].employeeId,
            employeeId: mappedCandidates[0].employeeId,
            employeeName: mappedCandidates[0].employeeName,
          };
        }
      }

      if (!owner) return;

      const current = helpedByColleague.get(owner.employeeKey) || {
        employeeKey: owner.employeeKey,
        employeeId: owner.employeeId || null,
        employeeName: owner.employeeName || owner.employeeId || "Okänd",
        helpedHours: 0,
        helpedHoursByCustomer: new Map(),
      };
      current.helpedHours += rowHours;
      current.helpedHoursByCustomer.set(
        customerNumber,
        (current.helpedHoursByCustomer.get(customerNumber) || 0) + rowHours
      );
      helpedByColleague.set(owner.employeeKey, current);
    });

    const colleagues = Array.from(helpedByColleague.values())
      .sort((a, b) => b.helpedHours - a.helpedHours);

    if (colleagues.length === 0) return null;

    return {
      primary: collaborationInsight.primary,
      colleagues: colleagues.map(colleague => ({
        ...colleague,
        customerNumbers: Array.from(colleague.helpedHoursByCustomer?.keys() || []),
        debugCustomers: Array.from(colleague.helpedHoursByCustomer?.entries() || [])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([customerNumber, hours]) => {
            const costCenter = String(customerNumberToCostCenter.get(customerNumber) || "?").trim() || "?";
            return {
              customerNumber,
              costCenter,
              hours,
            };
          }),
      })),
      totalHelpedHours: colleagues.reduce((sum, row) => sum + (parseFloat(row.helpedHours) || 0), 0),
    };
  }, [
    selectedCostcenter,
    selectedYear,
    selectedGroup,
    collaborationInsight,
    filteredTimeReports,
    normalizedTimeReports,
    customerNumberToCostCenter,
    employeeMappings,
    employeeMappingById,
  ]);

  const totalOmsattning = filtered.reduce((s, inv) => s + exMoms(inv.total || inv.Total), 0);
  const totalFakturor = filtered.length;
  const obetalda = filtered.filter(inv => parseFloat(inv.balance || inv.Balance) > 0).length;

  const getAnnualContractValueForCustomer = (customerNumber, targetYear) => {
    const rows = contractRowsByCustomer.get(customerNumber) || [];
    let total = 0;

    const yearStart = new Date(Number(targetYear), 0, 1);
    const yearEnd = new Date(Number(targetYear), 11, 31);

    rows.forEach(row => {
      const contractNumber = String(row.contract_number || row.contractNumber || "").trim();
      const amountIncVat = parseFloat(row.total || 0) || 0;
      const amount = exMoms(amountIncVat);
      if (amount <= 0) return;

      const intervalMonthsRaw = parseInt(String(row.period || "").trim(), 10);
      const intervalMonths = Number.isFinite(intervalMonthsRaw) && intervalMonthsRaw > 0
        ? intervalMonthsRaw
        : (contractNumber === "1114" ? 1 : 12);
      const normalizedStatus = normalizeSearchText(row.status || "");
      const isActiveContract = normalizedStatus === "active" || normalizedStatus === "aktiv";
      const isYearlyContract = intervalMonths >= 12;

      const startDate = row.start_date ? new Date(row.start_date) : null;
      const endDate = row.end_date ? new Date(row.end_date) : null;
      const hasValidStart = !!(startDate && !Number.isNaN(startDate.getTime()));
      const hasValidEnd = !!(endDate && !Number.isNaN(endDate.getTime()));

      if (hasValidStart && startDate > yearEnd) return;
      if (hasValidEnd && endDate < yearStart && !(isActiveContract && isYearlyContract)) return;

      const invoicesPerYear = Math.max(1, Math.round(12 / intervalMonths));
      total += amount * invoicesPerYear;
    });

    return total;
  };

  const contractValueForCurrentSelection = useMemo(() => {
    const targetYear = String(selectedYear || new Date().getFullYear());

    if (selectedCustomer && selectedCustomer !== "ALL") {
      return getAnnualContractValueForCustomer(selectedCustomer, targetYear);
    }

    const visibleCustomerNumbers = new Set(
      filtered
        .map(inv => normalizeCustomerNumber(inv.customer_number))
        .filter(Boolean)
    );

    let sum = 0;
    visibleCustomerNumbers.forEach(customerNumber => {
      sum += getAnnualContractValueForCustomer(customerNumber, targetYear);
    });

    return sum;
  }, [selectedCustomer, selectedYear, filtered, contractRowsByCustomer]);

  const hasContractsForCurrentSelection = useMemo(() => {
    if (selectedCustomer && selectedCustomer !== "ALL") {
      return (contractRowsByCustomer.get(selectedCustomer) || []).length > 0;
    }

    const visibleCustomerNumbers = new Set(
      filtered
        .map(inv => normalizeCustomerNumber(inv.customer_number))
        .filter(Boolean)
    );

    return Array.from(visibleCustomerNumbers).some(customerNumber => (contractRowsByCustomer.get(customerNumber) || []).length > 0);
  }, [selectedCustomer, filtered, contractRowsByCustomer]);

  const costcenterContractSummary = useMemo(() => {
    const targetYear = String(selectedYear || new Date().getFullYear());
    const byCustomerKey = new Map();
    let totalValue = 0;

    costcenterCustomerData.forEach(customer => {
      const value = customer.number
        ? getAnnualContractValueForCustomer(customer.number, targetYear)
        : 0;

      byCustomerKey.set(customer.key, value);
      totalValue += value;
    });

    return {
      byCustomerKey,
      totalValue,
    };
  }, [costcenterCustomerData, selectedYear, contractRowsByCustomer]);

  const formatSEK = (v) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(v);

  const openInvoicesForCustomer = (customerNumber, customerName) => {
    const number = normalizeCustomerNumber(customerNumber);
    const invoicesForCustomer = filtered
      .filter(inv => normalizeCustomerNumber(inv.customer_number) === number)
      .sort((a, b) => String(b.invoice_date || "").localeCompare(String(a.invoice_date || "")));

    setInvoiceModal({
      mode: "customer",
      customerNumber: number,
      customerName: customerName || customerNumber || "Okänd kund",
      invoices: invoicesForCustomer,
    });
    setModalExpandedInvoices(new Set());
  };

  const openUnpaidInvoices = () => {
    const unpaidInvoices = filtered
      .filter(inv => (parseFloat(inv.balance || inv.Balance) || 0) > 0)
      .sort((a, b) => {
        const balanceDiff = (parseFloat(b.balance || b.Balance) || 0) - (parseFloat(a.balance || a.Balance) || 0);
        if (balanceDiff !== 0) return balanceDiff;
        return String(b.invoice_date || "").localeCompare(String(a.invoice_date || ""));
      });

    setInvoiceModal({
      mode: "unpaid",
      customerNumber: null,
      customerName: "Obetalda fakturor",
      invoices: unpaidInvoices,
    });
    setModalExpandedInvoices(new Set());
  };

  const openContractsForCustomer = (customerNumber, customerName) => {
    const number = normalizeCustomerNumber(customerNumber);
    if (!number) return;

    const rows = contractRowsByCustomer.get(number) || [];
    const total = rows.reduce((sum, row) => sum + exMoms(parseFloat(row.total || 0) || 0), 0);

    setContractModal({
      customerNumber: number,
      customerName: customerName || customerNumber || "Okänd kund",
      rows,
      total,
    });
    setExpandedModalContracts(new Set());
  };

  const toggleCustomerContractExpanded = (rowKey) => {
    setExpandedCustomerContracts(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleModalContractExpanded = (rowKey) => {
    setExpandedModalContracts(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const goToCustomerFromCostcenter = (customerNumber, customerName) => {
    const number = normalizeCustomerNumber(customerNumber);
    if (!number) return;

    const label = customerName ? `${number} - ${customerName}` : (customerNumberToName.get(number) ? `${number} - ${customerNumberToName.get(number)}` : number);

    setSelectedCustomer(number);
    setCustomerInput(label);
    setSelectedCostcenter("ALL");
    setCostcenterInput("");

    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  };

  const openTimeEntriesForEmployee = (employeeKey, employeeName, employeeGroup, mode = "all", options = {}) => {
    const key = String(employeeKey || "").trim();
    if (!key) return;

    const scopedCustomerNumbers = new Set(
      Array.isArray(options?.customerNumbers)
        ? options.customerNumbers.map(value => String(value || "").trim()).filter(Boolean)
        : []
    );

    let baseRows = filteredTimeReports;
    let titleSuffix = "";

    if (mode === "internal") {
      baseRows = normalizedTimeReports.filter(row => {
        const rowKey = row.employee_id || row.employee_name || "Okänd";
        const yearMatch = !selectedYear || row.report_date.startsWith(selectedYear);
        const groupMatch = selectedGroup === "ALL" || row.employee_group === selectedGroup;
        const isInternal = String(row.customer_number || "").trim() === "1";
        const isAbsence = isAbsenceTimeRow(row);
        return rowKey === key && yearMatch && groupMatch && isInternal && !isAbsence;
      });
      titleSuffix = " (interna timmar)";
    } else if (mode === "absence") {
      baseRows = filteredTimeReports.filter(row => isAbsenceTimeRow(row));
      titleSuffix = " (frånvaro)";
    } else if (mode === "customer") {
      const sourceRows = options?.useNormalizedSource
        ? normalizedTimeReports.filter(row => {
            const yearMatch = !selectedYear || row.report_date.startsWith(selectedYear);
            const groupMatch = selectedGroup === "ALL" || row.employee_group === selectedGroup;
            return yearMatch && groupMatch;
          })
        : filteredTimeReports;

      baseRows = sourceRows.filter(row => {
        const isInternal = String(row.customer_number || "").trim() === "1";
        const isAbsence = isAbsenceTimeRow(row);
        if (isInternal || isAbsence) return false;

        if (scopedCustomerNumbers.size > 0) {
          const rowCustomerNumber = String(row.customer_number || "").trim();
          return scopedCustomerNumbers.has(rowCustomerNumber);
        }

        return true;
      });
      titleSuffix = " (kundtimmar)";
    }

    const rows = baseRows
      .filter(row => (row.employee_id || row.employee_name || "Okänd") === key)
      .sort((a, b) => {
        const dateDiff = String(b.report_date || "").localeCompare(String(a.report_date || ""));
        if (dateDiff !== 0) return dateDiff;
        return String(a.customer_name || a.customer_number || "").localeCompare(String(b.customer_name || b.customer_number || ""), "sv-SE", { numeric: true });
      });

    setTimeEntriesModal({
      employeeKey: key,
      employeeName: `${employeeName || key}${titleSuffix}`,
      employeeGroup: employeeGroup || "Ej grupp",
      rows,
      totalHours: rows.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0),
    });
  };

  const toggleModalInvoiceExpand = (invoiceNumber) => {
    const key = String(invoiceNumber || "").trim();
    if (!key) return;

    const isCurrentlyExpanded = modalExpandedInvoices.has(key);

    if (!isCurrentlyExpanded) {
      const existingRows = invoiceRows[key];
      const hasCachedRows = Array.isArray(existingRows) && existingRows.length > 0;
      const isAlreadyLoading = !!modalInvoiceRowsLoading[key];

      if (!hasCachedRows && !isAlreadyLoading) {
        setModalInvoiceRowsLoading(prev => ({ ...prev, [key]: true }));
        setModalInvoiceRowsError(prev => ({ ...prev, [key]: "" }));

        fetch(`/api/invoices/${encodeURIComponent(key)}`, { cache: "no-store" })
          .then(async res => {
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(payload?.error || `Kunde inte hämta artikelrader (HTTP ${res.status})`);
            }

            const fetchedRows = Array.isArray(payload?.rows) ? payload.rows : [];
            setInvoiceRows(prev => ({ ...prev, [key]: fetchedRows }));
          })
          .catch(err => {
            const message = err?.message || "Kunde inte hämta artikelrader från Fortnox.";
            setModalInvoiceRowsError(prev => ({ ...prev, [key]: message }));
          })
          .finally(() => {
            setModalInvoiceRowsLoading(prev => ({ ...prev, [key]: false }));
          });
      }
    }

    setModalExpandedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) {
      return (
        <div style={{background:"#1a2e3b", border:"1px solid #00c97a33", borderRadius:12, padding:"12px 16px"}}>
          <p style={{color:"#00c97a", fontWeight:600, marginBottom:4}}>{label}</p>
          <p style={{color:"#fff"}}>{formatSEK(payload[0].value)}</p>
          <p style={{color:"#888", fontSize:12}}>{payload[0].payload.antal} fakturor</p>
        </div>
      );
    }
    return null;
  };

  return (
    <main style={{minHeight:"100vh", background:"linear-gradient(135deg, #0f1923 0%, #1a2e3b 100%)", padding:"32px", fontFamily:"system-ui, sans-serif"}}>
      
      {/* Header */}
      <div style={{marginBottom:32, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16}}>
        <div>
          <h1 style={{fontSize:28, fontWeight:800, color:"#fff", margin:0}}>Fortnox Dashboard</h1>
          <p style={{color:"#6b8fa3", margin:"4px 0 0", fontSize:14}}>Omsättning exkl. moms · {years.join(" & ") || "2025–2026"}</p>
        </div>
        <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
          <Link
            href="/database"
            style={{background:"#1a2e3b", color:"#fff", border:"1px solid #2a4a5e", borderRadius:10, padding:"8px 12px", fontSize:14, textDecoration:"none"}}
          >
            Databas
          </Link>
          <Link
            href="/settings"
            style={{background:"#1a2e3b", color:"#fff", border:"1px solid #2a4a5e", borderRadius:10, padding:"8px 12px", fontSize:14, textDecoration:"none"}}
          >
            Inställningar
          </Link>
          <Link
            href="/agency"
            style={{background:"#1a2e3b", color:"#fff", border:"1px solid #2a4a5e", borderRadius:10, padding:"8px 12px", fontSize:14, textDecoration:"none"}}
          >
            Byråvy
          </Link>
          <button
            onClick={async () => {
              setSyncingTimeReports(true);
              try {
                const res = await fetch('/api/admin/sync-time-reports', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ maxPages: 20, fromDate: '2025-01-01' }),
                });
                const data = await res.json();
                if (!res.ok || data.ok === false) {
                  alert(`Sync tidsredovisning misslyckades: ${data.error || 'okänt fel'}`);
                } else {
                  alert(`Tidsredovisning synkad. Sparade: ${data.saved || 0}`);
                  window.location.reload();
                }
              } catch (err) {
                alert('Sync tidsredovisning misslyckades. Se konsol.');
                console.error(err);
              } finally {
                setSyncingTimeReports(false);
              }
            }}
            style={{background:'#1db3a7', color:'#fff', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer'}}
            disabled={syncingTimeReports}
          >{syncingTimeReports ? 'Synkar tid...' : 'Sync tid'}</button>
          <button
            onClick={async () => {
              setSyncingArticleRegistry(true);
              try {
                const res = await fetch('/api/admin/sync-article-registry', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ maxPages: 30 }),
                });
                const data = await res.json();
                if (!res.ok || data.ok === false) {
                  alert(`Sync artikelregister misslyckades: ${data.error || 'okänt fel'}`);
                } else {
                  alert(`Artikelregister synkat. Sparade: ${data.saved || 0}`);
                  window.location.reload();
                }
              } catch (err) {
                alert('Sync artikelregister misslyckades. Se konsol.');
                console.error(err);
              } finally {
                setSyncingArticleRegistry(false);
              }
            }}
            style={{background:'#9b59ff', color:'#fff', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer'}}
            disabled={syncingArticleRegistry}
          >{syncingArticleRegistry ? 'Synkar artikelregister...' : 'Sync artikelregister'}</button>
          <button
            onClick={async () => {
              setSyncingContracts(true);
              try {
                const res = await fetch('/api/admin/sync-contract-accruals', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ maxPages: 6 }),
                });
                const raw = await res.text();
                let data = {};
                try {
                  data = raw ? JSON.parse(raw) : {};
                } catch {
                  data = { error: raw ? raw.slice(0, 280) : 'Tomt svar från servern' };
                }

                if (!res.ok || data.ok === false) {
                  alert(`Sync kundavtal misslyckades [v2 ${res.status}]: ${data.error || 'okänt fel'}`);
                } else {
                  alert(`Kundavtal synkade (${data.source || 'okänd källa'}). Sparade: ${data.saved || 0}`);
                  window.location.reload();
                }
              } catch (err) {
                alert(`Sync kundavtal misslyckades [v2]: ${err?.message || 'nätverksfel eller blockerad request'}`);
                console.error(err);
              } finally {
                setSyncingContracts(false);
              }
            }}
            style={{background:'#8a6f42', color:'#fff', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer'}}
            disabled={syncingContracts}
          >{syncingContracts ? 'Synkar kundavtal...' : 'Sync kundavtal'}</button>
          <button
            onClick={async () => {
              setSyncingArticles(true);
              try {
                const invoicesForSync = Array.from(new Set(
                  filtered
                    .map(inv => String(inv.document_number || "").trim())
                    .filter(Boolean)
                ));

                let rounds = 0;
                let totalSynced = 0;
                let remaining = invoicesForSync.length;
                const maxRounds = 12;

                while (rounds < maxRounds && remaining > 0) {
                  rounds += 1;
                  const res = await fetch('/api/admin/sync-invoice-rows', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      batchSize: 20,
                      invoiceNumbers: invoicesForSync,
                      fromDate: selectedYear ? `${selectedYear}-01-01` : '2025-01-01',
                    }),
                  });

                  const data = await res.json();
                  if (!res.ok || data.ok === false) {
                    alert(`Sync artiklar misslyckades: ${data.error || 'okänt fel'}`);
                    return;
                  }

                  const syncedNow = Number(data.syncedNow || 0);
                  totalSynced += syncedNow;
                  remaining = Number(data.remaining || 0);

                  if (syncedNow === 0) {
                    break;
                  }
                }

                alert(`Artikelsync (aktuellt filter) klar. Synkade: ${totalSynced}, kvar: ${remaining}`);
                window.location.reload();
              } catch (err) {
                alert('Sync artiklar misslyckades. Se konsol.');
                console.error(err);
              } finally {
                setSyncingArticles(false);
              }
            }}
            style={{background:'#7c5cff', color:'#fff', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer'}}
            disabled={syncingArticles}
          >{syncingArticles ? 'Synkar artiklar...' : 'Sync artiklar'}</button>
          <button
            onClick={async () => {
              setSyncingCostcenters(true);
              try {
                const res = await fetch('/api/admin/sync-costcenters', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ batchSize: 20 }),
                });
                const data = await res.json();
                if (!res.ok || data.ok === false) {
                  alert(`Sync misslyckades: ${data.error || 'okänt fel'}`);
                } else {
                  alert(`Sync klar. Uppdaterade: ${data.syncedNow || 0}, med namn: ${data.withNames || 0}, kvar: ${data.remaining || 0}`);
                  window.location.reload();
                }
              } catch (err) {
                alert('Sync misslyckades. Se konsol.');
                console.error(err);
              } finally {
                setSyncingCostcenters(false);
              }
            }}
            style={{background:'#2f7ef7', color:'#fff', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer'}}
            disabled={syncingCostcenters}
          >{syncingCostcenters ? 'Synkar kostnadsställen...' : 'Sync kostnadsställen'}</button>
          <button
            onClick={() => {
              window.location.href = '/api/auth/login';
            }}
            style={{background:'#16a34a', color:'#fff', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer'}}
            title="Återaktivera Fortnox-anslutning"
          >
            Återaktivera Fortnox
          </button>
          <div style={{position:"relative"}}>
            <input
              list="year-filter-options"
              value={yearInput}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const raw = e.target.value;
                setYearInput(raw);
                if (!raw.trim()) {
                  setSelectedYear(DEFAULT_SELECTED_YEAR);
                  return;
                }
                const match = findOptionByInput(yearOptions, raw);
                if (match) setSelectedYear(match.value);
              }}
              placeholder="Sök år"
              style={{background:"#1a2e3b", color:"#fff", border:"1px solid #2a4a5e", borderRadius:10, padding:"8px 34px 8px 16px", fontSize:14, minWidth:120}}
            />
            {yearInput && (
              <button
                type="button"
                onClick={() => { setYearInput(DEFAULT_SELECTED_YEAR); setSelectedYear(DEFAULT_SELECTED_YEAR); }}
                aria-label="Rensa år"
                style={{position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"transparent", color:"#6b8fa3", cursor:"pointer", fontSize:16, lineHeight:1, padding:0}}
              >×</button>
            )}
          </div>
          <datalist id="year-filter-options">
            {yearOptions.map(y => <option key={y.value || "ALL_YEARS"} value={y.label} />)}
          </datalist>

          <div style={{position:"relative"}}>
            <input
              list="customer-filter-options"
              value={customerInput}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const raw = e.target.value;
                setCustomerInput(raw);
                if (!raw.trim()) {
                  setSelectedCustomer("ALL");
                  return;
                }
                const match = findOptionByInput(customers, raw);
                if (match) setSelectedCustomer(match.value);
              }}
              placeholder="Sök kund"
              style={{background:"#1a2e3b", color:"#fff", border:"1px solid #2a4a5e", borderRadius:10, padding:"8px 34px 8px 16px", fontSize:14, maxWidth:240, minWidth:220}}
            />
            {customerInput && (
              <button
                type="button"
                onClick={() => { setCustomerInput(""); setSelectedCustomer("ALL"); }}
                aria-label="Rensa kund"
                style={{position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"transparent", color:"#6b8fa3", cursor:"pointer", fontSize:16, lineHeight:1, padding:0}}
              >×</button>
            )}
          </div>
          <datalist id="customer-filter-options">
            {customers.map(c => <option key={c.value} value={c.label} />)}
          </datalist>

          <div style={{position:"relative"}}>
            <input
              list="costcenter-filter-options"
              value={costcenterInput}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const raw = e.target.value;
                setCostcenterInput(raw);
                if (!raw.trim()) {
                  setSelectedCostcenter("ALL");
                  return;
                }
                const match = findOptionByInput(costcenters, raw);
                if (match) setSelectedCostcenter(match.value);
              }}
              placeholder="Sök kostnadsställe"
              style={{background:"#1a2e3b", color:"#fff", border:"1px solid #2a4a5e", borderRadius:10, padding:"8px 34px 8px 16px", fontSize:14, maxWidth:240, minWidth:220}}
            />
            {costcenterInput && (
              <button
                type="button"
                onClick={() => { setCostcenterInput(""); setSelectedCostcenter("ALL"); }}
                aria-label="Rensa kostnadsställe"
                style={{position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"transparent", color:"#6b8fa3", cursor:"pointer", fontSize:16, lineHeight:1, padding:0}}
              >×</button>
            )}
          </div>
          <datalist id="costcenter-filter-options">
            {costcenters.map(c => <option key={c.value} value={c.label} />)}
          </datalist>

          <div style={{position:"relative"}}>
            <input
              list="group-filter-options"
              value={groupInput}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const raw = e.target.value;
                setGroupInput(raw);
                if (!raw.trim()) {
                  setSelectedGroup("ALL");
                  return;
                }
                const match = findOptionByInput(groups, raw);
                if (match) setSelectedGroup(match.value);
              }}
              placeholder="Sök grupp"
              style={{background:"#1a2e3b", color:"#fff", border:"1px solid #2a4a5e", borderRadius:10, padding:"8px 34px 8px 16px", fontSize:14, maxWidth:240, minWidth:180}}
            />
            {groupInput && (
              <button
                type="button"
                onClick={() => { setGroupInput(""); setSelectedGroup("ALL"); }}
                aria-label="Rensa grupp"
                style={{position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", border:"none", background:"transparent", color:"#6b8fa3", cursor:"pointer", fontSize:16, lineHeight:1, padding:0}}
              >×</button>
            )}
          </div>
          <datalist id="group-filter-options">
            {groups.map(g => <option key={g.value} value={g.label} />)}
          </datalist>
        </div>
      </div>

      <div style={{marginTop:-16, marginBottom:24, color:"#6b8fa3", fontSize:13}}>
        Förladdade artikelrader: {invoicesWithRowsInCacheStatus}/{totalInvoicesInCacheStatus} senaste fakturor har artikelrader
        {missingInvoiceRowsInCacheStatus > 0 ? ` · ${missingInvoiceRowsInCacheStatus} saknas` : " · komplett"}
      </div>
      <div style={{marginTop:-14, marginBottom:24, color:"#6b8fa3", fontSize:13}}>
        Artikelregister i DB: {withRegistryMatchInStatus}/{usedArticleNumbersInStatus} använda artikelnummer matchar register
        {missingRegistryMatchInStatus > 0 ? ` · ${missingRegistryMatchInStatus} saknas` : " · komplett"}
      </div>
      {selectedCostcenter !== "ALL" && timeCostcenterFilterMode && (
        <div style={{marginTop:-14, marginBottom:24, color:"#6b8fa3", fontSize:13}}>
          Tidsfilter för {selectedCostcenterLabel}: {timeCostcenterFilterMode.mode === "employee"
            ? `användarmappning (${timeCostcenterFilterMode.mappedUsersCount} user-id) + kollegor på kundernas tidsrader`
            : timeCostcenterFilterMode.mode === "employee-name-fallback"
              ? `namnmatchad användare (${timeCostcenterFilterMode.mappedUsersCount} user-id)`
            : "fallback till kundmappning (inga user-id mappade)"}
        </div>
      )}

      {/* Debug info */}
      {invoices.length === 0 && (
        <div style={{background:"#ff6b6b22", border:"1px solid #ff6b6b", borderRadius:12, padding:16, marginBottom:24, color:"#ff6b6b"}}>
          Inga fakturor hämtades. Prova att logga in igen via <a href="/api/auth/login" style={{color:"#00c97a"}}>denna länk</a>.
        </div>
      )}

      {/* KPI Cards */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:16, marginBottom:32}}>
        {[
          { label:"Total omsättning", value: formatSEK(totalOmsattning), color:"#00c97a" },
          { label:"Antal fakturor", value: totalFakturor, color:"#3b9eff" },
          { label:"Timmar (tid)", value: totalHours.toFixed(1), color:"#1db3a7" },
          { label:"Obetalda fakturor", value: obetalda, color:"#ff6b6b", onClick: openUnpaidInvoices },
          { label:"Avtalsvärde", value: contractAccrualsLoading ? "Laddar avtal..." : (contractValueForCurrentSelection > 0 ? formatSEK(contractValueForCurrentSelection) : (hasContractsForCurrentSelection ? formatSEK(0) : "Inga avtal hittade")), color:"#f59e0b" },
        ].map(card => (
          <div
            key={card.label}
            onClick={card.onClick || undefined}
            style={{
              background:"#1a2e3b",
              borderRadius:16,
              padding:"20px 24px",
              border:"1px solid #2a4a5e",
              cursor: card.onClick ? "pointer" : "default",
            }}
          >
            <p style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:1, margin:"0 0 8px"}}>{card.label}</p>
            <p style={{fontSize:26, fontWeight:800, color:card.color, margin:0}}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Time reports */}
      <div style={{background:"#1a2e3b", borderRadius:16, padding:"24px", border:"1px solid #2a4a5e", marginBottom:24}}>
        <h2 style={{color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 8px"}}>Tidsredovisning ({filteredTimeReports.length})</h2>
        <p style={{color:"#6b8fa3", fontSize:12, margin:"0 0 6px"}}>DB-cache från Fortnox tidsredovisning.</p>
        <p style={{color:"#6b8fa3", fontSize:12, margin:"0 0 14px"}}>Senast synkad: {latestTimeSyncLabel}</p>
        {timeReportsLoading && (
          <p style={{color:"#6b8fa3", fontSize:12, margin:"0 0 14px"}}>Laddar tidsredovisning...</p>
        )}
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                {["Medarbetare","Grupp", selectedCostcenter !== "ALL" ? "Kundtimmar" : "Timmar", ...(selectedCostcenter !== "ALL" ? ["Frånvaro", "Interna timmar (kund 1)"] : []), "Antal rader","Andel"].map(h => (
                  <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeByEmployee.map((r) => (
                <tr key={r.key} style={{borderBottom:"1px solid #1e3545"}}>
                  <td style={{padding:"14px 16px 14px 0", color:"#fff", fontWeight:500, fontSize:14}}>
                    <button
                      type="button"
                      onClick={() => openTimeEntriesForEmployee(r.key, r.employee, r.group)}
                      style={{background:"transparent", border:"none", color:"#fff", cursor:"pointer", padding:0, fontWeight:500, fontSize:14, textDecoration:"underline", textUnderlineOffset:3}}
                    >
                      {r.employee}
                    </button>
                  </td>
                  <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{r.group}</td>
                  <td style={{padding:"14px 16px 14px 0", color:"#1db3a7", fontWeight:700, fontSize:14}}>
                    <button
                      type="button"
                      onClick={() => openTimeEntriesForEmployee(r.key, r.employee, r.group, selectedCostcenter !== "ALL" ? "customer" : "all")}
                      style={{background:"transparent", border:"none", color:"#1db3a7", cursor:"pointer", padding:0, fontWeight:700, fontSize:14, textDecoration:"underline", textUnderlineOffset:3}}
                    >
                      {r.hours.toFixed(1)}
                    </button>
                  </td>
                  {selectedCostcenter !== "ALL" && (
                    <td style={{padding:"14px 16px 14px 0", color:"#93c5fd", fontWeight:700, fontSize:14}}>
                      {(r.absenceHours || 0) > 0 ? (
                        <button
                          type="button"
                          onClick={() => openTimeEntriesForEmployee(r.key, r.employee, r.group, "absence")}
                          style={{background:"transparent", border:"none", color:"#93c5fd", cursor:"pointer", padding:0, fontWeight:700, fontSize:14, textDecoration:"underline", textUnderlineOffset:3}}
                        >
                          {(r.absenceHours || 0).toFixed(1)}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
                  {selectedCostcenter !== "ALL" && (
                    <td style={{padding:"14px 16px 14px 0", color:"#f59e0b", fontWeight:700, fontSize:14}}>
                      {(r.internalHours || 0) > 0 ? (
                        <button
                          type="button"
                          onClick={() => openTimeEntriesForEmployee(r.key, r.employee, r.group, "internal")}
                          style={{background:"transparent", border:"none", color:"#f59e0b", cursor:"pointer", padding:0, fontWeight:700, fontSize:14, textDecoration:"underline", textUnderlineOffset:3}}
                        >
                          {(r.internalHours || 0).toFixed(1)}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
                  <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{r.rows}</td>
                  <td style={{padding:"14px 0", minWidth:120}}>
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      {(() => {
                        const shareBase = selectedCostcenter !== "ALL"
                          ? totalCustomerHoursOnSelectedCostcenterCustomers
                          : totalDisplayedTimeHours;
                        const sharePct = shareBase > 0 ? (r.hours / shareBase * 100) : 0;

                        return (
                          <>
                            <div style={{flex:1, height:6, background:"#2a4a5e", borderRadius:3, overflow:"hidden"}}>
                              <div style={{width:`${sharePct}%`, height:"100%", background:"#1db3a7", borderRadius:3}} />
                            </div>
                            <span style={{color:"#6b8fa3", fontSize:12, minWidth:36}}>{Math.round(sharePct)}%</span>
                          </>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {timeByEmployee.length === 0 && (
          <p style={{color:"#6b8fa3", fontSize:12, marginTop:12}}>Inga tidsrader i cache för nuvarande urval. Kör "Sync tid".</p>
        )}

        {selectedCostcenter !== "ALL" && visibleEmployeesMissingCostCenterMapping.length > 0 && (
          <p style={{color:"#fbbf24", fontSize:12, marginTop:12}}>
            Obs: Saknar kostnadsställe-mappning för {visibleEmployeesMissingCostCenterMapping.join(", ")} i Inställningar → Konsulter. Interna timmar visas, men vissa kostnadsställe-jämförelser kan avvika.
          </p>
        )}

        {selectedCostcenter !== "ALL" && collaborationInsight && (
          <div style={{marginTop:16, background:"#132635", border:"1px solid #2a4a5e", borderRadius:12, padding:"14px 16px"}}>
            <p style={{margin:"0 0 6px", color:"#fff", fontWeight:700, fontSize:14}}>
              Vem jobbar {collaborationInsight.primary.employeeName} mest med?
            </p>
            <p style={{margin:"0 0 10px", color:"#6b8fa3", fontSize:12}}>
              {collaborationInsight.primary.employeeName}: {collaborationInsight.primary.customerHours.toFixed(1)} kundtimmar
            </p>

            {collaborationInsight.collaborators.length === 0 ? (
              <p style={{margin:0, color:"#6b8fa3", fontSize:12}}>Inga kollegor hittades på samma kundtimmar i detta urval.</p>
            ) : (
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:8}}>
                {collaborationInsight.collaborators.map(colleague => (
                  <button
                    key={colleague.employeeKey}
                    type="button"
                    onClick={() => openTimeEntriesForEmployee(
                      colleague.employeeKey,
                      colleague.employeeName,
                      "Kollega",
                      "customer"
                    )}
                    style={{display:"flex", justifyContent:"space-between", gap:10, background:"#1a2e3b", border:"1px solid #2a4a5e", borderRadius:8, padding:"8px 10px", cursor:"pointer", textAlign:"left"}}
                  >
                    <span style={{color:"#fff", fontSize:13, textDecoration:"underline", textUnderlineOffset:3}}>{colleague.employeeName}</span>
                    <span style={{color:"#1db3a7", fontWeight:700, fontSize:13, textDecoration:"underline", textUnderlineOffset:3}}>{colleague.customerHours.toFixed(1)} h</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedCostcenter !== "ALL" && helpedColleaguesInsight && (
          <div style={{marginTop:12, background:"#132635", border:"1px solid #2a4a5e", borderRadius:12, padding:"14px 16px"}}>
            <p style={{margin:"0 0 6px", color:"#fff", fontWeight:700, fontSize:14}}>
              Vem har {helpedColleaguesInsight.primary.employeeName} hjälpt mest?
            </p>
            <p style={{margin:"0 0 10px", color:"#6b8fa3", fontSize:12}}>
              {helpedColleaguesInsight.primary.employeeName}: {helpedColleaguesInsight.totalHelpedHours.toFixed(1)} kundtimmar på andras kunder
            </p>

            <div style={{
              display:"grid",
              gridTemplateColumns: helpedColleaguesInsight.colleagues.length === 1
                ? "minmax(220px, 360px)"
                : "repeat(auto-fit, minmax(180px, 1fr))",
              gap:8,
            }}>
              {helpedColleaguesInsight.colleagues.map(colleague => (
                <button
                  key={colleague.employeeKey}
                  type="button"
                  onClick={() => openTimeEntriesForEmployee(
                    helpedColleaguesInsight.primary.employeeKey,
                    `${helpedColleaguesInsight.primary.employeeName} på ${colleague.employeeName}s kunder`,
                    "Primär",
                    "customer",
                    {
                      useNormalizedSource: true,
                      customerNumbers: colleague.customerNumbers || (colleague.debugCustomers || []).map(item => item.customerNumber),
                    }
                  )}
                  style={{display:"flex", flexDirection:"column", gap:4, background:"#1a2e3b", border:"1px solid #2a4a5e", borderRadius:8, padding:"8px 10px", cursor:"pointer", textAlign:"left"}}
                >
                  <span style={{display:"flex", justifyContent:"space-between", gap:10}}>
                    <span style={{color:"#fff", fontSize:13, textDecoration:"underline", textUnderlineOffset:3}}>{colleague.employeeName}</span>
                    <span style={{color:"#3b9eff", fontWeight:700, fontSize:13, textDecoration:"underline", textUnderlineOffset:3}}>{colleague.helpedHours.toFixed(1)} h</span>
                  </span>
                  <span style={{color:"#6b8fa3", fontSize:11}}>
                    {(colleague.customerNumbers || []).length} kunder
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Monthly Chart */}
      <div style={{background:"#1a2e3b", borderRadius:16, padding:"24px", border:"1px solid #2a4a5e", marginBottom:24}}>
        <h2 style={{color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 24px"}}>Omsättning per månad</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2a4a5e" vertical={false} />
            <XAxis dataKey="month" tick={{fill:"#6b8fa3", fontSize:12}} axisLine={false} tickLine={false} />
            <YAxis tick={{fill:"#6b8fa3", fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${Math.round(v/1000)}k` : v} />
            <Tooltip content={<CustomTooltip />} cursor={{fill:"rgba(0,201,122,0.05)"}} />
            <Bar dataKey="omsattning" fill="#00c97a" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {selectedCustomer !== "ALL" && (
        <div style={{background:"#1a2e3b", borderRadius:16, padding:"24px", border:"1px solid #2a4a5e", marginBottom:24}}>
          <h2 style={{color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 8px"}}>Omsättning per timme per månad</h2>
          <p style={{color:"#6b8fa3", fontSize:12, margin:"0 0 16px"}}>
            Visas för vald kund: {selectedCustomerLabel}
          </p>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                  {["Månad", "Omsättning ex. moms", "Nedlagda timmar", "Omsättning / timme"].map(h => (
                    <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyRevenuePerHourData.map((row) => (
                  <tr key={row.key} style={{borderBottom:"1px solid #1e3545"}}>
                    <td style={{padding:"14px 16px 14px 0", color:"#fff", fontSize:14}}>{row.month}</td>
                    <td style={{padding:"14px 16px 14px 0", color:"#00c97a", fontWeight:700, fontSize:14}}>{formatSEK(row.omsattning)}</td>
                    <td style={{padding:"14px 16px 14px 0", color:"#1db3a7", fontWeight:700, fontSize:14}}>{row.timmar.toFixed(1)}</td>
                    <td style={{padding:"14px 0", color:"#3b9eff", fontWeight:700, fontSize:14}}>
                      {row.omsattningPerTimme !== null ? formatSEK(Math.round(row.omsattningPerTimme)) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {monthlyRevenuePerHourData.length === 0 && (
            <p style={{color:"#6b8fa3", fontSize:12, marginTop:12}}>Ingen data för valt urval.</p>
          )}
        </div>
      )}

      {selectedCustomer !== "ALL" && (
        <div style={{background:"#1a2e3b", borderRadius:16, padding:"24px", border:"1px solid #2a4a5e", marginBottom:24}}>
          <h2 style={{color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 8px"}}>Kundavtal</h2>
          <p style={{color:"#6b8fa3", fontSize:12, margin:"0 0 14px"}}>Visas för vald kund: {selectedCustomerLabel}</p>
          {contractAccrualsLoading && (
            <p style={{color:"#6b8fa3", fontSize:12, margin:"0 0 14px"}}>Laddar kundavtal...</p>
          )}

          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                  {["", "Avtalsnr", "Beskrivning", "Start", "Slut", "Status", "Intervall", "Belopp ex. moms"].map(h => (
                    <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedCustomerContracts.map((row, idx) => {
                  const rowKey = `${selectedCustomer}-${row.contract_number || idx}`;
                  const isExpanded = expandedCustomerContracts.has(rowKey);
                  const amountExVat = exMoms(parseFloat(row.total || 0) || 0);
                  const intervalMonths = Math.max(1, parseInt(String(row.period || "").trim(), 10) || 1);
                  const invoicesPerYear = 12 / intervalMonths;
                  const annualValueExVat = Math.round(amountExVat * invoicesPerYear);
                  const contractLineItems = getContractLineItems(row);

                  return (
                    <Fragment key={rowKey}>
                      <tr style={{borderBottom:"1px solid #1e3545"}}>
                        <td style={{padding:"12px 16px 12px 0", width:30}}>
                          <button
                            type="button"
                            onClick={() => toggleCustomerContractExpanded(rowKey)}
                            style={{background:"transparent", border:"none", color:"#6b8fa3", cursor:"pointer", fontSize:14, lineHeight:1, padding:0}}
                            aria-label={isExpanded ? "Dölj avtalsdetaljer" : "Visa avtalsdetaljer"}
                            title={isExpanded ? "Dölj detaljer" : "Visa detaljer"}
                          >
                            {isExpanded ? "▾" : "▸"}
                          </button>
                        </td>
                        <td style={{padding:"12px 16px 12px 0", color:"#fff", fontWeight:600, fontSize:13}}>{row.contract_number || "-"}</td>
                        <td style={{padding:"12px 16px 12px 0", color:"#dbe7ef", fontSize:13}}>{row.description || "-"}</td>
                        <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.start_date || "-"}</td>
                        <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.end_date || "-"}</td>
                        <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.status || "-"}</td>
                        <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.period || "-"}</td>
                        <td style={{padding:"12px 0", color:"#00c97a", fontWeight:700, fontSize:13}}>{row.total != null ? formatSEK(amountExVat) : "-"}</td>
                      </tr>
                      {isExpanded && (
                        <tr style={{borderBottom:"1px solid #1e3545", background:"rgba(9,16,24,0.22)"}}>
                          <td colSpan={8} style={{padding:"10px 0 12px", color:"#8fb1c3", fontSize:12}}>
                            <div style={{display:"grid", gap:6}}>
                              <div style={{color:"#b8d4e3"}}>Faktureras enligt avtal:</div>
                              {contractLineItems.length > 0 ? (
                                <div style={{display:"grid", gap:4}}>
                                  {contractLineItems.map((item, itemIdx) => (
                                    <div key={`${rowKey}-item-${itemIdx}`} style={{color:"#8fb1c3"}}>• {item}</div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{color:"#8fb1c3"}}>• {row.description || "Beskrivning saknas i Fortnox"}</div>
                              )}
                              <div style={{display:"flex", gap:16, flexWrap:"wrap", marginTop:2}}>
                                <span>Per faktura ex. moms: {formatSEK(amountExVat)}</span>
                                <span>Intervall: var {intervalMonths} månad</span>
                                <span>Årsvärde ex. moms: {formatSEK(annualValueExVat)}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedCustomerContracts.length === 0 && (
            <p style={{color:"#6b8fa3", fontSize:12, marginTop:12}}>Inga avtal hittades för vald kund.</p>
          )}
        </div>
      )}

      {/* Top customers / Costcenter view */}
      <div style={{background:"#1a2e3b", borderRadius:16, padding:"24px", border:"1px solid #2a4a5e", marginBottom:24}}>
        {selectedCostcenter !== "ALL" ? (
          <>
            <h2 style={{color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 8px"}}>
              Kunder i kostnadsställe {selectedCostcenterLabel}
            </h2>
            <p style={{color:"#6b8fa3", fontSize:13, margin:"0 0 18px"}}>
              Kundöversikt baserad på aktuella filter (år och ansvarig).
            </p>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                    {["Kund","Omsättning ex. moms","Antal fakturor","Avtalsvärde","Senaste faktura","Andel",""] .map(h => (
                      <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costcenterCustomerData.map((c) => {
                    const share = totalOmsattning > 0 ? Math.round((c.omsattning / totalOmsattning) * 100) : 0;
                    const contractStats = c.number ? contractStatsByCustomer.get(c.number) : null;
                    const contractValue = costcenterContractSummary.byCustomerKey.get(c.key) || 0;
                    return (
                      <tr key={c.key} style={{borderBottom:"1px solid #1e3545"}}>
                        <td style={{padding:"14px 16px 14px 0", color:"#fff", fontWeight:500, fontSize:14}}>
                          <button
                            type="button"
                            onClick={() => openInvoicesForCustomer(c.number, c.name)}
                            style={{background:"transparent", border:"none", color:"#fff", cursor:"pointer", padding:0, fontWeight:500, fontSize:14, textAlign:"left"}}
                          >
                            {c.number ? `${c.number} - ${c.name}` : c.name}
                          </button>
                        </td>
                        <td style={{padding:"14px 16px 14px 0", color:"#00c97a", fontWeight:700, fontSize:14}}>{formatSEK(c.omsattning)}</td>
                        <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{c.antal}</td>
                        <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>
                          {contractStats
                            ? (
                              <button
                                type="button"
                                onClick={() => openContractsForCustomer(c.number, c.name)}
                                style={{background:"transparent", border:"none", color:"#6b8fa3", cursor:"pointer", padding:0, fontSize:14, textDecoration:"underline", textUnderlineOffset:3}}
                              >
                                {formatSEK(contractValue)}
                              </button>
                            )
                            : "-"}
                        </td>
                        <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{c.senasteFaktura || "-"}</td>
                        <td style={{padding:"14px 0", minWidth:120}}>
                          <div style={{display:"flex", alignItems:"center", gap:8}}>
                            <div style={{flex:1, height:6, background:"#2a4a5e", borderRadius:3, overflow:"hidden"}}>
                              <div style={{width:`${share}%`, height:"100%", background:"#3b9eff", borderRadius:3}} />
                            </div>
                            <span style={{color:"#6b8fa3", fontSize:12, minWidth:36}}>{share}%</span>
                          </div>
                        </td>
                        <td style={{padding:"14px 0 14px 16px", textAlign:"right", whiteSpace:"nowrap"}}>
                          <button
                            type="button"
                            onClick={() => goToCustomerFromCostcenter(c.number, c.name)}
                            disabled={!c.number}
                            style={{
                              background: c.number ? "#2f7ef7" : "#2a4a5e",
                              color: "#fff",
                              border: "none",
                              borderRadius: 8,
                              padding: "6px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: c.number ? "pointer" : "not-allowed",
                              opacity: c.number ? 1 : 0.6,
                            }}
                          >
                            Gå till kund
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {costcenterCustomerData.length > 0 && (
                    <tr style={{borderTop:"1px solid #2a4a5e", background:"rgba(9,16,24,0.22)"}}>
                      <td style={{padding:"14px 16px 14px 0", color:"#dbe7ef", fontWeight:700, fontSize:14}}>Summa</td>
                      <td style={{padding:"14px 16px 14px 0"}} />
                      <td style={{padding:"14px 16px 14px 0"}} />
                      <td style={{padding:"14px 16px 14px 0", color:"#f59e0b", fontWeight:700, fontSize:14}}>{formatSEK(costcenterContractSummary.totalValue)}</td>
                      <td style={{padding:"14px 16px 14px 0"}} />
                      <td style={{padding:"14px 0"}} />
                      <td style={{padding:"14px 0 14px 16px"}} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {costcenterCustomerData.length === 0 && (
              <div style={{color:"#6b8fa3", fontSize:13}}>Inga kunddata hittades för valt kostnadsställe med nuvarande filter.</div>
            )}
          </>
        ) : (
          <>
            <h2 style={{color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 20px"}}>
              {selectedCustomer === "ALL" ? "Topp 10 kunder" : `Fakturor – ${selectedCustomerLabel}`}
            </h2>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                    {["Kund","Omsättning ex. moms","Antal fakturor","Avtal","Andel"].map(h => (
                      <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customerData.map((c) => {
                    const contractStats = c.number ? contractStatsByCustomer.get(c.number) : null;
                    return (
                    <tr key={c.key} style={{borderBottom:"1px solid #1e3545"}}>
                      <td style={{padding:"14px 16px 14px 0", color:"#fff", fontWeight:500, fontSize:14}}>
                        <button
                          type="button"
                          onClick={() => openInvoicesForCustomer(c.number, c.name)}
                          style={{background:"transparent", border:"none", color:"#fff", cursor:"pointer", padding:0, fontWeight:500, fontSize:14, textAlign:"left"}}
                        >
                          {c.number ? `${c.number} - ${c.name}` : c.name}
                        </button>
                      </td>
                      <td style={{padding:"14px 16px 14px 0", color:"#00c97a", fontWeight:700, fontSize:14}}>{formatSEK(c.omsattning)}</td>
                      <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{c.antal}</td>
                      <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>
                        {contractStats
                          ? (
                            <button
                              type="button"
                              onClick={() => openContractsForCustomer(c.number, c.name)}
                              style={{background:"transparent", border:"none", color:"#6b8fa3", cursor:"pointer", padding:0, fontSize:14, textDecoration:"underline", textUnderlineOffset:3}}
                            >
                              {`${contractStats.count} (${formatSEK(contractStats.total)})`}
                            </button>
                          )
                          : "-"}
                      </td>
                      <td style={{padding:"14px 0", minWidth:120}}>
                        <div style={{display:"flex", alignItems:"center", gap:8}}>
                          <div style={{flex:1, height:6, background:"#2a4a5e", borderRadius:3, overflow:"hidden"}}>
                            <div style={{width:`${totalOmsattning > 0 ? (c.omsattning/totalOmsattning*100) : 0}%`, height:"100%", background:"#00c97a", borderRadius:3}} />
                          </div>
                          <span style={{color:"#6b8fa3", fontSize:12, minWidth:36}}>{totalOmsattning > 0 ? Math.round(c.omsattning/totalOmsattning*100) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Articles */ }
      {articleGroupStats.length > 0 && (
        <div style={{background:"#1a2e3b", borderRadius:16, padding:"24px", border:"1px solid #2a4a5e", marginBottom:24}}>
          <h2 style={{color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 8px"}}>Artikelgrupper ({articleGroupStats.length})</h2>
          <p style={{color:"#6b8fa3", fontSize:12, margin:"0 0 14px"}}>Mappad uppföljning per artikelgrupp för aktuellt urval.</p>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                  {["Grupp", "Omsättning ex. moms", "Artiklar", "Antal", "Mängd", "Andel"].map(h => (
                    <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {articleGroupStats.map((group) => (
                  <tr key={group.key} style={{borderBottom:"1px solid #1e3545"}}>
                    <td style={{padding:"14px 16px 14px 0", color:"#fff", fontWeight:500, fontSize:14}}>{group.groupName}</td>
                    <td style={{padding:"14px 16px 14px 0", color:"#00c97a", fontWeight:700, fontSize:14}}>{formatSEK(group.omsattning)}</td>
                    <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{group.articleCount}</td>
                    <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{group.antal}</td>
                    <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{group.quantity.toFixed(1)}</td>
                    <td style={{padding:"14px 0", minWidth:120}}>
                      <div style={{display:"flex", alignItems:"center", gap:8}}>
                        <div style={{flex:1, height:6, background:"#2a4a5e", borderRadius:3, overflow:"hidden"}}>
                          <div style={{width:`${totalOmsattning > 0 ? (group.omsattning / totalOmsattning * 100) : 0}%`, height:"100%", background:"#2f7ef7", borderRadius:3}} />
                        </div>
                        <span style={{color:"#6b8fa3", fontSize:12, minWidth:36}}>{totalOmsattning > 0 ? Math.round(group.omsattning / totalOmsattning * 100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{background:"#1a2e3b", borderRadius:16, padding:"24px", border:"1px solid #2a4a5e", marginBottom:24}}>
        <h2 style={{color:"#fff", fontWeight:700, fontSize:16, margin:"0 0 8px"}}>
          {selectedCostcenter !== "ALL"
            ? `Sålda artiklar – ${selectedCostcenterLabel} (${articleData.length})`
            : `Sålda artiklar (${articleData.length})`}
        </h2>
        {selectedCostcenter !== "ALL" && articleData.length === 0 && (
          <p style={{color:"#6b8fa3", fontSize:12, margin:"0 0 14px"}}>Inga artikelrader i cache för urvalet. Klicka på "Sync artiklar" för att fylla databasen.</p>
        )}
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                {["Artikelnr","Benämning","Omsättning ex. moms","Antal","Mängd","Andel"].map(h => (
                  <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
                {articleData.slice(0, 20).map((a) => (
                <tr key={a.key} style={{borderBottom:"1px solid #1e3545"}}>
                  <td style={{padding:"14px 16px 14px 0", color:"#dbe7ef", fontSize:14, minWidth:120}}>{a.articleNumber || "-"}</td>
                  <td style={{padding:"14px 16px 14px 0", color:"#fff", fontWeight:500, fontSize:14, maxWidth:300, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} title={a.name}>{a.name}</td>
                  <td style={{padding:"14px 16px 14px 0", color:"#00c97a", fontWeight:700, fontSize:14}}>{formatSEK(a.omsattning)}</td>
                  <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{a.antal}</td>
                  <td style={{padding:"14px 16px 14px 0", color:"#6b8fa3", fontSize:14}}>{a.quantity.toFixed(1)}</td>
                  <td style={{padding:"14px 0", minWidth:120}}>
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      <div style={{flex:1, height:6, background:"#2a4a5e", borderRadius:3, overflow:"hidden"}}>
                        <div style={{width:`${totalOmsattning > 0 ? (a.omsattning/totalOmsattning*100) : 0}%`, height:"100%", background:"#3b9eff", borderRadius:3}} />
                      </div>
                      <span style={{color:"#6b8fa3", fontSize:12, minWidth:36}}>{totalOmsattning > 0 ? Math.round(a.omsattning/totalOmsattning*100) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {articleData.length > 20 && (
          <p style={{color:"#6b8fa3", fontSize:12, marginTop:16}}>+ {articleData.length - 20} fler artiklar</p>
        )}
      </div>

      {invoiceModal && (
        <div
          onClick={() => { setInvoiceModal(null); setModalExpandedInvoices(new Set()); }}
          style={{position:"fixed", inset:0, background:"rgba(9,16,24,0.72)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20}}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{width:"min(980px, 96vw)", maxHeight:"85vh", overflow:"auto", background:"#1a2e3b", border:"1px solid #2a4a5e", borderRadius:14, padding:20}}
          >
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:14}}>
              <h3 style={{margin:0, color:"#fff", fontSize:18, fontWeight:700}}>
                {invoiceModal.mode === "unpaid"
                  ? "Obetalda fakturor"
                  : `Fakturor – ${invoiceModal.customerNumber ? `${invoiceModal.customerNumber} - ${invoiceModal.customerName}` : invoiceModal.customerName}`}
              </h3>
              <button
                type="button"
                onClick={() => { setInvoiceModal(null); setModalExpandedInvoices(new Set()); }}
                style={{background:"transparent", border:"none", color:"#6b8fa3", fontSize:22, cursor:"pointer", lineHeight:1}}
                aria-label="Stäng"
              >×</button>
            </div>

            <div style={{color:"#6b8fa3", fontSize:13, marginBottom:10}}>
              {invoiceModal.invoices.length} fakturor{invoiceModal.mode === "unpaid" ? " med restsaldo" : ""}
            </div>

            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                    {[
                      "Faktura",
                      ...(invoiceModal.mode === "unpaid" ? ["Kund"] : []),
                      "Datum",
                      "Omsättning ex. moms",
                      ...(invoiceModal.mode === "unpaid" ? ["Restsaldo"] : []),
                      ...(invoiceModal.mode === "unpaid" ? ["Status"] : []),
                    ].map(h => (
                      <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoiceModal.invoices.map((inv, idx) => {
                    const invNumber = String(inv.document_number || "").trim();
                    const isExpanded = modalExpandedInvoices.has(invNumber);
                    const isHovered = modalHoveredInvoice === invNumber;
                    const dueDateRaw = String(inv.due_date || inv.DueDate || "").trim();
                    const invoiceDateRaw = String(inv.invoice_date || inv.InvoiceDate || "").trim();
                    const today = new Date();
                    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const dueDate = dueDateRaw
                      ? new Date(dueDateRaw)
                      : (invoiceDateRaw ? (() => {
                          const base = new Date(invoiceDateRaw);
                          if (Number.isNaN(base.getTime())) return null;
                          base.setDate(base.getDate() + 30);
                          return base;
                        })() : null);
                    const isOverdue = !!(dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < todayStart);

                    return (
                    <Fragment key={`${inv.document_number || idx}-wrapper`}>
                      <tr
                        style={{borderBottom:"1px solid #1e3545", cursor:"pointer", background:isHovered ? "#0f1923" : "transparent", transition:"background 0.15s ease"}}
                        onClick={() => toggleModalInvoiceExpand(inv.document_number)}
                        onMouseEnter={() => setModalHoveredInvoice(invNumber)}
                        onMouseLeave={() => setModalHoveredInvoice(null)}
                      >
                        <td style={{padding:"12px 16px 12px 0", color:"#fff", fontWeight:600, fontSize:14}}>{inv.document_number || "-"}</td>
                        {invoiceModal.mode === "unpaid" && (
                          <td style={{padding:"12px 16px 12px 0", color:"#dbe7ef", fontSize:14}}>
                            {(() => {
                              const customerNumber = String(inv.customer_number || inv.CustomerNumber || "").trim();
                              const customerName = String(inv.customer_name || inv.CustomerName || "").trim();
                              if (customerNumber && customerName) return `${customerNumber} - ${customerName}`;
                              return customerName || customerNumber || "-";
                            })()}
                          </td>
                        )}
                        <td style={{padding:"12px 16px 12px 0", color:"#dbe7ef", fontSize:14}}>{inv.invoice_date || "-"}</td>
                        <td style={{padding:"12px 0", color:"#00c97a", fontWeight:700, fontSize:14, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12}}>
                          <span>{formatSEK(exMoms(inv.total || 0))}</span>
                          <span style={{color:"#6b8fa3", fontSize:12}}>{isExpanded ? "▼ Dölj artiklar" : "▶ Visa artiklar"}</span>
                        </td>
                        {invoiceModal.mode === "unpaid" && (
                          <td style={{padding:"12px 0", color:"#ff8e8e", fontWeight:700, fontSize:14}}>
                            {formatSEK(parseFloat(inv.balance || inv.Balance || 0) || 0)}
                          </td>
                        )}
                        {invoiceModal.mode === "unpaid" && (
                          <td style={{padding:"12px 0", fontSize:12, fontWeight:700, color:isOverdue ? "#ff8e8e" : "#8fb6c9"}}>
                            {isOverdue ? "Förfallen" : "Ej förfallen"}
                          </td>
                        )}
                      </tr>
                      {isExpanded && (
                        <tr style={{borderBottom:"1px solid #1e3545"}}>
                          <td colSpan={invoiceModal.mode === "unpaid" ? 6 : 3} style={{padding:"0 0 12px 0"}}>
                            {(() => {
                              const rows = invoiceRows[invNumber] || [];
                              const isLoadingRows = !!modalInvoiceRowsLoading[invNumber];
                              const rowError = modalInvoiceRowsError[invNumber];

                              if (isLoadingRows) {
                                return <div style={{padding:"10px 0", color:"#6b8fa3", fontSize:13}}>Hämtar artiklar från Fortnox och sparar i databasen...</div>;
                              }

                              if (rowError) {
                                return <div style={{padding:"10px 0", color:"#ffb4b4", fontSize:13}}>Kunde inte hämta artiklar: {rowError}</div>;
                              }

                              if (!Array.isArray(rows) || rows.length === 0) {
                                return <div style={{padding:"10px 0", color:"#6b8fa3", fontSize:13}}>Inga artiklar hittades för denna faktura.</div>;
                              }

                              return (
                                <table style={{width:"100%", fontSize:12, borderCollapse:"collapse", background:"#0f1923", border:"1px solid #1e3545", borderRadius:8}}>
                                  <thead>
                                    <tr style={{borderBottom:"1px solid #1e3545"}}>
                                      {[
                                        "Artikelnr",
                                        "Benämning",
                                        "Mängd",
                                        "Pris",
                                        "Belopp",
                                      ].map(h => (
                                        <th key={`${invNumber}-${h}`} style={{padding:"8px 10px", color:"#6b8fa3", textAlign:h === "Benämning" ? "left" : "right", fontWeight:600}}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row, rowIdx) => {
                                      const articleNumber = String(row.ArticleNumber || row.article_number || row.ArticleNo || row.article_no || "").trim();
                                      const fallbackName = row.ArticleName || row.article_name || row.Description || row.description || "-";
                                      const resolvedName = articleNumberToName.get(articleNumber) || fallbackName;
                                      const { quantity, unitPrice, total } = resolveInvoiceRowNumbers(row);
                                      return (
                                        <tr key={`${invNumber}-modal-row-${rowIdx}`} style={{borderBottom:"1px solid #1e3545"}}>
                                          <td style={{padding:"8px 10px", color:"#dbe7ef", textAlign:"right"}}>{articleNumber || "-"}</td>
                                          <td style={{padding:"8px 10px", color:"#fff", textAlign:"left"}}>{resolvedName}</td>
                                          <td style={{padding:"8px 10px", color:"#6b8fa3", textAlign:"right"}}>{quantity.toFixed(2)}</td>
                                          <td style={{padding:"8px 10px", color:"#6b8fa3", textAlign:"right"}}>{unitPrice ? formatSEK(normalizeInvoiceRowAmount(unitPrice)) : "-"}</td>
                                          <td style={{padding:"8px 10px", color:"#00c97a", textAlign:"right", fontWeight:600}}>{formatSEK(normalizeInvoiceRowAmount(total))}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {invoiceModal.invoices.length === 0 && (
              <div style={{color:"#6b8fa3", fontSize:13, marginTop:12}}>Inga fakturor hittades för kunden i nuvarande filter.</div>
            )}
          </div>
        </div>
      )}

      {timeEntriesModal && (
        <div
          onClick={() => setTimeEntriesModal(null)}
          style={{position:"fixed", inset:0, background:"rgba(9,16,24,0.72)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1001, padding:20}}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{width:"min(1100px, 96vw)", maxHeight:"85vh", overflow:"auto", background:"#1a2e3b", border:"1px solid #2a4a5e", borderRadius:14, padding:20}}
          >
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:14}}>
              <h3 style={{margin:0, color:"#fff", fontSize:18, fontWeight:700}}>
                Nedlagda timmar – {timeEntriesModal.employeeName}
              </h3>
              <button
                type="button"
                onClick={() => setTimeEntriesModal(null)}
                style={{background:"transparent", border:"none", color:"#6b8fa3", fontSize:22, cursor:"pointer", lineHeight:1}}
                aria-label="Stäng"
              >×</button>
            </div>

            <div style={{color:"#6b8fa3", fontSize:13, marginBottom:10}}>
              Grupp: {timeEntriesModal.employeeGroup} · Rader: {timeEntriesModal.rows.length} · Timmar: {timeEntriesModal.totalHours.toFixed(1)}
            </div>

            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                    {["Datum", "Kund", "Projekt", "Aktivitet", "Timmar", "Beskrivning"].map(h => (
                      <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeEntriesModal.rows.map((row, idx) => (
                    <tr key={`${timeEntriesModal.employeeKey}-${row.report_date || ""}-${idx}`} style={{borderBottom:"1px solid #1e3545"}}>
                      <td style={{padding:"12px 16px 12px 0", color:"#dbe7ef", fontSize:13}}>{row.report_date || "-"}</td>
                      <td style={{padding:"12px 16px 12px 0", color:"#fff", fontSize:13}}>{row.customer_number ? `${row.customer_number} - ${row.customer_name || ""}` : (row.customer_name || "-")}</td>
                      <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.project_name || "-"}</td>
                      <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.activity || "-"}</td>
                      <td style={{padding:"12px 16px 12px 0", color:"#1db3a7", fontWeight:700, fontSize:13}}>{(parseFloat(row.hours) || 0).toFixed(1)}</td>
                      <td style={{padding:"12px 0", color:"#6b8fa3", fontSize:13}}>{row.description ? `📝 ${row.description}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {timeEntriesModal.rows.length === 0 && (
              <div style={{color:"#6b8fa3", fontSize:13, marginTop:12}}>Inga tidsrader hittades för vald medarbetare i nuvarande filter.</div>
            )}
          </div>
        </div>
      )}

      {contractModal && (
        <div
          onClick={() => setContractModal(null)}
          style={{position:"fixed", inset:0, background:"rgba(9,16,24,0.72)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1002, padding:20}}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{width:"min(1100px, 96vw)", maxHeight:"85vh", overflow:"auto", background:"#1a2e3b", border:"1px solid #2a4a5e", borderRadius:14, padding:20}}
          >
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:14}}>
              <h3 style={{margin:0, color:"#fff", fontSize:18, fontWeight:700}}>
                Kundavtal – {contractModal.customerNumber ? `${contractModal.customerNumber} - ${contractModal.customerName}` : contractModal.customerName}
              </h3>
              <button
                type="button"
                onClick={() => setContractModal(null)}
                style={{background:"transparent", border:"none", color:"#6b8fa3", fontSize:22, cursor:"pointer", lineHeight:1}}
                aria-label="Stäng"
              >×</button>
            </div>

            <div style={{color:"#6b8fa3", fontSize:13, marginBottom:10}}>
              Avtal: {contractModal.rows.length} · Totalt avtalsvärde ex. moms: {formatSEK(contractModal.total || 0)}
            </div>

            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #2a4a5e"}}>
                    {["", "Avtalsnr", "Beskrivning", "Start", "Slut", "Status", "Intervall", "Belopp ex. moms"].map(h => (
                      <th key={h} style={{color:"#6b8fa3", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, textAlign:"left", paddingBottom:12, paddingRight:16}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contractModal.rows.map((row, idx) => {
                    const rowKey = `${contractModal.customerNumber}-${row.contract_number || idx}`;
                    const isExpanded = expandedModalContracts.has(rowKey);
                    const amountExVat = exMoms(parseFloat(row.total || 0) || 0);
                    const intervalMonths = Math.max(1, parseInt(String(row.period || "").trim(), 10) || 1);
                    const invoicesPerYear = 12 / intervalMonths;
                    const annualValueExVat = Math.round(amountExVat * invoicesPerYear);
                    const contractLineItems = getContractLineItems(row);

                    return (
                      <Fragment key={rowKey}>
                        <tr style={{borderBottom:"1px solid #1e3545"}}>
                          <td style={{padding:"12px 16px 12px 0", width:30}}>
                            <button
                              type="button"
                              onClick={() => toggleModalContractExpanded(rowKey)}
                              style={{background:"transparent", border:"none", color:"#6b8fa3", cursor:"pointer", fontSize:14, lineHeight:1, padding:0}}
                              aria-label={isExpanded ? "Dölj avtalsdetaljer" : "Visa avtalsdetaljer"}
                              title={isExpanded ? "Dölj detaljer" : "Visa detaljer"}
                            >
                              {isExpanded ? "▾" : "▸"}
                            </button>
                          </td>
                          <td style={{padding:"12px 16px 12px 0", color:"#fff", fontWeight:600, fontSize:13}}>{row.contract_number || "-"}</td>
                          <td style={{padding:"12px 16px 12px 0", color:"#dbe7ef", fontSize:13}}>{row.description || "-"}</td>
                          <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.start_date || "-"}</td>
                          <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.end_date || "-"}</td>
                          <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.status || "-"}</td>
                          <td style={{padding:"12px 16px 12px 0", color:"#6b8fa3", fontSize:13}}>{row.period || "-"}</td>
                          <td style={{padding:"12px 0", color:"#00c97a", fontWeight:700, fontSize:13}}>{row.total != null ? formatSEK(amountExVat) : "-"}</td>
                        </tr>
                        {isExpanded && (
                          <tr style={{borderBottom:"1px solid #1e3545", background:"rgba(9,16,24,0.22)"}}>
                            <td colSpan={8} style={{padding:"10px 0 12px", color:"#8fb1c3", fontSize:12}}>
                              <div style={{display:"grid", gap:6}}>
                                <div style={{color:"#b8d4e3"}}>Faktureras enligt avtal:</div>
                                {contractLineItems.length > 0 ? (
                                  <div style={{display:"grid", gap:4}}>
                                    {contractLineItems.map((item, itemIdx) => (
                                      <div key={`${rowKey}-item-${itemIdx}`} style={{color:"#8fb1c3"}}>• {item}</div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{color:"#8fb1c3"}}>• {row.description || "Beskrivning saknas i Fortnox"}</div>
                                )}
                                <div style={{display:"flex", gap:16, flexWrap:"wrap", marginTop:2}}>
                                  <span>Per faktura ex. moms: {formatSEK(amountExVat)}</span>
                                  <span>Intervall: var {intervalMonths} månad</span>
                                  <span>Årsvärde ex. moms: {formatSEK(annualValueExVat)}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {contractModal.rows.length === 0 && (
              <div style={{color:"#6b8fa3", fontSize:13, marginTop:12}}>Inga avtal hittades för vald kund.</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

"use client";
import React, { useState, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";

// --- Excel-parsning ---

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function detectColumn(headers, keywords) {
  const lower = headers.map(h => String(h || "").toLowerCase().trim());
  for (const kw of keywords) {
    const idx = lower.findIndex(h => h.includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

const COL_KEYWORDS = {
  orgNumber:     ["organisationsnummer", "orgnr", "org.nummer", "org nr", "org.nr"],
  articleNumber: ["artikelnummer", "artikel nr", "art.nr", "artnr", "article"],
  articleName:   ["artikelnamn", "artikel namn", "benämning", "description", "namn på artikel"],
  price:         ["pris", "kostnad", "fast kostnad", "listpris", "á-pris", "apris", "enhetspris"],
  quantity:      ["antal", "qty", "quantity", "mängd"],
  name:          ["kundnamn", "namn", "name", "företag", "bolag", "företagsn"],
};

function buildColMap(headers) {
  const result = {};
  for (const [key, kws] of Object.entries(COL_KEYWORDS)) {
    result[key] = detectColumn(headers, kws);
  }
  return result;
}

function parseFileData(rows) {
  if (!rows || rows.length < 2) return { headers: [], data: [], colMap: {} };

  const row0Headers = rows[0].map(h => String(h || "").trim());
  const row0ColMap = buildColMap(row0Headers);
  if (row0ColMap.orgNumber !== -1) {
    const data = rows.slice(1).filter(row => row.some(cell => String(cell || "").trim() !== ""));
    return { headers: row0Headers, data, colMap: row0ColMap };
  }

  // Multi-section file: scan all rows for header rows
  const orgKws = COL_KEYWORDS.orgNumber;
  const sectionHeaderIndices = [];
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(h => String(h || "").toLowerCase().trim());
    if (orgKws.some(kw => lower.some(h => h === kw || h.includes(kw)))) {
      sectionHeaderIndices.push(i);
    }
  }

  if (sectionHeaderIndices.length === 0) {
    const data = rows.slice(1).filter(row => row.some(cell => String(cell || "").trim() !== ""));
    return { headers: row0Headers, data, colMap: row0ColMap };
  }

  const headers = rows[sectionHeaderIndices[0]].map(h => String(h || "").trim());
  const colMap = buildColMap(headers);

  const allData = [];
  for (let s = 0; s < sectionHeaderIndices.length; s++) {
    const start = sectionHeaderIndices[s] + 1;
    const end = sectionHeaderIndices[s + 1] ?? rows.length;
    for (let i = start; i < end; i++) {
      const row = rows[i];
      if (row.some(cell => String(cell || "").trim() !== "")) {
        allData.push(row);
      }
    }
  }

  return { headers, data: allData, colMap };
}

function getCell(row, idx) {
  if (idx === -1 || idx >= row.length) return "";
  return String(row[idx] ?? "").trim();
}

function parseNum(val) {
  const n = parseFloat(String(val || "").replace(/\s/g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

function buildCustomers(parsedCustomers, parsedLicenses) {
  const { data: custData, colMap: custColMap } = parsedCustomers;
  const customerMap = new Map();

  for (const row of custData) {
    const orgNumber = getCell(row, custColMap.orgNumber);
    if (!orgNumber) continue;
    const name = getCell(row, custColMap.name);
    if (!customerMap.has(orgNumber)) {
      customerMap.set(orgNumber, { orgNumber, name, rows: [] });
    } else if (!customerMap.get(orgNumber).name && name) {
      customerMap.get(orgNumber).name = name;
    }
  }

  if (parsedLicenses && parsedLicenses.colMap.orgNumber !== -1) {
    const { data: licData, colMap: licColMap } = parsedLicenses;
    for (const row of licData) {
      const orgNumber = getCell(row, licColMap.orgNumber);
      if (!orgNumber) continue;
      const articleNumber = getCell(row, licColMap.articleNumber);
      const articleName = getCell(row, licColMap.articleName);
      const price = parseNum(getCell(row, licColMap.price));
      const quantity = parseNum(getCell(row, licColMap.quantity)) || 1;
      const name = getCell(row, licColMap.name);
      if (customerMap.has(orgNumber)) {
        const customer = customerMap.get(orgNumber);
        if (!customer.name && name) customer.name = name;
        if (articleNumber || articleName) {
          customer.rows.push({ articleNumber, description: articleName || articleNumber, quantity, price });
        }
      }
    }
  }

  return Array.from(customerMap.values());
}

function buildPriceMap(parsed) {
  const { data, colMap } = parsed;
  const map = new Map();
  if (colMap.orgNumber === -1) return map;
  for (const row of data) {
    const orgNumber = getCell(row, colMap.orgNumber);
    if (!orgNumber) continue;
    const price = parseNum(getCell(row, colMap.price));
    if (!map.has(orgNumber)) map.set(orgNumber, price);
  }
  return map;
}

function buildRedaCountMap(parsed) {
  const { data, colMap } = parsed;
  const map = new Map();
  if (colMap.orgNumber === -1) return map;
  for (const row of data) {
    const orgNumber = getCell(row, colMap.orgNumber);
    if (!orgNumber) continue;
    map.set(orgNumber, (map.get(orgNumber) || 0) + 1);
  }
  return map;
}

function calcTotal(rows, discountPercent, manualAmount, redaPrice) {
  const subtotal = rows.reduce((sum, r) => sum + r.price * r.quantity, 0) + (manualAmount || 0) + (redaPrice || 0);
  return subtotal * (1 - discountPercent / 100);
}

function fmt(num) {
  if (num === "" || num === null || num === undefined || num === 0) return "–";
  return Number(num).toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " kr";
}

// --- Stilar ---

const S = {
  page: { maxWidth: 1300, margin: "2rem auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #eee" },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 4, color: "#0f172a" },
  subtitle: { color: "#64748b", fontSize: 13, marginBottom: 20 },
  tabs: { display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid #e5e7eb" },
  tab: (active) => ({
    padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none",
    background: "none", borderBottom: active ? "2px solid #0f172a" : "2px solid transparent",
    color: active ? "#0f172a" : "#94a3b8", marginBottom: -2,
  }),
  stepBar: { display: "flex", gap: 8, marginBottom: 28 },
  stepItem: (active, done) => ({
    padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
    background: done ? "#dcfce7" : active ? "#0f172a" : "#f1f5f9",
    color: done ? "#15803d" : active ? "#fff" : "#94a3b8",
    border: "none", cursor: "default"
  }),
  uploadGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 },
  uploadBox: (hasFile) => ({
    border: `2px dashed ${hasFile ? "#16a34a" : "#cbd5e1"}`,
    borderRadius: 8, padding: 20, textAlign: "center", cursor: "pointer",
    background: hasFile ? "#f0fdf4" : "#f8fafc", transition: "border-color .15s"
  }),
  uploadLabel: { fontSize: 13, fontWeight: 600, color: "#334155", display: "block", marginBottom: 8 },
  uploadHint: { fontSize: 12, color: "#94a3b8" },
  uploadStatus: { fontSize: 12, color: "#16a34a", marginTop: 6 },
  btn: (variant = "primary", disabled = false) => ({
    padding: "8px 20px", borderRadius: 6, fontSize: 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", border: "none",
    background: disabled ? "#e2e8f0" : variant === "primary" ? "#0f172a" : variant === "danger" ? "#dc2626" : "#f1f5f9",
    color: disabled ? "#94a3b8" : variant === "primary" ? "#fff" : variant === "danger" ? "#fff" : "#334155",
    opacity: disabled ? 0.7 : 1,
  }),
  th: { padding: "8px 10px", background: "#f1f5f9", border: "1px solid #e5e7eb", fontWeight: 600, fontSize: 12, color: "#475569", textAlign: "left", whiteSpace: "nowrap" },
  td: { padding: "6px 8px", border: "1px solid #e5e7eb", fontSize: 13, color: "#1e293b", verticalAlign: "middle" },
  tag: { display: "inline-block", background: "#eff6ff", color: "#1d4ed8", borderRadius: 4, padding: "1px 6px", fontSize: 11, marginRight: 3, marginBottom: 2 },
  input: { width: 60, padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 13, textAlign: "right", background: "#fff", color: "#1e293b" },
  inputWide: { width: 90, padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 13, textAlign: "right", background: "#fff", color: "#1e293b" },
  inputText: (w = 120) => ({ width: w, padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 12, background: "#fff", color: "#1e293b" }),
  alert: (type) => ({
    padding: "10px 14px", borderRadius: 6, marginBottom: 12, fontSize: 13,
    background: type === "error" ? "#fef2f2" : type === "success" ? "#f0fdf4" : "#eff6ff",
    color: type === "error" ? "#dc2626" : type === "success" ? "#16a34a" : "#1d4ed8",
    border: `1px solid ${type === "error" ? "#fecaca" : type === "success" ? "#bbf7d0" : "#bfdbfe"}`,
  }),
  progressRow: (ok) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
    color: ok === true ? "#16a34a" : ok === false ? "#dc2626" : "#64748b", fontSize: 13
  }),
};

// --- Filuppladdningskomponent ---

function FileUploadBox({ label, required, hint, fileInfo, onChange }) {
  const inputRef = React.useRef();
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onChange(file);
  }, [onChange]);

  return (
    <div
      style={S.uploadBox(!!fileInfo)}
      onClick={() => inputRef.current.click()}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <span style={S.uploadLabel}>
        {label}{required && <span style={{ color: "#dc2626" }}> *</span>}
      </span>
      {hint && <span style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>{hint}</span>}
      <span style={S.uploadHint}>Klicka eller dra hit .xlsx / .xls</span>
      {fileInfo && (
        <div style={S.uploadStatus}>
          ✓ {fileInfo.name} — {fileInfo.rowCount} rader
          {fileInfo.colMap && (
            <div style={{ marginTop: 4, color: "#64748b" }}>
              {fileInfo.colMap.orgNumber !== -1 ? "✓ Org.nr" : "⚠ Saknar org.nr"}
              {fileInfo.colMap.articleNumber !== -1 ? " · ✓ Artikelnr" : ""}
              {fileInfo.colMap.price !== -1 ? " · ✓ Pris" : ""}
            </div>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
        onChange={(e) => { if (e.target.files[0]) onChange(e.target.files[0]); }} />
    </div>
  );
}

// --- Huvudkomponent ---

export default function LicensesPage() {
  const [activeTab, setActiveTab] = useState("wizard");

  // --- Kundinställningar ---
  const [configs, setConfigs] = useState([]); // [{ org_number, name, fortnox_customer_number, discount_percent, fixed_price_fortnox, fixed_price_reda, comment, status }]
  const [configSearch, setConfigSearch] = useState("");
  const [configDirty, setConfigDirty] = useState(false);
  const [savingConfigs, setSavingConfigs] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(true);

  // --- Prislista ---
  const [priceList, setPriceList] = useState([]); // [{ article_number, product_name, monthly_price, comment }]
  const [priceListDirty, setPriceListDirty] = useState(false);
  const [savingPriceList, setSavingPriceList] = useState(false);
  const [loadingPriceList, setLoadingPriceList] = useState(false);
  const [priceListLoaded, setPriceListLoaded] = useState(false);
  const [priceSearch, setPriceSearch] = useState("");

  // --- Tjänsteinställningar ---
  const [redaPricePerInvoice, setRedaPricePerInvoice] = useState(2.5);
  const [redaArticleNumber, setRedaArticleNumber] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);

  // --- Wizard ---
  const [step, setStep] = useState(1);
  const [fileInfos, setFileInfos] = useState({ fortnoxCustomers: null, fortnoxLicenses: null, reda: null, nvr: null });
  const [parsedData, setParsedData] = useState({ fortnoxCustomers: null, fortnoxLicenses: null, reda: null, nvr: null });
  const [customers, setCustomers] = useState([]);
  const [globalDiscount, setGlobalDiscount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Ladda configs vid start
  useEffect(() => {
    fetch("/api/licenses/customer-config")
      .then(r => r.json())
      .then(d => { if (d.ok) setConfigs(d.configs || []); })
      .catch(console.error)
      .finally(() => setLoadingConfigs(false));
  }, []);

  // Ladda prislista vid start (behövs även i wizarden för prisenrikning)
  useEffect(() => {
    fetch("/api/licenses/price-list")
      .then(r => r.json())
      .then(d => { if (d.ok) setPriceList(d.rows || []); })
      .catch(console.error)
      .finally(() => setPriceListLoaded(true));
  }, []);

  // Ladda tjänsteinställningar vid start
  useEffect(() => {
    fetch("/api/licenses/settings")
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setRedaPricePerInvoice(parseFloat(d.settings.reda_price_per_invoice) || 2.5);
          setRedaArticleNumber(d.settings.reda_article_number || "");
        }
      })
      .catch(console.error);
  }, []);

  // --- Kundinställningar-funktioner ---

  function updateConfig(orgNumber, field, value) {
    setConfigs(prev => prev.map(c =>
      c.org_number === orgNumber ? { ...c, [field]: value } : c
    ));
    setConfigDirty(true);
  }

  async function saveConfigs() {
    setSavingConfigs(true);
    try {
      await fetch("/api/licenses/customer-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs }),
      });
      setConfigDirty(false);
    } catch (err) {
      console.error("Kunde inte spara:", err);
    } finally {
      setSavingConfigs(false);
    }
  }

  // Upserta nya kunder (som inte finns i configs) till DB utan att skriva över befintliga
  async function upsertNewCustomersToConfig(built) {
    const existingOrgs = new Set(configs.map(c => c.org_number));
    const newOnes = built
      .filter(c => !existingOrgs.has(c.orgNumber))
      .map(c => ({ org_number: c.orgNumber, name: c.name || "" }));
    if (newOnes.length === 0) return;

    try {
      await fetch("/api/licenses/customer-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: newOnes }),
      });
      setConfigs(prev => {
        const existing = new Set(prev.map(c => c.org_number));
        return [
          ...prev,
          ...newOnes
            .filter(c => !existing.has(c.org_number))
            .map(c => ({ ...c, discount_percent: 0, fortnox_customer_number: "", fixed_price_fortnox: null, fixed_price_reda: null, comment: "", status: "" })),
        ];
      });
    } catch (err) {
      console.error("Kunde inte spara nya kunder:", err);
    }
  }

  // Spara tillbaka kundnummer som hittades vid fakturering
  async function cacheDiscoveredCustomerNumbers(invoiceResults) {
    const newMappings = invoiceResults
      .filter(r => r.ok && r.customerNumber)
      .map(r => ({ org_number: r.orgNumber, fortnox_customer_number: r.customerNumber }));
    if (newMappings.length === 0) return;

    try {
      await fetch("/api/licenses/customer-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: newMappings }),
      });
      setConfigs(prev => prev.map(c => {
        const m = newMappings.find(x => x.org_number === c.org_number);
        return m ? { ...c, fortnox_customer_number: m.fortnox_customer_number } : c;
      }));
    } catch (err) {
      console.error("Kunde inte cacha kundnummer:", err);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await fetch("/api/licenses/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: {
          reda_price_per_invoice: String(redaPricePerInvoice),
          reda_article_number: redaArticleNumber,
        }}),
      });
      setSettingsDirty(false);
    } catch (err) {
      console.error("Kunde inte spara inställningar:", err);
    } finally {
      setSavingSettings(false);
    }
  }

  // --- Prislista-funktioner ---

  function updatePriceRow(articleNumber, field, value) {
    setPriceList(prev => prev.map(r =>
      r.article_number === articleNumber ? { ...r, [field]: value } : r
    ));
    setPriceListDirty(true);
  }

  function addPriceRow() {
    const newRow = { article_number: "", product_name: "", monthly_price: 0, comment: "", _new: true };
    setPriceList(prev => [newRow, ...prev]);
    setPriceListDirty(true);
  }

  function deletePriceRow(articleNumber) {
    setPriceList(prev => prev.filter(r => r.article_number !== articleNumber));
    setPriceListDirty(true);
  }

  async function savePriceList() {
    const valid = priceList.filter(r => String(r.article_number || "").trim());
    if (valid.length === 0) return;
    setSavingPriceList(true);
    try {
      await fetch("/api/licenses/price-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: valid.map(({ _new, ...r }) => ({ ...r, article_number: String(r.article_number).trim() })) }),
      });
      setPriceList(valid.map(({ _new, ...r }) => r));
      setPriceListDirty(false);
    } catch (err) {
      console.error("Kunde inte spara prislista:", err);
    } finally {
      setSavingPriceList(false);
    }
  }

  async function importPriceListFromExcel(file) {
    try {
      const rows = await parseExcelFile(file);
      if (!rows || rows.length < 2) return;
      // Hitta kolumnerna: artikelnr, produkt/namn, pris, kommentar
      const headers = rows[0].map(h => String(h || "").toLowerCase().trim());
      const artIdx = detectColumn(headers, ["artikelnr", "artikel nr", "art.nr", "artnr", "article"]);
      const nameIdx = detectColumn(headers, ["produkt", "namn", "name", "product", "beskrivning"]);
      const priceIdx = detectColumn(headers, ["månadspris", "pris", "price", "kostnad"]);
      const commentIdx = detectColumn(headers, ["kommentar", "comment", "info"]);

      if (artIdx === -1) return;

      const imported = rows.slice(1)
        .filter(row => String(row[artIdx] || "").trim())
        .map(row => ({
          article_number: String(row[artIdx] || "").trim(),
          product_name: nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "",
          monthly_price: priceIdx !== -1 ? parseNum(String(row[priceIdx] || "")) : 0,
          comment: commentIdx !== -1 ? String(row[commentIdx] || "").trim() : "",
        }));

      if (imported.length > 0) {
        setPriceList(prev => {
          const existing = new Map(prev.map(r => [r.article_number, r]));
          imported.forEach(r => existing.set(r.article_number, { ...existing.get(r.article_number), ...r }));
          return Array.from(existing.values()).sort((a, b) => String(a.article_number).localeCompare(String(b.article_number)));
        });
        setPriceListDirty(true);
      }
    } catch (err) {
      console.error("Fel vid import av prislista:", err);
    }
  }

  // --- Wizard-funktioner ---

  async function handleFile(key, file) {
    try {
      const rows = await parseExcelFile(file);
      const parsed = parseFileData(rows);
      setParsedData(prev => ({ ...prev, [key]: parsed }));
      setFileInfos(prev => ({
        ...prev,
        [key]: { name: file.name, rowCount: parsed.data.length, colMap: parsed.colMap }
      }));
      setError(null);
    } catch (err) {
      setError(`Kunde inte läsa filen "${file.name}": ${err.message}`);
    }
  }

  function handleGoToStep2() {
    if (!parsedData.fortnoxCustomers) return;
    const built = buildCustomers(parsedData.fortnoxCustomers, parsedData.fortnoxLicenses);
    const redaCountMap = parsedData.reda ? buildRedaCountMap(parsedData.reda) : new Map();
    const nvrMap = parsedData.nvr ? buildPriceMap(parsedData.nvr) : new Map();
    const configMap = new Map(configs.map(c => [c.org_number, c]));
    // Priskarta från prislistan — används om licensfilen saknar pris på en artikel
    const priceMap = new Map(priceList.map(p => [String(p.article_number), Number(p.monthly_price) || 0]));

    const withSettings = built.map(c => {
      const cfg = configMap.get(c.orgNumber);
      // Berika artikelrader med listpris:
      // - Om artikeln finns i prislistan med pris > 0: använd alltid listpriset
      // - Om prislistan har 0 (t.ex. 82500 Fast kostnad): behåll filens pris
      // - Om artikeln saknas i prislistan: behåll filens pris
      const enrichedRows = c.rows.map(r => {
        if (r.articleNumber && priceMap.has(r.articleNumber)) {
          const listPrice = priceMap.get(r.articleNumber);
          if (listPrice > 0) return { ...r, price: listPrice };
        }
        return r;
      });
      return {
        ...c,
        rows: enrichedRows,
        discountPercent: cfg?.discount_percent ?? 0,
        manualAmount: cfg?.fixed_price_fortnox ?? 0,
        fortnoxCustomerNumber: cfg?.fortnox_customer_number ?? "",
        included: true,
        redaPrice: redaCountMap.has(c.orgNumber) ? redaCountMap.get(c.orgNumber) * redaPricePerInvoice : 0,
        redaInvoiceCount: redaCountMap.get(c.orgNumber) || 0,
        nvrPrice: nvrMap.get(c.orgNumber) ?? "",
      };
    });

    setCustomers(withSettings);
    setStep(2);
    setError(null);

    // Lägg till nya kunder i inställningarna
    upsertNewCustomersToConfig(built);
  }

  function setDiscount(orgNumber, val) {
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    setCustomers(prev => prev.map(c => c.orgNumber === orgNumber ? { ...c, discountPercent: num } : c));
  }

  function setManualAmount(orgNumber, val) {
    const num = Math.max(0, parseFloat(String(val).replace(",", ".")) || 0);
    setCustomers(prev => prev.map(c => c.orgNumber === orgNumber ? { ...c, manualAmount: num } : c));
  }

  function applyGlobalDiscount() {
    const num = Math.max(0, Math.min(100, parseFloat(globalDiscount) || 0));
    setCustomers(prev => prev.map(c => ({ ...c, discountPercent: num })));
  }

  function toggleIncluded(orgNumber) {
    setCustomers(prev => prev.map(c => c.orgNumber === orgNumber ? { ...c, included: !c.included } : c));
  }

  const includedCustomers = customers.filter(c => c.included);
  const totalAmount = includedCustomers.reduce((sum, c) => sum + calcTotal(c.rows, c.discountPercent, c.manualAmount, c.redaPrice), 0);

  async function handleCreateInvoices() {
    setCreating(true);
    setError(null);
    setResults(null);

    const invoices = includedCustomers.map(c => {
      const rows = [...c.rows];
      if (c.manualAmount > 0) {
        rows.push({ description: "Manuell avgift", quantity: 1, price: c.manualAmount });
      }
      if (c.redaPrice > 0) {
        rows.push({
          articleNumber: redaArticleNumber || undefined,
          description: `Reda (${c.redaInvoiceCount} fakturor à ${redaPricePerInvoice} kr)`,
          quantity: c.redaInvoiceCount,
          price: redaPricePerInvoice,
        });
      }
      return {
        orgNumber: c.orgNumber,
        customerNumber: c.fortnoxCustomerNumber || undefined,
        discountPercent: c.discountPercent,
        invoiceDate: invoiceDate || undefined,
        rows,
      };
    }).filter(inv => inv.rows.length > 0);

    if (invoices.length === 0) {
      setError("Inga fakturor att skapa — kontrollera att valda kunder har artikelrader eller manuellt belopp.");
      setCreating(false);
      return;
    }

    try {
      const res = await fetch("/api/licenses/create-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices }),
      });
      const data = await res.json();
      if (!data.ok && !data.results) {
        setError(data.error || "Okänt fel från servern");
      } else {
        setResults(data);
        // Cacha kundnummer som hittades
        if (data.results) cacheDiscoveredCustomerNumbers(data.results);
      }
    } catch (err) {
      setError("Nätverksfel: " + err.message);
    } finally {
      setCreating(false);
    }
  }

  function reset() {
    setStep(1);
    setFileInfos({ fortnoxCustomers: null, fortnoxLicenses: null, reda: null, nvr: null });
    setParsedData({ fortnoxCustomers: null, fortnoxLicenses: null, reda: null, nvr: null });
    setCustomers([]);
    setGlobalDiscount("");
    setResults(null);
    setError(null);
  }

  const canProceed = parsedData.fortnoxCustomers && parsedData.fortnoxCustomers.colMap.orgNumber !== -1;
  const filteredConfigs = configs.filter(c => {
    if (!configSearch) return true;
    const q = configSearch.toLowerCase();
    return (c.org_number || "").includes(q) || (c.name || "").toLowerCase().includes(q);
  });

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Licensfakturering</h1>
      <p style={S.subtitle}>Hantera kundinställningar och skapa fakturor i Fortnox.</p>

      {/* Flikar */}
      <div style={S.tabs}>
        <button style={S.tab(activeTab === "settings")} onClick={() => setActiveTab("settings")}>
          Kundinställningar {configDirty ? "●" : ""}
        </button>
        <button style={S.tab(activeTab === "prices")} onClick={() => setActiveTab("prices")}>
          Prislista {priceListDirty ? "●" : ""}
        </button>
        <button style={S.tab(activeTab === "wizard")} onClick={() => setActiveTab("wizard")}>
          Fakturering
        </button>
      </div>

      {/* === KUNDINSTÄLLNINGAR === */}
      {activeTab === "settings" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Sök kund eller org.nummer…"
              value={configSearch}
              onChange={e => setConfigSearch(e.target.value)}
              style={{ ...S.inputText(220), padding: "6px 10px", fontSize: 13 }}
            />
            <span style={{ fontSize: 13, color: "#64748b" }}>{filteredConfigs.length} kunder</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {configDirty && (
                <button style={S.btn("primary", savingConfigs)} disabled={savingConfigs} onClick={saveConfigs}>
                  {savingConfigs ? "Sparar…" : "Spara ändringar"}
                </button>
              )}
            </div>
          </div>

          {loadingConfigs ? (
            <div style={{ color: "#64748b", fontSize: 13 }}>Laddar kundkonfiguration…</div>
          ) : filteredConfigs.length === 0 ? (
            <div style={S.alert("info")}>
              Inga kunder konfigurerade ännu. Ladda upp filer i Fakturering-fliken så läggs kunderna till automatiskt.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={S.th}>Org.nummer</th>
                    <th style={S.th}>Namn</th>
                    <th style={{ ...S.th }}>Kundnr Fortnox</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Rabatt %</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Fast pris Fortnox</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Fast pris Reda</th>
                    <th style={S.th}>Kommentar</th>
                    <th style={S.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConfigs.map(c => (
                    <tr key={c.org_number}>
                      <td style={S.td}>{c.org_number}</td>
                      <td style={S.td}>
                        <input
                          value={c.name || ""}
                          onChange={e => updateConfig(c.org_number, "name", e.target.value)}
                          style={S.inputText(160)}
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          value={c.fortnox_customer_number || ""}
                          onChange={e => updateConfig(c.org_number, "fortnox_customer_number", e.target.value)}
                          style={S.inputText(80)}
                          placeholder="Auto"
                        />
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <input
                          type="number" min="0" max="100" step="1"
                          value={c.discount_percent || ""}
                          onChange={e => updateConfig(c.org_number, "discount_percent", parseFloat(e.target.value) || 0)}
                          style={S.input}
                          placeholder="0"
                        />
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <input
                          type="number" min="0" step="1"
                          value={c.fixed_price_fortnox ?? ""}
                          onChange={e => updateConfig(c.org_number, "fixed_price_fortnox", e.target.value === "" ? null : parseFloat(e.target.value) || 0)}
                          style={S.inputWide}
                          placeholder="–"
                        />
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <input
                          type="number" min="0" step="1"
                          value={c.fixed_price_reda ?? ""}
                          onChange={e => updateConfig(c.org_number, "fixed_price_reda", e.target.value === "" ? null : parseFloat(e.target.value) || 0)}
                          style={S.inputWide}
                          placeholder="–"
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          value={c.comment || ""}
                          onChange={e => updateConfig(c.org_number, "comment", e.target.value)}
                          style={S.inputText(160)}
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          value={c.status || ""}
                          onChange={e => updateConfig(c.org_number, "status", e.target.value)}
                          style={S.inputText(120)}
                          placeholder="OK"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {configDirty && (
            <div style={{ marginTop: 16 }}>
              <button style={S.btn("primary", savingConfigs)} disabled={savingConfigs} onClick={saveConfigs}>
                {savingConfigs ? "Sparar…" : "Spara ändringar"}
              </button>
            </div>
          )}

          {/* Tjänsteinställningar */}
          <div style={{ marginTop: 32, padding: "16px 20px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 12 }}>Tjänsteinställningar</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Reda — pris per faktura (kr)</div>
                <input
                  type="number" min="0" step="0.5"
                  value={redaPricePerInvoice}
                  onChange={e => { setRedaPricePerInvoice(parseFloat(e.target.value) || 0); setSettingsDirty(true); }}
                  style={{ ...S.inputWide, width: 90 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Reda — artikelnummer (valfritt)</div>
                <input
                  type="text"
                  value={redaArticleNumber}
                  onChange={e => { setRedaArticleNumber(e.target.value); setSettingsDirty(true); }}
                  style={S.inputText(140)}
                  placeholder="T.ex. REDA001"
                />
              </div>
              {settingsDirty && (
                <button style={S.btn("primary", savingSettings)} disabled={savingSettings} onClick={saveSettings}>
                  {savingSettings ? "Sparar…" : "Spara inställningar"}
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
              Reda-filen räknar antal rader per kund (= antal fakturor) och multiplicerar med priset ovan.
            </div>
          </div>
        </>
      )}

      {/* === PRISLISTA === */}
      {activeTab === "prices" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Sök artikel eller produkt…"
              value={priceSearch}
              onChange={e => setPriceSearch(e.target.value)}
              style={{ ...S.inputText(220), padding: "6px 10px", fontSize: 13 }}
            />
            <span style={{ fontSize: 13, color: "#64748b" }}>
              {priceList.filter(r => !priceSearch || String(r.article_number).includes(priceSearch) || (r.product_name || "").toLowerCase().includes(priceSearch.toLowerCase())).length} artiklar
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {/* Import från Excel */}
              <label style={{ ...S.btn("secondary"), display: "inline-block", cursor: "pointer" }}>
                Importera Excel
                <input type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                  onChange={e => { if (e.target.files[0]) importPriceListFromExcel(e.target.files[0]); }} />
              </label>
              <button style={S.btn("secondary")} onClick={addPriceRow}>+ Lägg till rad</button>
              {priceListDirty && (
                <button style={S.btn("primary", savingPriceList)} disabled={savingPriceList} onClick={savePriceList}>
                  {savingPriceList ? "Sparar…" : "Spara ändringar"}
                </button>
              )}
            </div>
          </div>

          {loadingPriceList ? (
            <div style={{ color: "#64748b", fontSize: 13 }}>Laddar prislista…</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={S.th}>Artikelnr</th>
                    <th style={S.th}>Produkt</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Månadspris ex moms</th>
                    <th style={S.th}>Kommentar</th>
                    <th style={S.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {priceList
                    .filter(r => !priceSearch ||
                      String(r.article_number).includes(priceSearch) ||
                      (r.product_name || "").toLowerCase().includes(priceSearch.toLowerCase()))
                    .map((r, idx) => (
                      <tr key={r.article_number || `new-${idx}`}>
                        <td style={S.td}>
                          <input
                            value={r.article_number || ""}
                            onChange={e => updatePriceRow(r.article_number, "article_number", e.target.value)}
                            style={S.inputText(90)}
                            placeholder="Artikelnr"
                          />
                        </td>
                        <td style={S.td}>
                          <input
                            value={r.product_name || ""}
                            onChange={e => updatePriceRow(r.article_number, "product_name", e.target.value)}
                            style={S.inputText(220)}
                            placeholder="Produktnamn"
                          />
                        </td>
                        <td style={{ ...S.td, textAlign: "right" }}>
                          <input
                            type="number" min="0" step="1"
                            value={r.monthly_price ?? ""}
                            onChange={e => updatePriceRow(r.article_number, "monthly_price", parseFloat(e.target.value) || 0)}
                            style={S.inputWide}
                            placeholder="0"
                          />
                        </td>
                        <td style={S.td}>
                          <input
                            value={r.comment || ""}
                            onChange={e => updatePriceRow(r.article_number, "comment", e.target.value)}
                            style={S.inputText(240)}
                            placeholder="–"
                          />
                        </td>
                        <td style={{ ...S.td, textAlign: "center" }}>
                          <button
                            onClick={() => deletePriceRow(r.article_number)}
                            style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                            title="Ta bort"
                          >×</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {priceList.length === 0 && (
                <div style={{ ...S.alert("info"), marginTop: 12 }}>
                  Prislistan är tom. Importera från Excel eller lägg till rader manuellt.
                </div>
              )}
            </div>
          )}

          {priceListDirty && (
            <div style={{ marginTop: 16 }}>
              <button style={S.btn("primary", savingPriceList)} disabled={savingPriceList} onClick={savePriceList}>
                {savingPriceList ? "Sparar…" : "Spara ändringar"}
              </button>
            </div>
          )}
        </>
      )}

      {/* === FAKTURERING === */}
      {activeTab === "wizard" && (
        <>
          {error && <div style={S.alert("error")}>{error}</div>}

          <div style={S.stepBar}>
            {[["1. Ladda upp", 1], ["2. Granska & konfigurera", 2], ["3. Skapa fakturor", 3]].map(([label, n]) => (
              <span key={n} style={S.stepItem(step === n, step > n)}>{label}</span>
            ))}
          </div>

          {/* STEG 1 */}
          {step === 1 && (
            <>
              <div style={S.uploadGrid}>
                <FileUploadBox
                  label="Fortnox – Kundlista" required
                  hint="Alla kunder med org.nummer och namn"
                  fileInfo={fileInfos.fortnoxCustomers}
                  onChange={f => handleFile("fortnoxCustomers", f)}
                />
                <FileUploadBox
                  label="Fortnox – Licenser"
                  hint="Vad varje kund förbrukat (saknas kunder utan licenser)"
                  fileInfo={fileInfos.fortnoxLicenses}
                  onChange={f => handleFile("fortnoxLicenses", f)}
                />
                <FileUploadBox label="Reda" fileInfo={fileInfos.reda} onChange={f => handleFile("reda", f)} />
                <FileUploadBox label="NVR" fileInfo={fileInfos.nvr} onChange={f => handleFile("nvr", f)} />
              </div>
              {parsedData.fortnoxCustomers && parsedData.fortnoxCustomers.colMap.orgNumber === -1 && (
                <div style={S.alert("error")}>
                  Kundlistefilen saknar en kolumn med organisationsnummer.
                </div>
              )}
              <button style={S.btn("primary", !canProceed)} disabled={!canProceed} onClick={handleGoToStep2}>
                Nästa →
              </button>
            </>
          )}

          {/* STEG 2 */}
          {step === 2 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Fakturadatum:</span>
                  <input
                    type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                    style={{ padding: "3px 8px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 13 }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Rabatt för alla:</span>
                  <input
                    type="number" min="0" max="100" step="1" placeholder="0"
                    value={globalDiscount} onChange={e => setGlobalDiscount(e.target.value)}
                    style={S.input}
                  />
                  <span style={{ fontSize: 13 }}>%</span>
                  <button style={S.btn("secondary")} onClick={applyGlobalDiscount}>Tillämpa</button>
                </div>
              </div>

              {customers.length === 0 ? (
                <div style={S.alert("info")}>Inga kunder hittades.</div>
              ) : (
                <div style={{ overflowX: "auto", marginBottom: 16 }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={S.th}>✓</th>
                        <th style={S.th}>Org.nummer</th>
                        <th style={S.th}>Kundnamn</th>
                        <th style={S.th}>Licensrader</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Licenssubtotal</th>
                        {parsedData.reda && <th style={{ ...S.th, textAlign: "right" }}>Reda-pris</th>}
                        {parsedData.nvr && <th style={{ ...S.th, textAlign: "right" }}>NVR-pris</th>}
                        <th style={{ ...S.th, textAlign: "right" }}>Manuellt belopp</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Rabatt %</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Totalt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map(c => {
                        const licSubtotal = c.rows.reduce((s, r) => s + r.price * r.quantity, 0);
                        const total = calcTotal(c.rows, c.discountPercent, c.manualAmount, c.redaPrice);
                        const noRows = c.rows.length === 0;
                        return (
                          <tr key={c.orgNumber} style={{ opacity: c.included ? 1 : 0.45, background: noRows ? "#fffbeb" : undefined }}>
                            <td style={S.td}>
                              <input type="checkbox" checked={c.included} onChange={() => toggleIncluded(c.orgNumber)} />
                            </td>
                            <td style={S.td}>
                              {c.orgNumber}
                              {c.fortnoxCustomerNumber && (
                                <div style={{ fontSize: 11, color: "#94a3b8" }}>Kundnr {c.fortnoxCustomerNumber}</div>
                              )}
                            </td>
                            <td style={S.td}>{c.name || <span style={{ color: "#94a3b8" }}>–</span>}</td>
                            <td style={S.td}>
                              {noRows
                                ? <span style={{ color: "#d97706", fontSize: 11 }}>Inga licensrader</span>
                                : c.rows.map((r, i) => (
                                  <span key={i} style={S.tag} title={`${r.quantity} × ${r.price} kr`}>
                                    {r.articleNumber || r.description || "?"}{r.quantity !== 1 ? ` ×${r.quantity}` : ""}
                                  </span>
                                ))
                              }
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>{fmt(licSubtotal)}</td>
                            {parsedData.reda && (
                              <td style={{ ...S.td, textAlign: "right" }}>
                                {c.redaInvoiceCount > 0
                                  ? <span title={`${c.redaInvoiceCount} fakturor × ${redaPricePerInvoice} kr`}>{fmt(c.redaPrice)}</span>
                                  : <span style={{ color: "#94a3b8" }}>–</span>
                                }
                              </td>
                            )}
                            {parsedData.nvr && <td style={{ ...S.td, textAlign: "right" }}>{fmt(c.nvrPrice)}</td>}
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <input
                                type="number" min="0" step="1" placeholder="0"
                                value={c.manualAmount || ""}
                                onChange={e => setManualAmount(c.orgNumber, e.target.value)}
                                style={{ ...S.inputWide, borderColor: noRows && !c.manualAmount ? "#fbbf24" : "#cbd5e1" }}
                              />
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <input
                                type="number" min="0" max="100" step="1"
                                value={c.discountPercent}
                                onChange={e => setDiscount(c.orgNumber, e.target.value)}
                                style={S.input}
                              />
                            </td>
                            <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>
                              {total === 0 && c.included
                                ? <span style={{ color: "#d97706" }}>0 kr</span>
                                : fmt(total)
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f8fafc" }}>
                        <td
                          colSpan={6 + (parsedData.reda ? 1 : 0) + (parsedData.nvr ? 1 : 0)}
                          style={{ ...S.td, fontWeight: 600, textAlign: "right" }}
                        >
                          {includedCustomers.length} kunder valda · Totalt:
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, textAlign: "right", color: "#0f172a" }}>{fmt(totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {customers.some(c => c.included && c.rows.length === 0 && !c.manualAmount) && (
                <div style={{ ...S.alert("info"), marginBottom: 12 }}>
                  Kunder med gul bakgrund saknar licensrader och manuellt belopp — de faktureras inte.
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button style={S.btn("secondary")} onClick={() => setStep(1)}>← Tillbaka</button>
                <button
                  style={S.btn("primary", includedCustomers.length === 0)}
                  disabled={includedCustomers.length === 0}
                  onClick={() => { setStep(3); setResults(null); }}
                >
                  Nästa → ({includedCustomers.length} kunder)
                </button>
              </div>
            </>
          )}

          {/* STEG 3 */}
          {step === 3 && (
            <>
              {!results ? (
                <>
                  <div style={{ ...S.alert("info"), marginBottom: 16 }}>
                    <strong>{includedCustomers.length} fakturor</strong> kommer att skapas i Fortnox · Totalt {fmt(totalAmount)}
                  </div>

                  <div style={{ overflowX: "auto", marginBottom: 20 }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th style={S.th}>Org.nummer</th>
                          <th style={S.th}>Kundnamn</th>
                          <th style={S.th}>Licensrader</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Manuellt</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Rabatt</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Totalt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {includedCustomers.map(c => (
                          <tr key={c.orgNumber} style={{ opacity: c.rows.length === 0 && !c.manualAmount ? 0.4 : 1 }}>
                            <td style={S.td}>
                              {c.orgNumber}
                              {c.fortnoxCustomerNumber && <div style={{ fontSize: 11, color: "#94a3b8" }}>Kundnr {c.fortnoxCustomerNumber}</div>}
                            </td>
                            <td style={S.td}>{c.name || "–"}</td>
                            <td style={S.td}>
                              {c.rows.length === 0
                                ? <span style={{ color: "#94a3b8" }}>–</span>
                                : c.rows.map((r, i) => <span key={i} style={S.tag}>{r.articleNumber || r.description}</span>)
                              }
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>{c.manualAmount > 0 ? fmt(c.manualAmount) : "–"}</td>
                            <td style={{ ...S.td, textAlign: "right" }}>{c.discountPercent > 0 ? `${c.discountPercent}%` : "–"}</td>
                            <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>
                              {fmt(calcTotal(c.rows, c.discountPercent, c.manualAmount, c.redaPrice))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={S.btn("secondary")} onClick={() => setStep(2)}>← Tillbaka</button>
                    <button style={S.btn("primary", creating)} disabled={creating} onClick={handleCreateInvoices}>
                      {creating ? "Skapar fakturor…" : `Skapa ${includedCustomers.length} fakturor i Fortnox`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={S.alert(results.failed === 0 ? "success" : results.created === 0 ? "error" : "info")}>
                    {results.created > 0 && <span>✓ {results.created} faktura{results.created !== 1 ? "r" : ""} skapade. </span>}
                    {results.skipped > 0 && <span>⚠ {results.skipped} hoppades över (fanns redan). </span>}
                    {results.failed > 0 && <span>✗ {results.failed} misslyckades.</span>}
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    {results.results?.map((r, i) => (
                      <div key={i} style={S.progressRow(r.ok)}>
                        <span>{r.ok ? "✓" : r.skipped ? "⚠" : "✗"}</span>
                        <span style={{ fontWeight: 600 }}>{r.orgNumber}</span>
                        {r.ok
                          ? <span>→ Faktura <strong>#{r.invoiceNumber}</strong> skapad (Kundnr {r.customerNumber})</span>
                          : r.skipped
                            ? <span style={{ color: "#d97706" }}>{r.error}</span>
                            : <span style={{ color: "#dc2626" }}>{r.error}</span>
                        }
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={S.btn("secondary")} onClick={() => setResults(null)}>← Tillbaka</button>
                    <button style={S.btn("secondary")} onClick={reset}>Börja om</button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

import { cookies } from "next/headers";
import { readFileSync } from "fs";
import DashboardClient from "./DashboardClient";
import {
  saveToken,
  getTokenFromDb,
  saveInvoices,
  getCachedInvoices,
  saveInvoiceRows,
  getInvoiceRowsForInvoices,
  getCachedArticleRegistry,
  getCachedContractAccruals,
  getCustomerCostCenterMappings,
  saveCustomerCostCenterMappings,
  getEmployeeMappings,
  getArticleGroupMappings,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Delay mellan API-anrop för att undvika rate-limiting
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Robust fetch som hanterar 429 och icke-JSON-responser
async function fetchJsonWithRetry(url, options = {}, retries = 3) {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    const res = await fetch(url, options);

    if (res.status === 429) {
      const waitTime = parseInt(res.headers.get("Retry-After") || "2") * 1000;
      console.log(`Rate-limitad på ${url}, väntar ${waitTime}ms (attempt ${attempt}/${retries})`);
      await delay(waitTime + 500);
      continue;
    }

    const text = await res.text();
    // Försök parse JSON, annars logga och kasta
    try {
      const data = text ? JSON.parse(text) : null;
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.warn(`Non-JSON response från ${url}:`, text.slice(0, 200));
      if (!res.ok) {
        // Om icke-ok och icke-JSON, vänta en stund och försök igen
        await delay(1000 * attempt);
        continue;
      }
      // om ok men icke-JSON, returnera null data
      return { ok: true, status: res.status, data: null };
    }
  }
  throw new Error(`Misslyckades att hämta JSON från ${url} efter ${retries} försök`);
}

async function refreshToken(userId) {
  try {
    const cookieStore = await cookies();
    const refreshFromCookie = cookieStore.get("fortnox_refresh_token")?.value;
    const refreshToken = refreshFromCookie || readFileSync(".fortnox_refresh", "utf8").trim();
    const credentials = Buffer.from(
      `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch("https://apps.fortnox.se/oauth-v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      // Spara även i Supabase
      await saveToken(userId, data.access_token, data.refresh_token || refreshToken);
      return data.access_token;
    }
  } catch (err) {
    console.error("Refresh misslyckades:", err);
  }
  return null;
}

async function getAllInvoices(token, userId) {
  try {
    // Vi vill bara ha fakturor från och med 2025-01-01
    const fromDate = "2025-01-01";
    const cachedInvoices = await getCachedInvoices(fromDate);
    if (cachedInvoices && cachedInvoices.length > 0) {
      // Om vi redan har några fakturor från 2025 eller senare, kontrollera att vi inte saknar hela året
      const earliest = cachedInvoices.reduce((min, inv) => {
        const d = inv.invoice_date || inv.InvoiceDate;
        return d && d < min ? d : min;
      }, "9999-12-31");
      // Om den tidigaste sparade fakturan är tidigare än januari 2025, använd cache.
      if (earliest && earliest <= fromDate) {
        console.log("Använder cachade fakturor (från 2025):", cachedInvoices.length);
        return cachedInvoices;
      }
      // annars behöver vi hämta igen eftersom vi saknar alla 2025-fakturor
      console.log("Cache innehåller inga fakturor från 2025, hämtar från API...");
    }

    async function fetchInvoicesByType(invoiceType) {
      let page = 1;
      let hasMore = true;
      let rows = [];

      while (hasMore) {
        const params = new URLSearchParams({
          limit: "500",
          page: String(page),
          fromdate: fromDate,
          booked: "true",
          invoicetype: invoiceType,
        });

        const url = `https://api.fortnox.se/3/invoices?${params.toString()}`;
        try {
          const result = await fetchJsonWithRetry(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          }, 4);

          if (!result || !result.data) {
            console.warn("Tomt eller icke-JSON-svar från Fortnox för sida", page, "typ", invoiceType);
            hasMore = false;
            break;
          }

          const data = result.data;

          if (data.ErrorInformation) {
            console.log("Token fel, försöker förnya...", data.ErrorInformation);
            const newToken = await refreshToken(userId);
            if (newToken) {
              token = newToken;
              continue;
            }

            hasMore = false;
            break;
          }

          const batch = Array.isArray(data.Invoices) ? data.Invoices : [];
          rows = rows.concat(batch);
          hasMore = batch.length === 500;
          page++;
        } catch (err) {
          console.error("Fel vid hämtning av fakturaportion:", err.message || err, { invoiceType, page });
          hasMore = false;
          break;
        }
      }

      return rows;
    }

    const [normalInvoices, creditInvoices] = await Promise.all([
      fetchInvoicesByType("INVOICE"),
      fetchInvoicesByType("CREDIT"),
    ]);

    const allInvoices = [...normalInvoices, ...creditInvoices]
      .filter(inv => {
        const bookedFlag = inv?.Booked;
        if (bookedFlag === undefined || bookedFlag === null) return true;
        if (typeof bookedFlag === "boolean") return bookedFlag;
        const normalized = String(bookedFlag).trim().toLowerCase();
        return normalized === "true" || normalized === "1" || normalized === "yes";
      })
      .filter(inv => {
        const type = String(inv?.InvoiceType || "").trim().toUpperCase();
        if (!type) return true;
        return type === "INVOICE" || type === "CREDIT";
      })
      .reduce((acc, inv) => {
        const number = String(inv?.DocumentNumber || "").trim();
        if (!number) return acc;
        if (!acc.map.has(number)) {
          acc.map.set(number, true);
          acc.rows.push(inv);
        }
        return acc;
      }, { rows: [], map: new Map() }).rows;

    // Spara bara fakturor för nu - hämta artiklar on-demand
    console.log("FÖRSTA FAKTURAS FÄLT:", JSON.stringify(allInvoices[0], null, 2));
    const invoicesToSave = allInvoices.map(inv => ({
      document_number: inv.DocumentNumber,
      customer_name: inv.CustomerName,
      customer_number: inv.CustomerNumber || inv.CustomerNo || "",
      invoice_date: inv.InvoiceDate,
      total: inv.Total,
      balance: inv.Balance,
      currency_code: inv.CurrencyCode,
    }));

    await saveInvoices(invoicesToSave);
    console.log("Fakturor sparade i Supabase! (artiklar hämtas on-demand)");

    console.log("Totalt antal fakturor:", allInvoices.length, "Datum på första:", allInvoices[0]?.InvoiceDate);
    return allInvoices;
  } catch (err) {
    console.error("Fel vid hämtning:", err);
    return [];
  }
}

async function getToken(userId) {
  try {
    const cookieStore = await cookies();
    const tokenFromCookie = cookieStore.get("fortnox_access_token")?.value;
    if (tokenFromCookie) return tokenFromCookie;

    const tokenFromDb = await getTokenFromDb(userId || "default_user");
    if (tokenFromDb) return tokenFromDb;

    return readFileSync(".fortnox_token", "utf8").trim();
  } catch {
    return null;
  }
}

async function getInvoiceRows(invoiceNumber, token) {
  let retries = 3;
  while (retries > 0) {
    try {
      const res = await fetch(`https://api.fortnox.se/3/invoices/${invoiceNumber}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      // Checkra för rate-limit
      if (res.status === 429) {
        const waitTime = parseInt(res.headers.get("Retry-After") || "2") * 1000;
        console.log(`Rate-limitad, väntar ${waitTime}ms...`);
        await delay(waitTime);
        retries--;
        continue;
      }

      const data = await res.json();
      return data.Invoice?.InvoiceRows || [];
    } catch (err) {
      console.error("Fel vid hämtning av fakturadetaljer:", err);
      retries--;
      if (retries > 0) {
        await delay(1000); // Vänta 1 sekund innan retry
      }
    }
  }
  return [];
}

async function getAllCustomers(token, userId, customerNumbersToEnrich = null) {
  try {
    let allCustomers = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.fortnox.se/3/customers?limit=500&page=${page}`;
      const result = await fetchJsonWithRetry(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 4);

      if (!result || !result.data) {
        hasMore = false;
        break;
      }

      const data = result.data;
      if (data.ErrorInformation) {
        console.log("Token fel vid customers, försöker förnya...", data.ErrorInformation);
        const newToken = await refreshToken(userId);
        if (newToken) {
          token = newToken;
          continue;
        } else {
          hasMore = false;
          break;
        }
      }

      allCustomers = allCustomers.concat(data.Customers || []);
      hasMore = data.Customers && data.Customers.length === 500;
      page++;
    }

    async function getCustomerDetail(customerNumber, currentToken) {
      const detailUrl = `https://api.fortnox.se/3/customers/${customerNumber}`;
      let activeToken = currentToken;

      let detailResult = await fetchJsonWithRetry(detailUrl, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 4);

      const detailData = detailResult?.data;
      if (detailData?.ErrorInformation) {
        const newToken = await refreshToken(userId);
        if (newToken) {
          activeToken = newToken;
          detailResult = await fetchJsonWithRetry(detailUrl, {
            headers: {
              Authorization: `Bearer ${activeToken}`,
              Accept: "application/json",
            },
            cache: "no-store",
          }, 4);
        }
      }

      return {
        customer: detailResult?.data?.Customer || null,
        token: activeToken,
      };
    }

    const enrichedCustomers = [];
    let activeToken = token;

    const shouldEnrichNumber = (num) => {
      if (!customerNumbersToEnrich || customerNumbersToEnrich.size === 0) return true;
      return customerNumbersToEnrich.has(num);
    };

    for (const customer of allCustomers) {
      const customerNumber = normalizeCustomerNumber(customer.CustomerNumber || customer.CustomerNo || customer.CustomerId);
      const existingCostCenter = normalizeCostCenter(customer.CostCenter || customer.CostCenterCode || customer.CostCenterId);

      if (!existingCostCenter && customerNumber && shouldEnrichNumber(customerNumber)) {
        try {
          const detail = await getCustomerDetail(customerNumber, activeToken);
          activeToken = detail.token;
          if (detail.customer) {
            enrichedCustomers.push({ ...customer, ...detail.customer });
          } else {
            enrichedCustomers.push(customer);
          }
          await delay(120);
        } catch {
          enrichedCustomers.push(customer);
        }
      } else {
        enrichedCustomers.push(customer);
      }
    }

    console.log("Hämtade customers:", allCustomers.length, "| Enriched:", enrichedCustomers.length);
    return enrichedCustomers;
  } catch (err) {
    console.error("Fel vid hämtning av customers:", err);
    return [];
  }
}

async function getCustomerCard(customerNumber, token, userId) {
  const detailUrl = `https://api.fortnox.se/3/customers/${customerNumber}`;
  let activeToken = token;

  let result = await fetchJsonWithRetry(detailUrl, {
    headers: {
      Authorization: `Bearer ${activeToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  }, 5);

  if (result?.data?.ErrorInformation) {
    const newToken = await refreshToken(userId);
    if (newToken) {
      activeToken = newToken;
      result = await fetchJsonWithRetry(detailUrl, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 5);
    }
  }

  return {
    token: activeToken,
    customer: result?.data?.Customer || null,
  };
}

async function getCostCenterDictionary(token, userId) {
  const dict = new Map();
  let activeToken = token;

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.fortnox.se/3/costcenters?limit=500&page=${page}`;
      let result = await fetchJsonWithRetry(url, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 4);

      if (!result || !result.data) break;

      if (result.data?.ErrorInformation) {
        const newToken = await refreshToken(userId);
        if (!newToken) break;
        activeToken = newToken;
        result = await fetchJsonWithRetry(url, {
          headers: {
            Authorization: `Bearer ${activeToken}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }, 4);
      }

      const rows = result?.data?.CostCenters || [];
      for (const row of rows) {
        const code = normalizeCostCenter(row.CostCenter || row.Code || row.CostCenterCode || row.Number);
        const name = String(row.Description || row.Name || row.CostCenterName || "").trim();
        if (code) dict.set(code, name);
      }

      hasMore = rows.length === 500;
      page++;
      await delay(120);
    }
  } catch (err) {
    console.warn("Kunde inte hämta kostnadsställen:", err?.message || err);
  }

  return dict;
}

function normalizeCostCenter(raw) {
  if (!raw) return "";
  if (typeof raw === "object") {
    return String(
      raw.CostCenter || raw.CostCenterCode || raw.CostCenterId || raw.Code || raw.code || raw.Id || ""
    ).trim();
  }
  return String(raw).trim();
}

function normalizeCustomerNumber(raw) {
  if (!raw) return "";
  return String(raw).trim();
}

const DASHBOARD_CACHE_TTL_MS = 5 * 60_000;
const DASHBOARD_PRELOADED_INVOICE_ROW_LIMIT = 150;
const dashboardDataMemoryCache = new Map();

async function getDashboardDataFromDbCached(fromDate) {
  const cacheKey = String(fromDate || "2025-01-01");
  const now = Date.now();
  const existing = dashboardDataMemoryCache.get(cacheKey);

  if (existing && existing.expiresAt > now && existing.data) {
    return existing.data;
  }

  const invoices = await getCachedInvoices(fromDate);
  const invoiceNumbers = invoices
    .map(inv => String(inv.document_number || inv.DocumentNumber || "").trim())
    .filter(Boolean);

  const preloadedInvoiceNumbers = invoices
    .slice()
    .sort((a, b) => {
      const aDate = String(a.invoice_date || a.InvoiceDate || "");
      const bDate = String(b.invoice_date || b.InvoiceDate || "");
      return bDate.localeCompare(aDate);
    })
    .slice(0, DASHBOARD_PRELOADED_INVOICE_ROW_LIMIT)
    .map(inv => String(inv.document_number || inv.DocumentNumber || "").trim())
    .filter(Boolean);

  const invoiceCustomerNumbers = new Set(
    invoices
      .map(inv => normalizeCustomerNumber(inv.customer_number || inv.CustomerNumber || inv.CustomerNo || inv.CustomerId))
      .filter(Boolean)
  );

  const [invoiceRows, customerMappings, employeeMappings, articleGroupMappings, contractAccruals] = await Promise.all([
    getInvoiceRowsForInvoices(preloadedInvoiceNumbers),
    getCustomerCostCenterMappings(Array.from(invoiceCustomerNumbers)),
    getEmployeeMappings(),
    getArticleGroupMappings(),
    getCachedContractAccruals(),
  ]);

  const articleNumbersUsed = Array.from(new Set(
    invoiceRows
      .map(row => String(row.article_number || row.ArticleNumber || row.ArticleNo || "").trim())
      .filter(Boolean)
  ));

  const articleRegistry = await getCachedArticleRegistry(articleNumbersUsed);
  const articleRegistryNumbers = new Set(
    articleRegistry
      .map(a => String(a.article_number || "").trim())
      .filter(Boolean)
  );
  const invoiceNumbersWithRows = new Set(
    invoiceRows
      .map(row => String(row.invoice_number || "").trim())
      .filter(Boolean)
  );

  const articleCacheStatus = {
    totalInvoices: preloadedInvoiceNumbers.length,
    withRows: invoiceNumbersWithRows.size,
    missing: Math.max(0, preloadedInvoiceNumbers.length - invoiceNumbersWithRows.size),
  };
  const articleRegistryStatus = {
    usedArticleNumbers: articleNumbersUsed.length,
    withRegistryMatch: articleRegistryNumbers.size,
    missing: Math.max(0, articleNumbersUsed.length - articleRegistryNumbers.size),
  };

  const data = {
    invoices,
    invoiceRows,
    articleRegistry,
    articleCacheStatus,
    articleRegistryStatus,
    timeReports: [],
    customerMappings,
    employeeMappings,
    articleGroupMappings,
    contractAccruals,
  };

  dashboardDataMemoryCache.set(cacheKey, {
    data,
    expiresAt: now + DASHBOARD_CACHE_TTL_MS,
  });

  return data;
}

export default async function Home() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("fortnox_auth")?.value;
  const userId = cookieStore.get("user_id")?.value || "default_user"; // använd user_id från cookies eller default
  const token = await getToken(userId);
  const allowSharedView = process.env.ALLOW_SHARED_VIEW_WITHOUT_LOGIN === "true";

  if (!token || (!isLoggedIn && !allowSharedView)) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{background: "linear-gradient(135deg, #0f1923 0%, #1a2e3b 100%)"}}>
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Fortnox Dashboard</h1>
          <p className="text-gray-400 mb-8">Omsättning, kunder och fakturor i realtid</p>
          <a
            href="/api/auth/login"
            className="inline-block px-8 py-4 rounded-xl text-white font-semibold text-lg"
            style={{background: "linear-gradient(135deg, #00c97a, #00a862)", boxShadow: "0 8px 32px rgba(0,201,122,0.3)"}}
          >
            Logga in med Fortnox
          </a>
        </div>
      </main>
    );
  }

  // Läs enbart från databasen för snabb sidladdning (ingen auto-sync mot Fortnox här)
  const fromDate = "2025-01-01";
  const {
    invoices,
    invoiceRows,
    articleRegistry,
    articleCacheStatus,
    articleRegistryStatus,
    timeReports,
    customerMappings,
    employeeMappings,
    articleGroupMappings,
    contractAccruals,
  } = await getDashboardDataFromDbCached(fromDate);

  const freshContractAccruals = await getCachedContractAccruals();

  return (
    <DashboardClient
      invoices={invoices}
      customers={customerMappings}
      initialInvoiceRows={invoiceRows}
      articleCacheStatus={articleCacheStatus}
      articleRegistry={articleRegistry}
      articleRegistryStatus={articleRegistryStatus}
      timeReports={timeReports}
      timeReportsFromDate={fromDate}
      employeeMappings={employeeMappings}
      articleGroupMappings={articleGroupMappings}
      contractAccruals={freshContractAccruals.length > 0 ? freshContractAccruals : contractAccruals}
    />
  );
}
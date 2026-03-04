import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { saveContractAccruals } from "@/lib/supabase";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getToken() {
  try {
    return readFileSync(".fortnox_token", "utf8").trim();
  } catch {
    return null;
  }
}

async function refreshToken() {
  try {
    const refreshToken = readFileSync(".fortnox_refresh", "utf8").trim();
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
      return data.access_token;
    }
  } catch (err) {
    console.error("Refresh misslyckades:", err);
  }
  return null;
}

async function fetchJsonWithRetry(url, options = {}, retries = 4) {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    const res = await fetch(url, options);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
      await delay(retryAfter + 500);
      continue;
    }

    const text = await res.text();
    try {
      const data = text ? JSON.parse(text) : null;
      return { ok: res.ok, status: res.status, data };
    } catch {
      if (!res.ok) {
        await delay(1000 * attempt);
        continue;
      }
      return { ok: true, status: res.status, data: null };
    }
  }

  throw new Error(`Misslyckades att hämta JSON från ${url}`);
}

function pickFirst(obj, keys = []) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
  }
  return null;
}

function normalizeDate(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function normalizeAmount(raw) {
  if (raw == null) return null;
  const normalized = String(raw).replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function extractRows(data) {
  if (!data || typeof data !== "object") return [];
  const candidates = [
    data.Contracts,
    data.Contract,
    data.ContractAccruals,
    data.ContractAccrual,
    data.Results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function extractSingleContract(data) {
  if (!data || typeof data !== "object") return null;
  if (data.Contract && typeof data.Contract === "object") return data.Contract;
  if (Array.isArray(data.Contracts) && data.Contracts.length > 0) return data.Contracts[0];
  if (data.ContractAccrual && typeof data.ContractAccrual === "object") return data.ContractAccrual;
  if (Array.isArray(data.ContractAccruals) && data.ContractAccruals.length > 0) return data.ContractAccruals[0];
  return null;
}

function mapRows(rows = []) {
  return rows
    .map(row => {
      const contractNumber = String(pickFirst(row, ["ContractNumber", "Number", "ContractNo", "DocumentNumber"]) || "").trim();
      if (!contractNumber) return null;

      const isContinuous = row?.Continuous === true ? "Continuous" : row?.Continuous === false ? "Fixed" : null;
      const contractLength = pickFirst(row, ["ContractLength"]);
      const accrualType = String(isContinuous || contractLength || pickFirst(row, ["AccrualType", "ContractType", "Type"]) || "").trim() || null;

      return {
        contract_number: contractNumber,
        customer_number: String(pickFirst(row, ["CustomerNumber", "CustomerNo", "CustomerId"]) || "").trim() || null,
        customer_name: String(pickFirst(row, ["CustomerName", "Name"]) || "").trim() || null,
        description: String(pickFirst(row, ["Description", "Text"]) || "").trim() || null,
        start_date: normalizeDate(pickFirst(row, ["StartDate", "FromDate", "PeriodStart"])),
        end_date: normalizeDate(pickFirst(row, ["EndDate", "ToDate", "PeriodEnd"])),
        status: String(pickFirst(row, ["Status", "State"]) || "").trim() || null,
        accrual_type: accrualType,
        period: String(pickFirst(row, ["Period", "Interval", "Frequency", "Invoiceinterval", "InvoiceInterval"]) || "").trim() || null,
        total: normalizeAmount(pickFirst(row, ["Total", "Amount", "ContractAmount"])),
        currency_code: String(pickFirst(row, ["Currency", "CurrencyCode"]) || "").trim() || null,
        raw_data: row,
      };
    })
    .filter(Boolean);
}

export async function POST(request) {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("fortnox_auth")?.value;
  let token = getToken();

  if (!isLoggedIn || !token) {
    return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const maxPages = Math.max(1, Math.min(200, Number(body?.maxPages || 40)));

  let page = 1;
  let hasMore = true;
  let fetched = 0;
  const allMapped = [];
  let sourceUsed = "contractaccruals";

  async function fetchFromEndpoint(endpoint) {
    let endpointPage = 1;
    let endpointHasMore = true;
    let endpointFetched = 0;
    const endpointMapped = [];

    while (endpointHasMore && endpointPage <= maxPages) {
      const url = `https://api.fortnox.se/3/${endpoint}?limit=500&page=${endpointPage}`;
      let result = await fetchJsonWithRetry(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 4);

      if (!result?.ok) {
        if (result?.status === 401 || result?.status === 403) {
          const newToken = await refreshToken();
          if (!newToken) {
            return {
              ok: false,
              error: `Ogiltig token vid hämtning av ${endpoint}. Logga in igen i Fortnox.`,
            };
          }

          token = newToken;
          result = await fetchJsonWithRetry(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          }, 4);
        }

        if (!result?.ok) {
          return {
            ok: false,
            error: `Fortnox-svar ${result?.status || "okänt"} vid hämtning av ${endpoint}.`,
          };
        }
      }

      if (result?.data?.ErrorInformation) {
        const newToken = await refreshToken();
        if (!newToken) {
          return {
            ok: false,
            error: result.data.ErrorInformation?.Message || "Tokenfel vid synk av kundavtal",
          };
        }
        token = newToken;
        result = await fetchJsonWithRetry(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }, 4);
      }

      const rows = extractRows(result?.data);

      let rowsForMapping = rows;
      if (endpoint === "contracts" && rows.length > 0) {
        const detailedRows = [];

        for (const row of rows) {
          const contractNumber = String(
            pickFirst(row, ["ContractNumber", "Number", "ContractNo", "DocumentNumber"]) || ""
          ).trim();

          if (!contractNumber) {
            detailedRows.push(row);
            continue;
          }

          const detailUrl = `https://api.fortnox.se/3/contracts/${encodeURIComponent(contractNumber)}`;
          let detailResult = await fetchJsonWithRetry(detailUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          }, 4);

          if (!detailResult?.ok && (detailResult?.status === 401 || detailResult?.status === 403)) {
            const newToken = await refreshToken();
            if (newToken) {
              token = newToken;
              detailResult = await fetchJsonWithRetry(detailUrl, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/json",
                },
                cache: "no-store",
              }, 4);
            }
          }

          if (detailResult?.ok) {
            const detailed = extractSingleContract(detailResult?.data);
            detailedRows.push(detailed && typeof detailed === "object" ? detailed : row);
          } else {
            detailedRows.push(row);
          }

          await delay(80);
        }

        rowsForMapping = detailedRows;
      }

      endpointFetched += rows.length;
      endpointMapped.push(...mapRows(rowsForMapping));

      endpointHasMore = rows.length === 500;
      endpointPage++;
      await delay(140);
    }

    return {
      ok: true,
      fetched: endpointFetched,
      mapped: endpointMapped,
      pages: endpointPage - 1,
      hasMore: endpointHasMore,
    };
  }

  const contractsResult = await fetchFromEndpoint("contracts");
  if (!contractsResult.ok) {
    return Response.json({ ok: false, error: contractsResult.error || "Sync kundavtal misslyckades" }, { status: 401 });
  }

  fetched = contractsResult.fetched;
  page = contractsResult.pages + 1;
  hasMore = contractsResult.hasMore;
  allMapped.push(...contractsResult.mapped);
  sourceUsed = "contracts";

  if (allMapped.length === 0) {
    const accrualsResult = await fetchFromEndpoint("contractaccruals");
    if (!accrualsResult.ok) {
      return Response.json({ ok: false, error: accrualsResult.error || "Sync kundavtal misslyckades" }, { status: 401 });
    }
    fetched = accrualsResult.fetched;
    page = accrualsResult.pages + 1;
    hasMore = accrualsResult.hasMore;
    allMapped.push(...accrualsResult.mapped);
    sourceUsed = "contractaccruals";
  }

  const deduped = Array.from(
    allMapped.reduce((map, row) => {
      const key = `${String(row.customer_number || "").trim()}::${String(row.contract_number || "").trim()}`;
      map.set(key, row);
      return map;
    }, new Map()).values()
  );

  if (deduped.length > 0) {
    await saveContractAccruals(deduped);
  } else {
    return Response.json({
      ok: false,
      error: "Inga kundavtal hämtades från Fortnox. Kontrollera token/behörighet och försök igen.",
      fetched,
      pages: page - 1,
      source: sourceUsed,
    }, { status: 502 });
  }

  return Response.json({
    ok: true,
    fetched,
    saved: deduped.length,
    pages: page - 1,
    hasMore,
    source: sourceUsed,
  });
}

import { readFileSync, writeFileSync } from "fs";
import { saveTimeReports } from "@/lib/supabase";

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
      writeFileSync(".fortnox_token", data.access_token);
      writeFileSync(".fortnox_refresh", data.refresh_token);
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

function normalizeText(raw) {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

function normalizeDate(raw) {
  const value = normalizeText(raw);
  if (!value) return null;
  return value.slice(0, 10);
}

function toHours(raw) {
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

function isNoSuchRouteError(data) {
  if (!data || typeof data !== "object") return false;

  const code = Number(data.code);
  const message = normalizeText(data.message || data?.ErrorInformation?.Message).toLowerCase();

  return code === 2000764 || message.includes("no such route");
}

function isScopePermissionError(data) {
  if (!data || typeof data !== "object") return false;

  const code = Number(data.code || data?.ErrorInformation?.code);
  const message = normalizeText(data.message || data?.ErrorInformation?.message).toLowerCase();

  return code === 2000663 || message.includes("scope");
}

function describeEndpointError(result) {
  const code =
    Number(result?.data?.ErrorInformation?.code) ||
    Number(result?.data?.code) ||
    Number(result?.status) ||
    null;
  const message =
    normalizeText(result?.data?.ErrorInformation?.message) ||
    normalizeText(result?.data?.message) ||
    "Okänt fel";

  return { code, message };
}

function parseList(raw) {
  return String(raw || "")
    .split(/[\s,;]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

function normalizeEndpoint(path) {
  const value = normalizeText(path);
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/^https?:\/\/api\.fortnox\.se/i, "") || value;
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function buildFortnoxUrl(endpoint, page, fromDate) {
  const normalized = normalizeEndpoint(endpoint);

  if (/^\/api\/time\/registrations-v2$/i.test(normalized)) {
    const params = new URLSearchParams();
    if (fromDate) {
      params.set("fromDate", fromDate);
    }
    return `https://api.fortnox.se${normalized}${params.toString() ? `?${params.toString()}` : ""}`;
  }

  const base = normalized.startsWith("http") ? normalized : `https://api.fortnox.se${normalized}`;
  const params = new URLSearchParams({
    limit: "500",
    page: String(page),
  });

  if (fromDate) {
    params.set("fromdate", fromDate);
  }

  return `${base}?${params.toString()}`;
}

function supportsPagination(endpoint) {
  const normalized = normalizeEndpoint(endpoint);
  if (/^\/api\/time\/registrations-v2$/i.test(normalized)) return false;
  return true;
}

function extractApiRows(data = {}, preferredKeys = []) {
  if (Array.isArray(data)) {
    return { rows: data, collectionKey: "rootArray" };
  }

  const keys = [
    ...preferredKeys,
    "TimeReportingRecords",
    "Timereportingrecords",
    "TimeReports",
    "Timereports",
    "TimeRegistrations",
    "Timeregistrations",
    "timeReportingRecords",
    "timeReports",
    "timeRegistrations",
    "TimeReportRows",
    "AttendanceTransactions",
    "AbsenceTransactions",
  ];

  for (const key of keys) {
    if (Array.isArray(data?.[key])) {
      return { rows: data[key], collectionKey: key };
    }
  }

  return { rows: [], collectionKey: null };
}

async function fetchFortnoxWithRefresh(url, token) {
  let activeToken = token;
  let result = await fetchJsonWithRetry(
    url,
    {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
    4
  );

  const shouldRefresh =
    result?.data?.ErrorInformation ||
    (result && result.ok === false && Number(result.status) === 401);

  if (shouldRefresh) {
    const newToken = await refreshToken();
    if (!newToken) {
      return {
        ok: false,
        status: 401,
        data: result.data,
        token: activeToken,
      };
    }

    activeToken = newToken;
    result = await fetchJsonWithRetry(
      url,
      {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
      4
    );
  }

  return {
    ...result,
    token: activeToken,
  };
}

function mapTimeRow(row = {}, idx = 0) {
  const registrationCode = normalizeText(
    row.registrationCode?.code || row.RegistrationCode?.Code || row.RegistrationCode || row.RegistrationCodeCode
  );
  const registrationType = normalizeText(row.registrationCode?.type || row.RegistrationCode?.Type);

  const reportId = normalizeText(
    row.id || row.TimeReportId || row.Id || row.TimeReportNumber || row.TimeSheetRowId || row.Number || row.timeReportId
  );
  const reportDate = normalizeDate(
    row.Date || row.ReportDate || row.TimeReportDate || row.WorkDate || row.workedDate || row.TransactionDate || row.EntryDate
  );
  const employeeId = normalizeText(row.EmployeeId || row.EmployeeNumber || row.UserId || row.userId || row.StaffId);
  const employeeName = normalizeText(row.EmployeeName || row.Name || row.StaffName || row.UserName);
  const customerNumber = normalizeText(
    row.CustomerNumber || row.CustomerNo || row.CustomerId || row.customer?.number || row.customer?.id
  );
  const customerName = normalizeText(row.CustomerName || row.Customer || row.CustomerFullName || row.customer?.name);
  const projectNumber = normalizeText(row.Project || row.ProjectNumber || row.ProjectNo || row.ProjectId);
  const projectName = normalizeText(row.ProjectName || row.ProjectDescription);
  const activity = normalizeText(
    row.Activity ||
      row.ActivityName ||
      row.Task ||
      row.WorkType ||
      row.service?.description ||
      (registrationCode === "SEM" ? "Semester" : registrationType === "WORK" ? registrationCode : "Frånvaro")
  );
  const articleNumber = normalizeText(row.ArticleNumber || row.ArticleNo || row.ArticleId || row.service?.id);
  const hours = toHours(
    row.Hours ||
      row.Time ||
      row.Quantity ||
      row.Qty ||
      row.NumberOfHours ||
      row.HoursWorked ||
      row.RegisteredHours ||
      row.workedHours
  );
  const description = normalizeText(
    row.note ||
    row.invoiceText ||
    row.Description ||
    row.Text ||
    row.Comment ||
    row.Notes ||
    row.Note ||
    row.NoteText ||
    row.DescriptionText ||
    row.InternalComment ||
    row.ExternalComment ||
    row.InvoiceText ||
    row.WorkDescription ||
    row.TaskDescription ||
    row.ReferenceText
  );

  if (registrationCode.toUpperCase() === "FRX" || hours === 0) return null;

  const uniqueKey = normalizeText(
    reportId || `${reportDate}|${employeeId}|${customerNumber}|${projectNumber}|${articleNumber}|${hours}|${description}|${idx}`
  );

  if (!uniqueKey || !reportDate) return null;

  return {
    unique_key: uniqueKey,
    report_id: reportId || null,
    report_date: reportDate,
    employee_id: employeeId || null,
    employee_name: employeeName || null,
    customer_number: customerNumber || null,
    customer_name: customerName || null,
    project_number: projectNumber || null,
    project_name: projectName || null,
    activity: activity || null,
    article_number: articleNumber || null,
    hours,
    description: description || null,
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request) {
  let token = getToken();

  if (!token) {
    return Response.json({ ok: false, error: "Ingen Fortnox-token. Logga in igen." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const maxPages = Math.max(1, Math.min(100, Number(body?.maxPages || 20)));
  const fromDate = normalizeDate(body?.fromDate) || "2025-01-01";
  const configuredEndpoint = normalizeEndpoint(body?.endpoint || process.env.FORTNOX_TIME_ENDPOINT);
  const configuredEndpoints = parseList(process.env.FORTNOX_TIME_ENDPOINTS).map(normalizeEndpoint);
  const preferredCollectionKeys = parseList(body?.collectionKey || process.env.FORTNOX_TIME_COLLECTION_KEYS);

  const endpointCandidates = [
    configuredEndpoint,
    ...configuredEndpoints,
    "/api/time/registrations-v2",
  ].filter(Boolean);

  const uniqueEndpointCandidates = [...new Set(endpointCandidates)];

  let selectedEndpoint = uniqueEndpointCandidates[0] || "/3/timereportingrecords";
  let selectedCollectionKey = null;

  let page = 1;
  let hasMore = true;
  const rowsToSave = [];
  let fetched = 0;
  const endpointErrors = [];

  while (hasMore && page <= maxPages) {
    let result = null;
    const candidatesToTry = page === 1 ? uniqueEndpointCandidates : [selectedEndpoint];

    for (const endpoint of candidatesToTry) {
      const url = buildFortnoxUrl(endpoint, page, fromDate);
      const attempt = await fetchFortnoxWithRefresh(url, token);
      token = attempt.token || token;

      if (isNoSuchRouteError(attempt?.data)) {
        endpointErrors.push({ endpoint, ...describeEndpointError(attempt) });
        continue;
      }

      if (isScopePermissionError(attempt?.data)) {
        endpointErrors.push({ endpoint, ...describeEndpointError(attempt) });
        continue;
      }

      selectedEndpoint = endpoint;
      result = attempt;
      break;
    }

    if (!result) {
      return Response.json(
        {
          ok: false,
          error:
            "Kunde inte hitta en tillgänglig tids-endpoint i Fortnox för detta konto/integration.",
          endpointsTried: uniqueEndpointCandidates,
          endpointErrors,
          tip:
            "Aktivera rätt Fortnox API-scope/modul och sätt FORTNOX_TIME_ENDPOINT till en endpoint som fungerar för ert konto.",
        },
        { status: 400 }
      );
    }

    if (isNoSuchRouteError(result?.data)) {
      return Response.json(
        {
          ok: false,
          error:
            "Fortnox returnerar 'No such route' för tidsredovisning. Endpointen är inte tillgänglig för detta konto/integration ännu.",
          fortnox: result.data,
          endpoint: selectedEndpoint,
        },
        { status: 400 }
      );
    }

    if (!result?.ok) {
      return Response.json(
        {
          ok: false,
          error: result?.data?.ErrorInformation?.Message || result?.data?.message || "Kunde inte hämta tidsredovisning från Fortnox",
          fortnox: result?.data || null,
          endpoint: selectedEndpoint,
        },
        { status: result?.status || 502 }
      );
    }

    const extracted = extractApiRows(result?.data, preferredCollectionKeys);
    const apiRows = extracted.rows;
    selectedCollectionKey = selectedCollectionKey || extracted.collectionKey;
    fetched += apiRows.length;

    const mapped = apiRows
      .map((row, idx) => mapTimeRow(row, (page - 1) * 1000 + idx))
      .filter(Boolean);

    rowsToSave.push(...mapped);

    hasMore = supportsPagination(selectedEndpoint) ? apiRows.length === 500 : false;
    page++;
    await delay(120);
  }

  if (rowsToSave.length > 0) {
    await saveTimeReports(rowsToSave);
  }

  return Response.json({
    ok: true,
    fetched,
    saved: rowsToSave.length,
    pages: page - 1,
    hasMore,
    fromDate,
    endpoint: selectedEndpoint,
    collectionKey: selectedCollectionKey,
  });
}

function ensureNoTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function readEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function toPathTemplate(kind) {
  if (kind === "board") {
    return readEnv("BOLAGSVERKET_BOARD_PATH_TEMPLATE") || "/v1/companies/{orgNumber}/board";
  }
  return readEnv("BOLAGSVERKET_COMPANY_PATH_TEMPLATE") || "/v1/companies/{orgNumber}";
}

function normalizeOrganizationNumber(input) {
  return String(input || "").replace(/[^0-9]/g, "");
}

function buildUrl(kind, organizationNumber) {
  const base = ensureNoTrailingSlash(readEnv(
    "BOLAGSVERKET_API_BASE_URL",
    "BOLAGSVERKET_BASE_URL",
    "BOLAGSVERKET_URL"
  ));
  const template = toPathTemplate(kind);
  const normalized = normalizeOrganizationNumber(organizationNumber);
  const path = template.replace("{orgNumber}", encodeURIComponent(normalized));

  if (!normalized) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (!base) return "";
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function getHeaders() {
  const headers = {
    Accept: "application/json",
  };

  const apiKey = readEnv(
    "BOLAGSVERKET_API_KEY",
    "BOLAGSVERKET_SUBSCRIPTION_KEY",
    "BOLAGSVERKET_PRIMARY_KEY",
    "BOLAGSVERKET_KEY"
  );
  const authToken = readEnv("BOLAGSVERKET_BEARER_TOKEN", "BOLAGSVERKET_TOKEN");

  if (apiKey) {
    headers["Ocp-Apim-Subscription-Key"] = apiKey;
    headers["x-api-key"] = apiKey;
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
}

export function isBolagsverketConfigured() {
  const base = readEnv("BOLAGSVERKET_API_BASE_URL", "BOLAGSVERKET_BASE_URL", "BOLAGSVERKET_URL");
  const companyTemplate = toPathTemplate("company");
  const boardTemplate = toPathTemplate("board");
  const hasAbsoluteTemplate =
    companyTemplate.startsWith("http://") ||
    companyTemplate.startsWith("https://") ||
    boardTemplate.startsWith("http://") ||
    boardTemplate.startsWith("https://");

  return Boolean(base || hasAbsoluteTemplate);
}

export function normalizeBolagsverketOrganizationNumber(input) {
  return normalizeOrganizationNumber(input);
}

export async function fetchBolagsverket(kind, organizationNumber) {
  const normalizedOrg = normalizeOrganizationNumber(organizationNumber);
  const url = buildUrl(kind, normalizedOrg);
  if (!url) {
    return {
      ok: false,
      status: 0,
      error: "Bolagsverket URL kunde inte byggas. Kontrollera env + organisationsnummer.",
      data: null,
      organizationNumber: normalizedOrg,
      kind,
    };
  }

  const res = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
    cache: "no-store",
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: data?.message || data?.error || `Bolagsverket svarade med HTTP ${res.status}`,
      data,
      organizationNumber: normalizedOrg,
      kind,
    };
  }

  return { ok: true, status: res.status, data, organizationNumber: normalizedOrg, kind };
}

function firstTruthy(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function readArrayFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.board,
    payload.Board,
    payload.boardMembers,
    payload.BoardMembers,
    payload.styrelse,
    payload.Styrelse,
    payload.functionaries,
    payload.Functionaries,
    payload.members,
    payload.Members,
  ];

  for (const entry of candidates) {
    if (Array.isArray(entry)) return entry;
  }

  return [];
}

export function extractBolagsverketSnapshot(companyPayload, boardPayload) {
  const status = firstTruthy(
    companyPayload?.status,
    companyPayload?.Status,
    companyPayload?.companyStatus,
    companyPayload?.CompanyStatus,
    companyPayload?.registrationStatus,
    companyPayload?.RegistrationStatus
  );

  const registeredOffice = firstTruthy(
    companyPayload?.registeredOffice,
    companyPayload?.RegisteredOffice,
    companyPayload?.municipality,
    companyPayload?.Municipality,
    companyPayload?.seat,
    companyPayload?.Seat
  );

  const boardMembers = readArrayFromPayload(boardPayload);

  return {
    bolagsverket_status: status ? String(status) : null,
    bolagsverket_registered_office: registeredOffice ? String(registeredOffice) : null,
    bolagsverket_board_count: boardMembers.length,
    bolagsverket_company_data: companyPayload || null,
    bolagsverket_board_data: boardPayload || null,
    bolagsverket_updated_at: new Date().toISOString(),
  };
}

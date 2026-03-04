import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { getTokenFromDb, saveToken, supabaseServer } from "@/lib/supabase";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getToken(cookieStore, userId) {
  const tokenFromCookie = cookieStore.get("fortnox_access_token")?.value;
  if (tokenFromCookie) return tokenFromCookie;

  try {
    const tokenFromDb = await getTokenFromDb(userId);
    if (tokenFromDb) return tokenFromDb;
  } catch (error) {
    console.error("Kunde inte hamta Fortnox-token fran DB:", error);
  }

  try {
    return readFileSync(".fortnox_token", "utf8").trim();
  } catch {
    return null;
  }
}

async function getRefreshToken(cookieStore, userId) {
  const refreshFromCookie = cookieStore.get("fortnox_refresh_token")?.value;
  if (refreshFromCookie) return refreshFromCookie;

  try {
    const { data } = await supabaseServer
      .from("tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .single();

    if (data?.refresh_token) return data.refresh_token;
  } catch {
  }

  try {
    return readFileSync(".fortnox_refresh", "utf8").trim();
  } catch {
    return null;
  }
}

async function refreshToken(cookieStore, userId) {
  try {
    const refreshTokenValue = await getRefreshToken(cookieStore, userId);
    if (!refreshTokenValue) return null;

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
        refresh_token: refreshTokenValue,
      }),
    });

    const data = await response.json();
    if (data?.access_token) {
      await saveToken(userId, data.access_token, data.refresh_token || refreshTokenValue);
      return data.access_token;
    }
  } catch (error) {
    console.error("Refresh misslyckades vid CRM-sync:", error);
  }

  return null;
}

async function fetchJsonWithRetry(url, options = {}, retries = 4) {
  let attempt = 0;
  let lastError = null;

  while (attempt < retries) {
    attempt += 1;
    let res;
    try {
      res = await fetch(url, options);
    } catch (fetchError) {
      lastError = fetchError;
      await delay(600 * attempt);
      continue;
    }

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

  const reason = String(lastError?.message || "okant natverksfel");
  throw new Error(`Misslyckades att hamta JSON fran ${url} (${reason})`);
}

async function fetchFortnoxCustomerCard(customerNumber, token, cookieStore, userId) {
  const number = String(customerNumber || "").trim();
  if (!number) return { ok: false, customer: null, token };

  const url = `https://api.fortnox.se/3/customers/${encodeURIComponent(number)}`;
  let activeToken = token;
  let result = await fetchJsonWithRetry(url, {
    headers: {
      Authorization: `Bearer ${activeToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  }, 4);

  if (!result?.ok || result?.data?.ErrorInformation) {
    const newToken = await refreshToken(cookieStore, userId);
    if (newToken) {
      activeToken = newToken;
      result = await fetchJsonWithRetry(url, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }, 4);
    }
  }

  return {
    ok: !!result?.ok,
    customer: result?.data?.Customer || null,
    token: activeToken,
  };
}

function normalizeOrgNumber(raw) {
  return String(raw || "").replace(/\s+/g, "").trim();
}

function normalizeStatus(row = {}) {
  const fortnoxActive = normalizeFortnoxActive(row);
  if (fortnoxActive === false) return "former";
  return "active";
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;

  if (["true", "1", "yes", "ja", "active"].includes(normalized)) return true;
  if (["false", "0", "no", "nej", "inactive"].includes(normalized)) return false;
  return null;
}

function normalizeFortnoxActive(row = {}) {
  const activeValue = parseBooleanLike(row?.Active ?? row?.active);
  const inactiveValue = parseBooleanLike(row?.Inactive ?? row?.inactive);

  if (inactiveValue === true) return false;
  if (activeValue === false) return false;
  if (inactiveValue === false) return true;
  if (activeValue === true) return true;
  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function toTomt(value) {
  const text = String(value ?? "").trim();
  return text || "tomt";
}

function extractFortnoxContact(customer = {}) {
  const yourReference = firstNonEmpty(
    customer?.YourReference,
    customer?.yourReference,
    customer?.Reference,
    customer?.reference
  );
  const phone = firstNonEmpty(
    customer?.Phone1,
    customer?.Phone,
    customer?.phone,
    customer?.Mobile,
    customer?.mobile
  );
  const email = firstNonEmpty(
    customer?.Email,
    customer?.EmailAddress,
    customer?.email,
    customer?.emailAddress
  );

  return {
    name: toTomt(yourReference),
    role: "Fortnox - Er referens",
    phone: toTomt(phone),
    email: toTomt(email),
  };
}

async function upsertFortnoxContactsForClients(rows = []) {
  const normalized = rows
    .map(row => ({
      client_id: Number(row?.client_id),
      name: String(row?.name || "tomt").trim() || "tomt",
      role: "Fortnox - Er referens",
      email: String(row?.email || "tomt").trim() || "tomt",
      phone: String(row?.phone || "tomt").trim() || "tomt",
      notes: "Autoskapat fran Fortnox",
    }))
    .filter(row => Number.isFinite(row.client_id));

  if (normalized.length === 0) return;

  const clientIds = Array.from(new Set(normalized.map(row => row.client_id)));
  const { data: existingRows } = await supabaseServer
    .from("crm_contacts")
    .select("id, client_id")
    .in("client_id", clientIds)
    .eq("role", "Fortnox - Er referens");

  const existingByClient = new Map();
  for (const row of existingRows || []) {
    const clientId = Number(row?.client_id);
    const id = Number(row?.id);
    if (Number.isFinite(clientId) && Number.isFinite(id) && !existingByClient.has(clientId)) {
      existingByClient.set(clientId, id);
    }
  }

  for (const row of normalized) {
    const existingId = existingByClient.get(row.client_id);
    if (Number.isFinite(existingId)) {
      await supabaseServer
        .from("crm_contacts")
        .update({
          name: row.name,
          role: row.role,
          email: row.email,
          phone: row.phone,
          notes: row.notes,
        })
        .eq("id", existingId);
    } else {
      await supabaseServer
        .from("crm_contacts")
        .insert({
          client_id: row.client_id,
          name: row.name,
          role: row.role,
          email: row.email,
          phone: row.phone,
          notes: row.notes,
        });
    }
  }
}

async function runCrmSync(request, body = {}) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("user_id")?.value || "default_user";
    let token = await getToken(cookieStore, userId);

    if (!token) {
      return Response.json({ ok: false, error: "Ingen Fortnox-token. Klicka 'Återaktivera Fortnox'." }, { status: 401 });
    }

    const maxPages = Math.max(1, Math.min(100, Number(body?.maxPages || 10)));
    const fromPage = Math.max(1, Number(body?.fromPage || 1));
    const maxDetailLookups = Math.max(0, Math.min(1000, Number(body?.maxDetailLookups || 120)));

    let page = fromPage;
    let hasMore = true;
    const allRows = [];
    let syncWarning = null;
    let detailLookups = 0;
    let skippedDetailLookups = 0;
    let detailStatusesResolved = 0;
    let detailStatusesStillUnknown = 0;
    const lastPage = fromPage + maxPages - 1;

    while (hasMore && page <= lastPage) {
      const url = `https://api.fortnox.se/3/customers?limit=500&page=${page}`;
      let result;
      try {
        result = await fetchJsonWithRetry(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }, 4);
      } catch (fetchError) {
        syncWarning = `Delvis sync: kunde inte läsa Fortnox-sida ${page}. ${String(fetchError?.message || "")}`.trim();
        console.error("CRM-kundsync: kunde inte hämta kundsida", page, fetchError);
        break;
      }

      if (!result?.ok && (result?.status === 401 || result?.status === 403)) {
        const newToken = await refreshToken(cookieStore, userId);
        if (!newToken) {
          return Response.json({ ok: false, error: "Ogiltig token vid hämtning av Fortnox-kunder. Logga in igen." }, { status: 401 });
        }

        token = newToken;
        try {
          result = await fetchJsonWithRetry(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          }, 4);
        } catch (fetchError) {
          syncWarning = `Delvis sync: kunde inte läsa Fortnox-sida ${page} efter token-refresh. ${String(fetchError?.message || "")}`.trim();
          console.error("CRM-kundsync: kunde inte hämta kundsida efter refresh", page, fetchError);
          break;
        }
      }

      if (syncWarning) break;

      if (!result?.ok) {
        return Response.json({ ok: false, error: `Fortnox-svar ${result?.status || "okänt"} vid hämtning av kunder.` }, { status: 502 });
      }

      if (result?.data?.ErrorInformation) {
        const newToken = await refreshToken(cookieStore, userId);
        if (!newToken) {
          return Response.json({ ok: false, error: result.data.ErrorInformation?.Message || "Tokenfel vid CRM-kundsync" }, { status: 401 });
        }

        token = newToken;
        try {
          result = await fetchJsonWithRetry(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          }, 4);
        } catch (fetchError) {
          syncWarning = `Delvis sync: kunde inte läsa Fortnox-sida ${page} efter ErrorInformation-refresh. ${String(fetchError?.message || "")}`.trim();
          console.error("CRM-kundsync: kunde inte hämta kundsida efter ErrorInformation-refresh", page, fetchError);
          break;
        }
      }

      if (syncWarning) break;

      const rows = result?.data?.Customers || [];
      allRows.push(...rows);
      hasMore = rows.length === 500;
      page += 1;
      await delay(120);
    }

    const organizationNumbers = Array.from(new Set(
      allRows
        .map(row => normalizeOrgNumber(row?.OrganisationNumber || row?.OrganizationNumber || row?.OrgNo))
        .filter(Boolean)
    ));

    const customerNumbers = Array.from(new Set(
      allRows
        .map(row => String(row?.CustomerNumber || "").trim())
        .filter(Boolean)
    ));

    const existingByOrgMap = new Map();
    const existingByCustomerMap = new Map();

    if (organizationNumbers.length > 0 || customerNumbers.length > 0) {
      const existingRowsByOrg = organizationNumbers.length > 0
        ? await supabaseServer
          .from("crm_clients")
          .select("id, organization_number, customer_number, fortnox_active, responsible_consultant, client_status, notes")
          .in("organization_number", organizationNumbers)
        : { data: [] };

      const existingRowsByCustomer = customerNumbers.length > 0
        ? await supabaseServer
          .from("crm_clients")
          .select("id, organization_number, customer_number, fortnox_active, responsible_consultant, client_status, notes")
          .in("customer_number", customerNumbers)
        : { data: [] };

      const mergedExistingRows = [
        ...(existingRowsByOrg?.data || []),
        ...(existingRowsByCustomer?.data || []),
      ];

      for (const row of mergedExistingRows) {
        const org = String(row.organization_number || "").trim();
        const customer = String(row.customer_number || "").trim();
        if (org) existingByOrgMap.set(org, row);
        if (customer) existingByCustomerMap.set(customer, row);
      }
    }

    const toUpsertByOrgNumber = new Map();
    const skipped = [];
    const customerCardCache = new Map();
    const fortnoxContactByCustomerNumber = new Map();

    for (const row of allRows) {
      const orgNumberFromList = normalizeOrgNumber(row?.OrganisationNumber || row?.OrganizationNumber || row?.OrgNo);
      const customerNumber = String(row?.CustomerNumber || "").trim();
      const companyName = String(row?.Name || row?.CustomerName || "").trim();

      if (!companyName) {
        skipped.push({
          customer_number: String(row?.CustomerNumber || "").trim() || null,
          company_name: companyName || null,
          reason: "saknar företagsnamn",
        });
        continue;
      }

      const existing =
        (orgNumberFromList ? existingByOrgMap.get(orgNumberFromList) : null) ||
        (customerNumber ? existingByCustomerMap.get(customerNumber) : null) ||
        null;

      const resolvedOrgNumber =
        orgNumberFromList ||
        String(existing?.organization_number || "").trim() ||
        (customerNumber ? `FNX-${customerNumber}` : "");

      if (!resolvedOrgNumber) {
        skipped.push({
          customer_number: customerNumber || null,
          company_name: companyName || null,
          reason: "saknar organisationsnummer och kundnummer",
        });
        continue;
      }

      let fortnoxActive = normalizeFortnoxActive(row);
      const hasSavedFortnoxStatus = existing?.fortnox_active === true || existing?.fortnox_active === false;

      // Only spend detail lookups on customers that still lack saved status.
      // Otherwise we keep re-querying the same customers on every run.
      if (fortnoxActive === null && customerNumber && !hasSavedFortnoxStatus) {
        if (detailLookups >= maxDetailLookups) {
          skippedDetailLookups += 1;
        } else if (!customerCardCache.has(customerNumber)) {
          const cardResult = await fetchFortnoxCustomerCard(customerNumber, token, cookieStore, userId);
          token = cardResult.token || token;
          customerCardCache.set(customerNumber, cardResult.customer || null);
          detailLookups += 1;
          await delay(80);
        }

        const customerCard = customerCardCache.get(customerNumber);
        if (customerCard) {
          fortnoxContactByCustomerNumber.set(customerNumber, extractFortnoxContact(customerCard));
          fortnoxActive = normalizeFortnoxActive(customerCard);
          if (fortnoxActive === null) {
            detailStatusesStillUnknown += 1;
          } else {
            detailStatusesResolved += 1;
          }
        }
      }

      const computedClientStatus = fortnoxActive === false ? "former" : "active";
      const preservedPaused = existing?.client_status === "paused";
      const payload = {
        company_name: companyName,
        organization_number: resolvedOrgNumber,
        customer_number: customerNumber || existing?.customer_number || null,
        fortnox_active: fortnoxActive ?? (existing?.fortnox_active ?? null),
        client_status: preservedPaused ? "paused" : computedClientStatus,
        responsible_consultant: existing?.responsible_consultant || null,
        notes: existing?.notes || null,
      };

      // Fortnox can return duplicate customer rows in some accounts.
      // Deduplicate by organization number to avoid ON CONFLICT touching
      // the same row multiple times in one upsert statement.
      toUpsertByOrgNumber.set(resolvedOrgNumber, payload);
    }

    const toUpsert = Array.from(toUpsertByOrgNumber.values());
    const fortnoxStatusSummary = {
      fortnoxActive: toUpsert.filter(row => row.fortnox_active === true).length,
      fortnoxInactive: toUpsert.filter(row => row.fortnox_active === false).length,
      fortnoxUnknown: toUpsert.filter(row => row.fortnox_active === null || row.fortnox_active === undefined).length,
    };

    if (toUpsert.length > 0) {
      const { error } = await supabaseServer
        .from("crm_clients")
        .upsert(toUpsert, { onConflict: "organization_number" });

      if (error) {
        return Response.json({ ok: false, error: error.message || "Kunde inte spara CRM-kunder." }, { status: 500 });
      }

      try {
        const sharedCustomersMap = new Map();
        toUpsert.forEach(row => {
          const customerNumber = String(row.customer_number || row.organization_number || "").trim();
          if (!customerNumber) return;
          sharedCustomersMap.set(customerNumber, {
            customer_number: customerNumber,
            name: row.company_name,
          });
        });

        const sharedCustomers = Array.from(sharedCustomersMap.values());

        if (sharedCustomers.length > 0) {
          await supabaseServer
            .from("customers")
            .upsert(sharedCustomers, { onConflict: "customer_number" });
        }
      } catch {
      }

      try {
        const contactCustomerNumbers = Array.from(fortnoxContactByCustomerNumber.keys());
        if (contactCustomerNumbers.length > 0) {
          const { data: clientRows } = await supabaseServer
            .from("crm_clients")
            .select("id, customer_number")
            .in("customer_number", contactCustomerNumbers)
            .limit(5000);

          const contactsToSave = [];
          for (const row of clientRows || []) {
            const clientId = Number(row?.id);
            const customerNumber = String(row?.customer_number || "").trim();
            const contact = fortnoxContactByCustomerNumber.get(customerNumber);
            if (!Number.isFinite(clientId) || !contact) continue;
            contactsToSave.push({
              client_id: clientId,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
            });
          }

          await upsertFortnoxContactsForClients(contactsToSave);
        }
      } catch {
      }
    }

    return Response.json({
      ok: true,
      fetched: allRows.length,
      upserted: toUpsert.length,
      ...fortnoxStatusSummary,
      warning: syncWarning,
      fromPage,
      toPage: Math.max(fromPage, Math.min(page - 1, lastPage)),
      nextPage: hasMore ? page : null,
      detailLookups,
      skippedDetailLookups,
      detailStatusesResolved,
      detailStatusesStillUnknown,
      skipped: skipped.length,
      skippedRows: skipped.slice(0, 20),
      pagesFetched: Math.max(0, page - 1),
    });
  } catch (error) {
    console.error("CRM-kundsync misslyckades:", error);
    const message = String(error?.message || "Okant fel vid CRM-kundsync");
    const isNetworkFailure = message.toLowerCase().includes("fetch failed") || message.toLowerCase().includes("natverksfel");
    return Response.json(
      {
        ok: false,
        error: isNetworkFailure
          ? "Kunde inte na Fortnox/Supabase just nu (natverksfel). Forsok igen om 30-60 sekunder."
          : message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return runCrmSync(request, body);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const maxPages = Number(searchParams.get("maxPages") || 1);
  const fromPage = Number(searchParams.get("fromPage") || 1);
  const maxDetailLookups = Number(searchParams.get("maxDetailLookups") || 120);
  return runCrmSync(request, { maxPages, fromPage, maxDetailLookups });
}

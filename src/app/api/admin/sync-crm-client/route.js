import { cookies } from "next/headers";
import { readFileSync } from "fs";
import { getTokenFromDb, saveToken, saveCustomerCostCenterMappings, supabaseServer } from "@/lib/supabase";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "ja", "active", "aktiv", "y", "j"].includes(normalized)) return true;
  if (["false", "0", "no", "nej", "inactive", "inaktiv", "n"].includes(normalized)) return false;
  return null;
}

function normalizeFortnoxActive(row = {}) {
  const activeValue = parseBooleanLike(row?.Active ?? row?.active);
  const inactiveValue = parseBooleanLike(row?.Inactive ?? row?.inactive);
  const notActiveValue = parseBooleanLike(row?.NotActive ?? row?.notActive);

  const statusValue = String(
    row?.Status ?? row?.status ?? row?.CustomerStatus ?? row?.customerStatus ?? ""
  ).trim().toLowerCase();

  if (inactiveValue === true) return false;
  if (activeValue === false) return false;
  if (notActiveValue === true) return false;
  if (inactiveValue === false) return true;
  if (activeValue === true) return true;
  if (notActiveValue === false) return true;

  if (statusValue.includes("inaktiv") || statusValue.includes("inactive") || statusValue.includes("not active")) {
    return false;
  }
  if (statusValue.includes("aktiv") || statusValue.includes("active")) {
    return true;
  }

  return null;
}

function normalizeOrgNumber(raw) {
  return String(raw || "").replace(/\s+/g, "").trim();
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

async function lookupCostCenterName(code) {
  if (!code) return "";
  const { data } = await supabaseServer
    .from("customer_costcenter_map")
    .select("cost_center_name")
    .eq("cost_center", code)
    .not("cost_center_name", "is", null)
    .neq("cost_center_name", "")
    .limit(1)
    .single();
  return String(data?.cost_center_name || "").trim();
}

async function upsertFortnoxContact(clientId, contact) {
  const name = String(contact?.name || "").trim() || "tomt";
  const role = "Fortnox - Er referens";
  const email = String(contact?.email || "").trim() || null;
  const phone = String(contact?.phone || "").trim() || null;
  const notes = "Autoskapat från Fortnox";

  // 1. Kolla nya systemet: hämta länkade contact_ids, sedan slå upp i crm_contact_directory
  const { data: linkRows } = await supabaseServer
    .from("crm_client_contacts")
    .select("contact_id")
    .eq("client_id", clientId);

  const contactIds = (linkRows || []).map(r => Number(r.contact_id)).filter(Boolean);
  if (contactIds.length > 0) {
    const { data: dirRows } = await supabaseServer
      .from("crm_contact_directory")
      .select("id, role")
      .in("id", contactIds)
      .eq("role", role)
      .limit(1);

    const existing = dirRows?.[0];
    if (existing?.id) {
      await supabaseServer
        .from("crm_contact_directory")
        .update({ name, email, phone, notes, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return;
    }
  }

  // 2. Kolla legacy-tabellen crm_contacts
  const { data: legacyRows } = await supabaseServer
    .from("crm_contacts")
    .select("id")
    .eq("client_id", clientId)
    .eq("role", role)
    .limit(1);

  if (legacyRows?.[0]?.id) {
    await supabaseServer
      .from("crm_contacts")
      .update({ name, email: email || "tomt", phone: phone || "tomt", notes })
      .eq("id", legacyRows[0].id);
    return;
  }

  // 3. Skapa ny i nya systemet
  const { data: inserted } = await supabaseServer
    .from("crm_contact_directory")
    .insert({ name, role, email, phone, notes })
    .select("id")
    .single();

  if (inserted?.id) {
    await supabaseServer
      .from("crm_client_contacts")
      .insert({ client_id: clientId, contact_id: inserted.id });
  }
}

async function getToken(cookieStore, userId) {
  const tokenFromCookie = cookieStore.get("fortnox_access_token")?.value;
  if (tokenFromCookie) return tokenFromCookie;

  try {
    const tokenFromDb = await getTokenFromDb(userId);
    if (tokenFromDb) return tokenFromDb;
  } catch {
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
  } catch {
  }

  return null;
}

async function fetchJsonWithRetry(url, options = {}, retries = 4) {
  let attempt = 0;

  while (attempt < retries) {
    attempt += 1;
    let res;
    try {
      res = await fetch(url, options);
    } catch {
      await delay(400 * attempt);
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
        await delay(700 * attempt);
        continue;
      }
      return { ok: true, status: res.status, data: null };
    }
  }

  throw new Error(`Misslyckades att hamta JSON fran ${url}`);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = Number(body?.clientId);

    if (!Number.isFinite(clientId)) {
      return Response.json({ ok: false, error: "Ogiltigt clientId" }, { status: 400 });
    }

    const { data: client, error: clientError } = await supabaseServer
      .from("crm_clients")
      .select("id, company_name, organization_number, customer_number, client_status, responsible_consultant, notes")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return Response.json({ ok: false, error: "Kunden hittades inte i CRM" }, { status: 404 });
    }

    const customerNumber = String(client.customer_number || "").trim();
    if (!customerNumber) {
      return Response.json({ ok: false, error: "Kunden saknar customer_number i CRM" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = cookieStore.get("user_id")?.value || "default_user";
    let token = await getToken(cookieStore, userId);

    if (!token) {
      return Response.json({ ok: false, error: "Ingen Fortnox-token. Klicka 'Ateraktivera Fortnox'." }, { status: 401 });
    }

    const url = `https://api.fortnox.se/3/customers/${encodeURIComponent(customerNumber)}`;
    let result = await fetchJsonWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }, 4);

    if (!result?.ok || result?.data?.ErrorInformation) {
      const refreshed = await refreshToken(cookieStore, userId);
      if (refreshed) {
        token = refreshed;
        result = await fetchJsonWithRetry(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }, 4);
      }
    }

    if (!result?.ok) {
      return Response.json({ ok: false, error: `Fortnox-svar ${result?.status || "okant"}` }, { status: 502 });
    }

    const customer = result?.data?.Customer;
    if (!customer) {
      return Response.json({ ok: false, error: "Kunde inte lasa kundkort fran Fortnox" }, { status: 502 });
    }

    const fortnoxContact = extractFortnoxContact(customer);
    const contactOnly = body?.contactOnly === true;

    if (contactOnly) {
      await upsertFortnoxContact(clientId, fortnoxContact);
      try {
        const costCenterCode = String(customer?.CostCenter || customer?.CostCenterId || "").trim();
        if (costCenterCode) {
          await saveCustomerCostCenterMappings([{
            customer_number: customerNumber,
            customer_name: String(customer?.Name || client.company_name || "").trim(),
            cost_center: costCenterCode,
            cost_center_name: await lookupCostCenterName(costCenterCode),
            active: normalizeFortnoxActive(customer),
            updated_at: new Date().toISOString(),
          }]);
        }
      } catch {
      }
      return Response.json({ ok: true, clientId, fortnox_contact: fortnoxContact });
    }

    const companyName = String(customer?.Name || client.company_name || "").trim();
    const resolvedOrgNumber =
      normalizeOrgNumber(customer?.OrganisationNumber || customer?.OrganizationNumber || customer?.OrgNo) ||
      String(client.organization_number || "").trim() ||
      `FNX-${customerNumber}`;
    const fortnoxActive = normalizeFortnoxActive(customer);

    const resolvedFortnoxActive = fortnoxActive ?? null;
    const existingClientStatus = String(client.client_status || "").trim().toLowerCase();

    let resolvedClientStatus;
    if (existingClientStatus === "paused") {
      resolvedClientStatus = "paused";
    } else if (resolvedFortnoxActive === false) {
      resolvedClientStatus = "former";
    } else if (resolvedFortnoxActive === true) {
      resolvedClientStatus = "active";
    } else if (existingClientStatus === "former" || existingClientStatus === "active") {
      resolvedClientStatus = existingClientStatus;
    } else {
      resolvedClientStatus = "active";
    }

    const payload = {
      company_name: companyName || client.company_name,
      organization_number: resolvedOrgNumber,
      customer_number: customerNumber,
      fortnox_active: resolvedFortnoxActive,
      client_status: resolvedClientStatus,
      responsible_consultant: client.responsible_consultant || null,
      notes: client.notes || null,
    };

    const { error: updateError } = await supabaseServer
      .from("crm_clients")
      .update(payload)
      .eq("id", clientId);

    if (updateError) {
      return Response.json({ ok: false, error: updateError.message || "Kunde inte uppdatera CRM-kund" }, { status: 500 });
    }

    await supabaseServer
      .from("customers")
      .upsert([{ customer_number: customerNumber, name: payload.company_name }], { onConflict: "customer_number" });

    try {
      const costCenterCode = String(customer?.CostCenter || customer?.CostCenterId || "").trim();
      if (costCenterCode) {
        await saveCustomerCostCenterMappings([{
          customer_number: customerNumber,
          customer_name: payload.company_name,
          cost_center: costCenterCode,
          cost_center_name: await lookupCostCenterName(costCenterCode),
          active: payload.fortnox_active,
          updated_at: new Date().toISOString(),
        }]);
      }
    } catch {
      // Cost center sync should not block the primary customer sync.
    }

    return Response.json({
      ok: true,
      clientId,
      company_name: payload.company_name,
      customer_number: payload.customer_number,
      organization_number: payload.organization_number,
      fortnox_active: payload.fortnox_active,
      fortnox_contact: fortnoxContact,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Okant fel vid enkelkund-sync" }, { status: 500 });
  }
}

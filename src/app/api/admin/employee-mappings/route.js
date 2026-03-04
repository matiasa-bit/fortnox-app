import {
  getEmployeeMappings,
  saveEmployeeMappings,
  getDistinctEmployeesFromTimeReports,
} from "@/lib/supabase";
import { existsSync, readFileSync, writeFileSync } from "fs";

const LOCAL_FILE = ".employee_mappings.json";

function normalizeText(value) {
  return String(value || "").trim();
}

function readLocalMappings() {
  try {
    if (!existsSync(LOCAL_FILE)) return [];
    const raw = readFileSync(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalMappings(rows) {
  try {
    writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const [mappedRows, discoveredRows] = await Promise.all([
    getEmployeeMappings(),
    getDistinctEmployeesFromTimeReports(),
  ]);
  const localRows = readLocalMappings();

  const map = new Map();

  for (const row of discoveredRows || []) {
    const employeeId = normalizeText(row.employee_id);
    if (!employeeId) continue;

    map.set(employeeId, {
      employee_id: employeeId,
      employee_name: normalizeText(row.employee_name),
      group_name: "",
      cost_center: "",
      active: true,
    });
  }

  for (const row of mappedRows || []) {
    const employeeId = normalizeText(row.employee_id);
    if (!employeeId) continue;

    const current = map.get(employeeId) || {
      employee_id: employeeId,
      employee_name: "",
      group_name: "",
      cost_center: "",
      active: true,
    };

    map.set(employeeId, {
      employee_id: employeeId,
      employee_name: normalizeText(row.employee_name) || current.employee_name,
      group_name: normalizeText(row.group_name),
      cost_center: normalizeText(row.cost_center) || current.cost_center,
      active: row.active === false ? false : true,
    });
  }

  for (const row of localRows || []) {
    const employeeId = normalizeText(row.employee_id);
    if (!employeeId) continue;

    const current = map.get(employeeId) || {
      employee_id: employeeId,
      employee_name: "",
      group_name: "",
      cost_center: "",
      active: true,
    };

    map.set(employeeId, {
      employee_id: employeeId,
      employee_name: normalizeText(row.employee_name) || current.employee_name,
      group_name: normalizeText(row.group_name) || current.group_name,
      cost_center: normalizeText(row.cost_center) || current.cost_center,
      active: row.active === false ? false : true,
    });
  }

  const rows = Array.from(map.values()).sort((a, b) =>
    (a.employee_name || a.employee_id).localeCompare(b.employee_name || b.employee_id, "sv-SE", { numeric: true })
  );

  return Response.json({ ok: true, rows });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  if (rows.length === 0) {
    return Response.json({ ok: false, error: "Inga rader att spara." }, { status: 400 });
  }

  const normalized = rows
    .map(row => ({
      employee_id: normalizeText(row.employee_id),
      employee_name: normalizeText(row.employee_name),
      group_name: normalizeText(row.group_name),
      cost_center: normalizeText(row.cost_center),
      active: row.active === false ? false : true,
    }))
    .filter(row => row.employee_id);

  if (normalized.length === 0) {
    return Response.json({ ok: false, error: "employee_id saknas i alla rader." }, { status: 400 });
  }

  const existingLocal = readLocalMappings();
  const localMap = new Map();

  for (const row of existingLocal) {
    const employeeId = normalizeText(row.employee_id);
    if (!employeeId) continue;
    localMap.set(employeeId, {
      employee_id: employeeId,
      employee_name: normalizeText(row.employee_name),
      group_name: normalizeText(row.group_name),
      cost_center: normalizeText(row.cost_center),
      active: row.active === false ? false : true,
    });
  }

  for (const row of normalized) {
    localMap.set(row.employee_id, row);
  }

  const localSaved = writeLocalMappings(Array.from(localMap.values()));
  const dbSaved = await saveEmployeeMappings(normalized);
  const dbOk = dbSaved !== null;

  if (!localSaved && !dbOk) {
    return Response.json({ ok: false, error: "Kunde inte spara user-mappning i varken lokal fil eller databas." }, { status: 500 });
  }

  return Response.json({ ok: true, saved: normalized.length, storage: localSaved && dbOk ? "local+db" : localSaved ? "local" : "db" });
}

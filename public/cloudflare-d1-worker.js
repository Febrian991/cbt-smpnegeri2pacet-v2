// ============================================================================
// CLOUDFLARE WORKER + D1 BACKEND UNTUK APLIKASI CBT (DROP-IN PENGGANTI SUPABASE)
// Syarat di Cloudflare Dashboard:
//   Worker -> Settings -> Bindings -> Add -> D1 database
//   Variable name: DB  |  D1 database: cbt-db (yang sudah dijalankan cloudflare-d1-schema.sql)
// ============================================================================

const MEM_CACHE = new Map();
const MAX_CACHE_ENTRIES = 80;
const MAX_CACHE_BYTES = 20 * 1024 * 1024;
let totalCacheBytes = 0;

const TABLE_SCHEMAS = {
  cbt_exam_results: {
    pk: "id",
    cols: new Set([
      "id", "student_name", "student_nisn", "student_class", "exam_title", "subject",
      "final_score", "correct_count", "incorrect_count", "unattempted_count",
      "total_questions", "cheat_count", "completed_at", "finish_reason", "raw_data", "created_at"
    ]),
    jsonCols: new Set(["raw_data"]),
    privateTable: false
  },
  cbt_school_state: {
    pk: "key",
    cols: new Set(["key", "value", "updated_at"]),
    jsonCols: new Set(["value"]),
    privateTable: false
  },
  cbt_student_sessions: {
    pk: "session_key",
    cols: new Set([
      "session_key", "student_nisn", "student_name", "student_class", "subject",
      "status", "attempt_number", "answered_count", "total_questions", "remaining_seconds",
      "cheat_count", "final_score", "login_at", "started_at", "completed_at", "updated_at", "raw_data"
    ]),
    jsonCols: new Set(["raw_data"]),
    privateTable: false
  },
  cbt_questions: {
    pk: "question_key",
    cols: new Set([
      "question_key", "subject", "class_level", "created_by", "q_type", "updated_at", "raw_data"
    ]),
    jsonCols: new Set(["raw_data"]),
    privateTable: false
  },
  cbt_question_keys: {
    pk: "question_key",
    cols: new Set(["question_key", "q_type", "correct_answer", "statements", "updated_at"]),
    jsonCols: new Set(["correct_answer", "statements"]),
    privateTable: true
  },
  cbt_exam_tokens: {
    pk: "token_key",
    cols: new Set(["token_key", "token_value", "updated_at"]),
    jsonCols: new Set(),
    privateTable: true
  }
};

function buildCorsHeaders(request) {
  const reqHeaders = request.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      reqHeaders ||
      "apikey, authorization, content-type, prefer, range, x-client-info, accept-profile, content-profile, x-cbt-bypass-cache",
    "Access-Control-Expose-Headers": "content-range, preference-applied, x-cbt-cache",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(request, data, status = 200, extraHeaders = {}) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...buildCorsHeaders(request),
      ...extraHeaders,
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function formatWibTimestamp() {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "00";
    return `${get("day")}/${get("month")}/${get("year")}, ${get("hour")}.${get("minute")}.${get("second")}`;
  } catch (e) {
    return nowIso();
  }
}

function safeJsonParse(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function serializeDbVal(val, isJsonCol) {
  if (val === undefined || val === null) return null;
  if (isJsonCol) {
    return typeof val === "string" ? val : JSON.stringify(val);
  }
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "object") return JSON.stringify(val);
  return val;
}

function hydrateRow(row, schema, selectedJsonAliases = new Set()) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (schema.jsonCols.has(k) && typeof v === "string") {
      out[k] = safeJsonParse(v, v);
    } else if (selectedJsonAliases.has(k) && typeof v === "string" && (v.startsWith("{") || v.startsWith("[") || v.startsWith('"'))) {
      out[k] = safeJsonParse(v, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function getCacheTtlSeconds(method, pathname, bypass) {
  if (bypass) return 0;
  if (method === "GET" || method === "HEAD") {
    if (pathname === "/rest/v1/cbt_questions") return 120;
    if (pathname === "/rest/v1/cbt_school_state") return 45;
    if (pathname === "/rest/v1/cbt_student_sessions") return 8;
  }
  if (method === "POST") {
    if (pathname === "/rest/v1/rpc/cbt_get_public_exam_config") return 45;
    if (pathname === "/rest/v1/rpc/cbt_lookup_student_hint") return 120;
  }
  return 0;
}

function invalidateCacheForPath(pathname) {
  let prefixes = [];
  if (pathname.includes("cbt_questions") || pathname.includes("cbt_sync_question_vault")) {
    prefixes = ["/rest/v1/cbt_questions"];
  } else if (pathname.includes("cbt_school_state") || pathname.includes("cbt_sync_token_vault")) {
    prefixes = [
      "/rest/v1/cbt_school_state",
      "/rest/v1/rpc/cbt_get_public_exam_config",
      "/rest/v1/rpc/cbt_lookup_student_hint",
    ];
  } else if (pathname.includes("cbt_student_sessions") || pathname.includes("cbt_grade_and_submit_exam")) {
    prefixes = ["/rest/v1/cbt_student_sessions"];
  } else if (pathname.includes("cbt_exam_results")) {
    prefixes = ["/rest/v1/cbt_exam_results", "/rest/v1/cbt_student_sessions"];
  }
  if (prefixes.length === 0) return;

  for (const [key, entry] of MEM_CACHE.entries()) {
    if (prefixes.some((p) => key.includes("|" + p))) {
      totalCacheBytes = Math.max(0, totalCacheBytes - entry.size);
      MEM_CACHE.delete(key);
    }
  }
}

function setMemCache(key, entry) {
  if (entry.size > 2 * 1024 * 1024) return;
  const old = MEM_CACHE.get(key);
  if (old) {
    totalCacheBytes = Math.max(0, totalCacheBytes - old.size);
    MEM_CACHE.delete(key);
  }
  while ((MEM_CACHE.size >= MAX_CACHE_ENTRIES || totalCacheBytes + entry.size > MAX_CACHE_BYTES) && MEM_CACHE.size > 0) {
    const oldestKey = MEM_CACHE.keys().next().value;
    const oldest = MEM_CACHE.get(oldestKey);
    MEM_CACHE.delete(oldestKey);
    if (oldest) totalCacheBytes = Math.max(0, totalCacheBytes - oldest.size);
  }
  MEM_CACHE.set(key, entry);
  totalCacheBytes += entry.size;
}

// ============================================================================
// HELPER PARSER QUERY POSTGREST -> SQLITE
// ============================================================================

function parseInList(raw) {
  let inner = String(raw || "").trim();
  if (inner.startsWith("(") && inner.endsWith(")")) {
    inner = inner.slice(1, -1);
  }
  if (!inner) return [];
  const items = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"') {
      if (inQuote && inner[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      items.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  items.push(cur);
  return items.map((s) => s.trim()).filter((s) => s !== "");
}

function parseWhereClauses(searchParams, schema) {
  const clauses = [];
  const binds = [];
  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);

  for (const [col, rawExpr] of searchParams.entries()) {
    if (reserved.has(col)) continue;
    if (!schema.cols.has(col)) continue;

    const expr = String(rawExpr || "");
    if (expr.startsWith("eq.")) {
      clauses.push(`"${col}" = ?`);
      binds.push(expr.slice(3));
    } else if (expr.startsWith("neq.")) {
      clauses.push(`("${col}" IS NULL OR "${col}" != ?)`);
      binds.push(expr.slice(4));
    } else if (expr.startsWith("gt.")) {
      clauses.push(`"${col}" > ?`);
      binds.push(expr.slice(3));
    } else if (expr.startsWith("gte.")) {
      clauses.push(`"${col}" >= ?`);
      binds.push(expr.slice(4));
    } else if (expr.startsWith("lt.")) {
      clauses.push(`"${col}" < ?`);
      binds.push(expr.slice(3));
    } else if (expr.startsWith("lte.")) {
      clauses.push(`"${col}" <= ?`);
      binds.push(expr.slice(4));
    } else if (expr.startsWith("in.")) {
      const list = parseInList(expr.slice(3));
      if (list.length === 0) {
        clauses.push("1 = 0");
      } else {
        clauses.push(`"${col}" IN (${list.map(() => "?").join(", ")})`);
        binds.push(...list);
      }
    } else if (expr === "is.null") {
      clauses.push(`"${col}" IS NULL`);
    } else if (expr === "not.is.null") {
      clauses.push(`"${col}" IS NOT NULL`);
    }
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    binds,
  };
}

function parseSelectClause(selectParam, schema) {
  const raw = String(selectParam || "*").trim();
  if (!raw || raw === "*") {
    return { sql: "*", jsonAliases: new Set(), countOnly: false };
  }
  if (raw === "count") {
    return { sql: "COUNT(*) AS count", jsonAliases: new Set(), countOnly: true };
  }
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const colsSql = [];
  const jsonAliases = new Set();

  for (const part of parts) {
    if (part === "*") {
      colsSql.push("*");
      continue;
    }
    // Format alias:raw_data->>jsonProp
    const jsonAliasMatch = part.match(/^([a-zA-Z0-9_]+):([a-zA-Z0-9_]+)->>([a-zA-Z0-9_]+)$/);
    if (jsonAliasMatch) {
      const [, alias, baseCol, jsonProp] = jsonAliasMatch;
      if (schema.cols.has(baseCol)) {
        colsSql.push(`json_extract("${baseCol}", '$.${jsonProp}') AS "${alias}"`);
        continue;
      }
    }
    const colAliasMatch = part.match(/^([a-zA-Z0-9_]+):([a-zA-Z0-9_]+)$/);
    if (colAliasMatch) {
      const [, alias, baseCol] = colAliasMatch;
      if (schema.cols.has(baseCol)) {
        colsSql.push(`"${baseCol}" AS "${alias}"`);
        continue;
      }
    }
    if (schema.cols.has(part)) {
      colsSql.push(`"${part}"`);
    }
  }

  return {
    sql: colsSql.length > 0 ? colsSql.join(", ") : "*",
    jsonAliases,
    countOnly: false,
  };
}

function parseOrderClause(orderParam, schema) {
  if (!orderParam) return "";
  const parts = String(orderParam).split(",").map((s) => s.trim()).filter(Boolean);
  const orderItems = [];
  for (const p of parts) {
    const segs = p.split(".");
    const col = segs[0];
    if (!schema.cols.has(col)) continue;
    const dir = (segs[1] || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    orderItems.push(`"${col}" ${dir}`);
  }
  return orderItems.length > 0 ? `ORDER BY ${orderItems.join(", ")}` : "";
}

function parsePagination(request, searchParams) {
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const rangeHdr = request.headers.get("range") || "";
  if (rangeHdr) {
    const m = rangeHdr.match(/^(\d+)-(\d+)$/);
    if (m) {
      const from = parseInt(m[1], 10);
      const to = parseInt(m[2], 10);
      if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
        return { limit: to - from + 1, offset: from, hasRange: true };
      }
    }
  }
  const limit = limitParam !== null ? parseInt(limitParam, 10) : null;
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : 0;
  return {
    limit: Number.isFinite(limit) && limit >= 0 ? limit : null,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
    hasRange: false,
  };
}

async function tableExists(db, tableName) {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(tableName)
    .first();
  return Boolean(row);
}

// ============================================================================
// HELPER LOGIKA CBT & KEAMANAN SERVER (SETARA DENGAN supabase-schema.sql)
// ============================================================================

async function getSchoolStateVal(db, key) {
  const row = await db.prepare("SELECT value FROM cbt_school_state WHERE key = ? LIMIT 1").bind(key).first();
  if (row && row.value !== undefined) {
    return safeJsonParse(row.value, null);
  }
  const fb = await db
    .prepare("SELECT raw_data FROM cbt_exam_results WHERE student_nisn = '__CBT_STATE__' AND student_name = ? ORDER BY id DESC LIMIT 1")
    .bind(key)
    .first();
  if (fb && fb.raw_data !== undefined) {
    return safeJsonParse(fb.raw_data, null);
  }
  return null;
}

async function setSchoolStateVal(db, key, valObj) {
  const jsonStr = JSON.stringify(valObj);
  await db
    .prepare(
      `INSERT INTO cbt_school_state (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, jsonStr, nowIso())
    .run();
}

function stripQuestionKeysObj(q) {
  if (!q || typeof q !== "object") return q;
  const copy = { ...q };
  delete copy.correctAnswer;
  if (Array.isArray(copy.statements)) {
    copy.statements = copy.statements.map((s) => ({ id: s?.id, text: s?.text }));
  }
  return copy;
}

function stripScheduleTokensArr(schedules) {
  if (!Array.isArray(schedules)) return [];
  return schedules.map((s) => {
    if (!s || typeof s !== "object") return s;
    const copy = { ...s };
    delete copy.token;
    return copy;
  });
}

function expandClassTokens(raw) {
  let clean = String(raw || "").trim().toUpperCase();
  if (!clean) return [];
  clean = clean.replace(/\b(KELAS|TINGKAT|KLS)\b/gi, "");
  clean = clean.replace(/\s+(DAN|&)\s+/gi, ",");
  clean = clean.replace(/\s*(S\/D|SD|TO)\s*/gi, "-");
  const parts = clean.split(/[,;/]+/);
  const res = [];

  const replaceRomansWord = (txt) =>
    txt
      .replace(/\bXII\b/gi, "12")
      .replace(/\bXI\b/gi, "11")
      .replace(/\bVIII\b/gi, "8")
      .replace(/\bVII\b/gi, "7")
      .replace(/\bVI\b/gi, "6")
      .replace(/\bIX\b/gi, "9")
      .replace(/\bIV\b/gi, "4")
      .replace(/\bX\b/gi, "10");

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    part = part.replace(/^(KELAS|TINGKAT|KLS)\s*/i, "");
    part = replaceRomansWord(part);

    const compact = part.replace(/\s+/g, "");
    if (/^\d+(-\d+)+$/.test(compact)) {
      const segs = compact.split("-");
      if (segs.length === 2) {
        const a = parseInt(segs[0], 10);
        const b = parseInt(segs[1], 10);
        if (a <= b && b - a <= 6) {
          for (let i = a; i <= b; i++) res.push(String(i));
          continue;
        }
      }
      segs.forEach((s) => res.push(s));
      continue;
    }

    let norm = part.replace(/[\s\-_]+/g, "");
    norm = norm.replace(/^(KELAS|TINGKAT|KLS)/i, "");
    norm = norm
      .replace(/^XII/i, "12")
      .replace(/^XI/i, "11")
      .replace(/^VIII/i, "8")
      .replace(/^VII/i, "7")
      .replace(/^VI/i, "6")
      .replace(/^IX/i, "9")
      .replace(/^IV/i, "4")
      .replace(/^X/i, "10");
    if (norm) res.push(norm);
  }
  return res;
}

function matchesClassLevel(schedClass, studentClass) {
  const qc = String(schedClass || "").trim().toUpperCase();
  const tc = String(studentClass || "").trim().toUpperCase();
  if (!qc || /(SEMUA|ALL)/.test(qc)) return true;
  if (!tc || /(SEMUA|ALL)/.test(tc)) return true;

  const qParts = expandClassTokens(qc);
  const tParts = expandClassTokens(tc);
  if (qParts.length === 0 || tParts.length === 0) return true;

  for (const q of qParts) {
    if (q === "SEMUA" || q === "SEMUAKELAS" || q === "ALL") return true;
    const qGrade = (q.match(/^(\d+)/) || [])[1] || null;
    for (const t of tParts) {
      if (q === t) return true;
      const tGrade = (t.match(/^(\d+)/) || [])[1] || null;
      if (qGrade && tGrade && qGrade === tGrade) {
        if (q === qGrade || t === tGrade) return true;
      }
    }
  }
  return false;
}

async function verifyTeacherPinInternal(db, pIdentifier, pPin) {
  const id = String(pIdentifier || "").trim().toLowerCase();
  const pin = String(pPin || "").trim();
  if (!id || !pin) {
    return { valid: false, message: "Username/NIP dan PIN wajib diisi." };
  }

  const teachers = await getSchoolStateVal(db, "cbt_teachers_list");
  if (!Array.isArray(teachers) || teachers.length === 0) {
    return { valid: false, not_seeded: true };
  }

  const cfg = await getSchoolStateVal(db, "cbt_config");
  const cfgPin = cfg && cfg.adminPin ? String(cfg.adminPin).trim() : "";

  const norm = (v) => String(v || "").trim().toLowerCase();
  const normPin = (v) => String(v || "").trim();

  let found =
    teachers.find((t) => norm(t?.nip) === id && normPin(t?.pin) === pin) ||
    teachers.find((t) => norm(t?.id) === id && normPin(t?.pin) === pin) ||
    teachers.find((t) => norm(t?.name) === id && normPin(t?.pin) === pin) ||
    (id.length >= 3 ? teachers.find((t) => norm(t?.name).includes(id) && normPin(t?.pin) === pin) : null);

  let isAdmin = false;
  if (!found) {
    const hasExactIdMatch = teachers.some(
      (t) => norm(t?.nip) === id || norm(t?.id) === id || norm(t?.name) === id
    );
    if (
      ["admin", "proktor", "superadmin", "198501012010011001"].includes(id) ||
      ((id.includes("admin") || id.includes("proktor")) && !hasExactIdMatch)
    ) {
      found = teachers.find((t) => t?.role === "admin" || t?.id === "admin") || null;
      isAdmin = true;
    }
  }

  if (!found) {
    found =
      teachers.find(
        (t) =>
          norm(t?.nip) === id ||
          norm(t?.id) === id ||
          norm(t?.name) === id ||
          (id.length >= 3 && norm(t?.name).includes(id))
      ) || null;
  }

  if (!found) {
    return { valid: false, message: "Username / NIP tidak terdaftar." };
  }

  if (found.role === "admin" || found.id === "admin") {
    isAdmin = true;
  }

  if (pin === normPin(found.pin) || (isAdmin && cfgPin !== "" && pin === cfgPin)) {
    return { valid: true, teacher: found };
  }

  return { valid: false, message: "PIN / Kata Sandi salah!" };
}

// ============================================================================
// HANDLER 9 RPC CBT
// ============================================================================

async function handleRpc(db, fnName, body) {
  switch (fnName) {
    case "cbt_matches_class_level": {
      return matchesClassLevel(body?.p_sched_class, body?.p_student_class);
    }

    case "cbt_verify_teacher_login": {
      const res = await verifyTeacherPinInternal(db, body?.p_identifier, body?.p_pin);
      if (res.valid) {
        return { success: true, teacher: res.teacher };
      }
      return {
        success: false,
        not_seeded: Boolean(res.not_seeded),
        message: res.message || "Username / NIP atau PIN salah.",
      };
    }

    case "cbt_verify_student_login": {
      const nisn = String(body?.p_nisn || "").trim();
      const pass = String(body?.p_password || "").trim();
      if (!nisn || !pass) {
        return { success: false, message: "Harap lengkapi NISN dan kata sandi!" };
      }
      const students = await getSchoolStateVal(db, "cbt_students_list");
      if (!Array.isArray(students) || students.length === 0) {
        return { success: false, not_seeded: true };
      }
      const stu = students.find((s) => String(s?.nisn || "").trim() === nisn);
      if (!stu) {
        return { success: false, message: "NISN tidak terdaftar di pangkalan data SMP NEGERI 2 PACET!" };
      }
      const expectedPass = String(stu.password || "").trim() || "123";
      if (expectedPass !== pass) {
        return { success: false, message: "Password akun siswa salah! Silakan periksa kartu peserta ujian Anda." };
      }
      return {
        success: true,
        student: {
          nisn: String(stu.nisn).trim(),
          name: stu.name || "-",
          class: stu.class || "Umum",
          examRoom: String(stu.examRoom || stu.room || stu.ruang || "").trim(),
        },
      };
    }

    case "cbt_lookup_student_hint": {
      const nisn = String(body?.p_nisn || "").trim();
      if (nisn.length < 4) return { found: false };
      const students = await getSchoolStateVal(db, "cbt_students_list");
      if (!Array.isArray(students)) return { found: false };
      const stu = students.find((s) => String(s?.nisn || "").trim() === nisn);
      if (!stu) return { found: false };
      return {
        found: true,
        name: stu.name || "-",
        class: stu.class || "Umum",
        examRoom: String(stu.examRoom || stu.room || stu.ruang || "").trim(),
      };
    }

    case "cbt_get_public_exam_config": {
      const cfg = await getSchoolStateVal(db, "cbt_config");
      const schoolCfg = await getSchoolStateVal(db, "cbt_school_config");
      const scheds = await getSchoolStateVal(db, "cbt_exam_schedules");
      const migrated = await getSchoolStateVal(db, "cbt_questions_migrated_v1");

      const state = {};
      if (cfg && typeof cfg === "object") {
        const cleanCfg = { ...cfg };
        delete cleanCfg.examToken;
        delete cleanCfg.adminPin;
        state.cbt_config = cleanCfg;
      }
      if (schoolCfg && typeof schoolCfg === "object") {
        const cleanSchool = { ...schoolCfg };
        delete cleanSchool.kopSuratImage;
        delete cleanSchool.logoLeft;
        delete cleanSchool.logoRight;
        state.cbt_school_config = cleanSchool;
      }
      if (Array.isArray(scheds)) {
        state.cbt_exam_schedules = stripScheduleTokensArr(scheds);
      }
      if (migrated !== null && migrated !== undefined) {
        state.cbt_questions_migrated_v1 = migrated;
      }
      return { success: true, state };
    }

    case "cbt_sync_token_vault": {
      const auth = await verifyTeacherPinInternal(db, body?.p_identifier, body?.p_pin);
      if (!auth.valid) {
        return {
          success: false,
          unauthorized: true,
          message: auth.message || "Autentikasi staf gagal.",
        };
      }
      const role = String(auth.teacher?.role || "guru").toLowerCase();
      const mode = String(body?.p_mode || "read").toLowerCase();

      if (mode === "write") {
        if (role !== "admin") {
          return { success: false, unauthorized: true, message: "Hanya Admin yang dapat mengubah token ujian." };
        }
        const now = nowIso();
        const cfgToken = body?.p_config_token;
        if (cfgToken !== null && cfgToken !== undefined && String(cfgToken).trim() !== "") {
          await db
            .prepare(
              `INSERT INTO cbt_exam_tokens (token_key, token_value, updated_at)
               VALUES ('config', ?, ?)
               ON CONFLICT(token_key) DO UPDATE SET token_value = excluded.token_value, updated_at = excluded.updated_at`
            )
            .bind(String(cfgToken).trim().toUpperCase(), now)
            .run();
        }

        const schedTokens = body?.p_schedule_tokens;
        if (Array.isArray(schedTokens)) {
          const stmts = [db.prepare("DELETE FROM cbt_exam_tokens WHERE token_key LIKE 'schedule:%'")];
          for (const item of schedTokens) {
            const sid = String(item?.id || "").trim();
            const tok = String(item?.token || "").trim().toUpperCase();
            if (sid && tok) {
              stmts.push(
                db
                  .prepare(
                    `INSERT INTO cbt_exam_tokens (token_key, token_value, updated_at)
                     VALUES (?, ?, ?)
                     ON CONFLICT(token_key) DO UPDATE SET token_value = excluded.token_value, updated_at = excluded.updated_at`
                  )
                  .bind(`schedule:${sid}`, tok, now)
              );
            }
          }
          await db.batch(stmts);
        }

        const cfg = await getSchoolStateVal(db, "cbt_config");
        if (cfg && typeof cfg === "object" && ("examToken" in cfg || "adminPin" in cfg)) {
          const copy = { ...cfg };
          delete copy.examToken;
          delete copy.adminPin;
          await setSchoolStateVal(db, "cbt_config", copy);
        }
        const scheds = await getSchoolStateVal(db, "cbt_exam_schedules");
        if (Array.isArray(scheds) && scheds.some((s) => s && "token" in s)) {
          await setSchoolStateVal(db, "cbt_exam_schedules", stripScheduleTokensArr(scheds));
        }

        return { success: true };
      }

      // Mode Read
      const cfgRow = await db.prepare("SELECT token_value FROM cbt_exam_tokens WHERE token_key = 'config' LIMIT 1").first();
      let cfgToken = cfgRow?.token_value ? String(cfgRow.token_value) : "";
      if (!cfgToken) {
        const cfg = await getSchoolStateVal(db, "cbt_config");
        cfgToken = String(cfg?.examToken || "").trim().toUpperCase();
      }

      const tokRows = await db.prepare("SELECT token_key, token_value FROM cbt_exam_tokens WHERE token_key LIKE 'schedule:%'").all();
      const scheduleTokens = {};
      for (const r of tokRows?.results || []) {
        const sid = String(r.token_key || "").slice(9);
        if (sid) scheduleTokens[sid] = r.token_value;
      }

      const scheds = await getSchoolStateVal(db, "cbt_exam_schedules");
      if (Array.isArray(scheds)) {
        for (const s of scheds) {
          const sid = String(s?.id || "").trim();
          const tok = String(s?.token || "").trim().toUpperCase();
          if (sid && tok && !scheduleTokens[sid]) {
            scheduleTokens[sid] = tok;
          }
        }
      }

      return {
        success: true,
        configToken: cfgToken || "CBT80M",
        scheduleTokens,
      };
    }

    case "cbt_verify_exam_token": {
      const inputToken = String(body?.p_token || "").trim().toUpperCase();
      const schedId = String(body?.p_schedule_id || "").trim();
      const stuClass = String(body?.p_student_class || "").trim();

      if (!inputToken) {
        return { success: false, valid: false, message: "Harap masukkan Token Ujian!" };
      }

      const cfg = await getSchoolStateVal(db, "cbt_config");
      const scheds = await getSchoolStateVal(db, "cbt_exam_schedules");

      const cfgRow = await db.prepare("SELECT token_value FROM cbt_exam_tokens WHERE token_key = 'config' LIMIT 1").first();
      let cfgToken = String(cfgRow?.token_value || "").trim().toUpperCase();
      if (!cfgToken) cfgToken = String(cfg?.examToken || "").trim().toUpperCase();
      if (!cfgToken) cfgToken = "CBT80M";

      const tokRows = await db.prepare("SELECT token_key, token_value FROM cbt_exam_tokens WHERE token_key LIKE 'schedule:%'").all();
      const tokenMap = {};
      for (const r of tokRows?.results || []) {
        tokenMap[String(r.token_key || "").slice(9)] = String(r.token_value || "").trim().toUpperCase();
      }

      let hasActive = false;
      let selected = null;
      let matchedExactId = null;
      let matchedClass = null;
      let matchedAny = null;

      if (Array.isArray(scheds)) {
        for (const sch of scheds) {
          if (!sch || typeof sch !== "object") continue;
          const isActive = Boolean(sch.isActive ?? sch.active ?? false);
          if (!isActive) continue;
          hasActive = true;
          const sId = String(sch.id || "").trim();
          const schClass = String(sch.classLevel || sch.targetClass || "Semua Kelas").trim();

          if (
            !selected ||
            (schedId && sId === schedId) ||
            (stuClass && matchesClassLevel(schClass, stuClass) && !schedId)
          ) {
            selected = sch;
          }

          const schTok = tokenMap[sId] || String(sch.token || "").trim().toUpperCase() || cfgToken;
          if (schTok === inputToken) {
            if (!matchedAny) matchedAny = sch;
            if (schedId && sId === schedId) {
              if (!stuClass || matchesClassLevel(schClass, stuClass) || !matchedExactId) {
                matchedExactId = sch;
              }
            }
            if (stuClass && matchesClassLevel(schClass, stuClass)) {
              if (!matchedClass || (schedId && sId === schedId)) {
                matchedClass = sch;
              }
            }
          }
        }
      }

      if (hasActive) {
        const matched = matchedClass || matchedExactId || matchedAny;
        if (!matched) {
          return {
            success: false,
            valid: false,
            message: `Token ujian "${inputToken}" tidak cocok dengan jadwal ujian (${selected?.subject || "-"}). Periksa kembali atau tanyakan kepada Pengawas Ruang!`,
          };
        }
        const mClass = String(matched.classLevel || matched.targetClass || "").trim();
        if (stuClass && mClass && !matchesClassLevel(mClass, stuClass)) {
          return {
            success: false,
            valid: false,
            message: `⛔ Ujian Ditolak: Jadwal "${matched.subject || "-"}" (${mClass}) bukan untuk Kelas ${stuClass}. Pilih mata pelajaran lain yang sesuai kelas Anda.`,
          };
        }
        const cleanSched = { ...matched };
        delete cleanSched.token;
        return { success: true, valid: true, mode: "schedule", schedule: cleanSched };
      }

      if (inputToken !== cfgToken) {
        return {
          success: false,
          valid: false,
          message: "Token ujian salah! Periksa kembali atau tanyakan kepada Pengawas Ruang / Proktor.",
        };
      }
      if (stuClass && cfg?.targetClass && !matchesClassLevel(cfg.targetClass, stuClass)) {
        return {
          success: false,
          valid: false,
          message: `⛔ Ujian Ditolak: Ujian "${cfg?.subject || "-"}" saat ini dikhususkan untuk ${cfg?.targetClass || "-"}.`,
        };
      }
      return { success: true, valid: true, mode: "manual" };
    }

    case "cbt_sync_question_vault": {
      const auth = await verifyTeacherPinInternal(db, body?.p_identifier, body?.p_pin);
      if (!auth.valid) {
        return {
          success: false,
          unauthorized: !auth.not_seeded,
          not_seeded: Boolean(auth.not_seeded),
          message: auth.message || "Akses brankas soal ditolak.",
        };
      }
      if (String(auth.teacher?.role || "guru").toLowerCase() === "pengawas") {
        return {
          success: false,
          unauthorized: true,
          message: "Akses brankas soal & kunci jawaban tertutup untuk akun Pengawas Ruang.",
        };
      }

      if (body?.p_replace_all) {
        await db.batch([
          db.prepare("DELETE FROM cbt_question_keys"),
          db.prepare("DELETE FROM cbt_questions"),
        ]);
      }

      const delKey = String(body?.p_delete_key || "").trim();
      if (delKey) {
        await db.batch([
          db.prepare("DELETE FROM cbt_question_keys WHERE question_key = ?").bind(delKey),
          db.prepare("DELETE FROM cbt_questions WHERE question_key = ?").bind(delKey),
        ]);
        return { success: true, deleted: delKey };
      }

      const pQuestions = body?.p_questions;
      if (Array.isArray(pQuestions)) {
        const now = nowIso();
        const stmts = [];
        let count = 0;

        for (const item of pQuestions) {
          if (!item || typeof item !== "object") continue;
          const qraw = item.raw_data && typeof item.raw_data === "object" ? item.raw_data : item;
          const qkey = String(item.question_key ?? qraw.id ?? "").trim();
          if (!qkey) continue;

          const qType = String(qraw.type || "single");
          const stmtsKeys = Array.isArray(qraw.statements)
            ? qraw.statements.map((s) => ({ id: s?.id, correct: s?.correct }))
            : null;
          const cleanRaw = stripQuestionKeysObj(qraw);

          stmts.push(
            db
              .prepare(
                `INSERT INTO cbt_question_keys (question_key, q_type, correct_answer, statements, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(question_key) DO UPDATE SET
                   q_type = excluded.q_type,
                   correct_answer = excluded.correct_answer,
                   statements = excluded.statements,
                   updated_at = excluded.updated_at`
              )
              .bind(
                qkey,
                qType,
                qraw.correctAnswer !== undefined ? JSON.stringify(qraw.correctAnswer) : null,
                stmtsKeys !== null ? JSON.stringify(stmtsKeys) : null,
                now
              )
          );

          stmts.push(
            db
              .prepare(
                `INSERT INTO cbt_questions (question_key, subject, class_level, created_by, q_type, updated_at, raw_data)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(question_key) DO UPDATE SET
                   subject = excluded.subject,
                   class_level = excluded.class_level,
                   created_by = excluded.created_by,
                   q_type = excluded.q_type,
                   updated_at = excluded.updated_at,
                   raw_data = excluded.raw_data`
              )
              .bind(
                qkey,
                String(qraw.subject || "").trim() || "Umum",
                String(qraw.classLevel || "").trim() || "Semua Kelas",
                String(qraw.createdBy || ""),
                qType,
                now,
                JSON.stringify(cleanRaw)
              )
          );
          count++;
        }

        // Jalankan per batch maksimal 80 statement per batch agar aman terhadap batas D1
        for (let i = 0; i < stmts.length; i += 80) {
          await db.batch(stmts.slice(i, i + 80));
        }
        return { success: true, count };
      }

      // Mode Baca: gabungkan cbt_questions + cbt_question_keys
      const joined = await db
        .prepare(
          `SELECT q.question_key, q.q_type, q.raw_data, k.correct_answer, k.statements, (k.question_key IS NOT NULL) AS has_key
           FROM cbt_questions q
           LEFT JOIN cbt_question_keys k ON k.question_key = q.question_key
           ORDER BY q.question_key`
        )
        .all();

      const rows = (joined?.results || []).map((r) => {
        const qraw = safeJsonParse(r.raw_data, {});
        if (!r.has_key) return qraw;
        const t = String(qraw.type || r.q_type || "single");
        if (t === "true_false") {
          const kStmts = safeJsonParse(r.statements, []);
          const keyMap = new Map(
            (Array.isArray(kStmts) ? kStmts : []).map((ks) => [String(ks?.id), ks?.correct])
          );
          const mergedStmts = (Array.isArray(qraw.statements) ? qraw.statements : []).map((qs) => ({
            id: qs?.id,
            text: qs?.text,
            correct: keyMap.has(String(qs?.id)) ? keyMap.get(String(qs?.id)) : qs?.correct,
          }));
          return { ...qraw, statements: mergedStmts };
        }
        const cor = safeJsonParse(r.correct_answer, undefined);
        return cor !== undefined && cor !== null ? { ...qraw, correctAnswer: cor } : qraw;
      });

      return { success: true, rows };
    }

    case "cbt_grade_and_submit_exam": {
      const payload = body?.p_payload || {};
      const student = payload.student && typeof payload.student === "object" ? payload.student : {};
      const nisn = String(student.nisn || "").trim();
      if (!nisn) {
        return { success: false, message: "Identitas NISN peserta tidak valid." };
      }

      const examTitle = String(payload.examTitle || "Ujian CBT");
      const subject = String(payload.subject || "Umum");
      const attempt = Math.max(1, parseInt(payload.attemptNumber, 10) || 1);
      const completedAt = String(payload.completedAt || "").trim() || formatWibTimestamp();
      const durationUsed = Math.max(0, parseInt(payload.durationUsedSeconds, 10) || 0);
      const cheatCount = Math.max(0, parseInt(payload.cheatCount, 10) || 0);
      const cheatLogs = Array.isArray(payload.cheatLogs) ? payload.cheatLogs : [];
      const finishReason = String(payload.finishReason || "Selesai mandiri oleh peserta");
      const qIds = Array.isArray(payload.questionIds) ? payload.questionIds : [];
      const answers = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
      const resId =
        String(payload.id || "").trim() ||
        `RES_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // Idempotensi: cegah duplikasi jika retry mengirim ID yang sama
      const existing = await db
        .prepare(
          `SELECT final_score, total_questions, cheat_count, completed_at, finish_reason
           FROM cbt_exam_results
           WHERE student_nisn = ? AND json_extract(raw_data, '$.id') = ?
           LIMIT 1`
        )
        .bind(nisn, resId)
        .first();

      if (existing) {
        const fs = Number(existing.final_score || 0);
        return {
          success: true,
          duplicate: true,
          receipt: {
            id: resId,
            student,
            examTitle,
            subject,
            attemptNumber: attempt,
            completedAt: existing.completed_at || completedAt,
            totalQuestions: Number(existing.total_questions || qIds.length),
            cheatCount: Number(existing.cheat_count || cheatCount),
            finishReason: existing.finish_reason || finishReason,
            isRemedial: fs < 75,
            remedialStatus: fs < 75 ? "Remedial" : "Tidak Remedial",
          },
        };
      }

      const cleanQIds = qIds.map((id) => String(id).trim()).filter(Boolean);
      const qMap = new Map();
      const kMap = new Map();

      if (cleanQIds.length > 0) {
        for (let i = 0; i < cleanQIds.length; i += 80) {
          const chunk = cleanQIds.slice(i, i + 80);
          const ph = chunk.map(() => "?").join(", ");
          const [qRes, kRes] = await Promise.all([
            db.prepare(`SELECT question_key, raw_data FROM cbt_questions WHERE question_key IN (${ph})`).bind(...chunk).all(),
            db.prepare(`SELECT question_key, correct_answer, statements FROM cbt_question_keys WHERE question_key IN (${ph})`).bind(...chunk).all(),
          ]);
          for (const r of qRes?.results || []) {
            qMap.set(String(r.question_key), safeJsonParse(r.raw_data, null));
          }
          for (const r of kRes?.results || []) {
            kMap.set(String(r.question_key), {
              correct_answer: safeJsonParse(r.correct_answer, null),
              statements: safeJsonParse(r.statements, null),
            });
          }
        }
      }

      let idx = 0;
      let matchedCnt = 0;
      let totalEarned = 0;
      let maxPoints = 0;
      let correctCnt = 0;
      let incorrectCnt = 0;
      let unattemptedCnt = 0;
      const details = [];

      for (const qid of cleanQIds) {
        idx++;
        const qraw = qMap.get(qid);
        if (!qraw) continue;
        matchedCnt++;

        const kraw = kMap.get(qid) || null;
        const type = String(qraw.type || "single");
        const weight = Math.max(1, Number(qraw.weight) || 10);
        maxPoints += weight;

        const ansObj = answers[qid];
        const stuAns = ansObj !== undefined && ansObj !== null ? ansObj.answer : null;

        let earned = 0;
        let isFullyCorrect = false;
        let status = "unattempted";
        let stuDisplay = "-";
        let corDisplay = "-";
        let corVal = null;

        if (type === "single") {
          const corSingle = String(
            (kraw && kraw.correct_answer !== null && kraw.correct_answer !== undefined
              ? kraw.correct_answer
              : qraw.correctAnswer) ?? "-"
          );
          corVal = corSingle;
          corDisplay = corSingle || "-";
          const stuSingle = typeof stuAns === "string" ? stuAns : null;
          stuDisplay = stuSingle || "-";

          if (!stuSingle) {
            unattemptedCnt++;
            status = "unattempted";
          } else if (stuSingle === corSingle) {
            earned = weight;
            isFullyCorrect = true;
            correctCnt++;
            status = "correct";
          } else {
            incorrectCnt++;
            status = "incorrect";
          }
        } else if (type === "multiple") {
          const rawCor = kraw && kraw.correct_answer !== null && kraw.correct_answer !== undefined
            ? kraw.correct_answer
            : qraw.correctAnswer;
          const corKeys = Array.isArray(rawCor)
            ? rawCor.map(String)
            : typeof rawCor === "string"
            ? [rawCor]
            : [];
          corVal = corKeys;
          const stuKeys = Array.isArray(stuAns) ? stuAns.map(String) : [];
          corDisplay = corKeys.length > 0 ? corKeys.join(",") : "-";
          stuDisplay = stuKeys.length > 0 ? stuKeys.join(",") : "-";

          if (stuKeys.length === 0) {
            unattemptedCnt++;
            status = "unattempted";
          } else {
            const corSet = new Set(corKeys);
            let corSel = 0;
            let incSel = 0;
            for (const k of stuKeys) {
              if (corSet.has(k)) corSel++;
              else incSel++;
            }
            if (corKeys.length > 0 && corSel === corKeys.length && incSel === 0) {
              earned = weight;
              isFullyCorrect = true;
              correctCnt++;
              status = "correct";
            } else if (corKeys.length > 0 && corSel > 0 && incSel === 0) {
              earned = Math.round((corSel / corKeys.length) * weight);
              if (earned > 0) correctCnt++;
              else incorrectCnt++;
              status = "incorrect";
            } else {
              incorrectCnt++;
              status = "incorrect";
            }
          }
        } else if (type === "true_false") {
          const stmts = Array.isArray(kraw?.statements)
            ? kraw.statements
            : Array.isArray(qraw.statements)
            ? qraw.statements
            : [];
          const stmtLen = stmts.length;
          let stmtCorCnt = 0;
          let hasAnyTf = false;
          let allTfAnswered = stmtLen > 0;
          const corArr = [];
          const stuArr = [];

          for (const st of stmts) {
            const corSt = String(st?.correct || "");
            const givenSt =
              stuAns && typeof stuAns === "object" && !Array.isArray(stuAns)
                ? String(stuAns[st?.id] || "")
                : "";
            corArr.push(corSt || "-");
            stuArr.push(givenSt || "-");
            if (givenSt !== "") hasAnyTf = true;
            else allTfAnswered = false;
            if (givenSt !== "" && givenSt === corSt) stmtCorCnt++;
          }

          corDisplay = corArr.length > 0 ? corArr.join(",") : "-";
          stuDisplay = hasAnyTf ? stuArr.join(",") : "-";
          corVal = corDisplay;

          if (!allTfAnswered) {
            unattemptedCnt++;
            status = "unattempted";
          } else {
            earned = Math.round((stmtCorCnt / stmtLen) * weight);
            if (stmtCorCnt === stmtLen) {
              isFullyCorrect = true;
              correctCnt++;
              status = "correct";
            } else {
              incorrectCnt++;
              status = "incorrect";
            }
          }
        }

        totalEarned += earned;
        details.push({
          questionNumber: idx,
          questionId: qraw.id,
          type,
          questionText: qraw.question,
          studentAnswer: stuAns,
          correctAnswer: corVal,
          studentAnswerDisplay: stuDisplay,
          correctAnswerDisplay: corDisplay,
          status,
          earnedScore: earned,
          maxScore: weight,
          isFullyCorrect,
        });
      }

      if (cleanQIds.length > 0 && matchedCnt === 0) {
        return { success: false, not_seeded: true, message: "Bank soal Cloud belum tersinkron." };
      }

      const finalScore = maxPoints > 0 ? Math.round((totalEarned / maxPoints) * 100) : 0;
      const fullRecord = {
        id: resId,
        student,
        examTitle,
        subject,
        attemptNumber: attempt,
        completedAt,
        durationUsedSeconds: durationUsed,
        correctCount: correctCnt,
        incorrectCount: incorrectCnt,
        unattemptedCount: unattemptedCnt,
        totalQuestions: idx,
        totalEarnedPoints: totalEarned,
        maxPossiblePoints: maxPoints,
        finalScore,
        cheatCount,
        cheatLogs,
        finishReason,
        detailedAnswers: details,
      };

      const sessKey = `${nisn.toUpperCase()}__${subject.trim().toLowerCase()}`;
      const now = nowIso();
      const sessRaw = {
        nisn,
        name: student.name || "-",
        class: student.class || "Umum",
        subject,
        status: "completed",
        attemptNumber: attempt,
        answeredCount: Math.max(0, idx - unattemptedCnt),
        totalQuestions: idx,
        remainingSeconds: 0,
        cheatCount,
        finalScore,
        finishReason,
        completedAt,
        updatedAt: now,
      };

      await db.batch([
        db
          .prepare(
            `INSERT INTO cbt_exam_results (
              student_name, student_nisn, student_class, exam_title, subject,
              final_score, correct_count, incorrect_count, unattempted_count,
              total_questions, cheat_count, completed_at, finish_reason, raw_data, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            student.name || "-",
            nisn,
            student.class || "Umum",
            examTitle,
            subject,
            finalScore,
            correctCnt,
            incorrectCnt,
            unattemptedCnt,
            idx,
            cheatCount,
            completedAt,
            finishReason,
            JSON.stringify(fullRecord),
            now
          ),
        db
          .prepare(
            `INSERT INTO cbt_student_sessions (
              session_key, student_nisn, student_name, student_class, subject,
              status, attempt_number, answered_count, total_questions, remaining_seconds,
              cheat_count, final_score, completed_at, updated_at, raw_data
            ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, 0, ?, ?, ?, ?, ?)
            ON CONFLICT(session_key) DO UPDATE SET
              status = 'completed',
              attempt_number = excluded.attempt_number,
              answered_count = excluded.answered_count,
              total_questions = excluded.total_questions,
              remaining_seconds = 0,
              cheat_count = excluded.cheat_count,
              final_score = excluded.final_score,
              completed_at = excluded.completed_at,
              updated_at = excluded.updated_at,
              raw_data = excluded.raw_data`
          )
          .bind(
            sessKey,
            nisn,
            student.name || "-",
            student.class || "Umum",
            subject,
            attempt,
            Math.max(0, idx - unattemptedCnt),
            idx,
            cheatCount,
            finalScore,
            completedAt,
            now,
            JSON.stringify(sessRaw)
          ),
      ]);

      return {
        success: true,
        receipt: {
          id: resId,
          student,
          examTitle,
          subject,
          attemptNumber: attempt,
          completedAt,
          totalQuestions: idx,
          cheatCount,
          finishReason,
          isRemedial: finalScore < 75,
          remedialStatus: finalScore < 75 ? "Remedial" : "Tidak Remedial",
        },
      };
    }

    default:
      return {
        __rpcNotFound: true,
        code: "PGRST202",
        message: `Could not find the function public.${fnName} in the schema cache`,
      };
  }
}

// ============================================================================
// HANDLER TABEL REST (/rest/v1/<table>)
// ============================================================================

async function handleRestTable(request, db, tableName, reqUrl) {
  const schema = TABLE_SCHEMAS[tableName];
  if (!schema) {
    return jsonResponse(
      request,
      { code: "PGRST205", message: `Could not find the table 'public.${tableName}' in the schema cache` },
      404
    );
  }

  const exists = await tableExists(db, tableName);
  if (!exists) {
    return jsonResponse(
      request,
      { code: "PGRST205", message: `Could not find the table 'public.${tableName}' in the schema cache` },
      404
    );
  }

  if (schema.privateTable) {
    return jsonResponse(
      request,
      { code: "42501", message: `permission denied for table ${tableName}` },
      403
    );
  }

  const method = request.method.toUpperCase();
  const prefer = (request.headers.get("prefer") || "").toLowerCase();
  const accept = (request.headers.get("accept") || "").toLowerCase();
  const wantsSingle = accept.includes("application/vnd.pgrst.object+json");
  const wantsCount = prefer.includes("count=exact");
  const wantsRep = prefer.includes("return=representation");

  if (method === "GET" || method === "HEAD") {
    const where = parseWhereClauses(reqUrl.searchParams, schema);
    const sel = parseSelectClause(reqUrl.searchParams.get("select"), schema);
    const orderSql = parseOrderClause(reqUrl.searchParams.get("order"), schema);
    const pg = parsePagination(request, reqUrl.searchParams);

    let totalCount = null;
    if (wantsCount || method === "HEAD") {
      const cntRow = await db
        .prepare(`SELECT COUNT(*) AS cnt FROM "${tableName}" ${where.sql}`)
        .bind(...where.binds)
        .first();
      totalCount = Number(cntRow?.cnt || 0);
    }

    if (method === "HEAD") {
      const extraHeaders = {};
      if (totalCount !== null) {
        extraHeaders["Content-Range"] = `*/${totalCount}`;
      }
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...buildCorsHeaders(request),
          ...extraHeaders,
        },
      });
    }

    let limitSql = "";
    const queryBinds = [...where.binds];
    if (pg.limit !== null) {
      limitSql = "LIMIT ? OFFSET ?";
      queryBinds.push(pg.limit, pg.offset);
    }

    const sql = `SELECT ${sel.sql} FROM "${tableName}" ${where.sql} ${orderSql} ${limitSql}`;
    const res = await db.prepare(sql).bind(...queryBinds).all();
    const rows = (res?.results || []).map((r) => hydrateRow(r, schema, sel.jsonAliases));

    const extraHeaders = {};
    if (totalCount !== null) {
      const endIdx = rows.length > 0 ? pg.offset + rows.length - 1 : 0;
      extraHeaders["Content-Range"] =
        rows.length > 0 ? `${pg.offset}-${endIdx}/${totalCount}` : `*/${totalCount}`;
    }

    if (wantsSingle) {
      if (rows.length === 0) {
        return jsonResponse(
          request,
          { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
          406
        );
      }
      return jsonResponse(request, rows[0], 200, extraHeaders);
    }

    return jsonResponse(request, rows, 200, extraHeaders);
  }

  if (method === "POST") {
    const rawBody = await request.text();
    const parsed = safeJsonParse(rawBody, null);
    const rowsIn = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
    if (rowsIn.length === 0) {
      return jsonResponse(request, wantsRep ? [] : null, 201);
    }

    const isUpsert = prefer.includes("resolution=merge-duplicates") || reqUrl.searchParams.has("on_conflict");
    const conflictCol = String(reqUrl.searchParams.get("on_conflict") || schema.pk).split(",")[0].trim();
    const stmts = [];
    const insertedOrUpdated = [];

    for (const row of rowsIn) {
      if (!row || typeof row !== "object") continue;
      const cols = [];
      const vals = [];
      for (const [k, v] of Object.entries(row)) {
        if (!schema.cols.has(k)) continue;
        cols.push(k);
        vals.push(serializeDbVal(v, schema.jsonCols.has(k)));
      }
      if (cols.length === 0) continue;

      const colsSql = cols.map((c) => `"${c}"`).join(", ");
      const phSql = cols.map(() => "?").join(", ");
      let sql = `INSERT INTO "${tableName}" (${colsSql}) VALUES (${phSql})`;

      if (isUpsert && schema.cols.has(conflictCol)) {
        const updateCols = cols.filter((c) => c !== conflictCol);
        if (updateCols.length > 0) {
          const setSql = updateCols.map((c) => `"${c}" = excluded."${c}"`).join(", ");
          sql += ` ON CONFLICT("${conflictCol}") DO UPDATE SET ${setSql}`;
        } else {
          sql += ` ON CONFLICT("${conflictCol}") DO NOTHING`;
        }
      }
      stmts.push(db.prepare(sql).bind(...vals));
      if (wantsRep) insertedOrUpdated.push(row);
    }

    for (let i = 0; i < stmts.length; i += 80) {
      await db.batch(stmts.slice(i, i + 80));
    }

    return jsonResponse(request, wantsRep ? (wantsSingle ? insertedOrUpdated[0] || null : insertedOrUpdated) : [], 201);
  }

  if (method === "PATCH") {
    const rawBody = await request.text();
    const patchObj = safeJsonParse(rawBody, null);
    if (!patchObj || typeof patchObj !== "object") {
      return jsonResponse(request, { message: "Invalid JSON body" }, 400);
    }
    const where = parseWhereClauses(reqUrl.searchParams, schema);
    const setCols = [];
    const setVals = [];
    for (const [k, v] of Object.entries(patchObj)) {
      if (!schema.cols.has(k)) continue;
      setCols.push(`"${k}" = ?`);
      setVals.push(serializeDbVal(v, schema.jsonCols.has(k)));
    }
    if (setCols.length === 0) return jsonResponse(request, [], 200);

    await db
      .prepare(`UPDATE "${tableName}" SET ${setCols.join(", ")} ${where.sql}`)
      .bind(...setVals, ...where.binds)
      .run();
    return jsonResponse(request, wantsRep ? [patchObj] : [], 200);
  }

  if (method === "DELETE") {
    const where = parseWhereClauses(reqUrl.searchParams, schema);
    await db
      .prepare(`DELETE FROM "${tableName}" ${where.sql}`)
      .bind(...where.binds)
      .run();
    return jsonResponse(request, wantsRep ? [] : null, wantsRep ? 200 : 204);
  }

  return jsonResponse(request, { message: "Method not allowed" }, 405);
}

// ============================================================================
// ENTRYPOINT WORKER
// ============================================================================

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
    }

    if (!env || !env.DB) {
      return jsonResponse(
        request,
        {
          message:
            "Binding D1 'DB' belum dipasang. Buka Cloudflare Worker -> Settings -> Bindings -> Add -> D1 database (Variable name: DB).",
        },
        500
      );
    }

    const reqUrl = new URL(request.url);
    const method = request.method.toUpperCase();
    const bypass =
      request.headers.get("x-cbt-bypass-cache") === "1" ||
      (request.headers.get("cache-control") || "").toLowerCase().includes("no-cache");

    const ttl = getCacheTtlSeconds(method, reqUrl.pathname, bypass);

    let bodyText = "";
    let cacheKey = null;

    if (ttl > 0) {
      if (method !== "GET" && method !== "HEAD") {
        bodyText = await request.text();
      }
      cacheKey = [
        method,
        reqUrl.pathname,
        reqUrl.search,
        request.headers.get("range") || "",
        request.headers.get("prefer") || "",
        request.headers.get("accept") || "",
        bodyText,
      ].join("|");

      const cached = MEM_CACHE.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        const hitHeaders = new Headers(cached.headers);
        Object.entries(buildCorsHeaders(request)).forEach(([k, v]) => hitHeaders.set(k, v));
        hitHeaders.set("X-CBT-Cache", "HIT-MEM");
        return new Response(method === "HEAD" ? null : cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers: hitHeaders,
        });
      } else if (cached) {
        totalCacheBytes = Math.max(0, totalCacheBytes - cached.size);
        MEM_CACHE.delete(cacheKey);
      }
    }

    try {
      let response;
      if (reqUrl.pathname.startsWith("/rest/v1/rpc/")) {
        const fnName = reqUrl.pathname.slice("/rest/v1/rpc/".length).replace(/\/+$/, "");
        if (!bodyText && method !== "GET" && method !== "HEAD") {
          bodyText = await request.text();
        }
        const params = bodyText ? safeJsonParse(bodyText, {}) : {};
        if (ttl === 0 && fnName !== "cbt_verify_exam_token" && fnName !== "cbt_verify_teacher_login" && fnName !== "cbt_verify_student_login" && fnName !== "cbt_matches_class_level") {
          invalidateCacheForPath(reqUrl.pathname);
        }
        const rpcData = await handleRpc(env.DB, fnName, params);
        if (rpcData && rpcData.__rpcNotFound) {
          response = jsonResponse(request, { code: rpcData.code, message: rpcData.message }, 404);
        } else {
          response = jsonResponse(request, rpcData, 200, { "X-CBT-Cache": ttl > 0 ? "MISS" : "BYPASS" });
        }
      } else if (reqUrl.pathname.startsWith("/rest/v1/")) {
        const tableName = reqUrl.pathname.slice("/rest/v1/".length).replace(/\/+$/, "");
        if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
          invalidateCacheForPath(reqUrl.pathname);
        }
        response = await handleRestTable(request, env.DB, tableName, reqUrl);
        response.headers.set("X-CBT-Cache", ttl > 0 ? "MISS" : "BYPASS");
      } else {
        response = jsonResponse(
          request,
          { ok: true, engine: "Cloudflare D1 CBT Backend", status: "ready" },
          200
        );
      }

      if (cacheKey && response.ok && method !== "HEAD") {
        const cloned = response.clone();
        const buf = await cloned.arrayBuffer();
        const storeHeaders = [];
        cloned.headers.forEach((v, k) => {
          const lk = k.toLowerCase();
          if (lk !== "set-cookie" && lk !== "content-length") {
            storeHeaders.push([k, v]);
          }
        });
        setMemCache(cacheKey, {
          expiresAt: Date.now() + ttl * 1000,
          status: cloned.status,
          statusText: cloned.statusText,
          headers: storeHeaders,
          body: buf,
          size: buf.byteLength,
        });
      }

      return response;
    } catch (err) {
      return jsonResponse(
        request,
        { message: "D1 Worker error: " + (err && err.message ? err.message : String(err)) },
        500
      );
    }
  },
};

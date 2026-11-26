// ============================================================================
// CLOUDFLARE WORKER: SUPABASE PROXY + CACHE MEMORI + PELACAK EGRESS & PERINGATAN DINI
// Fitur:
// 1. Cache agresif JSON soal, konfigurasi & lookup siswa di Cloudflare (HIT-MEM)
// 2. Hasil ujian (cbt_exam_results & cbt_grade_and_submit_exam) selalu BYPASS ke Supabase
// 3. Pelacakan real-time total Egress Supabase vs Bandwidth yang dihemat Cache
// 4. Header peringatan dini otomatis (X-CBT-Quota-Status / X-CBT-Quota-Warning)
// 5. Endpoint Admin: GET/POST /__cbt-egress-stats
//
// Opsional agar counter Egress awet meski Worker restart:
//   Pasang binding D1 bernama "DB" (misal cbt-smpnegeri2pacet) ATAU KV bernama "CBT_METRICS".
//   Tanpa binding pun tetap berjalan otomatis via memori isolate Worker.
// ============================================================================

const SUPABASE_ORIGIN = "https://ibmsfedjcathditbedpt.supabase.co";
// Opsional: isi jika pindah ke project Supabase baru agar HP siswa tidak perlu hapus cache
const SUPABASE_ANON_KEY = "";

// Pengaturan Kuota & Ambang Peringatan Dini Supabase Free Plan
const SUPABASE_EGRESS_QUOTA_GB = 5;       // 5 GB / siklus bulan
const EGRESS_WARNING_PCT = 70;            // Peringatan dini kuning mulai 70% (3.5 GB)
const EGRESS_CRITICAL_PCT = 90;           // Peringatan kritis merah mulai 90% (4.5 GB)
const BILLING_RESET_DAY = 14;             // Tanggal reset bulanan Supabase (contoh: 14 Nov - 14 Des)
const INITIAL_EGRESS_MB = 0;              // Isi misal 4200 jika sebelum pasang script ini sudah terpakai 4.2 GB

const QUOTA_BYTES = SUPABASE_EGRESS_QUOTA_GB * 1024 * 1024 * 1024;
const MEM_CACHE = new Map();
const MAX_CACHE_ENTRIES = 100;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
let totalCacheBytes = 0;

let D1_SCHEMA_READY = false;
let LAST_PERSIST_AT = 0;
let LAST_PERSISTED_BYTES = -1;
let HYDRATED_WINDOW = "";

const MEM_STATS = {
  billingWindow: "",
  egressBytes: Math.round(Math.max(0, INITIAL_EGRESS_MB) * 1024 * 1024),
  savedBytes: 0,
  upstreamHits: 0,
  cacheHits: 0,
  endpoints: {},
  updatedAt: new Date().toISOString(),
};

function buildCorsHeaders(request) {
  const reqHeaders = request.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      reqHeaders ||
      "apikey, authorization, content-type, prefer, range, x-client-info, accept-profile, content-profile, x-cbt-bypass-cache",
    "Access-Control-Expose-Headers":
      "content-range, preference-applied, x-cbt-cache, x-cbt-egress-bytes, x-cbt-saved-bytes, x-cbt-egress-percent, x-cbt-quota-status, x-cbt-quota-warning",
    "Access-Control-Max-Age": "86400",
  };
}

function getBillingWindow(nowDate = new Date()) {
  const y = nowDate.getUTCFullYear();
  const m = nowDate.getUTCMonth(); // 0..11
  const d = nowDate.getUTCDate();
  const resetDay = Math.max(1, Math.min(28, BILLING_RESET_DAY));

  let startYear = y;
  let startMonth = m;
  if (d < resetDay) {
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }
  let endYear = startYear;
  let endMonth = startMonth + 1;
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${startYear}-${pad(startMonth + 1)}-${pad(resetDay)}_to_${endYear}-${pad(endMonth + 1)}-${pad(resetDay)}`;
}

function normalizeEndpointLabel(pathname) {
  if (pathname.startsWith("/rest/v1/rpc/")) {
    return "rpc/" + pathname.slice("/rest/v1/rpc/".length).split("/")[0];
  }
  if (pathname.startsWith("/rest/v1/")) {
    return "table/" + pathname.slice("/rest/v1/".length).split("/")[0];
  }
  return pathname || "/";
}

function computeQuotaSummary(env) {
  const win = getBillingWindow();
  const pctRaw = QUOTA_BYTES > 0 ? (MEM_STATS.egressBytes / QUOTA_BYTES) * 100 : 0;
  const percentUsed = Number(pctRaw.toFixed(2));
  const totalReq = MEM_STATS.upstreamHits + MEM_STATS.cacheHits;
  const cacheHitRatePct = totalReq > 0 ? Number(((MEM_STATS.cacheHits / totalReq) * 100).toFixed(1)) : 0;
  const egressMB = Number((MEM_STATS.egressBytes / (1024 * 1024)).toFixed(2));
  const savedMB = Number((MEM_STATS.savedBytes / (1024 * 1024)).toFixed(2));
  const quotaMB = Number((QUOTA_BYTES / (1024 * 1024)).toFixed(0));

  let status = "OK";
  let warningMessage = "";
  if (pctRaw >= 100) {
    status = "EXCEEDED";
    warningMessage = `Kuota Egress Supabase ${SUPABASE_EGRESS_QUOTA_GB} GB telah terlampaui (${percentUsed}% / ${egressMB} MB). Segera alihkan ke Project baru atau Cloudflare D1!`;
  } else if (pctRaw >= EGRESS_CRITICAL_PCT) {
    status = "CRITICAL";
    warningMessage = `KRITIS: Pemakaian Egress Supabase mencapai ${percentUsed}% (${egressMB} MB dari ${SUPABASE_EGRESS_QUOTA_GB} GB). Siapkan database cadangan!`;
  } else if (pctRaw >= EGRESS_WARNING_PCT) {
    status = "WARNING";
    warningMessage = `Peringatan Dini: Pemakaian Egress Supabase sudah ${percentUsed}% (${egressMB} MB dari ${SUPABASE_EGRESS_QUOTA_GB} GB).`;
  }

  const topEndpoints = Object.entries(MEM_STATS.endpoints || {})
    .map(([name, info]) => ({
      name,
      egressMB: Number(((info.egressBytes || 0) / (1024 * 1024)).toFixed(3)),
      savedMB: Number(((info.savedBytes || 0) / (1024 * 1024)).toFixed(3)),
      upstreamHits: info.upstreamHits || 0,
      cacheHits: info.cacheHits || 0,
    }))
    .sort((a, b) => b.egressMB + b.savedMB - (a.egressMB + a.savedMB))
    .slice(0, 8);

  const persistentBackend = env && env.DB ? "cloudflare-d1" : env && env.CBT_METRICS ? "cloudflare-kv" : "worker-memory";

  return {
    billingWindow: MEM_STATS.billingWindow || win,
    quotaBytes: QUOTA_BYTES,
    quotaGB: SUPABASE_EGRESS_QUOTA_GB,
    quotaMB,
    egressBytes: MEM_STATS.egressBytes,
    savedBytes: MEM_STATS.savedBytes,
    egressMB,
    savedMB,
    percentUsed,
    warningThresholdPct: EGRESS_WARNING_PCT,
    criticalThresholdPct: EGRESS_CRITICAL_PCT,
    upstreamHits: MEM_STATS.upstreamHits,
    cacheHits: MEM_STATS.cacheHits,
    cacheHitRatePct,
    status,
    warningMessage,
    persistentBackend,
    topEndpoints,
    updatedAt: MEM_STATS.updatedAt,
  };
}

function attachQuotaHeaders(headers, env) {
  const s = computeQuotaSummary(env);
  headers.set("X-CBT-Egress-Bytes", String(s.egressBytes));
  headers.set("X-CBT-Saved-Bytes", String(s.savedBytes));
  headers.set("X-CBT-Egress-Percent", String(s.percentUsed));
  headers.set("X-CBT-Quota-Status", s.status);
  if (s.warningMessage) {
    headers.set("X-CBT-Quota-Warning", s.warningMessage);
  } else {
    headers.delete("X-CBT-Quota-Warning");
  }
}

function resetStatsForWindow(win, initialBytes = 0) {
  MEM_STATS.billingWindow = win;
  MEM_STATS.egressBytes = Math.max(0, Math.round(initialBytes));
  MEM_STATS.savedBytes = 0;
  MEM_STATS.upstreamHits = 0;
  MEM_STATS.cacheHits = 0;
  MEM_STATS.endpoints = {};
  MEM_STATS.updatedAt = new Date().toISOString();
}

async function ensureHydratedStats(env) {
  const win = getBillingWindow();
  if (HYDRATED_WINDOW === win && MEM_STATS.billingWindow === win) return;

  if (MEM_STATS.billingWindow && MEM_STATS.billingWindow !== win) {
    resetStatsForWindow(win, 0);
  } else if (!MEM_STATS.billingWindow) {
    MEM_STATS.billingWindow = win;
  }

  try {
    if (env && env.DB) {
      if (!D1_SCHEMA_READY) {
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS cbt_egress_metrics (billing_window TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT)"
        ).run();
        D1_SCHEMA_READY = true;
      }
      const row = await env.DB.prepare("SELECT payload FROM cbt_egress_metrics WHERE billing_window = ? LIMIT 1")
        .bind(win)
        .first();
      if (row && row.payload) {
        const parsed = JSON.parse(row.payload);
        if (parsed && typeof parsed === "object") {
          MEM_STATS.egressBytes = Math.max(MEM_STATS.egressBytes, Number(parsed.egressBytes || 0));
          MEM_STATS.savedBytes = Math.max(MEM_STATS.savedBytes, Number(parsed.savedBytes || 0));
          MEM_STATS.upstreamHits = Math.max(MEM_STATS.upstreamHits, Number(parsed.upstreamHits || 0));
          MEM_STATS.cacheHits = Math.max(MEM_STATS.cacheHits, Number(parsed.cacheHits || 0));
          if (parsed.endpoints && typeof parsed.endpoints === "object") {
            MEM_STATS.endpoints = parsed.endpoints;
          }
          MEM_STATS.updatedAt = parsed.updatedAt || MEM_STATS.updatedAt;
        }
      }
    } else if (env && env.CBT_METRICS) {
      const raw = await env.CBT_METRICS.get("egress:" + win);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          MEM_STATS.egressBytes = Math.max(MEM_STATS.egressBytes, Number(parsed.egressBytes || 0));
          MEM_STATS.savedBytes = Math.max(MEM_STATS.savedBytes, Number(parsed.savedBytes || 0));
          MEM_STATS.upstreamHits = Math.max(MEM_STATS.upstreamHits, Number(parsed.upstreamHits || 0));
          MEM_STATS.cacheHits = Math.max(MEM_STATS.cacheHits, Number(parsed.cacheHits || 0));
          if (parsed.endpoints && typeof parsed.endpoints === "object") {
            MEM_STATS.endpoints = parsed.endpoints;
          }
        }
      }
    }
  } catch (e) {
    // Abaikan error penyimpanan metrik agar tidak mengganggu traffic ujian
  }
  HYDRATED_WINDOW = win;
}

async function persistStatsNow(env, force = false) {
  if (!env || (!env.DB && !env.CBT_METRICS)) return;
  const now = Date.now();
  const deltaBytes = Math.abs(MEM_STATS.egressBytes - LAST_PERSISTED_BYTES);
  if (!force && now - LAST_PERSIST_AT < 15000 && deltaBytes < 512 * 1024) {
    return;
  }
  LAST_PERSIST_AT = now;
  LAST_PERSISTED_BYTES = MEM_STATS.egressBytes;

  const win = MEM_STATS.billingWindow || getBillingWindow();
  const payloadStr = JSON.stringify(MEM_STATS);
  try {
    if (env.DB) {
      if (!D1_SCHEMA_READY) {
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS cbt_egress_metrics (billing_window TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT)"
        ).run();
        D1_SCHEMA_READY = true;
      }
      await env.DB.prepare(
        `INSERT INTO cbt_egress_metrics (billing_window, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(billing_window) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
      )
        .bind(win, payloadStr, MEM_STATS.updatedAt)
        .run();
    } else if (env.CBT_METRICS) {
      await env.CBT_METRICS.put("egress:" + win, payloadStr, { expirationTtl: 60 * 60 * 24 * 45 });
    }
  } catch (e) {}
}

function recordTraffic(pathname, byteLen, isCacheServed) {
  const win = getBillingWindow();
  if (MEM_STATS.billingWindow !== win) {
    resetStatsForWindow(win, 0);
  }
  const safeBytes = Math.max(0, Number(byteLen) || 0);
  const ep = normalizeEndpointLabel(pathname);
  if (!MEM_STATS.endpoints[ep]) {
    MEM_STATS.endpoints[ep] = { egressBytes: 0, savedBytes: 0, upstreamHits: 0, cacheHits: 0 };
  }
  if (isCacheServed) {
    MEM_STATS.savedBytes += safeBytes;
    MEM_STATS.cacheHits += 1;
    MEM_STATS.endpoints[ep].savedBytes += safeBytes;
    MEM_STATS.endpoints[ep].cacheHits += 1;
  } else {
    MEM_STATS.egressBytes += safeBytes;
    MEM_STATS.upstreamHits += 1;
    MEM_STATS.endpoints[ep].egressBytes += safeBytes;
    MEM_STATS.endpoints[ep].upstreamHits += 1;
  }
  MEM_STATS.updatedAt = new Date().toISOString();
}

function getCacheTtlSeconds(method, pathname, bypass) {
  if (bypass) return 0;
  if (pathname.startsWith("/rest/v1/cbt_exam_results") || pathname === "/rest/v1/rpc/cbt_grade_and_submit_exam") {
    return 0;
  }
  if (method === "GET" || method === "HEAD") {
    if (pathname === "/rest/v1/cbt_questions") return 3600;
    if (pathname === "/rest/v1/cbt_school_state") return 600;
    if (pathname === "/rest/v1/cbt_student_sessions") return 8;
  }
  if (method === "POST") {
    if (pathname === "/rest/v1/rpc/cbt_get_public_exam_config") return 600;
    if (pathname === "/rest/v1/rpc/cbt_lookup_student_hint") return 3600;
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
  } else if (pathname.includes("cbt_student_sessions")) {
    prefixes = ["/rest/v1/cbt_student_sessions"];
  }
  if (prefixes.length === 0) return;

  for (const [key, entry] of MEM_CACHE.entries()) {
    if (prefixes.some((p) => key.includes("|" + p + "|") || key.includes("|" + p + "?"))) {
      totalCacheBytes = Math.max(0, totalCacheBytes - entry.size);
      MEM_CACHE.delete(key);
    }
  }
}

function setMemCache(key, entry) {
  if (entry.size > 3 * 1024 * 1024) return;
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

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
    }

    const reqUrl = new URL(request.url);
    const method = request.method.toUpperCase();
    await ensureHydratedStats(env);

    // Endpoint Admin untuk memantau & mengkalibrasi kuota Egress
    if (reqUrl.pathname === "/__cbt-egress-stats" || reqUrl.pathname === "/__quota") {
      if (method === "POST") {
        let cmd = {};
        try {
          cmd = JSON.parse((await request.text()) || "{}");
        } catch (e) {}
        if (cmd.action === "reset") {
          resetStatsForWindow(getBillingWindow(), 0);
          await persistStatsNow(env, true);
        } else if (cmd.action === "set_initial_mb") {
          const mb = Math.max(0, Number(cmd.mb || 0));
          MEM_STATS.egressBytes = Math.round(mb * 1024 * 1024);
          MEM_STATS.updatedAt = new Date().toISOString();
          await persistStatsNow(env, true);
        }
      }
      const stats = computeQuotaSummary(env);
      const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...buildCorsHeaders(request),
      });
      attachQuotaHeaders(headers, env);
      return new Response(JSON.stringify(stats), { status: 200, headers });
    }

    const bypass =
      request.headers.get("x-cbt-bypass-cache") === "1" ||
      (request.headers.get("cache-control") || "").toLowerCase().includes("no-cache");

    const ttl = getCacheTtlSeconds(method, reqUrl.pathname, bypass);

    let bodyText = "";
    if (method !== "GET" && method !== "HEAD") {
      bodyText = await request.text();
    }

    if (ttl === 0 && (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")) {
      invalidateCacheForPath(reqUrl.pathname);
    }

    const memKey =
      ttl > 0
        ? [
            method,
            reqUrl.pathname + reqUrl.search,
            request.headers.get("range") || "",
            request.headers.get("prefer") || "",
            request.headers.get("accept") || "",
            bodyText,
          ].join("|")
        : null;

    let staleEntry = null;
    if (memKey) {
      const cached = MEM_CACHE.get(memKey);
      if (cached) {
        if (cached.expiresAt > Date.now()) {
          recordTraffic(reqUrl.pathname, method === "HEAD" ? 0 : cached.size, true);
          if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(persistStatsNow(env, false));
          const hitHeaders = new Headers(cached.headers);
          Object.entries(buildCorsHeaders(request)).forEach(([k, v]) => hitHeaders.set(k, v));
          hitHeaders.set("X-CBT-Cache", "HIT-MEM");
          attachQuotaHeaders(hitHeaders, env);
          return new Response(method === "HEAD" ? null : cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers: hitHeaders,
          });
        }
        staleEntry = cached;
      }
    }

    const upstreamUrl = new URL(reqUrl.pathname + reqUrl.search, SUPABASE_ORIGIN);
    const fwdHeaders = new Headers(request.headers);
    fwdHeaders.delete("host");
    fwdHeaders.delete("cf-connecting-ip");
    fwdHeaders.delete("cf-ipcountry");
    fwdHeaders.delete("cf-ray");
    fwdHeaders.delete("cf-visitor");

    if (SUPABASE_ANON_KEY) {
      fwdHeaders.set("apikey", SUPABASE_ANON_KEY);
      const authHdr = fwdHeaders.get("authorization") || "";
      if (!authHdr || authHdr.toLowerCase().startsWith("bearer ")) {
        fwdHeaders.set("authorization", "Bearer " + SUPABASE_ANON_KEY);
      }
    }

    try {
      const upstreamRes = await fetch(upstreamUrl.toString(), {
        method,
        headers: fwdHeaders,
        body: method === "GET" || method === "HEAD" ? undefined : bodyText,
      });

      if (!upstreamRes.ok && staleEntry && upstreamRes.status >= 400) {
        recordTraffic(reqUrl.pathname, method === "HEAD" ? 0 : staleEntry.size, true);
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(persistStatsNow(env, false));
        const staleHeaders = new Headers(staleEntry.headers);
        Object.entries(buildCorsHeaders(request)).forEach(([k, v]) => staleHeaders.set(k, v));
        staleHeaders.set("X-CBT-Cache", "STALE-FALLBACK");
        attachQuotaHeaders(staleHeaders, env);
        return new Response(method === "HEAD" ? null : staleEntry.body, {
          status: staleEntry.status,
          statusText: staleEntry.statusText,
          headers: staleHeaders,
        });
      }

      const buf = method === "HEAD" ? new ArrayBuffer(0) : await upstreamRes.arrayBuffer();
      const approxHeaderBytes = 350;
      recordTraffic(reqUrl.pathname, buf.byteLength + approxHeaderBytes, false);
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(persistStatsNow(env, false));

      const outHeaders = new Headers(upstreamRes.headers);
      Object.entries(buildCorsHeaders(request)).forEach(([k, v]) => outHeaders.set(k, v));
      outHeaders.set("X-CBT-Cache", ttl > 0 ? "MISS" : "BYPASS");
      attachQuotaHeaders(outHeaders, env);

      if (memKey && upstreamRes.ok && method !== "HEAD") {
        const storeHeaders = [];
        upstreamRes.headers.forEach((v, k) => {
          const lk = k.toLowerCase();
          if (lk !== "set-cookie" && lk !== "content-length") {
            storeHeaders.push([k, v]);
          }
        });
        setMemCache(memKey, {
          expiresAt: Date.now() + ttl * 1000,
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          headers: storeHeaders,
          body: buf,
          size: buf.byteLength,
        });
      }

      return new Response(method === "HEAD" ? null : buf, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: outHeaders,
      });
    } catch (err) {
      if (staleEntry) {
        recordTraffic(reqUrl.pathname, method === "HEAD" ? 0 : staleEntry.size, true);
        const staleHeaders = new Headers(staleEntry.headers);
        Object.entries(buildCorsHeaders(request)).forEach(([k, v]) => staleHeaders.set(k, v));
        staleHeaders.set("X-CBT-Cache", "STALE-FALLBACK");
        attachQuotaHeaders(staleHeaders, env);
        return new Response(method === "HEAD" ? null : staleEntry.body, {
          status: staleEntry.status,
          statusText: staleEntry.statusText,
          headers: staleHeaders,
        });
      }
      return new Response(JSON.stringify({ message: "Proxy error: " + err.message }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...buildCorsHeaders(request),
        },
      });
    }
  },
};

const MOBILE_HOST = "m.stock.naver.com";
const API_HOST = "stock.naver.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const headers = {
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://stock.naver.com/",
  "Origin": "https://stock.naver.com",
  "User-Agent": "Mozilla/5.0"
};
const json = (body, status=200, cc="no-store") => new Response(JSON.stringify(body), {
  status, headers: {...CORS, "Content-Type":"application/json; charset=utf-8", "Cache-Control":cc}
});
// 캐시 TTL(초): 실시간성이 필요한 것은 짧게, 과거 데이터/긴 봉 차트는 길게
const TTL = { rt: 20, daily: 60, week: 120, month: 300, year: 600 };
const UPSTREAM_TIMEOUT = 10000; // 18초 -> 10초
function kstDate(offsetDays=0) {
  const d = new Date(Date.now() + offsetDays*86400000);
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
  return parts.replaceAll("-","");
}
function shiftDate(date, days) {
  const y=Number(date.slice(0,4)),m=Number(date.slice(4,6))-1,d=Number(date.slice(6,8));
  const x=new Date(Date.UTC(y,m,d+days));
  return `${x.getUTCFullYear()}${String(x.getUTCMonth()+1).padStart(2,"0")}${String(x.getUTCDate()).padStart(2,"0")}`;
}
// 호출별 소요시간을 rec 배열에 기록하는 래퍼 (진단용)
async function upstream(url, method="GET", body=null, ttl=0, rec=null) {
  const t0 = Date.now(); let tag = "ERR";
  try { const d = await upstreamRaw(url, method, body, ttl); tag = "ok"; return d; }
  catch (e) { tag = /HTTP \d+/.exec(String(e?.message))?.[0] || (e?.name === "TimeoutError" ? "timeout" : "ERR"); throw e; }
  finally { if (rec) rec.push({ u: url.replace(/^https:\/\/[^/]+/, "").slice(0, 90), ms: Date.now() - t0, st: tag }); }
}
const U = errors => (url, method="GET", body=null, ttl=0) => upstream(url, method, body, ttl, errors.timings);
async function upstreamRaw(url, method="GET", body=null, ttl=0) {
  const init={method,headers:{...headers}};
  if(body!==null){init.headers["Content-Type"]="application/json";init.body=JSON.stringify(body);}
  // GET은 Cloudflare 엣지 캐시 사용 (오류 응답은 캐시하지 않음)
  if(method==="GET"&&ttl>0)init.cf={cacheEverything:true,cacheTtl:ttl,cacheTtlByStatus:{"200-299":ttl,"300-599":0}};
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(UPSTREAM_TIMEOUT),redirect:"follow"});
  const text=await response.text();
  let data=null;try{data=JSON.parse(text);}catch{}
  if(!response.ok)throw new Error(`Upstream HTTP ${response.status}: ${text.slice(0,180)}`);
  if(data===null)throw new Error("Upstream returned non-JSON data");
  return data;
}

async function firstValid(label, urls, test, errors, ttl=0) {
  let last = null;
  for (const url of urls) {
    try { const data = await U(errors)(url, "GET", null, ttl); last = { data, url }; if (test(data)) return { data, url, error: null }; }
    catch (e) { errors.push({ source: label, message: `${url.replace(/^https:\/\/[^/]+/, "")} → ${String(e?.message || e)}` }); }
  }
  return { data: last ? last.data : null, url: last ? last.url : null, error: last ? "필요한 필드를 찾지 못했습니다" : "모든 후보 주소 실패" };
}
async function safe(label,fn,errors){
  try{return {data:await fn(),error:null};}
  catch(e){errors.push({source:label,message:String(e?.message||e)});return {data:null,error:String(e?.message||e)};}
}
const CHART_PERIODS = ["day", "week", "month", "year"];
const PERIOD_DAYS = { day: 600, week: 4800, month: 5500, year: 25000 };
function containsOhlc(value, depth=0) {
  if (!value || typeof value !== "object" || depth > 8) return false;
  if (Array.isArray(value)) return value.some(x => containsOhlc(x, depth + 1));
  const hasClose = value.closePrice !== undefined || value.close !== undefined || value.currentPrice !== undefined || value.indexValue !== undefined;
  const hasOpen = value.openPrice !== undefined || value.open !== undefined || value.openingPrice !== undefined || value.openValue !== undefined;
  const hasHigh = value.highPrice !== undefined || value.high !== undefined || value.highestPrice !== undefined || value.highValue !== undefined;
  const hasLow = value.lowPrice !== undefined || value.low !== undefined || value.lowestPrice !== undefined || value.lowValue !== undefined;
  if (hasClose && hasOpen && hasHigh && hasLow) return true;
  return Object.values(value).some(x => containsOhlc(x, depth + 1));
}
function extractOhlcRows(value, out=[], depth=0) {
  if (!value || typeof value !== "object" || depth > 12) return out;
  const hasClose = value.closePrice !== undefined || value.close !== undefined || value.currentPrice !== undefined || value.indexValue !== undefined;
  const hasOpen = value.openPrice !== undefined || value.open !== undefined || value.openingPrice !== undefined || value.openValue !== undefined;
  const hasHigh = value.highPrice !== undefined || value.high !== undefined || value.highestPrice !== undefined || value.highValue !== undefined;
  const hasLow = value.lowPrice !== undefined || value.low !== undefined || value.lowestPrice !== undefined || value.lowValue !== undefined;
  if (!Array.isArray(value) && hasClose && hasOpen && hasHigh && hasLow) out.push(value);
  if (Array.isArray(value)) value.forEach(x => extractOhlcRows(x, out, depth + 1));
  else Object.values(value).forEach(x => extractOhlcRows(x, out, depth + 1));
  return out;
}
function chartRowDate(row) {
  for (const k of ["localTradedAt", "localDate", "localDateTime", "bizdate", "bizDate", "tradeDate", "tradingDate", "date", "baseDate", "trdDd", "x"]) {
    const v = row?.[k];
    if (v !== undefined && v !== null) {
      const m = String(v).match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
      if (m) return m[1] + m[2] + m[3];
    }
  }
  return "";
}
function mergeOhlcRows(payloads) {
  const byDate = new Map();
  for (const payload of payloads) for (const row of extractOhlcRows(payload)) {
    const date = chartRowDate(row);
    if (date) byDate.set(date, row);
  }
  return [...byDate.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([,row]) => row);
}
function parseLegacyIndexChart(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  let rows = null;
  const source = text.trim();
  for (const candidate of [source, source.replace(/'/g, '"')]) {
    try { rows = JSON.parse(candidate); if (Array.isArray(rows)) break; } catch { rows = null; }
  }
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const out = [];
  for (const item of rows.slice(1)) {
    if (!Array.isArray(item) || item.length < 6) continue;
    const date = String(item[0] ?? "").replace(/\D/g, "").slice(0, 8);
    if (!/^\d{8}$/.test(date)) continue;
    const n = v => {
      if (v === null || v === undefined || v === "") return null;
      const x = Number(String(v).replace(/,/g, ""));
      return Number.isFinite(x) ? x : null;
    };
    const open=n(item[1]), high=n(item[2]), low=n(item[3]), close=n(item[4]);
    if ([open,high,low,close].some(v => v === null)) continue;
    out.push({localDate:date,openPrice:open,highPrice:high,lowPrice:low,closePrice:close,accumulatedTradingVolume:n(item[5]) ?? 0});
  }
  const byDate = new Map(out.map(r => [r.localDate,r]));
  return [...byDate.values()].sort((a,b)=>a.localDate.localeCompare(b.localDate));
}
async function fetchLegacyIndexChart(market, startDate, endDate, errors, timeframe = "day") {
  const hosts = ["https://api.finance.naver.com", "https://fchart.stock.naver.com"];
  for (const host of hosts) {
    const url = `${host}/siseJson.naver?symbol=${market}&requestType=1&startTime=${startDate}&endTime=${endDate}&timeframe=${timeframe}`;
    try {
      const response = await fetch(url, {headers:{...headers,Referer:"https://finance.naver.com/"},signal:AbortSignal.timeout(UPSTREAM_TIMEOUT),redirect:"follow",cf:{cacheTtl: timeframe==="day"?60:300, cacheEverything:true}});
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0,120)}`);
      const rows = parseLegacyIndexChart(body);
      if (rows.length) return {rows,url};
      errors.push({source:`${market}.legacyChart`,message:`${host} 응답에서 ${timeframe} 행을 찾지 못했습니다: ${body.slice(0,100)}`});
    } catch(e) { errors.push({source:`${market}.legacyChart`,message:`${host}: ${String(e?.message||e)}`}); }
  }
  return {rows:[],url:null};
}

// 주·월·년봉: 기본 차트 API는 110개 안팎에서 잘리므로 일봉처럼 확장 조회한다.
function aggregateYearRows(rows) {
  const g = new Map();
  for (const r of rows) { const y = r.localDate.slice(0, 4); if (!g.has(y)) g.set(y, []); g.get(y).push(r); }
  return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([y, a]) => ({
    localDate: y + "0101", openPrice: a[0].openPrice,
    highPrice: Math.max(...a.map(x => x.highPrice)), lowPrice: Math.min(...a.map(x => x.lowPrice)),
    closePrice: a[a.length - 1].closePrice, accumulatedTradingVolume: a.reduce((v, x) => v + (x.accumulatedTradingVolume || 0), 0)
  }));
}
function mergeBestRows(payloads) {
  // 같은 날짜가 구간 경계에서 중복되면 거래량(없으면 고저폭)이 큰 쪽(=잘리지 않은 봉)을 남긴다.
  const score = r => Number(r.accumulatedTradingVolume ?? r.volume ?? 0) || (Number(r.highPrice ?? r.high ?? 0) - Number(r.lowPrice ?? r.low ?? 0));
  const byDate = new Map();
  for (const payload of payloads) for (const row of extractOhlcRows(payload)) {
    const date = chartRowDate(row);
    if (!date) continue;
    const old = byDate.get(date);
    if (!old || score(row) >= score(old)) byDate.set(date, row);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, row]) => row);
}
async function extendNonDayChart(market, period, periodType, data, startDate, endDate, errors, url, legacyPromise) {
  const baseRows = mergeOhlcRows([data]);
  // 1순위: 구형 siseJson (구간 제한 없이 전체 기간 반환). 년봉은 월봉을 연 단위로 합산한다.
  const legacy = await legacyPromise;
  const legacyRows = period === "year" ? aggregateYearRows(legacy.rows) : legacy.rows;
  if (legacyRows.length > baseRows.length) {
    return {data: legacyRows, error: null, periodType: `${periodType}-legacy`, endpoint: legacy.url || url, dataCount: legacyRows.length};
  }
  // 2순위: 기간을 잘게 나눠 기본 차트 API를 여러 번 조회
  const seg = {week: 600, month: 2400, year: 14000}[period] || 600;
  const ranges = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const next = shiftDate(cursor, seg - 1);
    const rangeEnd = next < endDate ? next : endDate;
    ranges.push([cursor, rangeEnd]);
    cursor = shiftDate(rangeEnd, 1);
  }
  const parts = await Promise.all(ranges.map(([from, to]) =>
    U(errors)(`https://${API_HOST}/api/securityService/chart/domestic/index/${market}?periodType=${periodType}&startDateTime=${from}&endDateTime=${to}`, "GET", null, TTL[period]).catch(() => null)));
  const merged = mergeBestRows([data, ...parts.filter(Boolean)]);
  if (merged.length > baseRows.length) return {data: merged, error: null, periodType: `${periodType}-extended`, endpoint: url, dataCount: merged.length};
  return {data, error: null, periodType, endpoint: url};
}

async function fetchIndexChart(market, period, endDate, errors) {
  const startDate = shiftDate(endDate, -PERIOD_DAYS[period]);
  let lastData = null, lastError = null;
  // 주·월·년봉은 기본 API 응답을 기다리지 않고 구형 API를 동시에 호출한다.
  const legacyPromise = period === "day" ? null : fetchLegacyIndexChart(market, startDate, endDate, errors, period === "year" ? "month" : period);
  // 기존 조회 경로를 우선 사용해 기존 차트 표시 동작을 보존한다.
  for (const periodType of [`${period}Candle`, period]) {
    const url = `https://${API_HOST}/api/securityService/chart/domestic/index/${market}?periodType=${periodType}&startDateTime=${startDate}&endDateTime=${endDate}`;
    try {
      const data = await U(errors)(url, "GET", null, TTL[period]);
      lastData = data;
      if (!containsOhlc(data)) continue;
      if (period !== "day") return await extendNonDayChart(market, period, periodType, data, startDate, endDate, errors, url, legacyPromise);

      // 일봉은 기본 차트 API가 120개 안팎으로 제한될 수 있어 날짜 구간 조회와
      // 가격 이력 페이지 조회를 함께 수행하고, 날짜 기준으로 중복을 제거해 합친다.
      const baseRows = mergeOhlcRows([data]);
      if (baseRows.length >= 240) return {data, error:null, periodType, endpoint:url};

      const ranges = [];
      let cursor = startDate;
      while (cursor <= endDate) {
        const next = shiftDate(cursor, 89);
        const rangeEnd = next < endDate ? next : endDate;
        ranges.push([cursor, rangeEnd]);
        cursor = shiftDate(rangeEnd, 1);
      }
      const rangeJobs = ranges.map(([from,to]) => {
        const partUrl = `https://${API_HOST}/api/securityService/chart/domestic/index/${market}?periodType=${periodType}&startDateTime=${from}&endDateTime=${to}`;
        return U(errors)(partUrl, "GET", null, TTL.daily).catch(e => {
          lastError = String(e?.message || e);
          return null;
        });
      });
      // 별도 지수 가격 이력 API는 page/pageSize 방식으로 과거 일봉을 제공하므로
      // 기본 차트 API가 기간을 잘라 반환하는 경우의 보완 경로로 사용한다.
      // 진단 결과 /api/securityFe/api/index/{market}/price?page=... 는
      // HTTP 400을 반환하므로 이 경로는 사용하지 않는다. 날짜 구간 조회와
      // 구형 siseJson 일봉 API를 조합해 120개 제한을 우회한다.
      const [segmented, legacy] = await Promise.all([
        Promise.all(rangeJobs), fetchLegacyIndexChart(market, startDate, endDate, errors)
      ]);
      const mergedRows = mergeOhlcRows([data, ...segmented.filter(Boolean), {priceInfos:legacy.rows}]);
      if (mergedRows.length > baseRows.length) {
        return {data:mergedRows, error:null, periodType:`${periodType}-extended`, endpoint:legacy.url || url, dataCount:mergedRows.length};
      }
      return {data, error:null, periodType, endpoint:url};
    } catch (e) { lastError = String(e?.message || e); }
  }
  // 일별 가격 이력은 기존과 동일한 안전망으로 유지한다.
  if (period === "day") {
    const url = `https://${API_HOST}/api/securityFe/api/index/${market}/price?page=1&pageSize=250`;
    try {
      const data = await U(errors)(url, "GET", null, TTL.daily);
      if (containsOhlc(data)) return {data, error:null, periodType:"daily-price-fallback", endpoint:url};
      if (lastData === null) lastData = data;
    } catch (e) { lastError = String(e?.message || e); }
  }
  const message = lastError || "Naver 응답에서 OHLC 필드를 찾지 못했습니다";
  errors.push({source:`${market}.chart.${period}`,message});
  return {data:lastData,error:message};
}

// 과거 페이지 공통 로더 (일별 투자자 수급 / 일별 프로그램 매매 공용).
// urlFor(bizdate, startIdx) -> URL. pre = 이미 병렬로 받아 둔 offset 1~5 페이지(allSettled 결과).
// startIdx를 서버가 무시하면(세 페이지가 동일) 순차 탐색(anchor, pageIdx)으로 폴백. 총 최대 6페이지(약 600거래일).
const DATE_KEYS = "localTradedAt|localDate|bizdate|bizDate|tradeDate|date|tradingDate|baseDate";
const datesOf = d => [...JSON.stringify(d).matchAll(new RegExp(`"(?:${DATE_KEYS})":"(\\d{4})-?(\\d{2})-?(\\d{2})`, "g"))].map(m => m[1] + m[2] + m[3]);
async function pagedHistory(label, urlFor, bizdate, first, pre, errors) {
  const up = U(errors);
  const seen = new Set(first ? datesOf(first) : []), pages = [], info = { strategy: null, pages: 1, tried: [] };
  const take = (data, tag) => {
    const fresh = datesOf(data).filter(x => !seen.has(x));
    info.tried.push(`${tag}:${fresh.length}`);
    if (fresh.length) { fresh.forEach(x => seen.add(x)); pages.push(data); return true; }
    return false;
  };
  // 0) pageSize를 키워 한 번에 요청 (서버가 허용하면 300건 이상을 한 번에 수집). 안 되면 아래 오프셋/앵커 방식으로 진행.
  for (const ps of [400, 300, 200]) {
    try {
      const d = await up(withPage(urlFor(bizdate, 0), 0, ps), "GET", null, TTL.daily);
      const n = datesOf(d).filter(x => !seen.has(x)).length;
      if (n >= 20) { take(d, `pageSize${ps}`); info.strategy = `pageSize${ps}`; break; }
      info.tried.push(`pageSize${ps}:${n}`);
      if (n === 0) break; // pageSize를 무시하는 서버 → 더 시도하지 않음
    } catch (e) { info.tried.push(`pageSize${ps}:ERR ${String(e?.message || e).slice(0, 60)}`); }
  }
  if (seen.size >= 300) { info.pages = 1 + pages.length; info.totalDates = seen.size; return { pages, info }; }
  // 병렬 요청이 몰려 일부가 실패한 경우 실패한 페이지만 1회 재시도
  const got = pre.map(r => r.status === "fulfilled" ? r.value : null);
  const failed = pre.map((r, k) => r.status === "fulfilled" ? 0 : k + 1).filter(Boolean);
  if (failed.length) {
    const rr = await Promise.allSettled(failed.map(i => up(urlFor(bizdate, 100 * i))));
    failed.forEach((i, j) => {
      if (rr[j].status === "fulfilled") { got[i - 1] = rr[j].value; info.tried.push(`offset#${i}:retry-ok`); }
      else info.tried.push(`offset#${i}:ERR ${String(rr[j].reason?.message || rr[j].reason).slice(0, 60)}`);
    });
  }
  const okPages = got.filter(Boolean);
  const sig = d => [...new Set(datesOf(d))].sort().join(",");
  const sigs = okPages.map(sig);
  const ignored = sigs.length >= 2 && sigs.every(s => s === sigs[0]);
  if (!ignored) okPages.forEach((d, k) => take(d, `offset#${k + 1}`));
  else { info.tried.push("offset:ignored"); take(okPages[0], "offset#1"); }
  if (!ignored && pages.length) info.strategy = "offset";
  else {
    // 기준 날짜가 없으면 첫 페이지로 채운다
    if (!seen.size) {
      try { datesOf(await up(urlFor(bizdate, 0), "GET", null, TTL.daily)).forEach(x => seen.add(x)); }
      catch (e) { info.tried.push(`seed:ERR ${String(e?.message || e).slice(0, 60)}`); }
    }
    for (const st of ["anchor", "pageIdx"]) {
      let ok = false;
      for (let i = 1; i <= 4; i++) {
        const oldest = [...seen].sort()[0];
        if (!oldest) break;
        const u = st === "anchor" ? urlFor(shiftDate(oldest, -1), 0) : urlFor(bizdate, i);
        try { if (take(await up(u, "GET", null, TTL.daily), `${st}#${i}`)) ok = true; else break; }
        catch (e) { info.tried.push(`${st}#${i}:ERR ${String(e?.message || e).slice(0, 60)}`); break; }
      }
      if (ok) { info.strategy = st; break; }
    }
  }
  info.pages = 1 + pages.length; info.totalDates = seen.size;
  if (!pages.length) errors.push({ source: label, message: "과거 페이지를 가져오지 못했습니다: " + info.tried.join(", ") });
  return { pages, info };
}

// ── 당일 시간별 데이터 수집 (코스피·코스닥 투자자별 / 프로그램) ──────────────
// 기본 응답이 100건이라 장 초반(09:00) 구간이 잘리므로, 09:05 이전 데이터가 나올 때까지 거슬러 올라가 최대 ~1000건을 모은다.
// 1) pageSize=1000 한 번에  2) startIdx 오프셋(100건씩 9페이지, 동시 요청)  3) (투자자별만) 가장 오래된 시각을 time= 커서로 사용
// 요청 수를 아끼려고 앞 단계에서 09:05 이전까지 채워지면 다음 단계는 보내지 않는다.
const ROW_TIME_KEYS = ["localTradedAt", "localDateTime", "tradedAt", "dateTime", "datetime", "time", "tradeTime", "baseTime", "bizTime", "localTime", "hhmm"];
const withPage = (url, si, ps) => url.replace(/startIdx=\d+/, `startIdx=${si}`).replace(/pageSize=\d+/, `pageSize=${ps}`);
const stampHMS = k => { let t = k.length >= 12 ? k.slice(8) : k; if (t.length <= 4) t = t.padStart(4, "0"); return t.padEnd(6, "0").slice(0, 6); };
function objArrays(root, depth = 0, out = []) {
  if (!root || depth > 7) return out;
  if (Array.isArray(root)) { if (root.some(x => x && typeof x === "object" && !Array.isArray(x))) out.push(root); root.slice(0, 5).forEach(x => objArrays(x, depth + 1, out)); }
  else if (typeof root === "object") Object.values(root).forEach(x => objArrays(x, depth + 1, out));
  return out;
}
// 응답에서 '행'(가장 긴 객체 배열)의 시각만 모은다. 메타 필드(장 시작시각 등)는 세지 않는다.
function rowStamps(d) {
  let best = [];
  for (const arr of objArrays(d)) {
    const s = [];
    for (const o of arr) {
      if (!o || typeof o !== "object") continue;
      for (const k of ROW_TIME_KEYS) {
        if (o[k] === undefined || o[k] === null) continue;
        const dg = String(o[k]).replace(/\D/g, "");
        if (dg.length >= 12 || (dg.length >= 4 && dg.length <= 6)) { s.push(dg.length >= 12 ? dg.slice(0, 14) : dg.padStart(4, "0")); break; }
      }
    }
    if (s.length > best.length) best = s;
  }
  return best;
}
// 네이버 시간별 API: pageSize는 100이 최대(1000은 400 too_big)이고, startIdx는 '건수 오프셋'이 아니라 '페이지 번호'(0,1,2…)다.
// 그래서 startIdx=1,2,3…을 100건씩 받아 09:05 이전 데이터가 나올 때까지 이어 붙인다. (장 전체 약 3~4페이지)
async function collectIntraday(label, first, baseUrl, errors, startBy = "090500") {
  const up = U(errors), all = new Set(), pages = [], info = { tried: [], rows: 0, oldest: null, first: 0 };
  const add = d => { const b = all.size; rowStamps(d).forEach(k => all.add(k)); return all.size - b; };
  const oldest = () => {
    let day = ""; for (const k of all) if (k.length >= 12 && k.slice(0, 8) > day) day = k.slice(0, 8);
    let o = null; for (const k of all) { if (day && k.length >= 12 && k.slice(0, 8) !== day) continue; const t = stampHMS(k); if (t >= "080000" && t <= "160000" && (o === null || t < o)) o = t; }
    return o;
  };
  const done = () => { const o = oldest(); return o !== null && o <= startBy; };
  const em = e => String(e?.message || e).replace(/\s+/g, " ").slice(0, 70);
  info.first = add(first);
  const fetchBatch = async idxs => {
    const rs = await Promise.allSettled(idxs.map(i => up(withPage(baseUrl, i, 100), "GET", null, TTL.rt)));
    let any = false;
    rs.forEach((r, k) => {
      const tag = `page#${idxs[k]}`;
      if (r.status !== "fulfilled") { info.tried.push(`${tag}:ERR(${em(r.reason)})`); return; }
      const got = rowStamps(r.value).length, n = add(r.value);
      info.tried.push(`${tag}:${n}/${got}`);
      if (n > 0) { pages.push(r.value); any = true; }
    });
    return any;
  };
  if (baseUrl && !done()) {
    if (await fetchBatch([1, 2, 3, 4]) && !done()) await fetchBatch([5, 6, 7, 8, 9]);
  }
  info.rows = all.size; info.oldest = oldest();
  if (!done()) errors.push({ source: label, message: `당일 시간별 데이터가 시작 시각(${startBy.slice(0, 2)}:${startBy.slice(2, 4)})까지 채워지지 않았습니다(최초 시각 ${info.oldest || "없음"}, 시도: ${info.tried.join(", ")})` });
  return { pages, info };
}

// 코스피/코스닥 '투자자 동향 > 시간별' 전용 수집. 대시보드와 별도 호출이라 요청 수·시간 제한을 따로 쓴다.
async function investorTimeData(market) {
  const errors = []; errors.timings = [];
  const up = U(errors);
  const today = kstDate();
  let first = null, baseUrl = null, bizdate = today;
  for (let back = 0; back < 5 && !first; back++) {
    const bd = shiftDate(today, -back);
    for (const url of [
      `https://${API_HOST}/api/domestic/market/trend/time?tradeType=KRX&marketType=${market}&bizdate=${bd}&startIdx=0&pageSize=100`,
      `https://${API_HOST}/api/domestic/market/trend/daily?tradeType=KRX&marketType=${market}&bizdate=${bd}&startIdx=0&pageSize=100&periodType=TIME`
    ]) {
      try { const d = await up(url, "GET", null, TTL.rt); if (rowStamps(d).length) { first = d; baseUrl = url; bizdate = bd; break; } }
      catch (e) { errors.push({ source: `${market}.investorTime`, message: `${url.replace(/^https:\/\/[^/]+/, "")} → ${String(e?.message || e)}` }); }
    }
  }
  if (!first) return { ok: true, workerVer: "intraday-v6", market, bizdate, pages: [], info: null, errors: [...errors, { source: `${market}.investorTime`, message: "시간별 응답에서 시각이 있는 행을 찾지 못했습니다" }] };
  const c = await collectIntraday(`${market}.investorTimePaging`, first, baseUrl, errors);
  return { ok: true, workerVer: "intraday-v6", market, bizdate, pages: [first, ...c.pages], info: c.info, errors, timings: [...errors.timings].sort((x, y) => y.ms - x.ms).slice(0, 12) };
}

// 코스피/코스닥 '프로그램 매매 > 시간별' 전용 수집 (투자자별과 같은 페이지 방식, 별도 호출)
async function programTimeData(market) {
  const errors = []; errors.timings = [];
  const up = U(errors), today = kstDate();
  let first = null, baseUrl = null, bizdate = today;
  for (let back = 0; back < 5 && !first; back++) {
    const bd = shiftDate(today, -back);
    const url = `https://${API_HOST}/api/domestic/market/trendProgram?tradeType=KRX&krxMarketType=${market}&bizdate=${bd}&startIdx=0&pageSize=100&periodType=TIME`;
    try { const d = await up(url, "GET", null, TTL.rt); if (rowStamps(d).length) { first = d; baseUrl = url; bizdate = bd; } }
    catch (e) { errors.push({ source: `${market}.programTime`, message: `${url.replace(/^https:\/\/[^/]+/, "")} → ${String(e?.message || e)}` }); }
  }
  if (!first) return { ok: true, workerVer: "intraday-v6", market, bizdate, pages: [], info: null, errors: [...errors, { source: `${market}.programTime`, message: "프로그램 시간별 응답에서 시각이 있는 행을 찾지 못했습니다" }] };
  const c = await collectIntraday(`${market}.programTimePaging`, first, baseUrl, errors);
  return { ok: true, workerVer: "intraday-v6", market, bizdate, pages: [first, ...c.pages], info: c.info, errors, timings: [...errors.timings].sort((x, y) => y.ms - x.ms).slice(0, 12) };
}
// phase: "fast"(첫 화면용) / "slow"(주·월·연봉, 프로그램, 등락, 시간별, 과거 페이지) / "all"
// slow의 모든 요청(과거 페이지 포함)은 한 단계에서 동시에 보냄 -> 대기시간 = 가장 느린 1건
async function marketData(market, startDate, endDate, errors, phase = "all") {
  const doFast = phase !== "slow", doSlow = phase !== "fast";
  const up = U(errors), none = Promise.resolve(null);
  const periods = [...(doFast ? ["day"] : []), ...(doSlow ? ["week", "month", "year"] : [])];
  const mkBody = periodType => ({ sections: { investorTrend: { tradeType: "KRX", marketType: market, periodType, startDate, endDate } } });
  const aggUrl = `https://${API_HOST}/api/domestic/home/marketaggregate/aggregateInvestor`;
  const bizdate = endDate;
  const trendQ = `tradeType=KRX&marketType=${market}&bizdate=${bizdate}&startIdx=0&pageSize=100`;
  const dailyUrl = `https://${API_HOST}/api/domestic/market/trend/daily?${trendQ}`;
  const dailyAt = (bd, si) => `https://${API_HOST}/api/domestic/market/trend/daily?tradeType=KRX&marketType=${market}&bizdate=${bd}&startIdx=${si}&pageSize=100`;
  const progAt = (bd, si) => `https://${API_HOST}/api/domestic/market/trendProgram?tradeType=KRX&krxMarketType=${market}&bizdate=${bd}&startIdx=${si}&pageSize=100&periodType=DAY`;
  const progUrl = pt => `https://${API_HOST}/api/domestic/market/trendProgram?tradeType=KRX&krxMarketType=${market}&bizdate=${bizdate}&startIdx=0&pageSize=100&periodType=${pt}`;
  const [index, chartResults, aggregate, aggregateDaily, daily, price, program, programDaily, breadth, investorTime, pre, preProg] = await Promise.all([
    doFast ? safe(`${market}.index.basic`, () => up(`https://${API_HOST}/api/securityFe/api/index/${market}/basic`, "GET", null, TTL.rt), errors) : none,
    Promise.all(periods.map(p => fetchIndexChart(market, p, endDate, errors))),
    doFast ? safe(`${market}.aggregateInvestor`, () => up(aggUrl, "POST", mkBody("TIME")), errors) : none,
    doFast ? safe(`${market}.aggregateInvestorDaily`, () => up(aggUrl, "POST", mkBody("DAY")), errors) : none,
    doFast ? safe(`${market}.trendDaily`, () => up(dailyUrl, "GET", null, TTL.daily), errors) : none,
    doFast ? safe(`${market}.price`, () => up(`https://${API_HOST}/api/securityFe/api/index/${market}/price?page=1&pageSize=20`, "GET", null, TTL.rt), errors) : none,
    doSlow ? safe(`${market}.program`, () => up(progUrl("TIME"), "GET", null, TTL.rt), errors) : none,
    doSlow ? safe(`${market}.programDaily`, () => up(progAt(bizdate, 0), "GET", null, TTL.daily), errors) : none,
    doSlow ? firstValid(`${market}.breadth`, [`https://${API_HOST}/api/securityFe/api/index/${market}/integration`, `https://m.stock.naver.com/api/index/${market}/integration`], d => /(rise|fall|steady)count|totalInfos|거래량/i.test(JSON.stringify(d)), errors, TTL.rt) : none,
    doSlow ? firstValid(`${market}.investorTime`, [`https://${API_HOST}/api/domestic/market/trend/time?${trendQ}`, `${dailyUrl}&periodType=TIME`], d => /"time":"\d{3,6}"/.test(JSON.stringify(d)), errors, TTL.rt) : none,
    doSlow ? Promise.allSettled([1, 2, 3].map(i => up(dailyAt(bizdate, 100 * i), "GET", null, TTL.daily))) : none,
    doSlow ? Promise.allSettled([1, 2, 3].map(i => up(progAt(bizdate, 100 * i), "GET", null, TTL.daily))) : none
  ]);
  const charts = Object.fromEntries(periods.map((p, i) => [p, chartResults[i]]));
  const res = { charts };
  if (doFast) Object.assign(res, { index, aggregate, aggregateDaily, daily, price });
  if (doSlow) {
    const [dm, pm, it, pt] = await Promise.all([
      pagedHistory(`${market}.trendDailyPaging`, dailyAt, bizdate, daily?.data ?? null, pre, errors),
      pagedHistory(`${market}.trendProgramPaging`, progAt, bizdate, programDaily?.data ?? null, preProg, errors),
      Promise.resolve({ pages: [], info: null }),
      Promise.resolve({ pages: [], info: null })
    ]);
    Object.assign(res, { program, programDaily, breadth, investorTime, dailyMore: dm.pages, dailyPaging: dm.info, programMore: pm.pages, programPaging: pm.info, investorTimeMore: it.pages, investorTimePaging: it.info, programTimeMore: pt.pages, programTimePaging: pt.info });
  }
  return res;
}


async function vkospiData() {
  const url = "https://kred.dev/ko/series/KRVKOSPI";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9" }, cf: { cacheEverything: true, cacheTtl: 300, cacheTtlByStatus: { "200-299": 300, "300-599": 0 } }, signal: AbortSignal.timeout(15000), redirect: "follow" });
  if (!res.ok) throw new Error(`kred.dev HTTP ${res.status}`);
  const html = await res.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  let m = text.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(\d{4}-\d{2}-\d{2})\s*기준/);
  if (!m) m = text.match(/최신값[^\d]{0,12}(\d{1,3}(?:\.\d+)?)\s*\(?\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) throw new Error("V-KOSPI 수치를 페이지에서 찾지 못했습니다");
  const ch = text.match(/직전 대비\s*([+\-−]\s*\d+(?:\.\d+)?)/);
  return { ok: true, value: parseFloat(m[1]), date: m[2], change: ch ? parseFloat(ch[1].replace(/\s/g, "").replace("−", "-")) : null, url, source: "kred.dev KRVKOSPI (공식 V-KOSPI 200, 일별)" };
}
const SOSOK = { KOSPI: "01", KOSDAQ: "02" };
async function htmlRows(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => m[1].replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
    if (cells.length >= 4 && /^(\d{2,4}[.\-]\d{2}[.\-]\d{2}|\d{1,2}:\d{2})$/.test(cells[0])) rows.push(cells);
  }
  if (!rows.length) throw new Error("표에서 데이터 행을 찾지 못했습니다");
  return rows;
}
async function htmlPages(base, n) {
  const res = await Promise.allSettled(Array.from({ length: n }, (_, i) => htmlRows(`${base}&page=${i + 1}`)));
  const rows = []; let err = null;
  for (const r of res) { if (r.status === "fulfilled") rows.push(...r.value); else err = err || String(r.reason?.message || r.reason); }
  return { rows, err };
}
// finance.naver.com 공개 표(투자자별 시간별/일별, 프로그램 일별)를 읽어 JSON으로 돌려줍니다. 단위: 억원
async function flowData(market) {
  const errors = [], sosok = SOSOK[market], F = "https://finance.naver.com/sise";
  let bizdate = kstDate(), lastErr = null, found = false;
  for (let off = 0; off <= 4 && !found; off++) {
    const bd = kstDate(-off);
    try { await htmlRows(`${F}/investorDealTrendTime.naver?bizdate=${bd}&sosok=${sosok}&page=1`); bizdate = bd; found = true; }
    catch (e) { lastErr = String(e?.message || e); }
  }
  const [time, day, prog] = await Promise.all([
    found ? htmlPages(`${F}/investorDealTrendTime.naver?bizdate=${bizdate}&sosok=${sosok}`, 8) : Promise.resolve({ rows: [], err: lastErr }),
    htmlPages(`${F}/investorDealTrendDay.naver?bizdate=${kstDate()}&sosok=${sosok}`, 4),
    htmlPages(`${F}/programDealTrendDay.naver?bizdate=${kstDate()}&sosok=${sosok}`, 4)
  ]);
  if (!time.rows.length) errors.push({ source: `${market}.intraday`, message: time.err || "데이터 없음" });
  if (!day.rows.length) errors.push({ source: `${market}.daily`, message: day.err || "데이터 없음" });
  if (!prog.rows.length) errors.push({ source: `${market}.programDaily`, message: prog.err || "데이터 없음" });
  return { ok: true, version: "flow-v1", market, requestedAt: new Date().toISOString(), intraday: { bizdate, rows: time.rows }, daily: { rows: day.rows }, program: { rows: prog.rows }, errors, source: "finance.naver.com sise tables (unofficial)" };
}

// ───────── 선물(KOSPI200 선물) 투자자 수급 ─────────
// 네이버 증권 '투자자별 매매동향 > 선물' 탭 데이터. marketType 값이 확인되지 않아 후보를 병렬로 시험하고,
// 응답이 코스피 응답과 똑같으면(=서버가 모르는 값을 무시하고 기본값을 준 경우) 선물 데이터로 인정하지 않는다.
// 직접 지정해 시험: ?action=futures&marketType=XXXX
const FUT_TYPES = ["FUT"]; // 네이버 trend API의 선물 marketType (KOSPI/KOSDAQ/FUT)
const INV_RE = /individual|personal|retail|foreign|institution|organ|netAmounts|개인|외국인|기관/i;
const sameJ = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
async function kospiIntraday(bizdate, errors) {
  const up = U(errors), base = `https://${API_HOST}/api/securityService/chart/domestic/index/KOSPI`;
  const cands = [
    `${base}?periodType=minuteCandle&startDateTime=${bizdate}&endDateTime=${bizdate}`,
    `${base}?periodType=minuteCandle&startDateTime=${bizdate}090000&endDateTime=${bizdate}160000`,
    `${base}?periodType=minute&startDateTime=${bizdate}&endDateTime=${bizdate}`
  ];
  const res = await Promise.allSettled(cands.map(u => up(u, "GET", null, TTL.rt)));
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    if (r.status === "fulfilled" && containsOhlc(r.value) && /\d{4}-?\d{2}-?\d{2}[T ]?\d{2}:?\d{2}/.test(JSON.stringify(r.value)))
      return { kind: "chart", data: r.value, url: cands[i].replace(/^https:\/\/[^/]+/, "") };
  }
  // 폴백: finance.naver.com 시간별 지수 표 (체결시각, 체결가, ...). 페이지당 행 수가 적어 최대 20페이지까지만 읽음
  const rows = [], seen = new Set(); let pageNo = 1;
  for (let b = 0; b < 2; b++) {
    const batch = Array.from({ length: 10 }, (_, i) => pageNo + i); pageNo += 10;
    const rs = await Promise.allSettled(batch.map(p => htmlRows(`https://finance.naver.com/sise/sise_index_time.naver?code=KOSPI&thistime=${bizdate}160000&page=${p}`)));
    let fresh = 0;
    for (const r of rs) if (r.status === "fulfilled") for (const c of r.value) if (!seen.has(c[0])) { seen.add(c[0]); rows.push(c); fresh++; }
    if (!fresh || [...seen].some(t => /^0?9:0[0-5]$/.test(t))) break;
  }
  if (rows.length) return { kind: "html", rows, url: "/sise/sise_index_time.naver" };
  errors.push({ source: "FUT.kospiIntraday", message: "코스피 시간별 지수를 가져오지 못했습니다(차트 API·finance 표 모두 실패)" });
  return null;
}

// 시간별 데이터는 한 번에 100건만 오는 경우가 있어 최대 ~1000건(장 시작 09:00부터)까지 모은다.
// 1) pageSize=1000 한 번에  2) startIdx 오프셋 페이지  3) 가장 오래된 시각을 커서(time=)로 거슬러 올라가기
const tHMS = v => { const dg = String(v).replace(/\D/g, ""); if (dg.length >= 12) return dg.slice(8, 14); return dg.length <= 4 ? dg.padStart(4, "0") + "00" : dg.padStart(6, "0"); };
const timesOf = d => [...JSON.stringify(d).matchAll(/"(?:time|localTradedAt|tradedAt|dateTime|datetime|baseTime|tradeTime|localDateTime)":"?([0-9T:\-]{3,25})/g)].map(m => tHMS(m[1]));
async function timeCollect(time, b, errors) {
  const up = U(errors), payloads = [time.data], seen = new Set(timesOf(time.data)), info = { strategy: [], tried: [] };
  const take = (d, tag) => { const fresh = timesOf(d).filter(x => !seen.has(x)); info.tried.push(`${tag}:${fresh.length}`); if (!fresh.length) return false; fresh.forEach(x => seen.add(x)); payloads.push(d); return true; };
  const build = time.variant === "time" ? b.t2 : b.t1;
  const dayOldest = () => [...seen].filter(t => t >= "080000" && t <= "160000").sort()[0] || null;
  const done = () => { const o = dayOldest(); return o !== null && o <= "090500"; };
  try { const big = await up(build(time.type, 0, 1000), "GET", null, TTL.rt); if (take(big, "size1000")) info.strategy.push("size1000"); } catch (e) { info.tried.push("size1000:ERR"); }
  if (!done()) {
    const rs = await Promise.allSettled(Array.from({ length: 9 }, (_, i) => up(build(time.type, 100 * (i + 1), 100), "GET", null, TTL.rt)));
    let any = false; rs.forEach((r, i) => { if (r.status === "fulfilled" && take(r.value, `offset#${i + 1}`)) any = true; });
    if (any) info.strategy.push("offset");
  }
  for (let i = 0; i < 10 && !done(); i++) {
    const o = dayOldest(); if (!o) break;
    try { if (!take(await up(b.cur(time.type, o, time.variant !== "time"), "GET", null, TTL.rt), `cursor#${i + 1}`)) break; if (!info.strategy.includes("cursor")) info.strategy.push("cursor"); }
    catch (e) { info.tried.push(`cursor#${i + 1}:ERR`); break; }
  }
  info.rows = seen.size; info.oldest = dayOldest();
  return { payloads, info };
}
async function futuresData(forceType) {
  const errors = []; errors.timings = [];
  const up = U(errors), t0 = Date.now(), bizdate = kstDate();
  const tryUp = async (url, method = "GET", body = null, ttl = 0) => { try { return await up(url, method, body, ttl); } catch { return null; } };
  const dailyAt = (mt, bd, si) => `https://${API_HOST}/api/domestic/market/trend/daily?tradeType=KRX&marketType=${mt}&bizdate=${bd}&startIdx=${si}&pageSize=100`;
  const timeAt = (mt, si = 0, ps = 100) => `https://${API_HOST}/api/domestic/market/trend/time?tradeType=KRX&marketType=${mt}&bizdate=${bizdate}&startIdx=${si}&pageSize=${ps}`;
  const timeAt2 = (mt, si = 0, ps = 100) => `https://${API_HOST}/api/domestic/market/trend/time?tradeType=KRX&marketType=${mt}&time=160000&startIdx=${si}&pageSize=${ps}`;
  const timeCur = (mt, tm, withDate) => `https://${API_HOST}/api/domestic/market/trend/time?tradeType=KRX&marketType=${mt}${withDate ? `&bizdate=${bizdate}` : ""}&time=${tm}&startIdx=0&pageSize=100`;
  const aggUrl = `https://${API_HOST}/api/domestic/home/marketaggregate/aggregateInvestor`;
  const mkBody = (mt, periodType) => ({ sections: { investorTrend: { tradeType: "KRX", marketType: mt, periodType, startDate: shiftDate(bizdate, -30), endDate: bizdate } } });
  const types = forceType ? [forceType] : FUT_TYPES;
  const okDaily = (d, ref) => !!d && datesOf(d).length >= 3 && INV_RE.test(JSON.stringify(d)) && !sameJ(d, ref);
  const okTime = (d, ref) => !!d && /"(?:time|localTradedAt|tradedAt|dateTime|datetime|baseTime|tradeTime|localDateTime)":"?\d{3,14}/.test(JSON.stringify(d)) && INV_RE.test(JSON.stringify(d)) && !sameJ(d, ref);
  const out = await Promise.all([
    tryUp(dailyAt("KOSPI", bizdate, 0), "GET", null, TTL.daily), tryUp(timeAt("KOSPI"), "GET", null, TTL.rt),
    tryUp(aggUrl, "POST", mkBody("KOSPI", "DAY")), tryUp(aggUrl, "POST", mkBody("KOSPI", "TIME")), tryUp(timeAt2("KOSPI"), "GET", null, TTL.rt),
    ...types.flatMap(t => [tryUp(dailyAt(t, bizdate, 0), "GET", null, TTL.daily), tryUp(timeAt(t), "GET", null, TTL.rt), tryUp(aggUrl, "POST", mkBody(t, "DAY")), tryUp(aggUrl, "POST", mkBody(t, "TIME")), tryUp(timeAt2(t), "GET", null, TTL.rt)])
  ]);
  const [rDaily, rTime, rAggD, rAggT, rTime2] = out, tried = [], NREF = 5, NC = 5;
  let daily = null, time = null;
  types.forEach((t, i) => {
    const [dGet, tGet, dAgg, tAgg, tGet2] = out.slice(NREF + i * NC, NREF + (i + 1) * NC);
    const st = (d, ok) => d ? (ok ? "ok" : "invalid") : "fail";
    const a = okDaily(dGet, rDaily), b = okDaily(dAgg, rAggD), c = okTime(tGet, rTime) && !sameJ(tGet, rTime2), d = okTime(tAgg, rAggT), e = okTime(tGet2, rTime2) && !sameJ(tGet2, rTime);
    tried.push(`${t}: daily GET ${st(dGet, a)} / daily POST ${st(dAgg, b)} / time GET ${st(tGet, c)} / time(time=) GET ${st(tGet2, e)} / time POST ${st(tAgg, d)}`);
    if (!daily && a) daily = { type: t, via: "GET", data: dGet };
    if (!daily && b) daily = { type: t, via: "POST", data: dAgg };
    if (!time && c) time = { type: t, via: "GET", data: tGet, variant: "bizdate" };
    if (!time && e) time = { type: t, via: "GET", data: tGet2, variant: "time" };
    if (!time && d) time = { type: t, via: "POST", data: tAgg };
  });
  // 2단계: 과거 페이지(최대 400거래일)와 코스피 시간별 지수를 동시에
  const [timePages, paged, kIntra] = await Promise.all([
    time && time.via === "GET"
      ? collectIntraday("FUT.timePaging", time.data, (time.variant === "time" ? timeAt2 : timeAt)(time.type, 0, 100), errors, "085000")
          .then(c => ({ payloads: [time.data, ...c.pages], info: c.info }))
      : Promise.resolve({ payloads: [], info: null }),
    daily && daily.via === "GET"
      ? (async () => {
          const pre = await Promise.allSettled([1, 2, 3].map(i => up(dailyAt(daily.type, bizdate, 100 * i), "GET", null, TTL.daily)));
          return pagedHistory("FUT.trendDailyPaging", (bd, si) => dailyAt(daily.type, bd, si), bizdate, daily.data, pre, errors);
        })()
      : Promise.resolve({ pages: [], info: null }),
    kospiIntraday(bizdate, errors)
  ]);
  if (!daily) errors.push({ source: "FUT.daily", message: "선물 일별 투자자 수급 엔드포인트를 찾지 못했습니다. 시도: " + tried.join(" | ") });
  if (!time) errors.push({ source: "FUT.time", message: "선물 시간별 투자자 수급 엔드포인트를 찾지 못했습니다. 시도: " + tried.join(" | ") });
  return {
    ok: true, version: "fut-v2", bizdate, requestedAt: new Date().toISOString(),
    futures: { type: (daily || time || {}).type || null, daily, dailyMore: paged.pages, dailyPaging: paged.info, time, timeMore: timePages.payloads.slice(1), timePaging: timePages.info, kospiIntraday: kIntra, tried },
    errors, elapsedMs: Date.now() - t0, timings: [...errors.timings].sort((a, b) => b.ms - a.ms).slice(0, 12),
    source: "Naver Stock public endpoints (unofficial)"
  };
}
export default {
  async fetch(request, env, ctx) {
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
    if(request.method!=="GET")return json({ok:false,error:"GET only"},405);
    const url=new URL(request.url);
    const action=url.searchParams.get("action");
    if(action==="health")return json({ok:true,service:"MARKET FLOW Worker",time:new Date().toISOString()});
    if(action==="vkospi"){try{return json(await vkospiData(),200,"public, max-age=300");}catch(e){return json({ok:false,error:String(e?.message||e)},502);}}
    if(action==="flow"){const market=(url.searchParams.get("market")||"KOSPI").toUpperCase();if(!SOSOK[market])return json({ok:false,error:"market must be KOSPI or KOSDAQ"},400);try{return json(await flowData(market));}catch(e){return json({ok:false,error:String(e?.message||e)},500);}}
    if(action==="investorTime"){const market=(url.searchParams.get("market")||"KOSPI").toUpperCase();if(!SOSOK[market])return json({ok:false,error:"market must be KOSPI or KOSDAQ"},400);try{const body=await investorTimeData(market);return json(body,200,body.errors.length?"no-store":"public, max-age=20");}catch(e){return json({ok:false,error:String(e?.message||e)},500);}}
    if(action==="programTime"){const market=(url.searchParams.get("market")||"KOSPI").toUpperCase();if(!SOSOK[market])return json({ok:false,error:"market must be KOSPI or KOSDAQ"},400);try{const body=await programTimeData(market);return json(body,200,body.errors.length?"no-store":"public, max-age=20");}catch(e){return json({ok:false,error:String(e?.message||e)},500);}}
    if(action==="futures"){const mt=(url.searchParams.get("marketType")||"").trim().toUpperCase()||null;try{const body=await futuresData(mt);return json(body,200,body.errors.length?"no-store":"public, max-age=20");}catch(e){return json({ok:false,error:String(e?.message||e)},500);}}
    if(action!=="dashboard")return json({ok:true,service:"MARKET FLOW Worker",actions:["health","dashboard","flow","vkospi","futures","investorTime","programTime"]});
    const days=Math.max(10,Math.min(2500,Number(url.searchParams.get("days")||120)));
    const phase=["fast","slow"].includes(url.searchParams.get("phase"))?url.searchParams.get("phase"):"all";
    // 커스텀 도메인에서는 Cache API가 동작 (workers.dev에서는 무시되며, 이 경우 upstream 엣지 캐시만 적용)
    const cache=typeof caches!=="undefined"?caches.default:null;
    const cacheKey=new Request(`${url.origin}/?action=dashboard&phase=${phase}&days=${days}`);
    if(cache){try{const hit=await cache.match(cacheKey);if(hit)return hit;}catch{}}
    const endDate=kstDate();
    const startDate=shiftDate(endDate,-Math.ceil(days*1.65));
    const errors=[];errors.timings=[];const tStart=Date.now();
    const [kospi,kosdaq]=await Promise.all([
      marketData("KOSPI",startDate,endDate,errors,phase),
      marketData("KOSDAQ",startDate,endDate,errors,phase)
    ]);
    const markets={KOSPI:kospi,KOSDAQ:kosdaq};
    if(phase!=="slow"){
      markets.FUT={index:{data:null,error:"선물 가격은 이번 코스피 차트 작업 범위에 포함되지 않습니다"},charts:{},aggregate:{data:null,error:"선물 수급은 별도 연결 대상입니다"},daily:{data:null,error:null},program:null};
    }
    // 오류가 없을 때만 브라우저/엣지에 캐시 (실패 응답이 고정되는 것을 방지)
    const ttl=phase==="fast"?15:60;
    const resp=json({
      ok:true,workerVer:"intraday-v2",phase,requestedAt:new Date().toISOString(),startDate,endDate,requestedDays:days,
      markets,errors,
      elapsedMs:Date.now()-tStart,callCount:errors.timings.length,
      timings:[...errors.timings].sort((a,b)=>b.ms-a.ms).slice(0,12),
      source:"Naver Stock public endpoints (unofficial)"
    },200,errors.length?"no-store":`public, max-age=${ttl}`);
    if(cache&&!errors.length&&ctx?.waitUntil){try{ctx.waitUntil(cache.put(cacheKey,resp.clone()));}catch{}}
    return resp;
  }
};


// ============================================================
// MARKET INSIGHT DAILY - Cloudflare Worker
// Finance-focused RSS collection / Free keyword mode
// D1 binding: env.DB
// Required secret: ADMIN_TOKEN
//
// 기존 D1 테이블과 컬럼을 그대로 사용합니다.
// 기존 뉴스 및 이슈 데이터는 삭제하지 않습니다.
// ============================================================


// ------------------------------------------------------------
// 1. RSS 수집 목록
// 일반 종합 뉴스는 제외하고 경제·금융·산업 중심으로 수집
// 정치·사회는 경제 관련 기사만 필터를 통과하도록 설정
// ------------------------------------------------------------

const FEEDS = [
  // 미국 증시·금융
  { category: "global", name: "CNBC Markets", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20409666" },
  { category: "global", name: "CNBC Top News", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { category: "global", name: "MarketWatch Markets", url: "https://www.marketwatch.com/rss/topstories" },
  { category: "global", name: "WSJ Markets", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain" },

  // 미국 경제·통화정책
  { category: "macro", name: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { category: "macro", name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { category: "macro", name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { category: "macro", name: "OilPrice", url: "https://oilprice.com/rss/main" },

  // 한국 경제·증권·금융
  { category: "korea", name: "뉴스핌 경제", url: "https://rss.newspim.com/news/category/103" },
  { category: "korea", name: "뉴스핌 증권금융", url: "https://rss.newspim.com/news/category/105" },
  { category: "korea", name: "뉴스핌 글로벌", url: "https://rss.newspim.com/news/category/107" },
  { category: "korea", name: "매일경제 경제", url: "https://www.mk.co.kr/rss/30100041/" },
  { category: "korea", name: "매일경제 증권", url: "https://www.mk.co.kr/rss/50200011/" },
  { category: "korea", name: "한국경제 경제", url: "https://www.hankyung.com/feed/economy" },
  { category: "korea", name: "한국경제 증권", url: "https://www.hankyung.com/feed/finance" },
  { category: "korea", name: "한국경제 국제", url: "https://www.hankyung.com/feed/international" },

  // 기업·산업·기술
  { category: "industry", name: "뉴스핌 산업", url: "https://rss.newspim.com/news/category/106" },
  { category: "industry", name: "매일경제 기업경영", url: "https://www.mk.co.kr/rss/50100032/" },
  { category: "industry", name: "뉴시스 산업", url: "https://nwww.newsis.com/RSS/industry.xml" },
  { category: "industry", name: "뉴시스 금융", url: "https://nwww.newsis.com/RSS/bank.xml" },
  { category: "industry", name: "전자신문", url: "https://rss.etnews.com/Section901.xml" },
  { category: "industry", name: "ZDNet Korea", url: "https://feeds.feedburner.com/zdkorea" },
  { category: "industry", name: "조선비즈", url: "https://biz.chosun.com/arc/outboundfeeds/rss/?outputType=xml" },

  // 정치·사회: 경제적 영향이 있는 기사만 필터링
  { category: "korea", name: "뉴스핌 정치", url: "https://rss.newspim.com/news/category/101" },
  { category: "korea", name: "뉴스핌 사회", url: "https://rss.newspim.com/news/category/102" },
  { category: "korea", name: "매일경제 정치", url: "https://www.mk.co.kr/rss/30200030/" },
  { category: "korea", name: "뉴시스 정치", url: "https://nwww.newsis.com/RSS/politics.xml" },
  { category: "korea", name: "뉴시스 사회", url: "https://nwww.newsis.com/RSS/society.xml" }
];

const CATEGORIES = ["global", "macro", "geopolitics", "korea", "industry"];


// ------------------------------------------------------------
// 2. 공통 유틸리티
// ------------------------------------------------------------

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    ...cors,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  }
});

const PERSON_NEWS_MEMORY_CACHE = new Map();
const iso = () => new Date().toISOString();
const makeId = () => crypto.randomUUID();

function decode(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); }
      catch { return ""; }
    })
    .replace(/&#x([\da-f]+);/gi, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); }
      catch { return ""; }
    })
    .trim();
}

function clean(value = "") {
  return decode(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validUrl(value) {
  try {
    const url = new URL(decode(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function getTagRaw(xml, name) {
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<(?:(?:[\\w.-]+):)?${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${safe}\\s*>`,
    "i"
  );
  const match = String(xml).match(re);
  return match ? match[1].trim() : "";
}

function getTag(xml, name) {
  return clean(getTagRaw(xml, name));
}

function getLink(item) {
  // RSS 일반 링크
  const rssLink = validUrl(clean(getTagRaw(item, "link")));
  if (rssLink) return rssLink;

  // Atom 링크
  const tags = String(item).match(
    /<(?:[\w.-]+:)?link\b[^>]*\/?\s*>/gi
  ) || [];

  let fallback = "";

  for (const tag of tags) {
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const href = validUrl(hrefMatch[1]);
    if (!href) continue;

    const relMatch = tag.match(/\brel\s*=\s*["']([^"']+)["']/i);
    const rel = (relMatch?.[1] || "alternate").toLowerCase();

    if (rel === "alternate") return href;
    if (!fallback) fallback = href;
  }

  if (fallback) return fallback;

  // GUID가 permalink인 경우만 사용
  const guidRaw = getTagRaw(item, "guid");
  if (guidRaw) {
    const guid = validUrl(clean(guidRaw));
    const guidTag = item.match(/<(?:[\w.-]+:)?guid\b([^>]*)>/i);
    const attr = guidTag?.[1]?.match(
      /\bisPermaLink\s*=\s*["']([^"']+)["']/i
    );

    if (guid && (!attr || attr[1].toLowerCase() !== "false")) {
      return guid;
    }
  }

  return "";
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}


// ------------------------------------------------------------
// 3. RSS 파싱 및 수집
// ------------------------------------------------------------

function parseFeed(xml, feed) {
  const entries = String(xml).match(
    /<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)\s*>/gi
  ) || [];

  const result = [];

  for (const item of entries) {
    const title = getTag(item, "title");
    const link = getLink(item);

    if (!title || !link) continue;

    const description =
      getTag(item, "description") ||
      getTag(item, "summary") ||
      getTag(item, "content") ||
      getTag(item, "encoded");

    const published =
      getTag(item, "pubDate") ||
      getTag(item, "published") ||
      getTag(item, "updated") ||
      getTag(item, "date");

    result.push({
      category: feed.category,
      title: title.slice(0, 500),
      url: link,
      description: clean(description).slice(0, 1800),
      publishedAt: published ? parseDate(published) : null,
      source: getTag(item, "source") || feed.name
    });
  }

  return result;
}


async function fetchFeed(feed) {
  const MAX_ATTEMPTS = 3;
  const WAIT_TIMES = [700, 1500];

  let lastStatus = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(feed.url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MarketInsightDaily/2.0)",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          ...(feed.url.includes("mk.co.kr")
            ? { "Referer": "https://www.mk.co.kr/" }
            : feed.url.includes("hankyung.com")
              ? { "Referer": "https://www.hankyung.com/" }
              : {})
        },
        signal: controller.signal,
        redirect: "follow"
      });

      lastStatus = response.status;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        const bodyPreview = errorBody
          .replace(/\s+/g, " ")
          .slice(0, 180);

        lastError = `HTTP ${response.status}` +
          (bodyPreview ? ` / ${bodyPreview}` : "");

        if (
          (response.status >= 500 || response.status === 429) &&
          attempt < MAX_ATTEMPTS
        ) {
          await new Promise(resolve =>
            setTimeout(resolve, WAIT_TIMES[attempt - 1])
          );
          continue;
        }

        return {
          articles: [],
          diagnostic: {
            name: feed.name,
            url: feed.url,
            status: response.status,
            articles: 0,
            attempts: attempt,
            error: lastError
          }
        };
      }

      const xml = await response.text();

      if (!xml || !/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) {
        lastError = "RSS/XML 형식이 아닙니다.";

        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve =>
            setTimeout(resolve, WAIT_TIMES[attempt - 1])
          );
          continue;
        }

        return {
          articles: [],
          diagnostic: {
            name: feed.name,
            url: feed.url,
            status: response.status,
            articles: 0,
            attempts: attempt,
            error: lastError
          }
        };
      }

      const articles = parseFeed(xml, feed);

      return {
        articles,
        diagnostic: {
          name: feed.name,
          url: feed.url,
          status: response.status,
          articles: articles.length,
          attempts: attempt,
          error: articles.length
            ? null
            : "유효한 기사 또는 원문 링크가 없습니다."
        }
      };

    } catch (error) {
      lastError = error?.name === "AbortError"
        ? "요청 시간 초과(10초)"
        : String(error?.message || error);

      if (attempt < MAX_ATTEMPTS) {
        await new Promise(resolve =>
          setTimeout(resolve, WAIT_TIMES[attempt - 1])
        );
        continue;
      }

      return {
        articles: [],
        diagnostic: {
          name: feed.name,
          url: feed.url,
          status: lastStatus,
          articles: 0,
          attempts: attempt,
          error: lastError
        }
      };

    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    articles: [],
    diagnostic: {
      name: feed.name,
      url: feed.url,
      status: lastStatus,
      articles: 0,
      attempts: MAX_ATTEMPTS,
      error: lastError || "요청 실패"
    }
  };
}



// ------------------------------------------------------------
// 4. 금융시장 관련 이슈 규칙
// ------------------------------------------------------------

const RULES = [
  {
    key: "us-interest-rates",
    label: "미국 기준금리·연준 정책",
    words: ["연준", "fomc", "federal reserve", "기준금리", "금리 인하", "금리 동결", "금리 인상", "파월", "fed"],
    context: ["금리", "연준", "fomc", "fed", "통화정책", "기준금리", "federal reserve"],
    cat: "macro", sector: "은행·증권·성장주", long: true
  },
  {
    key: "us-inflation",
    label: "미국 물가·인플레이션",
    words: ["cpi", "pce", "물가", "인플레이션", "소비자물가", "생산자물가"],
    context: ["물가", "인플레이션", "cpi", "pce", "소비자물가", "생산자물가"],
    cat: "macro", sector: "시장 전반", long: false
  },
  {
    key: "us-bond-yields",
    label: "미국 국채금리·채권시장",
    words: ["국채금리", "미국채", "국채 수익률", "채권금리", "10년물", "2년물", "treasury yield", "bond yield"],
    context: ["국채", "채권", "수익률", "금리", "treasury", "bond", "yield"],
    cat: "macro", sector: "은행·증권·성장주", long: true
  },
  {
    key: "dollar-won",
    label: "달러·원 환율",
    words: ["원달러", "달러원", "환율", "달러 강세", "달러 약세", "원화", "usd/krw"],
    context: ["환율", "달러", "원화", "외환", "usd/krw", "dollar", "won"],
    cat: "macro", sector: "수출·항공·금융", long: true
  },
  {
    key: "middle-east",
    label: "중동 정세·지정학 리스크",
    words: ["중동", "이란", "이스라엘", "가자", "호르무즈", "홍해", "후티", "iran", "israel"],
    context: ["유가", "원유", "호르무즈", "홍해", "에너지", "공급망", "해운", "운임", "oil", "crude", "energy", "shipping", "freight", "supply"],
    cat: "geopolitics", sector: "방산·정유·해운", long: true
  },
  {
    key: "crude-oil",
    label: "국제유가·에너지 시장",
    words: ["유가", "원유", "wti", "브렌트", "오펙", "opec", "원유 생산", "crude oil", "oil price"],
    context: ["유가", "원유", "wti", "브렌트", "opec", "석유", "에너지", "crude", "oil price"],
    cat: "geopolitics", sector: "정유·화학·항공", long: true
  },
  {
    key: "us-china-trade",
    label: "미중 갈등·관세·무역 규제",
    words: ["미중", "중국 관세", "미국 관세", "관세", "수출 통제", "무역 규제", "tariff", "trade war"],
    context: ["수출", "수입", "무역", "반도체", "자동차", "배터리", "기업", "공급망", "관세", "trade", "export", "import", "supply chain"],
    cat: "geopolitics", sector: "반도체·자동차·배터리", long: true
  },
  {
    key: "ai-semiconductors",
    label: "AI·반도체 산업 경쟁",
    words: ["반도체", "hbm", "ai칩", "ai chip", "엔비디아", "nvidia", "sk하이닉스", "삼성전자", "파운드리", "첨단 패키징", "semiconductor", "chipmaker"],
    context: ["반도체", "hbm", "ai칩", "ai chip", "엔비디아", "nvidia", "sk하이닉스", "삼성전자", "파운드리", "semiconductor", "chip"],
    cat: "industry", sector: "반도체·AI", long: true
  },
  {
    key: "us-tech-stocks",
    label: "미국 빅테크·기술주 실적",
    words: ["나스닥", "빅테크", "애플", "마이크로소프트", "아마존", "메타", "알파벳", "테슬라", "기술주", "nasdaq", "apple", "microsoft", "amazon", "tesla"],
    context: ["주가", "실적", "매출", "영업이익", "순이익", "기술주", "주식", "증시", "nasdaq", "stock", "shares", "earnings", "revenue", "profit", "market"],
    cat: "global", sector: "인터넷·소프트웨어·전기차", long: true
  },
  {
    key: "korea-market-policy",
    label: "한국 증시·정부 정책",
    words: ["코스피", "코스닥", "밸류업", "공매도", "금융투자소득세", "상법", "자사주", "배당세", "증시 정책", "kospi", "kosdaq"],
    context: ["증시", "주식", "코스피", "코스닥", "상장", "공매도", "밸류업", "배당", "자사주", "주주", "kospi", "kosdaq", "stock market"],
    cat: "korea", sector: "국내 증시 전반", long: true
  },
  {
    key: "korea-exports",
    label: "한국 수출·무역 동향",
    words: ["수출", "무역수지", "경상수지", "수출입", "exports", "trade balance"],
    context: ["수출", "무역", "경상수지", "무역수지", "수출입", "반도체 수출", "수출액", "export", "trade balance"],
    cat: "korea", sector: "반도체·자동차·조선", long: false
  },
  {
    key: "defense-industry",
    label: "방위산업·무기 수출",
    words: ["방산", "무기 수출", "미사일", "전투기", "잠수함", "defense industry"],
    context: ["수출", "수주", "계약", "방산업체", "방위산업", "매출", "실적", "공급", "defense", "contract", "export", "order"],
    cat: "industry", sector: "방산·항공우주", long: true
  },
  {
    key: "shipbuilding",
    label: "조선·해운 산업",
    words: ["조선업", "조선사", "선박", "lng선", "해운", "운임", "shipbuilding", "shipping"],
    context: ["조선업", "조선사", "선박", "lng선", "해운", "운임", "수주", "선박 계약", "shipbuilding", "shipping", "freight"],
    cat: "industry", sector: "조선·해운", long: true
  },
  {
    key: "batteries",
    label: "전기차·배터리 산업",
    words: ["배터리", "전기차", "ev", "양극재", "음극재", "전고체", "battery", "electric vehicle"],
    context: ["배터리", "전기차", "ev", "양극재", "음극재", "전고체", "battery", "electric vehicle", "전기차 판매"],
    cat: "industry", sector: "2차전지·자동차", long: true
  },
  {
    key: "korea-company-earnings",
    label: "국내 기업 실적·사업 동향",
    words: ["영업이익", "순이익", "실적", "잠정실적", "어닝", "가이던스", "수주 계약", "earnings", "revenue", "profit", "guidance"],
    context: ["영업이익", "순이익", "실적", "잠정실적", "매출", "어닝", "가이던스", "수주 계약", "earnings", "revenue", "profit", "guidance"],
    cat: "industry", sector: "개별 기업", long: false
  },
  {
    key: "economic-policy",
    label: "정부 경제정책·규제",
    words: ["경제정책", "경제 대책", "세제 개편", "세금 정책", "예산안", "추경", "규제 완화", "규제 강화", "산업 정책", "경제 법안", "금융 정책", "tariff", "economic policy"],
    context: ["기업", "산업", "투자", "세금", "예산", "금융", "경제", "수출", "시장", "규제", "business", "industry", "investment", "economy"],
    cat: "korea", sector: "국내 기업·산업 전반", long: true
  },
  {
    key: "labor-supply",
    label: "노동·물류·공급망",
    words: ["파업", "노조", "물류 차질", "운송 중단", "항만 마비", "공급망 차질", "생산 중단", "공장 가동 중단", "strike", "supply chain disruption"],
    context: ["기업", "산업", "생산", "수출", "물류", "공장", "운송", "반도체", "자동차", "항만", "business", "industry", "production", "supply"],
    cat: "korea", sector: "제조·물류·수출", long: false
  },
  {
    key: "energy-policy",
    label: "전력·에너지 정책",
    words: ["전기요금", "전력 수급", "전력난", "에너지 정책", "원전 정책", "가스 공급", "전력망", "electricity prices", "energy policy"],
    context: ["전력", "에너지", "원전", "가스", "산업", "기업", "요금", "공급", "energy", "industry", "power"],
    cat: "geopolitics", sector: "전력·에너지·산업", long: true
  }
];



// ------------------------------------------------------------
// 5. 금융 문맥 우선 판별 필터
// 스포츠 비유는 허용하고 실제 스포츠·연예·생활 기사는 제외
// ------------------------------------------------------------

// 스포츠 기사임을 판단하는 구체적인 표현
// 홈런, 역전, 에이스 등 비유적으로 쓰이는 단어는 단독 차단하지 않음
const SPORTS_STRONG_TERMS = [
  "프로야구", "한국시리즈", "kbo", "mlb", "메이저리그",
  "프로축구", "k리그", "프리미어리그", "챔피언스리그",
  "프로농구", "nba", "프로배구", "올림픽",
  "축구 국가대표", "축구 대표팀",
  "골프 대회", "골퍼", "골프 투어", "kpga", "klpga", "pga 투어",
  "테니스 대회", "배드민턴 대회",
  "야구 경기", "축구 경기", "농구 경기", "배구 경기",
  "투수", "포수", "타자", "타율", "방어율",
  "삼진", "타석", "이닝", "득점왕",
  "선발 투수", "마운드", "홈런왕",
  "컷 통과", "라운드", "퍼팅", "버디", "이글",
  "우승 트로피", "경기 MVP",
  "선수 이적", "감독 경질", "경기 일정", "경기 결과"
];

// 스포츠 기사 특유의 문맥
const SPORTS_CONTEXT_TERMS = [
  "실점", "이닝", "타석", "삼진", "안타",
  "홈런", "타율", "방어율", "투구",
  "선발 등판", "마운드", "포수", "배터리",
  "득점", "골인", "페널티킥", "슈팅",
  "리바운드", "어시스트", "서브 에이스",
  "라운드 성적", "컷 탈락", "티샷",
  "주먹 맞대는", "경기 종료", "연장전",
  "세트 스코어", "결승 진출", "우승 확정"
];

// 연예·방송·유명인 중심 기사
const ENTERTAINMENT_TERMS = [
  "미녀골퍼", "미녀 배우", "여배우", "아이돌",
  "연예인", "배우 근황", "가수 근황",
  "화보 공개", "미모 공개", "미모 자랑",
  "몸매 공개", "일상 공개", "셀카 공개",
  "열애설", "결혼 발표", "이혼 소송",
  "드라마 출연", "영화 개봉", "예능 출연",
  "팬미팅", "콘서트", "음원 차트",
  "연예계", "방송인", "배우 변신"
];

// 생활·교통·일반 사건 기사
const GENERAL_LIFE_TERMS = [
  "지하철 민폐", "임산부석", "출근길 민폐",
  "시민 제보", "황당한 목격담",
  "층간소음", "주차 시비", "택시 승차 거부",
  "일상 속 논란", "온라인 커뮤니티 논란"
];

// 금융 관련성이 명확한 표현
// 기업, 산업, 투자, 시장, AI 같은 단어 하나만으로는 통과시키지 않음
const FINANCE_STRONG_TERMS = [
  // 증시·주식
  "증시", "주식시장", "주가", "코스피", "코스닥",
  "나스닥", "다우지수", "s&p 500", "s&p500",
  "시가총액", "시총", "상장", "상장폐지",
  "ipo", "공모주", "공매도", "순매수", "순매도",
  "외국인 매수", "기관 매수", "기관 순매수",
  "외국인 순매수", "거래대금", "거래량",
  "배당금", "배당수익률", "자사주 매입",
  "stock price", "stock market", "market cap",
  "shares", "equity", "nasdaq", "wall street",

  // 금리·채권·환율·경제지표
  "기준금리", "금리 인상", "금리 인하", "금리 동결",
  "국채금리", "채권금리", "국채 수익률",
  "미국채", "국채 발행", "채권시장",
  "원달러 환율", "달러원 환율", "환율",
  "원화 약세", "원화 강세", "달러 강세", "달러 약세",
  "cpi", "pce", "ppi", "gdp", "소비자물가",
  "생산자물가", "인플레이션", "물가 상승률",
  "실업률", "고용지표", "비농업 고용",
  "연준", "fomc", "파월 의장",
  "treasury yield", "bond yield",
  "interest rate", "inflation",

  // 기업 실적·재무
  "영업이익", "순이익", "당기순이익",
  "매출액", "매출 증가", "매출 감소",
  "잠정실적", "실적 발표", "실적 전망",
  "어닝 서프라이즈", "어닝 쇼크",
  "영업이익률", "순이익률", "영업손실",
  "실적 개선", "실적 부진", "실적 상향",
  "실적 하향", "가이던스",
  "수주 계약", "공급 계약", "대규모 수주",
  "인수합병", "기업공개", "사업 철수",
  "구조조정", "감원 계획", "파산 신청",
  "earnings", "revenue", "operating profit",
  "net income", "guidance", "merger",
  "acquisition", "bankruptcy",

  // 산업·기술·기업 투자
  "반도체", "hbm", "파운드리", "엔비디아",
  "삼성전자", "sk하이닉스", "반도체 수출",
  "반도체 장비", "반도체 공급",
  "인공지능 반도체", "ai칩", "ai chip",
  "데이터센터 투자", "gpu",
  "배터리 산업", "전기차 판매", "전기차 시장",
  "양극재", "음극재", "전고체 배터리",
  "조선업", "선박 수주", "lng선",
  "방산 수출", "방산 수주",
  "원전 수주", "원전 건설",
  "정유사", "국제유가", "원유 가격",
  "철강 가격", "화학 업황",
  "공장 증설", "생산라인 증설",
  "설비 투자", "시설 투자", "투자 규모",
  "시장 점유율", "기업 실적",
  "semiconductor", "chipmaker",
  "artificial intelligence", "battery industry",
  "electric vehicle", "shipbuilding",
  "defense exports", "data center",

  // 무역·경제정책
  "무역수지", "경상수지", "수출액", "수입액",
  "수출 증가", "수출 감소", "수출 통제",
  "무역 규제", "관세 부과", "미국 관세",
  "중국 관세", "무역 협상",
  "경제성장률", "경제 전망",
  "세제 개편", "금융 정책", "산업 정책",
  "전기요금 인상", "전기요금 인하",
  "공급망 차질", "생산 중단",
  "항만 물류", "해상 운임",
  "export", "trade balance", "tariff",
  "supply chain disruption"
];

// 규칙에 매칭되더라도 실제 금융·산업 근거가 있어야 통과
const RULE_SUPPORT_TERMS = [
  "금리", "환율", "국채", "채권", "물가",
  "연준", "fomc", "cpi", "pce", "gdp",
  "증시", "주식", "주가", "코스피", "코스닥",
  "나스닥", "상장", "배당", "공매도",
  "매출", "영업이익", "순이익", "실적",
  "수주", "공급 계약", "설비 투자",
  "반도체", "hbm", "파운드리",
  "삼성전자", "sk하이닉스", "엔비디아",
  "배터리 산업", "전기차 시장",
  "조선업", "선박 수주", "방산 수출",
  "원전 수주", "국제유가", "원유 가격",
  "무역수지", "경상수지", "수출액",
  "수출 통제", "관세 부과", "무역 규제",
  "공급망 차질", "전력 수급",
  "treasury", "bond yield", "earnings",
  "revenue", "profit", "stock market",
  "semiconductor", "trade balance"
];

function includesAny(text, words = []) {
  return words.some(word => text.includes(word.toLowerCase()));
}

function matchedRulesFor(article) {
  const text = `${article.title || ""} ${article.description || article.summary || ""}`.toLowerCase();

  return RULES
    .filter(rule =>
      includesAny(text, rule.words) &&
      includesAny(text, rule.context)
    )
    .map(rule => ({
      rule,
      score:
        rule.words.filter(w => text.includes(w.toLowerCase())).length +
        rule.context.filter(w => text.includes(w.toLowerCase())).length
    }))
    .sort((a, b) => b.score - a.score);
}

function isFinanceRelevant(article) {
  const title = String(article.title || "").toLowerCase();
  const description = String(
    article.description || article.summary || ""
  ).toLowerCase();

  const text = `${title} ${description}`;

  const hasFinanceSignal = includesAny(text, FINANCE_STRONG_TERMS);
  const hasRuleSupport = includesAny(text, RULE_SUPPORT_TERMS);
  const ruleMatches = matchedRulesFor(article);

  // 제목에 실제 스포츠 종목·경기 문맥이 명확한지 확인
  const sportsTitle =
    includesAny(title, SPORTS_STRONG_TERMS) ||
    (
      includesAny(title, ["선수", "감독", "경기", "우승"]) &&
      includesAny(text, SPORTS_CONTEXT_TERMS)
    );

  // 본문에도 스포츠 경기 기록·경기 진행 문맥이 있는지 확인
  const sportsContext = includesAny(text, SPORTS_CONTEXT_TERMS);

  const isSportsStory = sportsTitle || (
    sportsContext &&
    includesAny(text, SPORTS_STRONG_TERMS)
  );

  // 금융 관련 근거가 없는 실제 스포츠 기사는 제외
  // 단, 금융 문맥이 명확하면 스포츠 비유는 허용
  if (isSportsStory && !hasFinanceSignal) {
    return false;
  }

  // 연예·인물 화제는 금융 근거가 없으면 제외
  if (
    includesAny(text, ENTERTAINMENT_TERMS) &&
    !hasFinanceSignal
  ) {
    return false;
  }

  // 생활·교통·일반 사건 기사는 금융 근거가 없으면 제외
  if (
    includesAny(text, GENERAL_LIFE_TERMS) &&
    !hasFinanceSignal
  ) {
    return false;
  }

  // 구체적인 금융·경제·기업 관련 키워드가 있으면 통과
  if (hasFinanceSignal) {
    return true;
  }

  // 주요 이슈 규칙에 매칭된 경우에도 구체적인 근거가 필요
  if (ruleMatches.length > 0 && hasRuleSupport) {
    return true;
  }

  // 포괄적인 단어만 포함된 기사는 통과시키지 않음
  return false;
}



// ------------------------------------------------------------
// 6. 기사 방향성·중요도 판정
// ------------------------------------------------------------

const POSITIVE_PATTERNS = [
  /실적.{0,12}(개선|호조|상회|증가|급증)/,
  /(영업이익|순이익|매출|이익).{0,12}(증가|개선|급증|상회)/,
  /(흑자전환|흑자 전환|적자탈출|적자 탈출)/,
  /(실적|이익|매출|전망|가이던스).{0,12}(상향|상향조정)/,
  /(목표주가|목표가).{0,10}상향/,
  /(수주|공급|계약).{0,12}(확대|체결|확보|성공)/,
  /(주가|증시|코스피|코스닥|나스닥|지수).{0,12}(상승|급등|강세|반등)/,
  /(물가|인플레이션|cpi|pce).{0,12}(둔화|하락|완화)/,
  /(관세|제재|규제).{0,12}(철회|완화|유예)/,
  /(긴장|분쟁|전쟁).{0,12}(완화|휴전|합의)/,
  /(배당|자사주).{0,12}(확대|증가|매입)/,
  /(신용등급).{0,10}상향/,
  /(수출).{0,12}(증가|호조|개선)/,
  /(revenue|profit|earnings).{0,15}(growth|increase|beat|rise)/,
  /(raises|raised|upgrades|upgrade).{0,20}(forecast|guidance|target|rating)/,
  /(stocks|shares|index|market).{0,15}(rise|rally|gain|surge)/,
  /(inflation).{0,15}(eases|slows|cools|declines)/
];

const NEGATIVE_PATTERNS = [
  /실적.{0,12}(악화|부진|하회|감소|급감)/,
  /(영업이익|순이익|매출|이익).{0,12}(감소|악화|급감|하회)/,
  /(적자전환|적자 전환|적자확대|적자 확대)/,
  /(실적|이익|매출|전망|가이던스).{0,12}(하향|하향조정)/,
  /(목표주가|목표가).{0,10}하향/,
  /(수주|공급|계약).{0,12}(취소|중단|철회|감소)/,
  /(주가|증시|코스피|코스닥|나스닥|지수).{0,12}(하락|급락|약세|폭락)/,
  /(물가|인플레이션|cpi|pce).{0,12}(급등|상승|가속|악화)/,
  /(금리|국채금리|채권금리).{0,12}(인상|급등|상승)/,
  /(관세|제재|규제).{0,12}(강화|확대|부과)/,
  /(긴장|분쟁|전쟁).{0,12}(고조|확대|격화)/,
  /(수출).{0,12}(감소|부진|악화)/,
  /(신용등급).{0,10}(하향|강등)/,
  /(파산|부도|디폴트|상장폐지)/,
  /(revenue|profit|earnings).{0,15}(decline|drop|fall|miss|loss)/,
  /(cuts|cut|lowers|lowered|downgrades|downgrade).{0,20}(forecast|guidance|target|rating)/,
  /(stocks|shares|index|market).{0,15}(fall|drop|decline|selloff|plunge)/,
  /(inflation).{0,15}(rises|surges|accelerates)/,
  /(tariff|sanctions|restriction).{0,20}(imposed|expanded|increased|tightened)/
];

const HIGH_IMPORTANCE_TERMS = [
  "기준금리 결정", "fomc", "cpi", "pce", "금리 인상",
  "금리 인하", "실적 쇼크", "파산", "디폴트",
  "전쟁 확대", "공습", "긴급 제재", "관세 부과",
  "수출 통제", "사상 최대", "emergency", "breaking",
  "bankruptcy", "default", "rate decision", "rate hike",
  "rate cut"
];

function classify(article) {
  const title = String(article.title || "");
  const description = String(article.description || article.summary || "");
  const text = `${title} ${description}`.toLowerCase();

  const matchedRules = matchedRulesFor(article);
  const rule = matchedRules[0]?.rule || null;

  let category = rule?.cat || article.category;
  if (!CATEGORIES.includes(category)) category = "global";

  const positiveMatches = POSITIVE_PATTERNS.filter(re => re.test(text)).length;
  const negativeMatches = NEGATIVE_PATTERNS.filter(re => re.test(text)).length;

  let impact = "neutral";

  if (rule) {
    if (positiveMatches > negativeMatches && positiveMatches > 0) {
      impact = "positive";
    } else if (negativeMatches > positiveMatches && negativeMatches > 0) {
      impact = "negative";
    }
  }

  const high = rule && includesAny(text, HIGH_IMPORTANCE_TERMS);

  const importance = high
    ? "높음"
    : rule
      ? "보통"
      : "낮음";

  const horizon = rule?.long
    ? "장기"
    : (category === "macro" || category === "geopolitics" ? "중기" : "단기");

  const originalDescription = clean(description);

  let summary = originalDescription
    ? `${originalDescription} `
    : "기사 제목과 공개된 보도 내용을 바탕으로 자동 분류했습니다. ";

  if (!rule) {
    summary += "금융시장 관련 키워드는 확인됐으나 특정 주요 이슈 규칙에는 연결되지 않았습니다.";
  } else if (impact === "positive") {
    summary += "금융·기업 관련 긍정 신호가 확인됐습니다. 실제 시장 반응을 함께 확인해야 합니다.";
  } else if (impact === "negative") {
    summary += "금융·기업 관련 부정 신호가 확인됐습니다. 실제 시장 반응을 함께 확인해야 합니다.";
  } else {
    summary += "금융시장 관련 뉴스이나 방향성이 명확하지 않아 중립으로 분류했습니다.";
  }

  return {
    category,
    impact,
    importance,
    horizon,
    summary: summary.slice(0, 1800),
    rule
  };
}


// ------------------------------------------------------------
// 7. 기사 수집 및 중복 제거
// ------------------------------------------------------------

async function collect() {
  const all = [];
  const diagnostics = [];
  const seenUrls = new Set();
  const seenTitles = new Set();

  let rawArticles = 0;
  let filteredOut = 0;

  const batchSize = 6;

  for (let i = 0; i < FEEDS.length; i += batchSize) {
    const batch = FEEDS.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fetchFeed));

    for (const result of results) {
      diagnostics.push(result.diagnostic);

      for (const article of result.articles) {
        rawArticles++;

        if (!isFinanceRelevant(article)) {
          filteredOut++;
          continue;
        }

        const normalizedTitle = article.title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]/gu, "")
          .slice(0, 120);

        if (
          seenUrls.has(article.url) ||
          (normalizedTitle && seenTitles.has(normalizedTitle))
        ) continue;

        seenUrls.add(article.url);
        if (normalizedTitle) seenTitles.add(normalizedTitle);

        all.push(article);
      }
    }
  }

  all.sort((a, b) =>
    new Date(b.publishedAt) - new Date(a.publishedAt)
  );

  return {
    articles: all.slice(0, 150),
    diagnostics: {
      totalFeeds: FEEDS.length,
      successfulFeeds: diagnostics.filter(x => !x.error).length,
      failedFeeds: diagnostics.filter(x => x.error).length,
      rawArticles,
      filteredOut,
      financeArticles: all.length,
      errors: diagnostics.filter(x => x.error),
      feeds: diagnostics
    }
  };
}


// ------------------------------------------------------------
// 8. 브리핑 생성
// ------------------------------------------------------------

function makeBriefingFactors(rows) {
  const positive = [];
  const negative = [];
  const usedPositive = new Set();
  const usedNegative = new Set();
  const themes = new Map();

  for (const row of rows) {
    if (!isFinanceRelevant({
      title: row.title,
      description: row.summary || "",
      category: row.category
    })) continue;

    const result = classify({
      title: row.title,
      description: row.summary || "",
      category: row.category
    });

    if (!result.rule) continue;

    themes.set(result.rule.key, result.rule.label);

    if (result.impact === "positive" && !usedPositive.has(result.rule.key)) {
      positive.push(row.title);
      usedPositive.add(result.rule.key);
    }

    if (result.impact === "negative" && !usedNegative.has(result.rule.key)) {
      negative.push(row.title);
      usedNegative.add(result.rule.key);
    }

    if (positive.length >= 5 && negative.length >= 5) break;
  }

  return {
    positive: positive.slice(0, 5),
    negative: negative.slice(0, 5),
    themes: [...themes.values()]
  };
}

async function createBriefing(env, saved, now) {
  const recent = await env.DB.prepare(
    "SELECT title,summary,category,published_at FROM news ORDER BY published_at DESC LIMIT 300"
  ).all();

  const rows = (recent.results || []).filter(row =>
    isFinanceRelevant({
      title: row.title,
      description: row.summary || "",
      category: row.category
    })
  ).slice(0, 150);

  const factors = makeBriefingFactors(rows);

  const positive = factors.positive;
  const negative = factors.negative;
  const themes = factors.themes;

  const briefSummary = saved > 0
    ? `최근 새로 수집한 금융 관련 뉴스 ${saved}건을 반영했습니다. 주요 금융시장 주제 ${themes.length}개를 확인했으며, 스포츠·연예·일반 뉴스 등 투자와 관련성이 낮은 기사는 제외했습니다.`
    : `새로운 뉴스는 없지만 기존 금융 관련 뉴스 ${rows.length}건을 기준으로 브리핑을 다시 계산했습니다.`;

  const marketView =
    positive.length > negative.length
      ? "확인된 금융·기업 긍정 신호가 상대적으로 많습니다. 실제 가격 반응과 거래량을 확인하세요."
      : negative.length > positive.length
        ? "확인된 금융·기업 부정 신호가 상대적으로 많습니다. 지수·환율·금리·수급을 함께 확인하세요."
        : "긍정·부정 신호가 혼재하거나 방향성이 뚜렷하지 않습니다. 주요 지표와 실제 시장 반응을 확인하세요.";

  await env.DB.prepare(
    "INSERT INTO briefings(id,summary,positive_json,negative_json,market_view,created_at) VALUES(?,?,?,?,?,?)"
  ).bind(
    makeId(),
    briefSummary,
    JSON.stringify(positive),
    JSON.stringify(negative),
    marketView,
    now
  ).run();

  return {
    summary: briefSummary,
    positive,
    negative,
    marketView
  };
}


// ------------------------------------------------------------
// 9. 뉴스 수집 및 이슈 추적
// ------------------------------------------------------------

async function refresh(env) {
  const collected = await collect();
  const articles = collected.articles;
  const diagnostics = collected.diagnostics;

  if (!articles.length) {
    return {
      ok: false,
      message: "금융 관련 RSS 기사를 수집하지 못했습니다. 피드별 오류와 필터 결과를 확인하세요.",
      mode: "finance-rss",
      diagnostics
    };
  }

  const now = iso();
  let saved = 0;
  let linked = 0;
  let duplicates = 0;

  for (const article of articles) {
    const duplicate = await env.DB.prepare(
      "SELECT id FROM news WHERE url = ? LIMIT 1"
    ).bind(article.url).first();

    if (duplicate) {
      duplicates++;
      continue;
    }

    const result = classify(article);
    const newsId = makeId();
    const issueKey = result.rule?.key || null;

    await env.DB.prepare(
      "INSERT INTO news(id,title,summary,category,impact,importance,horizon,source,url,published_at,created_at,issue_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      newsId,
      article.title,
      result.summary,
      result.category,
      result.impact,
      result.importance,
      result.horizon,
      article.source,
      article.url,
      article.publishedAt,
      now,
      issueKey
    ).run();

    saved++;

    // 명확한 주요 이슈 규칙에 매칭된 기사만 추적
    if (issueKey && result.rule) {
      linked++;

      const rule = result.rule;

      const oldIssue = await env.DB.prepare(
        "SELECT issue_key,status,first_seen FROM issues WHERE issue_key = ?"
      ).bind(issueKey).first();

      const status = rule.long ? "long" : "active";

      const issueSummary =
        `${rule.label} 관련 최신 보도 '${article.title}'을(를) 반영했습니다. 기사 원문과 시장 반응을 함께 확인하세요.`;

      if (oldIssue) {
        await env.DB.prepare(
          "UPDATE issues SET title=?,summary=?,status=?,importance=?,horizon=?,sectors=?,updated_at=?,closed_at=NULL WHERE issue_key=?"
        ).bind(
          rule.label,
          issueSummary,
          status,
          result.importance,
          result.horizon,
          rule.sector,
          now,
          issueKey
        ).run();

      } else {
        await env.DB.prepare(
          "INSERT INTO issues(issue_key,title,summary,status,importance,horizon,sectors,first_seen,updated_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)"
        ).bind(
          issueKey,
          rule.label,
          issueSummary,
          status,
          result.importance,
          result.horizon,
          rule.sector,
          now,
          now
        ).run();
      }

      await env.DB.prepare(
        "INSERT INTO issue_updates(id,issue_key,news_id,note,created_at) VALUES(?,?,?,?,?)"
      ).bind(
        makeId(),
        issueKey,
        newsId,
        article.title,
        now
      ).run();
    }
  }

  const briefing = await createBriefing(env, saved, now);

  return {
    ok: true,
    articles: saved,
    duplicates,
    linkedIssues: linked,
    updatedAt: now,
    mode: "finance-rss",
    briefing: {
      positive: briefing.positive,
      negative: briefing.negative,
      marketView: briefing.marketView
    },
    diagnostics
  };
}


// ------------------------------------------------------------
// 10. API 응답용 기존 뉴스 필터
// 기존 D1에 저장된 스포츠·일반 기사도 화면에 노출하지 않음
// 기존 데이터 자체는 삭제하지 않음
// ------------------------------------------------------------

function mapNews(news) {
  return {
    id: news.id,
    title: news.title,
    summary: news.summary,
    category: news.category,
    impact: news.impact,
    importance: news.importance,
    horizon: news.horizon,
    source: news.source,
    url: news.url,
    publishedAt: news.published_at,
    createdAt: news.created_at
  };
}


// ------------------------------------------------------------
// 11. Worker API
// ------------------------------------------------------------

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return json({
        ok: true,
        service: "MARKET INSIGHT DAILY",
        mode: "finance-rss",
        version: "2026.11.10-history-cards-news-fallback-v6",
        feeds: FEEDS.length
      });
    }

    try {
      // Truth Social: Trump's Truth 독립 아카이브 RSS 단일 소스
      if (url.pathname === "/api/truth-social" && request.method === "GET") {
        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 50)));
        const feedUrl = "https://www.trumpstruth.org/feed?limit=" + limit;
        try {
          const r = await fetch(feedUrl, {
            headers: {
              "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
              "User-Agent": "Mozilla/5.0 (compatible; MARKET-INSIGHT-DAILY/1.0)",
              "Accept-Language": "en-US,en;q=0.9"
            },
            redirect: "follow",
            signal: AbortSignal.timeout(15000)
          });
          if (!r.ok) {
            return json({ items: [], error: `Trump's Truth RSS HTTP ${r.status}`, provider: "Trump's Truth RSS" }, 502);
          }
          const xml = await r.text();
          if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) {
            return json({ items: [], error: "Trump's Truth RSS 응답이 XML 피드 형식이 아닙니다.", provider: "Trump's Truth RSS" }, 502);
          }
          const items = parseFeed(xml, { category: "social", name: "Trump's Truth" })
            .slice(0, limit)
            .map(x => ({
              text: x.title,
              url: x.url,
              createdAt: x.publishedAt ? new Date(x.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""
            }))
            .filter(x => x.text && x.url);
          if (!items.length) {
            return json({ items: [], error: "Trump's Truth RSS에서 표시할 게시물을 찾지 못했습니다.", provider: "Trump's Truth RSS" }, 502);
          }
          return json({ items, updatedAt: iso(), provider: "Trump's Truth RSS" });
        } catch (e) {
          return json({ items: [], error: `Trump's Truth RSS 조회 실패: ${String(e?.message || e).slice(0, 120)}`, provider: "Trump's Truth RSS" }, 502);
        }
      }

      // 인물별 뉴스: 사용 가능한 뉴스 피드를 모두 모아 페이지 단위로 반환
      if (url.pathname === "/api/person-news" && request.method === "GET") {
        const query = String(url.searchParams.get("q") || "").trim().slice(0, 180);
        const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit") || 10)));
        const offset = Math.max(0, Math.min(500, Number(url.searchParams.get("offset") || 0)));
        if (!query) return json({ items: [], error: "검색어가 필요합니다." }, 400);

        const source = String(url.searchParams.get("source") || "global");
        const cacheKey = `${source}|${query.toLowerCase()}`;
        const now = Date.now();

        const cached = PERSON_NEWS_MEMORY_CACHE.get(cacheKey);
        if (cached && cached.expiresAt > now) {
          const all = cached.payload.items || [];
          return json({
            ...cached.payload,
            total: all.length,
            hasMore: offset + limit < all.length,
            items: all.slice(offset, offset + limit)
          }, 200, {
            "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
            "X-News-Cache": "HIT"
          });
        }


        // 금융기관 공식 검색 링크는 별도로 제공하고, 기사 목록은 복수 뉴스 RSS
        // 공급자를 통해 수집한다. 공식 사이트의 JS 렌더링/봇 차단과 검색 공급자 장애에 대비한다.
        if (source.startsWith("official-")) {
          const configs = {
            "official-goldman": {
              name: "Goldman Sachs",
              host: "goldmansachs.com",
              searchUrl: `https://www.goldmansachs.com/search?query=${encodeURIComponent(query)}`
            },
            "official-morgan": {
              name: "Morgan Stanley",
              host: "morganstanley.com",
              searchUrl: `https://www.morganstanley.com/search?text=${encodeURIComponent(query)}`
            },
          };
          const cfg = configs[source];
          if (!cfg) return json({items:[], total:0, hasMore:false, provider:"공식 홈페이지", error:"지원하지 않는 공식 검색 대상입니다."}, 400);

          // 단일 RSS 공급자 장애(503/timeout)에 영향을 받지 않도록 Yahoo, Bing, GDELT, Google을 병렬 조회하고
          // 첫 번째로 실제 기사 목록을 반환한 공급자를 사용한다. 검색은 발행 도메인 한정이 아니라 금융기관명+검색어로 수행한다.
          const searchTerm = `${cfg.name} ${query}`;
          const yahoo = new URL("https://news.search.yahoo.com/rss");
          yahoo.searchParams.set("p", searchTerm);
          const bing = new URL("https://www.bing.com/news/search");
          bing.searchParams.set("q", searchTerm); bing.searchParams.set("format", "rss"); bing.searchParams.set("setlang", "en-us");
          const gdelt = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
          gdelt.searchParams.set("query", `\"${cfg.name}\" ${query}`); gdelt.searchParams.set("mode", "ArtList");
          gdelt.searchParams.set("format", "RSS"); gdelt.searchParams.set("maxrecords", "75");
          gdelt.searchParams.set("sort", "datedesc"); gdelt.searchParams.set("timespan", "90d");
          const google = new URL("https://news.google.com/rss/search");
          google.searchParams.set("q", searchTerm); google.searchParams.set("hl", "en-US"); google.searchParams.set("gl", "US"); google.searchParams.set("ceid", "US:en");
          const providers = [
            {name:"Yahoo News", url:yahoo.toString()},
            {name:"Bing News", url:bing.toString()},
            {name:"GDELT", url:gdelt.toString()},
            {name:"Google News", url:google.toString()}
          ];
          const attempts = providers.map(async provider => {
            const response = await fetch(provider.url, {
              headers: {"User-Agent":"Mozilla/5.0 (compatible; MarketInsight/1.0)", "Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, */*", "Accept-Language":"en-US,en;q=0.9"},
              redirect:"follow"
            });
            if (!response.ok) throw new Error(`${provider.name} HTTP ${response.status}`);
            const xml = await response.text();
            if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error(`${provider.name} 응답이 RSS 형식이 아닙니다.`);
            const parsed = parseFeed(xml, {category:"global", name:cfg.name});
            const items = parsed.map(item => ({
              title: clean(item.title || "").replace(/\s+/g," ").trim(),
              url: validUrl(item.url),
              source: cfg.name,
              publishedAt: item.publishedAt || ""
            })).filter(item => item.title && item.title.length >= 8 && item.url);
            if (!items.length) throw new Error(`${provider.name} 기사 없음`);
            return {provider:provider.name, items};
          });
          let winner;
          const providerErrors = [];
          try { winner = await Promise.any(attempts); }
          catch (aggregate) {
            for (const error of (aggregate.errors || [])) providerErrors.push(String(error?.message || error));
          }
          const seen = new Set();
          const items = [];
          for (const item of (winner?.items || [])) {
            const key = item.url.split("?")[0] + "|" + item.title.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key); items.push(item);
          }
          items.sort((a,b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0));
          const payload = {
            items:items.slice(0,50),
            total:Math.min(items.length,50),
            provider:winner?.provider || cfg.name,
            officialSearchUrl:cfg.searchUrl,
            error:items.length ? null : `최근 기사를 찾지 못했습니다. 검색 공급자 응답: ${providerErrors.slice(0,4).join(" / ") || "검색 결과 없음"}`
          };
          // 전체 검색 결과를 캐시하고, 첫 요청부터 offset/limit 기준으로 나눠 반환합니다.
          if (items.length) PERSON_NEWS_MEMORY_CACHE.set(cacheKey, {payload, expiresAt:now + 3*60*1000});
          return json({
            ...payload,
            hasMore: offset + limit < payload.total,
            items: payload.items.slice(offset, offset + limit)
          }, 200, {"Cache-Control":items.length ? "public, max-age=60" : "no-store"});
        }

        const googleUrl = (locale) => {
          const settings = locale === "us"
            ? { hl: "en-US", gl: "US", ceid: "US:en" }
            : { hl: "en", gl: "GB", ceid: "GB:en" };
          const u = new URL("https://news.google.com/rss/search");
          u.searchParams.set("q", query);
          u.searchParams.set("hl", settings.hl);
          u.searchParams.set("gl", settings.gl);
          u.searchParams.set("ceid", settings.ceid);
          return u.toString();
        };
        const bingUrl = (korean = false) => {
          const u = new URL("https://www.bing.com/news/search");
          u.searchParams.set("q", query);
          u.searchParams.set("format", "RSS");
          if (korean) u.searchParams.set("setlang", "ko-KR");
          return u.toString();
        };

        const feeds = source === "naver" ? [
          // 첫 화면은 네이버 최신 검색 1페이지만 우선 조회한다.
          // 나머지 공급자는 병렬 경주로 가장 먼저 정상 결과를 주는 곳을 사용한다.
          (() => {
            const u = new URL("https://search.naver.com/search.naver");
            u.searchParams.set("where", "news");
            u.searchParams.set("query", query);
            u.searchParams.set("sort", "1");
            u.searchParams.set("start", "1");
            return { name: "NAVER 뉴스", url: u.toString(), kind: "naver-html" };
          })(),
          { name: "NAVER 뉴스 RSS", url: `https://rsshub.app/naver/news/search?keyword=${encodeURIComponent(query)}`, kind: "rss" },
          { name: "Bing 뉴스 한국어", url: bingUrl(true), kind: "rss" },
          { name: "Google News Korea", url: (() => {
            const u = new URL("https://news.google.com/rss/search");
            u.searchParams.set("q", query); u.searchParams.set("hl", "ko");
            u.searchParams.set("gl", "KR"); u.searchParams.set("ceid", "KR:ko");
            return u.toString();
          })(), kind: "rss" }
        ] : [
          { name: "Google News US", url: googleUrl("us") },
          { name: "Google News Global", url: googleUrl("global") },
          { name: "Google News Canada", url: (() => { const u = new URL("https://news.google.com/rss/search"); u.searchParams.set("q", query); u.searchParams.set("hl", "en-CA"); u.searchParams.set("gl", "CA"); u.searchParams.set("ceid", "CA:en"); return u.toString(); })() },
          { name: "Google News Australia", url: (() => { const u = new URL("https://news.google.com/rss/search"); u.searchParams.set("q", query); u.searchParams.set("hl", "en-AU"); u.searchParams.set("gl", "AU"); u.searchParams.set("ceid", "AU:en"); return u.toString(); })() },
          { name: "Bing News", url: bingUrl(false) },
          { name: "GDELT News", url: (() => { const u = new URL("https://api.gdeltproject.org/api/v2/doc/doc"); u.searchParams.set("query", query); u.searchParams.set("mode", "ArtList"); u.searchParams.set("format", "RSS"); u.searchParams.set("maxrecords", "250"); u.searchParams.set("sort", "datedesc"); u.searchParams.set("timespan", "30d"); return u.toString(); })() }
        ];

        // NAVER HTML 페이지는 위에서 6페이지를 직접 지정했다. RSS 공급자는 추가 페이지를 병렬 조회한다.
        const pagedFeeds = feeds.flatMap(feed => {
          if (feed.kind === "naver-html") return [feed];
          const extra = [2, 3].map(page => {
            const u = new URL(feed.url);
            if (feed.name === "NAVER 뉴스 RSS") return null; // RSSHub는 page 파라미터를 무시하는 경우가 있어 반복 호출하지 않음
            if (feed.name.startsWith("Google News")) u.searchParams.set("start", String((page - 1) * 10));
            else if (feed.name.startsWith("Bing News")) u.searchParams.set("first", String((page - 1) * 10 + 1));
            else return null;
            return { ...feed, url: u.toString(), page, kind: "rss" };
          }).filter(Boolean);
          return [{ ...feed, kind: feed.kind || "rss", page: 1 }, ...extra];
        });


        // 해외 뉴스는 모든 공급자의 응답을 기다리지 않고, 첫 번째로 정상 기사를 반환한
        // 공급자를 즉시 사용한다. 느린 공급자는 개별 타임아웃 후 취소한다.
        if (source !== "naver") {
          const fastFeeds = feeds.filter(feed => feed.kind !== "naver-html" && feed.name !== "NAVER 뉴스 RSS");
          const controllers = [];
          const tasks = fastFeeds.map(async feed => {
            const feedController = new AbortController();
            controllers.push(feedController);
            const timer = setTimeout(() => feedController.abort(), 6500);
            try {
              const response = await fetch(feed.url, {
                headers: {
                  "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
                  "User-Agent": "Mozilla/5.0 (compatible; MarketInsightNews/1.0)",
                  "Accept-Language": "en-US,en;q=0.9",
                  "Referer": "https://news.google.com/"
                },
                redirect: "follow", signal: feedController.signal
              });
              if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);
              const body = await response.text();
              if (!/<(?:rss|feed|rdf:RDF)\b/i.test(body)) {
                throw new Error(`${feed.name}: RSS 형식이 아닙니다.`);
              }
              const parsed = parseFeed(body, { category: "person", name: feed.name });
              const seen = new Set();
              const items = parsed.map(x => ({
                title: clean(x.title || "").replace(/\s+/g, " ").trim(),
                url: validUrl(x.url),
                source: x.source || feed.name,
                publishedAt: x.publishedAt
              })).filter(x => {
                if (!x.title || x.title.length < 8 || x.title.length > 260 || !x.url) return false;
                const key = x.url + "|" + x.title.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              if (!items.length) throw new Error(`${feed.name}: 기사 없음`);
              return { items, provider: feed.name };
            } finally {
              clearTimeout(timer);
            }
          });

          try {
            // 여러 뉴스 공급자의 결과를 합쳐 10개 단위로 반복해서 가져올 수 있게 합니다.
            const settled = await Promise.allSettled(tasks);
            const successful = settled.filter(result => result.status === "fulfilled").map(result => result.value);
            if (!successful.length) {
              const messages = settled.filter(result => result.status === "rejected")
                .map(result => String(result.reason?.message || result.reason)).filter(Boolean).join(" / ");
              throw new Error(messages || "뉴스 검색 공급자에서 결과를 받지 못했습니다.");
            }
            const merged = [];
            const seenUrls = new Set();
            const seenTitles = new Set();
            successful.forEach(result => result.items.forEach(item => {
              const urlKey = String(item.url || "").split("?")[0];
              const titleKey = String(item.title || "").toLowerCase().replace(/\s+/g," ").trim();
              if (!urlKey || seenUrls.has(urlKey) || seenTitles.has(titleKey)) return;
              seenUrls.add(urlKey); seenTitles.add(titleKey); merged.push(item);
            }));
            merged.sort((a, b) => {
              const da = a.publishedAt ? Date.parse(a.publishedAt) : 0;
              const db = b.publishedAt ? Date.parse(b.publishedAt) : 0;
              return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
            });
            const capped = merged.slice(0, 50);
            const providerNames = successful.map(result => result.provider).join(" + ");
            const payload = {
              items: capped, updatedAt: iso(), query, source,
              provider: providerNames
            };
            PERSON_NEWS_MEMORY_CACHE.set(cacheKey, { payload, expiresAt: Date.now() + 90000 });
            if (PERSON_NEWS_MEMORY_CACHE.size > 250) {
              for (const [key, value] of PERSON_NEWS_MEMORY_CACHE) {
                if (value.expiresAt <= Date.now()) PERSON_NEWS_MEMORY_CACHE.delete(key);
              }
              while (PERSON_NEWS_MEMORY_CACHE.size > 250) {
                PERSON_NEWS_MEMORY_CACHE.delete(PERSON_NEWS_MEMORY_CACHE.keys().next().value);
              }
            }
            return json({
              ...payload,
              total: capped.length,
              hasMore: offset + limit < capped.length,
              items: capped.slice(offset, offset + limit)
            }, 200, {
              "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
              "X-News-Cache": "MISS",
              "X-News-Provider": providerNames
            });
          } catch (aggregate) {
            controllers.forEach(c => c.abort());
            return json({
              items: [], total: 0, hasMore: false,
              error: String(aggregate?.message || aggregate).slice(0,700) || "뉴스 검색에 실패했습니다.",
              query, updatedAt: iso()
            }, 502, { "Cache-Control": "no-store" });
          }
        }

        // NAVER는 가장 먼저 정상 기사를 반환한 공급자를 사용해 지연을 줄인다.
        const naverFeeds = feeds;
        const naverControllers = [];
        const naverTasks = naverFeeds.map(async feed => {
          const ctl = new AbortController();
          naverControllers.push(ctl);
          const timer = setTimeout(() => ctl.abort(), 6500);
          try {
            const response = await fetch(feed.url, {
              headers: {
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/html, */*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
                "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
                "Referer": "https://search.naver.com/"
              },
              redirect: "follow", signal: ctl.signal
            });
            if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);
            const body = await response.text();
            const junkTitle = /(언론사\s*선정|언론사가\s*선정한|주요기사|심층기획|네이버뉴스\s*새창\s*열림|네이버\s*메인에서|구독하세요|로그인|이용약관|개인정보처리방침)/i;
            let parsed = [];
            if (feed.kind === "naver-html") {
              const anchors = body.match(/<a\b(?=[^>]*\bclass=["'][^"']*\bnews_tit\b[^"']*["'])[^>]*>[\s\S]*?<\/a>/gi) || [];
              parsed = anchors.map(anchor => {
                const href = anchor.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
                const titleAttr = anchor.match(/\btitle=["']([^"']+)["']/i)?.[1] || "";
                return { title: clean(titleAttr || anchor), url: validUrl(href), source: "NAVER 뉴스", publishedAt: null };
              });
            } else {
              if (!/<(?:rss|feed|rdf:RDF)\b/i.test(body)) throw new Error(`${feed.name}: RSS 형식이 아닙니다.`);
              parsed = parseFeed(body, { category: "person", name: feed.name });
            }
            const seen = new Set();
            const items = parsed.map(x => ({
              title: clean(x.title || "").replace(/\s+/g, " ").trim(),
              url: validUrl(x.url), source: x.source || feed.name, publishedAt: x.publishedAt
            })).filter(x => {
              if (!x.title || x.title.length < 8 || x.title.length > 260 || !x.url || junkTitle.test(x.title)) return false;
              const key = x.url + "|" + x.title.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key); return true;
            });
            if (!items.length) throw new Error(`${feed.name}: 기사 없음`);
            return { items, provider: feed.name };
          } finally { clearTimeout(timer); }
        });

        try {
          const winner = await Promise.any(naverTasks);
          naverControllers.forEach(c => c.abort());
          const merged = winner.items.sort((a, b) => {
            const da = a.publishedAt ? Date.parse(a.publishedAt) : 0;
            const db = b.publishedAt ? Date.parse(b.publishedAt) : 0;
            return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
          });
          const payload = { items: merged, updatedAt: iso(), query, source, provider: winner.provider };
          PERSON_NEWS_MEMORY_CACHE.set(cacheKey, { payload, expiresAt: Date.now() + 180000 });
          if (PERSON_NEWS_MEMORY_CACHE.size > 250) {
            for (const [key, value] of PERSON_NEWS_MEMORY_CACHE) if (value.expiresAt <= Date.now()) PERSON_NEWS_MEMORY_CACHE.delete(key);
            while (PERSON_NEWS_MEMORY_CACHE.size > 250) PERSON_NEWS_MEMORY_CACHE.delete(PERSON_NEWS_MEMORY_CACHE.keys().next().value);
          }
          return json({
            ...payload, total: merged.length, hasMore: offset + limit < merged.length,
            items: merged.slice(offset, offset + limit)
          }, 200, {
            "Cache-Control": "public, max-age=90, s-maxage=180, stale-while-revalidate=300",
            "X-News-Cache": "MISS", "X-News-Provider": winner.provider
          });
        } catch (aggregate) {
          naverControllers.forEach(c => c.abort());
          const messages = (aggregate.errors || []).map(e => String(e?.message || e)).filter(Boolean).join(" / ");
          return json({ items: [], total: 0, hasMore: false, error: messages.slice(0, 700) || "NAVER 뉴스 검색에 실패했습니다.", query, updatedAt: iso() }, 502, {
            "Cache-Control": "no-store"
          });
        }
      }

      // 브리핑 조회
      if (url.pathname === "/api/briefing" && request.method === "GET") {
        const briefing = await env.DB.prepare(
          "SELECT * FROM briefings ORDER BY created_at DESC LIMIT 1"
        ).first();

        return json({
          briefing: briefing ? {
            summary: briefing.summary,
            positive: JSON.parse(briefing.positive_json || "[]"),
            negative: JSON.parse(briefing.negative_json || "[]"),
            marketView: briefing.market_view,
            updatedAt: briefing.created_at
          } : null
        });
      }

      // 뉴스 조회
      // 기존 데이터 중 금융 관련성이 없는 기사는 응답에서 제외
      if (url.pathname === "/api/news" && request.method === "GET") {
        const limit = Math.min(
          150,
          Math.max(1, Number(url.searchParams.get("limit") || 50))
        );

        const category = url.searchParams.get("category");

        // 기존 저장 자료도 필터링해야 하므로 요청 limit보다 넉넉히 조회
        const query = await env.DB.prepare(
          "SELECT * FROM news ORDER BY published_at DESC LIMIT 600"
        ).all();

        const items = (query.results || [])
          .filter(news => {
            const relevant = isFinanceRelevant({
              title: news.title,
              description: news.summary || "",
              category: news.category
            });

            if (!relevant) return false;
            if (category && news.category !== category) return false;

            return true;
          })
          .slice(0, limit)
          .map(mapNews);

        return json({ items });
      }

      // 이슈 조회
      if (url.pathname === "/api/issues" && request.method === "GET") {
        const status = url.searchParams.get("status") || "active";

        const query = status === "closed"
          ? await env.DB.prepare(
              "SELECT * FROM issues WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 100"
            ).all()
          : status === "all"
            ? await env.DB.prepare(
                "SELECT * FROM issues WHERE status != 'closed' ORDER BY updated_at DESC LIMIT 100"
              ).all()
            : await env.DB.prepare(
                "SELECT * FROM issues WHERE status IN ('active','long') ORDER BY updated_at DESC LIMIT 100"
              ).all();

        const items = (query.results || [])
          .filter(issue => {
            return isFinanceRelevant({
              title: issue.title,
              description: issue.summary || "",
              category: "korea"
            });
          })
          .map(issue => ({
            title: issue.title,
            summary: issue.summary,
            status: issue.status,
            importance: issue.importance,
            horizon: issue.horizon,
            sectors: issue.sectors,
            updatedAt: issue.updated_at,
            closedAt: issue.closed_at
          }));

        return json({ items });
      }

      // RSS 수동 갱신
      if (url.pathname === "/api/refresh" && request.method === "POST") {
        if (
          !env.ADMIN_TOKEN ||
          request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`
        ) {
          return json({ error: "Unauthorized" }, 401);
        }

        return json(await refresh(env));
      }

      return json({ error: "Not found" }, 404);

    } catch (error) {
      return json({
        error: String(error?.message || error)
      }, 500);
    }
  },

  // 예약된 자동 갱신
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refresh(env));
  }
};

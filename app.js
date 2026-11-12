
const API_BASE = "https://macro.mcraft-tiger-574.workers.dev";

const CATEGORY_NAMES = {
  all: "전체 뉴스",
  global: "미국·글로벌 증시",
  macro: "금리·환율·경제",
  geopolitics: "지정학·원자재",
  korea: "국내 증시·정책",
  industry: "산업·기업"
};

const state = {
  category: "all",
  status: "active",
  news: [],
  issues: [],
  archive: [],
  archiveLoaded: false,
  dashboardLoaded: false,
  dashboardLoading: null,
  offset: 0,
  limit: 12
};

const $ = id => document.getElementById(id);

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

function dateText(v) {
  if (!v) return "업데이트 정보 없음";
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function toast(s) {
  const t = $("toast");
  t.textContent = s;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2300);
}

async function api(path, options = {}) {
  const r = await fetch(`${API_BASE}/api/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!r.ok) throw new Error(`서버 응답 ${r.status}`);
  return r.json();
}

function renderBriefing(b, issueCount = 0) {
  $("briefingStatus").textContent = b?.updatedAt
    ? `업데이트 ${dateText(b.updatedAt)}`
    : "브리핑 준비 중";

  $("briefingSummary").textContent = b?.summary ||
    "아직 등록된 브리핑이 없습니다. Worker와 데이터베이스를 연결한 뒤 뉴스 수집을 실행하세요.";

  $("positiveList").innerHTML = (b?.positive || [])
    .map(x => `<li>${esc(x)}</li>`)
    .join("") || "<li>확인된 주요 긍정 요인이 없습니다.</li>";

  $("negativeList").innerHTML = (b?.negative || [])
    .map(x => `<li>${esc(x)}</li>`)
    .join("") || "<li>확인된 주요 부정 요인이 없습니다.</li>";

  $("marketView").textContent = b?.marketView ||
    "뉴스와 시장 변수 종합 분석";

  $("eventCount").textContent = `주요 이슈 ${issueCount}건`;
}

function renderNews() {
  const list = state.news.filter(n =>
    state.category === "all" || n.category === state.category
  );

  $("newsTitle").textContent = CATEGORY_NAMES[state.category];
  $("newsCount").textContent = `${list.length}건`;

  if (!list.length) {
    $("newsList").innerHTML =
      '<div class="empty">해당 카테고리에 등록된 뉴스가 없습니다.</div>';
    $("moreNews").hidden = true;
    return;
  }

  $("newsList").innerHTML = list
    .slice(0, state.limit)
    .map(n => {
      const url = safeHttpUrl(n.url);

      const title = url
        ? `<a class="news-title-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>`
        : esc(n.title);

      const originalLink = url
        ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>`
        : "";

      return `
        <article class="news-item">
          <div class="news-meta">
            <span class="tag">${esc(CATEGORY_NAMES[n.category] || "시장 뉴스")}</span>
            <span class="impact ${esc(n.impact || "neutral")}">
              ${n.impact === "positive" ? "긍정" : n.impact === "negative" ? "부정" : "중립"}
            </span>
            <span>${esc(n.importance || "보통")}</span>
            <span>· ${dateText(n.publishedAt || n.createdAt)}</span>
          </div>

          <h3>${title}</h3>

          <p>${esc(n.summary || "")}</p>

          <div class="news-foot">
            <span>${esc(n.source || "출처 미상")} · ${esc(n.horizon || "단기")}</span>
            ${originalLink}
          </div>
        </article>
      `;
    })
    .join("");

  $("moreNews").hidden = list.length <= state.limit;
}

function renderIssues() {
  let items = state.issues;

  if (state.status === "long") {
    items = items.filter(i => i.status === "long");
  }

  $("issueCount").textContent = `${items.length}개`;

  if (!items.length) {
    $("issueList").innerHTML =
      '<div class="empty">현재 추적 중인 이슈가 없습니다.</div>';
    return;
  }

  $("issueList").innerHTML = items.map(i => `
    <article class="issue-card">
      <div class="issue-top">
        <h3>${esc(i.title)}</h3>
        <span class="issue-state ${i.status === "long" ? "long" : ""}">
          ${i.status === "long" ? "장기 추적" : "진행 중"}
        </span>
      </div>

      <p>${esc(i.summary || "")}</p>

      <div class="issue-details">
        <span>최근 업데이트 <strong>${dateText(i.updatedAt)}</strong></span>
        <span>중요도 <strong>${esc(i.importance || "보통")}</strong></span>
        <span>영향 기간 <strong>${esc(i.horizon || "중기")}</strong></span>
        ${i.sectors ? `<span>관련 분야 <strong>${esc(i.sectors)}</strong></span>` : ""}
      </div>
    </article>
  `).join("");
}

function renderArchive() {
  if (!state.archive.length) {
    $("archiveList").innerHTML =
      '<div class="empty">종료된 이슈가 없습니다.</div>';
    return;
  }

  $("archiveList").innerHTML = state.archive.map(i => `
    <article class="archive-item">
      <b>${esc(i.title)}</b>
      <p>
        ${esc(i.summary || "")} · 종료
        ${dateText(i.closedAt || i.updatedAt)}
      </p>
    </article>
  `).join("");
}

async function load() {
  try {
    const [data, news, issues] = await Promise.all([
      api("briefing"),
      api("news?limit=100"),
      api("issues?status=active")
    ]);

    renderBriefing(data.briefing, issues.items?.length || 0);

    state.news = news.items || [];
    state.issues = issues.items || [];

    $("updatedAt").textContent = data.briefing?.updatedAt
      ? `최근 업데이트 ${dateText(data.briefing.updatedAt)}`
      : "데이터 연결 완료";

    $("dateLabel").textContent = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(new Date());

    renderNews();
    renderIssues();
    state.dashboardLoaded = true;

  } catch (e) {
    $("updatedAt").textContent = "서버 연결 필요";
    $("briefingStatus").textContent = "연결 대기";

    $("briefingSummary").textContent =
      "뉴스 데이터 서버가 아직 연결되지 않았습니다. README의 Cloudflare Worker 및 D1 설정을 완료하면 자동으로 표시됩니다.";

    state.news = [];
    state.issues = [];
    state.dashboardLoaded = false;

    renderNews();
    renderIssues();

    toast("데이터 서버에 연결할 수 없습니다.");
  }
}

$("categoryNav").addEventListener("click", e => {
  const b = e.target.closest("[data-category]");
  if (!b) return;

  document.querySelectorAll(".category").forEach(x => {
    x.classList.toggle("active", x === b);
  });

  state.category = b.dataset.category;
  state.limit = 12;
  renderNews();
});

document.querySelectorAll(".issue-filter").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".issue-filter").forEach(x => {
      x.classList.toggle("active", x === b);
    });

    state.status = b.dataset.status;
    renderIssues();
  });
});

$("moreNews").addEventListener("click", () => {
  state.limit += 12;
  renderNews();
});

$("archiveToggle").addEventListener("click", () => {
  const box = $("archiveList");
  box.hidden = !box.hidden;
  $("archiveToggle").textContent = box.hidden
    ? "종료 이슈 보기⌄"
    : "종료 이슈 접기⌃";
  if (!box.hidden && !state.archiveLoaded) {
    box.innerHTML = '<div class="empty">종료 이슈를 불러오는 중입니다.</div>';
    api("issues?status=closed").then(data => {
      state.archive = data.items || []; state.archiveLoaded = true; renderArchive();
    }).catch(() => { box.innerHTML = '<div class="empty">종료 이슈를 불러오지 못했습니다.</div>'; });
  }
});

$("refreshBtn").addEventListener("click", async () => {
  const b = $("refreshBtn");
  b.disabled = true;
  b.textContent = "…";

  state.dashboardLoaded = false;
  await load();

  b.disabled = false;
  b.textContent = "↻";
});

// 대시보드 데이터는 실제 탭을 열 때 요청해 첫 화면의 네트워크 작업을 줄입니다.

// 명암(다크/라이트) 전환
$("themeBtn").addEventListener("click", () => {
  const d = document.documentElement.classList.toggle("dark");
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = d ? "#151a22" : "#f4f6fa";
  try { localStorage.setItem("theme_v1", d ? "dark" : "light"); } catch (e) {}
});


/* ===== 인물 모니터 + 영향력 있는 인물: 단일 앱 스크립트 ===== */

(() => {
  const people = [
    {name:"도널드 트럼프",country:"미국",role:"미국 대통령",group:"정책·거시",impact:"관세·대중국 정책·재정·에너지·외교 정책을 통해 글로벌 교역과 위험자산 선호에 직접적인 변동성을 줄 수 있습니다.",watch:"관세 발표, 대중국 제재, 감세·재정정책, 지정학적 발언",query:"Donald Trump markets tariffs policy"},
    {name:"스콧 베선트",country:"미국",role:"재무장관",group:"정책·거시",impact:"미국 국채 발행·재정·달러 정책과 금융시장 안정 관련 발언이 금리와 달러 흐름에 영향을 줍니다.",watch:"국채 발행 계획, 재정적자, 달러·환율 발언, 금융시장 대응",query:"Scott Bessent Treasury markets"},
    {name:"제이미슨 그리어",country:"미국",role:"무역정책 책임자",group:"정책·거시",impact:"무역협상과 관세 정책의 구체화 과정에서 반도체·자동차·배터리·산업재 공급망에 영향을 줄 수 있습니다.",watch:"국가별 관세, 무역협상, 수출통제·원산지 규정",query:"Jamieson Greer trade tariffs"},
    {name:"하워드 러트닉",country:"미국",role:"상무장관",group:"정책·거시",impact:"수출통제·산업정책·반도체 및 첨단기술 관련 규제 변화가 글로벌 기술기업과 공급망에 영향을 줍니다.",watch:"반도체 수출통제, 산업 보조금, 대중국 기술 규제",query:"Howard Lutnick commerce semiconductor"},
    {name:"시진핑",country:"중국",role:"중국 국가주석",group:"정책·거시",impact:"중국 경기부양·부동산·산업정책·대외관계가 중국 소비와 제조업, 원자재 및 한국 수출에 영향을 줍니다.",watch:"경기부양책, 부동산 지원, 미중 관계, 첨단산업 정책",query:"Xi Jinping China economy markets stimulus"},
    {name:"케빈 워시",country:"미국",role:"통화정책 핵심 인물",group:"중앙은행",impact:"연준의 금리 경로와 대차대조표 정책에 대한 견해가 달러·미국채 금리·글로벌 유동성 기대를 움직일 수 있습니다.",watch:"금리 전망, 연준 독립성, 대차대조표·유동성 관련 발언",query:"Kevin Warsh Federal Reserve rates"},
    {name:"리사 쿡",country:"미국",role:"연준 인사",group:"중앙은행",impact:"고용·물가·금리 판단에 관한 발언과 연준 내 정책 기류를 파악하는 데 참고할 인물입니다.",watch:"인플레이션 평가, 고용시장, 금리 인하·동결 신호",query:"Lisa Cook Federal Reserve speech"},
    {name:"크리스토퍼 월러",country:"미국",role:"연준 인사",group:"중앙은행",impact:"경제지표 해석과 금리 경로에 대한 발언이 연준 정책 기대와 단기 금리에 영향을 줄 수 있습니다.",watch:"물가·고용 데이터 해석, 금리 경로, 금융여건",query:"Christopher Waller Fed speech rates"},
    {name:"베스 해맥",country:"미국",role:"클리블랜드 연은 총재",group:"중앙은행",impact:"지역 연은 총재의 금리·물가 발언은 FOMC 내부의 매파·비둘기파 기류를 읽는 단서가 됩니다.",watch:"금리 인하 속도, 물가 지속성, 고용 둔화 평가",query:"Beth Hammack Fed speech"},
    {name:"토머스 바킨",country:"미국",role:"리치먼드 연은 총재",group:"중앙은행",impact:"물가와 경기의 균형에 대한 발언이 연준 정책 기대에 영향을 줍니다.",watch:"서비스 물가, 임금, 소비·고용, 정책금리",query:"Thomas Barkin Fed speech"},
    {name:"우에다 가즈오",country:"일본",role:"일본은행 총재",group:"중앙은행",impact:"일본 금리 정상화와 엔화 흐름, 엔 캐리 트레이드 청산 가능성을 통해 글로벌 위험자산에 영향을 줍니다.",watch:"금리 인상 시점, 임금·물가, 국채매입, 엔화",query:"Kazuo Ueda BOJ yen rates"},
    {name:"크리스틴 라가르드",country:"유럽연합",role:"ECB 총재",group:"중앙은행",impact:"유럽 금리와 유로화, 유럽 경기 전망을 좌우하며 글로벌 채권·환율시장에 영향을 줍니다.",watch:"ECB 금리 결정, 임금·서비스 물가, 경기 전망",query:"Christine Lagarde ECB rates"},
    {name:"제이미 다이먼",country:"미국",role:"J.P.Morgan CEO",group:"투자·자금",impact:"미국 은행권·신용시장·소비·경기 위험에 대한 발언이 금융주와 시장 심리에 영향을 줍니다.",watch:"신용 위험, 경기침체 경고, 은행 규제, 소비자 건전성",query:"Jamie Dimon market outlook economy"},
    {name:"래리 핑크",country:"미국",role:"BlackRock CEO",group:"투자·자금",impact:"글로벌 자금 흐름과 기관투자자 관점, 채권·주식·대체투자 수요를 읽는 데 중요합니다.",watch:"ETF 자금 유입·유출, 채권 수요, AI·인프라 투자",query:"Larry Fink BlackRock markets flows"},
    {name:"스탠리 드러켄밀러",country:"미국",role:"투자자",group:"투자·자금",impact:"거시경제와 유동성, 자산가격에 대한 견해가 기관투자자 심리와 테마 투자에 영향을 줄 수 있습니다.",watch:"달러·금리·재정적자, 주식 밸류에이션, 포지션 변화",query:"Stanley Druckenmiller markets interview"},
    {name:"빌 애크먼",country:"미국",role:"Pershing Square 창립자",group:"투자·자금",impact:"집중 투자와 공개 캠페인, 거시 전망을 통해 개별 기업 및 시장 심리에 영향을 줍니다.",watch:"공개 투자 의견, 기업 지배구조 캠페인, 금리 전망",query:"Bill Ackman markets investment"},
    {name:"데이비드 테퍼",country:"미국",role:"Appaloosa 창립자",group:"투자·자금",impact:"위험자산과 중국·미국 주식에 대한 투자 관점이 헤지펀드 자금 흐름의 참고 신호가 됩니다.",watch:"중국 주식, 기술주, 신용시장, 위험자산 비중",query:"David Tepper markets China stocks"},
    {name:"캐시 우드",country:"미국",role:"ARK Invest CEO",group:"투자·자금",impact:"혁신기술·성장주 투자심리와 테마별 자금 흐름을 파악하는 데 참고할 수 있습니다.",watch:"AI·로봇·자율주행·바이오 투자, ETF 자금 흐름",query:"Cathie Wood ARK investment AI"},
    {name:"마이클 버리",country:"미국",role:"투자자",group:"투자·자금",impact:"시장 과열·밸류에이션·신용 위험에 대한 경고가 투자심리와 변동성 논의에 영향을 줍니다.",watch:"공개 포지션, 밸류에이션 경고, 신용·부동산 위험",query:"Michael Burry market warning"},
    {name:"하워드 막스",country:"미국",role:"Oaktree 공동창립자",group:"투자·자금",impact:"신용 사이클과 위험 프리미엄에 대한 분석이 채권·하이일드·위험자산 판단에 유용합니다.",watch:"신용 스프레드, 부실채권, 시장 사이클, 위험 선호",query:"Howard Marks Oaktree memo credit markets"},
    {name:"마크 미너비니",country:"미국",role:"전문 트레이더·투자 교육자",group:"투자·자금",impact:"SEPA(특정 진입점 분석)와 추세·모멘텀 기반 성장주 매매 전략으로 알려져 있으며, 강세장 주도주와 시장 추세에 대한 관점을 파악하는 데 참고할 수 있습니다.",watch:"SEPA 전략, 추세 템플릿, 주도주·모멘텀 종목, 손절·리스크 관리, 시장 국면 분석",query:"Mark Minervini SEPA stock market trading"},
    {name:"젠슨 황",country:"미국",role:"NVIDIA CEO",group:"기술·기업",impact:"AI 가속기 수요와 데이터센터 투자 사이클을 대표하며 GPU·HBM·네트워크·전력 관련 공급망에 큰 영향을 줍니다.",watch:"GPU 수요·공급, 차세대 제품, 데이터센터 투자, 중국 수출",query:"Jensen Huang Nvidia AI demand"},
    {name:"샘 올트먼",country:"미국",role:"OpenAI CEO",group:"기술·기업",impact:"AI 모델·서비스 확장과 데이터센터 투자 계획이 AI 인프라와 소프트웨어 생태계의 기대를 움직입니다.",watch:"모델 출시, 컴퓨팅 투자, 데이터센터·전력 계약, 수익화",query:"Sam Altman OpenAI AI infrastructure"},
    {name:"사티아 나델라",country:"미국",role:"Microsoft CEO",group:"기술·기업",impact:"클라우드·AI 서비스의 매출화와 설비투자 규모가 빅테크 실적 및 AI 투자 사이클의 핵심 지표입니다.",watch:"Azure 성장률, AI 매출, CAPEX, 기업용 AI 수요",query:"Satya Nadella Microsoft AI earnings"},
    {name:"순다르 피차이",country:"미국",role:"Alphabet CEO",group:"기술·기업",impact:"검색·광고·클라우드·AI 전략 변화가 플랫폼 기업의 경쟁구도와 광고시장에 영향을 줍니다.",watch:"검색 사업 변화, Gemini, 클라우드 성장, AI CAPEX",query:"Sundar Pichai Google AI strategy"},
    {name:"마크 저커버그",country:"미국",role:"Meta CEO",group:"기술·기업",impact:"AI 추천·광고 효율·메타버스 및 AI 인프라 투자 규모가 플랫폼·반도체 기업에 영향을 줍니다.",watch:"광고 성장, AI 투자액, Llama, 설비투자·수익성",query:"Mark Zuckerberg Meta AI capex"},
    {name:"일론 머스크",country:"미국",role:"Tesla·SpaceX 경영자",group:"기술·기업",impact:"전기차·자율주행·로봇·우주산업의 사업 전략과 발언이 관련 기업 및 성장주 심리에 영향을 줍니다.",watch:"테슬라 판매·마진, 자율주행, 로보택시, 우주·AI 사업",query:"Elon Musk Tesla markets business"},
    {name:"리사 수",country:"미국",role:"AMD CEO",group:"기술·기업",impact:"AI 가속기와 서버 CPU 경쟁력, 공급망 및 고객사 수요가 반도체 업황의 중요한 단서입니다.",watch:"AI GPU 매출, 데이터센터 실적, 공급능력, 경쟁사 점유율",query:"Lisa Su AMD AI data center"},
    {name:"숀 킴",country:"미국",role:"글로벌 금융·시장 분석가",group:"투자·자금",impact:"글로벌 금융시장과 한국 증시에 대한 해외 투자자·기관의 시각을 파악하는 참고 인물입니다.",watch:"한국 증시 전망, 외국인 수급, 글로벌 자금 흐름, 미국 금융기관의 한국 시장 분석",query:"Sean Kim global markets Korea stocks"}
  ];

  const INITIAL_PEOPLE = people.map(p => ({...p}));
  const initialKevin = INITIAL_PEOPLE.findIndex(p => p.name === "케빈 워시");
  if (initialKevin >= 0) { const [p] = INITIAL_PEOPLE.splice(initialKevin, 1); INITIAL_PEOPLE.splice(Math.min(2, INITIAL_PEOPLE.length), 0, p); }
  const initialUeda = INITIAL_PEOPLE.findIndex(p => p.name === "우에다 가즈오");
  if (initialUeda >= 0) { const [p] = INITIAL_PEOPLE.splice(initialUeda, 1); INITIAL_PEOPLE.push(p); }
  const STORAGE_KEY = "marketInsightPeople_v1";
  const defaultPeople = new Set(people.map(p => p.name));
  let deletedPeople = [];
  let savedOrder = [];
  const now = () => Date.now();
  const purgeExpired = () => { deletedPeople = deletedPeople.filter(item => item && item.person && Number(item.deletedAt) + 30*86400000 > now()); };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (Array.isArray(saved)) {
      saved.forEach(p => { if (p && p.name && !people.some(x => x.name === p.name)) people.push(p); });
    } else {
      (Array.isArray(saved.added) ? saved.added : []).forEach(p => { if (p && p.name && !people.some(x => x.name === p.name)) people.push(p); });
      if (Array.isArray(saved.deleted)) deletedPeople = saved.deleted;
      else if (Array.isArray(saved.removed)) {
        // 이전 버전의 삭제 기록(이름만 저장)을 복구 가능한 항목으로 변환
        deletedPeople = saved.removed.map(name => ({person: people.find(p => p.name === name), deletedAt: now()})).filter(x => x.person);
      }
      savedOrder = Array.isArray(saved.order) ? saved.order : [];
    }
  } catch (_) {}
  purgeExpired();
  // 이전 버전의 삭제 처리로 목록에서 빠진 기본 인물도 복구함에 보존
  const deletedNames = new Set(deletedPeople.map(x => x.person && x.person.name));
  people.splice(0, people.length, ...people.filter(p => !deletedNames.has(p.name)));
  if (savedOrder.length) {
    const byName = new Map(people.map(p => [p.name, p]));
    const ordered = savedOrder.map(n => byName.get(n)).filter(Boolean);
    people.forEach(p => { if (!savedOrder.includes(p.name)) ordered.push(p); });
    people.splice(0, people.length, ...ordered);
  }
  // 요청한 초기 배치: 케빈 워시를 세 번째에 둠
  const kevinIndex = people.findIndex(p => p.name === "케빈 워시");
  if (kevinIndex >= 0) { const [kevin] = people.splice(kevinIndex, 1); people.splice(Math.min(2, people.length), 0, kevin); }
  // 우에다 가즈오는 저장된 사용자 정렬보다 우선해 항상 마지막에 배치
  const uedaIndex = people.findIndex(p => p.name === "우에다 가즈오");
  if (uedaIndex >= 0) { const [ueda] = people.splice(uedaIndex, 1); people.push(ueda); }
  const savePeople = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
      deleted: deletedPeople,
      added: people.filter(p => !defaultPeople.has(p.name)),
      order: people.map(p => p.name)
    })); } catch (_) {}
  };
  savePeople();
  // 해외 뉴스/전체 기사 검색에는 인물 이름만 전달한다(분야·보조 키워드 제외).
  const overseasNames = {
    "도널드 트럼프":"Donald Trump", "스콧 베선트":"Scott Bessent", "제이미슨 그리어":"Jamieson Greer",
    "하워드 러트닉":"Howard Lutnick", "시진핑":"Xi Jinping", "케빈 워시":"Kevin Warsh",
    "리사 쿡":"Lisa Cook", "크리스토퍼 월러":"Christopher Waller", "베스 해맥":"Beth Hammack",
    "토머스 바킨":"Thomas Barkin", "우에다 가즈오":"Kazuo Ueda", "크리스틴 라가르드":"Christine Lagarde",
    "제이미 다이먼":"Jamie Dimon", "래리 핑크":"Larry Fink", "스탠리 드러켄밀러":"Stanley Druckenmiller",
    "빌 애크먼":"Bill Ackman", "데이비드 테퍼":"David Tepper", "캐시 우드":"Cathie Wood",
    "마이클 버리":"Michael Burry", "하워드 막스":"Howard Marks", "마크 미너비니":"Mark Minervini",
    "젠슨 황":"Jensen Huang", "샘 올트먼":"Sam Altman", "사티아 나델라":"Satya Nadella",
    "순다르 피차이":"Sundar Pichai", "마크 저커버그":"Mark Zuckerberg", "일론 머스크":"Elon Musk", "리사 수":"Lisa Su", "숀 킴":"Sean Kim"
  };
  const newsQuery = p => overseasNames[p.name] || String(p.query || p.name).trim().split(/\s+/).slice(0, 2).join(" ");

  const influence = {
    "도널드 트럼프":"S", "스콧 베선트":"S", "제이미슨 그리어":"A", "하워드 러트닉":"A", "시진핑":"S",
    "케빈 워시":"S", "리사 쿡":"A", "크리스토퍼 월러":"A", "베스 해맥":"B", "토머스 바킨":"B",
    "우에다 가즈오":"S", "크리스틴 라가르드":"S", "제이미 다이먼":"S", "래리 핑크":"S",
    "스탠리 드러켄밀러":"A", "빌 애크먼":"B", "데이비드 테퍼":"B", "캐시 우드":"B", "마이클 버리":"B", "하워드 막스":"A", "마크 미너비니":"A",
    "젠슨 황":"S", "샘 올트먼":"A", "사티아 나델라":"A", "순다르 피차이":"A", "마크 저커버그":"A", "일론 머스크":"S", "리사 수":"A"
  };
  const gradeText = {S:"글로벌 핵심 변수", A:"높은 영향력", B:"분야별 영향력", C:"제한적 영향력", D:"낮은 영향력"};
  const root=document.getElementById("peopleCards");
  if(!root) return;
  const form=document.getElementById("personForm");
  const addBtn=document.getElementById("addPersonBtn");
  const cancelBtn=document.getElementById("cancelPersonBtn");
  const toggleDeleteBtn=document.getElementById("toggleDeletePeopleBtn");
  const resetPeopleBtn=document.getElementById("resetPeopleBtn");
  let deleteMode=false;
  let filter="all";
  const search=document.getElementById("peopleSearch");
  const count=document.getElementById("peopleCount");
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const loadedNews = new Set();
  const loadingNews = new Set();
  // 같은 검색어/페이지는 60초 동안 재사용하고, 동시에 발생한 중복 요청은 하나로 합칩니다.
  const personNewsClientCache = new Map();
  const personNewsInFlight = new Map();
  const newsOffsets = new WeakMap();
  const newsItems = new WeakMap();
  const newsProviders = new WeakMap();
  const newsVisibleCounts = new WeakMap();
  const newsHasMore = new WeakMap();
  const newsExpanded = new WeakSet();
  const truthState = { items: [], shown: 0, loading: false, loaded: false };
  // 날짜는 대시보드 데이터 로딩 여부와 관계없이 항상 한국시간으로 표시합니다.
  const updateKoreaDate = () => {
    const dateLabel = document.getElementById("dateLabel");
    if (!dateLabel) return;
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short"
    }).formatToParts(now).reduce((out, part) => (out[part.type] = part.value, out), {});
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    // 대한민국 주요 법정공휴일 및 설·추석 연휴(대체공휴일 포함)
    const koreanHolidays = new Set([
      "2025-01-01","2025-01-28","2025-01-29","2025-01-30","2025-03-01","2025-03-03","2025-05-05","2025-05-06","2025-06-06","2025-08-15","2025-10-03","2025-10-05","2025-10-06","2025-10-07","2025-10-08","2025-10-09","2025-12-25",
      "2026-01-01","2026-05-01","2026-02-16","2026-02-17","2026-02-18","2026-03-01","2026-03-02","2026-05-05","2026-05-24","2026-05-25","2026-06-06","2026-08-15","2026-08-17","2026-09-24","2026-09-25","2026-09-26","2026-10-03","2026-10-05","2026-10-09","2026-12-25",
      "2027-01-01","2027-05-01","2027-02-05","2027-02-06","2027-02-07","2027-03-01","2027-05-05","2027-05-13","2027-06-06","2027-08-15","2027-09-14","2027-09-15","2027-09-16","2027-10-03","2027-10-04","2027-10-09","2027-12-25",
      "2028-01-01","2028-05-01","2028-01-25","2028-01-26","2028-01-27","2028-03-01","2028-05-02","2028-05-05","2028-06-06","2028-08-15","2028-10-02","2028-10-03","2028-10-04","2028-10-09","2028-12-25",
      "2029-01-01","2029-05-01","2029-02-12","2029-02-13","2029-02-14","2029-03-01","2029-05-05","2029-05-07","2029-06-06","2029-08-15","2029-09-21","2029-09-22","2029-09-23","2029-10-03","2029-10-09","2029-12-25",
      "2030-01-01","2030-05-01","2030-02-02","2030-02-03","2030-02-04","2030-03-01","2030-05-05","2030-05-06","2030-06-06","2030-08-15","2030-09-11","2030-09-12","2030-09-13","2030-10-03","2030-10-09","2030-12-25"
    ]);
    const weekday = parts.weekday;
    const isSunday = weekday === "Sun";
    const isSaturday = weekday === "Sat";
    dateLabel.classList.remove("date-holiday", "date-saturday", "date-weekday");
    dateLabel.classList.add(koreanHolidays.has(key) || isSunday ? "date-holiday" : isSaturday ? "date-saturday" : "date-weekday");
    dateLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short"
    }).format(now);
  };
  updateKoreaDate();
  const restoreRoot = document.getElementById("deletedPeopleList");
  const fmtDate = value => new Date(value).toLocaleString("ko-KR", {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  function renderDeleted(){
    purgeExpired();
    if (!restoreRoot) return;
    restoreRoot.innerHTML = deletedPeople.length ? deletedPeople.map((item, i) => {
      const deadline = Number(item.deletedAt) + 30*86400000;
      const days = Math.max(0, Math.ceil((deadline-now())/86400000));
      return `<div class="deleted-person-row"><div class="deleted-person-info"><b>${esc(item.person.name)}</b><small>삭제: ${fmtDate(item.deletedAt)} · 자동 영구 삭제: ${fmtDate(deadline)} · 남은 기간 ${days}일</small></div><div class="deleted-person-actions"><button type="button" data-restore="${i}">복구</button><button type="button" class="permanent" data-permanent="${i}">영구 삭제</button></div></div>`;
    }).join("") : '<p class="deleted-empty">복구할 인물이 없습니다.</p>';
    restoreRoot.querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', () => {
      const item = deletedPeople[Number(btn.dataset.restore)]; if (!item) return;
      if (people.some(p => p.name === item.person.name)) { alert("이미 목록에 있는 인물입니다."); return; }
      people.push(item.person); deletedPeople.splice(Number(btn.dataset.restore), 1); savePeople(); render(); renderDeleted();
    }));
    restoreRoot.querySelectorAll('[data-permanent]').forEach(btn => btn.addEventListener('click', () => {
      const i = Number(btn.dataset.permanent), item = deletedPeople[i]; if (!item) return;
      if (!confirm(`${item.person.name}을(를) 영구 삭제할까요? 삭제 후에는 복구할 수 없습니다.`)) return;
      deletedPeople.splice(i, 1); savePeople(); renderDeleted();
    }));
  }
  function render(){
    const q=(search.value||"").trim().toLowerCase();
    const rows=people.filter(p=>(filter==="all"||p.group===filter)&&(!q||[p.name,p.country,p.role,p.group,p.impact,p.watch].join(" ").toLowerCase().includes(q)));
    count.textContent=rows.length+"명";
    const quickNav=document.getElementById("peopleQuickNav");
    const peopleGroups=[
      {key:"정책·거시",title:"01. 정책·거시"},
      {key:"중앙은행",title:"02. 중앙은행"},
      {key:"투자·자금",title:"03. 투자·자금"},
      {key:"기술·기업",title:"04. 기술·기업"}
    ];
    if(quickNav){
      quickNav.innerHTML=peopleGroups.map(group=>{
        const members=people.filter(person=>person.group===group.key);
        const links=members.map(person=>{
          const index=people.findIndex(item=>item.name===person.name)+1;
          return `<a class="ws-keyword-link" href="#person-card-${index}" data-jump-person="${esc(person.name)}">${esc(person.name)}</a>`;
        }).join('<span class="ws-toc-dot"> · </span>');
        return `<div class="ws-toc-category"><div class="ws-toc-title"><strong>${group.title}</strong></div><div class="ws-toc-keywords">${links||'<span class="person-toc-empty">-</span>'}</div></div>`;
      }).join("");
      quickNav.querySelectorAll("[data-jump-person]").forEach(link=>link.addEventListener("click",event=>{
        event.preventDefault();
        const name=link.dataset.jumpPerson;
        let target=[...root.querySelectorAll(".person-card")].find(card=>card.dataset.person===name);
        if(!target){
          if(search) search.value="";
          filter="all";
          document.querySelectorAll(".people-filter").forEach(button=>button.classList.toggle("active",button.dataset.pfilter==="all"));
          render();
          target=[...root.querySelectorAll(".person-card")].find(card=>card.dataset.person===name);
        }
        if(target){
          target.classList.add('is-expanded');
          target.querySelector('.person-heading')?.setAttribute('aria-expanded','true');
          if(name === '도널드 트럼프') loadTruthSocial();
          observeNews();
          target.scrollIntoView({behavior:"smooth",block:"start"});
          target.classList.add("person-card-highlight");window.setTimeout(()=>target.classList.remove("person-card-highlight"),1400);
        }
      }));
    }
    root.innerHTML=rows.map(p=>{
      const legacyGrade=/^[SABCD]$/.test(String(p.impact||"").trim())?String(p.impact).trim():"";
      const grade=p.influenceGrade||legacyGrade||influence[p.name]||"B";
      const impactText=legacyGrade?"":(p.impact||"");
      const overseasName = newsQuery(p);
      return `<article class="person-card" id="person-card-${people.findIndex(item=>item.name===p.name)+1}" data-person="${esc(p.name)}" draggable="${window.matchMedia && window.matchMedia("(min-width: 900px)").matches}"><div class="person-card-top"><div class="person-heading"><div class="person-name-line"><h3>${esc(p.name)}</h3><div class="person-card-badges"><span class="person-sector">${esc(p.group)}</span><span class="influence-grade grade-${grade}" title="${gradeText[grade]}">인물 영향력 ${grade}</span></div></div><div class="person-meta">${esc(p.country)} · ${esc(p.role)}</div></div><button class="person-delete-btn" type="button" data-delete="${esc(p.name)}" aria-label="${esc(p.name)} 삭제">삭제</button></div><p class="person-impact">${esc(impactText)}</p><div class="person-watch"><b>체크할 뉴스</b><br>${esc(p.watch)}</div>${p.name==="도널드 트럼프"?`<section class="truth-posts"><div class="person-news-head truth-posts-head"><a class="truth-brand-link" href="https://www.trumpstruth.org/" target="_blank" rel="noopener noreferrer" aria-label="Trump’s Truth 사이트 열기"><img src="https://www.trumpstruth.org/img/logo.svg" alt="Trump’s Truth"></a><span>최신순</span></div><div class="truth-post-list"><div class="person-news-state">최신 게시물을 불러오는 중…</div></div></section>`:""}<section class="person-news" data-query="${esc(overseasName)}" data-source="global"><div class="person-news-head"><b>최근 기사 [해외]</b><span class="person-news-actions"><a class="person-news-search-link" href="https://news.google.com/search?q=${encodeURIComponent(overseasName)}&hl=en-US&gl=US&ceid=US%3Aen" target="_blank" rel="noopener noreferrer">전체 기사 보기 ↗</a><span>최신순</span></span></div><div class="person-news-list"><div class="person-news-state">화면에 표시되면 최신 기사를 불러옵니다.</div></div><button type="button" class="person-news-more" data-news-more disabled>기사 10개 더 보기</button></section><section class="person-news" data-query="${esc(p.name)}" data-source="naver"><div class="person-news-head"><b>최근 기사 [NAVER]</b><span class="person-news-actions"><a class="person-news-search-link" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(p.name)}&sort=1" target="_blank" rel="noopener noreferrer">전체 기사 보기 ↗</a><span>최신순</span></span></div><div class="person-news-list"><div class="person-news-state">화면에 표시되면 최신 기사를 불러옵니다.</div></div><button type="button" class="person-news-more" data-news-more disabled>기사 10개 더 보기</button></section></article>`;
    }).join("")||'<div class="empty">검색 조건에 맞는 인물이 없습니다.</div>';
    root.querySelectorAll('.person-card').forEach(card => {
      const heading = card.querySelector('.person-heading');
      if (heading) {
        heading.classList.add('person-heading-toggle');
        heading.setAttribute('role', 'button');
        heading.setAttribute('tabindex', '0');
        heading.setAttribute('aria-expanded', card.classList.contains('is-expanded') ? 'true' : 'false');
      }
    });
    root.querySelectorAll("[data-delete]").forEach(button => {
      button.hidden = !deleteMode;
      button.addEventListener("click", () => {
      const name = button.dataset.delete;
      if (!confirm(name + " 인물을 목록에서 삭제할까요?")) return;
      const index = people.findIndex(p => p.name === name);
      if (index >= 0) {
        const [person] = people.splice(index, 1);
        deletedPeople.push({person, deletedAt: now()});
        savePeople();
        render(); renderDeleted();
      }
      });
    });
    let dragged = null;
    root.querySelectorAll('.person-card[draggable="true"]').forEach(card => {
      card.addEventListener('dragstart', e => { dragged = card.dataset.person; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragged = null; });
      card.addEventListener('dragover', e => { if (dragged && dragged !== card.dataset.person) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
      card.addEventListener('drop', e => {
        e.preventDefault(); if (!dragged || dragged === card.dataset.person) return;
        const from = people.findIndex(p => p.name === dragged), to = people.findIndex(p => p.name === card.dataset.person);
        if (from < 0 || to < 0) return;
        const [moved] = people.splice(from, 1); people.splice(to, 0, moved); savePeople(); render();
      });
    });
    observeNews();
  }

  if (!root.dataset.expandHandlerReady) {
    root.dataset.expandHandlerReady = '1';
    const togglePersonCard = heading => {
      const card = heading?.closest('.person-card');
      if (!card) return;
      const open = !card.classList.contains('is-expanded');
      card.classList.toggle('is-expanded', open);
      heading.setAttribute('aria-expanded', String(open));
      if (open) {
        if (card.dataset.person === '도널드 트럼프') loadTruthSocial();
        observeNews();
      }
    };
    root.addEventListener('click', event => {
      const heading = event.target.closest('.person-heading-toggle');
      if (!heading || !root.contains(heading) || event.target.closest('a,button')) return;
      togglePersonCard(heading);
    });
    root.addEventListener('keydown', event => {
      const heading = event.target.closest('.person-heading-toggle');
      if (!heading || !root.contains(heading) || !['Enter',' '].includes(event.key)) return;
      event.preventDefault(); togglePersonCard(heading);
    });
  }

  async function loadTruthSocial(){
    const card=root.querySelector('[data-person="도널드 트럼프"] .truth-post-list');
    if(!card || truthState.loading) return;
    if(truthState.loaded){renderTruthPosts(card);return;}
    truthState.loading=true;
    try{
      const response=await fetch("https://macro.mcraft-tiger-574.workers.dev/api/truth-social?limit=50",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"게시물을 불러오지 못했습니다.");
      truthState.items=Array.isArray(data.items)?data.items:[];
      truthState.loaded=true;
      renderTruthPosts(card);
    }catch(error){card.innerHTML='<div class="person-news-state">Truth Social 게시물을 불러오지 못했습니다. '+esc(error.message||"네트워크 오류")+'</div><button class="person-news-retry" type="button">다시 불러오기</button>';card.querySelector("button").addEventListener("click",()=>{truthState.loading=false;loadTruthSocial();});}
    finally{truthState.loading=false;}
  }
  function renderTruthPosts(card){
    const shown=truthState.shown===0?5:truthState.shown;
    const items=truthState.items.slice(0,shown);
    card.innerHTML=items.length?items.map((post,i)=>`<a class="person-news-item truth-post-item" href="${esc(post.url)}" target="_blank" rel="noopener noreferrer"><span class="person-news-number">${i+1}</span><span class="person-news-copy"><b>${esc(post.text)}</b><small>${esc(post.createdAt||"Truth Social")}</small></span><span class="person-news-arrow">↗</span></a>`).join(""):'<div class="person-news-state">표시할 공개 게시물이 없습니다.</div>';
    if(truthState.items.length>shown){const more=document.createElement("button");more.type="button";more.className="person-news-more";more.textContent="게시물 10개 더 보기";more.addEventListener("click",()=>{truthState.shown=shown+10;renderTruthPosts(card);});card.appendChild(more);}
    truthState.shown=shown;
  }

  function renderNewsItems(section){
    const list=section.querySelector('.person-news-list');
    const more=section.querySelector('[data-news-more]');
    if(!list) return;
    const items=newsItems.get(section)||[];
    const visibleCount=newsVisibleCounts.get(section)||3;
    const visible=items.slice(0,visibleCount);
    list.querySelectorAll('.person-news-item').forEach(el=>el.remove());
    list.querySelectorAll('.person-news-state').forEach(el=>el.remove());
    const html=visible.map((item,i)=>{
      const date=item.publishedAt?new Date(item.publishedAt):null;
      const dateText=date&&!Number.isNaN(date.getTime())?date.toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}):'';
      return `<a class="person-news-item" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span class="person-news-number">${i+1}</span><span class="person-news-copy"><b>${esc(item.title)}</b><small>${esc(item.source||newsProviders.get(section)||'뉴스')}${dateText?' · '+dateText:''}</small></span><span class="person-news-arrow">↗</span></a>`;
    }).join('');
    list.insertAdjacentHTML('afterbegin',html);
    if(loadingNews.has(section)){
      const state=document.createElement('div');state.className='person-news-state';state.textContent=items.length?'기사를 더 불러오는 중…':'최신 기사를 불러오는 중…';list.appendChild(state);
    } else if(!items.length && loadedNews.has(section)){
      const state=document.createElement('div');state.className='person-news-state';state.textContent='최근 기사를 찾지 못했습니다.';list.appendChild(state);
    }
    if(more){
      if(newsExpanded.has(section)){
        more.hidden=false;
        more.disabled=false;
        more.textContent='전체 기사 검색';
        more.setAttribute('data-news-all', '');
      } else {
        more.removeAttribute('data-news-all');
        const hasHiddenItems=visible.length<items.length;
        const canFetchMore=newsHasMore.get(section)!==false;
        // 결과가 적거나 서버가 hasMore=false를 반환해도 버튼을 숨기지 않습니다.
        // 첫 클릭은 현재 확보된 기사를 펼치고, 이후에는 전체 검색 결과 버튼으로 전환합니다.
        more.hidden=false;
        more.disabled=loadingNews.has(section)||!loadedNews.has(section);
        more.textContent='기사 10개 더 보기';
      }
    }
  }

  async function fetchPersonNewsData(url, cacheKey){
    const now=Date.now();
    const cached=personNewsClientCache.get(cacheKey);
    if(cached && cached.expiresAt>now) return cached.data;
    if(cached) personNewsClientCache.delete(cacheKey);
    if(personNewsInFlight.has(cacheKey)) return personNewsInFlight.get(cacheKey);
    const task=(async()=>{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),12000);
      try{
        const response=await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json'},cache:'force-cache'});
        const data=await response.json();
        if(!response.ok) throw new Error(data.error||('뉴스 서버 응답 오류 (HTTP '+response.status+')'));
        if(data.error && (!Array.isArray(data.items)||!data.items.length)) throw new Error(data.error);
        personNewsClientCache.set(cacheKey,{data,expiresAt:Date.now()+60000});
        if(personNewsClientCache.size>120){
          for(const [key,value] of personNewsClientCache){if(value.expiresAt<=Date.now()) personNewsClientCache.delete(key);}
          while(personNewsClientCache.size>120) personNewsClientCache.delete(personNewsClientCache.keys().next().value);
        }
        return data;
      } finally {clearTimeout(timeout);}
    })();
    personNewsInFlight.set(cacheKey,task);
    try{return await task;}finally{if(personNewsInFlight.get(cacheKey)===task) personNewsInFlight.delete(cacheKey);}
  }

  async function loadNews(section){
    if(!section || loadingNews.has(section) || newsHasMore.get(section) === false) return;
    loadingNews.add(section);
    const list=section.querySelector('.person-news-list');
    const offset=Number(newsOffsets.get(section)||0);
    list.querySelectorAll('.person-news-retry').forEach(el=>el.remove());
    if(offset===0) list.innerHTML='<div class="person-news-state">최신 기사를 불러오는 중…</div>';
    else { const state=document.createElement('div');state.className='person-news-state';state.textContent='기사를 더 불러오는 중…';list.appendChild(state); }
    renderNewsItems(section);
    let requestSucceeded=false;
    try{
      const source=section.dataset.source||'global';
      const query=String(section.dataset.query||'').trim();
      const url='https://macro.mcraft-tiger-574.workers.dev/api/person-news?q='+encodeURIComponent(query)+'&source='+encodeURIComponent(source)+'&limit=10&offset='+offset;
      const requestKey=source+'|'+query.toLocaleLowerCase()+'|10|'+offset;
      const data=await fetchPersonNewsData(url,requestKey);
      const incoming=Array.isArray(data.items)?data.items:[];
      if(data.provider && !newsProviders.has(section)) newsProviders.set(section,data.provider);
      const existing=newsItems.get(section)||[];
      const seenUrls=new Set(existing.map(x=>x.url));
      const seenTitles=new Set(existing.map(x=>String(x.title||'').toLowerCase().replace(/\s+/g,' ').trim()));
      const fresh=incoming.filter(x=>{
        if(!x || !x.url || !x.title || seenUrls.has(x.url)) return false;
        const title=String(x.title).toLowerCase().replace(/\s+/g,' ').trim();
        if(seenTitles.has(title)) return false;
        seenUrls.add(x.url); seenTitles.add(title); return true;
      });
      const merged=existing.concat(fresh).sort((a,b)=>{
        const da=a.publishedAt?Date.parse(a.publishedAt):0;
        const db=b.publishedAt?Date.parse(b.publishedAt):0;
        return (Number.isFinite(db)?db:0)-(Number.isFinite(da)?da:0);
      });
      newsItems.set(section,merged);
      newsOffsets.set(section,offset+incoming.length);
      newsHasMore.set(section, typeof data.hasMore === 'boolean' ? data.hasMore : (typeof data.total === 'number' ? offset+incoming.length < data.total : incoming.length >= 10));
      loadedNews.add(section);
      list.querySelectorAll('.person-news-state,.person-news-retry').forEach(el=>el.remove());
      if(!incoming.length) newsHasMore.set(section,false);
      requestSucceeded=true;
      renderNewsItems(section);
    }catch(error){
      const reason=error&&error.name==='AbortError'?'요청 시간이 초과됐습니다.':(error&&error.message?error.message:'네트워크 연결을 확인해 주세요.');
      if(offset===0) list.innerHTML='<div class="person-news-state">최근 기사를 불러오지 못했습니다. '+esc(reason)+'<br>Cloudflare Worker의 최신 버전이 배포되어 있는지 확인해 주세요.</div>';
      else { list.querySelectorAll('.person-news-state').forEach(el=>el.remove()); const state=document.createElement('div');state.className='person-news-state';state.textContent='추가 기사를 불러오지 못했습니다: '+reason;list.appendChild(state); }
      const retry=document.createElement('button');retry.type='button';retry.className='person-news-retry';retry.textContent='다시 불러오기';retry.addEventListener('click',()=>{loadingNews.delete(section);loadNews(section);});list.appendChild(retry);
    }finally{
      loadingNews.delete(section);
      if(requestSucceeded) renderNewsItems(section);
      else {
        const more=section.querySelector('[data-news-more]');
        if(more) more.disabled=!loadedNews.has(section);
      }
    }
  }

  let newsObserver=null;
  function observeNews(){
    if(newsObserver) newsObserver.disconnect();
    const sections=[...document.querySelectorAll(".person-news:not([data-custom-id])")].filter(section=>{
      const term=section.closest('#panel-wall-street .wall-street-term, #panel-stock-essentials .wall-street-term');
      if (term && !term.classList.contains('is-expanded')) return false;
      const globalGroup=section.closest('#panel-global-perspective .global-market-group');
      if (globalGroup && !globalGroup.classList.contains('is-expanded')) return false;
      const personCard=section.closest('#panel-people-live .person-card');
      if (personCard && !personCard.classList.contains('is-expanded')) return false;
      return true;
    });
    if("IntersectionObserver" in window){
      newsObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){loadNews(entry.target);newsObserver.unobserve(entry.target);}}),{rootMargin:"250px 0px"});
      sections.forEach(section=>{if(!loadedNews.has(section))newsObserver.observe(section);});
    }else sections.forEach(loadNews);
  }
  window.refreshPersonNewsObserver = observeNews;

  // 글로벌 코리아 인사이트: 주제를 펼친 경우에만 해당 주제의 뉴스 요청
  const globalPanel = document.getElementById('panel-global-perspective');
  if (globalPanel && !globalPanel.dataset.expandHandlerReady) {
    globalPanel.dataset.expandHandlerReady = '1';
    const setGlobalHeading = group => {
      const heading = group?.querySelector(':scope > .global-market-heading');
      if (!heading) return;
      heading.setAttribute('role','button');
      heading.setAttribute('tabindex','0');
      heading.setAttribute('aria-expanded', group.classList.contains('is-expanded') ? 'true' : 'false');
      heading.classList.add('global-market-heading-toggle');
    };
    globalPanel.querySelectorAll('.global-market-group').forEach(setGlobalHeading);
    const toggleGlobalGroup = (group, forceOpen = null) => {
      if (!group) return;
      const open = forceOpen === null ? !group.classList.contains('is-expanded') : !!forceOpen;
      group.classList.toggle('is-expanded', open);
      group.querySelector(':scope > .global-market-heading')?.setAttribute('aria-expanded',String(open));
      if (open) observeNews();
    };
    globalPanel.addEventListener('click', event => {
      const toc = event.target.closest('.global-toc-link');
      if (toc && globalPanel.contains(toc)) {
        const id = decodeURIComponent((toc.getAttribute('href') || '').replace(/^#/,''));
        const group = id ? document.getElementById(id) : null;
        if (group && globalPanel.contains(group)) {
          event.preventDefault(); toggleGlobalGroup(group,true);
          group.scrollIntoView({behavior:'smooth',block:'start'});
        }
        return;
      }
      const heading = event.target.closest('.global-market-heading-toggle');
      if (heading && globalPanel.contains(heading) && !event.target.closest('a,button')) toggleGlobalGroup(heading.closest('.global-market-group'));
    });
    globalPanel.addEventListener('keydown', event => {
      const heading = event.target.closest('.global-market-heading-toggle');
      if (!heading || !globalPanel.contains(heading) || !['Enter',' '].includes(event.key)) return;
      event.preventDefault(); toggleGlobalGroup(heading.closest('.global-market-group'));
    });
    // 사용자가 추가한 항목도 동일한 접기/펼치기 동작을 사용
    const groupObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches?.('.global-market-group')) setGlobalHeading(node);
      node.querySelectorAll?.('.global-market-group').forEach(setGlobalHeading);
    })));
    groupObserver.observe(globalPanel.querySelector('.global-perspective-groups') || globalPanel,{childList:true,subtree:true});
  }

  // One delegated handler powers "기사 10개 더 보기" in all three news tabs,
  // including cards created dynamically by either keyword manager.
  if (!window.__allNewsMoreHandlerInstalled) {
    window.__allNewsMoreHandlerInstalled = true;
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-news-more]');
      if (!button) return;
      const section = button.closest('.person-news');
      if (!section || loadingNews.has(section) || !loadedNews.has(section)) return;
      if (newsExpanded.has(section)) {
        const source=section.dataset.source||'global';
        const query=section.dataset.query||'';
        let href;
        if(source==='official-goldman') href='https://www.goldmansachs.com/search?query='+encodeURIComponent(query);
        else if(source==='official-morgan') href='https://www.morganstanley.com/search?text='+encodeURIComponent(query);
        else if(source==='naver') href='https://search.naver.com/search.naver?where=news&query='+encodeURIComponent(query)+'&sort=1';
        else href='https://news.google.com/search?q='+encodeURIComponent(query)+'&hl=en-US&gl=US&ceid=US%3Aen';
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      const currentVisible = newsVisibleCounts.get(section) || 3;
      const targetVisible = currentVisible + 10;
      const items = newsItems.get(section) || [];
      // 확보된 기사가 부족하면 다음 offset을 먼저 가져온 뒤 펼친다.
      // 요청 중 중복 클릭을 막고, 새 기사가 도착하면 최대 10개를 추가 노출한다.
      if (items.length < targetVisible && newsHasMore.get(section) !== false) {
        newsVisibleCounts.set(section, targetVisible);
        (async () => {
          // 한 번의 응답이 10개 미만이어도 목표 노출 수(기본 3개 + 10개)에
          // 도달하거나 서버가 더 이상 결과가 없다고 할 때까지 다음 페이지를 이어 받습니다.
          while ((newsItems.get(section) || []).length < targetVisible &&
                 newsHasMore.get(section) !== false &&
                 !loadingNews.has(section)) {
            const before = (newsItems.get(section) || []).length;
            await loadNews(section);
            const after = (newsItems.get(section) || []).length;
            if (after <= before) break;
          }
          newsVisibleCounts.set(section, Math.min(targetVisible, (newsItems.get(section) || []).length));
          newsExpanded.add(section);
          renderNewsItems(section);
        })();
      } else {
        newsVisibleCounts.set(section, Math.min(targetVisible, items.length));
        newsExpanded.add(section);
        renderNewsItems(section);
      }
    });
  }
  document.querySelectorAll(".people-filter").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".people-filter").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");filter=b.dataset.pfilter;render();
  }));
  search.addEventListener("input",render);
  document.querySelectorAll(".main-tab").forEach(b=>b.addEventListener("click",()=>{
    const target=b.dataset.panel;
    document.querySelectorAll(".main-tab").forEach(x=>x.classList.toggle("active",x===b));
    document.querySelectorAll(".tab-panel").forEach(x=>x.classList.toggle("active",x.id==="panel-"+target));
    if(target==="global-perspective" || target==="people-live" || target==="wall-street" || target==="stock-essentials") observeNews();
    if(target==="dashboard" && !state.dashboardLoaded && !state.dashboardLoading) {
      state.dashboardLoading = load().finally(() => { state.dashboardLoading = null; });
    }
    window.scrollTo({top:0,behavior:"smooth"});
  }));
  // 초기화 후에도 사용자가 작업하던 탭을 유지합니다.
  try {
    const restorePanel = sessionStorage.getItem("marketInsightRestorePanel");
    if (restorePanel) {
      sessionStorage.removeItem("marketInsightRestorePanel");
      const panelKey = restorePanel.replace(/^panel-/, "");
      document.querySelector(`.main-tab[data-panel="${panelKey}"]`)?.click();
    }
  } catch (_) {}
  if (toggleDeleteBtn) toggleDeleteBtn.addEventListener("click", () => {
    deleteMode = !deleteMode;
    toggleDeleteBtn.classList.toggle("active", deleteMode);
    toggleDeleteBtn.setAttribute("aria-pressed", String(deleteMode));
    toggleDeleteBtn.textContent = deleteMode ? "삭제 선택 종료" : "－ 인물 삭제";
    render();
    if (deleteMode) root.scrollIntoView({behavior:"smooth",block:"start"});
  });
  if (addBtn && form) addBtn.addEventListener("click", () => {
    form.hidden = false;
    cancelBtn.hidden = false;
    addBtn.hidden = true;
    form.scrollIntoView({behavior:"smooth",block:"center"});
  });
  if (cancelBtn && form) cancelBtn.addEventListener("click", () => {
    form.reset(); form.hidden = true; cancelBtn.hidden = true; addBtn.hidden = false;
  });
  if (form) form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const person = {
      name:String(data.get("name")||"").trim(),
      country:String(data.get("country")||"").trim(),
      role:String(data.get("role")||"").trim(),
      group:String(data.get("group")||"정책·거시"),
      influenceGrade:String(data.get("influenceGrade")||"B").trim(),
      impact:String(data.get("impact")||"").trim(),
      watch:String(data.get("watch")||"").trim(),
      query:String(data.get("query")||"").trim()
    };
    if (people.some(p => p.name === person.name)) { alert("이미 등록된 인물입니다."); return; }
    people.push(person);
    savePeople();
    form.reset(); form.hidden = true; cancelBtn.hidden = true; addBtn.hidden = false;
    deleteMode = false;
    if (toggleDeleteBtn) { toggleDeleteBtn.classList.remove("active"); toggleDeleteBtn.setAttribute("aria-pressed","false"); toggleDeleteBtn.textContent = "－ 인물 삭제"; }
    document.querySelectorAll(".people-filter").forEach(x => x.classList.toggle("active", x.dataset.pfilter === "all"));
    filter = "all";
    render();
  });
  if (resetPeopleBtn) resetPeopleBtn.addEventListener("click", () => {
    if (!confirm("인물 목록을 처음 설정된 29명으로 초기화할까요? 추가한 인물과 삭제·복구 대기 중인 내역은 모두 사라집니다.")) return;
    people.splice(0, people.length, ...INITIAL_PEOPLE.map(p => ({...p})));
    deletedPeople = []; savedOrder = []; deleteMode = false; filter = "all";
    if (search) search.value = "";
    if (toggleDeleteBtn) { toggleDeleteBtn.classList.remove("active"); toggleDeleteBtn.setAttribute("aria-pressed", "false"); toggleDeleteBtn.textContent = "－ 인물 삭제"; }
    document.querySelectorAll(".people-filter").forEach(x => x.classList.toggle("active", x.dataset.pfilter === "all"));
    if (form) { form.reset(); form.hidden = true; }
    if (cancelBtn) cancelBtn.hidden = true;
    if (addBtn) addBtn.hidden = false;
    savePeople(); render(); renderDeleted();
  });
  render();
  renderDeleted();
  window.setInterval(() => { const before = deletedPeople.length; purgeExpired(); if (deletedPeople.length !== before) { savePeople(); renderDeleted(); } }, 60*60*1000);
})();


/* ===== 영향력 있는 인물 검색 ===== */

const search=document.getElementById('history-search');
const cards=[...document.querySelectorAll('.history-card')];
const buttons=[...document.querySelectorAll('.history-filter')];
let active='all';
function update(){
 const q=search.value.trim().toLowerCase();let count=0;
 cards.forEach(card=>{
  const text=(card.innerText+' '+card.dataset.search+' '+card.dataset.cat).toLowerCase();
  const category=card.dataset.cat||'';
  const matchText=!q||text.includes(q);
  const matchCat=active==='all'||(active==='한국'?category.includes('한국'):active==='정책'?category.includes('정책'):category.includes(active));
  card.style.display=matchText&&matchCat?'':'none';
  if(matchText&&matchCat)count++;
 });
 document.getElementById('history-empty').style.display=count?'none':'block';
}
search.addEventListener('input',update);
buttons.forEach(btn=>btn.addEventListener('click',()=>{
 active=btn.dataset.filter;buttons.forEach(b=>b.classList.toggle('history-active',b===btn));update();
}));

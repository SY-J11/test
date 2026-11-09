
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
    const [data, news, issues, archive] = await Promise.all([
      api("briefing"),
      api("news?limit=100"),
      api("issues?status=active"),
      api("issues?status=closed")
    ]);

    renderBriefing(data.briefing, issues.items?.length || 0);

    state.news = news.items || [];
    state.issues = issues.items || [];
    state.archive = archive.items || [];

    $("updatedAt").textContent = data.briefing?.updatedAt
      ? `최근 업데이트 ${dateText(data.briefing.updatedAt)}`
      : "데이터 연결 완료";

    $("dateLabel").textContent = new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    });

    renderNews();
    renderIssues();
    renderArchive();

  } catch (e) {
    $("updatedAt").textContent = "서버 연결 필요";
    $("briefingStatus").textContent = "연결 대기";

    $("briefingSummary").textContent =
      "뉴스 데이터 서버가 아직 연결되지 않았습니다. README의 Cloudflare Worker 및 D1 설정을 완료하면 자동으로 표시됩니다.";

    state.news = [];
    state.issues = [];

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
});

$("refreshBtn").addEventListener("click", async () => {
  const b = $("refreshBtn");
  b.disabled = true;
  b.textContent = "…";

  await load();

  b.disabled = false;
  b.textContent = "↻";
});

load();

// 명암(다크/라이트) 전환
$("themeBtn").addEventListener("click", () => {
  const d = document.documentElement.classList.toggle("dark");
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = d ? "#151a22" : "#f4f6fa";
  try { localStorage.setItem("theme_v1", d ? "dark" : "light"); } catch (e) {}
});

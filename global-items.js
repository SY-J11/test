/* ===== 글로벌 시각 사용자 항목 관리: 추가·삭제·복원·초기화 ===== */
(() => {
  const init = () => {
    const root = document.getElementById("panel-global-perspective");
    if (!root || root.dataset.customManagerReady === "1") return;
    const groupsContainer = root.querySelector(".global-perspective-groups");
    const contentsList = root.querySelector("#globalPerspectiveTocList");
    const addBtn = root.querySelector("#addGlobalItemBtn");
    const deleteBtn = root.querySelector("#toggleDeleteGlobalBtn");
    const resetBtn = root.querySelector("#resetGlobalItemsBtn");
    const cancelBtn = root.querySelector("#cancelGlobalItemBtn");
    const form = root.querySelector("#globalItemForm");
    const deletedList = root.querySelector("#deletedGlobalItems");
    if (!groupsContainer || !addBtn || !deleteBtn || !resetBtn || !cancelBtn || !form || !deletedList) {
      console.error("글로벌 코리아 인사이트 항목 관리 요소를 찾지 못했습니다.");
      return;
    }
    root.dataset.customManagerReady = "1";

    const storageKey = "marketInsightGlobalItems_v1";
    const worker = "https://macro.mcraft-tiger-574.workers.dev";
    const providers = [
      { name: "Google", source: "global", domain: "news.google.com" },
      { name: "Goldman Sachs", source: "official-goldman", domain: "goldmansachs.com" },
      { name: "Morgan Stanley", source: "official-morgan", domain: "morganstanley.com" }
    ];
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    let added = [];
    let deleted = [];
    let deleteMode = false;

    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      added = Array.isArray(saved.added) ? saved.added.filter(x => x && x.market) : [];
      deleted = Array.isArray(saved.deleted) ? saved.deleted.filter(x => x && x.market) : [];
      const legacy = added.filter(x => x.type !== "group");
      added = added.filter(x => x.type === "group");
      legacy.forEach((item, index) => {
        const market = String(item.market || "추가 항목");
        if (!added.some(group => String(group.market).toLowerCase() === market.toLowerCase())) {
          added.push({ type: "group", id: "legacy-" + index, market });
        }
      });
    } catch (error) {
      console.warn("저장된 글로벌 항목을 읽지 못했습니다.", error);
      added = [];
      deleted = [];
    }

    function purgeExpired() {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      deleted = deleted.filter(item => Number(item.deletedAt) > cutoff);
    }
    function save() {
      purgeExpired();
      try { localStorage.setItem(storageKey, JSON.stringify({ added, deleted })); }
      catch (error) { console.error("글로벌 항목 저장 실패", error); }
    }
    function setStateMessage(list, message) {
      list.replaceChildren();
      const state = document.createElement("div");
      state.className = "person-news-state";
      state.textContent = message;
      list.appendChild(state);
    }

    async function loadCard(card) {
      const list = card.querySelector(".person-news-list");
      if (!list || card.dataset.loading === "1" || card.dataset.loaded === "1") return;
      card.dataset.loading = "1";
      setStateMessage(list, "최신 기사를 불러오는 중…");
      try {
        const params = new URLSearchParams({ q: card.dataset.query || "", source: card.dataset.source || "global", limit: "10", offset: "0" });
        const response = await fetch(worker + "/api/person-news?" + params.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || ("HTTP " + response.status));
        const items = Array.isArray(data.items) ? data.items : [];
        list.replaceChildren();
        if (!items.length) {
          setStateMessage(list, data.error || "검색 결과가 없습니다.");
        } else {
          items.forEach((item, index) => {
            const link = document.createElement("a");
            link.className = "person-news-item";
            link.href = item.url || "#";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            const number = document.createElement("span"); number.className = "person-news-number"; number.textContent = String(index + 1);
            const copy = document.createElement("span"); copy.className = "person-news-copy";
            const title = document.createElement("b"); title.textContent = item.title || "제목 없음";
            const source = document.createElement("small"); source.textContent = item.source || data.provider || card.dataset.provider || "검색 결과";
            copy.append(title, source);
            const arrow = document.createElement("span"); arrow.className = "person-news-arrow"; arrow.textContent = "↗";
            link.append(number, copy, arrow); list.appendChild(link);
          });
        }
        card.dataset.loaded = "1";
      } catch (error) {
        setStateMessage(list, "검색 결과를 불러오지 못했습니다: " + (error.message || error));
        const retry = document.createElement("button");
        retry.type = "button"; retry.className = "person-news-retry"; retry.textContent = "다시 불러오기";
        retry.addEventListener("click", () => { card.dataset.loaded = "0"; loadCard(card); });
        list.appendChild(retry);
      } finally {
        card.dataset.loading = "0";
      }
    }

    function makeCard(query, provider, id) {
      const card = document.createElement("section");
      card.className = "person-news global-news-card";
      card.dataset.query = query; card.dataset.source = provider.source; card.dataset.provider = provider.name;
      let href;
      if (provider.source === "global") href = "https://news.google.com/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
      else if (provider.source === "official-goldman") href = "https://www.goldmansachs.com/search?query=" + encodeURIComponent(query);
      else href = "https://www.morganstanley.com/search?text=" + encodeURIComponent(query);
      const head = document.createElement("div"); head.className = "person-news-head";
      const brand = document.createElement("b"); brand.textContent = provider.name;
      brand.className = "provider-brand";
      const img = document.createElement("img"); img.src = "https://www.google.com/s2/favicons?domain=" + provider.domain + "&sz=64"; img.alt = ""; img.loading = "lazy"; brand.prepend(img);
      const actions = document.createElement("span"); actions.className = "person-news-actions";
      const searchLink = document.createElement("a"); searchLink.className = "person-news-search-link"; searchLink.href = href; searchLink.target = "_blank"; searchLink.rel = "noopener noreferrer"; searchLink.textContent = "전체 기사 보기 ↗";
      const newest = document.createElement("span"); newest.textContent = "최신순";
      actions.append(searchLink, newest); head.append(brand, actions);
      const list = document.createElement("div"); list.className = "person-news-list";
      setStateMessage(list, "최신 기사를 불러오는 중…");
      card.append(head, list);
      const more = document.createElement("button");
      more.type = "button"; more.className = "person-news-more"; more.dataset.newsMore = ""; more.disabled = true; more.textContent = "기사 10개 더 보기";
      card.appendChild(more);
      return card;
    }

    function renderContents() {
      if (!contentsList) return;
      contentsList.replaceChildren();
      const groups = [...groupsContainer.querySelectorAll(":scope > .global-market-group")];
      groups.forEach(group => {
        const title = groupTitle(group);
        if (!title) return;
        if (!group.id) {
          const stable = group.dataset.globalGroupId || group.dataset.groupId || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          group.id = "global-group-" + stable;
        }
        if (contentsList.children.length) {
          const dot = document.createElement("span");
          dot.className = "global-toc-dot";
          dot.textContent = "·";
          contentsList.appendChild(dot);
        }
        const link = document.createElement("a");
        link.className = "global-toc-link";
        link.href = "#" + group.id;
        link.textContent = title;
        contentsList.appendChild(link);
      });
    }

    function groupTitle(group) {
      return group.querySelector(".global-market-heading h2")?.textContent.trim() || "추가 항목";
    }
    function createGroup(name, id) {
      const group = document.createElement("section");
      group.className = "global-market-group card custom-global-group";
      group.dataset.groupId = id;
      group.id = "global-group-" + String(id).replace(/[^a-zA-Z0-9_-]/g, "-");
      const heading = document.createElement("div"); heading.className = "global-market-heading";
      const eyebrow = document.createElement("span"); eyebrow.className = "eyebrow"; eyebrow.textContent = "GLOBAL MARKET WATCH · CUSTOM";
      const title = document.createElement("h2"); title.textContent = name;
      heading.append(eyebrow, title);
      const grid = document.createElement("div"); grid.className = "global-market-grid";
      providers.forEach((provider, index) => grid.appendChild(makeCard(name, provider, id + "-" + index)));
      group.append(heading, grid);
      groupsContainer.appendChild(group);
      renderContents();
      if (window.refreshPersonNewsObserver) window.refreshPersonNewsObserver();
      if (deleteMode) addDeleteButton(group);
      return group;
    }
    function addDeleteButton(group) {
      if (group.querySelector(":scope > .global-group-delete")) return;
      const button = document.createElement("button");
      button.type = "button"; button.className = "global-group-delete"; button.textContent = "삭제";
      button.addEventListener("click", () => deleteGroup(group));
      group.appendChild(button);
    }
    function syncDeleteMode() {
      groupsContainer.querySelectorAll(":scope > .custom-global-group").forEach(group => {
        const button = group.querySelector(":scope > .global-group-delete");
        if (deleteMode) addDeleteButton(group);
        else button?.remove();
      });
      deleteBtn.classList.toggle("active", deleteMode);
      deleteBtn.setAttribute("aria-pressed", String(deleteMode));
      deleteBtn.textContent = deleteMode ? "삭제 선택 종료" : "－ 항목 삭제";
    }
    function deleteGroup(group) {
      if (!group?.isConnected) return;
      const id = group.dataset.groupId;
      deleted.push({ type: "group", id, market: groupTitle(group), deletedAt: Date.now() });
      added = added.filter(item => item.id !== id);
      group.remove(); renderContents(); save(); renderDeleted();
    }
    function renderDeleted() {
      purgeExpired();
      deletedList.replaceChildren();
      if (!deleted.length) {
        const empty = document.createElement("p"); empty.textContent = "복원할 항목이 없습니다."; deletedList.appendChild(empty);
      } else {
        deleted.forEach((item, index) => {
          const row = document.createElement("div"); row.className = "global-deleted-row";
          const label = document.createElement("span");
          const days = Math.max(0, Math.ceil((Number(item.deletedAt) + 30 * 86400000 - Date.now()) / 86400000));
          label.textContent = (item.market || "추가 항목") + " · 자동 영구 삭제까지 " + days + "일";
          const actions = document.createElement("div"); actions.className = "global-deleted-actions";
          const restore = document.createElement("button"); restore.type = "button"; restore.className = "people-manage-btn"; restore.textContent = "복원";
          restore.addEventListener("click", () => restoreGroup(index));
          const remove = document.createElement("button"); remove.type = "button"; remove.className = "people-manage-btn danger"; remove.textContent = "영구 삭제";
          remove.addEventListener("click", () => {
            const target = deleted[index];
            if (!target) return;
            if (!confirm(`"${target.market || "추가 항목"}" 항목을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
            deleted.splice(index, 1);
            save();
            renderDeleted();
          });
          actions.append(restore, remove); row.append(label, actions); deletedList.appendChild(row);
        });
      }
      save();
    }
    function restoreGroup(index) {
      const item = deleted[index]; if (!item) return;
      if (added.some(group => String(group.market).toLowerCase() === String(item.market).toLowerCase())) {
        alert("같은 이름의 항목이 이미 있습니다."); return;
      }
      const id = item.id || ("custom-" + Date.now().toString(36));
      added.push({ type: "group", id, market: item.market || "추가 항목" });
      createGroup(item.market || "추가 항목", id);
      renderContents();
      deleted.splice(index, 1); save(); renderDeleted(); syncDeleteMode();
    }
    function resetCustomGroups() {
      if (!confirm("글로벌 코리아 인사이트를 처음 상태로 초기화할까요? 직접 추가한 항목과 삭제 내역이 모두 사라집니다.")) return;
      groupsContainer.querySelectorAll(":scope > .custom-global-group").forEach(group => group.remove());
      renderContents();
      added = []; deleted = []; deleteMode = false;
      try { localStorage.removeItem(storageKey); } catch (error) { console.error(error); }
      form.reset(); form.hidden = true; cancelBtn.hidden = true; addBtn.hidden = false;
      renderDeleted(); syncDeleteMode();
    }

    purgeExpired();
    renderContents();
    added.forEach(item => {
      if (!item || !item.market) return;
      const id = String(item.id || ("custom-" + Date.now().toString(36)));
      item.id = id;
      createGroup(String(item.market), id);
    });
    save();

    // 버튼에 직접 이벤트를 연결해 탭 전환/모바일 환경에서도 동작을 보장합니다.
    addBtn.addEventListener("click", event => {
      event.preventDefault();
      form.hidden = false;
      cancelBtn.hidden = false;
      addBtn.hidden = true;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      form.querySelector('input[name="market"]')?.focus();
    });

    cancelBtn.addEventListener("click", event => {
      event.preventDefault();
      form.reset();
      form.hidden = true;
      cancelBtn.hidden = true;
      addBtn.hidden = false;
    });

    deleteBtn.addEventListener("click", event => {
      event.preventDefault();
      deleteMode = !deleteMode;
      syncDeleteMode();
    });

    resetBtn.addEventListener("click", event => {
      event.preventDefault();
      resetCustomGroups();
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      const input = form.querySelector('input[name="market"]');
      const name = String(input?.value || "").trim();
      if (!name) { input?.focus(); return; }
      const exists = [...groupsContainer.querySelectorAll(":scope > .custom-global-group .global-market-heading h2")]
        .some(title => title.textContent.trim().toLowerCase() === name.toLowerCase());
      if (exists) { alert("이미 추가된 항목입니다."); return; }
      const id = "custom-" + Date.now().toString(36);
      added.push({ type: "group", id, market: name });
      const group = createGroup(name, id);
      save(); form.reset(); form.hidden = true; cancelBtn.hidden = true; addBtn.hidden = false;
      syncDeleteMode(); renderContents(); group.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    renderDeleted();
    syncDeleteMode();
    const refreshDeletedExpiry = () => {
      const previousCount = deleted.length;
      purgeExpired();
      if (deleted.length !== previousCount) {
        save();
        renderDeleted();
      }
    };
    window.setInterval(refreshDeletedExpiry, 60 * 60 * 1000);
    window.addEventListener("focus", refreshDeletedExpiry);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshDeletedExpiry();
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

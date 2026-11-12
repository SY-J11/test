/* 월가 인사이트 / 주식 시장 핵심 용어 검색어 관리
 * 두 탭 각각 카테고리 선택 추가, 삭제, 복원, 영구 삭제, 초기화를 지원합니다.
 */
(() => {
  'use strict';

  const configs = [
    {
      panelId: 'panel-wall-street',
      prefix: 'ws-main',
      storageKey: 'wallStreetInsightMainTerms_v1',
      customGroup: false,
      resetMessage: '월가 인사이트의 추가·삭제한 검색어를 초기화하고 기본 구성으로 복원할까요?'
    },
    {
      panelId: 'panel-stock-essentials',
      prefix: 'ws-ess',
      storageKey: 'wallStreetInsightTerms_v1',
      customGroup: true,
      resetMessage: '주식 시장 핵심 용어의 추가·삭제한 검색어를 초기화하고 기본 용어 100개를 복원할까요?'
    }
  ];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const enc = encodeURIComponent;

  function init(config) {
    const panel = document.getElementById(config.panelId);
    if (!panel) return;
    const manager = panel.querySelector(`[data-wall-street-manager="${config.prefix}"]`);
    if (!manager) return;

    const form = manager.querySelector('form');
    const addBtn = manager.querySelector(`#${config.prefix}-add`);
    const deleteBtn = manager.querySelector(`#${config.prefix}-delete`);
    const resetBtn = manager.querySelector(`#${config.prefix}-reset`);
    const cancelBtn = manager.querySelector(`#${config.prefix}-cancel`);
    const deletedBox = manager.querySelector(`#${config.prefix}-deleted`);
    const categorySelect = form.querySelector('[name="category"]');

    let added = [];
    let deleted = [];
    let deleteMode = false;

    function inferLegacyGroup(item) {
      if (item?.isCustom) return 'custom';
      const match = String(item?.id || '').match(/ws-(\d+)/);
      if (match) {
        const n = Number(match[1]);
        if (n >= 61 && n <= 160) return String(Math.floor((n - 61) / 10) + 1).padStart(2, '0');
      }
      return item?.groupKey || item?.category || (config.customGroup ? 'custom' : '01');
    }

    try {
      const saved = JSON.parse(localStorage.getItem(config.storageKey) || '{}');
      added = Array.isArray(saved.added) ? saved.added
        .filter(x => x && x.term && x.id)
        .map(x => ({
          id: String(x.id), term: String(x.term), meaning: String(x.meaning || ''),
          groupKey: config.prefix === 'ws-ess' ? (x.groupKey || (x.category === '05' ? 'custom' : x.category || 'custom')) : (x.groupKey || x.category || '01')
        })) : [];
      deleted = Array.isArray(saved.deleted) ? saved.deleted
        .filter(x => x && x.term && x.id)
        .map(x => ({ ...x, groupKey: inferLegacyGroup(x) })) : [];
    } catch (error) {
      console.warn('검색어 저장 내용을 읽지 못했습니다.', error);
    }

    function save() {
      try { localStorage.setItem(config.storageKey, JSON.stringify({ added, deleted })); }
      catch (error) { console.error('검색어 저장 실패', error); }
    }

    function getGroupHost(groupKey) {
      if (config.prefix === 'ws-main') {
        const group = panel.querySelector(`.wall-street-category[data-term-group="${CSS.escape(groupKey)}"]`);
        return group?.querySelector('.wall-street-terms') || null;
      }
      if (groupKey === 'custom') return panel.querySelector('#ws-custom-terms');
      return panel.querySelector(`.wall-street-term-group[data-term-group="${CSS.escape(groupKey)}"]`);
    }

    function getTocHost(groupKey) {
      if (config.prefix === 'ws-main') {
        return panel.querySelector(`.ws-toc-category[data-toc-group="${CSS.escape(groupKey)}"] .ws-toc-keywords`);
      }
      const subgroup = panel.querySelector(`.ws-toc-subgroup[data-toc-group="${CSS.escape(groupKey)}"]`);
      return subgroup?.querySelector('.ws-toc-keywords') || null;
    }

    function syncCustomToc() {
      if (!config.customGroup) return;
      const host = getTocHost('custom');
      const terms = added.filter(item => item.groupKey === 'custom');
      const tocCategory = host?.closest('.ws-custom-toc-category');
      const customGroup = panel.querySelector('.wall-street-custom-group');
      if (tocCategory) tocCategory.hidden = terms.length === 0;
      if (customGroup) customGroup.hidden = terms.length === 0;
      // 두 번째 탭에서는 사용자 검색어 목차 제목을 제거했지만, 추가한 항목의 본문 표시는 유지합니다.
      if (!host) return;
      host.replaceChildren();
      terms.forEach((item, index) => {
        if (index) {
          const dot = document.createElement('span');
          dot.className = 'ws-toc-dot';
          dot.textContent = ' · ';
          host.appendChild(dot);
        }
        const link = document.createElement('a');
        link.className = 'ws-keyword-link';
        link.href = `#${item.id}`;
        link.textContent = item.term;
        host.appendChild(link);
      });
    }

    function addTocLink(item) {
      if (item.groupKey === 'custom') {
        syncCustomToc();
        return;
      }
      const host = getTocHost(item.groupKey);
      if (!host || host.querySelector(`a[href="#${CSS.escape(item.id)}"]`)) return;
      if (host.children.length) {
        const dot = document.createElement('span');
        dot.className = 'ws-toc-dot';
        dot.textContent = ' · ';
        host.appendChild(dot);
      }
      const link = document.createElement('a');
      link.className = 'ws-keyword-link';
      link.href = `#${item.id}`;
      link.textContent = item.term;
      host.appendChild(link);
    }

    function removeTocLink(id, groupKey) {
      const host = getTocHost(groupKey);
      const link = host?.querySelector(`a[href="#${CSS.escape(id)}"]`);
      if (!link) return;
      const previous = link.previousElementSibling;
      const next = link.nextElementSibling;
      if (previous?.classList.contains('ws-toc-dot')) previous.remove();
      else if (next?.classList.contains('ws-toc-dot')) next.remove();
      link.remove();
      if (groupKey === 'custom') syncCustomToc();
    }

    function makeCard(term, provider, source) {
      const href = source === 'global'
        ? `https://news.google.com/search?q=${enc(term)}&hl=en-US&gl=US&ceid=US%3Aen`
        : source === 'official-goldman'
          ? `https://www.goldmansachs.com/search?query=${enc(term)}`
          : `https://www.morganstanley.com/search?text=${enc(term)}`;
      const domain = source === 'global' ? 'news.google.com' : source === 'official-goldman' ? 'goldmansachs.com' : 'morganstanley.com';
      return `<section class="person-news global-news-card wall-street-news-card" data-query="${esc(term)}" data-source="${source}"><div class="person-news-head"><b class="provider-brand"><img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" alt="" loading="lazy">${provider}</b><span class="person-news-actions"><a class="person-news-search-link" href="${href}" target="_blank" rel="noopener noreferrer">전체 기사 보기 ↗</a><span>최신순</span></span></div><div class="person-news-list"><div class="person-news-state">화면에 표시되면 최신 기사를 불러옵니다.</div></div><button class="person-news-more" data-news-more disabled type="button">기사 10개 더 보기</button></section>`;
    }

    function setupTermToggle(termElement) {
      if (!termElement || termElement.dataset.toggleReady === 'true') return;
      const title = termElement.querySelector('.wall-street-term-heading > div');
      if (!title) return;
      title.classList.add('wall-street-term-toggle');
      title.setAttribute('role', 'button');
      title.setAttribute('tabindex', '0');
      title.setAttribute('aria-expanded', termElement.classList.contains('is-expanded') ? 'true' : 'false');
      title.setAttribute('aria-label', `${termElement.dataset.term || title.querySelector('h3')?.textContent || '검색어'} 검색 결과 펼치기`);
      termElement.dataset.toggleReady = 'true';
    }

    function make(item) {
      const host = getGroupHost(item.groupKey);
      if (!host || panel.querySelector(`[data-term-id="${CSS.escape(item.id)}"]`)) return null;
      const el = document.createElement('section');
      el.className = 'wall-street-term is-custom';
      el.id = item.id;
      el.dataset.termId = item.id;
      el.dataset.term = item.term;
      el.dataset.meaning = item.meaning || '';
      el.dataset.category = item.groupKey;
      const meaning = item.meaning || '추가한 검색어';
      el.innerHTML = `<div class="wall-street-term-heading"><div><h3>${esc(item.term)}</h3><p class="wall-street-meaning">${esc(meaning)} · Google News, Goldman Sachs, Morgan Stanley 검색 결과</p></div><button class="wall-street-delete-term" type="button" data-delete-wall-term="${esc(item.id)}">삭제</button></div><div class="wall-street-provider-grid">${makeCard(item.term, 'Google', 'global')}${makeCard(item.term, 'Goldman Sachs', 'official-goldman')}${makeCard(item.term, 'Morgan Stanley', 'official-morgan')}</div>`;
      if (host.classList.contains('wall-street-terms')) host.appendChild(el);
      else host.appendChild(el);
      setupTermToggle(el);
      addTocLink(item);
      return el;
    }

    function syncDeleteMode() {
      panel.classList.toggle('wall-street-delete-mode', deleteMode);
      deleteBtn.setAttribute('aria-pressed', String(deleteMode));
      deleteBtn.classList.toggle('active', deleteMode);
      deleteBtn.textContent = deleteMode ? '삭제 선택 종료' : '－ 검색어 삭제';
    }

    function renderDeleted() {
      deletedBox.replaceChildren();
      if (!deleted.length) {
        const p = document.createElement('p');
        p.className = 'wall-street-deleted-empty';
        p.textContent = '삭제한 검색어가 없습니다.';
        deletedBox.appendChild(p);
        return;
      }
      deleted.forEach(item => {
        const row = document.createElement('div');
        row.className = 'wall-street-deleted-row';
        const info = document.createElement('span');
        info.textContent = `${item.term} · ${item.meaning || '검색어'}`;
        const actions = document.createElement('div');
        actions.className = 'wall-street-deleted-actions';
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.textContent = '복원';
        restore.addEventListener('click', () => {
          const index = deleted.findIndex(x => x.id === item.id);
          if (index < 0) return;
          const [restored] = deleted.splice(index, 1);
          const groupKey = restored.groupKey || inferLegacyGroup(restored);
          const template = document.createElement('template');
          template.innerHTML = restored.html || '';
          const element = template.content.firstElementChild;
          if (element && getGroupHost(groupKey)) {
            element.dataset.category = groupKey;
            getGroupHost(groupKey).appendChild(element);
            setupTermToggle(element);
            addTocLink({ id: restored.id, term: restored.term, groupKey });
          } else {
            const itemToRestore = { id: restored.id, term: restored.term, meaning: restored.meaning || '', groupKey };
            added.push(itemToRestore);
            make(itemToRestore);
          }
          if (restored.isAdded) added.push({ id: restored.id, term: restored.term, meaning: restored.meaning || '', groupKey });
          save(); syncCustomToc(); renderDeleted();
          if (window.refreshPersonNewsObserver) window.refreshPersonNewsObserver();
        });
        const permanent = document.createElement('button');
        permanent.type = 'button';
        permanent.className = 'permanent';
        permanent.textContent = '영구 삭제';
        permanent.addEventListener('click', () => {
          if (!confirm(`'${item.term}' 검색어를 영구 삭제할까요? 삭제 후에는 복원할 수 없습니다.`)) return;
          const index = deleted.findIndex(x => x.id === item.id);
          if (index < 0) return;
          deleted.splice(index, 1);
          save(); renderDeleted();
        });
        actions.append(restore, permanent);
        row.append(info, actions);
        deletedBox.appendChild(row);
      });
    }

    // Restore the hidden/deleted state before rendering saved user-added terms.
    deleted.forEach(item => {
      const existing = panel.querySelector(`[data-term-id="${CSS.escape(item.id)}"]`);
      if (existing) {
        item.html = existing.outerHTML;
        item.groupKey = existing.closest('[data-term-group]')?.dataset.termGroup || item.groupKey;
        existing.remove();
      }
      removeTocLink(item.id, item.groupKey || inferLegacyGroup(item));
    });

    // Backward compatibility: older v6 custom terms were stored with category 05.
    added.forEach(item => {
      if (!item.groupKey) item.groupKey = config.customGroup ? 'custom' : '01';
      make(item);
    });

    addBtn.addEventListener('click', () => {
      form.hidden = false;
      cancelBtn.hidden = false;
      addBtn.hidden = true;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.querySelector('[name="term"]').focus();
    });

    cancelBtn.addEventListener('click', () => {
      form.reset();
      form.hidden = true;
      cancelBtn.hidden = true;
      addBtn.hidden = false;
    });

    deleteBtn.addEventListener('click', () => {
      deleteMode = !deleteMode;
      syncDeleteMode();
    });

    resetBtn.addEventListener('click', () => {
      if (!confirm(config.resetMessage)) return;
      localStorage.removeItem(config.storageKey);
      try { sessionStorage.setItem('marketInsightRestorePanel', config.panelId); } catch (_) {}
      location.reload();
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      const term = String(data.get('term') || '').trim();
      const meaning = String(data.get('meaning') || '').trim();
      const groupKey = String(data.get('category') || '');
      if (!term || !groupKey || !getGroupHost(groupKey)) {
        alert('카테고리와 검색어를 확인해 주세요.');
        return;
      }
      const duplicate = [...panel.querySelectorAll('.wall-street-term h3')]
        .some(h => h.textContent.trim().toLowerCase() === term.toLowerCase());
      if (duplicate) {
        alert('이미 등록된 검색어입니다.');
        return;
      }
      const item = {
        id: `${config.prefix}-custom-${Date.now().toString(36)}`,
        term, meaning, groupKey
      };
      added.push(item);
      const el = make(item);
      if (!el) {
        added = added.filter(x => x.id !== item.id);
        alert('선택한 카테고리에 검색어를 추가하지 못했습니다.');
        return;
      }
      save();
      syncCustomToc();
      form.reset();
      form.hidden = true;
      cancelBtn.hidden = true;
      addBtn.hidden = false;
      if (window.refreshPersonNewsObserver) window.refreshPersonNewsObserver();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-delete-wall-term]');
      if (!button || !panel.contains(button)) return;
      const el = button.closest('.wall-street-term');
      if (!el) return;
      const groupKey = el.closest('[data-term-group]')?.dataset.termGroup || el.dataset.category || (config.customGroup ? 'custom' : '01');
      const item = {
        id: el.dataset.termId,
        term: el.dataset.term || el.querySelector('h3')?.textContent.trim() || '',
        meaning: el.dataset.meaning || '',
        groupKey,
        isAdded: el.classList.contains('is-custom') && added.some(x => x.id === el.dataset.termId),
        html: el.outerHTML
      };
      added = added.filter(x => x.id !== item.id);
      deleted = deleted.filter(x => x.id !== item.id);
      deleted.push(item);
      el.remove();
      removeTocLink(item.id, groupKey);
      save();
      syncCustomToc();
      renderDeleted();
    });

    // 검색 결과는 사용자가 검색어를 펼쳤을 때만 요청합니다.
    panel.querySelectorAll('.wall-street-term').forEach(setupTermToggle);

    function toggleTerm(termElement, forceOpen = null) {
      if (!termElement) return;
      const open = forceOpen === null ? !termElement.classList.contains('is-expanded') : !!forceOpen;
      termElement.classList.toggle('is-expanded', open);
      const title = termElement.querySelector('.wall-street-term-heading > div');
      if (title) {
        title.setAttribute('aria-expanded', String(open));
        title.setAttribute('aria-label', `${termElement.dataset.term || title.querySelector('h3')?.textContent || '검색어'} 검색 결과 ${open ? '접기' : '펼치기'}`);
      }
      if (open && window.refreshPersonNewsObserver) window.refreshPersonNewsObserver();
    }

    panel.addEventListener('click', event => {
      const tocLink = event.target.closest('.ws-keyword-link');
      if (tocLink && panel.contains(tocLink)) {
        const targetId = decodeURIComponent((tocLink.getAttribute('href') || '').replace(/^#/, ''));
        const target = targetId ? document.getElementById(targetId) : null;
        if (target && panel.contains(target)) {
          event.preventDefault();
          toggleTerm(target, true);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      const title = event.target.closest('.wall-street-term-heading > div.wall-street-term-toggle');
      if (!title || !panel.contains(title)) return;
      if (event.target.closest('a, button')) return;
      toggleTerm(title.closest('.wall-street-term'));
    });

    panel.addEventListener('keydown', event => {
      const title = event.target.closest('.wall-street-term-heading > div.wall-street-term-toggle');
      if (!title || !panel.contains(title) || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      toggleTerm(title.closest('.wall-street-term'));
    });

    // Keep the initial custom-keyword placeholder visible until the first custom term is added.
    syncCustomToc();
    renderDeleted();
    syncDeleteMode();
    save();
    if (window.refreshPersonNewsObserver) window.refreshPersonNewsObserver();
  }

  configs.forEach(init);
})();

/* 월가 인사이트 검색어 관리: 추가·삭제·복원·영구 삭제·초기화 */
(() => {
  const root = document.getElementById('panel-stock-essentials');
  if (!root) return;

  const key = 'wallStreetInsightTerms_v1';
  const form = root.querySelector('#wallStreetTermForm');
  const add = root.querySelector('#addWallStreetTermBtn');
  const cancel = root.querySelector('#cancelWallStreetTermBtn');
  const del = root.querySelector('#toggleDeleteWallStreetBtn');
  const reset = root.querySelector('#resetWallStreetTermsBtn');
  const deletedBox = root.querySelector('#deletedWallStreetTerms');
  const cats = {
    '01': { id: 'ws-cat-01', title: '월가 및 금융기관' },
    '02': { id: 'ws-cat-02', title: '투자 주체 및 자금 운용' },
    '03': { id: 'ws-cat-03', title: '시장 전문가 및 투자 전략' },
    '04': { id: 'ws-cat-04', title: '금융시장 및 거래 동향' },
    '05': { id: 'ws-cat-05', title: '나만의 검색 키워드', host: '#ws-custom-terms' }
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const enc = encodeURIComponent;
  let added = [], deleted = [], deleteMode = false;

  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    added = Array.isArray(saved.added) ? saved.added.filter(x => x && x.term && x.id).map(x => ({ ...x, category: '05' })) : [];
    deleted = Array.isArray(saved.deleted) ? saved.deleted.filter(x => x && x.term && x.id) : [];
  } catch (error) { console.warn('월가 검색어 저장 내용을 읽지 못했습니다.', error); }

  function save() {
    try { localStorage.setItem(key, JSON.stringify({ added, deleted })); }
    catch (error) { console.error('월가 검색어 저장 실패', error); }
  }

  function syncCustomPlaceholder() {
    const host = root.querySelector('#ws-custom-terms');
    if (!host) return;
    host.querySelector('.wall-street-empty-keywords')?.remove();
  }

  function syncCustomToc() {
    const host = root.querySelector('#ws-custom-toc-keywords');
    if (!host) return;
    host.replaceChildren();
    const terms = added.filter(item => item && item.term && item.id);
    const links = terms.length ? terms : [{ id: 'ws-custom-terms', term: 'New' }];
    links.forEach((item, index) => {
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

  function card(term, name, source) {
    let href = name === 'Google'
      ? `https://news.google.com/search?q=${enc(term)}&hl=en-US&gl=US&ceid=US%3Aen`
      : name === 'Goldman Sachs'
        ? `https://www.goldmansachs.com/search?query=${enc(term)}`
        : `https://www.morganstanley.com/search?text=${enc(term)}`;
    return `<section class="person-news global-news-card wall-street-news-card" data-query="${esc(term)}" data-source="${source}"><div class="person-news-head"><b>${name}</b><span class="person-news-actions"><a class="person-news-search-link" href="${href}" target="_blank" rel="noopener noreferrer">전체 기사 보기 ↗</a><span>최신순</span></span></div><div class="person-news-list"><div class="person-news-state">화면에 표시되면 최신 기사를 불러옵니다.</div></div><button class="person-news-more" data-news-more disabled type="button">기사 10개 더 보기</button></section>`;
  }

  function make(item, custom = false) {
    const cat = cats[item.category] || cats['01'];
    const host = cat.host ? root.querySelector(cat.host) : root.querySelector(`#${cat.id} .wall-street-terms`);
    if (!host || root.querySelector(`[data-term-id="${CSS.escape(item.id)}"]`)) return null;
    const el = document.createElement('section');
    el.className = 'wall-street-term' + (custom ? ' is-custom' : '');
    el.id = item.id;
    el.dataset.termId = item.id;
    el.dataset.term = item.term;
    el.dataset.meaning = item.meaning || '';
    el.dataset.category = item.category;
    el.innerHTML = `<div class="wall-street-term-heading"><div><h3>${esc(item.term)}</h3><p class="wall-street-meaning">${esc(item.meaning || '추가한 검색어')} · Google News, Goldman Sachs, Morgan Stanley 검색 결과</p></div><button class="wall-street-delete-term" type="button" data-delete-wall-term="${esc(item.id)}">삭제</button></div><div class="wall-street-provider-grid">${card(item.term, 'Google', 'global')}${card(item.term, 'Goldman Sachs', 'official-goldman')}${card(item.term, 'Morgan Stanley', 'official-morgan')}</div>`;
    host.querySelector('.wall-street-empty-keywords')?.remove();
    host.appendChild(el);
    return el;
  }

  function sync() {
    root.classList.toggle('wall-street-delete-mode', deleteMode);
    del.setAttribute('aria-pressed', String(deleteMode));
    del.classList.toggle('active', deleteMode);
    del.textContent = deleteMode ? '삭제 선택 종료' : '－ 검색어 삭제';
  }

  function renderDeleted() {
    deletedBox.replaceChildren();
    if (!deleted.length) {
      const p = document.createElement('p');
      p.className = 'person-news-state';
      p.textContent = '삭제한 검색어가 없습니다.';
      deletedBox.appendChild(p);
      return;
    }
    deleted.forEach(item => {
      const row = document.createElement('div');
      row.className = 'wall-street-deleted-row';
      const info = document.createElement('span');
      info.textContent = `${item.term} · ${item.meaning || cats[item.category]?.title || ''}`;
      const actions = document.createElement('div');
      actions.className = 'wall-street-deleted-actions';
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.textContent = '복원';
      restore.addEventListener('click', () => {
        const index = deleted.findIndex(x => x.id === item.id);
        if (index < 0) return;
        const [restored] = deleted.splice(index, 1);
        if (restored.isCustom) {
          restored.category = '05';
          added.push({ id: restored.id, term: restored.term, meaning: restored.meaning, category: '05' });
          make(restored, true);
        } else {
          const host = root.querySelector(`#${(cats[restored.category] || cats['01']).id} .wall-street-terms`);
          if (host && restored.html) {
            const template = document.createElement('template');
            template.innerHTML = restored.html;
            if (template.content.firstElementChild) host.appendChild(template.content.firstElementChild);
          }
        }
        syncCustomPlaceholder(); syncCustomToc(); save(); renderDeleted();
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

  // 저장된 삭제 상태를 먼저 반영한다. 기존 v3에서 삭제된 검색어도 그대로 복원할 수 있다.
  deleted.filter(item => !item.isCustom).forEach(item => {
    const el = root.querySelector(`[data-term-id="${CSS.escape(item.id)}"]`);
    if (el) { item.html = el.outerHTML; el.remove(); }
  });
  added.forEach(item => make(item, true));
  save();

  add.addEventListener('click', () => {
    form.hidden = false; cancel.hidden = false; add.hidden = true;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    form.querySelector('[name="term"]').focus();
  });
  cancel.addEventListener('click', () => {
    form.reset(); form.hidden = true; cancel.hidden = true; add.hidden = false;
  });
  del.addEventListener('click', () => { deleteMode = !deleteMode; sync(); });
  reset.addEventListener('click', () => {
    if (confirm('주식 시장 핵심 용어 100개를 기본 구성으로 초기화할까요? 추가·삭제한 검색어와 복원 대기 내역이 모두 사라집니다.')) {
      localStorage.removeItem(key); location.reload();
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const term = String(data.get('term') || '').trim();
    const meaning = String(data.get('meaning') || '').trim();
    const category = '05';
    if (!term) return;
    if ([...root.querySelectorAll('.wall-street-term h3')].some(h => h.textContent.trim().toLowerCase() === term.toLowerCase())) {
      alert('이미 등록된 검색어입니다.'); return;
    }
    const item = { id: 'ws-custom-' + Date.now().toString(36), term, meaning, category };
    added.push(item);
    const el = make(item, true);
    save(); syncCustomToc(); form.reset(); form.hidden = true; cancel.hidden = true; add.hidden = false;
    if (window.refreshPersonNewsObserver) window.refreshPersonNewsObserver();
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-delete-wall-term]');
    if (!button) return;
    const el = button.closest('.wall-street-term');
    if (!el) return;
    const item = {
      id: el.dataset.termId,
      term: el.dataset.term,
      meaning: el.dataset.meaning || '',
      category: el.dataset.category || '01',
      isCustom: el.classList.contains('is-custom'),
      html: el.classList.contains('is-custom') ? '' : el.outerHTML
    };
    if (item.isCustom) added = added.filter(x => x.id !== item.id);
    deleted = deleted.filter(x => x.id !== item.id);
    deleted.push(item);
    el.remove(); syncCustomPlaceholder(); syncCustomToc(); save(); renderDeleted();
  });
  syncCustomPlaceholder(); syncCustomToc();
  renderDeleted(); sync();
  if (window.refreshPersonNewsObserver) window.refreshPersonNewsObserver();
})();

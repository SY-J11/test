
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
    {name:"제이미 다이먼",country:"미국",role:"JPMorgan CEO",group:"투자·자금",impact:"미국 은행권·신용시장·소비·경기 위험에 대한 발언이 금융주와 시장 심리에 영향을 줍니다.",watch:"신용 위험, 경기침체 경고, 은행 규제, 소비자 건전성",query:"Jamie Dimon market outlook economy"},
    {name:"래리 핑크",country:"미국",role:"BlackRock CEO",group:"투자·자금",impact:"글로벌 자금 흐름과 기관투자자 관점, 채권·주식·대체투자 수요를 읽는 데 중요합니다.",watch:"ETF 자금 유입·유출, 채권 수요, AI·인프라 투자",query:"Larry Fink BlackRock markets flows"},
    {name:"스탠리 드러켄밀러",country:"미국",role:"투자자",group:"투자·자금",impact:"거시경제와 유동성, 자산가격에 대한 견해가 기관투자자 심리와 테마 투자에 영향을 줄 수 있습니다.",watch:"달러·금리·재정적자, 주식 밸류에이션, 포지션 변화",query:"Stanley Druckenmiller markets interview"},
    {name:"빌 애크먼",country:"미국",role:"Pershing Square 창립자",group:"투자·자금",impact:"집중 투자와 공개 캠페인, 거시 전망을 통해 개별 기업 및 시장 심리에 영향을 줍니다.",watch:"공개 투자 의견, 기업 지배구조 캠페인, 금리 전망",query:"Bill Ackman markets investment"},
    {name:"데이비드 테퍼",country:"미국",role:"Appaloosa 창립자",group:"투자·자금",impact:"위험자산과 중국·미국 주식에 대한 투자 관점이 헤지펀드 자금 흐름의 참고 신호가 됩니다.",watch:"중국 주식, 기술주, 신용시장, 위험자산 비중",query:"David Tepper markets China stocks"},
    {name:"캐시 우드",country:"미국",role:"ARK Invest CEO",group:"투자·자금",impact:"혁신기술·성장주 투자심리와 테마별 자금 흐름을 파악하는 데 참고할 수 있습니다.",watch:"AI·로봇·자율주행·바이오 투자, ETF 자금 흐름",query:"Cathie Wood ARK investment AI"},
    {name:"마이클 버리",country:"미국",role:"투자자",group:"투자·자금",impact:"시장 과열·밸류에이션·신용 위험에 대한 경고가 투자심리와 변동성 논의에 영향을 줍니다.",watch:"공개 포지션, 밸류에이션 경고, 신용·부동산 위험",query:"Michael Burry market warning"},
    {name:"하워드 막스",country:"미국",role:"Oaktree 공동창립자",group:"투자·자금",impact:"신용 사이클과 위험 프리미엄에 대한 분석이 채권·하이일드·위험자산 판단에 유용합니다.",watch:"신용 스프레드, 부실채권, 시장 사이클, 위험 선호",query:"Howard Marks Oaktree memo credit markets"},
    {name:"젠슨 황",country:"미국",role:"NVIDIA CEO",group:"기술·기업",impact:"AI 가속기 수요와 데이터센터 투자 사이클을 대표하며 GPU·HBM·네트워크·전력 관련 공급망에 큰 영향을 줍니다.",watch:"GPU 수요·공급, 차세대 제품, 데이터센터 투자, 중국 수출",query:"Jensen Huang Nvidia AI demand"},
    {name:"샘 올트먼",country:"미국",role:"OpenAI CEO",group:"기술·기업",impact:"AI 모델·서비스 확장과 데이터센터 투자 계획이 AI 인프라와 소프트웨어 생태계의 기대를 움직입니다.",watch:"모델 출시, 컴퓨팅 투자, 데이터센터·전력 계약, 수익화",query:"Sam Altman OpenAI AI infrastructure"},
    {name:"사티아 나델라",country:"미국",role:"Microsoft CEO",group:"기술·기업",impact:"클라우드·AI 서비스의 매출화와 설비투자 규모가 빅테크 실적 및 AI 투자 사이클의 핵심 지표입니다.",watch:"Azure 성장률, AI 매출, CAPEX, 기업용 AI 수요",query:"Satya Nadella Microsoft AI earnings"},
    {name:"순다르 피차이",country:"미국",role:"Alphabet CEO",group:"기술·기업",impact:"검색·광고·클라우드·AI 전략 변화가 플랫폼 기업의 경쟁구도와 광고시장에 영향을 줍니다.",watch:"검색 사업 변화, Gemini, 클라우드 성장, AI CAPEX",query:"Sundar Pichai Google AI strategy"},
    {name:"마크 저커버그",country:"미국",role:"Meta CEO",group:"기술·기업",impact:"AI 추천·광고 효율·메타버스 및 AI 인프라 투자 규모가 플랫폼·반도체 기업에 영향을 줍니다.",watch:"광고 성장, AI 투자액, Llama, 설비투자·수익성",query:"Mark Zuckerberg Meta AI capex"},
    {name:"일론 머스크",country:"미국",role:"Tesla·SpaceX 경영자",group:"기술·기업",impact:"전기차·자율주행·로봇·우주산업의 사업 전략과 발언이 관련 기업 및 성장주 심리에 영향을 줍니다.",watch:"테슬라 판매·마진, 자율주행, 로보택시, 우주·AI 사업",query:"Elon Musk Tesla markets business"},
    {name:"리사 수",country:"미국",role:"AMD CEO",group:"기술·기업",impact:"AI 가속기와 서버 CPU 경쟁력, 공급망 및 고객사 수요가 반도체 업황의 중요한 단서입니다.",watch:"AI GPU 매출, 데이터센터 실적, 공급능력, 경쟁사 점유율",query:"Lisa Su AMD AI data center"}
  ];

  const influence = {
    "도널드 트럼프":"S", "스콧 베선트":"S", "제이미슨 그리어":"A", "하워드 러트닉":"A", "시진핑":"S",
    "케빈 워시":"S", "리사 쿡":"A", "크리스토퍼 월러":"A", "베스 해맥":"B", "토머스 바킨":"B",
    "우에다 가즈오":"S", "크리스틴 라가르드":"S", "제이미 다이먼":"S", "래리 핑크":"S",
    "스탠리 드러켄밀러":"A", "빌 애크먼":"B", "데이비드 테퍼":"B", "캐시 우드":"B", "마이클 버리":"B", "하워드 막스":"A",
    "젠슨 황":"S", "샘 올트먼":"A", "사티아 나델라":"A", "순다르 피차이":"A", "마크 저커버그":"A", "일론 머스크":"S", "리사 수":"A"
  };
  const gradeText = {S:"글로벌 핵심 변수", A:"높은 영향력", B:"분야별 영향력"};
  const root=document.getElementById("peopleCards");
  if(!root) return;
  let filter="all";
  const search=document.getElementById("peopleSearch");
  const count=document.getElementById("peopleCount");
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const loadedNews = new Set();
  const loadingNews = new Set();
  function render(){
    const q=(search.value||"").trim().toLowerCase();
    const rows=people.filter(p=>(filter==="all"||p.group===filter)&&(!q||[p.name,p.country,p.role,p.group,p.impact,p.watch].join(" ").toLowerCase().includes(q)));
    count.textContent=rows.length+"명";
    root.innerHTML=rows.map(p=>{
      const grade=influence[p.name]||"B";
      return `<article class="person-card" data-person="${esc(p.name)}"><div class="person-card-top"><div><h3>${esc(p.name)}</h3><div class="person-meta">${esc(p.country)} · ${esc(p.role)}</div></div><div class="person-card-badges"><span class="person-sector">${esc(p.group)}</span><span class="influence-grade grade-${grade}" title="${gradeText[grade]}">영향력 ${grade}</span></div></div><p class="person-impact">${esc(p.impact)}</p><div class="person-watch"><b>체크할 뉴스</b><br>${esc(p.watch)}</div><section class="person-news" data-query="${esc(p.query)}"><div class="person-news-head"><b>최근 기사</b><span>최신순 · 최대 8건</span></div><div class="person-news-list"><div class="person-news-state">화면에 표시되면 최신 기사를 불러옵니다.</div></div></section><a class="person-link" href="https://news.google.com/search?q=${encodeURIComponent(p.query)}&hl=ko&gl=KR&ceid=KR%3Ako" target="_blank" rel="noopener noreferrer">뉴스 검색 결과 전체 보기 ↗</a></article>`;
    }).join("")||'<div class="empty">검색 조건에 맞는 인물이 없습니다.</div>';
    observeNews();
  }

  async function loadNews(section){
    if(!section || loadedNews.has(section) || loadingNews.has(section)) return;
    loadingNews.add(section);
    const list=section.querySelector(".person-news-list");
    list.innerHTML='<div class="person-news-state">최신 기사를 불러오는 중…</div>';
    try{
      const url="https://macro.mcraft-tiger-574.workers.dev/api/person-news?q="+encodeURIComponent(section.dataset.query)+"&limit=8";
      const response=await fetch(url,{cache:"no-store"});
      if(!response.ok) throw new Error("뉴스 응답 오류");
      const data=await response.json();
      const items=Array.isArray(data.items)?data.items:[];
      if(!items.length){list.innerHTML='<div class="person-news-state">최근 기사를 찾지 못했습니다. 아래 전체 검색 결과를 확인하세요.</div>';return;}
      list.innerHTML=items.map((item,i)=>{
        const date=item.publishedAt?new Date(item.publishedAt):null;
        const dateText=date&&!Number.isNaN(date.getTime())?date.toLocaleDateString("ko-KR",{month:"2-digit",day:"2-digit"}):"";
        return `<a class="person-news-item" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span class="person-news-number">${i+1}</span><span class="person-news-copy"><b>${esc(item.title)}</b><small>${esc(item.source||"뉴스")}${dateText?" · "+dateText:""}</small></span><span class="person-news-arrow">↗</span></a>`;
      }).join("");
      loadedNews.add(section);
    }catch(error){
      list.innerHTML='<div class="person-news-state">뉴스를 불러오지 못했습니다. 잠시 후 다시 시도하거나 전체 검색 결과를 확인하세요.</div>';
      const retry=document.createElement("button");retry.type="button";retry.className="person-news-retry";retry.textContent="다시 불러오기";retry.addEventListener("click",()=>{loadingNews.delete(section);loadNews(section);});list.appendChild(retry);
    }finally{loadingNews.delete(section);}
  }

  let newsObserver=null;
  function observeNews(){
    if(newsObserver) newsObserver.disconnect();
    const sections=[...root.querySelectorAll(".person-news")];
    if("IntersectionObserver" in window){
      newsObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){loadNews(entry.target);newsObserver.unobserve(entry.target);}}),{rootMargin:"250px 0px"});
      sections.forEach(section=>{if(!loadedNews.has(section))newsObserver.observe(section);});
    }else sections.forEach(loadNews);
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
    window.scrollTo({top:0,behavior:"smooth"});
  }));
  render();
})();

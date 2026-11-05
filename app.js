const WORKER='https://st.mcraft-tiger-574.workers.dev';
const DESKTOP='https://stock.naver.com';
const $=id=>document.getElementById(id);
const kinds={
 priceTop:{title:'거래대금 상위 50',desc:'당일 누적 거래대금 순',metric:'거래대금',order:'priceTop'},
 quantTop:{title:'거래량 상위 50',desc:'당일 누적 거래량 순',metric:'거래량',order:'quantTop'},
 popular:{title:'인기 종목 50',desc:'네이버 증권 검색 인기 순위',metric:'인기 지수',order:'popular'},
 marketSum:{title:'시가총액 상위 50',desc:'시가총액 순',metric:'시가총액',order:'marketSum'},
 up:{title:'상승률 상위 50',desc:'당일 등락률 높은 순',metric:'등락률',order:'up'},
 down:{title:'하락률 상위 50',desc:'당일 등락률 낮은 순',metric:'등락률',order:'down'}
};
let active='priceTop',market='ALL',cache={};
// 종목코드 우선 분류. 회사명 키워드 추정보다 정확한 코드 매핑을 먼저 적용합니다.
const sectorMap={
 // 반도체·전자부품
 '000660':['반도체','DRAM·NAND·HBM'],'005930':['반도체·전자','메모리·파운드리·스마트폰'],'005935':['반도체·전자','삼성전자 우선주'],
 '042700':['반도체 장비','HBM·패키징 장비'],'092870':['반도체 장비','메모리·SSD 테스트'],'080220':['반도체','저전력 메모리·팹리스'],
 '353200':['전자부품','PCB·패키지 기판'],'008060':['지주·전자','전자소재·계열사 투자'],'222800':['전자부품','PCB·기판'],'009150':['전자부품','MLCC·FC-BGA·카메라모듈'],
 '000990':['반도체','웨이퍼·반도체 소재'],'036930':['반도체 장비','검사·측정 장비'],'039030':['반도체 장비','검사·계측 장비'],
 '058470':['반도체 장비','후공정·패키징 장비'],'240810':['반도체 장비','후공정 테스트 장비'],'036810':['반도체 장비','프로브카드·검사부품'],
 '089030':['반도체 장비','검사장비·부품'],'095340':['반도체 장비','테스트 핸들러'], '005290':['반도체 소재','특수가스·소재'],'036540':['반도체 소재','반도체·디스플레이 소재'],'078600':['반도체 장비','반도체 공정장비'],
 '067310':['전자부품','PCB·전자회로'], // 2차전지·소재·화학
 '006400':['2차전지','배터리 셀·에너지저장장치'],'373220':['2차전지','전기차 배터리'],'051910':['화학·2차전지','석유화학·양극재'],'003670':['2차전지 소재','양극재'],'005490':['철강·소재','철강·리튬·2차전지 소재'],
 '247540':['2차전지 소재','양극재'],'086520':['2차전지 소재','양극재·전구체'],'066970':['2차전지 소재','전해액'],
 '010950':['에너지·정유','정유·석유화학'],'096770':['에너지·정유','정유·윤활유'],'267250':['화학','석유화학·합성수지'],
 // 전력·에너지·건설·기계
 '034020':['에너지·발전','발전설비·원전'],'298040':['전력기기','변압기·전력기기'],'267260':['전력기기','전력설비·변압기'],'010120':['전력기기','전력자동화·차단기'],
 '015760':['전력·유틸리티','전력 공급'],'051600':['전력·유틸리티','전력 공급'],'003490':['운송·물류','항공·물류'],'042670':['건설기계','굴착기·건설장비'],
 '241560':['전력기기','전력망·변압기'],'000720':['건설','건축·토목'],'047040':['건설·플랜트','플랜트·인프라'],
 '028050':['건설','건축·토목'],'006360':['건설','주택·건축'],'000210':['기계·산업재','산업기계·건설장비'],'034730':['지주·에너지','지주·에너지·화학'],
 // 자동차·운송
 '005380':['자동차','완성차·모빌리티'],'000270':['자동차','완성차·모빌리티'],'012330':['자동차부품','모듈·전장'],'018880':['자동차부품','자동차 부품'],
 '161390':['자동차부품','자동차 전장·부품'],'086280':['자동차부품','자동차 부품'],
 '003490':['운송·물류','항공·물류'],'020560':['운송·물류','항공·물류'],'028670':['운송·물류','종합물류'],'000120':['운송·물류','종합물류·택배'],
 // 조선·방산·우주
 '042660':['조선','상선·특수선'],'329180':['조선','선박·엔진'],'009300':['비철금속','알루미늄 압연·가공'],'012450':['방산·우주','항공엔진·방산'],'079550':['방산','무기체계·방산전자'],
 '272210':['방산','유도무기·방산'],'047810':['방산·항공','항공기·방산'],'211270':['우주·통신','위성통신'],
 // 바이오·헬스케어
 '207940':['바이오','바이오의약품 위탁생산'],'068270':['바이오','바이오시밀러·의약품'],'196170':['바이오','항체·바이오 플랫폼'],'064550':['바이오','바이오시밀러·의약품'],
 '141080':['바이오','진단·의료기기'],'145020':['바이오','항암 신약'],'000100':['제약','전문의약품'],'128940':['제약','전문의약품'],'009420':['제약','의약품'],'185750':['제약','의약품'],'000250':['바이오','바이오의약품'],'091990':['바이오','세포·유전자 치료제'],
 // 인터넷·게임·콘텐츠·통신·보안
 '035420':['인터넷·플랫폼','검색·커머스·클라우드'],'035720':['인터넷·플랫폼','메신저·콘텐츠·핀테크'],'017670':['통신','무선통신·통신서비스'],'030200':['통신','유무선 통신'],'032640':['통신','통신서비스'],
 '263750':['게임','온라인·모바일 게임'],'036570':['게임','온라인 게임'],'251270':['게임','모바일 게임'],'112040':['게임','모바일 게임'],
 '053800':['사이버보안','정보보안 솔루션'],
 '035900':['엔터테인먼트','음악·아티스트 매니지먼트'],'041510':['엔터테인먼트','음악·콘텐츠'],'352820':['엔터테인먼트','음악·플랫폼'],'122870':['엔터테인먼트','음악·콘텐츠'],
 // 금융·지주·소비재·유통
 '105560':['금융','금융지주·은행'],'055550':['금융','금융지주·은행'],'086790':['금융','금융지주·은행'],'316140':['금융','금융지주·은행'],'024110':['금융','은행'],'005940':['금융','증권'],'016360':['금융','증권'],'032830':['보험','생명보험'],'000810':['보험','손해보험'],'003550':['지주회사','지주·투자'],'028260':['지주회사','지주·건설·상사'],
 '090430':['화장품·뷰티','화장품'],'278470':['화장품·뷰티','화장품'],'214150':['헬스케어·미용기기','미용 의료기기'],'018260':['IT서비스','시스템통합·IT서비스'],'023530':['유통·소비재','대형마트·유통'],'004170':['유통·소비재','백화점·유통'],'139480':['유통·소비재','백화점·유통'],
 '004370':['식품','식품 제조'],'097950':['식품','식품·바이오'],'271560':['식품','식품 제조'],'033780':['식품','식품·음료'],'003230':['식품','식품 제조'],
};
// 회사명 기반 보완 규칙: 코드 사전에 없는 신규·중소형 종목에 적용합니다.
const nameRules=[
 [/반도체|하이닉스|칩|테크윙|테스트|프로브|패키지|PCB|기판|팹리스|웨이퍼|후공정|리노공업|한미반도체|엑시콘|주성엔지니어링|원익|하나마이크론|두산테스나/,'반도체·전자','반도체 제조·장비·부품'],
 [/배터리|에너지솔루션|SDI|퓨처엠|엘앤에프|에코프로|포스코퓨처엠|전해액|양극재|음극재|리튬|폐배터리/,'2차전지·소재','배터리·양극재·전해질·재활용'],
 [/전력|일렉트릭|변압기|전선|케이블|효성중공업|산일전기|제룡전기/,'전력기기·전력망','변압기·전선·배전·전력 자동화'],
 [/원전|두산에너빌리티|한전기술|한전KPS|발전|수력|태양광|풍력|수소|신재생/,'에너지·발전','발전설비·원전·신재생에너지'],
 [/바이오|제약|셀트리온|알테오젠|리가켐|에이비엘|삼천당|유한양행|한미약품|HLB|녹십자|보로노이|신약|진단/,'바이오·제약','의약품·바이오 플랫폼·진단'],
 [/조선|해양|한화오션|HD현대|삼성중공업|케이조선|선박|엔진/,'조선·해양','선박·엔진·해양플랜트'],
 [/방산|한화시스템|현대로템|LIG넥스원|한국항공우주|항공우주|위성|우주/,'방산·우주항공','방산장비·항공기·위성'],
 [/자동차|모비스|기아|현대차|타이어|만도|HL만도|성우하이텍|화신|에스엘/,'자동차·부품','완성차·전장·자동차부품'],
 [/은행|금융지주|증권|보험|카드|캐피탈|저축은행|투자증권/,'금융','은행·증권·보험·금융서비스'],
 [/건설|건설산업|토건|엔지니어링|플랜트|인프라|시멘트|레미콘/,'건설·인프라','건축·토목·플랜트·건자재'],
 [/게임|소프트맥스|펄어비스|크래프톤|엔씨소프트|넷마블|카카오게임즈|위메이드/,'게임','게임 개발·퍼블리싱'],
 [/엔터|스튜디오|미디어|방송|콘텐츠|음악|음반|웹툰|광고/,'콘텐츠·미디어','엔터테인먼트·방송·콘텐츠'],
 [/통신|텔레콤|네트웍스|네트워크|위성통신/,'통신·네트워크','통신서비스·네트워크 장비'],
 [/보안|시큐|안랩|인증|정보보호|사이버/,'사이버보안','정보보안·인증 솔루션'],
 [/화장품|뷰티|미용|에이피알|아모레|코스맥스|한국콜마/,'화장품·뷰티','화장품·미용기기·ODM'],
 [/식품|푸드|제과|제당|음료|라면|사료|유업|빙과/,'식품·음료','식품 제조·가공·유통'],
 [/유통|백화점|마트|홈쇼핑|편의점|면세|리테일/,'유통·소비재','유통·판매·소매'],
 [/항공|대한항공|아시아나|한진칼|물류|택배|해운|운수|항만/,'운송·물류','항공·해운·육상운송·물류'],
 [/철강|금속|동국제강|현대제철|고려아연|풍산|세아/,'철강·금속','철강·비철금속·소재'],
 [/화학|케미칼|석유|정유|가스|에너지/,'화학·에너지','석유화학·정유·가스'],
 [/로봇|자동화|스마트팩토리|공장자동화/,'로봇·자동화','산업용 로봇·공장 자동화'],
 [/지주|홀딩스|홀딩|그룹/,'지주·투자','계열사 지배·투자 및 사업 포트폴리오']
];
const LSK={ovr:'sector_override_v1',ind:'sector_naver_v1'};
const ldLS=k=>{try{return JSON.parse(localStorage.getItem(k)||'{}')}catch(e){return {}}};
const svLS=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
let ovr=ldLS(LSK.ovr),indC=ldLS(LSK.ind),noEtf=false,cur=[];const tried=new Set();
[[/소프트|시스템|정보통신|데이터|클라우드|인공지능|솔루션/,'IT·소프트웨어','소프트웨어·IT서비스·AI'],
 [/의료|메디|헬스|덴탈|임플란트/,'의료기기·헬스케어','의료기기·진단·헬스케어'],
 [/디스플레이|OLED|LED|광학|카메라|센서|이노텍|전자/,'전자부품·디스플레이','전자부품·디스플레이·센서'],
 [/여행|호텔|레저|카지노|관광/,'여행·레저','여행·호텔·카지노'],
 [/섬유|의류|패션|화섬|방직|신발/,'패션·섬유','의류·섬유·패션'],
 [/교육|출판|에듀/,'교육·출판','교육·출판'],
 [/기계|중공업|공작|밸브|펌프/,'기계·산업재','산업기계·설비'],
 [/리츠|부동산/,'부동산·리츠','리츠·부동산'],
 [/제지|포장|유리/,'소재·포장','제지·포장·유리']].forEach(r=>nameRules.push(r));
const etfRe=/^(KODEX|TIGER|ACE|RISE|SOL|KBSTAR|ARIRANG|HANARO|PLUS|KOSEF|WON|1Q|TIMEFOLIO|TREX|히어로즈|마이티|SMART|FOCUS|BNK|KIWOOM|ITF)/i;
function etfKind(n){
 if(/레버리지|2X|3X/i.test(n))return '레버리지';if(/인버스|곱버스/.test(n))return '인버스';
 if(/채권|국고채|머니마켓|CD금리|KOFR|단기/.test(n))return '채권·금리';if(/골드|금현물|구리|원유|WTI|은선물|원자재/.test(n))return '원자재';
 if(/배당|커버드콜|월배당|프리미엄/.test(n))return '배당·커버드콜';if(/미국|나스닥|S&P|해외|차이나|중국|일본|인도|베트남|글로벌/i.test(n))return '해외지수·테마';
 if(/반도체|AI|2차전지|배터리|바이오|조선|방산|로봇|전력|원자력|원전|리츠|증권|은행|헬스|게임|K-?컬처/i.test(n))return '국내 섹터·테마';
 if(/200|코스피|코스닥|KRX|지수|트레이딩/.test(n))return '국내 시장지수';return '기타 ETF';
}
const isEtf=x=>/etf|etn/i.test(x.endType||'')||etfRe.test(x.name||'')||/ETN(\(|$)/.test(x.name||'');
function nvNorm(v){return String(v).trim().replace(/^(.+?)[와과](.+)$/,'$1·$2')}
// 우선순위: 직접 지정 > ETF > 종목코드 사전 > 우선주(보통주 따라감) > 네이버 업종 > 이름 규칙 > 미확인
function classify(x){
 const code=String(x.code||'').toUpperCase(),name=String(x.name||''),n=name.replace(/\s+/g,'');
 if(ovr[code])return [ovr[code],'직접 지정','ovr'];
 if(isEtf(x))return ['ETF·ETN',etfKind(name),'etf'];
 if(sectorMap[code])return [...sectorMap[code],'map'];
 if(/우[A-C]?(\(전환\))?$/.test(n)&&code.slice(-1)!=='0'){const b=sectorMap[code.slice(0,5)+'0'];if(b)return [b[0],b[1]+' (우선주)','map']}
 if(indC[code])return [nvNorm(indC[code]),'네이버 증권 업종','naver'];
 for(const [re,s,d] of nameRules)if(re.test(n))return [s,d,'rule'];
 return ['업종 미확인','탭하여 직접 지정','unknown'];
}
function findInd(o,d=0){
 if(!o||typeof o!=='object'||d>6)return null;
 for(const [k,v] of Object.entries(o))if(typeof v==='string'&&/industry(Name|GroupKor|Kor)|upjong|sectorName/i.test(k)&&/[가-힣]/.test(v))return v;
 for(const v of Object.values(o)){const r=findInd(v,d+1);if(r)return r}return null;
}
async function enrich(list){
 const t=list.filter(x=>(x.src==='unknown'||x.src==='rule')&&!indC[x.code]&&!tried.has(x.code));
 if(!t.length)return;let hit=0;
 for(let i=0;i<t.length;i+=6){
  await Promise.all(t.slice(i,i+6).map(async x=>{tried.add(x.code);
   try{const j=await fetchJson(`https://m.stock.naver.com/api/stock/${x.code}/integration`);const v=findInd(j);if(v){indC[x.code]=v;hit++}}catch(e){}}));
 }
 if(hit){svLS(LSK.ind,indC);render(cache[active]||[])}
}
function num(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='object')v=v.value??v.formattedValue??v.text??v.price??v.amount??v.closePrice;const s=String(v).replace(/,/g,'').replace(/[원주%]/g,'').trim();const n=Number(s);return Number.isFinite(n)?n:null}
function first(o,keys){for(const k of keys){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=='')return o[k]}return null}
function fmt(v){if(v===null||v===undefined)return '—';return Math.round(v).toLocaleString('ko-KR')}
function money(v){if(v===null||v===undefined)return '—';if(v>=1e12)return (v/1e12).toFixed(2)+'조';if(v>=1e8)return (v/1e8).toFixed(0)+'억';return fmt(v)}
function pct(v){if(v===null||v===undefined)return '—';return (v>0?'+':'')+v.toFixed(2)+'%'}
function codeOf(v){let s=String(v||'').toUpperCase().replace(/^A(?=\d{6}$)/,'');const m=s.match(/[0-9A-Z]{6}/);return m?m[0]:''}
function getRows(root){
 const codeKeys=['itemCode','itemcode','stockCode','stockcode','code','reutersCode','symbolCode','shortCode','isuCd','ISU_CD','stockItemCode'];
 const nameKeys=['itemName','itemname','stockName','stockname','name','stockNm','korName','isuNm','ISU_NM','koreanName','displayName'];
 const seen=new Set();
 function normalize(o){
  const code=codeOf(first(o,codeKeys)),name=String(first(o,nameKeys)||'').trim();
  if(!code||!name||seen.has(code))return null;seen.add(code);
  const priceObj=o.price?.krx||o.price?.nxt||o.price||{};
  const price=num(first(o,['closePrice','currentPrice','nowPrice','tradePrice','priceValue'])??first(priceObj,['closePrice','currentPrice','nowPrice','tradePrice']));
  const rate=num(first(o,['fluctuationsRatio','changeRate','compareToPreviousCloseRate','changeRateValue'])??first(priceObj,['fluctuationsRatio','changeRate','compareToPreviousCloseRate']));
  const value=num(first(o,['accumulatedTradingValue','tradingValue','accAmount','priceTop','tradeValue','totalTradingValue']));
  const volume=num(first(o,['accumulatedTradingVolume','tradingVolume','accQuant','quantTop','volume','totalTradingVolume']));
  const cap=num(first(o,['marketValue','marketCap','marketSum','marketCapitalization','marketCapital']));
  const hit=num(first(o,['hitCount','searchCount','count','rankingValue']));
  const endType=String(first(o,['stockEndType','endType','stockType'])||'');const [sector,detail,src]=classify({code,name,endType});
  const rawDiff=num(first(o,['compareToPreviousClosePrice','compareToPreviousPrice','changePrice','prevChangePrice'])??first(priceObj,['compareToPreviousClosePrice','compareToPreviousPrice']));
  let diff=rawDiff!==null?Math.abs(rawDiff):(price!==null&&rate!==null?Math.abs(price-price/(1+rate/100)):null);if(diff!==null&&rate<0)diff=-diff;
  const mv=first(o,['marketType','market','stockExchangeType','exchangeType']);return {code,name,price,rate,diff,value,volume,cap,hit,sector,detail,src,endType,market:String(mv&&typeof mv==='object'?(mv.name||mv.code||''):(mv||'')).toUpperCase()};
 }
 function walk(node,depth=0){
  if(!node||typeof node!=='object'||depth>9)return [];
  if(Array.isArray(node)){
   const out=node.map(v=>v&&typeof v==='object'&&!Array.isArray(v)?normalize(v):null).filter(Boolean);
   if(out.length>=1)return out;
   for(const v of node){const got=walk(v,depth+1);if(got.length)return got;}return [];
  }
  const preferred=['items','stocks','stockList','stocklist','result','data','list','contents','rankings','rankingList','domesticStocks','stockItems','searchTopList'];
  for(const k of preferred)if(node[k]&&typeof node[k]==='object'){const got=walk(node[k],depth+1);if(got.length)return got;}
  for(const [k,v] of Object.entries(node))if(!preferred.includes(k)&&v&&typeof v==='object'){const got=walk(v,depth+1);if(got.length)return got;}
  return [];
 }
 return walk(root);
}
async function fetchJson(url){
 const r=await fetch(WORKER+'/?url='+encodeURIComponent(url),{cache:'no-store'});
 if(!r.ok)throw new Error('데이터 요청 오류 ('+r.status+')');
 return r.json();
}
async function load(kind=active,force=false){
 active=kind;
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.kind===kind));
 const cfg=kinds[kind];$('summary-title').textContent=cfg.title;$('list-title').textContent=cfg.title;$('list-desc').textContent=cfg.desc;$('metric-head').textContent=cfg.metric;
 $('rows').innerHTML='<tr><td colspan="7" class="empty">순위를 불러오는 중입니다…</td></tr>';
 try{
  let data;
  if(!force&&cache[kind])data=cache[kind];
  else{
   let url;
   if(kind==='popular')url=`${DESKTOP}/api/domestic/market/searchTop?nationType=KOR&startIdx=0&pageSize=50`;
   else url=`${DESKTOP}/api/domestic/market/stock/default?tradeType=KRX&marketType=${market}&orderType=${cfg.order}&startIdx=0&pageSize=100`;
   const raw=await fetchJson(url);data=getRows(raw);
   if(data.length<10)throw new Error(`응답에서 종목 ${data.length}개만 확인했습니다. 원본 API 구조가 변경됐을 수 있습니다.`);
   cache[kind]=data;
  }
  render(data);
  $('updated').textContent='조회 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 }catch(e){$('rows').innerHTML=`<tr><td colspan="7" class="error">${escapeHtml(e.message)}<br><small>Cloudflare Worker 주소와 배포 상태를 확인해 주세요.</small></td></tr>`;$('updated').textContent='조회 실패'}
}
function agg(list){
 const tot=list.reduce((s,x)=>s+(x.value||0),0),w=x=>tot>0?(x.value||0):1,W=list.reduce((s,x)=>s+w(x),0)||1,g={};
 list.forEach(x=>{const a=g[x.sector]||(g[x.sector]={n:0,w:0,rw:0,top:x});a.n++;a.w+=w(x);a.rw+=(x.rate||0)*w(x)});
 return {tot,W,avg:list.reduce((s,x)=>s+(x.rate||0)*w(x),0)/W,arr:Object.entries(g).map(([s,a])=>({s,n:a.n,share:a.w/W*100,avg:a.w?a.rw/a.w:0,top:a.top.name})).sort((a,b)=>b.share-a.share||b.n-a.n)};
}
const cls2=v=>v>0?'up':v<0?'down':'';
function render(data){
 data.forEach(x=>{[x.sector,x.detail,x.src]=classify(x)});
 let rows=market==='ALL'||active==='popular'?data:data.filter(x=>!x.market||x.market.includes(market));
 if(noEtf)rows=rows.filter(x=>x.sector!=='ETF·ETN');
 const list=rows.slice(0,50);cur=list;
 const up=list.filter(x=>(x.rate||0)>0).length,down=list.filter(x=>(x.rate||0)<0).length,flat=list.length-up-down;
 $('summary-count').textContent=list.length+'개';
 $('summary-breadth').innerHTML=`<span class="up">${up}</span> / <span class="down">${down}</span>`;
 $('rows').innerHTML=list.map((x,i)=>{
  const metric=active==='priceTop'?money(x.value):active==='quantTop'?fmt(x.volume):active==='marketSum'?money(x.cap):active==='popular'?fmt(x.hit):pct(x.rate);
  const d=x.diff===null||x.diff===undefined?'—':(x.diff>0?'▲':x.diff<0?'▼':'')+fmt(Math.abs(x.diff));
  return `<tr><td class="rank">${i+1}</td><td class="stock"><b>${escapeHtml(x.name)}</b><small>${x.code}${x.market?' · '+(x.market.includes('KOSDAQ')?'코스닥':x.market.includes('KOSPI')?'코스피':''):''}</small></td><td class="num">${fmt(x.price)}</td><td class="num ${cls2(x.rate)}">${d}</td><td class="rate ${cls2(x.rate)}">${pct(x.rate)}</td><td class="num metric">${metric}</td><td class="sector ed" data-code="${x.code}" title="탭하여 섹터 수정"><b>${escapeHtml(x.sector)}</b><small>${escapeHtml(x.detail)}</small></td></tr>`;
 }).join('')||'<tr><td colspan="7" class="empty">해당 시장의 종목이 없습니다.</td></tr>';
 const {tot,avg,arr}=agg(list),top5=list.slice(0,5).reduce((s,x)=>s+(x.value||0),0);
 const mk=m=>list.filter(x=>x.market.includes(m)).reduce((s,x)=>s+(x.value||0),0),etf=list.filter(x=>x.sector==='ETF·ETN').reduce((s,x)=>s+(x.value||0),0);
 const st=[['총 거래대금',tot>0?money(tot):'—'],['가중 평균 등락률',`<span class="${cls2(avg)}">${pct(avg)}</span>`],['상승/보합/하락',`<span class="up">${up}</span>/${flat}/<span class="down">${down}</span>`],['상위5 집중도',tot>0?(top5/tot*100).toFixed(0)+'%':'—'],['코스피:코스닥',tot>0&&mk('KOSPI')+mk('KOSDAQ')>0?Math.round(mk('KOSPI')/tot*100)+':'+Math.round(mk('KOSDAQ')/tot*100):'—'],['ETF·ETN 비중',tot>0?(etf/tot*100).toFixed(0)+'%':'—']];
 $('stat-grid').innerHTML=st.map(([a,b])=>`<div class="summary-card"><span>${a}</span><b>${b}</b></div>`).join('');
 $('sector-total').textContent=arr.length+'개 섹터';
 $('sector-list').innerHTML='<table class="sec-t"><thead><tr><th>섹터</th><th>종목</th><th>비중</th><th>평균</th><th>대표</th></tr></thead><tbody>'+arr.map(a=>`<tr><td><b>${escapeHtml(a.s)}</b></td><td class="num">${a.n}</td><td><div class="bar"><i style="width:${a.share}%"></i></div><small>${a.share.toFixed(1)}%</small></td><td class="rate ${cls2(a.avg)}">${pct(a.avg)}</td><td><small>${escapeHtml(a.top)}</small></td></tr>`).join('')+'</tbody></table>';
 const real=arr.filter(a=>a.s!=='ETF·ETN'&&a.s!=='업종 미확인'),big=real.filter(a=>a.n>=2),T=[];
 if(real[0])T.push(`<b>자금 쏠림</b> · ${escapeHtml(real[0].s)}에 ${tot>0?'거래대금':'종목'} ${real[0].share.toFixed(0)}% 집중 (${real[0].n}종목, 평균 <span class="${cls2(real[0].avg)}">${pct(real[0].avg)}</span>)`);
 if(real[1])T.push(`<b>2·3위 섹터</b> · ${real.slice(1,3).map(a=>escapeHtml(a.s)+' '+a.share.toFixed(0)+'%').join(', ')}`);
 const bs=[...big].sort((a,b)=>b.avg-a.avg);
 if(bs.length>1)T.push(`<b>강세 섹터</b> · ${escapeHtml(bs[0].s)} <span class="up">${pct(bs[0].avg)}</span> / <b>약세 섹터</b> · ${escapeHtml(bs[bs.length-1].s)} <span class="down">${pct(bs[bs.length-1].avg)}</span>`);
 const sr=[...list].sort((a,b)=>(b.rate||0)-(a.rate||0));
 if(list.length>5){T.push(`<b>대금 상위 급등</b> · ${sr.slice(0,3).map(x=>`${escapeHtml(x.name)} <span class="up">${pct(x.rate)}</span>`).join(', ')}`);T.push(`<b>대금 상위 급락</b> · ${sr.slice(-3).reverse().map(x=>`${escapeHtml(x.name)} <span class="down">${pct(x.rate)}</span>`).join(', ')}`)}
 if(list.length){const r=up/Math.max(1,up+down);T.unshift(`<b>분위기</b> · ${r>=.65&&avg>0?'강세 우위':r<=.35&&avg<0?'약세 우위':'혼조'} (상승 ${up} · 하락 ${down}${tot>0?', 상위5 집중도 '+(top5/tot*100).toFixed(0)+'%'+(top5/tot>.45?' → 소수 종목 쏠림':' → 분산'):''})`)}
 $('trend-list').innerHTML=T.map(t=>`<li>${t}</li>`).join('')||'<li>데이터를 불러오는 중입니다.</li>';
 const un=list.filter(x=>x.sector==='업종 미확인').length;
 $('classify-note').textContent=un?`업종 미확인 ${un}종목 · 섹터 칸을 눌러 직접 지정하면 저장됩니다.`:'모든 종목의 섹터가 분류되었습니다.';
 enrich(list);
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-kind]');if(b){market='ALL';document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('selected',x.dataset.market==='ALL'));load(b.dataset.kind)}});
document.querySelectorAll('.filters button').forEach(b=>b.addEventListener('click',()=>{market=b.dataset.market;document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('selected',x===b));cache[active]=null;load(active,true)}));
$('refresh').addEventListener('click',()=>load(active,true));
load();

$('rows').addEventListener('click',e=>{const c=e.target.closest('td.ed');if(!c)return;const code=c.dataset.code,x=cur.find(y=>y.code===code);
 const v=prompt(`${x?x.name:code} 섹터 입력 (비우면 직접 지정 해제)`,ovr[code]||x?.sector||'');if(v===null)return;
 v.trim()?ovr[code]=v.trim():delete ovr[code];svLS(LSK.ovr,ovr);render(cache[active]||[])});
$('etfToggle').addEventListener('click',e=>{noEtf=!noEtf;e.target.classList.toggle('selected',noEtf);render(cache[active]||[])});

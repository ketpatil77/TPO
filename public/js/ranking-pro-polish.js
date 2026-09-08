(() => {
  if (window.__AIT_RANKING_PRO_POLISH__) return;
  window.__AIT_RANKING_PRO_POLISH__ = true;

  const HISTORY_KEY = 'ait-ranking-history-v1';
  const state = { query:'', sort:'rank' };
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
  let nativeFetch = null;
  let timer = null;

  function css() {
    if (document.querySelector('link[data-ranking-pro-polish]')) return;
    const link=document.createElement('link'); link.rel='stylesheet';
    link.href='/css/ranking-pro-polish.css?v=20260908-2'; link.dataset.rankingProPolish='true';
    document.head.appendChild(link);
  }

  function filters() {
    return { branch:document.getElementById('rankingBranch')?.value||'all', year:document.getElementById('rankingYear')?.value||'all' };
  }
  function cgpa(row) { return num(row?.cgpa ?? row?.cgpa_overall); }
  function compare(a,b) {
    if (state.sort==='cgpa') return cgpa(b)-cgpa(a)||num(b.points)-num(a.points)||String(a.name||'').localeCompare(String(b.name||''));
    if (state.sort==='points') return num(b.points)-num(a.points)||String(a.name||'').localeCompare(String(b.name||''));
    if (state.sort==='name') return String(a.name||'').localeCompare(String(b.name||''))||num(b.points)-num(a.points);
    return num(a.rank)-num(b.rank)||String(a.name||'').localeCompare(String(b.name||''));
  }
  function transform(payload) {
    if (!payload?.data?.rows || (!state.query&&state.sort==='rank')) return payload;
    const f=filters();
    let rows=payload.data.rows.filter(row=>{
      const branchOk=f.branch==='all'||String(row.branch||'').toUpperCase()===String(f.branch).toUpperCase();
      const yearOk=f.year==='all'||String(row.year||'').toLowerCase()===String(f.year).toLowerCase();
      const text=`${row.name||''} ${row.branch||''} ${row.year||''}`.toLowerCase();
      return branchOk&&yearOk&&(!state.query||text.includes(state.query));
    }).sort(compare);
    let previous=null, rank=0;
    rows=rows.map((row,index)=>{
      const key=state.sort==='cgpa'?cgpa(row):state.sort==='points'?num(row.points):state.sort==='name'?String(row.name||'').toLowerCase():num(row.rank);
      if(previous===null||key!==previous) rank=index+1;
      previous=key;
      return {...row,rank};
    });
    return {...payload,data:{...payload.data,rows}};
  }
  function installFetchGuard() {
    if(nativeFetch||typeof window.fetch!=='function') return;
    nativeFetch=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const url=typeof input==='string'?input:input?.url||'';
      const response=await nativeFetch(input,init);
      if(!String(url).includes('/api/student/rankings-view/fast')||(!state.query&&state.sort==='rank')) return response;
      try { const transformed=transform(await response.clone().json()); return new Response(JSON.stringify(transformed),{status:response.status,statusText:response.statusText,headers:response.headers}); }
      catch(_) { return response; }
    };
  }
  function refresh() { document.getElementById('rankingRefresh')?.click(); }
  function ensureToolbar() {
    const list=document.getElementById('rankingStableListV4');
    if(!list||document.getElementById('rankingProToolbar')) return;
    const toolbar=document.createElement('section'); toolbar.id='rankingProToolbar'; toolbar.className='glass-card ranking-pro-toolbar';
    toolbar.setAttribute('aria-label','Leaderboard controls');
    toolbar.innerHTML='<div class="ranking-pro-toolbar-head"><div class="ranking-pro-toolbar-copy"><span class="eyebrow">Leaderboard controls</span><strong>Find and compare students</strong></div><span class="ranking-pro-count" aria-live="polite"></span></div><div class="ranking-pro-toolbar-grid"><label class="ranking-pro-search"><span class="sr-only">Search students</span><input id="rankingProSearch" type="search" autocomplete="off" placeholder="Search student name, branch or year" aria-label="Search students"></label><label class="ranking-pro-sort"><span>Sort</span><select id="rankingProSort" aria-label="Sort leaderboard"><option value="rank">Rank</option><option value="points">Profile Points</option><option value="cgpa">CGPA</option><option value="name">Name</option></select></label><button type="button" id="rankingProClear" class="btn btn-secondary ranking-pro-clear" hidden>Clear</button></div><p class="ranking-pro-hint">Search and sorting update the visible leaderboard without changing the underlying Profile Points calculation.</p>';
    list.before(toolbar);
    const search=toolbar.querySelector('#rankingProSearch'), sort=toolbar.querySelector('#rankingProSort'), clear=toolbar.querySelector('#rankingProClear');
    search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.query=search.value.trim().toLowerCase();clear.hidden=!state.query;refresh();},220);});
    sort.addEventListener('change',()=>{state.sort=sort.value||'rank';refresh();});
    clear.addEventListener('click',()=>{search.value='';sort.value='rank';state.query='';state.sort='rank';clear.hidden=true;refresh();search.focus();});
  }
  function history() {
    const current=window.__AIT_RANKING_FAST_SNAPSHOT__?.current;
    if(!current?.student_id||!current.rank) return;
    let items=[]; try{items=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');}catch(_){items=[];}
    const next={rank:num(current.rank),points:num(current.points),at:new Date().toISOString()};
    const recent=items.filter(item=>Date.now()-new Date(item.at||0).getTime()<30*86400000);
    const last=recent[recent.length-1];
    if(!last||last.rank!==next.rank||last.points!==next.points||Date.now()-new Date(last.at).getTime()>6*3600000) recent.push(next);
    recent.splice(0,Math.max(0,recent.length-8)); localStorage.setItem(HISTORY_KEY,JSON.stringify(recent)); renderHistory(recent);
  }
  function renderHistory(items) {
    const shell=document.getElementById('rankingCompetitionV1'); if(!shell) return;
    let panel=document.getElementById('rankingHistoryPanel');
    if(!panel){panel=document.createElement('section');panel.id='rankingHistoryPanel';panel.className='glass-card ranking-history-panel';(shell.querySelector('.rank-chaos-lower')||shell).before(panel);}
    const list=[...items].reverse(), current=list[0], previous=list[1];
    const delta=current&&previous?previous.rank-current.rank:0;
    const label=delta>0?`↑ ${delta} rank${delta===1?'':'s'}`:delta<0?`↓ ${Math.abs(delta)} rank${delta===-1?'':'s'}`:'No recorded movement yet';
    panel.innerHTML=`<div class="ranking-history-head"><div><span class="eyebrow">Rank history</span><h3>Recent position trend</h3><p>Stored locally from your ranking visits. Official ranking remains server-calculated.</p></div><strong class="ranking-history-movement">${esc(label)}</strong></div><div class="ranking-history-list">${list.map((item,index)=>`<div class="ranking-history-item"><span>#${item.rank}</span><div><strong>${num(item.points).toFixed(1).replace(/\.0$/,'')} pts</strong><small>${index===0?'Latest':new Date(item.at).toLocaleDateString([], {day:'numeric',month:'short'})}</small></div></div>`).join('')||'<span class="rank-chaos-muted">No recorded movement yet.</span>'}</div>`;
  }
  function boot(attempt=0) {
    css(); installFetchGuard(); ensureToolbar(); history();
    if(!document.getElementById('rankingProToolbar')&&attempt<30)setTimeout(()=>boot(attempt+1),180);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot(),{once:true});else boot();
})();

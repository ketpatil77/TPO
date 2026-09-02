(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;
  const token = () => localStorage.getItem('tpo_token');
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = c => ({Python:'🐍',Programming:'⌨️',Excel:'📊',AI:'✦',SQL:'🗄️',Cloud:'☁️',ML:'🧠','Project Management':'📋',Cybersecurity:'🛡️','Data Analytics':'📈','Data Science':'🔬',Docker:'◫',JavaScript:'JS',Java:'☕',Tableau:'◈',Linux:'⌘',Agile:'↻',Communication:'💬','Six Sigma':'✓',Kanban:'▦','Digital Marketing':'◉','Quality Assurance':'⚙','Self Development':'◎',Microsoft:'▣',HTML:'<> '})[c] || '🎓';
  let state={mode:'courses',difficulty:'All',category:'All',progress:'All',q:'',data:null};

  async function api(path,options={}){
    const res=await fetch(path,{...options,headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json',...(options.headers||{})}});
    const json=await res.json(); if(!res.ok||!json.success) throw Error(json.error?.message||json.error||'Request failed'); return json.data;
  }

  function install(){
    if(document.getElementById('tab-free-learning')) return true;
    const tabs=document.querySelector('.tabs-nav');
    const anchor=tabs?.querySelector('[aria-controls="tab-ranking"]')||tabs?.querySelector('[aria-controls="tab-competitions"]')||tabs?.querySelector('[aria-controls="tab-certificates"]');
    if(!tabs||!anchor) return false;
    const btn=document.createElement('button');
    btn.className='tab-btn';btn.type='button';btn.setAttribute('role','tab');btn.setAttribute('aria-selected','false');btn.setAttribute('aria-controls','tab-free-learning');
    btn.innerHTML='Free Learning <span class="student-new-badge is-fresh">NEW</span>';
    btn.onclick=()=>{switchTab('free-learning',btn);load();};
    anchor.after(btn);
    const panel=document.createElement('div');panel.id='tab-free-learning';panel.className='tab-content';panel.setAttribute('role','tabpanel');
    panel.innerHTML='<div class="free-learning-shell"><div class="free-learning-empty">Loading free courses and certificates…</div></div>';
    const anchorPanel=document.getElementById(anchor.getAttribute('aria-controls'));
    (anchorPanel||document.querySelector('.tab-content:last-of-type'))?.after(panel);
    if(new URLSearchParams(location.search).get('tab')==='free-learning'){switchTab('free-learning',btn);load();}
    return true;
  }

  function params(){const p=new URLSearchParams({mode:state.mode});if(state.q)p.set('q',state.q);if(state.difficulty!=='All')p.set('difficulty',state.difficulty);if(state.category!=='All')p.set('category',state.category);return p.toString();}
  async function load(){
    const shell=document.querySelector('#tab-free-learning .free-learning-shell');if(!shell)return;
    shell.innerHTML='<div class="free-learning-empty">Loading recommendations for your branch and year…</div>';
    try{state.data=await api('/api/student/free-learning?'+params());render();}catch(e){shell.innerHTML=`<div class="free-learning-empty"><strong>Could not load Free Learning</strong><p>${esc(e.message)}</p><button class="btn btn-secondary btn-sm" id="flRetry">Retry</button></div>`;document.getElementById('flRetry').onclick=load;}
  }

  function filteredRows(){const rows=state.data?.rows||[];if(state.progress==='All')return rows;return rows.filter(r=>(r.state||'none')===state.progress.toLowerCase());}
  function render(){
    const d=state.data, shell=document.querySelector('#tab-free-learning .free-learning-shell');if(!d||!shell)return;
    const rows=filteredRows();
    shell.innerHTML=`
      <section class="free-learning-hero">
        <div class="free-learning-hero-top"><div class="free-learning-title"><span class="eyebrow">Free learning hub</span><h2><span class="free-learning-gradient">Learn. Earn. Grow.</span></h2><p>Verified free learning selected for your branch and current year, so you see useful courses instead of an internet landfill.</p></div><div class="free-learning-context"><span class="fl-chip">Branch <strong>${esc(d.student.branch)}</strong></span><span class="fl-chip">Year <strong>${esc(d.student.year)}</strong></span></div></div>
        <div class="free-learning-stats"><div class="free-learning-stat"><strong>${d.total}+</strong><span>Relevant resources</span></div><div class="free-learning-stat"><strong>100%</strong><span>Free to learn</span></div><div class="free-learning-stat"><strong>Verified</strong><span>Official source links</span></div><div class="free-learning-stat"><strong>Free</strong><span>Completion certificates</span></div></div>
      </section>
      <div class="free-learning-toolbar"><div class="free-learning-mode"><button data-mode="courses" class="${state.mode==='courses'?'active':''}">Courses</button><button data-mode="certificates" class="${state.mode==='certificates'?'active':''}">Free Certificates</button></div><div class="free-learning-search"><span>⌕</span><input id="freeLearningSearch" class="form-input" value="${esc(state.q)}" placeholder="Search courses, skills or providers…"></div></div>
      <div class="free-learning-filters" id="freeLearningDifficulty">${['All','Beginner','Intermediate','Advanced'].map(x=>`<button class="free-learning-filter ${state.difficulty===x?'active':''}" data-difficulty="${x}">${x==='All'?'Recommended':x}</button>`).join('')}</div>
      <div class="free-learning-filters" id="freeLearningCategories"><button class="free-learning-filter ${state.category==='All'?'active':''}" data-category="All">All categories</button>${d.categories.map(x=>`<button class="free-learning-filter ${state.category===x?'active':''}" data-category="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="free-learning-statusbar">${['All','Saved','Started','Completed'].map(x=>`<button class="${state.progress===x?'active':''}" data-progress="${x}">${x}</button>`).join('')}</div>
      <div class="free-learning-section-head"><div><h3>${state.progress==='All'?'Recommended for you':state.progress}</h3><p>Matched to ${esc(d.student.branch)} • ${esc(d.student.year)}</p></div><span class="free-learning-count">${rows.length} shown</span></div>
      <div class="free-learning-grid">${rows.length?rows.map(card).join(''):'<div class="free-learning-empty" style="grid-column:1/-1">No resources match these filters.</div>'}</div>`;
    wire();
  }

  function card(r){const saved=!!r.state;return `<article class="free-learning-card" data-id="${r.id}" data-state="${esc(r.state||'')}"><div class="free-learning-card-top"><div class="free-learning-icon">${esc(icon(r.category))}</div><button class="free-learning-bookmark ${saved?'is-saved':''}" data-state="saved" title="Save">${saved?'★':'☆'}</button></div><h4>${esc(r.title)}</h4><div class="free-learning-provider">${esc(r.provider)}</div><p class="free-learning-summary">${esc(r.summary)}</p><div class="free-learning-tags"><span class="fl-tag ${r.difficulty.toLowerCase()}">${esc(r.difficulty)}</span><span class="fl-tag">${esc(r.category)}</span><span class="fl-tag free">Free certificate</span><span class="fl-tag">${esc(r.relevance)} match</span></div><div class="free-learning-actions"><a class="btn btn-primary btn-sm" href="${esc(r.url)}" target="_blank" rel="noopener" data-start="${r.id}">View course →</a><button class="btn btn-secondary btn-sm fl-progress-btn" data-progress-menu="${r.id}">${r.state==='completed'?'Completed ✓':r.state==='started'?'Started':r.state==='saved'?'Saved':'Track'}</button></div>${r.state==='completed'?`<button class="btn btn-secondary btn-sm" data-add-cert="${r.id}" style="margin-top:8px;width:100%">Add earned certificate to profile</button>`:''}</article>`}

  function wire(){
    document.querySelectorAll('#tab-free-learning [data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;state.category='All';load();});
    document.querySelectorAll('#tab-free-learning [data-difficulty]').forEach(b=>b.onclick=()=>{state.difficulty=b.dataset.difficulty;load();});
    document.querySelectorAll('#tab-free-learning [data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;load();});
    document.querySelectorAll('#tab-free-learning [data-progress]').forEach(b=>b.onclick=()=>{state.progress=b.dataset.progress;render();});
    let t;document.getElementById('freeLearningSearch').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{state.q=e.target.value.trim();load();},300)};
    document.querySelectorAll('#tab-free-learning .free-learning-bookmark').forEach(b=>b.onclick=()=>saveState(Number(b.closest('[data-id]').dataset.id),'saved'));
    document.querySelectorAll('#tab-free-learning [data-start]').forEach(a=>a.onclick=()=>saveState(Number(a.dataset.start),'started',false));
    document.querySelectorAll('#tab-free-learning [data-progress-menu]').forEach(b=>b.onclick=()=>cycleState(Number(b.dataset.progressMenu)));
    document.querySelectorAll('#tab-free-learning [data-add-cert]').forEach(b=>b.onclick=()=>addCertificate(Number(b.dataset.addCert)));
  }
  async function saveState(id,next,reload=true){try{await api('/api/student/free-learning/progress',{method:'PUT',body:JSON.stringify({resource_id:id,state:next})});const r=state.data?.rows.find(x=>x.id===id);if(r)r.state=next;if(reload)render();}catch(e){window.showToast?.(e.message,'error')||alert(e.message)}}
  function cycleState(id){const r=state.data?.rows.find(x=>x.id===id);const next=!r?.state?'saved':r.state==='saved'?'started':r.state==='started'?'completed':'saved';saveState(id,next);}
  function addCertificate(id){const r=state.data?.rows.find(x=>x.id===id);if(!r)return;const certTab=document.querySelector('[aria-controls="tab-certificates"]');certTab?.click();setTimeout(()=>{window.openCertificateModal?.();setTimeout(()=>{const n=document.getElementById('certName'),i=document.getElementById('certIssuer');if(n)n.value=r.title;if(i)i.value=r.provider;document.getElementById('certDate')?.focus();},80);},80);}

  function boot(){if(install())return;const obs=new MutationObserver(()=>{if(install())obs.disconnect()});obs.observe(document.body,{childList:true,subtree:true});setTimeout(()=>obs.disconnect(),12000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
(() => {
  if (window.__AIT_FREE_LEARNING_V2__) return;
  window.__AIT_FREE_LEARNING_V2__ = true;
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const token = () => localStorage.getItem('tpo_token') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { mode:'courses', difficulty:'All', category:'All', progress:'All', q:'', data:null, visible:12, loading:false, requestId:0 };
  const icons = {Python:'Py',Programming:'</>',Excel:'XLS',AI:'AI',SQL:'DB',Cloud:'CLD',ML:'ML','Project Management':'PM',Cybersecurity:'SEC','Data Analytics':'DA','Data Science':'DS',Docker:'DKR',JavaScript:'JS',Java:'JV',Agile:'AG',Communication:'COM','Six Sigma':'6σ',Kanban:'KB','Quality Assurance':'QA','Self Development':'SD'};

  async function api(path, options={}) {
    const response = await fetch(path, { ...options, credentials:'same-origin', headers:{ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json', ...(options.headers||{}) } });
    const json = await response.json().catch(()=>({}));
    if (!response.ok || !json.success) throw new Error(json.error?.message || json.error || 'Request failed');
    return json.data;
  }

  function install() {
    if (document.getElementById('tab-free-learning')) return true;
    const tabs=document.querySelector('.tabs-nav');
    const anchor=tabs?.querySelector('[aria-controls="tab-ranking"]')||tabs?.querySelector('[aria-controls="tab-competitions"]')||tabs?.querySelector('[aria-controls="tab-certificates"]');
    if(!tabs||!anchor) return false;
    const button=document.createElement('button');
    button.className='tab-btn'; button.type='button'; button.setAttribute('role','tab'); button.setAttribute('aria-selected','false'); button.setAttribute('aria-controls','tab-free-learning');
    button.dataset.featureKey='free-learning'; button.dataset.featureStatus='new'; button.innerHTML='Free Learning <span class="student-new-badge is-new">NEW</span>';
    button.addEventListener('click',()=>{ window.switchTab?.('free-learning',button); if(!state.data) load({initial:true}); });
    anchor.after(button);
    const panel=document.createElement('div'); panel.id='tab-free-learning'; panel.className='tab-content'; panel.setAttribute('role','tabpanel');
    panel.innerHTML='<div class="free-learning-shell"><div class="free-learning-empty">Loading free learning resources…</div></div>';
    const anchorPanel=document.getElementById(anchor.getAttribute('aria-controls'));
    (anchorPanel||document.querySelector('.tab-content:last-of-type'))?.after(panel);
    window.AITFeatureStatus?.refresh?.();
    if(new URLSearchParams(location.search).get('tab')==='free-learning'){ window.switchTab?.('free-learning',button); load({initial:true}); }
    return true;
  }

  function queryString(){
    const p=new URLSearchParams({mode:state.mode});
    if(state.q)p.set('q',state.q); if(state.difficulty!=='All')p.set('difficulty',state.difficulty); if(state.category!=='All')p.set('category',state.category);
    return p.toString();
  }

  async function load({initial=false}={}){
    const shell=document.querySelector('#tab-free-learning .free-learning-shell'); if(!shell||state.loading)return;
    const requestId=++state.requestId; state.loading=true; document.getElementById('tab-free-learning')?.setAttribute('aria-busy','true');
    if(initial&&!state.data)shell.innerHTML='<div class="free-learning-empty">Finding verified free certificates for your branch and year…</div>';
    try{
      const data=await api('/api/student/free-learning?'+queryString());
      if(requestId!==state.requestId)return; state.data=data; state.visible=12; render();
    }catch(error){
      if(requestId!==state.requestId)return;
      shell.innerHTML=`<div class="free-learning-empty"><strong>Could not load Free Learning</strong><p>${esc(error.message)}</p><button class="btn btn-secondary btn-sm" id="flRetry">Retry</button></div>`;
      document.getElementById('flRetry')?.addEventListener('click',()=>load({initial:true}));
    }finally{ if(requestId===state.requestId){state.loading=false;document.getElementById('tab-free-learning')?.setAttribute('aria-busy','false');} }
  }

  function visibleRows(){
    const rows=state.data?.rows||[];
    return state.progress==='All'?rows:rows.filter(row=>(row.state||'none')===state.progress.toLowerCase());
  }

  function newBadge(row){ return row.is_new?'<span class="student-new-badge is-new free-learning-new-badge" aria-label="New certification">NEW</span>':''; }

  function card(row){
    const tracked=!!row.state;
    const stateLabel=row.state==='completed'?'Completed':row.state==='started'?'Started':row.state==='saved'?'Saved':'Track';
    return `<article class="free-learning-card glass-card ${row.is_new?'is-new-resource':''}" data-id="${row.id}" data-state="${esc(row.state||'')}">
      <div class="free-learning-card-topline">${newBadge(row)}<span class="free-learning-provider">${esc(row.provider)}</span></div>
      <div class="free-learning-card-head"><div class="free-learning-icon" aria-hidden="true">${esc(icons[row.category]||'EDU')}</div><button type="button" class="free-learning-bookmark ${tracked?'is-saved':''}" aria-label="${tracked?'Saved':'Save'} ${esc(row.title)}">${tracked?'★':'☆'}</button></div>
      <div class="free-learning-card-body"><h4>${esc(row.title)}</h4><p class="free-learning-summary">${esc(row.summary)}</p><div class="free-learning-tags"><span class="fl-tag difficulty">${esc(row.difficulty)}</span><span class="fl-tag">${esc(row.category)}</span><span class="fl-tag free">${esc(row.credential_type||'Free certificate')}</span></div></div>
      <div class="free-learning-actions"><a class="btn btn-primary btn-sm" href="${esc(row.url)}" target="_blank" rel="noopener" data-start="${row.id}">Open course</a><button type="button" class="btn btn-secondary btn-sm fl-progress-btn" data-progress="${row.id}">${stateLabel}</button></div>
      ${row.state==='completed'?`<button type="button" class="free-learning-cert-link" data-add-cert="${row.id}">Add earned certificate to profile →</button>`:''}
    </article>`;
  }

  function render(){
    const shell=document.querySelector('#tab-free-learning .free-learning-shell'),data=state.data;if(!shell||!data)return;
    const all=visibleRows(),rows=all.slice(0,state.visible),completed=(data.rows||[]).filter(r=>r.state==='completed').length,saved=(data.rows||[]).filter(r=>r.state==='saved'||r.state==='started').length;
    shell.innerHTML=`<section class="free-learning-hero glass-card"><div class="free-learning-hero-copy"><span class="eyebrow">Free learning</span><h2>Certificates picked for <span>${esc(data.student.branch)} · ${esc(data.student.year)}</span></h2><p>Curated free learning with certificate or digital credential options. Newly added verified opportunities appear first.</p></div><div class="free-learning-hero-meta"><div><strong>${data.total}</strong><span>resources</span></div><div><strong>${completed}</strong><span>completed</span></div><div><strong>${saved}</strong><span>saved / started</span></div></div></section>
      <section class="free-learning-controls glass-card"><div class="free-learning-mode"><button type="button" data-mode="courses" class="${state.mode==='courses'?'active':''}">Courses</button><button type="button" data-mode="certificates" class="${state.mode==='certificates'?'active':''}">Free Certificates</button></div><label class="free-learning-search"><span>⌕</span><input id="freeLearningSearch" class="form-input" value="${esc(state.q)}" placeholder="Search course, skill or provider"></label><select id="freeLearningCategory" class="form-select"><option>All</option>${(data.categories||[]).map(c=>`<option ${c===state.category?'selected':''}>${esc(c)}</option>`).join('')}</select></section>
      <div class="free-learning-subfilters"><div class="free-learning-filter-group">${['All','Beginner','Intermediate','Advanced'].map(v=>`<button type="button" class="free-learning-filter ${state.difficulty===v?'active':''}" data-difficulty="${v}">${v==='All'?'Recommended':v}</button>`).join('')}</div><div class="free-learning-filter-group progress">${['All','Saved','Started','Completed'].map(v=>`<button type="button" class="free-learning-filter ${state.progress===v?'active':''}" data-progress-filter="${v}">${v==='All'?'All learning':v}</button>`).join('')}</div></div>
      <div class="free-learning-section-head"><div><h3>${state.progress==='All'?'Recommended for you':esc(state.progress)}</h3><p>${state.mode==='certificates'?'Free certificate opportunities':'Free courses'} · matched to branch and year</p></div><span class="free-learning-count">${all.length} available</span></div>
      <div class="free-learning-grid">${rows.length?rows.map(card).join(''):'<div class="free-learning-empty" style="grid-column:1/-1">No resources match these filters.</div>'}</div>${rows.length<all.length?`<div class="free-learning-more"><button type="button" class="btn btn-secondary" id="freeLearningShowMore">Show more <span>${all.length-rows.length} remaining</span></button></div>`:''}`;
    wire();
  }

  function wire(){
    document.querySelectorAll('#tab-free-learning [data-mode]').forEach(b=>b.addEventListener('click',()=>{if(state.mode===b.dataset.mode)return;state.mode=b.dataset.mode;state.category='All';state.progress='All';load();}));
    document.querySelectorAll('#tab-free-learning [data-difficulty]').forEach(b=>b.addEventListener('click',()=>{state.difficulty=b.dataset.difficulty;load();}));
    document.querySelectorAll('#tab-free-learning [data-progress-filter]').forEach(b=>b.addEventListener('click',()=>{state.progress=b.dataset.progressFilter;state.visible=12;render();}));
    document.getElementById('freeLearningCategory')?.addEventListener('change',e=>{state.category=e.target.value;load();});
    let timer;document.getElementById('freeLearningSearch')?.addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>{state.q=e.target.value.trim();load();},300);});
    document.querySelectorAll('#tab-free-learning .free-learning-bookmark').forEach(b=>b.addEventListener('click',()=>saveState(Number(b.closest('[data-id]').dataset.id),'saved')));
    document.querySelectorAll('#tab-free-learning [data-start]').forEach(a=>a.addEventListener('click',()=>saveState(Number(a.dataset.start),'started',false)));
    document.querySelectorAll('#tab-free-learning [data-progress]').forEach(b=>b.addEventListener('click',()=>cycleState(Number(b.dataset.progress))));
    document.querySelectorAll('#tab-free-learning [data-add-cert]').forEach(b=>b.addEventListener('click',()=>addCertificate(Number(b.dataset.addCert))));
    document.getElementById('freeLearningShowMore')?.addEventListener('click',()=>{state.visible+=12;render();});
  }

  async function saveState(id,next,rerender=true){
    try{await api('/api/student/free-learning/progress',{method:'PUT',body:JSON.stringify({resource_id:id,state:next})});const row=state.data?.rows.find(r=>r.id===id);if(row)row.state=next;if(rerender)render();}
    catch(error){window.showToast?.(error.message,'error');}
  }
  function cycleState(id){const row=state.data?.rows.find(r=>r.id===id);const next=!row?.state?'saved':row.state==='saved'?'started':row.state==='started'?'completed':'saved';saveState(id,next);}
  function addCertificate(id){const row=state.data?.rows.find(r=>r.id===id);if(!row)return;document.querySelector('[aria-controls="tab-certificates"]')?.click();setTimeout(()=>{window.openCertificateModal?.();setTimeout(()=>{const n=document.getElementById('certName'),i=document.getElementById('certIssuer');if(n)n.value=row.title;if(i)i.value=row.provider;document.getElementById('certDate')?.focus();},60);},60);}

  function boot(){ if(install())return; let tries=0;const timer=setInterval(()=>{if(install()||++tries>=40)clearInterval(timer);},100); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

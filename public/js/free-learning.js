(() => {
  if (!document.body.classList.contains('student-dashboard-page')) return;

  const token = () => localStorage.getItem('tpo_token');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const icon = category => ({Python:'Py',Programming:'</>',Excel:'XLS',AI:'AI',SQL:'DB',Cloud:'CLD',ML:'ML','Project Management':'PM',Cybersecurity:'SEC','Data Analytics':'DA','Data Science':'DS',Docker:'DKR',JavaScript:'JS',Java:'JV',Tableau:'TB',Linux:'LNX',Agile:'AG',Communication:'COM','Six Sigma':'6σ',Kanban:'KB','Digital Marketing':'DM','Quality Assurance':'QA','Self Development':'SD',Microsoft:'MS',HTML:'HTML'})[category] || 'EDU';

  const state = { mode:'courses', difficulty:'All', category:'All', progress:'All', q:'', data:null, visible:12, loading:false, requestId:0 };

  async function api(path, options={}) {
    const response = await fetch(path, { ...options, headers:{ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json', ...(options.headers||{}) } });
    const json = await response.json();
    if (!response.ok || !json.success) throw Error(json.error?.message || json.error || 'Request failed');
    return json.data;
  }

  function install() {
    if (document.getElementById('tab-free-learning')) return true;
    const tabs = document.querySelector('.tabs-nav');
    const anchor = tabs?.querySelector('[aria-controls="tab-ranking"]') || tabs?.querySelector('[aria-controls="tab-competitions"]') || tabs?.querySelector('[aria-controls="tab-certificates"]');
    if (!tabs || !anchor) return false;

    const button = document.createElement('button');
    button.className='tab-btn'; button.type='button'; button.setAttribute('role','tab'); button.setAttribute('aria-selected','false'); button.setAttribute('aria-controls','tab-free-learning');
    button.innerHTML='Free Learning <span class="student-new-badge is-fresh">NEW</span>';
    button.onclick=()=>{ switchTab('free-learning',button); if(!state.data) load({initial:true}); };
    anchor.after(button);

    const panel=document.createElement('div');
    panel.id='tab-free-learning'; panel.className='tab-content'; panel.setAttribute('role','tabpanel');
    panel.innerHTML='<div class="free-learning-shell"><div class="free-learning-empty">Loading free learning resources…</div></div>';
    const anchorPanel=document.getElementById(anchor.getAttribute('aria-controls'));
    (anchorPanel || document.querySelector('.tab-content:last-of-type'))?.after(panel);

    if(new URLSearchParams(location.search).get('tab')==='free-learning'){ switchTab('free-learning',button); load({initial:true}); }
    return true;
  }

  function params(){
    const query=new URLSearchParams({mode:state.mode});
    if(state.q) query.set('q',state.q);
    if(state.difficulty!=='All') query.set('difficulty',state.difficulty);
    if(state.category!=='All') query.set('category',state.category);
    return query.toString();
  }

  function setBusy(busy){
    state.loading=busy;
    const panel=document.getElementById('tab-free-learning');
    panel?.classList.toggle('is-refreshing',busy);
    panel?.setAttribute('aria-busy',String(busy));
    panel?.querySelectorAll('button,input').forEach(el=>{
      if(el.id==='freeLearningSearch') return;
      el.disabled=busy;
    });
  }

  async function load({initial=false}={}){
    const shell=document.querySelector('#tab-free-learning .free-learning-shell');
    if(!shell) return;
    const id=++state.requestId;
    if(initial && !state.data) shell.innerHTML='<div class="free-learning-empty">Finding the best resources for your branch and year…</div>';
    else setBusy(true);
    try{
      const next=await api('/api/student/free-learning?'+params());
      if(id!==state.requestId) return;
      state.data=next; state.visible=12;
      render(true);
    }catch(error){
      if(id!==state.requestId) return;
      if(state.data){ window.showToast?.(error.message,'error'); }
      else {
        shell.innerHTML=`<div class="free-learning-empty"><strong>Could not load Free Learning</strong><p>${esc(error.message)}</p><button class="btn btn-secondary btn-sm" id="flRetry">Retry</button></div>`;
        document.getElementById('flRetry').onclick=()=>load({initial:true});
      }
    }finally{
      if(id===state.requestId) setBusy(false);
    }
  }

  function filteredRows(){
    const rows=state.data?.rows||[];
    if(state.progress==='All') return rows;
    return rows.filter(row=>(row.state||'none')===state.progress.toLowerCase());
  }

  function categoryPicker(categories){
    const current=state.category==='All'?'All categories':state.category;
    return `<div class="free-learning-category" id="freeLearningCategory">
      <button type="button" class="free-learning-category-trigger" aria-haspopup="listbox" aria-expanded="false"><span>${esc(current)}</span><i aria-hidden="true">⌄</i></button>
      <div class="free-learning-category-menu" role="listbox" tabindex="-1">
        <button type="button" role="option" aria-selected="${state.category==='All'}" data-category="All">All categories</button>
        ${(categories||[]).map(category=>`<button type="button" role="option" aria-selected="${state.category===category}" data-category="${esc(category)}">${esc(category)}</button>`).join('')}
      </div>
    </div>`;
  }

  function render(animate=false){
    const data=state.data, shell=document.querySelector('#tab-free-learning .free-learning-shell');
    if(!data||!shell) return;
    const allRows=filteredRows(), rows=allRows.slice(0,state.visible);
    const completed=(data.rows||[]).filter(row=>row.state==='completed').length;
    const saved=(data.rows||[]).filter(row=>row.state==='saved'||row.state==='started').length;

    shell.innerHTML=`
      <section class="free-learning-hero glass-card">
        <div class="free-learning-hero-copy"><span class="eyebrow">Free learning</span><h2>Courses picked for <span>${esc(data.student.branch)} · ${esc(data.student.year)}</span></h2><p>Verified resources matched to your current level, with free certificate options clearly marked.</p></div>
        <div class="free-learning-hero-meta"><div><strong>${data.total}</strong><span>resources</span></div><div><strong>${completed}</strong><span>completed</span></div><div><strong>${saved}</strong><span>saved / started</span></div></div>
      </section>

      <section class="free-learning-controls glass-card" aria-label="Free learning filters">
        <div class="free-learning-mode" role="group" aria-label="Resource type"><button type="button" data-mode="courses" class="${state.mode==='courses'?'active':''}">Courses</button><button type="button" data-mode="certificates" class="${state.mode==='certificates'?'active':''}">Free Certificates</button></div>
        <label class="free-learning-search" aria-label="Search free learning resources"><span>⌕</span><input id="freeLearningSearch" class="form-input" value="${esc(state.q)}" placeholder="Search course, skill or provider"></label>
        ${categoryPicker(data.categories)}
      </section>

      <div class="free-learning-subfilters">
        <div class="free-learning-filter-group" aria-label="Difficulty">${['All','Beginner','Intermediate','Advanced'].map(value=>`<button type="button" class="free-learning-filter ${state.difficulty===value?'active':''}" data-difficulty="${value}">${value==='All'?'Recommended':value}</button>`).join('')}</div>
        <div class="free-learning-filter-group progress" aria-label="Learning progress">${['All','Saved','Started','Completed'].map(value=>`<button type="button" class="free-learning-filter ${state.progress===value?'active':''}" data-progress="${value}">${value==='All'?'All learning':value}</button>`).join('')}</div>
      </div>

      <div class="free-learning-section-head"><div><h3>${state.progress==='All'?'Recommended for you':state.progress}</h3><p>${state.mode==='certificates'?'Free certificate opportunities':'Free courses'} · matched to your branch and year</p></div><span class="free-learning-count">${allRows.length} available</span></div>
      <div class="free-learning-grid">${rows.length?rows.map(card).join(''):'<div class="free-learning-empty" style="grid-column:1/-1">No resources match these filters.</div>'}</div>
      ${rows.length<allRows.length?`<div class="free-learning-more"><button type="button" class="btn btn-secondary" id="freeLearningShowMore">Show more <span>${allRows.length-rows.length} remaining</span></button></div>`:''}
    `;
    if(animate){ shell.classList.remove('just-updated'); requestAnimationFrame(()=>shell.classList.add('just-updated')); }
    wire();
  }

  function card(row){
    const saved=!!row.state;
    const stateLabel=row.state==='completed'?'Completed':row.state==='started'?'Started':row.state==='saved'?'Saved':'Track';
    return `<article class="free-learning-card glass-card" data-id="${row.id}" data-state="${esc(row.state||'')}"><div class="free-learning-card-head"><div class="free-learning-icon" aria-hidden="true">${esc(icon(row.category))}</div><button type="button" class="free-learning-bookmark ${saved?'is-saved':''}" data-state="saved" aria-label="${saved?'Saved':'Save'} ${esc(row.title)}">${saved?'★':'☆'}</button></div><div class="free-learning-card-body"><h4>${esc(row.title)}</h4><div class="free-learning-provider">${esc(row.provider)}</div><p class="free-learning-summary">${esc(row.summary)}</p><div class="free-learning-tags"><span class="fl-tag difficulty">${esc(row.difficulty)}</span><span class="fl-tag">${esc(row.category)}</span><span class="fl-tag free">Free certificate</span></div></div><div class="free-learning-actions"><a class="btn btn-primary btn-sm" href="${esc(row.url)}" target="_blank" rel="noopener" data-start="${row.id}">Open course</a><button type="button" class="btn btn-secondary btn-sm fl-progress-btn" data-progress-menu="${row.id}">${stateLabel}</button></div>${row.state==='completed'?`<button type="button" class="free-learning-cert-link" data-add-cert="${row.id}">Add earned certificate to profile →</button>`:''}</article>`;
  }

  function wireCategory(){
    const picker=document.getElementById('freeLearningCategory');
    if(!picker) return;
    const trigger=picker.querySelector('.free-learning-category-trigger');
    const menu=picker.querySelector('.free-learning-category-menu');
    const close=()=>{ picker.classList.remove('open'); trigger.setAttribute('aria-expanded','false'); };
    trigger.onclick=event=>{ event.stopPropagation(); const open=picker.classList.toggle('open'); trigger.setAttribute('aria-expanded',String(open)); if(open) menu.focus(); };
    menu.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{ state.category=button.dataset.category; close(); load(); });
    menu.onkeydown=event=>{ if(event.key==='Escape'){ close(); trigger.focus(); } };
    document.addEventListener('click',event=>{ if(!picker.contains(event.target)) close(); },{once:true});
  }

  function wire(){
    document.querySelectorAll('#tab-free-learning [data-mode]').forEach(button=>button.onclick=()=>{ if(state.loading||state.mode===button.dataset.mode)return; state.mode=button.dataset.mode; state.category='All'; state.progress='All'; syncOptimisticControls(); load(); });
    document.querySelectorAll('#tab-free-learning [data-difficulty]').forEach(button=>button.onclick=()=>{ if(state.loading||state.difficulty===button.dataset.difficulty)return; state.difficulty=button.dataset.difficulty; syncOptimisticControls(); load(); });
    document.querySelectorAll('#tab-free-learning [data-progress]').forEach(button=>button.onclick=()=>{ state.progress=button.dataset.progress; state.visible=12; render(); });
    wireCategory();

    let searchTimer; const search=document.getElementById('freeLearningSearch');
    if(search) search.oninput=event=>{ clearTimeout(searchTimer); searchTimer=setTimeout(()=>{ state.q=event.target.value.trim(); load(); },320); };
    document.querySelectorAll('#tab-free-learning .free-learning-bookmark').forEach(button=>button.onclick=()=>saveState(Number(button.closest('[data-id]').dataset.id),'saved'));
    document.querySelectorAll('#tab-free-learning [data-start]').forEach(anchor=>anchor.onclick=()=>saveState(Number(anchor.dataset.start),'started',false));
    document.querySelectorAll('#tab-free-learning [data-progress-menu]').forEach(button=>button.onclick=()=>cycleState(Number(button.dataset.progressMenu)));
    document.querySelectorAll('#tab-free-learning [data-add-cert]').forEach(button=>button.onclick=()=>addCertificate(Number(button.dataset.addCert)));
    const showMore=document.getElementById('freeLearningShowMore'); if(showMore) showMore.onclick=()=>{ state.visible+=12; render(); };
  }

  function syncOptimisticControls(){
    document.querySelectorAll('#tab-free-learning [data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===state.mode));
    document.querySelectorAll('#tab-free-learning [data-difficulty]').forEach(button=>button.classList.toggle('active',button.dataset.difficulty===state.difficulty));
  }

  async function saveState(id,next,rerender=true){
    try{ await api('/api/student/free-learning/progress',{method:'PUT',body:JSON.stringify({resource_id:id,state:next})}); const row=state.data?.rows.find(item=>item.id===id); if(row)row.state=next; if(rerender)render(); }
    catch(error){ window.showToast?.(error.message,'error')||alert(error.message); }
  }

  function cycleState(id){ const row=state.data?.rows.find(item=>item.id===id); const next=!row?.state?'saved':row.state==='saved'?'started':row.state==='started'?'completed':'saved'; saveState(id,next); }

  function addCertificate(id){
    const row=state.data?.rows.find(item=>item.id===id); if(!row)return;
    document.querySelector('[aria-controls="tab-certificates"]')?.click();
    setTimeout(()=>{ window.openCertificateModal?.(); setTimeout(()=>{ const name=document.getElementById('certName'),issuer=document.getElementById('certIssuer'); if(name)name.value=row.title; if(issuer)issuer.value=row.provider; document.getElementById('certDate')?.focus(); },80); },80);
  }

  function boot(){ if(install())return; const observer=new MutationObserver(()=>{if(install())observer.disconnect()}); observer.observe(document.body,{childList:true,subtree:true}); setTimeout(()=>observer.disconnect(),12000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
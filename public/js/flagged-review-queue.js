(() => {
  if (window.__AIT_FLAGGED_REVIEW_QUEUE__) return;
  window.__AIT_FLAGGED_REVIEW_QUEUE__ = true;

  const state = { page:1, pageSize:25, role:null, endpoint:'', scope:null, loading:false };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const labels = { project:'Project', research:'Research paper', internship:'Internship', certificate:'Certificate' };
  const branchOptions = ['AIML','CT','EE','ME','CE','E&C'];

  function injectStyles(){
    if(document.getElementById('flaggedQueueStyles')) return;
    const style=document.createElement('style');
    style.id='flaggedQueueStyles';
    style.textContent=`
      .flagged-queue-shell{display:grid;gap:14px}.flagged-queue-toolbar{display:grid;grid-template-columns:160px 150px 150px minmax(220px,1fr) auto;gap:10px;align-items:end;padding:14px}.flagged-queue-toolbar .form-input,.flagged-queue-toolbar .form-select{margin:0}.flagged-queue-summary{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.flagged-queue-grid{display:grid;gap:10px}.flagged-card{border:1px solid var(--border-color);border-radius:14px;padding:14px;background:var(--bg-card);display:grid;gap:10px}.flagged-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.flagged-student{display:grid;gap:3px}.flagged-student strong{font-size:1rem;color:var(--text-heading)}.flagged-student small,.flagged-meta,.flagged-reasons{color:var(--text-muted)}.flagged-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.flagged-risk{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800}.flagged-risk.high{background:rgba(239,68,68,.12);color:#ef4444}.flagged-risk.medium{background:rgba(245,158,11,.13);color:#f59e0b}.flagged-risk.low{background:rgba(59,130,246,.12);color:#60a5fa}.flagged-title{font-weight:800;color:var(--text-heading);font-size:1.04rem}.flagged-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:.82rem}.flagged-links{display:flex;gap:8px;flex-wrap:wrap}.flagged-links a{font-size:.8rem;word-break:break-all}.flagged-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.flagged-view-only{font-size:.78rem;color:var(--text-muted);align-self:center}.flagged-pager{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px}.flagged-empty{padding:32px 18px;text-align:center;color:var(--text-muted)}.flagged-branch-counts{display:flex;gap:6px;flex-wrap:wrap}.flagged-branch-counts button{border:1px solid var(--border-color);background:transparent;color:var(--text-muted);padding:5px 8px;border-radius:999px;cursor:pointer}.flagged-branch-counts button:hover{color:var(--text-heading);border-color:var(--primary)}
      @media(max-width:800px){.flagged-queue-toolbar{grid-template-columns:1fr 1fr}.flagged-queue-toolbar .flagged-search-wrap{grid-column:1/-1}.flagged-card-head{display:grid}.flagged-badges{justify-content:flex-start}.flagged-actions .btn{min-height:42px;flex:1}.flagged-queue-toolbar>button{min-height:42px}}
      @media(max-width:480px){.flagged-queue-toolbar{grid-template-columns:1fr}.flagged-queue-toolbar .flagged-search-wrap{grid-column:auto}.flagged-card{padding:12px}.flagged-actions{display:grid;grid-template-columns:1fr 1fr}.flagged-pager .btn{min-height:42px}}
    `;
    document.head.appendChild(style);
  }

  function detectRole(){
    if(document.body.classList.contains('admin-dashboard-page')) return 'admin';
    if(document.body.classList.contains('observer-shell')) return 'observer';
    return null;
  }

  function sectionMarkup(){
    const options=branchOptions.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');
    return `<div class="flagged-queue-shell">
      <div class="glass-card flagged-queue-toolbar">
        <div><label class="form-label" for="flaggedBranch">Branch</label><select id="flaggedBranch" class="form-select"><option value="all">All branches</option>${options}</select></div>
        <div><label class="form-label" for="flaggedType">Type</label><select id="flaggedType" class="form-select"><option value="all">All types</option><option value="project">Projects</option><option value="research">Research</option><option value="internship">Internships</option><option value="certificate">Certificates</option></select></div>
        <div><label class="form-label" for="flaggedRisk">Risk</label><select id="flaggedRisk" class="form-select"><option value="all">All flagged</option><option value="high">High risk</option><option value="medium">Needs review</option><option value="low">Random audits</option></select></div>
        <div class="flagged-search-wrap"><label class="form-label" for="flaggedSearch">Search flagged names or records</label><input id="flaggedSearch" class="form-input" placeholder="Student name, PRN, project, research, company, issuer..."></div>
        <button id="flaggedRefresh" type="button" class="btn btn-secondary">Refresh</button>
      </div>
      <div class="glass-card" style="padding:14px;display:grid;gap:10px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><h2 class="section-title" style="margin:0">Flagged submissions</h2><p id="flaggedScopeNote" style="margin:4px 0 0;color:var(--text-muted)">Suspicious submissions stay at 0 points until approved.</p></div><div id="flaggedSummary" class="flagged-queue-summary"></div></div>
        <div id="flaggedBranchCounts" class="flagged-branch-counts"></div>
      </div>
      <div id="flaggedQueueGrid" class="flagged-queue-grid"><div class="glass-card flagged-empty">Loading flagged submissions…</div></div>
      <div id="flaggedPager" class="flagged-pager"></div>
    </div>`;
  }

  function installAdmin(){
    const tabs=document.querySelector('.admin-tabs');
    const main=document.getElementById('adminDashboard');
    if(!tabs || !main || document.getElementById('tab-flagged-submissions')) return false;
    const button=document.createElement('button');
    button.className='tab-btn'; button.type='button'; button.setAttribute('role','tab'); button.setAttribute('aria-selected','false'); button.setAttribute('aria-controls','tab-flagged-submissions'); button.textContent='Flagged submissions';
    button.addEventListener('click',()=>{
      if(typeof window.switchAdminTab === 'function') window.switchAdminTab('flagged-submissions',button);
      else{
        document.querySelectorAll('.admin-tabs .tab-btn').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',String(b===button));});
        document.querySelectorAll('#adminDashboard > .tab-content').forEach(tab=>tab.classList.toggle('active',tab.id==='tab-flagged-submissions'));
      }
      loadQueue();
    });
    tabs.appendChild(button);
    const section=document.createElement('div'); section.id='tab-flagged-submissions'; section.className='tab-content'; section.setAttribute('role','tabpanel'); section.innerHTML=sectionMarkup();
    tabs.insertAdjacentElement('afterend',section);
    return true;
  }

  function installObserver(){
    const tabs=document.querySelector('.observer-tabs');
    if(!tabs || document.getElementById('observerTab-flagged')) return false;
    const button=document.createElement('button'); button.className='tab-btn'; button.type='button'; button.setAttribute('role','tab'); button.setAttribute('aria-selected','false'); button.setAttribute('aria-controls','observerTab-flagged'); button.dataset.tab='flagged'; button.textContent='Flagged submissions';
    const section=document.createElement('section'); section.id='observerTab-flagged'; section.className='tab-content'; section.setAttribute('role','tabpanel'); section.innerHTML=sectionMarkup();
    const lastPanel=document.querySelector('[id^="observerTab-"]:last-of-type');
    if(lastPanel) lastPanel.insertAdjacentElement('afterend',section); else tabs.insertAdjacentElement('afterend',section);
    tabs.appendChild(button);
    button.addEventListener('click',()=>{
      document.querySelectorAll('.observer-tabs .tab-btn').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',String(b===button));});
      document.querySelectorAll('[id^="observerTab-"]').forEach(tab=>tab.classList.toggle('active',tab.id==='observerTab-flagged'));
      loadQueue();
    });
    return true;
  }

  function bindControls(){
    const branch=document.getElementById('flaggedBranch');
    if(!branch || branch.dataset.bound) return;
    branch.dataset.bound='1';
    ['flaggedBranch','flaggedType','flaggedRisk'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{state.page=1;loadQueue();}));
    let timer;
    document.getElementById('flaggedSearch')?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.page=1;loadQueue();},250);});
    document.getElementById('flaggedRefresh')?.addEventListener('click',()=>loadQueue());
    document.getElementById('flaggedBranchCounts')?.addEventListener('click',event=>{
      const btn=event.target.closest('[data-flagged-branch]'); if(!btn) return;
      branch.value=btn.dataset.flaggedBranch; state.page=1; loadQueue();
    });
    document.getElementById('flaggedQueueGrid')?.addEventListener('click',event=>{
      const btn=event.target.closest('[data-flagged-decision]'); if(btn) reviewItem(btn);
    });
    document.getElementById('flaggedPager')?.addEventListener('click',event=>{
      const btn=event.target.closest('[data-flagged-page]'); if(!btn || btn.disabled) return;
      state.page=Number(btn.dataset.flaggedPage)||1; loadQueue();
    });
  }

  function getError(json,fallback){ return typeof json?.error === 'string' ? json.error : json?.error?.message || fallback; }
  function toast(message,type='success'){
    if(state.role === 'observer' && typeof window.showObserverToast === 'function') return window.showObserverToast(message);
    if(typeof window.showToast === 'function') return window.showToast(message,type);
    console[type === 'error' ? 'error' : 'log'](message);
  }

  function render(data){
    state.scope=data.scope || null;
    const summary=document.getElementById('flaggedSummary');
    const grid=document.getElementById('flaggedQueueGrid');
    const counts=document.getElementById('flaggedBranchCounts');
    const pager=document.getElementById('flaggedPager');
    const note=document.getElementById('flaggedScopeNote');
    if(!summary || !grid || !pager) return;
    summary.innerHTML=`<span class="badge ${data.total ? 'badge-offline':'badge-online'}">${Number(data.total||0)} flagged</span><span class="badge badge-info">${data.page}/${data.totalPages} pages</span>`;
    if(note) note.textContent=state.role === 'observer' ? `College-wide flagged view. TPC can approve/reject only ${esc(data.scope?.department || 'its')} department records.` : 'Suspicious submissions stay at 0 points until TPO approval. Reject requires a reason and notifies the student.';
    if(counts){
      const entries=Object.entries(data.branch_counts || {}).sort((a,b)=>a[0].localeCompare(b[0]));
      counts.innerHTML=entries.map(([branch,count])=>`<button type="button" data-flagged-branch="${esc(branch)}">${esc(branch)} · ${Number(count)}</button>`).join('');
    }
    grid.innerHTML=data.rows.length ? data.rows.map(row=>{
      const risk=row.moderation || {};
      const reasons=(risk.reasons || []).map(esc).join(' ');
      const links=(row.links || []).map((link,index)=>`<a href="${esc(link)}" target="_blank" rel="noopener">${index ? 'Open link 2':'Open evidence link'}</a>`).join('');
      const riskLabel=risk.duplicate ? 'Duplicate' : risk.audit_sample ? 'Random audit' : risk.level === 'high' ? 'High risk' : 'Needs review';
      const actions=row.can_review ? `<button type="button" class="btn btn-primary btn-sm" data-flagged-decision="approve" data-id="${esc(row.id)}" data-type="${esc(row.type)}">Approve</button><button type="button" class="btn btn-danger btn-sm" data-flagged-decision="reject" data-id="${esc(row.id)}" data-type="${esc(row.type)}">Reject</button>` : `<span class="flagged-view-only">Read only · ${esc(row.branch)} TPC must review</span>`;
      return `<article class="glass-card flagged-card">
        <div class="flagged-card-head"><div class="flagged-student"><strong>${esc(row.student_name)}</strong><small>${esc(row.prn)} · ${esc(row.branch)} · ${esc(row.year || row.class || '')}</small></div><div class="flagged-badges"><span class="branch-chip">${esc(row.branch)}</span><span class="flagged-risk ${esc(risk.level || 'medium')}">${esc(riskLabel)}</span></div></div>
        <div><div class="flagged-title">${esc(row.title)}</div><div class="flagged-meta"><span>${esc(labels[row.type] || row.type)}</span><span>Status: ${esc(row.verification_status || 'pending')}</span>${row.submitted_at ? `<span>Submitted ${esc(new Date(row.submitted_at).toLocaleDateString())}</span>`:''}</div></div>
        <div class="flagged-reasons">${reasons || 'Selected for staff review by the integrity checks.'}</div>
        ${links ? `<div class="flagged-links">${links}</div>`:''}
        <div class="flagged-actions">${actions}</div>
      </article>`;
    }).join('') : '<div class="glass-card flagged-empty"><strong>No flagged submissions found.</strong><div style="margin-top:5px">Current branch, type and search filters are clean.</div></div>';
    pager.innerHTML=`<button type="button" class="btn btn-secondary btn-sm" data-flagged-page="${Math.max(1,data.page-1)}" ${data.page<=1?'disabled':''}>Previous</button><span>Page ${data.page} of ${data.totalPages} · ${data.total} records</span><button type="button" class="btn btn-secondary btn-sm" data-flagged-page="${Math.min(data.totalPages,data.page+1)}" ${data.page>=data.totalPages?'disabled':''}>Next</button>`;
  }

  async function loadQueue(){
    if(state.loading || !document.getElementById('flaggedQueueGrid')) return;
    state.loading=true;
    const grid=document.getElementById('flaggedQueueGrid');
    grid.innerHTML='<div class="glass-card flagged-empty">Scanning flagged submissions…</div>';
    const params=new URLSearchParams({page:String(state.page),pageSize:String(state.pageSize),branch:document.getElementById('flaggedBranch')?.value || 'all',type:document.getElementById('flaggedType')?.value || 'all',risk:document.getElementById('flaggedRisk')?.value || 'all',search:document.getElementById('flaggedSearch')?.value.trim() || ''});
    try{
      const headers={};
      if(state.role === 'admin'){
        const token=localStorage.getItem('tpo_admin_token'); if(token) headers.Authorization=`Bearer ${token}`;
      }
      const response=await fetch(`${state.endpoint}?${params}`,{headers});
      const json=await response.json();
      if(!response.ok || !json.success) throw new Error(getError(json,'Unable to load flagged submissions.'));
      render(json.data);
    }catch(error){
      grid.innerHTML=`<div class="glass-card flagged-empty" style="color:#ef4444">${esc(error.message)}</div>`;
    }finally{ state.loading=false; }
  }

  function askReason(type){
    const value=window.prompt(`Why are you rejecting this ${String(labels[type] || 'submission').toLowerCase()}?\n\nThe student will see this reason.`, 'Invalid, duplicate, misleading, or unsupported information');
    if(value === null) return null;
    const clean=value.trim().replace(/\s+/g,' ');
    if(clean.length < 5 || clean.length > 300){toast('Reason must be 5 to 300 characters.','error');return null;}
    return clean;
  }

  async function reviewItem(button){
    const decision=button.dataset.flaggedDecision;
    const type=button.dataset.type;
    const id=button.dataset.id;
    if(!decision || !type || !id) return;
    const reason=decision === 'reject' ? askReason(type) : '';
    if(decision === 'reject' && !reason) return;
    if(!window.confirm(`${decision === 'approve' ? 'Approve' : 'Reject'} this ${labels[type] || 'submission'}?${reason ? `\n\nReason: ${reason}`:''}\n\nRanking points will recalculate immediately.`)) return;
    const original=button.textContent; button.disabled=true; button.textContent=decision === 'approve' ? 'Approving…':'Rejecting…';
    try{
      const headers={'Content-Type':'application/json'};
      if(state.role === 'admin'){
        const token=localStorage.getItem('tpo_admin_token'); if(token) headers.Authorization=`Bearer ${token}`;
      }
      const response=await fetch(`${state.endpoint}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/review`,{method:'POST',headers,body:JSON.stringify({decision,reason})});
      const json=await response.json();
      if(!response.ok || !json.success) throw new Error(getError(json,'Review failed.'));
      toast(`${labels[type]} ${decision === 'approve' ? 'approved' : 'rejected'}.`);
      await loadQueue();
    }catch(error){toast(error.message,'error');button.disabled=false;button.textContent=original;}
  }

  function install(){
    state.role=detectRole();
    if(!state.role) return false;
    state.endpoint=state.role === 'admin' ? '/api/admin/moderation-queue' : '/api/observer/moderation-queue';
    injectStyles();
    const installed=state.role === 'admin' ? installAdmin() : installObserver();
    if(installed || document.getElementById('flaggedQueueGrid')) bindControls();
    window.loadFlaggedModeration=loadQueue;
    return installed;
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();

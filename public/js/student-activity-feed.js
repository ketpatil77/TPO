(() => {
  if (!document.body.classList.contains('admin-dashboard-page')) return;
  if (window.__studentActivityFeedLoaded) return;
  window.__studentActivityFeedLoaded = true;

  const GROUP_WINDOW_MS = 5 * 60 * 1000;
  const POLL_MS = 15000;
  const INTERNAL_FIELDS = new Set([
    'id','student_id','created_at','updated_at','evidence_path','evidence_bytes','evidence_sha256','evidence_uploaded_at','evidence_mime',
    'verified_by','verified_at','proof_deadline','proof_notice_sent_at','proof_missing_since'
  ]);
  const PROOF_FIELDS = new Set(['evidence_path','evidence_bytes','evidence_sha256','evidence_uploaded_at','evidence_mime']);
  const FIELD_LABELS = {
    name:'Name', title:'Title', issuer:'Issuer', company:'Company', role:'Role', mode:'Mode', date:'Date', start_date:'Start date', end_date:'End date',
    verification_status:'Verification', verification_note:'Verification note', verified_role:'Verified by', skill:'Skill', skills:'Skills', branch:'Branch', class:'Class', year:'Year',
    repository_url:'Repository', project_url:'Live project', paper_url:'Paper link', doi_url:'DOI', result_status:'Result', level:'Level'
  };
  const state = {
    page: 1, pageSize: 50, loading: false, timer: null, latestId: null, initialized: false, retries: 0,
    logs: [], signature: '', openGroups: new Set()
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const token = () => localStorage.getItem('tpo_admin_token');

  function install() {
    if (state.initialized) return;
    const tabs = document.querySelector('.admin-tabs');
    const dashboard = document.getElementById('adminDashboard');
    if (!tabs || !dashboard || typeof window.switchAdminTab !== 'function') {
      if (state.retries++ < 60) setTimeout(install, 100);
      return;
    }
    state.initialized = true;

    let button = tabs.querySelector('[aria-controls="tab-student-activity"]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'tab-btn';
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      button.setAttribute('aria-controls', 'tab-student-activity');
      button.textContent = 'Live activity';
      const auditButton = tabs.querySelector('[aria-controls="tab-audit-logs"]');
      (auditButton || tabs.lastElementChild)?.after(button);
    }

    let panel = document.getElementById('tab-student-activity');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'tab-student-activity';
      panel.className = 'tab-content';
      panel.setAttribute('role', 'tabpanel');
      dashboard.appendChild(panel);
    }

    panel.innerHTML = `
      <div class="activity-feed-shell">
        <section class="glass-card activity-feed-hero">
          <div><span class="eyebrow">Student updates</span><h2>Live Activity</h2><p>See what students added, changed, or removed without technical database noise.</p></div>
          <div class="activity-live-pill"><span class="activity-live-dot"></span><span id="activityLiveLabel">Live · refreshes every 15s</span></div>
        </section>
        <div class="activity-summary-grid">
          <div class="glass-card activity-summary-card"><span>Activities</span><strong id="activityCount">0</strong></div>
          <div class="glass-card activity-summary-card"><span>Students</span><strong id="activityStudentCount">0</strong></div>
          <div class="glass-card activity-summary-card"><span>Latest</span><strong id="activityLastTime">—</strong></div>
        </div>
        <section class="glass-card activity-filter-card">
          <div class="activity-filter-grid">
            <div><label class="form-label" for="activityRange">Period</label><select id="activityRange" class="form-select"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All activity</option></select></div>
            <div><label class="form-label" for="activityBranch">Branch</label><select id="activityBranch" class="form-select"><option value="all">All branches</option></select></div>
            <div><label class="form-label" for="activityClass">Class</label><select id="activityClass" class="form-select"><option value="all">All classes</option></select></div>
            <div><label class="form-label" for="activityYear">Year</label><select id="activityYear" class="form-select"><option value="all">All years</option></select></div>
            <div><label class="form-label" for="activityCategory">Activity type</label><select id="activityCategory" class="form-select"><option value="all">All activity</option></select></div>
            <div><label class="form-label" for="activityStudent">Student</label><input id="activityStudent" class="form-input" list="activityStudents" placeholder="Name or PRN" autocomplete="off"><datalist id="activityStudents"></datalist></div>
            <div class="activity-filter-actions"><button id="activityApply" class="btn btn-primary btn-sm" type="button">Apply</button><button id="activityReset" class="btn btn-secondary btn-sm" type="button">Reset</button></div>
          </div>
        </section>
        <div id="activityFeed" class="activity-feed-list" aria-live="polite"><div class="glass-card activity-empty">Loading today's activity…</div></div>
        <div class="activity-feed-footer"><button id="activityMore" class="btn btn-secondary btn-sm" type="button" hidden>Load more</button></div>
      </div>`;

    const feed = document.getElementById('activityFeed');
    feed.addEventListener('toggle', event => {
      const details = event.target.closest?.('.activity-burst-details');
      if (!details?.dataset.groupKey) return;
      if (details.open) state.openGroups.add(details.dataset.groupKey);
      else state.openGroups.delete(details.dataset.groupKey);
    }, true);

    button.onclick = () => {
      window.switchAdminTab('student-activity', button);
      state.page = 1;
      state.signature = '';
      load(false);
      startPolling();
    };
    document.getElementById('activityApply').onclick = () => { state.page = 1; state.signature = ''; load(false); };
    document.getElementById('activityReset').onclick = resetFilters;
    document.getElementById('activityMore').onclick = () => { state.page += 1; load(true); };
    ['activityRange','activityBranch','activityClass','activityYear','activityCategory'].forEach(id => {
      document.getElementById(id).onchange = () => { state.page = 1; state.signature = ''; load(false); };
    });
    document.getElementById('activityStudent').onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); state.page = 1; state.signature = ''; load(false); }
    };
    document.addEventListener('visibilitychange', () => document.hidden ? stopPolling() : (panel.classList.contains('active') && startPolling()));
  }

  function resetFilters() {
    document.getElementById('activityRange').value = 'today';
    document.getElementById('activityBranch').value = 'all';
    document.getElementById('activityClass').value = 'all';
    document.getElementById('activityYear').value = 'all';
    document.getElementById('activityCategory').value = 'all';
    document.getElementById('activityStudent').value = '';
    state.page = 1;
    state.signature = '';
    state.openGroups.clear();
    load(false);
  }

  function params() {
    const p = new URLSearchParams({ page: state.page, pageSize: state.pageSize, range: document.getElementById('activityRange').value });
    const branch = document.getElementById('activityBranch').value;
    const className = document.getElementById('activityClass').value;
    const year = document.getElementById('activityYear').value;
    const category = document.getElementById('activityCategory').value;
    const student = document.getElementById('activityStudent').value.trim();
    if (branch !== 'all') p.set('branch', branch);
    if (className !== 'all') p.set('class', className);
    if (year !== 'all') p.set('year', year);
    if (category !== 'all') p.set('category', category);
    if (student) p.set('student', student);
    return p;
  }

  async function load(append = false, silent = false) {
    if (state.loading) return;
    state.loading = true;
    const feed = document.getElementById('activityFeed');
    if (!append && !silent) feed.innerHTML = '<div class="glass-card activity-empty">Loading activity…</div>';
    try {
      const res = await fetch(`/api/admin/audit-logs/student-activity?${params()}&_=${Date.now()}`, {
        cache: 'no-store', headers: { Authorization: `Bearer ${token()}` }
      });
      if (res.status === 401 || res.status === 403) {
        stopPolling();
        if (!silent) feed.innerHTML = '<div class="glass-card activity-empty">Your administrator session has expired. Sign in again.</div>';
        return;
      }
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || json.error || 'Unable to load activity.');
      render(json.data, append, silent);
    } catch (error) {
      if (!silent) feed.innerHTML = `<div class="glass-card activity-empty">${esc(error.message)}</div>`;
    } finally {
      state.loading = false;
    }
  }

  function fillSelect(id, values, label) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    const next = `<option value="all">${label}</option>` + (values || []).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (select.innerHTML !== next) select.innerHTML = next;
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function signature(logs) {
    return logs.map(log => `${log.id}:${log.created_at}:${log.action}:${(log.changed_fields || []).join(',')}`).join('|');
  }

  function visibleAnchor(feed) {
    const items = [...feed.querySelectorAll('.activity-item[data-group-key]')];
    const item = items.find(node => node.getBoundingClientRect().bottom > 0);
    return item ? { key: item.dataset.groupKey, top: item.getBoundingClientRect().top } : null;
  }

  function restoreAnchor(feed, anchor, fallbackY) {
    requestAnimationFrame(() => {
      if (anchor?.key) {
        const escapedKey = window.CSS?.escape ? CSS.escape(anchor.key) : anchor.key.replace(/["\\]/g, '\\$&');
        const next = feed.querySelector(`.activity-item[data-group-key="${escapedKey}"]`);
        if (next) {
          const delta = next.getBoundingClientRect().top - anchor.top;
          if (Math.abs(delta) > 1) window.scrollBy(0, delta);
          return;
        }
      }
      if (Number.isFinite(fallbackY) && Math.abs(window.scrollY - fallbackY) > 2) window.scrollTo(0, fallbackY);
    });
  }

  function render(data, append, silent) {
    fillSelect('activityBranch', data.options?.branches, 'All branches');
    fillSelect('activityClass', data.options?.classes, 'All classes');
    fillSelect('activityYear', data.options?.years, 'All years');
    fillSelect('activityCategory', data.options?.categories, 'All activity');
    const datalist = document.getElementById('activityStudents');
    if (datalist) datalist.innerHTML = (data.options?.students || []).map(s => `<option value="${esc(s.prn || s.name)}">${esc(s.name)}${s.prn ? ` · ${esc(s.prn)}` : ''}</option>`).join('');

    const incoming = data.logs || [];
    if (!append) state.logs = incoming;
    else {
      const seen = new Set(state.logs.map(log => log.id));
      state.logs = state.logs.concat(incoming.filter(log => !seen.has(log.id)));
    }

    const nextSignature = signature(state.logs);
    const feed = document.getElementById('activityFeed');
    const shouldRender = append || !silent || nextSignature !== state.signature;
    const fallbackY = window.scrollY;
    const anchor = silent && shouldRender ? visibleAnchor(feed) : null;

    if (shouldRender) {
      if (!state.logs.length) {
        feed.innerHTML = '<div class="glass-card activity-empty"><strong>No matching activity</strong><div>Nothing has been recorded for these filters yet.</div></div>';
      } else {
        const groups = groupLogs(state.logs);
        feed.innerHTML = groups.map((group, index) => groupHtml(group, silent && index === 0)).join('');
        feed.querySelectorAll('.activity-burst-details[data-group-key]').forEach(details => {
          if (state.openGroups.has(details.dataset.groupKey)) details.open = true;
        });
      }
      state.signature = nextSignature;
      if (silent) restoreAnchor(feed, anchor, fallbackY);
    }

    if (state.logs[0]) state.latestId = state.logs[0].id;
    document.getElementById('activityCount').textContent = Number(data.count || 0).toLocaleString();
    document.getElementById('activityStudentCount').textContent = new Set(state.logs.map(log => log.student_id).filter(Boolean)).size;
    document.getElementById('activityLastTime').textContent = state.logs[0] ? shortTime(state.logs[0].created_at) : '—';
    document.getElementById('activityMore').hidden = state.page * state.pageSize >= Number(data.count || 0);
  }

  function groupLogs(logs) {
    const groups = [];
    for (const log of logs) {
      const ts = new Date(log.created_at).getTime();
      const previous = groups[groups.length - 1];
      const sameStudent = previous && previous.studentId === log.student_id;
      const closeEnough = previous && Math.abs(previous.oldestTime - ts) <= GROUP_WINDOW_MS;
      if (sameStudent && closeEnough) {
        previous.logs.push(log);
        previous.oldestTime = Math.min(previous.oldestTime, ts);
      } else {
        groups.push({ studentId: log.student_id, newestTime: ts, oldestTime: ts, logs: [log] });
      }
    }
    return groups;
  }

  function groupKey(group) {
    const oldest = group.logs[group.logs.length - 1];
    return `group:${group.studentId || 'unknown'}:${oldest?.id || oldest?.created_at || group.oldestTime}`;
  }

  function cardMeta(log, categories = null) {
    const categoryList = categories || [log.category].filter(Boolean);
    return `${categoryList.map(category => `<span class="activity-chip category">${esc(friendlyCategory(category))}</span>`).join('')}` +
      `${log.branch ? `<span class="activity-chip">${esc(log.branch)}</span>` : ''}` +
      `${log.year ? `<span class="activity-chip">${esc(log.year)}</span>` : ''}` +
      `${log.class ? `<span class="activity-chip">${esc(log.class)}</span>` : ''}`;
  }

  function groupHtml(group, flash) {
    const first = group.logs[0];
    if (group.logs.length === 1) return itemHtml(first, flash);
    const key = groupKey(group);
    const initials = initialsFor(first.student_name);
    const categories = [...new Set(group.logs.map(log => log.category).filter(Boolean))];
    const categoryText = categories.map(friendlyCategory).join(', ');
    const burstRows = group.logs.map(log => `
      <div class="activity-burst-row ${log.action === 'deleted' ? 'is-destructive' : ''}">
        <div class="activity-burst-copy"><strong>${esc(prettySummary(log))}</strong>${changeHtml(log)}</div>
        <time datetime="${esc(log.created_at)}">${esc(shortTime(log.created_at))}</time>
      </div>`).join('');
    return `<article class="glass-card activity-item activity-group ${flash ? 'activity-new-flash' : ''}" data-student-id="${esc(first.student_id)}" data-group-key="${esc(key)}">
      <div class="activity-avatar" aria-hidden="true">${esc(initials)}</div>
      <div class="activity-main">
        <div class="activity-topline"><strong>${esc(first.student_name)}</strong>${first.prn ? `<span class="activity-prn">${esc(first.prn)}</span>` : ''}<span class="activity-burst-count">${group.logs.length} updates</span></div>
        <div class="activity-summary">${group.logs.length} recent updates${categoryText ? ` · ${esc(categoryText)}` : ''}</div>
        <div class="activity-meta">${cardMeta(first, categories)}</div>
        <details class="activity-burst-details" data-group-key="${esc(key)}"><summary>${group.logs.length} updates · tap to view</summary><div class="activity-burst-list">${burstRows}</div></details>
      </div>
      <time class="activity-time" datetime="${esc(first.created_at)}" title="${esc(fullTime(first.created_at))}">${esc(relativeTime(first.created_at))}<br>${esc(shortTime(first.created_at))}</time>
    </article>`;
  }

  function itemHtml(log, flash) {
    const key = `log:${log.id || log.created_at}`;
    return `<article class="glass-card activity-item ${flash ? 'activity-new-flash' : ''}" data-student-id="${esc(log.student_id)}" data-group-key="${esc(key)}">
      <div class="activity-avatar" aria-hidden="true">${esc(initialsFor(log.student_name))}</div>
      <div class="activity-main">
        <div class="activity-topline"><strong>${esc(log.student_name)}</strong>${log.prn ? `<span class="activity-prn">${esc(log.prn)}</span>` : ''}</div>
        <div class="activity-summary">${esc(prettySummary(log))}</div>
        <div class="activity-meta">${cardMeta(log)}</div>
        ${changeHtml(log)}
      </div>
      <time class="activity-time" datetime="${esc(log.created_at)}" title="${esc(fullTime(log.created_at))}">${esc(relativeTime(log.created_at))}<br>${esc(shortTime(log.created_at))}</time>
    </article>`;
  }

  function initialsFor(name) {
    return String(name || 'S').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }

  function friendlyCategory(value) {
    const raw = String(value || 'Profile').replace(/_/g, ' ').trim();
    const map = {
      certificates:'Certificates', certificate:'Certificates', internships:'Internships', internship:'Internships',
      skills:'Skills', projects:'Projects', research:'Research', 'research papers':'Research', profile:'Profile', academics:'Academics', competitions:'Competitions'
    };
    return map[raw.toLowerCase()] || raw.replace(/\b\w/g, c => c.toUpperCase());
  }

  function singularCategory(value) {
    const category = friendlyCategory(value).toLowerCase();
    if (category === 'certificates') return 'certificate';
    if (category === 'internships') return 'internship';
    if (category === 'skills') return 'skills';
    if (category === 'projects') return 'project';
    if (category === 'competitions') return 'competition';
    return category;
  }

  function prettySummary(log) {
    const fields = Array.isArray(log.changed_fields) ? log.changed_fields : [];
    const kind = singularCategory(log.category);
    const proofChanged = fields.some(field => PROOF_FIELDS.has(field));
    const verificationChanged = fields.some(field => ['verification_status','verified_by','verified_role','verified_at','verification_note'].includes(field));

    if (verificationChanged) {
      const status = String(log.new_values?.verification_status || '').toLowerCase();
      const role = String(log.new_values?.verified_role || '').toLowerCase();
      const reviewer = role === 'tpc' ? 'TPC' : role === 'tpo' ? 'TPO' : 'Placement team';
      if (status === 'verified' || status === 'approved') return `${reviewer} verified this ${kind}`;
      if (status === 'rejected') return `${reviewer} rejected this ${kind} proof`;
      if (status === 'pending') return `${kind[0]?.toUpperCase() + kind.slice(1)} moved back to verification queue`;
    }
    if (proofChanged) {
      const hadProof = Boolean(log.old_values?.evidence_path || log.old_values?.evidence_sha256 || log.old_values?.evidence_bytes);
      return `${hadProof ? 'Replaced' : 'Uploaded'} ${kind} proof for verification`;
    }
    if (String(log.category || '').toLowerCase().includes('skill')) {
      if (log.action === 'deleted') return 'Removed skills';
      if (log.action === 'created') return 'Added skills';
      return 'Updated skills';
    }
    if (log.action === 'created') return `Added ${articleFor(kind)} ${kind}`;
    if (log.action === 'deleted') return `Removed ${articleFor(kind)} ${kind}`;
    if (log.action === 'updated') return `Updated ${kind}`;
    const base = String(log.summary || `${friendlyCategory(log.category)} activity`).replace(/_/g, ' ');
    return base.replace(/\b\w/g, m => m.toUpperCase());
  }

  function articleFor(word) {
    return /^[aeiou]/i.test(String(word || '')) ? 'an' : 'a';
  }

  function displayValue(value, field = '') {
    if (value === null || value === undefined || value === '') return 'Not set';
    if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
    if (typeof value === 'object') return 'Updated';
    if (field === 'verified_role') return String(value).toUpperCase();
    if (field === 'verification_status') {
      const status = String(value).toLowerCase();
      return status === 'verified' || status === 'approved' ? 'Verified' : status.charAt(0).toUpperCase() + status.slice(1);
    }
    const text = String(value);
    if ((field.endsWith('_date') || field === 'date') && /^\d{4}-\d{2}-\d{2}/.test(text)) {
      const d = new Date(`${text.slice(0,10)}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat('en-IN', { day:'2-digit', month:'short', year:'numeric' }).format(d);
    }
    return text.length > 56 ? `${text.slice(0, 53)}…` : text;
  }

  function changeHtml(log) {
    if (log.action !== 'updated') return '';
    const changed = Array.isArray(log.changed_fields) ? log.changed_fields : [];
    if (changed.some(field => PROOF_FIELDS.has(field)) && !changed.some(field => !INTERNAL_FIELDS.has(field) && !field.startsWith('verification_') && !field.startsWith('verified_'))) {
      return '<div class="activity-friendly-note">Proof file saved. Waiting for TPO/TPC verification.</div>';
    }
    const fields = changed.filter(field => !INTERNAL_FIELDS.has(field) && !field.startsWith('evidence_')).slice(0, 4);
    if (!fields.length || fields.includes('profile')) return '';
    const rows = fields.map(field => {
      const label = FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const oldValue = displayValue(log.old_values?.[field], field);
      const newValue = displayValue(log.new_values?.[field], field);
      return `<div class="activity-change"><b>${esc(label)}</b><span>${esc(oldValue)} <span class="arrow">→</span> ${esc(newValue)}</span></div>`;
    }).join('');
    return rows ? `<div class="activity-change-list">${rows}</div>` : '';
  }

  function shortTime(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour:'numeric', minute:'2-digit' }).format(new Date(value)); }
    catch (_) { return '—'; }
  }

  function fullTime(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', dateStyle:'medium', timeStyle:'short' }).format(new Date(value)); }
    catch (_) { return String(value); }
  }

  function relativeTime(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return '';
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 45) return 'Just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function startPolling() {
    stopPolling();
    state.timer = setInterval(() => {
      const panel = document.getElementById('tab-student-activity');
      if (!document.hidden && panel?.classList.contains('active')) load(false, true);
    }, POLL_MS);
  }

  function stopPolling() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

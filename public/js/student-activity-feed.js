(() => {
  if (!document.body.classList.contains('admin-dashboard-page')) return;

  const GROUP_WINDOW_MS = 5 * 60 * 1000;
  const state = { page: 1, pageSize: 50, loading: false, timer: null, latestId: null, initialized: false, retries: 0, logs: [] };
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
          <div><span class="eyebrow">Student updates</span><h2>Live Activity</h2><p>Meaningful student changes are grouped into short activity bursts so the feed stays readable.</p></div>
          <div class="activity-live-pill"><span class="activity-live-dot"></span><span id="activityLiveLabel">Live · refreshes every 10s</span></div>
        </section>
        <div class="activity-summary-grid">
          <div class="glass-card activity-summary-card"><span>Matching activities</span><strong id="activityCount">0</strong></div>
          <div class="glass-card activity-summary-card"><span>Students in view</span><strong id="activityStudentCount">0</strong></div>
          <div class="glass-card activity-summary-card"><span>Last update</span><strong id="activityLastTime">—</strong></div>
        </div>
        <section class="glass-card activity-filter-card">
          <div class="activity-filter-grid">
            <div><label class="form-label" for="activityRange">Period</label><select id="activityRange" class="form-select"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All activity</option></select></div>
            <div><label class="form-label" for="activityBranch">Branch</label><select id="activityBranch" class="form-select"><option value="all">All branches</option></select></div>
            <div><label class="form-label" for="activityYear">Class / Year</label><select id="activityYear" class="form-select"><option value="all">All classes</option></select></div>
            <div><label class="form-label" for="activityCategory">Activity type</label><select id="activityCategory" class="form-select"><option value="all">All activity</option></select></div>
            <div><label class="form-label" for="activityStudent">Student</label><input id="activityStudent" class="form-input" list="activityStudents" placeholder="Name or PRN" autocomplete="off"><datalist id="activityStudents"></datalist></div>
            <div class="activity-filter-actions"><button id="activityApply" class="btn btn-primary btn-sm" type="button">Apply</button><button id="activityReset" class="btn btn-secondary btn-sm" type="button">Reset</button></div>
          </div>
        </section>
        <div id="activityFeed" class="activity-feed-list" aria-live="polite"><div class="glass-card activity-empty">Loading today's activity…</div></div>
        <div class="activity-feed-footer"><button id="activityMore" class="btn btn-secondary btn-sm" type="button" hidden>Load more</button></div>
      </div>`;

    button.onclick = () => { window.switchAdminTab('student-activity', button); state.page = 1; load(false); startPolling(); };
    document.getElementById('activityApply').onclick = () => { state.page = 1; load(false); };
    document.getElementById('activityReset').onclick = resetFilters;
    document.getElementById('activityMore').onclick = () => { state.page += 1; load(true); };
    ['activityRange','activityBranch','activityYear','activityCategory'].forEach(id => document.getElementById(id).onchange = () => { state.page = 1; load(false); });
    document.getElementById('activityStudent').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); state.page = 1; load(false); } };
    document.addEventListener('visibilitychange', () => document.hidden ? stopPolling() : (panel.classList.contains('active') && startPolling()));
  }

  function resetFilters() {
    document.getElementById('activityRange').value = 'today';
    document.getElementById('activityBranch').value = 'all';
    document.getElementById('activityYear').value = 'all';
    document.getElementById('activityCategory').value = 'all';
    document.getElementById('activityStudent').value = '';
    state.page = 1;
    load(false);
  }

  function params() {
    const p = new URLSearchParams({ page: state.page, pageSize: state.pageSize, range: document.getElementById('activityRange').value });
    const branch = document.getElementById('activityBranch').value;
    const year = document.getElementById('activityYear').value;
    const category = document.getElementById('activityCategory').value;
    const student = document.getElementById('activityStudent').value.trim();
    if (branch !== 'all') p.set('branch', branch);
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
      const res = await fetch(`/api/admin/audit-logs/student-activity?${params()}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.status === 401 || res.status === 403) return;
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Unable to load activity.');
      render(json.data, append, silent);
    } catch (error) {
      if (!silent) feed.innerHTML = `<div class="glass-card activity-empty">${esc(error.message)}</div>`;
    } finally { state.loading = false; }
  }

  function fillSelect(id, values, label) {
    const select = document.getElementById(id);
    const current = select.value;
    select.innerHTML = `<option value="all">${label}</option>` + (values || []).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function render(data, append, silent) {
    fillSelect('activityBranch', data.options?.branches, 'All branches');
    fillSelect('activityYear', data.options?.years, 'All classes');
    fillSelect('activityCategory', data.options?.categories, 'All activity');
    document.getElementById('activityStudents').innerHTML = (data.options?.students || []).map(s => `<option value="${esc(s.prn || s.name)}">${esc(s.name)}${s.prn ? ` · ${esc(s.prn)}` : ''}</option>`).join('');

    const incoming = data.logs || [];
    const previousLatest = state.latestId;
    if (!append) state.logs = incoming;
    else {
      const seen = new Set(state.logs.map(log => log.id));
      state.logs = state.logs.concat(incoming.filter(log => !seen.has(log.id)));
    }

    const feed = document.getElementById('activityFeed');
    if (!state.logs.length) {
      feed.innerHTML = '<div class="glass-card activity-empty"><strong>No matching activity</strong><div>Nothing has been recorded for these filters yet.</div></div>';
    } else {
      const groups = groupLogs(state.logs);
      feed.innerHTML = groups.map((group, index) => groupHtml(group, silent && previousLatest && index === 0 && group.logs[0]?.id !== previousLatest)).join('');
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

  function groupHtml(group, flash) {
    const first = group.logs[0];
    const initials = String(first.student_name || 'S').trim().split(/\s+/).slice(0,2).map(p => p[0]).join('').toUpperCase();
    if (group.logs.length === 1) return itemHtml(first, flash);
    const categories = [...new Set(group.logs.map(log => log.category).filter(Boolean))];
    const destructive = group.logs.some(log => log.action === 'deleted');
    const burstRows = group.logs.map(log => `<div class="activity-burst-row ${log.action === 'deleted' ? 'is-destructive' : ''}"><span class="activity-chip category">${esc(log.category)}</span><span>${esc(prettySummary(log))}</span><time datetime="${esc(log.created_at)}">${esc(shortTime(log.created_at))}</time>${changeHtml(log)}</div>`).join('');
    return `<article class="glass-card activity-item activity-group ${flash ? 'activity-new-flash' : ''}" data-student-id="${esc(first.student_id)}">
      <div class="activity-avatar" aria-hidden="true">${esc(initials)}</div>
      <div class="activity-main">
        <div class="activity-topline"><strong>${esc(first.student_name)}</strong>${first.prn ? `<span class="activity-prn">${esc(first.prn)}</span>` : ''}<span class="activity-burst-count">${group.logs.length} updates</span></div>
        <div class="activity-summary">Activity burst across ${categories.length} ${categories.length === 1 ? 'category' : 'categories'}${destructive ? ' · includes removal' : ''}</div>
        <div class="activity-meta">${categories.map(category => `<span class="activity-chip category">${esc(category)}</span>`).join('')}${first.branch ? `<span class="activity-chip">${esc(first.branch)}</span>` : ''}${first.year ? `<span class="activity-chip">${esc(first.year)}</span>` : ''}${first.class ? `<span class="activity-chip">${esc(first.class)}</span>` : ''}</div>
        <details class="activity-burst-details"><summary>View ${group.logs.length} actions</summary><div class="activity-burst-list">${burstRows}</div></details>
      </div>
      <time class="activity-time" datetime="${esc(first.created_at)}" title="${esc(fullTime(first.created_at))}">${esc(relativeTime(first.created_at))}<br>${esc(shortTime(first.created_at))}</time>
    </article>`;
  }

  function itemHtml(log, flash) {
    const initials = String(log.student_name || 'S').trim().split(/\s+/).slice(0,2).map(p => p[0]).join('').toUpperCase();
    return `<article class="glass-card activity-item ${flash ? 'activity-new-flash' : ''}" data-student-id="${esc(log.student_id)}">
      <div class="activity-avatar" aria-hidden="true">${esc(initials)}</div>
      <div class="activity-main">
        <div class="activity-topline"><strong>${esc(log.student_name)}</strong>${log.prn ? `<span class="activity-prn">${esc(log.prn)}</span>` : ''}</div>
        <div class="activity-summary">${esc(prettySummary(log))}</div>
        <div class="activity-meta"><span class="activity-chip category">${esc(log.category)}</span>${log.branch ? `<span class="activity-chip">${esc(log.branch)}</span>` : ''}${log.year ? `<span class="activity-chip">${esc(log.year)}</span>` : ''}${log.class ? `<span class="activity-chip">${esc(log.class)}</span>` : ''}</div>
        ${changeHtml(log)}
      </div>
      <time class="activity-time" datetime="${esc(log.created_at)}" title="${esc(fullTime(log.created_at))}">${esc(relativeTime(log.created_at))}<br>${esc(shortTime(log.created_at))}</time>
    </article>`;
  }

  function prettySummary(log) {
    const base = log.summary || `${log.category} ${log.action}`;
    return base.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === '') return 'Empty';
    if (typeof value === 'object') return Array.isArray(value) ? `${value.length} items` : 'Updated';
    const text = String(value);
    return text.length > 48 ? `${text.slice(0,45)}…` : text;
  }

  function changeHtml(log) {
    if (log.action !== 'updated') return '';
    const fields = (log.changed_fields || []).slice(0,4);
    if (!fields.length || fields.includes('profile')) return '';
    const rows = fields.map(field => `<div class="activity-change"><b>${esc(field.replace(/_/g,' '))}</b><span>${esc(displayValue(log.old_values?.[field]))}</span><span class="arrow">→</span><span>${esc(displayValue(log.new_values?.[field]))}</span></div>`).join('');
    return `<div class="activity-change-list">${rows}</div>`;
  }

  function shortTime(value) { if (!value) return '—'; return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour:'numeric', minute:'2-digit' }).format(new Date(value)); }
  function fullTime(value) { return new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', dateStyle:'medium', timeStyle:'medium' }).format(new Date(value)); }
  function relativeTime(value) {
    const diff = Math.max(0, Date.now() - new Date(value).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  function startPolling() {
    stopPolling();
    state.timer = setInterval(() => {
      const panel = document.getElementById('tab-student-activity');
      if (panel?.classList.contains('active') && !document.hidden && state.page === 1) load(false, true);
    }, 10000);
  }
  function stopPolling() { if (state.timer) clearInterval(state.timer); state.timer = null; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
})();
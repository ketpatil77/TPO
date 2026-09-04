(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const token = new URLSearchParams(location.search).get('t') || '';
  const host = document.getElementById('publicProfile');
  const loading = document.getElementById('publicProfileLoading');
  const errorBox = document.getElementById('publicProfileError');

  function record(title, subline, meta = '', links = []) {
    return `<div class="pp-record"><strong>${esc(title)}</strong>${subline ? `<span>${esc(subline)}</span>` : ''}${meta ? `<small>${esc(meta)}</small>` : ''}${links.length ? `<div class="pp-record-links">${links.filter(item => item.href).map(item => `<a href="${esc(item.href)}" target="_blank" rel="noopener">${esc(item.label)}</a>`).join('')}</div>` : ''}</div>`;
  }

  function render(data) {
    const s = data.student || {};
    document.title = `${s.name || 'Student'} · AIT Verified Profile`;
    const projects = data.projects || [];
    const research = data.research_papers || [];
    const internships = data.internships || [];
    const certificates = data.certificates || [];
    const skills = data.skills || [];
    const achievements = data.achievements || [];
    host.innerHTML = `
      <section class="pp-hero">
        <div><span class="pp-verified">✓ AIT verified portfolio</span><h1>${esc(s.name || 'Student')}</h1><p>${esc([s.branch,s.class,s.year].filter(Boolean).join(' · '))}</p></div>
        <div class="pp-actions">${data.resume_available ? '<button id="ppResume" class="pp-btn primary" type="button">Open resume</button>' : ''}<button id="ppShare" class="pp-btn" type="button">Share</button></div>
      </section>
      <section class="pp-metrics">
        <div class="pp-metric"><span>Career readiness</span><strong>${Number(data.readiness?.score || 0)}/100</strong><small>Profile guidance score</small></div>
        <div class="pp-metric"><span>CGPA</span><strong>${esc(s.cgpa_overall || '—')}</strong><small>Academic profile</small></div>
        <div class="pp-metric"><span>Projects</span><strong>${projects.length}</strong><small>Portfolio work</small></div>
        <div class="pp-metric"><span>Verified credentials</span><strong>${certificates.length}</strong><small>Certificate records</small></div>
      </section>
      <div class="pp-layout">
        <div class="pp-stack">
          <section class="pp-card"><h2>Skills</h2><div class="pp-chips">${skills.length ? skills.map(item => `<span class="pp-chip">${esc(item.skill)}</span>`).join('') : '<span class="pp-chip">No public skills listed</span>'}</div></section>
          <section class="pp-card"><h2>Projects</h2><div class="pp-records">${projects.length ? projects.map(item => record(item.title,item.summary,item.technologies,[{label:'Live project',href:item.project_url},{label:'Repository',href:item.repository_url}])).join('') : '<p>No public projects listed.</p>'}</div></section>
          ${research.length ? `<section class="pp-card"><h2>Research</h2><div class="pp-records">${research.map(item => record(item.title,`${item.publication || ''}${item.authors ? ` · ${item.authors}` : ''}`,item.abstract,[{label:'DOI',href:item.doi_url},{label:'Paper',href:item.paper_url}])).join('')}</div></section>` : ''}
        </div>
        <aside class="pp-stack">
          <section class="pp-card"><h2>Achievements</h2><div class="pp-achievements">${achievements.length ? achievements.map(item => `<div class="pp-achievement"><strong>${esc(item.label)}</strong><small>${esc(item.detail || '')}</small></div>`).join('') : '<p>Milestones will appear as the profile grows.</p>'}</div></section>
          ${internships.length ? `<section class="pp-card"><h2>Experience</h2><div class="pp-records">${internships.map(item => record(item.company,item.role,[item.start_date,item.end_date].filter(Boolean).join(' → '))).join('')}</div></section>` : ''}
          ${certificates.length ? `<section class="pp-card"><h2>Verified certificates</h2><div class="pp-records">${certificates.map(item => record(item.name,item.issuer,item.date || '')).join('')}</div></section>` : ''}
          <section class="pp-card"><h2>Professional links</h2><div class="pp-links">${s.github_url ? `<a href="${esc(s.github_url)}" target="_blank" rel="noopener">GitHub <span>Open →</span></a>` : ''}${s.portfolio_url ? `<a href="${esc(s.portfolio_url)}" target="_blank" rel="noopener">Portfolio <span>Open →</span></a>` : ''}${!s.github_url && !s.portfolio_url ? '<p>No public professional links.</p>' : ''}</div></section>
        </aside>
      </div>
      <footer class="pp-footer">AIT Training & Placement Portal · Public links expire automatically for privacy.</footer>`;

    host.querySelector('#ppShare')?.addEventListener('click', async () => {
      if (navigator.share) {
        try { await navigator.share({ title: document.title, url: location.href }); return; } catch (_) {}
      }
      try { await navigator.clipboard.writeText(location.href); } catch (_) {}
    });
    host.querySelector('#ppResume')?.addEventListener('click', async () => {
      const button = host.querySelector('#ppResume');
      button.disabled = true; button.textContent = 'Opening…';
      try {
        const response = await fetch(`/api/public/resume?token=${encodeURIComponent(token)}`, { cache:'no-store' });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json?.error?.message || 'Resume unavailable.');
        window.open(json.data.url, '_blank', 'noopener');
      } catch (error) {
        button.textContent = error.message;
        setTimeout(() => { button.textContent = 'Open resume'; button.disabled = false; }, 2200);
        return;
      }
      button.disabled = false; button.textContent = 'Open resume';
    });
    loading.hidden = true; errorBox.hidden = true; host.hidden = false;
  }

  async function load() {
    if (!token) return fail('This profile link is incomplete.');
    try {
      const response = await fetch(`/api/public/profile?token=${encodeURIComponent(token)}`, { cache:'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json?.error?.message || 'Profile unavailable.');
      render(json.data);
    } catch (error) { fail(error.message); }
  }

  function fail(message) {
    loading.hidden = true; host.hidden = true; errorBox.hidden = false;
    errorBox.innerHTML = `<strong>Profile unavailable</strong><span>${esc(message || 'This share link may have expired.')}</span>`;
  }

  load();
})();

(() => {
  if (window.__aitStudentProjectsProInstalled) return;
  window.__aitStudentProjectsProInstalled = true;

  function directSummary(card) {
    return Array.from(card.children).find(node => node.tagName === 'P' && !node.classList.contains('research-publication')) || null;
  }

  function compactTags(tags) {
    if (!tags || tags.dataset.compacted === 'true') return;
    tags.dataset.compacted = 'true';
    const chips = Array.from(tags.querySelectorAll('.project-tag'));
    if (chips.length <= 5) return;
    chips.slice(5).forEach(chip => chip.hidden = true);
    const more = document.createElement('span');
    more.className = 'project-tag-more';
    more.textContent = `+${chips.length - 5} more`;
    more.title = chips.slice(5).map(chip => chip.textContent.trim()).join(', ');
    tags.appendChild(more);
  }

  function enhanceCard(card) {
    if (!card || card.dataset.projectProReady === 'true' || card.classList.contains('research-card')) return;

    const head = card.querySelector(':scope > .project-card-head');
    if (!head) return;

    const summary = directSummary(card);
    const tags = card.querySelector(':scope > .project-tags');
    const links = card.querySelector(':scope > .project-links');
    const actions = head.querySelector('.item-actions');
    const title = head.querySelector('h3');

    card.dataset.projectProReady = 'true';
    card.classList.add('project-card-pro');

    if (title) {
      title.title = title.textContent.trim();
      title.setAttribute('aria-label', title.textContent.trim());
    }

    const body = document.createElement('div');
    body.className = 'project-card-body';

    if (summary) {
      summary.classList.add('project-summary');
      summary.title = summary.textContent.trim();
      body.appendChild(summary);
    }

    if (tags) {
      compactTags(tags);
      body.appendChild(tags);
    }

    if (body.childNodes.length) card.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'project-card-footer';

    if (links) footer.appendChild(links);
    if (actions) {
      const edit = actions.querySelector('.btn-secondary');
      const remove = actions.querySelector('.btn-danger');
      if (edit) {
        edit.title = 'Edit project';
        edit.setAttribute('aria-label', `Edit ${title?.textContent?.trim() || 'project'}`);
      }
      if (remove) {
        remove.title = 'Delete project';
        remove.setAttribute('aria-label', `Delete ${title?.textContent?.trim() || 'project'}`);
      }
      footer.appendChild(actions);
    }

    if (footer.childNodes.length) card.appendChild(footer);
  }

  function enhanceAll() {
    const container = document.getElementById('projectsList');
    if (!container) return;
    Array.from(container.children).forEach(enhanceCard);
  }

  function install() {
    const container = document.getElementById('projectsList');
    if (!container) return;

    let queued = false;
    const queueEnhance = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        enhanceAll();
      });
    };

    enhanceAll();
    new MutationObserver(queueEnhance).observe(container, { childList: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

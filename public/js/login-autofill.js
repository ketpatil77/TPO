(() => {
  if (!document.body.classList.contains('unified-auth-shell')) return;

  const forms = {
    student: document.getElementById('studentUnifiedForm'),
    admin: document.getElementById('adminUnifiedForm'),
    observer: document.getElementById('observerUnifiedForm')
  };

  function configureStudentCredentials() {
    const form = forms.student;
    const prn = document.getElementById('studentPrn');
    const password = document.getElementById('studentDob');
    if (!form || !prn || !password) return;

    form.setAttribute('method', 'post');
    form.setAttribute('action', '/api/auth/login');
    form.setAttribute('autocomplete', 'on');
    prn.type = 'text';
    prn.name = 'username';
    prn.setAttribute('autocomplete', 'section-student username');
    prn.setAttribute('autocapitalize', 'none');
    password.name = 'password';
    password.setAttribute('autocomplete', 'section-student current-password');

    let credentialRequestInFlight = false;
    async function askCredentialManager() {
      if (credentialRequestInFlight || prn.value || !navigator.credentials || typeof window.PasswordCredential === 'undefined') return;
      credentialRequestInFlight = true;
      try {
        const credential = await navigator.credentials.get({ password: true, mediation: 'optional' });
        if (credential && credential.type === 'password') {
          prn.value = credential.id || '';
          password.value = credential.password || '';
          prn.dispatchEvent(new Event('input', { bubbles: true }));
          password.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (_) { /* Chrome may choose to show its own suggestion UI instead. */ }
      finally { credentialRequestInFlight = false; }
    }

    prn.addEventListener('focus', askCredentialManager);
    prn.addEventListener('pointerdown', () => window.setTimeout(askCredentialManager, 0));
  }

  function isolateRole(role) {
    Object.entries(forms).forEach(([key, form]) => {
      if (!form) return;
      const active = key === role;
      form.toggleAttribute('hidden', !active);
      form.setAttribute('aria-hidden', String(!active));
    });
  }

  function install() {
    configureStudentCredentials();
    isolateRole(document.body.dataset.activeRole || 'student');
    document.querySelectorAll('.role-toggle-btn').forEach(button => {
      button.addEventListener('click', () => isolateRole(button.dataset.role), true);
    });
    new MutationObserver(() => isolateRole(document.body.dataset.activeRole || 'student'))
      .observe(document.body, { attributes: true, attributeFilter: ['data-active-role'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
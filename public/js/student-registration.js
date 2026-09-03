document.addEventListener('DOMContentLoaded', async () => {
    const excelTemplateLink = document.querySelector('a[href="/templates/AIT-roster-template.xlsx"]');
    if (excelTemplateLink) {
        excelTemplateLink.title = 'PRN column is preformatted as Text so long PRNs keep every digit.';
        excelTemplateLink.addEventListener('click', async event => {
            event.preventDefault();
            const originalText = excelTemplateLink.textContent;
            excelTemplateLink.textContent = 'Preparing safe Excel template…';
            excelTemplateLink.setAttribute('aria-busy', 'true');
            try {
                const response = await fetch('/templates/AIT-roster-template-safe.b64?v=20260903-prn-text1', { cache: 'no-store' });
                if (!response.ok) throw new Error('Unable to prepare Excel template.');
                const base64 = (await response.text()).replace(/\s+/g, '');
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const download = document.createElement('a');
                download.href = url;
                download.download = 'AIT-roster-template.xlsx';
                document.body.appendChild(download);
                download.click();
                download.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (error) {
                console.error('Safe roster template download failed:', error);
                alert('Unable to prepare the PRN-safe Excel template. Reload the page and try again.');
            } finally {
                excelTemplateLink.textContent = originalText;
                excelTemplateLink.removeAttribute('aria-busy');
            }
        });
    }

    const observer = Boolean(document.querySelector('.observer-tabs'));
    const anchor = document.getElementById(observer ? 'observerTab-roster' : 'tab-roster');
    if (!anchor) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tab-btn'; button.setAttribute('role', 'tab');
    button.textContent = 'Student registration'; button.setAttribute('aria-selected', 'false');
    const panel = document.createElement('section');
    panel.id = observer ? 'observerTab-registration' : 'tab-registration';
    panel.className = 'tab-content'; panel.setAttribute('role', 'tabpanel');
    button.setAttribute('aria-controls', panel.id);
    const rosterButton = document.querySelector(`[aria-controls="${anchor.id}"]`);
    rosterButton.after(button);
    if (observer) document.querySelector('.observer-tabs')?.after(panel);
    else anchor.after(panel);
    panel.innerHTML = `<div class="glass-card"><h3>Student registration</h3><p>Add one student without uploading a roster. Existing PRNs cannot be overwritten.</p>
      <form id="studentRegistrationForm" class="student-registration-form">
      <div><label class="form-label" for="registrationPrn">PRN</label><input class="form-input" id="registrationPrn" name="prn" type="text" inputmode="numeric" pattern="[0-9]{10,20}" minlength="10" maxlength="20" required aria-describedby="registrationPrnHelp"><small id="registrationPrnHelp">Exact digits. Never rounded or converted to a number.</small></div>
      <div><label class="form-label" for="registrationName">Full name</label><input class="form-input" id="registrationName" name="name" minlength="2" maxlength="150" required autocomplete="off"></div>
      <div><label class="form-label" for="registrationDob">Date of birth</label><input class="form-input" id="registrationDob" name="dob" type="date" required><small>Student login password uses DDMMYY.</small></div>
      <div><label class="form-label" for="registrationBranch">Branch</label><select class="form-select" id="registrationBranch" name="branch" required><option value="">Select branch</option>${['AIML','CT','EE','ME','CE','E&C'].map(b => `<option>${b.replace('&','&amp;')}</option>`).join('')}</select></div>
      <div><label class="form-label" for="registrationYear">Year</label><select class="form-select" id="registrationYear" name="year" required><option value="">Select year</option>${['First Year','Second Year','Third Year','Final Year'].map(y => `<option>${y}</option>`).join('')}</select></div>
      <div><label class="form-label" for="registrationClass">Class / division</label><input class="form-input" id="registrationClass" name="class" maxlength="20" pattern="[A-Za-z0-9 -]{1,20}" placeholder="e.g. BE-A" required></div>
      <div class="registration-footer"><button type="submit" class="btn btn-primary">Register student</button><p id="registrationStatus" role="status" aria-live="polite"></p></div></form></div>`;
    button.addEventListener('click', () => {
        if (!observer) return switchAdminTab('registration', button);
        document.querySelectorAll('.observer-tabs .tab-btn').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-selected', String(b === button)); });
        document.querySelectorAll('[id^="observerTab-"]').forEach(p => p.classList.toggle('active', p === panel));
    });
    const form = panel.querySelector('form');
    const status = document.getElementById('registrationStatus');
    const branch = document.getElementById('registrationBranch');
    if (observer) {
        form.querySelector('button').disabled = true;
        try {
            const response = await fetch('/api/observer/auth/me');
            const session = await response.json();
            if (!response.ok || !session.observer?.department) throw new Error('Unable to confirm TPC department. Reload and try again.');
            branch.value = session.observer.department;
            if (!branch.value) throw new Error('TPC department is not supported. Contact TPO.');
            branch.disabled = true; form.querySelector('button').disabled = false;
        } catch (error) { status.textContent = error.message; }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const submit = form.querySelector('button'); submit.disabled = true; status.textContent = 'Registering…';
        const payload = Object.fromEntries(new FormData(form)); payload.branch = branch.value;
        try {
            const response = await fetch(observer ? '/api/observer/register-student' : '/api/admin/roster/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Registration failed.');
            status.textContent = `${payload.name} (${payload.prn}) registered. Login: PRN + DOB in DDMMYY format.`;
            ['prn','name','dob'].forEach(name => { form.elements[name].value = ''; });
            form.elements.prn.focus();
            if (observer) Promise.allSettled([loadRoster(), loadOverview()]);
        } catch (error) { status.textContent = error.message; }
        finally { submit.disabled = false; }
    });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8');

test('all authenticated portal shells load section interactions', () => {
    for (const role of ['dashboard', 'admin-dashboard', 'observer-dashboard']) {
        assert.match(read(`public/${role}.html`), /portal-sections\.js/);
    }
});

test('section tasks preserve forms, expose labels and support modal keyboard recovery', () => {
    const script = read('public/js/portal-sections.js');
    for (const id of ['assessmentForm','interviewForm','offerForm','calendarForm','driveForm','staffCreateForm']) assert.ok(script.includes(id));
    assert.match(script, /details\.append\(element\)/);
    assert.match(script, /label\.htmlFor = control\.id/);
    assert.match(script, /field\.validationMessage/);
    assert.match(script, /event\.key === 'Escape'/);
    assert.match(script, /event\.shiftKey/);
    assert.match(script, /lastOutsideTrigger/);
});

test('resume label follows backlog fields and both collections use responsive grid', () => {
    const html = read('public/dashboard.html');
    assert.ok(html.indexOf('for="resumeFile"') > html.indexOf('id="backlogSem8"'));
    assert.match(html, /id="jobBoardGrid" class="collection-grid"/);
    assert.match(html, /id="alumniGrid" class="collection-grid"/);
    assert.ok(html.indexOf('<!-- dashboardContent:') > html.indexOf('id="tab-alumni"'));
});

function jobContext(response) {
    const grid = { innerHTML: '' };
    const context = { document: { getElementById: () => grid }, fetch: async () => response, escapeHtml: text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') };
    const source = read('public/js/dashboard.js');
    vm.runInNewContext(source.slice(source.indexOf('async function loadJobBoard()'),source.indexOf('async function applyForDrive(')), context);
    return { grid, context };
}

test('job board renders complete escaped description rather than cutting text mid-entity', async () => {
    const description = 'Long role description '.repeat(20) + '<script>not executable</script>';
    const { grid, context } = jobContext({ ok: true, json: async () => ({ success:true, data:[{ id:'fixture',company:'Example',role:'Engineer',jd_text:description,applied:true }] }) });
    await context.loadJobBoard();
    assert.match(grid.innerHTML, /<details><summary>Read full job description/);
    assert.ok(grid.innerHTML.includes('&lt;script&gt;not executable&lt;/script&gt;'));
    assert.ok(grid.innerHTML.includes('Long role description '.repeat(20)));
});

test('job board empty and failed responses provide a retry action', async () => {
    for (const response of [
        {ok:true,json:async()=>({success:true,data:[]})},
        {ok:false,json:async()=>({error:{message:'Try later'}})}
    ]) {
        const { grid, context } = jobContext(response);
        await context.loadJobBoard();
        assert.match(grid.innerHTML, /onclick="loadJobBoard\(\)"/);
        assert.match(grid.innerHTML, /panel-empty/);
    }
});

test('lateral-entry semester progress credits semesters one and two without changing CGPA scores', () => {
    const source = read('public/js/dashboard.js');
    const start = source.indexOf('function semesterProgress(');
    const end = source.indexOf('\nfunction renderDashboard(', start);
    assert.ok(start >= 0 && end > start, 'semesterProgress helper must exist');
    const context = {};
    vm.runInNewContext(`${source.slice(start, end)};this.semesterProgress=semesterProgress;`, context);

    const scores = { sem1:0, sem2:0, sem3:8.1, sem4:8.2, sem5:8.3 };
    const lateral = context.semesterProgress({ lateral_entry:true, cgpa_semesterwise:scores }, null);
    assert.equal(lateral.completed, 5);
    assert.equal(lateral.cards[0].state, 'credited');
    assert.equal(lateral.cards[1].state, 'credited');
    assert.equal(lateral.cards[2].display, '8.10');

    const regular = context.semesterProgress({ lateral_entry:false, cgpa_semesterwise:scores }, null);
    assert.equal(regular.completed, 3);
    assert.equal(regular.cards[0].state, 'pending');

    const renderBlock = source.slice(source.indexOf('function renderDashboard('), source.indexOf('\nfunction updateAvatarRequirement('));
    assert.doesNotMatch(renderBlock, /\bsems\b/, 'renderDashboard must use semesterProgress output consistently');
});

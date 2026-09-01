// Isolated UI fixture server: no credentials, API calls, or production writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
http.createServer((req,res) => {
    const url = new URL(req.url,'http://127.0.0.1');
    if (url.pathname === '/api/observer/auth/me') {
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({observer:{department:'CT'}})); return;
    }
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404).end();return;}
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type', file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');
    if (!file.endsWith('.html')) {res.end(fs.readFileSync(file));return;}
    let html = fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    html = html.replace('</head>', '<link rel="stylesheet" href="/css/portal-identifiers-20260814.css"><link rel="stylesheet" href="/css/admin-alignment-20260814.css"><link rel="stylesheet" href="/css/portal-responsive.css"></head>');
    html = html.replace('</body>', `<script>
    const requested = new URL(location.href).searchParams;
    document.documentElement.dataset.theme = requested.get('theme') || 'dark';
    document.querySelectorAll('.dashboard-skeleton').forEach(e=>e.remove());
    document.getElementById('dashboardContent')?.removeAttribute('hidden');
    document.querySelectorAll('[aria-busy]').forEach(e=>e.setAttribute('aria-busy','false'));
    document.querySelectorAll('table').forEach(table=>{const heads=[...table.querySelectorAll('th')];const body=table.querySelector('tbody');if(!body)return;body.innerHTML='<tr>'+heads.map((h,i)=>'<td>'+ (h.textContent.includes('PRN')?'2505365111251504':h.textContent.includes('Name')?'A very long sample student name for responsive layout verification':h.textContent.includes('Action')?'<button class="btn btn-secondary">View profile</button>':'Sample content')+'</td>').join('')+'</tr>';});
    function showTab(button) {document.querySelectorAll('.tab-btn').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-selected',String(b===button));});document.querySelectorAll('.tab-content').forEach(p=>p.classList.toggle('active',p.id===button.getAttribute('aria-controls')));}
    window.switchAdminTab = (key,button) => showTab(button);
    document.querySelectorAll('.tab-btn').forEach(b=>{b.removeAttribute('onclick');b.addEventListener('click',()=>showTab(b));});
    const chosen=[...document.querySelectorAll('.tab-btn')].find(b=>b.getAttribute('aria-controls')===requested.get('tab'));if(chosen)showTab(chosen);
    // Fixture-only modal behavior. No application scripts or write endpoints are loaded.
    const modalNames={Internship:'internshipModal',Certificate:'certificateModal',Project:'projectModal',Research:'researchModal'};
    document.querySelectorAll('[onclick]').forEach(button=>{const handler=button.getAttribute('onclick');for(const [name,id] of Object.entries(modalNames)){if(handler.includes('open'+name+'Modal(')||handler.includes('close'+name+'Modal(')){button.removeAttribute('onclick');button.addEventListener('click',()=>document.getElementById(id)?.classList.toggle('active',handler.startsWith('open')));}}});
    document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>event.preventDefault()));
    if(requested.get('modal'))document.getElementById(requested.get('modal'))?.classList.add('active');
    </script><script src="/js/responsive-tables.js"></script><script src="/js/portal-responsive.js"></script><script src="/js/portal-sections.js"></script><script src="/js/student-registration.js"></script></body>`);
    res.end(html);
}).listen(4177,'127.0.0.1',()=>console.log('UI fixtures: http://127.0.0.1:4177/admin-dashboard.html (no backend)'));

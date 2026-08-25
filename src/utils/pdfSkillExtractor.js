const { getDocumentProxy, extractText } = require('unpdf');
const { textCoverage, normalizeTerm, SYNONYM_MAP } = require('./matching');

const SKILLS = [
    ['Python', ['python', 'py', 'py3', 'python3']],
    ['JavaScript', ['javascript', 'js', 'vanilla js', 'ecmascript']],
    ['TypeScript', ['typescript', 'ts']],
    ['PHP', ['php']],
    ['Java', ['java']],
    ['C', ['c language']],
    ['C++', ['c++', 'cpp', 'c plus plus']],
    ['C#', ['c#', 'csharp', 'c sharp']],
    ['SQL', ['sql', 'mysql', 'postgresql', 'postgres', 'sqlite']],
    ['Flask', ['flask']],
    ['Django', ['django']],
    ['CodeIgniter', ['codeigniter']],
    ['Node.js', ['node.js', 'nodejs', 'node', 'node js']],
    ['Express.js', ['express.js', 'expressjs', 'express']],
    ['REST APIs', ['rest api', 'restful api', 'api', 'apis']],
    ['React', ['react', 'reactjs', 'react.js', 'react hooks']],
    ['Vite', ['vite']],
    ['Zustand', ['zustand']],
    ['HTML5', ['html5', 'html']],
    ['CSS3', ['css3', 'css']],
    ['Bootstrap', ['bootstrap']],
    ['Tailwind CSS', ['tailwind css', 'tailwind']],
    ['Celery', ['celery']],
    ['Redis', ['redis']],
    ['PostgreSQL', ['postgresql', 'postgres', 'pg']],
    ['SQLite', ['sqlite', 'sqlite3']],
    ['MySQL', ['mysql']],
    ['Supabase', ['supabase']],
    ['Docker', ['docker', 'containerization']],
    ['Docker Compose', ['docker compose']],
    ['Kubernetes', ['kubernetes', 'k8s']],
    ['Git', ['git']],
    ['GitHub', ['github']],
    ['Linux', ['linux', 'ubuntu']],
    ['Windows', ['windows']],
    ['PowerShell', ['powershell']],
    ['PythonAnywhere', ['pythonanywhere']],
    ['Pandas', ['pandas']],
    ['NumPy', ['numpy']],
    ['TensorFlow', ['tensorflow', 'tf']],
    ['PyTorch', ['pytorch', 'torch']],
    ['TensorRT', ['tensorrt']],
    ['CNNs', ['cnn', 'convolutional neural network']],
    ['Machine Learning', ['machine learning', 'ml', 'machine-learning']],
    ['Deep Learning', ['deep learning', 'dl', 'deep-learning']],
    ['Computer Vision', ['computer vision', 'cv', 'computer-vision']],
    ['Natural Language Processing', ['natural language processing', 'nlp']],
    ['Artificial Intelligence', ['artificial intelligence', 'ai']],
    ['CI/CD', ['ci/cd', 'cicd', 'ci cd']],
    ['AWS', ['aws', 'amazon web services']],
    ['GCP', ['gcp', 'google cloud']],
    ['Azure', ['azure', 'microsoft azure']],
    ['SpeechBrain', ['speechbrain']],
    ['Faster-Whisper', ['faster-whisper', 'faster whisper']],
    ['BiFPN', ['bifpn']],
    ['Cross-modal attention', ['cross-modal attention', 'cross modal attention']],
    ['Multi-view fusion', ['multi-view fusion', 'multi view fusion']],
    ['Penetration testing', ['penetration testing', 'penetration test']],
    ['IDS/IPS', ['ids/ips', 'ids', 'ips']],
    ['SIEM', ['siem']],
    ['Wireshark', ['wireshark']],
    ['MITM analysis', ['mitm']],
    ['Firewall auditing', ['firewall auditing', 'firewall audit']],
    ['Threat hunting', ['threat hunting']],
    ['Cryptography', ['cryptography']],
    ['Network monitoring', ['network monitoring']],
    ['Packet analysis', ['packet analysis']],
    ['Routing and switching', ['routing and switching', 'routing & switching']],
    ['VLAN', ['vlan']],
    ['Subnetting', ['subnetting']],
    ['CCNA', ['ccna']],
    ['CCNP', ['ccnp']],
    ['Prompt engineering', ['prompt engineering']],
    ['Intelligent automation', ['intelligent automation']],
    ['AI-assisted development', ['ai-assisted development', 'ai assisted development']],
    ['Data analysis', ['data analysis', 'data analyst']],
    ['Monitoring dashboards', ['monitoring dashboard', 'observability dashboard']],
    ['RBAC', ['rbac', 'role-based access control']],
    ['Agile', ['agile', 'scrum']],
    ['QA testing', ['qa testing', 'qa test']]
];

async function extractPdfText(buffer) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    if (pdf.numPages > 10) throw new Error('Resume PDF must be 10 pages or fewer.');
    const result = await extractText(pdf, { mergePages: true });
    return String(result.text || '').replace(/\s+/g, ' ').trim();
}

function boundaryPattern(term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'gi');
}

async function extractSkillsFromPdf(buffer) {
    const text = await extractPdfText(buffer);
    const lowered = text.toLowerCase();
    const suggestions = [];
    for (const [skill, aliases] of SKILLS) {
        let hits = 0;
        for (const alias of aliases) {
            hits += [...lowered.matchAll(boundaryPattern(alias.toLowerCase()))].length;
        }
        if (hits) suggestions.push({ skill, hits, confidence: hits >= 3 ? 'high' : hits === 2 ? 'medium' : 'suggested' });
    }
    suggestions.sort((a, b) => b.hits - a.hits || a.skill.localeCompare(b.skill));
    return { suggestions: suggestions.slice(0, 50), textLength: text.length };
}

const ATS_PROFILES = {
    software: {
        keywords: ['python', 'java', 'javascript', 'c++', 'react', 'node', 'sql', 'database', 'api', 'git', 'algorithm', 'data structures', 'agile', 'aws', 'docker', 'typescript', 'go', 'rust', 'angular', 'vue', 'django', 'flask', 'spring boot', '.net', 'azure', 'gcp', 'kubernetes', 'jenkins', 'ci/cd', 'terraform', 'microservices', 'graphql', 'oop', 'system design', 'scrum', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'kafka'],
        maxScore: 100
    },
    data: {
        keywords: ['python', 'r', 'sql', 'machine learning', 'data analysis', 'pandas', 'numpy', 'statistics', 'tableau', 'power bi', 'deep learning', 'excel', 'visualization', 'database', 'hadoop', 'spark', 'tensorflow', 'pytorch', 'nlp', 'computer vision', 'data engineering', 'etl', 'data warehouse', 'big data', 'predictive modeling'],
        maxScore: 100
    },
    electronics: {
        keywords: ['c', 'c++', 'embedded', 'iot', 'microcontroller', 'vlsi', 'verilog', 'vhdl', 'matlab', 'pcb', 'circuit', 'signal processing', 'arduino', 'raspberry pi', 'fpga', 'rtos', 'arm', 'spicem', 'oscilloscope', 'soldering', 'rf', 'antenna', 'wireless', 'telecommunications'],
        maxScore: 100
    },
    mechanical: {
        keywords: ['autocad', 'solidworks', 'ansys', 'catia', 'thermodynamics', 'fluid', 'manufacturing', 'cad', 'cam', 'cae', 'robotics', 'quality', 'machining', 'design', 'ptc creo', 'siemens nx', 'heat transfer', 'fea', 'cfd', 'gd&t', 'lean', 'six sigma', 'rca', 'cnc', 'injection molding', '3d printing', 'plm', 'bom', 'fmea'],
        maxScore: 100
    },
    civil: {
        keywords: ['autocad', 'staad', 'revit', 'surveying', 'construction', 'structural', 'geotechnical', 'environmental', 'concrete', 'steel', 'planning', 'project', 'site', 'autocad civil 3d', 'microstation', 'sap2000', 'etabs', 'hec-ras', 'arcgis', 'bluebeam revu', 'primavera p6', 'hydrology', 'topographic', 'osha', 'leed', 'estimating'],
        maxScore: 100
    },
    management: {
        keywords: ['agile', 'scrum', 'jira', 'leadership', 'communication', 'project management', 'product', 'roadmap', 'strategy', 'planning', 'stakeholder', 'team', 'delivery', 'operations', 'change management', 'kpi', 'risk management', 'financial modeling', 'p&l', 'budgeting', 'forecasting', 'roi', 'm&a', 'tableau', 'power bi', 'excel', 'erp', 'salesforce'],
        maxScore: 100
    }
};

const githubCache = new Map();

async function scoreResumeAts(buffer, profileKey) {
    const text = await extractPdfText(buffer);
    const lowered = text.toLowerCase();

    const profile = ATS_PROFILES[profileKey] || ATS_PROFILES.software;
    const requiredKeywords = profile.keywords;

    let matched = [];
    let missing = [];
    let githubData = null;

    const ghMatch = text.match(/github\.com\/([a-zA-Z0-9-]+)/i);
    if (ghMatch) {
        const username = ghMatch[1].toLowerCase();
        if (githubCache.has(username)) {
            githubData = githubCache.get(username);
        } else {
            try {
                const headers = { 'User-Agent': 'TPO-ATS-Scorer' };
                const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                const ghRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=10&sort=updated`, { headers });
                if (ghRes.ok) {
                    const repos = await ghRes.json();
                    const languages = new Set(repos.map(r => r.language).filter(Boolean).map(l => l.toLowerCase()));
                    githubData = { username, repoCount: repos.length, languages: Array.from(languages) };
                    githubCache.set(username, githubData);
                }
            } catch (e) {
                console.error('GitHub API error:', e.message);
            }
        }
    }

    for (const kw of requiredKeywords) {
        const canonical = normalizeTerm(kw);
        const textFound = textCoverage([canonical], text) > 0;
        const ghFound = githubData && githubData.languages.some(lang => normalizeTerm(lang) === canonical);
        if (textFound || ghFound) {
            matched.push(kw);
        } else {
            missing.push(kw);
        }
    }

    let rawScore = (matched.length / requiredKeywords.length) * 100;
    if (githubData && githubData.repoCount > 0) {
        rawScore += 5; // Bonus for open source repos
    }
    const finalScore = Math.round(Math.min(100, rawScore));

    return {
        score: finalScore,
        matched,
        missing,
        status: finalScore >= 80 ? 'Excellent' : finalScore >= 50 ? 'Good' : 'Needs Improvement',
        github: githubData
    };
}

module.exports = { extractPdfText, extractSkillsFromPdf, scoreResumeAts };

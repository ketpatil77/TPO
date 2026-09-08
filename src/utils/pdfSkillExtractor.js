const { getDocumentProxy, extractText } = require('unpdf');
const { normalizeTerm } = require('./matching');

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

function matchesTerm(text, term) {
    const normalizedText = String(text || '').toLowerCase();
    const normalizedTerm = normalizeTerm(term);
    if (!normalizedTerm) return false;
    return boundaryPattern(normalizedTerm).test(normalizedText);
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

// ATS profiles are deliberately role-specific. The first terms are core skills and
// receive more weight than optional/supporting skills. This prevents a resume from
// scoring well merely because it contains generic words such as "project" or "team".
const ATS_PROFILES = {
    software: {
        label: 'Software Engineer',
        core: ['programming', 'data structures', 'algorithms', 'object oriented programming', 'git', 'sql', 'api', 'software development'],
        supporting: ['javascript', 'typescript', 'python', 'java', 'react', 'node.js', 'docker', 'testing', 'ci/cd', 'cloud', 'database', 'rest api', 'microservices', 'system design'],
        aliases: {
            programming: ['programming', 'software development', 'coding'],
            'data structures': ['data structures', 'data structure', 'dsa'],
            algorithms: ['algorithms', 'algorithm'],
            'object oriented programming': ['object oriented programming', 'object-oriented programming', 'oop'],
            api: ['api', 'apis', 'rest api', 'restful api'],
            testing: ['testing', 'unit testing', 'integration testing'],
            cloud: ['cloud', 'aws', 'azure', 'gcp'],
            database: ['database', 'databases', 'sql', 'postgresql', 'mysql', 'mongodb'],
            'software development': ['software development', 'software engineering', 'application development']
        }
    },
    data: {
        label: 'Data Scientist / Analyst',
        core: ['python', 'sql', 'statistics', 'data analysis', 'pandas', 'numpy', 'data visualization', 'machine learning'],
        supporting: ['r', 'excel', 'tableau', 'power bi', 'scikit-learn', 'deep learning', 'tensorflow', 'pytorch', 'nlp', 'computer vision', 'etl', 'data engineering', 'spark', 'hadoop'],
        aliases: {
            'data visualization': ['data visualization', 'visualization', 'visualisation', 'dashboards'],
            'machine learning': ['machine learning', 'machine-learning', 'ml'],
            statistics: ['statistics', 'statistical analysis'],
            'data analysis': ['data analysis', 'data analyst', 'data analytics'],
            'scikit-learn': ['scikit-learn', 'sklearn']
        }
    },
    electronics: {
        label: 'Electronics / Core E&TC',
        core: ['c', 'c++', 'embedded systems', 'microcontrollers', 'digital electronics', 'analog electronics', 'circuit design', 'signal processing'],
        supporting: ['iot', 'vlsi', 'verilog', 'vhdl', 'matlab', 'pcb', 'arduino', 'raspberry pi', 'fpga', 'rtos', 'arm', 'rf', 'wireless', 'telecommunications'],
        aliases: {
            'embedded systems': ['embedded systems', 'embedded system', 'embedded'],
            microcontrollers: ['microcontrollers', 'microcontroller'],
            'digital electronics': ['digital electronics', 'digital design'],
            'analog electronics': ['analog electronics', 'analogue electronics'],
            'circuit design': ['circuit design', 'circuit'],
            'signal processing': ['signal processing', 'digital signal processing', 'dsp']
        }
    },
    mechanical: {
        label: 'Mechanical Engineer',
        core: ['mechanical design', 'cad', 'solidworks', 'autocad', 'manufacturing', 'thermodynamics', 'materials', 'engineering drawing'],
        supporting: ['ansys', 'catia', 'cam', 'cae', 'robotics', 'quality', 'machining', 'ptc creo', 'siemens nx', 'heat transfer', 'fea', 'cfd', 'gd&t', 'cnc', 'injection molding', '3d printing', 'fmea'],
        aliases: {
            'mechanical design': ['mechanical design', 'machine design', 'design engineering'],
            cad: ['cad', 'computer aided design'],
            manufacturing: ['manufacturing', 'production'],
            materials: ['materials', 'engineering materials'],
            'engineering drawing': ['engineering drawing', 'technical drawing']
        }
    },
    civil: {
        label: 'Civil / Structural Engineer',
        core: ['autocad', 'structural engineering', 'construction', 'surveying', 'concrete', 'steel structures', 'engineering drawing', 'project planning'],
        supporting: ['staad', 'revit', 'geotechnical', 'environmental', 'autocad civil 3d', 'microstation', 'sap2000', 'etabs', 'hec-ras', 'arcgis', 'primavera p6', 'hydrology', 'topographic', 'osha', 'leed', 'estimating'],
        aliases: {
            'structural engineering': ['structural engineering', 'structural design', 'structural'],
            'steel structures': ['steel structures', 'steel structure', 'structural steel'],
            surveying: ['surveying', 'land surveying'],
            'project planning': ['project planning', 'construction planning', 'planning'],
            estimating: ['estimating', 'cost estimation']
        }
    },
    management: {
        label: 'Management',
        core: ['leadership', 'communication', 'project management', 'stakeholder management', 'planning', 'strategy', 'team management', 'business analysis'],
        supporting: ['agile', 'scrum', 'jira', 'product management', 'roadmap', 'operations', 'change management', 'kpi', 'risk management', 'financial modeling', 'budgeting', 'forecasting', 'roi', 'excel', 'tableau', 'power bi', 'salesforce'],
        aliases: {
            'stakeholder management': ['stakeholder management', 'stakeholder'],
            'team management': ['team management', 'team leadership', 'people management'],
            'business analysis': ['business analysis', 'business analyst'],
            'project management': ['project management', 'project manager'],
            'product management': ['product management', 'product manager']
        }
    }
};

const PROFILE_ALIASES = {
    software: ['software', 'software engineer', 'software developer', 'sw developer', 'sw dev', 'swe', 'developer', 'web developer', 'full stack', 'full-stack', 'frontend', 'front end', 'backend', 'back end'],
    data: ['data', 'data scientist', 'data analyst', 'data science', 'data analytics', 'ml engineer', 'machine learning engineer'],
    electronics: ['electronics', 'e&tc', 'entc', 'electronics communication', 'electronics engineer', 'core electronics'],
    mechanical: ['mechanical', 'mechanical engineer', 'mechanical design'],
    civil: ['civil', 'civil engineer', 'structural engineer', 'civil structural'],
    management: ['management', 'manager', 'project manager', 'product manager', 'business analyst']
};

function resolveAtsProfile(profileKey) {
    const value = String(profileKey || '').trim().toLowerCase();
    if (ATS_PROFILES[value]) return value;
    for (const [key, aliases] of Object.entries(PROFILE_ALIASES)) {
        if (aliases.includes(value)) return key;
    }
    return 'software';
}

function profileTerms(profile) {
    return [...profile.core, ...profile.supporting];
}

function scoreAtsText(text, profileKey) {
    const key = resolveAtsProfile(profileKey);
    const profile = ATS_PROFILES[key];
    const aliases = profile.aliases || {};
    const matched = [];
    const missing = [];
    let earned = 0;
    let possible = 0;

    const terms = profileTerms(profile);
    for (const term of terms) {
        const weight = profile.core.includes(term) ? 3 : 1;
        possible += weight;
        const candidates = aliases[term] || [term];
        const found = candidates.some(candidate => matchesTerm(text, candidate));
        if (found) {
            matched.push(term);
            earned += weight;
        } else {
            missing.push(term);
        }
    }

    const score = possible ? Math.round((earned / possible) * 100) : 0;
    return { score, matched, missing, role: profile.label, profile: key };
}

const githubCache = new Map();

async function getGithubProfile(text) {
    const ghMatch = text.match(/github\.com\/([a-zA-Z0-9-]+)/i);
    if (!ghMatch) return null;
    const username = ghMatch[1].toLowerCase();
    if (githubCache.has(username)) return githubCache.get(username);

    try {
        const headers = { 'User-Agent': 'TPO-ATS-Scorer' };
        const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
        if (token) headers.Authorization = `Bearer ${token}`;
        const ghRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=10&sort=updated`, { headers });
        if (!ghRes.ok) return null;
        const repos = await ghRes.json();
        const languages = [...new Set(repos.map(repo => repo.language).filter(Boolean).map(language => language.toLowerCase()))];
        const data = { username, repoCount: repos.length, languages };
        githubCache.set(username, data);
        return data;
    } catch (error) {
        console.error('GitHub API error:', error.message);
        return null;
    }
}

async function scoreResumeAts(buffer, profileKey) {
    const text = await extractPdfText(buffer);
    const resolvedProfile = resolveAtsProfile(profileKey);
    const profile = ATS_PROFILES[resolvedProfile];
    const githubData = await getGithubProfile(text);

    // GitHub evidence can satisfy a role-relevant technology, but it never adds a
    // free-standing bonus. This keeps the score tied to the selected role.
    const result = scoreAtsText(text, resolvedProfile);
    if (githubData?.languages?.length) {
        for (const term of profileTerms(profile)) {
            if (result.matched.includes(term)) continue;
            const candidates = profile.aliases?.[term] || [term];
            const githubFound = candidates.some(candidate => githubData.languages.some(language => normalizeTerm(language) === normalizeTerm(candidate)));
            if (githubFound) {
                result.matched.push(term);
                const weight = profile.core.includes(term) ? 3 : 1;
                const previousMissing = result.missing.indexOf(term);
                if (previousMissing >= 0) result.missing.splice(previousMissing, 1);
                // Recompute from the final matched set to keep rounding consistent.
                const possible = profileTerms(profile).reduce((sum, item) => sum + (profile.core.includes(item) ? 3 : 1), 0);
                const earned = result.matched.reduce((sum, item) => sum + (profile.core.includes(item) ? 3 : 1), 0);
                result.score = possible ? Math.round((earned / possible) * 100) : 0;
                void weight;
            }
        }
    }

    result.status = result.score >= 80 ? 'Excellent' : result.score >= 50 ? 'Good' : 'Needs Improvement';
    return { ...result, github: githubData };
}

module.exports = { extractPdfText, extractSkillsFromPdf, scoreResumeAts, resolveAtsProfile, scoreAtsText };
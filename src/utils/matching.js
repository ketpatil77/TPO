const SYNONYM_MAP = new Map([
    // Languages
    ['js', 'javascript'], ['javascript', 'javascript'], ['vanilla js', 'javascript'], ['ecmascript', 'javascript'],
    ['ts', 'typescript'], ['typescript', 'typescript'],
    ['py', 'python'], ['python3', 'python'], ['py3', 'python'], ['python', 'python'],
    ['cpp', 'c++'], ['c plus plus', 'c++'], ['c++', 'c++'],
    ['csharp', 'c#'], ['c sharp', 'c#'], ['c#', 'c#'],
    ['golang', 'go'], ['go lang', 'go'],

    // Web Frameworks & Libraries
    ['node', 'node.js'], ['nodejs', 'node.js'], ['node js', 'node.js'], ['node.js', 'node.js'],
    ['express', 'express.js'], ['expressjs', 'express.js'], ['express.js', 'express.js'],
    ['react', 'react'], ['reactjs', 'react'], ['react.js', 'react'], ['react native', 'react'],
    ['vue', 'vue.js'], ['vuejs', 'vue.js'], ['vue.js', 'vue.js'],
    ['angular', 'angular'], ['angularjs', 'angular'], ['angular.js', 'angular'],
    ['next', 'next.js'], ['nextjs', 'next.js'], ['next.js', 'next.js'],
    ['nuxt', 'nuxt.js'], ['nuxtjs', 'nuxt.js'], ['nuxt.js', 'nuxt.js'],

    // AI / ML / Data Science
    ['ml', 'machine learning'], ['machine-learning', 'machine learning'], ['machine learning', 'machine learning'],
    ['dl', 'deep learning'], ['deep-learning', 'deep learning'], ['deep learning', 'deep learning'],
    ['nlp', 'natural language processing'], ['natural language processing', 'natural language processing'],
    ['cv', 'computer vision'], ['computer-vision', 'computer vision'], ['computer vision', 'computer vision'],
    ['ai', 'artificial intelligence'], ['artificial-intelligence', 'artificial intelligence'], ['artificial intelligence', 'artificial intelligence'],
    ['tf', 'tensorflow'], ['tensorflow', 'tensorflow'],
    ['pytorch', 'pytorch'], ['torch', 'pytorch'],
    ['sklearn', 'scikit-learn'], ['scikit learn', 'scikit-learn'], ['scikit-learn', 'scikit-learn'],

    // Databases
    ['postgres', 'postgresql'], ['postgresql', 'postgresql'], ['pg', 'postgresql'], ['postgres db', 'postgresql'],
    ['mongo', 'mongodb'], ['mongodb', 'mongodb'],
    ['my sql', 'mysql'], ['mysql', 'mysql'],
    ['sqlite3', 'sqlite'], ['sqlite', 'sqlite'],

    // DevOps & Cloud
    ['k8s', 'kubernetes'], ['kubernetes', 'kubernetes'],
    ['docker', 'docker'], ['containerization', 'docker'], ['containers', 'docker'],
    ['aws', 'aws'], ['amazon web services', 'aws'], ['amazon aws', 'aws'],
    ['gcp', 'gcp'], ['google cloud', 'gcp'], ['google cloud platform', 'gcp'],
    ['azure', 'azure'], ['microsoft azure', 'azure'],
    ['cicd', 'ci/cd'], ['ci cd', 'ci/cd'], ['ci/cd', 'ci/cd'], ['continuous integration', 'ci/cd'],

    // Tools & Analytics
    ['powerbi', 'powerbi'], ['power bi', 'powerbi'],
    ['tableau', 'tableau'],
    ['git', 'git'], ['github', 'github'], ['gitlab', 'gitlab']
]);

function normalizeTerm(value) {
    if (!value) return '';
    const raw = String(value).trim().toLowerCase();
    // Clean punctuation except +, #, ., -, /
    const cleaned = raw.replace(/[^a-z0-9+#.\-/ ]/g, '').replace(/\s+/g, ' ').trim();
    return SYNONYM_MAP.get(cleaned) || SYNONYM_MAP.get(raw) || cleaned;
}

function normalizeTerms(values) {
    if (!values) return [];
    const list = Array.isArray(values) ? values : [values];
    return [...new Set(list.map(normalizeTerm).filter(Boolean))];
}

/**
 * Checks matching coverage of required/preferred terms against candidate text,
 * accounting for synonyms and variations.
 */
function textCoverage(terms, text) {
    if (!terms || !terms.length) return 1;
    if (!text) return 0;

    const loweredText = String(text).toLowerCase();
    const normalizedText = normalizeTerm(text);

    let matchedCount = 0;
    for (const term of terms) {
        const canonical = normalizeTerm(term);
        // Match canonical name, raw term, or any synonym pointing to the canonical name
        let found = loweredText.includes(canonical) || normalizedText.includes(canonical);
        if (!found) {
            for (const [alias, target] of SYNONYM_MAP.entries()) {
                if (target === canonical && (loweredText.includes(alias) || normalizedText.includes(alias))) {
                    found = true;
                    break;
                }
            }
        }
        if (found) matchedCount++;
    }

    return matchedCount / terms.length;
}

function scoreCandidate(student, criteria) {
    const studentSkills = normalizeTerms(student.skills?.map(item => item.skill || item));

    // Combine explicit skills with extracted skills from projects/internships
    const projectText = (student.projects || []).map(p => `${p.title || ''} ${p.summary || ''} ${p.technologies || ''}`).join(' ');
    const internshipText = (student.internships || []).map(i => `${i.company || ''} ${i.role || ''}`).join(' ');
    const certText = (student.certificates || []).map(c => `${c.name || ''} ${c.issuer || ''}`).join(' ');
    const researchText = (student.research_papers || []).map(p => `${p.title || ''} ${p.authors || ''} ${p.publication || ''} ${p.abstract || ''}`).join(' ');
    const allStudentText = `${studentSkills.join(' ')} ${projectText} ${internshipText} ${certText} ${researchText} ${student.activities || ''}`;

    const required = normalizeTerms(criteria.required_skills);
    const preferred = normalizeTerms(criteria.preferred_skills);
    const allowedBranches = normalizeTerms(criteria.branches);

    // Check missing required skills using synonym-aware textCoverage & direct skill check
    const missingRequired = required.filter(reqSkill => {
        const canonicalReq = normalizeTerm(reqSkill);
        const directMatch = studentSkills.includes(canonicalReq);
        if (directMatch) return false;
        // Text-based fallback search for synonyms in student profile
        return textCoverage([canonicalReq], allStudentText) === 0;
    });

    const reasons = [];

    if (Number(student.cgpa_overall || 0) < Number(criteria.min_cgpa || 0)) {
        reasons.push(`CGPA (${student.cgpa_overall || 0}) below minimum required (${criteria.min_cgpa})`);
    }
    if (allowedBranches.length && !allowedBranches.includes(normalizeTerm(student.branch))) {
        reasons.push(`Branch '${student.branch}' not in eligible list [${criteria.branches.join(', ')}]`);
    }
    if (criteria.graduation_year && normalizeTerm(student.year) !== normalizeTerm(criteria.graduation_year)) {
        reasons.push(`Graduation year '${student.year}' does not match '${criteria.graduation_year}'`);
    }
    if (missingRequired.length) {
        reasons.push(`Missing required skills: ${missingRequired.join(', ')}`);
    }

    const eligible = reasons.length === 0;
    const targetSkills = [...new Set([...required, ...preferred])];

    const matchedTargetSkills = targetSkills.filter(skill => {
        const canonical = normalizeTerm(skill);
        return studentSkills.includes(canonical) || textCoverage([canonical], allStudentText) > 0;
    });

    const skillsScore = targetSkills.length ? matchedTargetSkills.length / targetSkills.length : 1;
    const keywords = normalizeTerms(criteria.keywords);

    const portfolioBonus = (student.projects?.length ? textCoverage(keywords, projectText) * 0.05 : 0) +
        (student.research_papers?.length ? textCoverage(keywords, researchText) * 0.05 : 0);

    const score = eligible ? Math.min(100, Math.round(100 * (
        skillsScore * 0.60 +
        textCoverage(keywords, internshipText) * 0.15 +
        textCoverage(keywords, certText) * 0.10 +
        textCoverage(keywords, student.activities || '') * 0.05 +
        portfolioBonus
    ))) : 0;

    return {
        eligible,
        score,
        matched_skills: matchedTargetSkills,
        missing_required: missingRequired,
        reasons
    };
}

module.exports = { normalizeTerm, normalizeTerms, textCoverage, scoreCandidate, SYNONYM_MAP };

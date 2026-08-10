const SKILL_ALIASES = new Map([
    ['js', 'javascript'], ['nodejs', 'node.js'], ['node', 'node.js'],
    ['postgres', 'postgresql'], ['reactjs', 'react'], ['power bi', 'powerbi']
]);

function normalizeTerm(value) {
    const term = String(value || '').trim().toLowerCase().replace(/[^a-z0-9+#. ]/g, '').replace(/\s+/g, ' ');
    return SKILL_ALIASES.get(term) || term;
}

function normalizeTerms(values) {
    return [...new Set((values || []).map(normalizeTerm).filter(Boolean))];
}

function textCoverage(terms, text) {
    if (!terms.length) return 1;
    const normalized = normalizeTerm(text);
    return terms.filter(term => normalized.includes(term)).length / terms.length;
}

function scoreCandidate(student, criteria) {
    const studentSkills = normalizeTerms(student.skills?.map(item => item.skill || item));
    const required = normalizeTerms(criteria.required_skills);
    const preferred = normalizeTerms(criteria.preferred_skills);
    const allowedBranches = normalizeTerms(criteria.branches);
    const missingRequired = required.filter(skill => !studentSkills.includes(skill));
    const reasons = [];

    if (Number(student.cgpa_overall || 0) < Number(criteria.min_cgpa || 0)) reasons.push('CGPA below minimum');
    if (allowedBranches.length && !allowedBranches.includes(normalizeTerm(student.branch))) reasons.push('Branch not eligible');
    if (criteria.graduation_year && normalizeTerm(student.year) !== normalizeTerm(criteria.graduation_year)) reasons.push('Graduation year not eligible');
    if (missingRequired.length) reasons.push(`Missing required skills: ${missingRequired.join(', ')}`);

    const eligible = reasons.length === 0;
    const targetSkills = normalizeTerms([...required, ...preferred]);
    const skillsScore = targetSkills.length ? targetSkills.filter(s => studentSkills.includes(s)).length / targetSkills.length : 1;
    const keywords = normalizeTerms(criteria.keywords);
    const internshipText = (student.internships || []).map(i => `${i.company} ${i.role}`).join(' ');
    const certificateText = (student.certificates || []).map(c => `${c.name} ${c.issuer}`).join(' ');
    const score = eligible ? Math.round(100 * (
        skillsScore * 0.70 +
        textCoverage(keywords, internshipText) * 0.15 +
        textCoverage(keywords, certificateText) * 0.10 +
        textCoverage(keywords, student.activities || '') * 0.05
    )) : 0;

    return { eligible, score, matched_skills: targetSkills.filter(s => studentSkills.includes(s)), missing_required: missingRequired, reasons };
}

module.exports = { normalizeTerm, normalizeTerms, scoreCandidate };


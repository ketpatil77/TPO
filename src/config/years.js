const YEARS = Object.freeze(['First Year', 'Second Year', 'Third Year', 'Final Year']);

const yearLookup = new Map(YEARS.map(year => [year.toLowerCase(), year]));

function normalizeYear(value) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    return yearLookup.get(text.toLowerCase()) || null;
}

module.exports = { YEARS, normalizeYear };

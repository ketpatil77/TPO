/**
 * Utility functions for date parsing and formatting
 */

/**
 * Converts a DDMMYY string (e.g., "310703") to an ISO date string "YYYY-MM-DD" ("2003-07-31")
 * @param {string} ddmmyy 
 * @returns {string|null} ISO date format YYYY-MM-DD or null if invalid
 */
function parseDDMMYY(ddmmyy) {
    if (!ddmmyy || typeof ddmmyy !== 'string') return null;
    const cleanStr = ddmmyy.trim().replace(/\D/g, ''); // strip non-numeric
    if (cleanStr.length !== 6) return null;

    const dayStr = cleanStr.substring(0, 2);
    const monthStr = cleanStr.substring(2, 4);
    const yearStr = cleanStr.substring(4, 6);

    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const yearShort = parseInt(yearStr, 10);

    if (isNaN(day) || isNaN(month) || isNaN(yearShort)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // Assume 2000s for 00-40, 1900s for 41-99 (suitable for college student DOBs)
    const fullYear = yearShort <= 40 ? 2000 + yearShort : 1900 + yearShort;

    return validIsoDate(fullYear, month, day) || null;
}

function validIsoDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Normalize roster DOB inputs while keeping database storage as a real ISO date. */
function normalizeStudentDob(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return validIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }
    if (typeof value === 'number' && Number.isFinite(value) && value >= 20000 && value <= 80000) {
        const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
        return validIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (/^\d{5}(?:\.0+)?$/.test(text)) return normalizeStudentDob(Number(text));
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
    if (match) return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    match = text.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{4})$/);
    if (match) return validIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
    match = text.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2})$/);
    if (match) {
        const first = Number(match[1]);
        const second = Number(match[2]);
        const year = Number(match[3]) <= 40 ? 2000 + Number(match[3]) : 1900 + Number(match[3]);
        if (first <= 12 && second > 12) return validIsoDate(year, first, second);
        return validIsoDate(year, second, first);
    }
    const digits = text.replace(/\D/g, '');
    if (digits.length === 6) return parseDDMMYY(digits) || '';
    if (digits.length === 8) return validIsoDate(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
    return '';
}

function dobPasswordFromStoredDate(value) {
    const iso = normalizeStudentDob(value);
    return iso ? `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}` : '';
}

/**
 * Normalizes any Date string or object to YYYY-MM-DD format
 * @param {string|Date} dateVal 
 * @returns {string}
 */
function formatDateToYYYYMMDD(dateVal) {
    return normalizeStudentDob(dateVal);
}

/**
 * Verifies if user input (DDMMYY or YYYY-MM-DD) matches expected date from DB
 * @param {string} inputDob - User password input e.g. "310703" or "2003-07-31"
 * @param {string|Date} dbDob - Database DOB date
 * @returns {boolean}
 */
function verifyDob(inputDob, dbDob) {
    if (!inputDob || !dbDob) return false;
    
    const formattedDb = normalizeStudentDob(dbDob);
    if (!formattedDb) return false;

    // Try standard YYYY-MM-DD match first
    if (inputDob.trim() === formattedDb) return true;

    // Try DDMMYY match
    const parsedInput = parseDDMMYY(inputDob);
    if (parsedInput && parsedInput === formattedDb) return true;
    
    // Try DDMMYYYY match
    const cleanStr = inputDob.trim().replace(/\D/g, '');
    if (cleanStr.length === 8) {
        const day = cleanStr.substring(0, 2);
        const month = cleanStr.substring(2, 4);
        const year = cleanStr.substring(4, 8);
        if (`${year}-${month}-${day}` === formattedDb) return true;
    }

    return false;
}

module.exports = {
    parseDDMMYY,
    formatDateToYYYYMMDD,
    verifyDob
    ,normalizeStudentDob
    ,dobPasswordFromStoredDate
};

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

    const formattedMonth = String(month).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');

    return `${fullYear}-${formattedMonth}-${formattedDay}`;
}

/**
 * Normalizes any Date string or object to YYYY-MM-DD format
 * @param {string|Date} dateVal 
 * @returns {string}
 */
function formatDateToYYYYMMDD(dateVal) {
    if (!dateVal) return '';
    if (typeof dateVal === 'string') {
        // If already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
        // If ISO string with T
        if (dateVal.includes('T')) return dateVal.split('T')[0];
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Verifies if user input (DDMMYY or YYYY-MM-DD) matches expected date from DB
 * @param {string} inputDob - User password input e.g. "310703" or "2003-07-31"
 * @param {string|Date} dbDob - Database DOB date
 * @returns {boolean}
 */
function verifyDob(inputDob, dbDob) {
    if (!inputDob || !dbDob) return false;
    
    const formattedDb = formatDateToYYYYMMDD(dbDob);
    if (!formattedDb) return false;

    // Try standard YYYY-MM-DD match first
    if (inputDob.trim() === formattedDb) return true;

    // Try DDMMYY match
    const parsedInput = parseDDMMYY(inputDob);
    if (parsedInput && parsedInput === formattedDb) return true;

    return false;
}

module.exports = {
    parseDDMMYY,
    formatDateToYYYYMMDD,
    verifyDob
};

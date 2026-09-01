const db = require('../config/database');
const { normalizeBranch } = require('../config/branches');
const { normalizeStudentDob } = require('../utils/dateHelper');
const { clearStudentCache } = require('../routes/adminStudents');

const YEARS = ['First Year', 'Second Year', 'Third Year', 'Final Year'];

async function registerStudent(req, res) {
    const input = req.body || {};
    const prn = typeof input.prn === 'string' ? input.prn.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
    const branch = normalizeBranch(input.branch);
    const dob = normalizeStudentDob(input.dob);
    const year = input.year;
    const className = typeof input.class === 'string' ? input.class.trim() : '';
    if (!/^\d{10,20}$/.test(prn) || name.length < 2 || name.length > 150 || !branch || !dob || new Date(dob) >= new Date() || !YEARS.includes(year) || !/^[A-Za-z0-9 -]{1,20}$/.test(className)) {
        return res.status(400).json({ success: false, error: 'Enter a text PRN (10–20 digits), full name, valid past DOB, branch, class, and year.' });
    }
    if (req.observer) {
        // Check current staff assignment, not a potentially stale token claim.
        const profile = db.isLocal() ? req.observer : await db.selectOne('profiles', { user_id: req.observer.observerId });
        if (normalizeBranch(profile?.department) !== branch) return res.status(403).json({ success: false, error: 'TPC can register students only in their own department.' });
    }
    try {
        const existing = await db.selectOne('roster', { prn });
        const student = await db.selectOne('students', { prn });
        if (existing || student) return res.status(409).json({ success: false, error: 'This PRN already exists. Existing records were not changed.' });
        const record = await db.insert('roster', { prn, name, dob, branch, class: className, year });
        await clearStudentCache();
        await db.logAudit('student_manual_registration', 'roster', record.id, { prn, branch, actor: req.admin?.adminId || req.observer?.observerId });
        return res.status(201).json({ success: true, data: { prn, name, branch, year }, message: 'Student registered. They can now log in with their PRN and DOB in DDMMYY format.' });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ success: false, error: 'This PRN already exists. Existing records were not changed.' });
        return res.status(500).json({ success: false, error: 'Registration could not be confirmed. Check the roster before retrying.' });
    }
}

module.exports = { registerStudent };

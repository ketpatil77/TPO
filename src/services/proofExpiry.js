const db = require('../config/database');
const { createStudentNotification } = require('./incompleteProfilePush');

const PROOF_WINDOW_MS = 48 * 60 * 60 * 1000;

function entryTypeFor(table) {
    return table === 'internships' ? 'internship' : 'certificate';
}

function entryName(table, entry) {
    return table === 'internships'
        ? `${entry.company || 'Internship'}${entry.role ? ` - ${entry.role}` : ''}`
        : (entry.name || 'Certificate');
}

function deadlineFor(entry, now = new Date()) {
    const existing = entry.proof_deadline ? new Date(entry.proof_deadline) : null;
    if (existing && !Number.isNaN(existing.getTime())) return existing;
    const base = entry.proof_missing_since || entry.updated_at || entry.created_at || now.toISOString();
    return new Date(new Date(base).getTime() + PROOF_WINDOW_MS);
}

async function notifyMissingProof({ table, entry, studentId = entry.student_id, options = {} }) {
    if (!entry || entry.evidence_path) return null;
    const type = entryTypeFor(table);
    const deadline = deadlineFor(entry);
    const deadlineIso = deadline.toISOString();
    const notification = await createStudentNotification({
        student_id: studentId,
        audience: 'student',
        branches: [],
        title: `${type === 'internship' ? 'Internship' : 'Certificate'} proof required`,
        message: `${entryName(table, entry)}: proof is missing. Attach proof before ${deadlineIso} or this ${type} entry will be auto-deleted.`,
        priority: 'important',
        expires_at: deadlineIso,
        action_url: type === 'internship' ? '/dashboard?tab=internships' : '/dashboard?tab=certificates'
    }, options);
    if (entry.id) {
        const sentAt = new Date().toISOString();
        await db.update(table, { id: entry.id, student_id: studentId }, {
            proof_missing_since: entry.proof_missing_since || new Date(deadline.getTime() - PROOF_WINDOW_MS).toISOString(),
            proof_deadline: deadlineIso,
            proof_notice_sent_at: sentAt
        });
    }
    return notification;
}

async function runProofExpiryCleanup({ now = new Date() } = {}) {
    const nowMs = now.getTime();
    const [internships, certificates, students] = await Promise.all([
        db.select('internships'),
        db.select('certificates'),
        db.select('students')
    ]);
    const studentById = new Map((students || []).map(student => [student.id, student]));
    const result = { checked: 0, deleted: 0, internships: 0, certificates: 0, skipped_with_proof: 0, notices_sent: 0, notice_failures: 0 };

    for (const [table, rows] of [['internships', internships || []], ['certificates', certificates || []]]) {
        for (const entry of rows) {
            result.checked += 1;
            if (entry.evidence_path) {
                result.skipped_with_proof += 1;
                continue;
            }
            const deadline = deadlineFor(entry, now);
            if (deadline.getTime() > nowMs) continue;

            if (!entry.proof_notice_sent_at) {
                const resetStart = now.toISOString();
                const resetDeadline = new Date(nowMs + PROOF_WINDOW_MS).toISOString();
                const refreshed = await db.update(table, { id: entry.id, student_id: entry.student_id }, {
                    proof_missing_since: resetStart,
                    proof_deadline: resetDeadline,
                    proof_notice_sent_at: null
                });
                try {
                    await notifyMissingProof({ table, entry: refreshed || { ...entry, proof_missing_since: resetStart, proof_deadline: resetDeadline }, studentId: entry.student_id });
                    result.notices_sent += 1;
                } catch (error) {
                    result.notice_failures += 1;
                    console.error(`Missing-proof expiry notice failed for ${table}/${entry.id}:`, error.message);
                }
                continue;
            }

            const student = studentById.get(entry.student_id);
            await db.delete(table, { id: entry.id, student_id: entry.student_id });
            await db.logAudit('proof_auto_delete', table, entry.id, {
                entry_type: entryTypeFor(table),
                student_prn: student?.prn || null,
                student_id: entry.student_id,
                reason: 'no proof attached within 48hrs',
                proof_deadline: deadline.toISOString(),
                proof_notice_sent_at: entry.proof_notice_sent_at,
                deleted_at: now.toISOString()
            });
            result.deleted += 1;
            result[table] += 1;
        }
    }
    return result;
}

module.exports = { PROOF_WINDOW_MS, deadlineFor, notifyMissingProof, runProofExpiryCleanup };

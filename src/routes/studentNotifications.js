const express = require('express');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateStudent);

const NOTIFICATION_COLUMNS = 'id,title,message,priority,action_url,created_at';
const NOTIFICATION_LIMIT = 25;

function visible(item, profile, studentId) {
    return item.audience === 'all' || item.student_id === studentId || (item.audience === 'branches' && (item.branches || []).includes(profile?.branch));
}

function normalize(rows, readIds, now) {
    const unique = new Map();
    for (const row of rows) {
        if (!row || unique.has(row.id)) continue;
        if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
        unique.set(row.id, row);
    }
    return [...unique.values()]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, NOTIFICATION_LIMIT)
        .map(row => ({ ...row, read: readIds.has(row.id) }));
}

async function getStudentNotifications(studentId) {
    if (db.isLocal()) {
        const [all, reads, profile] = await Promise.all([
            db.select('notifications'),
            db.select('notification_reads', { student_id: studentId }),
            db.selectOne('students', { id: studentId })
        ]);
        const now = Date.now();
        const rows = all.filter(row => visible(row, profile, studentId));
        return normalize(rows, new Set(reads.map(row => row.notification_id)), now);
    }

    const client = db.supabaseClient();
    const { data: profile, error: profileError } = await client
        .from('students')
        .select('branch')
        .eq('id', studentId)
        .limit(1)
        .maybeSingle();
    if (profileError) throw profileError;

    const base = () => client
        .from('notifications')
        .select(`${NOTIFICATION_COLUMNS},audience,student_id,branches,expires_at`)
        .order('created_at', { ascending: false })
        .limit(NOTIFICATION_LIMIT);

    const queries = [
        base().eq('audience', 'all'),
        base().eq('student_id', studentId)
    ];
    if (profile?.branch) queries.push(base().eq('audience', 'branches').contains('branches', [profile.branch]));

    const results = await Promise.all(queries);
    const rows = [];
    for (const result of results) {
        if (result.error) throw result.error;
        rows.push(...(result.data || []));
    }

    const now = Date.now();
    const candidates = rows.filter(row => visible(row, profile, studentId) && (!row.expires_at || new Date(row.expires_at).getTime() > now));
    const limited = [...new Map(candidates.map(row => [row.id, row])).values()]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, NOTIFICATION_LIMIT);
    const ids = limited.map(row => row.id);
    if (!ids.length) return [];

    const { data: reads, error: readsError } = await client
        .from('notification_reads')
        .select('notification_id')
        .eq('student_id', studentId)
        .in('notification_id', ids);
    if (readsError) throw readsError;

    return limited.map(row => ({
        id: row.id,
        title: row.title,
        message: row.message,
        priority: row.priority,
        action_url: row.action_url,
        created_at: row.created_at,
        read: (reads || []).some(read => read.notification_id === row.id)
    }));
}

router.get('/notifications', async (req, res) => {
    try {
        const data = await getStudentNotifications(req.student.studentId);
        res.json({ success: true, data, unread: data.filter(row => !row.read).length });
    } catch (error) {
        console.error('Failed to load student notifications:', error.message);
        res.status(500).json({ success: false, error: 'Could not load notifications.' });
    }
});

module.exports = router;

const express = require('express');
const db = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateAdmin);

function activityCutoff(range) {
    if (!range || range === 'today') {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
        return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`).toISOString();
    }
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 0;
    return days ? new Date(Date.now() - days * 86400000).toISOString() : null;
}

function safeActivity(log) {
    return {
        id: log.id,
        student_id: log.student_id,
        prn: log.prn || '',
        student_name: log.student_name || 'Student',
        branch: log.branch || '',
        class: log.class || '',
        year: log.year || '',
        action: log.action,
        category: log.category || 'Profile',
        target_table: log.target_table,
        changed_fields: Array.isArray(log.changed_fields) ? log.changed_fields : [],
        old_values: log.old_values || {},
        new_values: log.new_values || {},
        summary: log.summary || 'Profile activity',
        created_at: log.created_at
    };
}

/**
 * @route   GET /api/admin/audit-logs/student-activity
 * @desc    Student activity feed with date, branch, class/year and student filters
 */
router.get('/student-activity', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
        const range = ['today', '7d', '30d', 'all'].includes(req.query.range) ? req.query.range : 'today';
        const branch = String(req.query.branch || '').trim();
        const year = String(req.query.year || '').trim();
        const className = String(req.query.class || '').trim();
        const student = String(req.query.student || '').trim();
        const category = String(req.query.category || '').trim();
        const cutoff = activityCutoff(range);
        let logs = [];
        let count = 0;

        if (!db.isLocal()) {
            const start = (page - 1) * pageSize;
            const end = start + pageSize - 1;
            let query = db.supabaseClient()
                .from('student_activity_log')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false });
            if (cutoff) query = query.gte('created_at', cutoff);
            if (branch && branch !== 'all') query = query.eq('branch', branch);
            if (year && year !== 'all') query = query.eq('year', year);
            if (className && className !== 'all') query = query.eq('class', className);
            if (category && category !== 'all') query = query.eq('category', category);
            if (student) {
                const escaped = student.replace(/[%_,]/g, '');
                query = query.or(`student_name.ilike.%${escaped}%,prn.ilike.%${escaped}%`);
            }
            const { data, count: totalCount, error } = await query.range(start, end);
            if (error) throw error;
            logs = data || [];
            count = totalCount || 0;
        } else {
            let all = await db.select('student_activity_log');
            if (cutoff) all = all.filter(x => new Date(x.created_at) >= new Date(cutoff));
            if (branch && branch !== 'all') all = all.filter(x => x.branch === branch);
            if (year && year !== 'all') all = all.filter(x => x.year === year);
            if (className && className !== 'all') all = all.filter(x => x.class === className);
            if (category && category !== 'all') all = all.filter(x => x.category === category);
            if (student) {
                const q = student.toLowerCase();
                all = all.filter(x => String(x.student_name || '').toLowerCase().includes(q) || String(x.prn || '').toLowerCase().includes(q));
            }
            all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            count = all.length;
            logs = all.slice((page - 1) * pageSize, page * pageSize);
        }

        const optionsSource = !db.isLocal()
            ? await db.supabaseClient().from('student_activity_log').select('branch,class,year,category,student_name,prn').order('created_at', { ascending: false }).limit(1000)
            : { data: await db.select('student_activity_log') };
        const optionRows = optionsSource.data || [];
        const uniq = key => [...new Set(optionRows.map(x => x[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
        const students = [];
        const seen = new Set();
        for (const row of optionRows) {
            const key = row.prn || row.student_name;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            students.push({ name: row.student_name || 'Student', prn: row.prn || '' });
            if (students.length >= 300) break;
        }

        return res.json({
            success: true,
            data: {
                logs: logs.map(safeActivity), count, page, pageSize, range,
                options: { branches: uniq('branch'), classes: uniq('class'), years: uniq('year'), categories: uniq('category'), students }
            }
        });
    } catch (err) {
        console.error('Student activity feed error:', err);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to load student activity.' } });
    }
});

/**
 * @route   GET /api/admin/audit-logs
 * @desc    Fetch audit log entries sorted by latest first
 */
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
        let logs = [];
        let count = 0;

        if (!db.isLocal()) {
            const start = (page - 1) * pageSize;
            const end = start + pageSize - 1;
            const { data, count: totalCount, error } = await db.supabaseClient()
                .from('audit_log')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(start, end);
            if (error) throw error;
            logs = data || [];
            count = totalCount || logs.length;
        } else {
            const allLogs = await db.select('audit_log');
            allLogs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            count = allLogs.length;
            logs = allLogs.slice((page - 1) * pageSize, page * pageSize);
        }

        return res.json({ success: true, count, page, pageSize, logs });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to load audit records.' } });
    }
});

module.exports = router;

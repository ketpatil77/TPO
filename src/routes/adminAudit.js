const express = require('express');
const db = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateAdmin);

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

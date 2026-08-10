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
        const logs = await db.select('audit_log');
        // Sort descending by created_at
        logs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return res.json({ success: true, count: logs.length, logs });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { BRANCHES } = require('../config/branches');
const { sendPortalNotification } = require('../services/incompleteProfilePush');

const router = express.Router();
router.use(authenticateAdmin);

const noticeSchema = z.object({
    title: z.string().trim().min(2, 'Title must contain at least 2 characters.').max(120),
    message: z.string().trim().min(3, 'Message must contain at least 3 characters.').max(2000),
    priority: z.enum(['normal', 'important']).default('normal'),
    expires_at: z.iso.datetime({ offset: true }).nullable().default(null),
    action_url: z.string().trim().max(500)
        .refine(value => !value || /^(\/(?!\/)|https?:\/\/)/i.test(value), 'Action URL must start with /, http://, or https://.')
        .nullable().default(null),
    branches: z.array(z.enum(BRANCHES.map(branch => branch.code)))
        .max(BRANCHES.length).default([]).transform(values => [...new Set(values)])
}).strict().superRefine((value, context) => {
    if (value.expires_at && new Date(value.expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
        context.addIssue({ code: 'custom', path: ['expires_at'], message: 'Expiry must be at least 5 minutes from now. Leave it blank for no expiry.' });
    }
});

// Save the in-app alert first. Push delivery is best-effort so a missing/invalid
// push subscription or VAPID configuration cannot make the admin alert fail.
router.post('/notifications', validate(noticeSchema), async (req, res) => {
    const notification = await db.insert('notifications', {
        ...req.body,
        action_url: req.body.action_url || null,
        student_id: null,
        audience: req.body.branches.length ? 'branches' : 'all',
        created_at: new Date().toISOString()
    });

    let delivery = { checked: 0, sent: 0, deleted: 0, failed: 0, available: false };
    try {
        delivery = { ...(await sendPortalNotification(notification)), available: true };
    } catch (error) {
        console.error('Notification push delivery unavailable:', error.message);
    }

    res.status(201).json({ success: true, data: notification, delivery });
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { deliverPushRecords, buildPortalNotificationPayload } = require('../services/incompleteProfilePush');

const router = express.Router();
const MARKER = '/dashboard?tab=ranking&source=rank-broadcast-20260902-1550';
const ACTION = 'rank_notification_push_20260902_1550';
const EXPECTED_HASH = '43b6bcb1e932f0eeae762c088cacc01ec0cf6304bd7290ad60fdf3099305cd01';
const STARTED_AT = new Date('2026-09-02T10:30:00Z');
const BATCH_SIZE = 12;

function authorized(value) {
  const hash = crypto.createHash('sha256').update(String(value || '')).digest('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(EXPECTED_HASH, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get('/deliver', async (req, res) => {
  if (!authorized(req.query.key)) return res.status(404).json({ success: false, error: 'Not found' });
  try {
    const previous = await db.select('audit_log', { action: ACTION });
    if (previous.length) return res.json({ success: true, data: { already_delivered: true, ...previous[previous.length - 1].details } });

    const [notifications, subscriptions] = await Promise.all([
      db.select('notifications', { action_url: MARKER }),
      db.select('student_push_subscriptions')
    ]);
    const notificationByStudent = new Map(notifications.filter(n => n.student_id).map(n => [n.student_id, n]));
    const pending = subscriptions
      .filter(record => notificationByStudent.has(record.student_id))
      .filter(record => !record.last_notified_at || new Date(record.last_notified_at) < STARTED_AT)
      .map(record => ({ record, notification: notificationByStudent.get(record.student_id) }));

    if (!pending.length) {
      const finalSummary = {
        notifications: notifications.length,
        subscriptions: subscriptions.length,
        delivered_or_resolved: subscriptions.filter(record => notificationByStudent.has(record.student_id)).length,
        remaining: 0
      };
      await db.insert('audit_log', {
        action: ACTION,
        target_table: 'notifications',
        target_id: 'rank-broadcast-20260902-1550',
        details: finalSummary,
        created_at: new Date().toISOString()
      });
      return res.json({ success: true, data: { complete: true, ...finalSummary } });
    }

    const batch = pending.slice(0, BATCH_SIZE);
    const results = await Promise.all(batch.map(({ record, notification }) =>
      deliverPushRecords([record], buildPortalNotificationPayload(notification))
    ));
    const batchSummary = { processed: batch.length, sent: 0, deleted: 0, failed: 0 };
    results.forEach(result => {
      batchSummary.sent += result.sent;
      batchSummary.deleted += result.deleted;
      batchSummary.failed += result.failed;
    });

    return res.json({
      success: true,
      data: {
        complete: false,
        notifications: notifications.length,
        subscriptions: subscriptions.length,
        remaining_before_batch: pending.length,
        remaining_after_batch: Math.max(0, pending.length - batch.length),
        ...batchSummary
      }
    });
  } catch (error) {
    console.error('Rank push delivery failed:', error.message);
    return res.status(500).json({ success: false, error: 'Delivery failed' });
  }
});

module.exports = router;

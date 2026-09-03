const webPush = require('web-push');
const db = require('../config/database');
const { reportRows } = require('../routes/profileCompletion');

const DEFAULT_THRESHOLD = 80;
const INVALID_SUBSCRIPTION_STATUSES = new Set([404, 410]);

function configuredThreshold(env = process.env) {
    const value = Number(env.PUSH_COMPLETION_THRESHOLD ?? DEFAULT_THRESHOLD);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : DEFAULT_THRESHOLD;
}

function buildReminderPayload(row) {
    const missing = row.missing.slice(0, 3);
    return {
        title: 'Complete your placement profile',
        body: row.completion >= 100
            ? 'Your placement profile is 100% complete. Keep your details current for upcoming opportunities.'
            : `Your profile is ${row.completion}% complete. Add: ${missing.join(', ')}.`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'profile-completion-reminder',
        data: { url: '/dashboard?tab=edit-profile', completion: row.completion, missing }
    };
}

function buildPortalNotificationPayload(notification) {
    return {
        title: notification.title,
        body: notification.message,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `portal-notification-${notification.id}`,
        data: { url: notification.action_url || '/dashboard?tab=opportunities', notificationId: notification.id }
    };
}

function normalizeBase64Url(value) {
    const trimmed = String(value || '').trim();
    const unquoted = ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) ? trimmed.slice(1, -1) : trimmed;
    const compact = unquoted.replace(/\s+/g, '').replace(/^VAPID_PRIVATE_KEY=/i, '');
    const tokens = compact.match(/[A-Za-z0-9+/_=-]{40,128}/g) || [];
    const encoded = /^[A-Za-z0-9+/_=-]+$/.test(compact) ? compact : (tokens.length === 1 ? tokens[0] : compact);
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function vapidDetails(env = process.env) {
    const details = {
        subject: String(env.VAPID_SUBJECT || 'mailto:ket.patil77@gmail.com').trim(),
        publicKey: normalizeBase64Url(env.VAPID_PUBLIC_KEY),
        privateKey: normalizeBase64Url(env.VAPID_PRIVATE_KEY)
    };
    if (!details.publicKey || !details.privateKey) throw new Error('VAPID public/private keys are not configured.');
    if (!/^[A-Za-z0-9_-]+$/.test(details.privateKey)) {
        const invalidCount = [...details.privateKey].filter(character => !/[A-Za-z0-9_-]/.test(character)).length;
        throw new Error(`VAPID private key format invalid (length ${details.privateKey.length}, invalid characters ${invalidCount}).`);
    }
    return details;
}

async function deliverPushRecords(records, payload, { sendNotification = webPush.sendNotification, env = process.env, now = new Date() } = {}) {
    const result = { checked: records.length, sent: 0, deleted: 0, failed: 0 };
    await Promise.all(records.map(async record => {
        try {
            await sendNotification(record.subscription, JSON.stringify(payload), { vapidDetails: vapidDetails(env), TTL: 86400 });
            await db.update('student_push_subscriptions', { id: record.id }, { last_notified_at: now.toISOString(), last_error: null, updated_at: now.toISOString() });
            result.sent += 1;
        } catch (error) {
            if (INVALID_SUBSCRIPTION_STATUSES.has(Number(error.statusCode))) {
                await db.delete('student_push_subscriptions', { id: record.id });
                result.deleted += 1;
            } else {
                await db.update('student_push_subscriptions', { id: record.id }, { last_error: String(error.message || error).slice(0, 500), updated_at: now.toISOString() });
                result.failed += 1;
            }
        }
    }));
    return result;
}

async function sendPortalNotification(notification, options = {}) {
    const [students, subscriptions] = await Promise.all([db.select('students'), db.select('student_push_subscriptions')]);
    const recipients = new Set(students.filter(student =>
        notification.audience === 'all' ||
        notification.student_id === student.id ||
        (notification.audience === 'branches' && (notification.branches || []).includes(student.branch))
    ).map(student => student.id));
    return deliverPushRecords(subscriptions.filter(record => recipients.has(record.student_id)), buildPortalNotificationPayload(notification), options);
}

async function createStudentNotification(data, options = {}) {
    const notification = await db.insert('notifications', { ...data, created_at: data.created_at || new Date().toISOString() });
    const delivery = await sendPortalNotification(notification, options);
    return { notification, delivery };
}

function groupByStudent(rows) {
    return (rows || []).reduce((map, row) => {
        const list = map.get(row.student_id) || [];
        list.push(row);
        map.set(row.student_id, list);
        return map;
    }, new Map());
}

function cohortKey(student) {
    return `${String(student.branch || '').toUpperCase()}|${String(student.year || '').toLowerCase()}`;
}

function buildCohortRanks(students, related, scoreStudent) {
    const cohorts = new Map();
    students.filter(student => student.status !== 'inactive').forEach(student => {
        const score = scoreStudent(student, related);
        const key = cohortKey(student);
        const list = cohorts.get(key) || [];
        list.push({ student_id: student.id, name: student.name || '', points: score.total });
        cohorts.set(key, list);
    });

    const ranks = new Map();
    for (const list of cohorts.values()) {
        list.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
        let previousPoints = null;
        let previousRank = 0;
        list.forEach((item, index) => {
            if (previousPoints === null || item.points !== previousPoints) previousRank = index + 1;
            ranks.set(item.student_id, { rank: previousRank, total: list.length, points: item.points });
            previousPoints = item.points;
        });
    }
    return ranks;
}

function incompleteProfileMessage(row, student, rankInfo) {
    const shownMissing = row.missing.slice(0, 5);
    const extra = Math.max(0, row.missing.length - shownMissing.length);
    const missingText = `${shownMissing.join(', ')}${extra ? ` +${extra} more` : ''}`;
    const cohort = [student.branch, student.year].filter(Boolean).join(' ');
    const rankText = rankInfo ? ` Current ${cohort || 'cohort'} rank: #${rankInfo.rank} of ${rankInfo.total}.` : '';
    return `Profile ${row.completion}% complete. Missing: ${missingText}.${rankText} Complete the missing items and get evidence verified; unverified evidence earns 0 Profile Points.`;
}

async function runIncompleteProfileRankBroadcast({ sendNotification = webPush.sendNotification, env = process.env, now = new Date() } = {}) {
    // Required lazily to avoid the profileRanking -> incompleteProfilePush dependency during module initialization.
    const { scoreStudent } = require('../routes/profileRanking');
    const [rows, students, subscriptions, internships, certificates, projects, research, competitions, skills] = await Promise.all([
        reportRows({}),
        db.select('students'),
        db.select('student_push_subscriptions'),
        db.select('internships'),
        db.select('certificates'),
        db.select('student_projects'),
        db.select('research_papers'),
        db.select('student_competitions'),
        db.select('student_skills')
    ]);

    const related = {
        internships: groupByStudent(internships),
        certificates: groupByStudent(certificates),
        projects: groupByStudent(projects),
        research: groupByStudent(research),
        competitions: groupByStudent(competitions),
        skills: groupByStudent(skills)
    };
    const ranks = buildCohortRanks(students, related, scoreStudent);
    const studentByPrn = new Map(students.map(student => [String(student.prn), student]));
    const subscriptionsByStudent = groupByStudent(subscriptions);
    const targets = rows.map(row => ({ row, student: studentByPrn.get(String(row.prn)) }))
        .filter(({ row, student }) => row.profile_active && row.completion < 100 && student && student.status !== 'inactive');

    const result = {
        checked: rows.length,
        incomplete: targets.length,
        notifications_created: 0,
        notification_failed: 0,
        subscriptions_checked: 0,
        push_sent: 0,
        push_deleted: 0,
        push_failed: 0
    };

    const batchSize = 10;
    for (let offset = 0; offset < targets.length; offset += batchSize) {
        const batch = targets.slice(offset, offset + batchSize);
        const outcomes = await Promise.all(batch.map(async ({ row, student }) => {
            try {
                const rankInfo = ranks.get(student.id) || null;
                const notification = await db.insert('notifications', {
                    student_id: student.id,
                    audience: 'student',
                    branches: [],
                    title: rankInfo ? `Complete your profile · Rank #${rankInfo.rank}` : 'Complete your placement profile',
                    message: incompleteProfileMessage(row, student, rankInfo),
                    priority: 'important',
                    action_url: '/dashboard?tab=edit-profile',
                    created_at: now.toISOString()
                });
                const delivery = await deliverPushRecords(
                    subscriptionsByStudent.get(student.id) || [],
                    buildPortalNotificationPayload(notification),
                    { sendNotification, env, now }
                );
                return { created: 1, delivery };
            } catch (error) {
                console.error(`Incomplete profile notification failed for ${student.prn}:`, error.message);
                return { created: 0, failed: 1, delivery: { checked: 0, sent: 0, deleted: 0, failed: 0 } };
            }
        }));
        outcomes.forEach(outcome => {
            result.notifications_created += outcome.created || 0;
            result.notification_failed += outcome.failed || 0;
            result.subscriptions_checked += outcome.delivery.checked || 0;
            result.push_sent += outcome.delivery.sent || 0;
            result.push_deleted += outcome.delivery.deleted || 0;
            result.push_failed += outcome.delivery.failed || 0;
        });
    }
    return result;
}

async function runIncompleteProfileRankBroadcastOnce({ campaignKey, sendNotification = webPush.sendNotification, env = process.env, now = new Date() } = {}) {
    const key = String(campaignKey || '').trim();
    if (!key) throw new Error('A campaign key is required for a one-time profile broadcast.');

    let job = await db.selectOne('notification_broadcasts', { campaign_key: key });
    if (job?.status === 'completed' || job?.status === 'running') {
        return { skipped: true, campaign_key: key, status: job.status, result: job.result || null };
    }

    if (job?.status === 'failed') {
        job = await db.update('notification_broadcasts', { id: job.id }, { status: 'running', result: null, completed_at: null });
    } else {
        try {
            job = await db.insert('notification_broadcasts', {
                campaign_key: key,
                status: 'running',
                created_at: now.toISOString()
            });
        } catch (error) {
            if (String(error.code || '') === '23505') {
                const existing = await db.selectOne('notification_broadcasts', { campaign_key: key });
                return { skipped: true, campaign_key: key, status: existing?.status || 'running', result: existing?.result || null };
            }
            throw error;
        }
    }

    try {
        const result = await runIncompleteProfileRankBroadcast({ sendNotification, env, now });
        await db.update('notification_broadcasts', { id: job.id }, {
            status: 'completed',
            result,
            completed_at: new Date().toISOString()
        });
        await db.logAudit('incomplete_profile_rank_broadcast', 'notifications', null, { campaign_key: key, ...result });
        return { skipped: false, campaign_key: key, status: 'completed', result };
    } catch (error) {
        await db.update('notification_broadcasts', { id: job.id }, {
            status: 'failed',
            result: { error: String(error.message || error).slice(0, 1000) },
            completed_at: new Date().toISOString()
        });
        throw error;
    }
}

async function runIncompleteProfilePushJob({ sendNotification = webPush.sendNotification, env = process.env, now = new Date() } = {}) {
    const threshold = configuredThreshold(env);
    const [rows, students, subscriptions] = await Promise.all([
        reportRows({}), db.select('students'), db.select('student_push_subscriptions')
    ]);
    const studentByPrn = new Map(students.map(student => [String(student.prn), student]));
    const rowByStudentId = new Map(rows.filter(row => row.profile_active).map(row => [studentByPrn.get(row.prn)?.id, row]));
    const result = { checked: subscriptions.length, eligible: 0, sent: 0, deleted: 0, failed: 0, threshold };

    for (const record of subscriptions) {
        const row = rowByStudentId.get(record.student_id);
        if (!row || row.completion >= threshold) continue;
        result.eligible += 1;
        try {
            await sendNotification(record.subscription, JSON.stringify(buildReminderPayload(row)), { vapidDetails: vapidDetails(env), TTL: 86400 });
            await db.update('student_push_subscriptions', { id: record.id }, { last_notified_at: now.toISOString(), last_error: null, updated_at: now.toISOString() });
            result.sent += 1;
        } catch (error) {
            if (INVALID_SUBSCRIPTION_STATUSES.has(Number(error.statusCode))) {
                await db.delete('student_push_subscriptions', { id: record.id });
                result.deleted += 1;
            } else {
                await db.update('student_push_subscriptions', { id: record.id }, { last_error: String(error.message || error).slice(0, 500), updated_at: now.toISOString() });
                result.failed += 1;
            }
        }
    }
    return result;
}

async function sendStudentProfilePush(studentId, { sendNotification = webPush.sendNotification, env = process.env, now = new Date() } = {}) {
    const [rows, student, subscriptions] = await Promise.all([
        reportRows({}), db.selectOne('students', { id: studentId }), db.select('student_push_subscriptions', { student_id: studentId })
    ]);
    if (!student) throw new Error('Student record not found.');
    const row = rows.find(candidate => candidate.prn === String(student.prn));
    if (!row) throw new Error('Profile completion record not found.');
    const result = { completion: row.completion, missing: row.missing, checked: subscriptions.length, sent: 0, deleted: 0, failed: 0 };
    for (const record of subscriptions) {
        try {
            await sendNotification(record.subscription, JSON.stringify(buildReminderPayload(row)), { vapidDetails: vapidDetails(env), TTL: 86400 });
            await db.update('student_push_subscriptions', { id: record.id }, { last_notified_at: now.toISOString(), last_error: null, updated_at: now.toISOString() });
            result.sent += 1;
        } catch (error) {
            if (INVALID_SUBSCRIPTION_STATUSES.has(Number(error.statusCode))) {
                await db.delete('student_push_subscriptions', { id: record.id });
                result.deleted += 1;
            } else {
                await db.update('student_push_subscriptions', { id: record.id }, { last_error: String(error.message || error).slice(0, 500), updated_at: now.toISOString() });
                result.failed += 1;
            }
        }
    }
    return result;
}

async function runProfileCompletionBroadcast(options = {}) {
    const [rows, students, subscriptions] = await Promise.all([reportRows({}), db.select('students'), db.select('student_push_subscriptions')]);
    const studentById = new Map(students.map(student => [student.id, student]));
    const rowByPrn = new Map(rows.map(row => [String(row.prn), row]));
    const studentIds = [...new Set(subscriptions.map(record => record.student_id))];
    const result = { students: studentIds.length, subscriptions: subscriptions.length, sent: 0, deleted: 0, failed: 0 };
    for (const studentId of studentIds) {
        const student = studentById.get(studentId);
        const row = student ? rowByPrn.get(String(student.prn)) : null;
        const delivery = await deliverPushRecords(
            subscriptions.filter(record => record.student_id === studentId),
            buildReminderPayload(row || { completion: 0, missing: ['Profile details'] }),
            options
        );
        result.sent += delivery.sent;
        result.deleted += delivery.deleted;
        result.failed += delivery.failed;
    }
    return result;
}

module.exports = {
    DEFAULT_THRESHOLD,
    configuredThreshold,
    buildReminderPayload,
    buildPortalNotificationPayload,
    normalizeBase64Url,
    vapidDetails,
    deliverPushRecords,
    sendPortalNotification,
    createStudentNotification,
    runIncompleteProfileRankBroadcast,
    runIncompleteProfileRankBroadcastOnce,
    runIncompleteProfilePushJob,
    sendStudentProfilePush,
    runProfileCompletionBroadcast
};

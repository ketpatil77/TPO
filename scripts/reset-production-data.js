const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const keepUserId = process.argv.find((arg) => arg.startsWith('--keep-user='))?.split('=')[1];
if (!process.argv.includes('--confirm') || !keepUserId) {
    console.error('Usage: node scripts/reset-production-data.js --confirm --keep-user=<auth-user-id>');
    process.exit(1);
}

const tables = [
    'notification_reads', 'drive_matches', 'drive_criteria', 'shortlists',
    'drive_applications', 'interviews', 'offers', 'assessments', 'student_skills',
    'correction_requests', 'internships', 'certificates', 'diploma', 'notifications',
    'placement_drives', 'students', 'roster', 'saved_filters', 'calendar_events',
    'login_attempts', 'audit_log', 'profiles'
];

const deleteOrder = [
    'notification_reads', 'drive_matches', 'drive_criteria', 'shortlists',
    'drive_applications', 'interviews', 'offers', 'assessments', 'student_skills',
    'correction_requests', 'internships', 'certificates', 'diploma', 'notifications',
    'placement_drives', 'students', 'roster', 'saved_filters', 'calendar_events',
    'login_attempts', 'audit_log'
];

async function allRows(client, table) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from(table).select('*').range(from, from + 999);
        if (error) throw new Error(`${table} backup failed: ${error.message}`);
        rows.push(...data);
        if (data.length < 1000) return rows;
    }
}

async function listBucketObjects(client, bucket, folder = '') {
    const paths = [];
    for (let offset = 0; ; offset += 1000) {
        const { data, error } = await client.storage.from(bucket).list(folder, { limit: 1000, offset });
        if (error) {
            if (/not found/i.test(error.message)) return paths;
            throw new Error(`${bucket} listing failed: ${error.message}`);
        }
        for (const item of data) {
            const itemPath = folder ? `${folder}/${item.name}` : item.name;
            if (item.id) paths.push(itemPath);
            else paths.push(...await listBucketObjects(client, bucket, itemPath));
        }
        if (data.length < 1000) return paths;
    }
}

async function main() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) throw new Error('Supabase environment is missing');
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: usersPage, error: usersError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const users = usersPage.users;
    const keeper = users.find((user) => user.id === keepUserId);
    if (!keeper) throw new Error('Keeper account does not exist');

    const backup = {
        created_at: new Date().toISOString(),
        keep_user_id: keepUserId,
        tables: {},
        auth_users: users.map(({ id, email, phone, created_at, updated_at, app_metadata, user_metadata }) => ({
            id, email, phone, created_at, updated_at, app_metadata, user_metadata
        })),
        storage_paths: {}
    };
    for (const table of tables) backup.tables[table] = await allRows(client, table);
    for (const bucket of ['resumes', 'profile-avatars']) {
        backup.storage_paths[bucket] = await listBucketObjects(client, bucket);
    }

    const backupDir = path.join(process.cwd(), 'data', 'production-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = backup.created_at.replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `before-launch-reset-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), { encoding: 'utf8', mode: 0o600 });

    for (const bucket of Object.keys(backup.storage_paths)) {
        const paths = backup.storage_paths[bucket];
        for (let index = 0; index < paths.length; index += 100) {
            const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + 100));
            if (error) throw new Error(`${bucket} cleanup failed: ${error.message}`);
        }
    }

    for (const table of deleteOrder) {
        const { error } = await client.from(table).delete().not('id', 'is', null);
        if (error) throw new Error(`${table} cleanup failed: ${error.message}`);
    }
    const { error: profileError } = await client.from('profiles').delete().neq('user_id', keepUserId);
    if (profileError) throw new Error(`profiles cleanup failed: ${profileError.message}`);

    for (const user of users.filter((candidate) => candidate.id !== keepUserId)) {
        const { error } = await client.auth.admin.deleteUser(user.id);
        if (error) throw new Error(`auth cleanup failed for ${user.id}: ${error.message}`);
    }

    const verification = {};
    for (const table of tables) {
        const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
        if (error) throw new Error(`${table} verification failed: ${error.message}`);
        verification[table] = count;
    }
    const { data: remaining, error: remainingError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (remainingError) throw remainingError;
    console.log(JSON.stringify({ backupPath, keeper: { id: keeper.id, email: keeper.email }, authUsers: remaining.users.length, tables: verification }, null, 2));
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});

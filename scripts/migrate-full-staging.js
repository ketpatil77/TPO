const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
}
if (!CLOUDFLARE_API_TOKEN) {
    console.error('❌ Missing CLOUDFLARE_API_TOKEN');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MIGRATION_ORDER = [
    'profiles', 'roster', 'placement_drives', 'audit_log', 'login_attempts',
    'saved_filters', 'assessments', 'calendar_events', 'import_batches', 'notification_broadcasts',
    'students', 'internships', 'certificates', 'student_projects', 'research_papers',
    'diploma', 'student_skills', 'correction_requests', 'notifications', 'interviews',
    'offers', 'dob_corrections', 'student_push_subscriptions', 'student_competitions',
    'student_profile_declarations', 'student_free_learning_progress', 'student_activity_log',
    'leaderboard_rank_state', 'leaderboard_events', 'drive_criteria', 'drive_matches',
    'shortlists', 'drive_applications', 'notification_reads', 'notification_broadcast_deliveries'
];

const JSON_FIELDS = new Set([
    'cgpa_semesterwise', 'backlogs_semesterwise', 'branches', 'required_skills',
    'preferred_skills', 'keywords', 'matched_skills', 'missing_required',
    'reasons', 'explanation', 'details', 'filter_criteria', 'changed_fields'
]);

function formatVal(v, colName) {
    if (v === null || v === undefined || Number.isNaN(v)) return 'NULL';
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    if (JSON_FIELDS.has(colName) && typeof v === 'object') {
        return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    }
    if (typeof v === 'object') {
        return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    }
    return `'${String(v).replace(/'/g, "''")}'`;
}

async function fetchAllRows(tableName) {
    let allRows = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw new Error(`Supabase query failed on table ${tableName}: ${error.message}`);
        if (data && data.length > 0) {
            allRows = allRows.concat(data);
            if (data.length < pageSize) hasMore = false;
            else page++;
        } else {
            hasMore = false;
        }
    }
    return allRows;
}

async function fetchD1Count(tableName) {
    const output = execSync(`npx wrangler d1 execute ait-tpo-staging --remote --command="SELECT count(*) as count FROM ${tableName};"`, {
        env: { ...process.env, CLOUDFLARE_API_TOKEN },
        encoding: 'utf8'
    });
    const jsonStart = output.indexOf('[');
    if (jsonStart !== -1) {
        try {
            const parsed = JSON.parse(output.slice(jsonStart));
            return parsed[0]?.results[0]?.['count(*)'] ?? parsed[0]?.results[0]?.count ?? 0;
        } catch (_) {}
    }
    return 0;
}

function execWithRetry(cmd, options = {}, retries = 8) {
    for (let i = 0; i < retries; i++) {
        try {
            return execSync(cmd, options);
        } catch (err) {
            console.warn(`  ⚠️ Command failed (attempt ${i + 1}/${retries}): ${err.message.split('\n')[0]}`);
            if (i === retries - 1) throw err;
            const delay = Math.pow(1.5, i) * 1000 + Math.random() * 500;
            execSync(`node -e "setTimeout(() => {}, ${delay})"`);
        }
    }
}

async function migrateTable(tableName) {
    console.log(`\n⏳ Fetching Supabase source rows for table [${tableName}]...`);
    const rows = await fetchAllRows(tableName);
    console.log(`📥 Supabase source row count for [${tableName}]: ${rows.length}`);

    if (rows.length === 0) {
        console.log(`⏭️ Table [${tableName}] is empty. Skipping SQL write.`);
        const d1Count = await fetchD1Count(tableName);
        return { table: tableName, supabaseCount: 0, d1Count, status: 'SUCCESS' };
    }

    const batchSize = 50;
    const totalBatches = Math.ceil(rows.length / batchSize);
    console.log(`📦 Writing ${rows.length} rows to D1 staging in ${totalBatches} batch(es)...`);

    for (let b = 0; b < totalBatches; b++) {
        const batchRows = rows.slice(b * batchSize, (b + 1) * batchSize);
        const sqlStatements = ['PRAGMA foreign_keys = OFF;'];

        for (const row of batchRows) {
            const cols = Object.keys(row);
            const vals = cols.map(c => formatVal(row[c], c));
            const colList = cols.join(', ');
            const valList = vals.join(', ');
            sqlStatements.push(`INSERT OR REPLACE INTO ${tableName} (${colList}) VALUES (${valList});`);
        }

        const tempSqlFile = path.join(__dirname, `temp_${tableName}_batch_${b}.sql`);
        fs.writeFileSync(tempSqlFile, sqlStatements.join('\n'), 'utf8');

        try {
            execWithRetry(`npx wrangler d1 execute ait-tpo-staging --file="${tempSqlFile}" --remote`, {
                env: { ...process.env, CLOUDFLARE_API_TOKEN },
                stdio: 'pipe'
            });
            console.log(`  └─ Batch ${b + 1}/${totalBatches} (${batchRows.length} rows) written.`);
        } finally {
            if (fs.existsSync(tempSqlFile)) fs.unlinkSync(tempSqlFile);
        }
    }

    const d1Count = await fetchD1Count(tableName);
    console.log(`✅ Table [${tableName}] complete: Supabase=${rows.length}, D1=${d1Count}`);
    return { table: tableName, supabaseCount: rows.length, d1Count, status: rows.length === d1Count ? 'MATCH' : 'MISMATCH' };
}

async function listAllFilesRecursively(bucketName, dir = '') {
    const { data: items, error } = await supabase.storage.from(bucketName).list(dir, { limit: 1000 });
    if (error) throw error;
    let files = [];
    for (const item of items || []) {
        if (item.name === '.emptyFolderPlaceholder') continue;
        const itemPath = dir ? `${dir}/${item.name}` : item.name;
        if (!item.id) {
            const subFiles = await listAllFilesRecursively(bucketName, itemPath);
            files = files.concat(subFiles);
        } else {
            files.push(itemPath);
        }
    }
    return files;
}

async function migrateStorage() {
    console.log('\n========================================');
    console.log('📦 Starting Storage Migration to R2');
    console.log('========================================');
    const storageReport = [];

    // Bucket 1: resumes -> ait-resume-vault
    console.log('\n📥 Inspecting Supabase [resumes] bucket...');
    try {
        const resumeFiles = await listAllFilesRecursively('resumes');
        console.log(`Found ${resumeFiles.length} files in Supabase [resumes].`);
        let copiedResumes = 0, failedResumes = 0;
        for (const fullPath of resumeFiles) {
            try {
                const { data: fileData, error: downloadErr } = await supabase.storage.from('resumes').download(fullPath);
                if (downloadErr) throw downloadErr;
                const buffer = Buffer.from(await fileData.arrayBuffer());
                const tempPath = path.join(__dirname, `temp_resume_${path.basename(fullPath)}`);
                fs.writeFileSync(tempPath, buffer);
                execSync(`npx wrangler r2 object put "ait-resume-vault/${fullPath}" --file="${tempPath}" --content-type="application/pdf"`, {
                    env: { ...process.env, CLOUDFLARE_API_TOKEN },
                    stdio: 'pipe'
                });
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                copiedResumes++;
            } catch (err) {
                console.error(`  ❌ Failed to copy resume [${fullPath}]: ${err.message}`);
                failedResumes++;
            }
        }
        storageReport.push({ bucket: 'resumes', r2Bucket: 'ait-resume-vault', sourceCount: resumeFiles.length, migratedCount: copiedResumes, failedCount: failedResumes });
    } catch (e) {
        console.error('Error listing resumes:', e.message);
        storageReport.push({ bucket: 'resumes', r2Bucket: 'ait-resume-vault', sourceCount: 0, migratedCount: 0, failedCount: 0 });
    }

    // Bucket 2: avatars -> ait-certificate-vault
    console.log('\n📥 Inspecting Supabase [avatars] bucket...');
    try {
        const avatarFiles = await listAllFilesRecursively('avatars');
        console.log(`Found ${avatarFiles.length} files in Supabase [avatars].`);
        let copiedAvatars = 0, failedAvatars = 0;
        for (const fullPath of avatarFiles) {
            try {
                const { data: fileData, error: downloadErr } = await supabase.storage.from('avatars').download(fullPath);
                if (downloadErr) throw downloadErr;
                const buffer = Buffer.from(await fileData.arrayBuffer());
                const tempPath = path.join(__dirname, `temp_avatar_${path.basename(fullPath)}`);
                fs.writeFileSync(tempPath, buffer);
                execSync(`npx wrangler r2 object put "ait-certificate-vault/${fullPath}" --file="${tempPath}" --content-type="image/jpeg"`, {
                    env: { ...process.env, CLOUDFLARE_API_TOKEN },
                    stdio: 'pipe'
                });
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                copiedAvatars++;
            } catch (err) {
                console.error(`  ❌ Failed to copy avatar [${fullPath}]: ${err.message}`);
                failedAvatars++;
            }
        }
        storageReport.push({ bucket: 'avatars', r2Bucket: 'ait-certificate-vault', sourceCount: avatarFiles.length, migratedCount: copiedAvatars, failedCount: failedAvatars });
    } catch (e) {
        console.error('Error listing avatars:', e.message);
        storageReport.push({ bucket: 'avatars', r2Bucket: 'ait-certificate-vault', sourceCount: 0, migratedCount: 0, failedCount: 0 });
    }

    // Bucket 3: certificate-evidence -> ait-certificate-vault
    console.log('\n📥 Inspecting Supabase [certificate-evidence] bucket...');
    try {
        const certFiles = await listAllFilesRecursively('certificate-evidence');
        console.log(`Found ${certFiles.length} files in Supabase [certificate-evidence].`);
        let copiedCerts = 0, failedCerts = 0;
        for (const fullPath of certFiles) {
            try {
                const { data: fileData, error: downloadErr } = await supabase.storage.from('certificate-evidence').download(fullPath);
                if (downloadErr) throw downloadErr;
                const buffer = Buffer.from(await fileData.arrayBuffer());
                const tempPath = path.join(__dirname, `temp_cert_${path.basename(fullPath)}`);
                fs.writeFileSync(tempPath, buffer);
                execSync(`npx wrangler r2 object put "ait-certificate-vault/${fullPath}" --file="${tempPath}" --content-type="image/jpeg"`, {
                    env: { ...process.env, CLOUDFLARE_API_TOKEN },
                    stdio: 'pipe'
                });
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                copiedCerts++;
            } catch (err) {
                console.error(`  ❌ Failed to copy cert evidence [${fullPath}]: ${err.message}`);
                failedCerts++;
            }
        }
        storageReport.push({ bucket: 'certificate-evidence', r2Bucket: 'ait-certificate-vault', sourceCount: certFiles.length, migratedCount: copiedCerts, failedCount: failedCerts });
    } catch (e) {
        console.error('Error listing cert evidence:', e.message);
        storageReport.push({ bucket: 'certificate-evidence', r2Bucket: 'ait-certificate-vault', sourceCount: 0, migratedCount: 0, failedCount: 0 });
    }

    return storageReport;
}

async function run() {
    console.log('🚀 Starting Phase 5: Full Migration to Staging (33 Tables + R2 Storage)...');
    console.log('\n🛠️ Ensuring D1 staging database schema is freshly applied...');
    execSync('npx wrangler d1 execute ait-tpo-staging --file=./schema.d1.sql --remote', {
        env: { ...process.env, CLOUDFLARE_API_TOKEN },
        stdio: 'inherit'
    });

    const dbReport = [];
    for (const table of MIGRATION_ORDER) {
        const result = await migrateTable(table);
        dbReport.push(result);
    }

    const storageReport = await migrateStorage();

    console.log('\n========================================');
    console.log('📊 MIGRATION DELIVERABLE REPORT SUMMARY');
    console.log('========================================');
    console.table(dbReport);
    console.log('\n📦 STORAGE REPORT SUMMARY:');
    console.table(storageReport);

    fs.writeFileSync(path.join(__dirname, 'phase5-migration-report.json'), JSON.stringify({ dbReport, storageReport }, null, 2));
    console.log('\n💾 Full report saved to scripts/phase5-migration-report.json');
}

run().catch(err => {
    console.error('\n❌ Phase 5 Migration Script Failed:', err);
    process.exit(1);
});
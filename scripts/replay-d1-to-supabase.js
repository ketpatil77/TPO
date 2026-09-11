const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function replayLogs(options = {}) {
    const isExecute = options.execute || process.argv.includes('--execute');
    console.log(`🚀 Starting D1 Cutover Replay to Supabase (${isExecute ? 'EXECUTE MODE' : 'DRY-RUN MODE'})...`);

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_KEY env vars.');
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Query d1_cutover_replay_log from D1
    let logs = [];
    if (options.testLogs) {
        logs = options.testLogs;
    } else {
        const cmd = 'npx wrangler d1 execute ait-tpo-production --command="SELECT * FROM d1_cutover_replay_log ORDER BY created_at ASC" --json --remote';
        const out = execSync(cmd, { env: { ...process.env, CLOUDFLARE_API_TOKEN }, encoding: 'utf8' });
        const parsed = JSON.parse(out);
        logs = parsed[0]?.results || [];
    }

    console.log(`📥 Total replay log entries found: ${logs.length}`);
    let applied = 0, skipped = 0, failed = 0;

    for (const entry of logs) {
        const { target_table, operation, pk_value, payload: rawPayload, created_at } = entry;
        let payload = {};
        try { payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload; } catch (_) { payload = {}; }

        console.log(`\nProcessing log #${entry.id || 'N/A'}: [${operation}] on table [${target_table}] (PK: ${pk_value})`);

        if (!isExecute) {
            console.log(`  [DRY-RUN] Would execute ${operation} on ${target_table} with payload:`, payload);
            applied++;
            continue;
        }

        // Idempotency check for INSERT/UPDATE
        if (operation === 'INSERT' || operation === 'UPDATE') {
            const pkCol = payload.id ? 'id' : (payload.student_id ? 'student_id' : 'id');
            const { data: existing } = await supabase.from(target_table).select('*').eq(pkCol, pk_value).single();

            if (existing && operation === 'INSERT') {
                console.log(`  ⏭️ Row [${pk_value}] already exists in Supabase table [${target_table}]. Skipping INSERT.`);
                skipped++;
                continue;
            }

            const { error } = await supabase.from(target_table).upsert(payload);
            if (error) {
                console.error(`  ❌ Failed to replay ${operation} on ${target_table}: ${error.message}`);
                failed++;
            } else {
                console.log(`  ✅ Replayed ${operation} on ${target_table} successfully.`);
                applied++;
            }
        } else if (operation === 'DELETE') {
            const pkCol = payload.id ? 'id' : (payload.student_id ? 'student_id' : 'id');
            const { error } = await supabase.from(target_table).delete().eq(pkCol, pk_value);
            if (error) {
                console.error(`  ❌ Failed to replay DELETE on ${target_table}: ${error.message}`);
                failed++;
            } else {
                console.log(`  ✅ Replayed DELETE on ${target_table} successfully.`);
                applied++;
            }
        }
    }

    const summary = { total: logs.length, applied, skipped, failed, mode: isExecute ? 'EXECUTE' : 'DRY-RUN' };
    console.log('\n========================================');
    console.log('📊 REPLAY SUMMARY');
    console.log('========================================');
    console.table(summary);
    return summary;
}

if (require.main === module) {
    replayLogs().catch(err => {
        console.error('❌ Replay script error:', err);
        process.exit(1);
    });
}

module.exports = { replayLogs };

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function formatVal(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return 'NULL';
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    return `'${String(v).replace(/'/g, "''")}'`;
}

async function run() {
    console.log('🚀 Starting Phase 4: Small-Subset Migration Test (diploma table)...');

    let supabaseRows = [];
    if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.trim() !== '') {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data, error } = await supabase.from('diploma').select('*');
        if (error) throw error;
        supabaseRows = data || [];
    } else {
        const dbPath = path.join(process.cwd(), 'data/db.json');
        if (fs.existsSync(dbPath)) {
            const localData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            supabaseRows = localData.diploma || [];
        }
    }

    console.log(`📥 Read ${supabaseRows.length} rows from Supabase/Source diploma table.`);

    // Drop and recreate diploma table to update schema in staging
    execSync(`npx wrangler d1 execute ait-tpo-staging --command="DROP TABLE IF EXISTS diploma; CREATE TABLE diploma (id TEXT PRIMARY KEY, student_id TEXT UNIQUE NOT NULL, institute TEXT, branch TEXT NOT NULL, year_of_passing INTEGER NOT NULL, percentage_or_cgpa TEXT);" --remote`, {
        env: { ...process.env, CLOUDFLARE_API_TOKEN },
        stdio: 'inherit'
    });

    // Generate batch SQL import script
    const sqlStatements = [
        'PRAGMA foreign_keys = OFF;',
        ...supabaseRows.map(row => {
            const id = formatVal(row.id);
            const student_id = formatVal(row.student_id);
            const institute = formatVal(row.institute || '');
            const branch = formatVal(row.branch || 'General');
            const year_of_passing = formatVal(Number(row.year_of_passing) || 2024);
            const percentage_or_cgpa = formatVal(row.percentage_or_cgpa || '');

            return `INSERT INTO diploma (id, student_id, institute, branch, year_of_passing, percentage_or_cgpa) VALUES (${id}, ${student_id}, ${institute}, ${branch}, ${year_of_passing}, ${percentage_or_cgpa});`;
        })
    ];

    const sqlFilePath = path.join(__dirname, 'diploma-import.sql');
    fs.writeFileSync(sqlFilePath, sqlStatements.join('\n'), 'utf8');

    console.log(`📤 Executing bulk batch import of ${supabaseRows.length} rows to D1 staging...`);
    execSync(`npx wrangler d1 execute ait-tpo-staging --file=./scripts/diploma-import.sql --remote`, {
        env: { ...process.env, CLOUDFLARE_API_TOKEN },
        stdio: 'inherit'
    });

    console.log('✅ Migration of diploma table complete!');
}

run().catch(err => {
    console.error('❌ Migration script failed:', err);
    process.exit(1);
});

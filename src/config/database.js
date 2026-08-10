const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let supabase = null;
let useLocalDb = false;
let localData = {
    roster: [],
    students: [],
    internships: [],
    certificates: [],
    diploma: [],
    audit_log: []
    ,profiles: []
    ,login_attempts: []
    ,student_skills: []
    ,placement_drives: []
    ,drive_criteria: []
    ,drive_matches: []
    ,shortlists: []
};

const dataDir = path.join(process.cwd(), 'data');
const dataFilePath = process.env.DATA_FILE || path.join(dataDir, process.env.NODE_ENV === 'test' ? 'db.test.json' : 'db.json');

if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.trim() !== '' && SUPABASE_KEY.trim() !== '') {
    console.log('🔗 Connecting to Supabase Postgres instance...');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.log('ℹ️ SUPABASE_URL/KEY not set. Initializing zero-dependency local persistent database...');
    useLocalDb = true;

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(dataFilePath)) {
        try {
            const raw = fs.readFileSync(dataFilePath, 'utf8');
            localData = JSON.parse(raw);
        } catch (e) {
            console.error('Error loading db.json, re-initializing:', e.message);
        }
    }

    // Ensure all tables exist
    ['roster', 'students', 'internships', 'certificates', 'diploma', 'audit_log', 'profiles', 'login_attempts', 'student_skills', 'placement_drives', 'drive_criteria', 'drive_matches', 'shortlists'].forEach(table => {
        if (!localData[table]) localData[table] = [];
    });

    // Seed default sample roster entries if roster is empty
    if (localData.roster.length === 0) {
        localData.roster = [
            { id: crypto.randomUUID(), prn: '24053651251515', name: 'Rahul Sharma', dob: '2003-07-31', branch: 'Computer Engineering', class: 'BE-A', year: 'Final Year' },
            { id: crypto.randomUUID(), prn: '24053651251516', name: 'Priya Patel', dob: '2004-01-15', branch: 'Information Technology', class: 'BE-B', year: 'Final Year' },
            { id: crypto.randomUUID(), prn: '24053651251517', name: 'Aman Verma', dob: '2003-11-22', branch: 'Electronics & Telecom', class: 'BE-A', year: 'Final Year' }
        ];
        saveLocalData();
    }
}

function saveLocalData() {
    if (useLocalDb) {
        fs.writeFileSync(dataFilePath, JSON.stringify(localData, null, 2), 'utf8');
    }
}

/**
 * Unified Database Interface (Supabase Postgres + Pure JS Fallback)
 */
const db = {
    isLocal: () => useLocalDb,
    supabaseClient: () => supabase,

    // Select query
    async select(table, filter = {}) {
        if (!useLocalDb) {
            let query = supabase.from(table).select('*');
            Object.keys(filter).forEach(key => {
                query = query.eq(key, filter[key]);
            });
            const { data, error } = await query;
            if (error) throw error;
            return data;
        } else {
            const list = localData[table] || [];
            return list.filter(row => {
                return Object.keys(filter).every(key => row[key] === filter[key]);
            });
        }
    },

    // Select single record
    async selectOne(table, filter) {
        const rows = await this.select(table, filter);
        return rows.length > 0 ? rows[0] : null;
    },

    // Insert record
    async insert(table, data) {
        const id = data.id || crypto.randomUUID();
        const record = { ...data, id };

        if (!useLocalDb) {
            const { data: inserted, error } = await supabase.from(table).insert([record]).select();
            if (error) throw error;
            return inserted[0];
        } else {
            if (!localData[table]) localData[table] = [];
            localData[table].push(record);
            saveLocalData();
            return record;
        }
    },

    // Audit log helper
    async logAudit(action, targetTable, targetId = null, details = null) {
        try {
            const logEntry = {
                action,
                target_table: targetTable,
                target_id: targetId,
                details: details || {},
                created_at: new Date().toISOString()
            };
            return await this.insert('audit_log', logEntry);
        } catch (err) {
            console.error('Failed to record audit log:', err.message);
        }
    },

    // Upsert record
    async upsert(table, data, onConflictKey = 'id') {
        if (!useLocalDb) {
            const { data: upserted, error } = await supabase.from(table).upsert([data], { onConflict: onConflictKey }).select();
            if (error) throw error;
            return upserted[0];
        } else {
            const existing = await this.selectOne(table, { [onConflictKey]: data[onConflictKey] });
            if (existing) {
                return await this.update(table, { [onConflictKey]: data[onConflictKey] }, data);
            } else {
                return await this.insert(table, data);
            }
        }
    },

    // Update record
    async update(table, filter, data) {
        if (!useLocalDb) {
            let query = supabase.from(table).update(data);
            Object.keys(filter).forEach(k => {
                query = query.eq(k, filter[k]);
            });
            const { data: updated, error } = await query.select();
            if (error) throw error;
            return updated[0];
        } else {
            const list = localData[table] || [];
            let updatedRecord = null;

            for (let i = 0; i < list.length; i++) {
                const row = list[i];
                const matches = Object.keys(filter).every(k => row[k] === filter[k]);
                if (matches) {
                    list[i] = { ...row, ...data };
                    updatedRecord = list[i];
                }
            }

            saveLocalData();
            return updatedRecord;
        }
    },

    // Delete record
    async delete(table, filter) {
        if (!useLocalDb) {
            let query = supabase.from(table).delete();
            Object.keys(filter).forEach(k => {
                query = query.eq(k, filter[k]);
            });
            const { error } = await query;
            if (error) throw error;
            return true;
        } else {
            const list = localData[table] || [];
            
            if (table === 'students' && filter.id) {
                localData.internships = (localData.internships || []).filter(i => i.student_id !== filter.id);
                localData.certificates = (localData.certificates || []).filter(c => c.student_id !== filter.id);
                localData.diploma = (localData.diploma || []).filter(d => d.student_id !== filter.id);
            }

            localData[table] = list.filter(row => {
                return !Object.keys(filter).every(k => row[k] === filter[k]);
            });

            saveLocalData();
            return true;
        }
    }
};

module.exports = db;

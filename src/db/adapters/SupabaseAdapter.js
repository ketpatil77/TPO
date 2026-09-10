const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class SupabaseAdapter {
    constructor() {
        this.SUPABASE_URL = process.env.SUPABASE_URL;
        this.SUPABASE_KEY = process.env.SUPABASE_KEY;
        this.supabase = null;
        this.useLocalDb = false;
        this.localData = {
            roster: [], students: [], internships: [], certificates: [], student_projects: [], research_papers: [], diploma: [], audit_log: [],
            profiles: [], login_attempts: [], student_skills: [], placement_drives: [], drive_criteria: [], drive_matches: [], shortlists: [],
            correction_requests: [], drive_applications: [], notifications: [], saved_filters: [], assessments: [], interviews: [], offers: [],
            calendar_events: [], notification_reads: [], import_batches: [], launch_backups: [], dob_corrections: [], student_push_subscriptions: []
        };

        const dataDir = path.join(process.cwd(), 'data');
        this.dataFilePath = process.env.DATA_FILE || path.join(dataDir, process.env.NODE_ENV === 'test' ? 'db.test.json' : 'db.json');
        this.init();
    }

    init() {
        this.SUPABASE_URL = process.env.SUPABASE_URL || this.SUPABASE_URL;
        this.SUPABASE_KEY = process.env.SUPABASE_KEY || this.SUPABASE_KEY;

        const forceLocalTestDatabase = process.env.NODE_ENV === 'test';
        if (!forceLocalTestDatabase && this.SUPABASE_URL && this.SUPABASE_KEY && this.SUPABASE_URL.trim() !== '' && this.SUPABASE_KEY.trim() !== '') {
            this.supabase = createClient(this.SUPABASE_URL, this.SUPABASE_KEY);
            this.useLocalDb = false;
        } else {
            this.useLocalDb = true;
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            if (fs.existsSync(this.dataFilePath)) {
                try { this.localData = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf8')); }
                catch (e) { console.error('Error loading db.json, re-initializing:', e.message); }
            }
            ['roster','students','internships','certificates','student_projects','research_papers','diploma','audit_log','profiles','login_attempts','student_skills','placement_drives','drive_criteria','drive_matches','shortlists','correction_requests','drive_applications','notifications','saved_filters','assessments','interviews','offers','calendar_events','notification_reads','import_batches','launch_backups','student_push_subscriptions'].forEach(table => {
                if (!this.localData[table]) this.localData[table] = [];
            });
            if (this.localData.roster.length === 0) {
                this.localData.roster = [
                    { id: crypto.randomUUID(), prn: '24053651251515', name: 'Rahul Sharma', dob: '2003-07-31', branch: 'CT', class: 'BE-A', year: 'Final Year' },
                    { id: crypto.randomUUID(), prn: '24053651251516', name: 'Priya Patel', dob: '2004-01-15', branch: 'AIML', class: 'BE-B', year: 'Final Year' },
                    { id: crypto.randomUUID(), prn: '24053651251517', name: 'Aman Verma', dob: '2003-11-22', branch: 'EE', class: 'BE-A', year: 'Final Year' }
                ];
                this.saveLocalData();
            }
        }
    }

    saveLocalData() {
        if (this.useLocalDb) fs.writeFileSync(this.dataFilePath, JSON.stringify(this.localData, null, 2), 'utf8');
    }

    isLocal() { return this.useLocalDb; }
    supabaseClient() { return this.supabase; }
    authClient() {
        if (this.useLocalDb || !this.SUPABASE_URL || !this.SUPABASE_KEY) return null;
        return createClient(this.SUPABASE_URL, this.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    }

    async select(table, filter = {}) {
        if (!this.useLocalDb) {
            let query = this.supabase.from(table).select('*');
            Object.keys(filter).forEach(key => { query = query.eq(key, filter[key]); });
            const { data, error } = await query;
            if (error) throw error;
            return data;
        }
        const list = this.localData[table] || [];
        return list.filter(row => Object.keys(filter).every(key => row[key] === filter[key]));
    }

    async selectOne(table, filter = {}) {
        if (!this.useLocalDb) {
            let query = this.supabase.from(table).select('*').limit(1);
            Object.keys(filter).forEach(key => { query = query.eq(key, filter[key]); });
            const { data, error } = await query;
            if (error) throw error;
            return data?.[0] || null;
        }
        const list = this.localData[table] || [];
        return list.find(row => Object.keys(filter).every(key => row[key] === filter[key])) || null;
    }

    async insert(table, data) {
        const id = data.id || crypto.randomUUID();
        const record = { ...data, id };
        if (!this.useLocalDb) {
            const { data: inserted, error } = await this.supabase.from(table).insert([record]).select();
            if (error) throw error;
            return inserted[0];
        }
        if (!this.localData[table]) this.localData[table] = [];
        this.localData[table].push(record);
        this.saveLocalData();
        return record;
    }

    async update(table, filter, data) {
        if (!this.useLocalDb) {
            let query = this.supabase.from(table).update(data);
            Object.keys(filter).forEach(k => { query = query.eq(k, filter[k]); });
            const { data: updated, error } = await query.select();
            if (error) throw error;
            return updated[0];
        }
        const list = this.localData[table] || [];
        let updatedRecord = null;
        for (let i = 0; i < list.length; i++) {
            const row = list[i];
            if (Object.keys(filter).every(k => row[k] === filter[k])) {
                list[i] = { ...row, ...data };
                updatedRecord = list[i];
            }
        }
        this.saveLocalData();
        return updatedRecord;
    }

    async delete(table, filter) {
        if (!this.useLocalDb) {
            let query = this.supabase.from(table).delete();
            Object.keys(filter).forEach(k => { query = query.eq(k, filter[k]); });
            const { error } = await query;
            if (error) throw error;
            return true;
        }
        const list = this.localData[table] || [];
        if (table === 'students' && filter.id) {
            this.localData.internships = (this.localData.internships || []).filter(i => i.student_id !== filter.id);
            this.localData.certificates = (this.localData.certificates || []).filter(c => c.student_id !== filter.id);
            this.localData.student_projects = (this.localData.student_projects || []).filter(project => project.student_id !== filter.id);
            this.localData.research_papers = (this.localData.research_papers || []).filter(paper => paper.student_id !== filter.id);
            this.localData.diploma = (this.localData.diploma || []).filter(d => d.student_id !== filter.id);
            this.localData.student_push_subscriptions = (this.localData.student_push_subscriptions || []).filter(s => s.student_id !== filter.id);
        }
        if (table === 'placement_drives' && filter.id) {
            const driveId = filter.id;
            ['drive_criteria','drive_matches','shortlists','drive_applications','assessments','interviews','offers'].forEach(child => {
                this.localData[child] = (this.localData[child] || []).filter(row => row.drive_id !== driveId);
            });
        }
        if (table === 'notifications' && filter.id) this.localData.notification_reads = (this.localData.notification_reads || []).filter(row => row.notification_id !== filter.id);
        this.localData[table] = list.filter(row => !Object.keys(filter).every(k => row[k] === filter[k]));
        this.saveLocalData();
        return true;
    }

    async deleteMany(table, key, values) {
        const uniqueValues = [...new Set((values || []).filter(value => value !== null && value !== undefined))];
        if (!uniqueValues.length) return true;
        if (!this.useLocalDb) {
            for (let offset = 0; offset < uniqueValues.length; offset += 500) {
                const { error } = await this.supabase.from(table).delete().in(key, uniqueValues.slice(offset, offset + 500));
                if (error) throw error;
            }
            return true;
        }
        const valueSet = new Set(uniqueValues.map(String));
        this.localData[table] = (this.localData[table] || []).filter(row => !valueSet.has(String(row[key])));
        this.saveLocalData();
        return true;
    }

    async deleteAll(table) {
        if (!this.useLocalDb) {
            const { error } = await this.supabase.from(table).delete().not('id', 'is', null);
            if (error) throw error;
            return true;
        }
        this.localData[table] = [];
        this.saveLocalData();
        return true;
    }

    async upsert(table, data, onConflictKey = 'id') {
        if (!this.useLocalDb) {
            const { data: upserted, error } = await this.supabase.from(table).upsert([data], { onConflict: onConflictKey }).select();
            if (error) throw error;
            return upserted[0];
        }
        const existing = await this.selectOne(table, { [onConflictKey]: data[onConflictKey] });
        return existing ? this.update(table, { [onConflictKey]: data[onConflictKey] }, data) : this.insert(table, data);
    }

    async upsertMany(table, rows, onConflictKey = 'id') {
        if (!Array.isArray(rows) || rows.length === 0) return [];
        if (!this.useLocalDb) {
            const { data: upserted, error } = await this.supabase.from(table).upsert(rows, { onConflict: onConflictKey }).select();
            if (error) throw error;
            return upserted || [];
        }
        if (!this.localData[table]) this.localData[table] = [];
        const index = new Map(this.localData[table].map((row, position) => [row[onConflictKey], position]));
        const saved = rows.map(data => {
            const key = data[onConflictKey];
            const position = index.get(key);
            if (position !== undefined) {
                this.localData[table][position] = { ...this.localData[table][position], ...data };
                return this.localData[table][position];
            }
            const record = { ...data, id: data.id || crypto.randomUUID() };
            index.set(key, this.localData[table].length);
            this.localData[table].push(record);
            return record;
        });
        this.saveLocalData();
        return saved;
    }

    async replaceStudentSkills(studentId, skills) {
        if (!this.useLocalDb) {
            const { data, error } = await this.supabase.rpc('replace_student_skills', { target_student_id: studentId, new_skills: skills });
            if (error) throw error;
            return data || [];
        }
        this.localData.student_skills = (this.localData.student_skills || []).filter(row => row.student_id !== studentId);
        const saved = skills.map(skill => ({ id: crypto.randomUUID(), student_id: studentId, skill }));
        this.localData.student_skills.push(...saved);
        this.saveLocalData();
        return saved;
    }

    async logAudit(action, targetTable, targetId = null, details = null) {
        try {
            return await this.insert('audit_log', { action, target_table: targetTable, target_id: targetId, details: details || {}, created_at: new Date().toISOString() });
        } catch (err) {
            console.error('Failed to record audit log:', err.message);
        }
    }

    // Storage Interface Methods
    async uploadFile(bucket, objectPath, buffer, contentType) {
        if (this.useLocalDb) return { path: objectPath };
        const { error } = await this.supabase.storage.from(bucket).upload(objectPath, buffer, { contentType, upsert: true });
        if (error) throw error;
        return { path: objectPath };
    }

    async getFileUrl(bucket, objectPath, expiresSeconds = 300) {
        if (this.useLocalDb) return { url: null };
        const { data, error } = await this.supabase.storage.from(bucket).createSignedUrl(objectPath, expiresSeconds);
        if (error) throw error;
        return { url: data.signedUrl, expires_in: expiresSeconds };
    }

    async deleteFile(bucket, objectPath) {
        if (this.useLocalDb) return true;
        await this.supabase.storage.from(bucket).remove([objectPath]);
        return true;
    }

    async getFileStream(bucket, objectPath) {
        if (this.useLocalDb) return null;
        const { data, error } = await this.supabase.storage.from(bucket).download(objectPath);
        if (error || !data) return null;
        return { buffer: Buffer.from(await data.arrayBuffer()), type: data.type };
    }
}

module.exports = SupabaseAdapter;

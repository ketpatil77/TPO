const crypto = require('crypto');

const JSON_FIELDS = new Set([
    'cgpa_semesterwise', 'backlogs_semesterwise', 'branches', 'required_skills',
    'preferred_skills', 'keywords', 'matched_skills', 'missing_required',
    'reasons', 'explanation', 'details', 'filter_criteria', 'changed_fields'
]);

class D1R2Adapter {
    constructor() {
        this.db = globalThis.cloudflareEnv?.DB || null;
    }

    getDB() {
        return globalThis.cloudflareEnv?.DB || this.db;
    }

    getVault(bucket) {
        const env = globalThis.cloudflareEnv || {};
        if (bucket === 'resumes') return env.RESUME_VAULT || env.CERTIFICATE_VAULT || null;
        return env.CERTIFICATE_VAULT || env.RESUME_VAULT || null;
    }

    serializeRow(row) {
        if (!row) return row;
        const out = {};
        for (const [key, val] of Object.entries(row)) {
            if (val === undefined) continue;
            if (JSON_FIELDS.has(key) && val !== null && typeof val === 'object') {
                out[key] = JSON.stringify(val);
            } else {
                out[key] = val;
            }
        }
        return out;
    }

    deserializeRow(row) {
        if (!row) return row;
        const out = { ...row };
        for (const key of Object.keys(out)) {
            if (JSON_FIELDS.has(key) && typeof out[key] === 'string') {
                try { out[key] = JSON.parse(out[key]); } catch (_) {}
            }
        }
        return out;
    }

    isLocal() { return false; }
    supabaseClient() { return null; }
    authClient() { return null; }

    async select(table, filter = {}) {
        if (table === 'launch_backups') return [];
        const db = this.getDB();
        if (!db) return [];
        const keys = Object.keys(filter);
        let sql = `SELECT * FROM ${table}`;
        const params = [];
        if (keys.length > 0) {
            sql += ` WHERE ` + keys.map(k => `${k} = ?`).join(' AND ');
            keys.forEach(k => params.push(filter[k]));
        }
        const { results } = await db.prepare(sql).bind(...params).all();
        return (results || []).map(r => this.deserializeRow(r));
    }

    async selectOne(table, filter = {}) {
        if (table === 'launch_backups') return null;
        const db = this.getDB();
        if (!db) return null;
        const keys = Object.keys(filter);
        let sql = `SELECT * FROM ${table}`;
        const params = [];
        if (keys.length > 0) {
            sql += ` WHERE ` + keys.map(k => `${k} = ?`).join(' AND ');
            keys.forEach(k => params.push(filter[k]));
        }
        sql += ` LIMIT 1`;
        const result = await db.prepare(sql).bind(...params).first();
        return result ? this.deserializeRow(result) : null;
    }

    async logCutoverWrite(table, operation, pkValue, payload) {
        if (process.env.CUTOVER_LOGGING !== 'true' || table === 'd1_cutover_replay_log' || table === 'launch_backups') return;
        try {
            const db = this.getDB();
            if (!db) return;
            const logRecord = {
                id: crypto.randomUUID(),
                target_table: table,
                operation,
                pk_value: String(pkValue || ''),
                payload: JSON.stringify(payload || {}),
                created_at: new Date().toISOString()
            };
            const keys = Object.keys(logRecord);
            const placeholders = keys.map(() => '?').join(', ');
            const sql = `INSERT INTO d1_cutover_replay_log (${keys.join(', ')}) VALUES (${placeholders})`;
            await db.prepare(sql).bind(...keys.map(k => logRecord[k])).run();
        } catch (err) {
            console.error('Failed to log cutover write replay entry:', err.message);
        }
    }

    async insert(table, data) {
        if (table === 'launch_backups') return data;
        const db = this.getDB();
        const id = data.id || crypto.randomUUID();
        const record = this.serializeRow({ ...data, id });
        const keys = Object.keys(record);
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const params = keys.map(k => record[k]);
        if (db) await db.prepare(sql).bind(...params).run();
        await this.logCutoverWrite(table, 'INSERT', id, record);
        return this.deserializeRow(record);
    }

    async update(table, filter, data) {
        if (table === 'launch_backups') return data;
        const db = this.getDB();
        const record = this.serializeRow(data);
        const dataKeys = Object.keys(record);
        const filterKeys = Object.keys(filter);
        if (!dataKeys.length || !filterKeys.length) return null;

        const setClause = dataKeys.map(k => `${k} = ?`).join(', ');
        const whereClause = filterKeys.map(k => `${k} = ?`).join(' AND ');
        const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
        const params = [...dataKeys.map(k => record[k]), ...filterKeys.map(k => filter[k])];
        if (db) await db.prepare(sql).bind(...params).run();
        const pkVal = filter.id || filter.student_id || Object.values(filter)[0];
        await this.logCutoverWrite(table, 'UPDATE', pkVal, record);
        return this.selectOne(table, filter);
    }

    async delete(table, filter) {
        if (table === 'launch_backups') return true;
        const db = this.getDB();
        const filterKeys = Object.keys(filter);
        if (!filterKeys.length) return true;
        const whereClause = filterKeys.map(k => `${k} = ?`).join(' AND ');
        const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
        const params = filterKeys.map(k => filter[k]);
        if (db) await db.prepare(sql).bind(...params).run();
        const pkVal = filter.id || filter.student_id || Object.values(filter)[0];
        await this.logCutoverWrite(table, 'DELETE', pkVal, filter);
        return true;
    }

    async deleteMany(table, key, values) {
        if (table === 'launch_backups') return true;
        const uniqueValues = [...new Set((values || []).filter(v => v !== null && v !== undefined))];
        if (!uniqueValues.length) return true;
        const db = this.getDB();
        if (!db) return true;
        for (let offset = 0; offset < uniqueValues.length; offset += 100) {
            const chunk = uniqueValues.slice(offset, offset + 100);
            const placeholders = chunk.map(() => '?').join(', ');
            const sql = `DELETE FROM ${table} WHERE ${key} IN (${placeholders})`;
            await db.prepare(sql).bind(...chunk).run();
        }
        return true;
    }

    async deleteAll(table) {
        if (table === 'launch_backups') return true;
        const db = this.getDB();
        if (db) await db.prepare(`DELETE FROM ${table}`).run();
        return true;
    }

    async upsert(table, data, onConflictKey = 'id') {
        if (table === 'launch_backups') return data;
        const db = this.getDB();
        if (db) {
            const id = data.id || (onConflictKey === 'id' ? crypto.randomUUID() : undefined);
            const record = this.serializeRow(id ? { ...data, id } : { ...data });
            const keys = Object.keys(record);
            const placeholders = keys.map(() => '?').join(', ');
            const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
            const params = keys.map(k => record[k]);
            await db.prepare(sql).bind(...params).run();
            const pkVal = record.id || record[onConflictKey] || Object.values(record)[0];
            await this.logCutoverWrite(table, 'UPSERT', pkVal, record);
            return this.deserializeRow(record);
        }
        const existing = await this.selectOne(table, { [onConflictKey]: data[onConflictKey] });
        return existing ? this.update(table, { [onConflictKey]: data[onConflictKey] }, data) : this.insert(table, data);
    }

    async upsertMany(table, rows, onConflictKey = 'id') {
        if (table === 'launch_backups' || !Array.isArray(rows) || rows.length === 0) return [];
        const saved = [];
        for (const row of rows) {
            const result = await this.upsert(table, row, onConflictKey);
            if (result) saved.push(result);
        }
        return saved;
    }

    async replaceStudentSkills(studentId, skills) {
        await this.delete('student_skills', { student_id: studentId });
        const saved = [];
        for (const skill of skills) {
            const inserted = await this.insert('student_skills', { id: crypto.randomUUID(), student_id: studentId, skill_name: skill });
            saved.push(inserted);
        }
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
        const vault = this.getVault(bucket);
        if (vault) {
            await vault.put(objectPath, buffer, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } });
        }
        return { path: objectPath };
    }

    async getFileUrl(bucket, objectPath, expiresSeconds = 3600) {
        const vault = this.getVault(bucket);
        if (!vault) return { url: null };
        const downloadRoute = bucket === 'resumes' ? '/api/student/resume/download' : `/api/student/evidence/${encodeURIComponent(objectPath)}`;
        return { url: downloadRoute, expires_in: expiresSeconds };
    }

    async deleteFile(bucket, objectPath) {
        const vault = this.getVault(bucket);
        if (vault && objectPath) {
            await vault.delete(objectPath).catch(() => {});
        }
        return true;
    }

    async getFileStream(bucket, objectPath) {
        const vault = this.getVault(bucket);
        if (!vault || !objectPath) return null;
        const object = await vault.get(objectPath);
        if (!object) return null;
        const arrayBuf = await object.arrayBuffer();
        return { buffer: Buffer.from(arrayBuf), type: object.httpMetadata?.contentType || 'application/octet-stream' };
    }
}

module.exports = D1R2Adapter;

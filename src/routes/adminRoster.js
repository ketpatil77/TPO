const express = require('express');
const multer = require('multer');
const db = require('../config/database');
const { normalizeStudentDob } = require('../utils/dateHelper');
const { authenticateAdmin } = require('../middleware/auth');
const { normalizeBranch, BRANCHES } = require('../config/branches');
const { normalizeYear, YEARS } = require('../config/years');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const crypto = require('crypto');
const adminStudentsRouter = require('./adminStudents');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_IMPORT_ROWS = 10000;
const PRN_PATTERN = /^\d{10,20}$/;
const CLASS_PATTERN = /^[A-Za-z0-9 -]{1,20}$/;

router.use(authenticateAdmin);
router.post('/register', require('../services/studentRegistration').registerStudent);

function normalizeRosterValues(values, rowNumber) {
    const [rawPrn, rawName, rawDob, rawBranch, rawClass, rawYear] = Array.isArray(values) ? values : [];
    const prn = String(rawPrn || '').trim();
    const name = String(rawName || '').trim().replace(/\s+/g, ' ');
    const dobText = String(rawDob || '').trim();
    const branchText = String(rawBranch || '').trim();
    const className = String(rawClass || '').trim().replace(/\s+/g, ' ');
    const yearText = String(rawYear || '').trim();
    const formattedDob = normalizeStudentDob(dobText);
    const branch = normalizeBranch(branchText);
    const year = normalizeYear(yearText);
    const errors = [];

    if (!prn || !name || !dobText || !branchText || !className || !yearText) {
        errors.push('PRN, name, DOB, branch, class, and year are required');
    }
    if (prn && !PRN_PATTERN.test(prn)) errors.push('PRN must contain exactly 10–20 digits');
    if (name && (name.length < 2 || name.length > 150)) errors.push('Name must contain 2–150 characters');
    if (dobText && !formattedDob) errors.push('Invalid DOB');
    if (formattedDob && new Date(formattedDob) >= new Date()) errors.push('DOB must be in the past');
    if (branchText && !branch) errors.push(`Invalid branch. Use ${BRANCHES.map(item => item.code).join(', ')}`);
    if (className && !CLASS_PATTERN.test(className)) errors.push('Class must contain 1–20 letters, numbers, spaces, or hyphens');
    if (yearText && !year) errors.push(`Invalid year. Use ${YEARS.join(', ')}`);

    return {
        row: rowNumber,
        errors,
        record: errors.length ? null : { prn, name, dob: formattedDob, branch, class: className, year },
        display: { prn, name, dob: formattedDob || dobText, branch: branch || branchText, class: className, year: year || yearText }
    };
}

async function clearStudentCache() {
    if (adminStudentsRouter.clearStudentCache) await adminStudentsRouter.clearStudentCache();
}

// GET /api/admin/roster — returns roster count for dashboard stat card
router.get('/', async (_req, res) => {
    try {
        const roster = await db.select('roster');
        return res.json({ success: true, count: roster.length });
    } catch (err) {
        console.error('Roster count error:', err);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to load roster count.' } });
    }
});

router.post('/preview', upload.single('file'), async (req, res) => {
    let dataRows;
    try { dataRows = await parseUploadedRows(req); }
    catch (error) { return res.status(error.status || 400).json({ success: false, error: error.status ? error.message : 'Unable to read roster file.' }); }
    if (!dataRows.length) return res.status(400).json({ success: false, error: 'No roster rows provided.' });
    if (dataRows.length > MAX_IMPORT_ROWS) return res.status(413).json({ success: false, error: `Maximum ${MAX_IMPORT_ROWS.toLocaleString()} rows per import.` });

    const existing = new Set((await db.select('roster')).map(row => String(row.prn)));
    const filePrns = new Set();
    const rows = dataRows.map((values, index) => {
        const normalized = normalizeRosterValues(values, index + 2);
        const prn = normalized.display.prn;
        if (prn && filePrns.has(prn)) normalized.errors.push('Duplicate PRN in this upload');
        if (prn) filePrns.add(prn);
        return {
            row: normalized.row,
            ...normalized.display,
            action: existing.has(prn) ? 'update' : 'add',
            valid: normalized.errors.length === 0,
            errors: normalized.errors
        };
    });

    return res.json({ success: true, data: { rows, summary: {
        total: rows.length,
        valid: rows.filter(row => row.valid).length,
        invalid: rows.filter(row => !row.valid).length,
        adds: rows.filter(row => row.valid && row.action === 'add').length,
        updates: rows.filter(row => row.valid && row.action === 'update').length
    } } });
});

/**
 * @route   POST /api/admin/roster/upload
 * @desc    Bulk CSV/XLSX upload with validation, rollback, and authoritative assignment sync
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const dataLines = await parseUploadedRows(req);
        if (!dataLines.length) return res.status(400).json({ success: false, error: 'Roster file is empty.' });
        if (dataLines.length > MAX_IMPORT_ROWS) return res.status(413).json({ success: false, error: `Maximum ${MAX_IMPORT_ROWS.toLocaleString()} rows per import.` });

        let addedCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        let databaseWriteFailed = false;
        let rollbackFailed = false;
        const errors = [];
        const existingRows = await db.select('roster');
        const existingStudents = await db.select('students');
        const existingByPrn = new Map(existingRows.map(row => [String(row.prn), row]));
        const existingStudentByPrn = new Map(existingStudents.map(row => [String(row.prn), row]));
        const existingPrns = new Set(existingRows.map(row => String(row.prn)));
        const filePrns = new Set();
        const validRecords = [];
        const insertedPrns = [];
        const previousRows = [];
        const previousStudentRows = [];
        const studentAssignmentUpdates = [];

        for (let i = 0; i < dataLines.length; i++) {
            const normalized = normalizeRosterValues(dataLines[i], i + 2);
            const cleanPrn = normalized.display.prn;

            if (cleanPrn && filePrns.has(cleanPrn)) normalized.errors.push('Duplicate PRN in this upload');
            if (cleanPrn) filePrns.add(cleanPrn);

            if (normalized.errors.length || !normalized.record) {
                errors.push(`Row ${normalized.row}${cleanPrn ? ` (PRN ${cleanPrn})` : ''}: ${normalized.errors.join('; ')}`);
                failedCount++;
                continue;
            }

            const record = normalized.record;
            validRecords.push(record);
            if (existingPrns.has(record.prn)) {
                updatedCount++;
                const previous = existingByPrn.get(record.prn);
                if (previous) previousRows.push(previous);
            } else {
                addedCount++;
                insertedPrns.push(record.prn);
            }
            existingPrns.add(record.prn);

            const currentStudent = existingStudentByPrn.get(record.prn);
            if (currentStudent && (
                currentStudent.branch !== record.branch ||
                currentStudent.class !== record.class ||
                currentStudent.year !== record.year
            )) {
                previousStudentRows.push(currentStudent);
                studentAssignmentUpdates.push({
                    ...currentStudent,
                    branch: record.branch,
                    class: record.class,
                    year: record.year
                });
            }
        }

        try {
            for (let offset = 0; offset < validRecords.length; offset += 250) {
                await db.upsertMany('roster', validRecords.slice(offset, offset + 250), 'prn');
            }
            for (let offset = 0; offset < studentAssignmentUpdates.length; offset += 250) {
                await db.upsertMany('students', studentAssignmentUpdates.slice(offset, offset + 250), 'id');
            }
            await clearStudentCache();
        } catch (err) {
            databaseWriteFailed = true;
            errors.push('Database write failed. Automatic rollback was attempted; no partial import should remain.');
            console.error('Bulk roster database write failed:', err);
            try {
                await db.deleteMany('roster', 'prn', insertedPrns);
                for (let offset = 0; offset < previousRows.length; offset += 250) {
                    await db.upsertMany('roster', previousRows.slice(offset, offset + 250), 'prn');
                }
                for (let offset = 0; offset < previousStudentRows.length; offset += 250) {
                    await db.upsertMany('students', previousStudentRows.slice(offset, offset + 250), 'id');
                }
                await clearStudentCache();
            } catch (rollbackError) {
                rollbackFailed = true;
                errors.push('Automatic rollback could not be fully confirmed. Review the latest import immediately.');
                console.error('Bulk roster rollback failed:', rollbackError);
            }
            failedCount += validRecords.length;
            addedCount = 0;
            updatedCount = 0;
        }

        const batchStatus = databaseWriteFailed ? (rollbackFailed ? 'rollback_required' : 'failed') : 'completed';
        const batch = await db.insert('import_batches', {
            id: crypto.randomUUID(),
            created_by: req.admin.adminId,
            file_name: req.file?.originalname || 'pasted-roster.csv',
            status: batchStatus,
            total_count: dataLines.length,
            added_count: addedCount,
            updated_count: updatedCount,
            failed_count: failedCount,
            inserted_prns: databaseWriteFailed ? [] : insertedPrns,
            previous_rows: databaseWriteFailed ? [] : previousRows,
            previous_student_rows: databaseWriteFailed ? [] : previousStudentRows,
            errors,
            created_at: new Date().toISOString()
        });

        await db.logAudit('roster_upload', 'roster', null, {
            batchId: batch.id,
            status: batchStatus,
            addedCount,
            updatedCount,
            failedCount,
            assignmentUpdates: databaseWriteFailed ? 0 : studentAssignmentUpdates.length,
            totalProcessed: dataLines.length,
            errorsCount: errors.length
        });

        const summary = { addedCount, updatedCount, failedCount, totalProcessed: dataLines.length, errors, batchId: batch.id };
        if (databaseWriteFailed) {
            return res.status(500).json({
                success: false,
                error: rollbackFailed
                    ? 'Roster import failed and rollback could not be fully confirmed. Review the import history before retrying.'
                    : 'Roster import failed. The attempted changes were rolled back.',
                summary
            });
        }

        return res.json({
            success: true,
            message: `Roster processed: ${addedCount} added, ${updatedCount} updated, ${failedCount} failed.`,
            summary
        });

    } catch (err) {
        console.error('Error during roster upload:', err);
        return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : { code: 'INTERNAL_ERROR', message: 'Unable to process roster upload.' } });
    }
});

router.get('/imports', async (_req, res) => {
    const rows = (await db.select('import_batches')).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50);
    res.json({ success: true, data: rows.map(({ inserted_prns, previous_rows, previous_student_rows, ...row }) => row) });
});

router.get('/imports/:id/errors.csv', async (req, res) => {
    const batch = await db.selectOne('import_batches', { id: req.params.id });
    if (!batch) return res.status(404).json({ success: false, error: 'Import batch not found.' });
    const csv = ['error', ...(batch.errors || [])].map(value => `"${String(value).replace(/"/g, '""')}"`).join('\r\n');
    res.type('text/csv').setHeader('Content-Disposition', `attachment; filename="roster-errors-${batch.id}.csv"`); res.send(csv);
});

router.post('/imports/:id/undo', async (req, res) => {
    const batch = await db.selectOne('import_batches', { id: req.params.id });
    if (!batch || batch.status !== 'completed') return res.status(409).json({ success: false, error: 'Import cannot be undone.' });

    const insertedPrns = batch.inserted_prns || [];
    if (insertedPrns.length) {
        const insertedSet = new Set(insertedPrns.map(String));
        const activeProfiles = (await db.select('students')).filter(student => insertedSet.has(String(student.prn)));
        if (activeProfiles.length) {
            return res.status(409).json({
                success: false,
                error: `Undo blocked because ${activeProfiles.length} newly added student profile${activeProfiles.length === 1 ? ' is' : 's are'} now active. Remove or migrate those profiles safely before undoing the roster import.`
            });
        }
    }

    await db.deleteMany('roster', 'prn', insertedPrns);
    for (let offset = 0; offset < (batch.previous_rows || []).length; offset += 250) {
        await db.upsertMany('roster', batch.previous_rows.slice(offset, offset + 250), 'prn');
    }
    for (let offset = 0; offset < (batch.previous_student_rows || []).length; offset += 250) {
        await db.upsertMany('students', batch.previous_student_rows.slice(offset, offset + 250), 'id');
    }
    await db.update('import_batches', { id: batch.id }, { status: 'undone', undone_at: new Date().toISOString() });
    await db.logAudit('roster_import_undo', 'import_batches', batch.id, {
        removed: insertedPrns.length,
        restored: (batch.previous_rows || []).length,
        restoredStudentAssignments: (batch.previous_student_rows || []).length
    });
    await clearStudentCache();
    res.json({ success: true, message: 'Import undone.', removed: insertedPrns.length, restored: (batch.previous_rows || []).length });
});

function parseCsvLine(text) {
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*)/g;
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        let val = match[1];
        if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1).replace(/""/g, '"');
        }
        matches.push(val.trim());
    }
    return matches;
}

function cellText(cell) {
    const value = cell?.value;
    if (value instanceof Date) return `${String(value.getDate()).padStart(2, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${value.getFullYear()}`;
    if (value && typeof value === 'object') {
        if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
        if (value.text !== undefined) return String(value.text);
        if (value.result !== undefined) return String(value.result);
    }
    return value == null ? '' : String(value);
}

async function parseUploadedRows(req) {
    if (!req.file) {
        const text = String(req.body.csvContent || '').replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const rows = lines.map(parseCsvLine);
        return /prn|name/i.test(rows[0]?.join(',') || '') ? rows.slice(1) : rows;
    }
    const extension = require('path').extname(req.file.originalname || '').toLowerCase();
    if (extension === '.csv') {
        const lines = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const rows = lines.map(parseCsvLine);
        return /prn|name/i.test(rows[0]?.join(',') || '') ? rows.slice(1) : rows;
    }
    if (extension !== '.xlsx') throw Object.assign(new Error('Upload a .xlsx or .csv roster file.'), { status: 400 });
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) return [];
        const rows = [];
        sheet.eachRow({ includeEmpty: false }, row => {
            const prnValue = row.getCell(1).value;
            if (typeof prnValue === 'number' && Math.abs(prnValue) >= 1e15) {
                throw Object.assign(new Error(`Row ${row.number}: Excel may have rounded this PRN. Format the PRN cell as Text and re-enter the original digits before uploading.`), { status: 400 });
            }
            rows.push(Array.from({ length: 6 }, (_, index) => cellText(row.getCell(index + 1)).trim()));
        });
        return /prn|name/i.test(rows[0]?.join(',') || '') ? rows.slice(1) : rows;
    } catch (error) {
        if (error.status) throw error;
        return parseNamespacedXlsx(req.file.buffer);
    }
}

function decodeXml(value) {
    return String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

async function parseNamespacedXlsx(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    if (!sheetFile) throw Object.assign(new Error('Excel workbook has no readable first sheet.'), { status: 400 });
    const sharedFile = zip.file('xl/sharedStrings.xml');
    const sharedXml = sharedFile ? await sharedFile.async('string') : '';
    const shared = [...sharedXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/gi)].map(match =>
        decodeXml([...match[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi)].map(item => item[1]).join(''))
    );
    const sheetXml = await sheetFile.async('string');
    const rows = [];
    for (const rowMatch of sheetXml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/gi)) {
        const values = Array(6).fill('');
        for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/gi)) {
            const reference = cellMatch[1].match(/\br="([A-Z]+)\d+"/i)?.[1]?.toUpperCase();
            const column = reference ? reference.charCodeAt(0) - 65 : -1;
            if (column < 0 || column >= values.length) continue;
            const type = cellMatch[1].match(/\bt="([^"]+)"/i)?.[1];
            const raw = cellMatch[2].match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/i)?.[1]
                ?? cellMatch[2].match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/i)?.[1] ?? '';
            if (column === 0 && (!type || type === 'n') && Math.abs(Number(raw)) >= 1e15) {
                throw Object.assign(new Error('Excel may have rounded a PRN. Format PRN cells as Text and re-enter the original digits.'), { status: 400 });
            }
            values[column] = type === 's' ? String(shared[Number(raw)] ?? '') : decodeXml(raw);
        }
        if (values.some(Boolean)) rows.push(values.map(value => value.trim()));
    }
    return /prn|name/i.test(rows[0]?.join(',') || '') ? rows.slice(1) : rows;
}

/**
 * @route   POST /api/admin/roster/reset-dob
 * @desc    Reset a student's DOB by PRN
 * @access  Admin
 */
router.post('/reset-dob', authenticateAdmin, async (req, res) => {
    try {
        const { prn, dob } = req.body;
        if (!prn || !dob) return res.status(400).json({ success: false, error: { message: 'PRN and DOB are required.' } });

        const cleanPrn = String(prn).trim();
        const cleanDob = String(dob).trim();
        if (!PRN_PATTERN.test(cleanPrn)) return res.status(400).json({ success: false, error: { message: 'PRN must contain 10–20 digits.' } });

        const rosterEntry = await db.selectOne('roster', { prn: cleanPrn });
        if (!rosterEntry) return res.status(404).json({ success: false, error: { message: 'Student with this PRN not found in roster.' } });

        const isoDate = normalizeStudentDob(cleanDob);
        if (!isoDate || new Date(isoDate) >= new Date()) return res.status(400).json({ success: false, error: { message: 'Invalid DOB. Enter a valid past date.' } });

        await db.update('roster', { prn: cleanPrn }, { dob: isoDate });
        await db.logAudit('student_dob_reset', 'roster', rosterEntry.id, { prn: cleanPrn, oldDob: rosterEntry.dob, newDob: isoDate });
        await clearStudentCache();
        res.json({ success: true, message: 'DOB updated successfully.' });
    } catch (err) {
        console.error('DOB Reset Error:', err);
        res.status(500).json({ success: false, error: { message: 'Server error resetting DOB.' } });
    }
});

router.get('/dob-corrections', authenticateAdmin, async (req, res) => {
    try {
        const rows = await db.select('dob_corrections');
        res.json({ success: true, data: rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to fetch DOB corrections.' });
    }
});

router.post('/dob-corrections/:id/approve', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const correction = await db.selectOne('dob_corrections', { id });
        if (!correction) return res.status(404).json({ success: false, error: 'Request not found.' });
        if (correction.status !== 'pending') return res.status(400).json({ success: false, error: 'Request already processed.' });

        const formattedDob = normalizeStudentDob(correction.submitted_dob);
        if (!formattedDob || new Date(formattedDob) >= new Date()) return res.status(400).json({ success: false, error: 'Correction contains an invalid DOB.' });

        const rosterEntry = await db.selectOne('roster', { prn: correction.prn });
        if (rosterEntry) await db.update('roster', { prn: correction.prn }, { dob: formattedDob });

        await db.update('dob_corrections', { id }, {
            status: 'approved',
            processed_at: new Date().toISOString(),
            processed_by: req.admin.adminId
        });

        await db.logAudit('dob_correction_approve', 'dob_corrections', id, {
            prn: correction.prn,
            newDob: formattedDob,
            processedBy: req.admin.adminId
        });

        await clearStudentCache();
        res.json({ success: true, message: 'DOB correction request approved and updated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to approve request.' });
    }
});

router.post('/dob-corrections/:id/reject', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const correction = await db.selectOne('dob_corrections', { id });
        if (!correction) return res.status(404).json({ success: false, error: 'Request not found.' });
        if (correction.status !== 'pending') return res.status(400).json({ success: false, error: 'Request already processed.' });

        await db.update('dob_corrections', { id }, {
            status: 'rejected',
            processed_at: new Date().toISOString(),
            processed_by: req.admin.adminId
        });

        await db.logAudit('dob_correction_reject', 'dob_corrections', id, {
            prn: correction.prn,
            processedBy: req.admin.adminId
        });

        res.json({ success: true, message: 'DOB correction request rejected.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to reject request.' });
    }
});

module.exports = router;

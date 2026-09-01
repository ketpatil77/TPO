const express = require('express');
const multer = require('multer');
const db = require('../config/database');
const { normalizeStudentDob } = require('../utils/dateHelper');
const { authenticateAdmin } = require('../middleware/auth');
const { normalizeBranch, BRANCHES } = require('../config/branches');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const crypto = require('crypto');
const adminStudentsRouter = require('./adminStudents');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_IMPORT_ROWS = 10000;

router.use(authenticateAdmin);
router.post('/register', require('../services/studentRegistration').registerStudent);

// GET /api/admin/roster — returns roster count for dashboard stat card
router.get('/', async (_req, res) => {
    try {
        const roster = await db.select('roster');
        return res.json({ success: true, count: roster.length });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/preview', upload.single('file'), async (req, res) => {
    let dataRows;
    try { dataRows = await parseUploadedRows(req); }
    catch (error) { return res.status(error.status || 400).json({ success: false, error: error.status ? error.message : 'Unable to read roster file.' }); }
    if (!dataRows.length) return res.status(400).json({ success: false, error: 'No roster rows provided.' });
    const existing = new Set((await db.select('roster')).map(row => row.prn));
    if (dataRows.length > MAX_IMPORT_ROWS) return res.status(413).json({ success: false, error: `Maximum ${MAX_IMPORT_ROWS.toLocaleString()} rows per import.` });
    const rows = dataRows.map((values, index) => {
        const [prn, name, dob, branch, className, year] = values;
        const errors = [];
        const formattedDob = normalizeStudentDob(dob);
        const normalizedBranch = normalizeBranch(branch);
        if (!prn || !name || !dob) errors.push('PRN, name, and DOB required');
        if (dob && !formattedDob) errors.push('Invalid DOB');
        if (!normalizedBranch) errors.push('Invalid branch');
        return { row: index + 2, prn, name, dob: formattedDob || dob, branch: normalizedBranch || branch, class: className, year, action: existing.has(String(prn || '').trim()) ? 'update' : 'add', valid: errors.length === 0, errors };
    });
    res.json({ success: true, data: { rows, summary: { total: rows.length, valid: rows.filter(row => row.valid).length, invalid: rows.filter(row => !row.valid).length, adds: rows.filter(row => row.valid && row.action === 'add').length, updates: rows.filter(row => row.valid && row.action === 'update').length } } });
});

/**
 * @route   POST /api/admin/roster/upload
 * @desc    Bulk CSV upload & upsert into roster table
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const dataLines = await parseUploadedRows(req);
        if (!dataLines.length) return res.status(400).json({ success: false, error: 'Roster file is empty.' });
        if (dataLines.length > MAX_IMPORT_ROWS) return res.status(413).json({ success: false, error: `Maximum ${MAX_IMPORT_ROWS.toLocaleString()} rows per import.` });

        let addedCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        const errors = [];
        const existingRows = await db.select('roster');
        const existingByPrn = new Map(existingRows.map(row => [String(row.prn), row]));
        const existingPrns = new Set(existingRows.map(row => String(row.prn)));
        const validRecords = [];
        const insertedPrns = [];
        const previousRows = [];

        for (let i = 0; i < dataLines.length; i++) {
            const parts = dataLines[i];

            if (parts.length < 3) {
                errors.push(`Row ${i + 1}: Insufficient columns (expected prn, name, dob, branch, class, year)`);
                failedCount++;
                continue;
            }

            const [prn, name, dob, branch, className, year] = parts;

            if (!prn || !name || !dob) {
                errors.push(`Row ${i + 1}: Missing PRN, Name, or DOB`);
                failedCount++;
                continue;
            }

            const cleanPrn = String(prn).trim();
            const cleanName = String(name).trim();
            const formattedDob = normalizeStudentDob(dob);

            if (!formattedDob) {
                errors.push(`Row ${i + 2} (PRN ${cleanPrn}): Invalid DOB format "${dob}". Use DD-MM-YYYY, DDMMYY, or YYYY-MM-DD.`);
                failedCount++;
                continue;
            }

            const normalizedBranch = normalizeBranch(branch);
            if (!normalizedBranch) {
                errors.push(`Row ${i + 2} (PRN ${cleanPrn}): Invalid branch. Use ${BRANCHES.map(item => item.code).join(', ')}.`);
                failedCount++;
                continue;
            }
            const record = {
                prn: cleanPrn,
                name: cleanName,
                dob: formattedDob,
                branch: normalizedBranch,
                class: className ? className.trim() : 'BE',
                year: year ? year.trim() : 'Final Year'
            };

            validRecords.push(record);
            if (existingPrns.has(cleanPrn)) {
                updatedCount++;
                const previous = existingByPrn.get(cleanPrn);
                if (previous && !previousRows.some(row => String(row.prn) === cleanPrn)) previousRows.push(previous);
            } else {
                addedCount++;
                insertedPrns.push(cleanPrn);
            }
            existingPrns.add(cleanPrn);
        }

        try {
            for (let offset = 0; offset < validRecords.length; offset += 250) {
                await db.upsertMany('roster', validRecords.slice(offset, offset + 250), 'prn');
            }
            if (adminStudentsRouter.clearStudentCache) adminStudentsRouter.clearStudentCache();
        } catch (err) {
            errors.push(`Bulk database write failed: ${err.message}`);
            failedCount += validRecords.length;
            addedCount = 0;
            updatedCount = 0;
        }

        const batch = await db.insert('import_batches', {
            id: crypto.randomUUID(), created_by: req.admin.adminId, file_name: req.file?.originalname || 'pasted-roster.csv', status: 'completed',
            total_count: dataLines.length, added_count: addedCount, updated_count: updatedCount, failed_count: failedCount,
            inserted_prns: insertedPrns, previous_rows: previousRows, errors, created_at: new Date().toISOString()
        });

        await db.logAudit('roster_upload', 'roster', null, {
            batchId: batch.id,
            addedCount,
            updatedCount,
            failedCount,
            totalProcessed: dataLines.length,
            errorsCount: errors.length
        });

        return res.json({
            success: true,
            message: `Roster processed: ${addedCount} added, ${updatedCount} updated, ${failedCount} failed.`,
            summary: {
                addedCount,
                updatedCount,
                failedCount,
                totalProcessed: dataLines.length,
                errors,
                batchId: batch.id
            }
        });

    } catch (err) {
        console.error('Error during CSV Roster upload:', err);
        return res.status(err.status || 500).json({ success: false, error: err.status ? err.message : { code: 'INTERNAL_ERROR', message: 'Unable to process roster upload.' } });
    }
});

router.get('/imports', async (_req, res) => {
    const rows = (await db.select('import_batches')).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50);
    res.json({ success: true, data: rows.map(({ inserted_prns, previous_rows, ...row }) => row) });
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
    await db.deleteMany('roster', 'prn', batch.inserted_prns || []);
    for (let offset = 0; offset < (batch.previous_rows || []).length; offset += 250) await db.upsertMany('roster', batch.previous_rows.slice(offset, offset + 250), 'prn');
    await db.update('import_batches', { id: batch.id }, { status: 'undone', undone_at: new Date().toISOString() });
    await db.logAudit('roster_import_undo', 'import_batches', batch.id, { removed: (batch.inserted_prns || []).length, restored: (batch.previous_rows || []).length });
    if (adminStudentsRouter.clearStudentCache) adminStudentsRouter.clearStudentCache();
    res.json({ success: true, message: 'Import undone.', removed: (batch.inserted_prns || []).length, restored: (batch.previous_rows || []).length });
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
            if (column === 0 && (!type || type === 'n') && Math.abs(Number(raw)) >= 1e15) throw Object.assign(new Error('Excel may have rounded a PRN. Format PRN cells as Text and re-enter the original digits.'), { status: 400 });
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
        
        const cleanPrn = prn.trim();
        const cleanDob = dob.trim();
        
        const rosterEntry = await db.selectOne('roster', { prn: cleanPrn });
        if (!rosterEntry) return res.status(404).json({ success: false, error: { message: 'Student with this PRN not found in roster.' } });
        
        const isoDate = normalizeStudentDob(cleanDob);
        if (!isoDate) return res.status(400).json({ success: false, error: { message: 'Invalid DOB format. Please use DD-MM-YYYY or similar.' } });
        
        await db.update('roster', { prn: cleanPrn }, { dob: isoDate });
        
        await db.logAudit('student_dob_reset', 'roster', rosterEntry.id, {
            prn: cleanPrn,
            oldDob: rosterEntry.dob,
            newDob: isoDate
        });
        
        if (adminStudentsRouter.clearStudentCache) adminStudentsRouter.clearStudentCache();
        
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
        if (!formattedDob) return res.status(400).json({ success: false, error: 'Correction contains an invalid DOB.' });

        const rosterEntry = await db.selectOne('roster', { prn: correction.prn });
        if (rosterEntry) {
            await db.update('roster', { prn: correction.prn }, { dob: formattedDob });
        }

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

        if (adminStudentsRouter.clearStudentCache) {
            await adminStudentsRouter.clearStudentCache();
        }

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

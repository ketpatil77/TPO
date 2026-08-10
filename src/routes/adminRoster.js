const express = require('express');
const multer = require('multer');
const db = require('../config/database');
const { parseDDMMYY, formatDateToYYYYMMDD } = require('../utils/dateHelper');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticateAdmin);

/**
 * @route   POST /api/admin/roster/upload
 * @desc    Bulk CSV upload & upsert into roster table
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        let csvRawText = '';

        if (req.file) {
            csvRawText = req.file.buffer.toString('utf8');
        } else if (req.body.csvContent) {
            csvRawText = req.body.csvContent;
        } else {
            return res.status(400).json({ success: false, error: 'No CSV file or csvContent provided.' });
        }

        const lines = csvRawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
            return res.status(400).json({ success: false, error: 'CSV content is empty.' });
        }

        // Header detection
        const headerLine = lines[0].toLowerCase();
        const hasHeader = headerLine.includes('prn') || headerLine.includes('name');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        let addedCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        const errors = [];

        for (let i = 0; i < dataLines.length; i++) {
            const line = dataLines[i];
            const parts = parseCsvLine(line);

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

            const cleanPrn = prn.trim();
            const cleanName = name.trim();
            let formattedDob = formatDateToYYYYMMDD(dob.trim());
            if (!formattedDob) {
                formattedDob = parseDDMMYY(dob.trim());
            }

            if (!formattedDob) {
                errors.push(`Row ${i + 1} (PRN ${cleanPrn}): Invalid DOB format "${dob}". Must be DDMMYY or YYYY-MM-DD.`);
                failedCount++;
                continue;
            }

            // Check existing PRN to record added vs updated
            const existing = await db.selectOne('roster', { prn: cleanPrn });

            const record = {
                prn: cleanPrn,
                name: cleanName,
                dob: formattedDob,
                branch: branch ? branch.trim() : 'General',
                class: className ? className.trim() : 'BE',
                year: year ? year.trim() : 'Final Year'
            };

            try {
                await db.upsert('roster', record, 'prn');
                if (existing) {
                    updatedCount++;
                } else {
                    addedCount++;
                }
            } catch (err) {
                errors.push(`Row ${i + 1} (PRN ${cleanPrn}): Database insert error - ${err.message}`);
                failedCount++;
            }
        }

        // Log to Audit Log
        await db.logAudit('roster_upload', 'roster', null, {
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
                errors
            }
        });

    } catch (err) {
        console.error('Error during CSV Roster upload:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
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

module.exports = router;

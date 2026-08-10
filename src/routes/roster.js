const express = require('express');
const multer = require('multer');
const db = require('../config/database');
const { parseDDMMYY, formatDateToYYYYMMDD } = require('../utils/dateHelper');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @route   POST /api/roster/bulk
 * @desc    Bulk insert / preload roster records (JSON array or CSV)
 * @access  Admin / System
 */
router.post('/bulk', async (req, res) => {
    try {
        const { records } = req.body;

        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a non-empty "records" array of roster items.'
            });
        }

        let insertedCount = 0;
        let skippedCount = 0;
        const errors = [];

        for (const item of records) {
            if (!item.prn || !item.name || !item.dob) {
                errors.push(`Row missing PRN, Name, or DOB: ${JSON.stringify(item)}`);
                skippedCount++;
                continue;
            }

            // Standardize DOB format YYYY-MM-DD
            let formattedDob = formatDateToYYYYMMDD(item.dob);
            if (!formattedDob) {
                formattedDob = parseDDMMYY(item.dob);
            }

            if (!formattedDob) {
                errors.push(`Invalid DOB format for PRN ${item.prn}: ${item.dob}`);
                skippedCount++;
                continue;
            }

            const record = {
                prn: String(item.prn).trim(),
                name: String(item.name).trim(),
                dob: formattedDob,
                branch: item.branch ? String(item.branch).trim() : 'General',
                class: item.class ? String(item.class).trim() : 'BE',
                year: item.year ? String(item.year).trim() : 'Final Year'
            };

            try {
                await db.upsert('roster', record, 'prn');
                insertedCount++;
            } catch (err) {
                errors.push(`Error inserting PRN ${item.prn}: ${err.message}`);
                skippedCount++;
            }
        }

        return res.json({
            success: true,
            message: `Roster bulk import finished. ${insertedCount} inserted/updated, ${skippedCount} skipped.`,
            insertedCount,
            skippedCount,
            errors
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/roster
 * @desc    Get current roster entries
 */
router.get('/', async (req, res) => {
    try {
        const roster = await db.select('roster');
        return res.json({ success: true, count: roster.length, roster });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

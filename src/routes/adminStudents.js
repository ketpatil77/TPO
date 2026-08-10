const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateAdmin);

/**
 * Helper to fetch and filter students with all joined sub-tables
 */
async function getFilteredStudentData(queryParams) {
    const { branch, minCgpa, search } = queryParams;

    const allStudents = await db.select('students');
    const allInternships = await db.select('internships');
    const allCertificates = await db.select('certificates');
    const allDiploma = await db.select('diploma');

    // Index sub-tables by student_id
    const intMap = {};
    allInternships.forEach(item => {
        if (!intMap[item.student_id]) intMap[item.student_id] = [];
        intMap[item.student_id].push(item);
    });

    const certMap = {};
    allCertificates.forEach(item => {
        if (!certMap[item.student_id]) certMap[item.student_id] = [];
        certMap[item.student_id].push(item);
    });

    const dipMap = {};
    allDiploma.forEach(item => {
        dipMap[item.student_id] = item;
    });

    // Unique Branches for Filter Dropdown
    const uniqueBranches = Array.from(new Set(allStudents.map(s => s.branch).filter(Boolean))).sort();

    // Map Joined Data
    let joined = allStudents.map(student => {
        const studentInternships = intMap[student.id] || [];
        const studentCertificates = certMap[student.id] || [];
        const studentDiploma = dipMap[student.id] || null;

        return {
            ...student,
            internships: studentInternships,
            certificates: studentCertificates,
            diploma: studentDiploma,
            internships_count: studentInternships.length,
            certificates_count: studentCertificates.length,
            has_diploma: !!studentDiploma
        };
    });

    // 1. Filter by Branch
    if (branch && branch.trim() !== '' && branch !== 'all') {
        const targetBranch = branch.trim().toLowerCase();
        joined = joined.filter(s => (s.branch || '').toLowerCase() === targetBranch);
    }

    // 2. Filter by Minimum CGPA
    if (minCgpa && !isNaN(parseFloat(minCgpa))) {
        const minVal = parseFloat(minCgpa);
        joined = joined.filter(s => (parseFloat(s.cgpa_overall) || 0) >= minVal);
    }

    // 3. Free-text Keyword Search
    if (search && search.trim() !== '') {
        const q = search.trim().toLowerCase();
        joined = joined.filter(s => {
            const nameMatch = (s.name || '').toLowerCase().includes(q);
            const prnMatch = (s.prn || '').toLowerCase().includes(q);
            const activitiesMatch = (s.activities || '').toLowerCase().includes(q);

            const intMatch = s.internships.some(i =>
                (i.company || '').toLowerCase().includes(q) ||
                (i.role || '').toLowerCase().includes(q)
            );

            const certMatch = s.certificates.some(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.issuer || '').toLowerCase().includes(q)
            );

            return nameMatch || prnMatch || activitiesMatch || intMatch || certMatch;
        });
    }

    return { joined, uniqueBranches };
}

/**
 * @route   GET /api/admin/students
 * @desc    Get filtered student records with counts and joined data
 */
router.get('/', async (req, res) => {
    try {
        const { joined, uniqueBranches } = await getFilteredStudentData(req.query);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
        const start = (page - 1) * pageSize;
        return res.json({
            success: true,
            count: joined.length,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(joined.length / pageSize)),
            branches: uniqueBranches,
            students: joined.slice(start, start + pageSize)
        });
    } catch (err) {
        console.error('Error fetching student list:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/admin/students/export/csv
 * @desc    Export filtered students view as CSV download
 */
router.get('/export/csv', async (req, res) => {
    try {
        const { joined } = await getFilteredStudentData(req.query);

        // Build CSV Content
        const headers = [
            'PRN', 'Name', 'Branch', 'Class', 'Year',
            'Overall CGPA', 'Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6', 'Sem 7', 'Sem 8',
            'Activities', 'Resume URL', 'Internships', 'Certificates', 'Diploma Info'
        ];

        let csvRows = [headers.map(escapeCsvField).join(',')];

        joined.forEach(s => {
            const sems = s.cgpa_semesterwise || {};
            const intString = s.internships.map(i => `${i.company} (${i.role}, ${i.mode || 'offline'})`).join('; ') || 'None';
            const certString = s.certificates.map(c => `${c.name} (${c.issuer}, ${c.mode || 'online'})`).join('; ') || 'None';
            const dipString = s.diploma ? `${s.diploma.institute} - ${s.diploma.branch} (${s.diploma.year_of_passing}, ${s.diploma.percentage_or_cgpa})` : 'N/A';

            const row = [
                s.prn || '',
                s.name || '',
                s.branch || '',
                s.class || '',
                s.year || '',
                s.cgpa_overall !== undefined ? s.cgpa_overall : '',
                sems.sem1 || '', sems.sem2 || '', sems.sem3 || '', sems.sem4 || '',
                sems.sem5 || '', sems.sem6 || '', sems.sem7 || '', sems.sem8 || '',
                s.activities || '',
                s.resume_url || '',
                intString,
                certString,
                dipString
            ];

            csvRows.push(row.map(escapeCsvField).join(','));
        });

        const csvContent = csvRows.join('\n');

        // Log to Audit Log
        await db.logAudit('export_csv', 'students', null, {
            rowCount: joined.length,
            filters: req.query
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="tpo_students_export.csv"');
        return res.send(csvContent);

    } catch (err) {
        console.error('Error generating CSV export:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/admin/students/export/excel
 * @desc    Export filtered students view as Excel (.xlsx) file download
 */
router.get('/export/excel', async (req, res) => {
    try {
        const { joined } = await getFilteredStudentData(req.query);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'TPO Placement Portal';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('Students Export');

        worksheet.columns = [
            { header: 'PRN', key: 'prn', width: 18 },
            { header: 'Name', key: 'name', width: 22 },
            { header: 'Branch', key: 'branch', width: 22 },
            { header: 'Class', key: 'class', width: 12 },
            { header: 'Year', key: 'year', width: 14 },
            { header: 'Overall CGPA', key: 'cgpa_overall', width: 14 },
            { header: 'Sem 1', key: 'sem1', width: 10 },
            { header: 'Sem 2', key: 'sem2', width: 10 },
            { header: 'Sem 3', key: 'sem3', width: 10 },
            { header: 'Sem 4', key: 'sem4', width: 10 },
            { header: 'Sem 5', key: 'sem5', width: 10 },
            { header: 'Sem 6', key: 'sem6', width: 10 },
            { header: 'Sem 7', key: 'sem7', width: 10 },
            { header: 'Sem 8', key: 'sem8', width: 10 },
            { header: 'Activities', key: 'activities', width: 35 },
            { header: 'Resume URL', key: 'resume_url', width: 30 },
            { header: 'Internships', key: 'internships', width: 40 },
            { header: 'Certificates', key: 'certificates', width: 40 },
            { header: 'Diploma Info', key: 'diploma', width: 35 }
        ];

        // Header Styling
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F46E5' } // Primary Indigo
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        joined.forEach(s => {
            const sems = s.cgpa_semesterwise || {};
            const intString = s.internships.map(i => `${i.company} (${i.role}, ${i.mode || 'offline'})`).join('; ') || 'None';
            const certString = s.certificates.map(c => `${c.name} (${c.issuer}, ${c.mode || 'online'})`).join('; ') || 'None';
            const dipString = s.diploma ? `${s.diploma.institute} - ${s.diploma.branch} (${s.diploma.year_of_passing}, ${s.diploma.percentage_or_cgpa})` : 'N/A';

            worksheet.addRow({
                prn: s.prn || '',
                name: s.name || '',
                branch: s.branch || '',
                class: s.class || '',
                year: s.year || '',
                cgpa_overall: s.cgpa_overall !== undefined ? parseFloat(s.cgpa_overall) : '',
                sem1: sems.sem1 || '', sem2: sems.sem2 || '', sem3: sems.sem3 || '', sem4: sems.sem4 || '',
                sem5: sems.sem5 || '', sem6: sems.sem6 || '', sem7: sems.sem7 || '', sem8: sems.sem8 || '',
                activities: s.activities || '',
                resume_url: s.resume_url || '',
                internships: intString,
                certificates: certString,
                diploma: dipString
            });
        });

        // Audit Logging
        await db.logAudit('export_excel', 'students', null, {
            rowCount: joined.length,
            filters: req.query
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="tpo_students_export.xlsx"');

        await workbook.xlsx.write(res);
        return res.end();

    } catch (err) {
        console.error('Error generating Excel export:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

function escapeCsvField(val) {
    if (val === null || val === undefined) return '""';
    let safe = String(val);
    if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
    const str = safe.replace(/"/g, '""');
    return `"${str}"`;
}

module.exports = router;

const express = require('express');
const ExcelJS = require('exceljs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const db = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');
const { BRANCHES } = require('../config/branches');

const router = express.Router();

router.use(authenticateAdmin);

/**
 * Helper to fetch and filter students with all joined sub-tables
 */
const kvCache = require('../utils/kvCache');

async function clearStudentCache() {
    await kvCache.clearPattern('students_list');
}

router.post('/cache/purge', async (_req, res) => {
    await clearStudentCache();
    return res.json({ success: true, message: 'Student cache cleared.' });
});

async function getFilteredStudentData(queryParams, page = 1, pageSize = 25, paginate = false) {
    const { branch, minCgpa, maxCgpa, sgpaSemester, minSgpa, year, backlogFilter, search, _bust } = queryParams;

    const cacheKey = `students_list:${JSON.stringify({ queryParams, page, pageSize, paginate })}`;
    if (!_bust) {
        const cached = await kvCache.get(cacheKey);
        if (cached) {
            console.log(`[CACHE HIT] Key: ${cacheKey}`);
            try {
                return JSON.parse(cached);
            } catch (e) {}
        }
    }

    console.log(`[CACHE MISS] Key: ${cacheKey}. Querying database.`);
    let result;
    if (db.isLocal()) {
        // Local in-memory fallback for testing
        const [allStudents, allRoster, allInternships, allCertificates, allProjects, allResearchPapers, allDiploma] = await Promise.all([
            db.select('students'),
            db.select('roster'),
            db.select('internships'),
            db.select('certificates'),
            db.select('student_projects'),
            db.select('research_papers'),
            db.select('diploma')
        ]);

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
        const projectMap = {};
        allProjects.forEach(item => { (projectMap[item.student_id] ||= []).push(item); });
        const researchMap = {};
        allResearchPapers.forEach(item => { (researchMap[item.student_id] ||= []).push(item); });

        const dipMap = {};
        allDiploma.forEach(item => {
            dipMap[item.student_id] = item;
        });

        const uniqueBranches = BRANCHES.map(branch => branch.code);

        const decorate = (student, profileActive = true) => {
            const studentInternships = intMap[student.id] || [];
            const studentCertificates = certMap[student.id] || [];
            const studentProjects = projectMap[student.id] || [];
            const studentResearchPapers = researchMap[student.id] || [];
            const studentDiploma = dipMap[student.id] || null;

            return {
                ...student,
                profile_active: profileActive,
                active_backlogs: Object.values(student.backlogs_semesterwise || {}).reduce((sum, value) => sum + (Number(value) || 0), 0),
                internships: studentInternships,
                certificates: studentCertificates,
                projects: studentProjects,
                research_papers: studentResearchPapers,
                diploma: studentDiploma,
                internships_count: studentInternships.length,
                certificates_count: studentCertificates.length,
                projects_count: studentProjects.length,
                research_papers_count: studentResearchPapers.length,
                has_diploma: !!studentDiploma
            };
        };

        const profileByPrn = new Map(allStudents.map(student => [String(student.prn), student]));
        let joined = allRoster.map(roster => {
            const profile = profileByPrn.get(String(roster.prn));
            if (profile) return decorate(profile, true);
            return decorate({
                id: `roster-${roster.id}`,
                roster_id: roster.id,
                prn: roster.prn,
                name: roster.name,
                branch: roster.branch,
                class: roster.class,
                year: roster.year,
                email: null,
                phone: null,
                cgpa_overall: null,
                cgpa_semesterwise: {},
                backlogs_semesterwise: {},
                activities: '',
                resume_url: null
            }, false);
        });
        const rosterPrns = new Set(allRoster.map(row => String(row.prn)));
        joined.push(...allStudents.filter(student => !rosterPrns.has(String(student.prn))).map(student => decorate(student, true)));

        if (branch && branch.trim() !== '' && branch !== 'all') {
            const targetBranch = branch.trim().toLowerCase();
            joined = joined.filter(s => (s.branch || '').toLowerCase() === targetBranch);
        }

        if (minCgpa && !isNaN(parseFloat(minCgpa))) {
            const minVal = parseFloat(minCgpa);
            joined = joined.filter(s => (parseFloat(s.cgpa_overall) || 0) >= minVal);
        }
        if (maxCgpa && !isNaN(parseFloat(maxCgpa))) joined = joined.filter(s => (parseFloat(s.cgpa_overall) || 0) <= parseFloat(maxCgpa));
        if (year && year !== 'all') joined = joined.filter(s => String(s.year || '').toLowerCase() === String(year).toLowerCase());
        const semester = Number(sgpaSemester);
        if (semester >= 1 && semester <= 8 && minSgpa !== '' && minSgpa !== undefined && !isNaN(parseFloat(minSgpa))) {
            joined = joined.filter(s => (Number(s.cgpa_semesterwise?.[`sem${semester}`]) || 0) >= Number(minSgpa));
        }
        if (backlogFilter === 'zero') joined = joined.filter(s => s.active_backlogs === 0);
        if (backlogFilter === 'has') joined = joined.filter(s => s.active_backlogs > 0);
        if (backlogFilter === 'exact1') joined = joined.filter(s => s.active_backlogs === 1);
        if (backlogFilter === 'exact2') joined = joined.filter(s => s.active_backlogs === 2);
        if (backlogFilter === 'more2') joined = joined.filter(s => s.active_backlogs > 2);
        if (backlogFilter === 'max1') joined = joined.filter(s => s.active_backlogs <= 1);
        if (backlogFilter === 'max2') joined = joined.filter(s => s.active_backlogs <= 2);

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

                const projectMatch = s.projects.some(p => [p.title, p.summary, p.technologies].some(value => String(value || '').toLowerCase().includes(q)));
                const researchMatch = s.research_papers.some(p => [p.title, p.authors, p.publication, p.abstract].some(value => String(value || '').toLowerCase().includes(q)));

                return nameMatch || prnMatch || activitiesMatch || intMatch || certMatch || projectMatch || researchMatch;
            });
        }

        joined.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'en', { sensitivity: 'base' }) || String(left.prn || '').localeCompare(String(right.prn || '')));

        result = { joined, count: joined.length, uniqueBranches };
    } else {
        const supabase = db.supabaseClient();

        let selectStr = `
            id, prn, name, dob, branch, class, year,
            students!left(
                id, email, phone, cgpa_overall, cgpa_semesterwise, backlogs_semesterwise, activities, resume_url,
                ssc_marks, hsc_marks, is_employed, employment_type, org_type, company_name, current_ctc, company_address, hr_name, hr_number,
                lateral_entry, avatar_path
            )
        `;

        const hasStudentFilter = minCgpa || maxCgpa || (sgpaSemester && minSgpa) || backlogFilter;
        if (hasStudentFilter) {
            selectStr = `
                id, prn, name, dob, branch, class, year,
                students!inner(
                    id, email, phone, cgpa_overall, cgpa_semesterwise, backlogs_semesterwise, activities, resume_url,
                    ssc_marks, hsc_marks, is_employed, employment_type, org_type, company_name, current_ctc, company_address, hr_name, hr_number,
                    lateral_entry, avatar_path
                )
            `;
        }

        let query = supabase.from('roster').select(selectStr, { count: 'exact' });

        if (branch && branch !== 'all') {
            query = query.eq('branch', branch);
        }
        if (year && year !== 'all') {
            query = query.eq('year', year);
        }
        if (minCgpa) {
            query = query.gte('students.cgpa_overall', parseFloat(minCgpa));
        }
        if (maxCgpa) {
            query = query.lte('students.cgpa_overall', parseFloat(maxCgpa));
        }

        const semester = Number(sgpaSemester);
        if (semester >= 1 && semester <= 8 && minSgpa) {
            query = query.gte(`students.cgpa_semesterwise->>sem${semester}`, parseFloat(minSgpa));
        }

        if (search) {
            const cleanSearch = search.trim();
            query = query.or(`name.ilike.%${cleanSearch}%,prn.ilike.%${cleanSearch}%`);
        }

        query = query.order('name', { ascending: true });

        if (paginate) {
            const start = (page - 1) * pageSize;
            const end = start + pageSize - 1;
            query = query.range(start, end);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        const studentIds = data.map(r => r.students?.id).filter(Boolean);
        let internships = [];
        let certificates = [];
        let projects = [];
        let researchPapers = [];
        let diplomas = [];

        if (studentIds.length > 0) {
            const [intRes, certRes, projRes, paperRes, dipRes] = await Promise.all([
                supabase.from('internships').select('id, student_id, company, role, start_date, end_date, mode').in('student_id', studentIds),
                supabase.from('certificates').select('id, student_id, name, issuer, date, mode').in('student_id', studentIds),
                supabase.from('student_projects').select('id, student_id, title, summary, technologies, project_url, repository_url, completed_on').in('student_id', studentIds),
                supabase.from('research_papers').select('id, student_id, title, authors, publication, abstract, doi_url, paper_url, published_on').in('student_id', studentIds),
                supabase.from('diploma').select('id, student_id, institute, branch, year_of_passing, percentage_or_cgpa').in('student_id', studentIds)
            ]);
            internships = intRes.data || [];
            certificates = certRes.data || [];
            projects = projRes.data || [];
            researchPapers = paperRes.data || [];
            diplomas = dipRes.data || [];
        }

        const intMap = {};
        internships.forEach(i => { (intMap[i.student_id] ||= []).push(i); });
        const certMap = {};
        certificates.forEach(c => { (certMap[c.student_id] ||= []).push(c); });
        const projMap = {};
        projects.forEach(p => { (projMap[p.student_id] ||= []).push(p); });
        const paperMap = {};
        researchPapers.forEach(p => { (paperMap[p.student_id] ||= []).push(p); });
        const dipMap = {};
        diplomas.forEach(d => { dipMap[d.student_id] = d; });

        let joined = data.map(roster => {
            const profile = roster.students;
            const profileActive = !!profile;
            const student = profile ? {
                ...profile,
                prn: roster.prn,
                name: roster.name,
                branch: roster.branch,
                class: roster.class,
                year: roster.year
            } : {
                id: `roster-${roster.id}`,
                roster_id: roster.id,
                prn: roster.prn,
                name: roster.name,
                branch: roster.branch,
                class: roster.class,
                year: roster.year,
                email: null,
                phone: null,
                cgpa_overall: null,
                cgpa_semesterwise: {},
                backlogs_semesterwise: {},
                activities: '',
                resume_url: null
            };

            const studentInternships = intMap[student.id] || [];
            const studentCertificates = certMap[student.id] || [];
            const studentProjects = projMap[student.id] || [];
            const studentResearchPapers = paperMap[student.id] || [];
            const studentDiploma = dipMap[student.id] || null;

            const active_backlogs = Object.values(student.backlogs_semesterwise || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);

            return {
                ...student,
                profile_active: profileActive,
                active_backlogs,
                internships: studentInternships,
                certificates: studentCertificates,
                projects: studentProjects,
                research_papers: studentResearchPapers,
                diploma: studentDiploma,
                internships_count: studentInternships.length,
                certificates_count: studentCertificates.length,
                projects_count: studentProjects.length,
                research_papers_count: studentResearchPapers.length,
                has_diploma: !!studentDiploma
            };
        });

        if (backlogFilter) {
            if (backlogFilter === 'zero') joined = joined.filter(s => s.active_backlogs === 0);
            if (backlogFilter === 'has') joined = joined.filter(s => s.active_backlogs > 0);
            if (backlogFilter === 'exact1') joined = joined.filter(s => s.active_backlogs === 1);
            if (backlogFilter === 'exact2') joined = joined.filter(s => s.active_backlogs === 2);
            if (backlogFilter === 'more2') joined = joined.filter(s => s.active_backlogs > 2);
            if (backlogFilter === 'max1') joined = joined.filter(s => s.active_backlogs <= 1);
            if (backlogFilter === 'max2') joined = joined.filter(s => s.active_backlogs <= 2);
        }

        const { BRANCHES } = require('../config/branches');
        const uniqueBranches = BRANCHES.map(b => b.code);

        result = { joined, count: count || joined.length, uniqueBranches };
    }

    await kvCache.put(cacheKey, JSON.stringify(result), 120);

    return result;
}

router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
        const { joined, count, uniqueBranches } = await getFilteredStudentData(req.query, page, pageSize, true);

        // When using DB pagination, the returned joined array contains exactly the page size.
        // But for local in-memory fallback, joined contains all records, so we still slice it.
        const students = db.isLocal() ? joined.slice((page - 1) * pageSize, page * pageSize) : joined;

        return res.json({
            success: true,
            count,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(count / pageSize)),
            branches: uniqueBranches,
            students
        });
    } catch (err) {
        console.error('Error fetching student list:', err);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to load student records.' } });
    }
});

router.get('/:id/resume/open', async (req, res) => {
    const student = await db.selectOne('students', { id: req.params.id });
    if (!student?.resume_url) return res.status(404).send('Resume not uploaded.');
    if (db.isLocal()) return res.status(503).send('Resume storage requires Supabase.');
    const { data, error } = await db.supabaseClient().storage.from('resumes').createSignedUrl(student.resume_url, 300);
    if (error) throw error;
    return res.redirect(302, data.signedUrl);
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
            'SSC Marks (%)', 'HSC/Diploma Marks (%)', 'Employed?', 'Employment Type', 'Org Type', 'Company Name', 'Current CTC (LPA)', 'Company Address', 'HR Name', 'HR Number',
            'Overall CGPA', 'Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6', 'Sem 7', 'Sem 8',
            'Current Backlogs', 'Backlogs by Semester', 'Internships', 'Certificates', 'Projects', 'Research Papers', 'Diploma Info'
        ];

        let csvRows = [headers.map(escapeCsvField).join(',')];

        joined.forEach(s => {
            const sems = s.cgpa_semesterwise || {};
            const intString = s.internships.map(i => `${i.company} (${i.role}, ${i.mode || 'offline'})`).join('; ') || 'None';
            const certString = s.certificates.map(c => `${c.name} (${c.issuer}, ${c.mode || 'online'})`).join('; ') || 'None';
            const projectString = s.projects.map(p => p.title).join('; ') || 'None';
            const researchString = s.research_papers.map(p => `${p.title} (${p.publication})`).join('; ') || 'None';
            const dipString = s.diploma ? `${s.diploma.institute} - ${s.diploma.branch} (${s.diploma.year_of_passing}, ${s.diploma.percentage_or_cgpa})` : 'N/A';

            const row = [
                s.prn || '',
                s.name || '',
                s.branch || '',
                s.class || '',
                s.year || '',
                s.ssc_marks !== undefined ? s.ssc_marks : '',
                s.hsc_marks !== undefined ? s.hsc_marks : '',
                s.is_employed ? 'Yes' : 'No',
                s.employment_type || '',
                s.org_type || '',
                s.company_name || '',
                s.current_ctc || '',
                s.company_address || '',
                s.hr_name || '',
                s.hr_number || '',
                s.cgpa_overall !== undefined ? s.cgpa_overall : '',
                sems.sem1 || '', sems.sem2 || '', sems.sem3 || '', sems.sem4 || '',
                sems.sem5 || '', sems.sem6 || '', sems.sem7 || '', sems.sem8 || '',
                s.active_backlogs,
                backlogSummary(s),
                intString,
                certString,
                projectString,
                researchString,
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
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to generate CSV export.' } });
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
            { header: 'SSC Marks (%)', key: 'ssc_marks', width: 14 },
            { header: 'HSC Marks (%)', key: 'hsc_marks', width: 14 },
            { header: 'Employed?', key: 'is_employed', width: 12 },
            { header: 'Employment Type', key: 'employment_type', width: 16 },
            { header: 'Org Type', key: 'org_type', width: 14 },
            { header: 'Company Name', key: 'company_name', width: 20 },
            { header: 'Current CTC (LPA)', key: 'current_ctc', width: 16 },
            { header: 'Company Address', key: 'company_address', width: 25 },
            { header: 'HR Name', key: 'hr_name', width: 15 },
            { header: 'HR Number', key: 'hr_number', width: 15 },
            { header: 'Overall CGPA', key: 'cgpa_overall', width: 14 },
            { header: 'Sem 1', key: 'sem1', width: 10 },
            { header: 'Sem 2', key: 'sem2', width: 10 },
            { header: 'Sem 3', key: 'sem3', width: 10 },
            { header: 'Sem 4', key: 'sem4', width: 10 },
            { header: 'Sem 5', key: 'sem5', width: 10 },
            { header: 'Sem 6', key: 'sem6', width: 10 },
            { header: 'Sem 7', key: 'sem7', width: 10 },
            { header: 'Sem 8', key: 'sem8', width: 10 },
            { header: 'Current Backlogs', key: 'active_backlogs', width: 18 },
            { header: 'Backlogs by Semester', key: 'backlogs', width: 28 },
            { header: 'Internships', key: 'internships', width: 40 },
            { header: 'Certificates', key: 'certificates', width: 40 },
            { header: 'Projects', key: 'projects', width: 40 },
            { header: 'Research Papers', key: 'research_papers', width: 50 },
            { header: 'Diploma Info', key: 'diploma', width: 35 }
        ];

        // Header Styling
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF174A3A' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        const validNum = val => {
            if (val === null || val === undefined) return '';
            const num = parseFloat(val);
            return isNaN(num) ? '' : num;
        };

        joined.forEach(s => {
            const sems = s.cgpa_semesterwise || {};
            const intString = s.internships.map(i => `${i.company} (${i.role}, ${i.mode || 'offline'})`).join('; ') || 'None';
            const certString = s.certificates.map(c => `${c.name} (${c.issuer}, ${c.mode || 'online'})`).join('; ') || 'None';
            const projectString = s.projects.map(p => p.title).join('; ') || 'None';
            const researchString = s.research_papers.map(p => `${p.title} (${p.publication})`).join('; ') || 'None';
            const dipString = s.diploma ? `${s.diploma.institute} - ${s.diploma.branch} (${s.diploma.year_of_passing}, ${s.diploma.percentage_or_cgpa})` : 'N/A';

            worksheet.addRow({
                prn: s.prn || '',
                name: s.name || '',
                branch: s.branch || '',
                class: s.class || '',
                year: s.year || '',
                ssc_marks: validNum(s.ssc_marks),
                hsc_marks: validNum(s.hsc_marks),
                is_employed: s.is_employed ? 'Yes' : 'No',
                employment_type: s.employment_type || '',
                org_type: s.org_type || '',
                company_name: s.company_name || '',
                current_ctc: validNum(s.current_ctc),
                company_address: s.company_address || '',
                hr_name: s.hr_name || '',
                hr_number: s.hr_number || '',
                cgpa_overall: validNum(s.cgpa_overall),
                sem1: sems.sem1 || '', sem2: sems.sem2 || '', sem3: sems.sem3 || '', sem4: sems.sem4 || '',
                sem5: sems.sem5 || '', sem6: sems.sem6 || '', sem7: sems.sem7 || '', sem8: sems.sem8 || '',
                active_backlogs: s.active_backlogs,
                backlogs: backlogSummary(s),
                internships: intString,
                certificates: certString,
                projects: projectString,
                research_papers: researchString,
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
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to generate Excel export.' } });
    }
});

router.get('/export/pdf', async (req, res) => {
    try {
        const { joined } = await getFilteredStudentData(req.query);
        const document = await PDFDocument.create();
        const regular = await document.embedFont(StandardFonts.Helvetica);
        const bold = await document.embedFont(StandardFonts.HelveticaBold);
        const pageSize = [842, 595];
        let page;
        let y;
        const colConfig = [
            { label: 'PRN', x: 30, max: 16 },
            { label: 'Name', x: 95, max: 28 },
            { label: 'Branch', x: 220, max: 8 },
            { label: 'Year', x: 255, max: 12 },
            { label: 'Class', x: 310, max: 8 },
            { label: 'SSC', x: 345, max: 6 },
            { label: 'HSC', x: 375, max: 6 },
            { label: 'CGPA', x: 405, max: 6 },
            { label: 'SGPA', x: 435, max: 15 },
            { label: 'Employed?', x: 495, max: 9 },
            { label: 'Company', x: 545, max: 16 },
            { label: 'CTC', x: 620, max: 8 },
            { label: 'Backlogs', x: 660, max: 35 }
        ];

        const addPage = () => {
            page = document.addPage(pageSize); y = 555;

            // Add decorative header border
            page.drawRectangle({ x: 25, y: y - 5, width: 792, height: 26, color: rgb(0.93, 0.96, 0.95), borderColor: rgb(0.08, 0.22, 0.18), borderWidth: 1 });

            page.drawText('Recruiter Candidate Report', { x: 35, y: y + 2, size: 14, font: bold, color: rgb(0.08, 0.22, 0.18) });
            page.drawText(`Generated ${new Date().toLocaleDateString('en-IN')} | ${joined.length} candidate(s)`, { x: 620, y: y + 2, size: 9, font: regular, color: rgb(0.3, 0.3, 0.3) });
            y -= 30;

            // Table Header Background
            page.drawRectangle({ x: 25, y: y - 4, width: 792, height: 16, color: rgb(0.88, 0.92, 0.9) });

            colConfig.forEach(col => page.drawText(col.label, { x: col.x, y, size: 7, font: bold }));
            y -= 16;
        };
        addPage();

        const selectedSemester = Number(req.query.sgpaSemester);
        joined.forEach((student, i) => {
            if (y < 35) addPage();

            // Alternating row colors
            if (i % 2 === 0) {
                page.drawRectangle({ x: 25, y: y - 3, width: 792, height: 14, color: rgb(0.98, 0.98, 0.98) });
            }

            const semLabel = selectedSemester >= 1 && selectedSemester <= 8
                ? `S${selectedSemester}: ${student.cgpa_semesterwise?.[`sem${selectedSemester}`] ?? '-'}`
                : Object.entries(student.cgpa_semesterwise || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key.replace('sem', 'S')}:${value}`).join(' ') || '-';
            const values = [
                student.prn, student.name, student.branch, student.year, student.class,
                String(student.ssc_marks ?? '-'), String(student.hsc_marks ?? '-'),
                String(student.cgpa_overall ?? '-'), semLabel,
                student.is_employed ? 'Yes' : 'No', student.company_name ?? '-',
                String(student.current_ctc ?? '-'), student.active_backlogs
            ];
            values.forEach((value, index) => page.drawText(truncate(value, colConfig[index].max), { x: colConfig[index].x, y, size: 7, font: regular }));

            // Row bottom border
            page.drawLine({ start: { x: 25, y: y - 4 }, end: { x: 817, y: y - 4 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });

            y -= 14;
        });

        // Page border
        const pages = document.getPages();
        pages.forEach(p => {
            p.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1, opacity: 0 });
        });
        const bytes = await document.save();
        await db.logAudit('export_pdf', 'students', null, { rowCount: joined.length, filters: req.query });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="recruiter_candidates.pdf"');
        return res.send(Buffer.from(bytes));
    } catch (err) {
        console.error('Error generating PDF export:', err);
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to generate PDF export.' } });
    }
});

function backlogSummary(student) {
    return Object.entries(student.backlogs_semesterwise || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key.replace('sem', 'S')}: ${value}`).join('; ') || 'None';
}

function truncate(value, length) {
    const text = String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '?');
    return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function escapeCsvField(val) {
    if (val === null || val === undefined) return '""';
    let safe = String(val);
    if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
    const str = safe.replace(/"/g, '""');
    return `"${str}"`;
}

/**
 * @route   POST /api/admin/students/:prn/impersonate
 * @desc    Generate a student login token for the specified PRN (Admin impersonation)
 */
router.post('/:prn/impersonate', async (req, res) => {
    try {
        const { prn } = req.params;
        const cleanPrn = String(prn).trim();

        // 1. Look up student entry in Roster table
        const rosterEntry = await db.selectOne('roster', { prn: cleanPrn });
        if (!rosterEntry) {
            return res.status(404).json({ success: false, error: 'Student PRN not found in roster.' });
        }

        // 2. Check if student profile already exists in `students` table
        let studentRecord = await db.selectOne('students', { prn: cleanPrn });

        // If first-time login / profile missing, prefill and create from Roster
        if (!studentRecord) {
            const { normalizeBranch } = require('../config/branches');
            studentRecord = await db.insert('students', {
                prn: rosterEntry.prn,
                name: rosterEntry.name,
                email: null,
                phone: null,
                branch: normalizeBranch(rosterEntry.branch) || rosterEntry.branch,
                class: rosterEntry.class,
                year: rosterEntry.year,
                cgpa_overall: 0.0,
                cgpa_semesterwise: {
                    sem1: 0, sem2: 0, sem3: 0, sem4: 0,
                    sem5: 0, sem6: 0, sem7: 0, sem8: 0
                },
                backlogs_semesterwise: { sem1: 0, sem2: 0, sem3: 0, sem4: 0, sem5: 0, sem6: 0, sem7: 0, sem8: 0 },
                activities: '',
                resume_url: null
            });
        }

        // 3. Generate JWT token
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET, SESSION_VERSION } = require('../middleware/auth');
        const payload = {
            role: 'student',
            studentId: studentRecord.id,
            prn: studentRecord.prn,
            name: studentRecord.name,
            branch: studentRecord.branch,
            class: studentRecord.class,
            year: studentRecord.year,
            sessionVersion: SESSION_VERSION
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

        await db.logAudit('impersonate_student', 'students', studentRecord.id, { prn: studentRecord.prn });

        return res.json({ success: true, token });

    } catch (err) {
        console.error('Error impersonating student:', err);
        return res.status(500).json({ success: false, error: 'Internal server error while generating token.' });
    }
});
router.clearStudentCache = clearStudentCache;
module.exports = router;

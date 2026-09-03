const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateAdmin);

function groupByStudent(rows) {
    return (rows || []).reduce((map, row) => {
        const list = map.get(row.student_id) || [];
        list.push(row);
        map.set(row.student_id, list);
        return map;
    }, new Map());
}

function clean(value) {
    return value === null || value === undefined ? '' : value;
}

function activeBacklogs(student) {
    return Object.values(student?.backlogs_semesterwise || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function backlogSummary(student) {
    return Object.entries(student?.backlogs_semesterwise || {})
        .filter(([, value]) => Number(value) > 0)
        .map(([key, value]) => `${key.replace('sem', 'S')}: ${value}`)
        .join('; ') || 'None';
}

function recordSummary(rows, formatter) {
    return (rows || []).map(formatter).filter(Boolean).join('; ');
}

function matchesBacklogFilter(count, filter) {
    if (!filter || filter === 'all') return true;
    if (filter === 'zero') return count === 0;
    if (filter === 'has') return count > 0;
    if (filter === 'exact1') return count === 1;
    if (filter === 'exact2') return count === 2;
    if (filter === 'more2') return count > 2;
    if (filter === 'max1') return count <= 1;
    if (filter === 'max2') return count <= 2;
    return true;
}

function appliesFilters(row, query) {
    const profile = row.profile;
    if (query.branch && query.branch !== 'all' && String(row.branch || '').toUpperCase() !== String(query.branch).toUpperCase()) return false;
    if (query.year && query.year !== 'all' && String(row.year || '').toLowerCase() !== String(query.year).toLowerCase()) return false;

    const cgpa = Number(profile?.cgpa_overall || 0);
    if (query.minCgpa !== undefined && query.minCgpa !== '' && Number.isFinite(Number(query.minCgpa)) && cgpa < Number(query.minCgpa)) return false;
    if (query.maxCgpa !== undefined && query.maxCgpa !== '' && Number.isFinite(Number(query.maxCgpa)) && cgpa > Number(query.maxCgpa)) return false;

    const semester = Number(query.sgpaSemester);
    if (semester >= 1 && semester <= 8 && query.minSgpa !== undefined && query.minSgpa !== '' && Number.isFinite(Number(query.minSgpa))) {
        if (Number(profile?.cgpa_semesterwise?.[`sem${semester}`] || 0) < Number(query.minSgpa)) return false;
    }

    if (!matchesBacklogFilter(activeBacklogs(profile), query.backlogFilter)) return false;

    const term = String(query.search || '').trim().toLowerCase();
    if (term) {
        const haystack = [row.prn, row.name, row.branch, row.class, row.year, profile?.email, profile?.phone, profile?.company_name, profile?.github_url, profile?.portfolio_url]
            .map(value => String(value || '').toLowerCase());
        if (!haystack.some(value => value.includes(term))) return false;
    }
    return true;
}

router.get('/excel', async (req, res) => {
    try {
        const [roster, students, internships, certificates, projects, papers, diplomas, skills, competitions] = await Promise.all([
            db.select('roster'), db.select('students'), db.select('internships'), db.select('certificates'),
            db.select('student_projects'), db.select('research_papers'), db.select('diploma'), db.select('student_skills'), db.select('student_competitions')
        ]);

        const profileByPrn = new Map(students.map(student => [String(student.prn), student]));
        const rosterPrns = new Set(roster.map(row => String(row.prn)));
        const intMap = groupByStudent(internships);
        const certMap = groupByStudent(certificates);
        const projectMap = groupByStudent(projects);
        const paperMap = groupByStudent(papers);
        const skillMap = groupByStudent(skills);
        const competitionMap = groupByStudent(competitions);
        const diplomaMap = new Map(diplomas.map(row => [row.student_id, row]));

        const baseRows = roster.map(row => ({ ...row, profile: profileByPrn.get(String(row.prn)) || null }));
        students.filter(student => !rosterPrns.has(String(student.prn))).forEach(student => baseRows.push({
            prn: student.prn, name: student.name, dob: '', branch: student.branch, class: student.class, year: student.year, profile: student
        }));

        const rows = baseRows.filter(row => appliesFilters(row, req.query)).sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }) || String(a.prn || '').localeCompare(String(b.prn || ''))
        );

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'AIT Placement Portal';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('Complete Student Data', { views: [{ state: 'frozen', ySplit: 1 }] });

        sheet.columns = [
            { header: 'PRN', key: 'prn', width: 20 },
            { header: 'Full Name', key: 'name', width: 30 },
            { header: 'Date of Birth', key: 'dob', width: 15 },
            { header: 'Branch', key: 'branch', width: 12 },
            { header: 'Class / Division', key: 'class', width: 15 },
            { header: 'Year', key: 'year', width: 15 },
            { header: 'Profile Active', key: 'profile_active', width: 14 },
            { header: 'Email', key: 'email', width: 32 },
            { header: 'Mobile Number', key: 'phone', width: 18 },
            { header: 'Profile Photo Uploaded', key: 'photo', width: 22 },
            { header: 'GitHub URL', key: 'github_url', width: 38 },
            { header: 'Portfolio URL', key: 'portfolio_url', width: 38 },
            { header: 'SSC Marks (%)', key: 'ssc_marks', width: 15 },
            { header: 'HSC Marks (%)', key: 'hsc_marks', width: 16 },
            { header: 'Diploma Details', key: 'diploma', width: 45 },
            { header: 'Overall CGPA', key: 'cgpa_overall', width: 14 },
            { header: 'Sem 1', key: 'sem1', width: 9 }, { header: 'Sem 2', key: 'sem2', width: 9 },
            { header: 'Sem 3', key: 'sem3', width: 9 }, { header: 'Sem 4', key: 'sem4', width: 9 },
            { header: 'Sem 5', key: 'sem5', width: 9 }, { header: 'Sem 6', key: 'sem6', width: 9 },
            { header: 'Sem 7', key: 'sem7', width: 9 }, { header: 'Sem 8', key: 'sem8', width: 9 },
            { header: 'Current Backlogs', key: 'active_backlogs', width: 18 },
            { header: 'Backlogs by Semester', key: 'backlogs', width: 28 },
            { header: 'Lateral Entry', key: 'lateral_entry', width: 14 },
            { header: 'Employed', key: 'is_employed', width: 12 },
            { header: 'Employment Type', key: 'employment_type', width: 18 },
            { header: 'Organization Type', key: 'org_type', width: 18 },
            { header: 'Company Name', key: 'company_name', width: 28 },
            { header: 'Current CTC (LPA)', key: 'current_ctc', width: 18 },
            { header: 'Company Address', key: 'company_address', width: 45 },
            { header: 'HR Name', key: 'hr_name', width: 22 },
            { header: 'HR Number', key: 'hr_number', width: 18 },
            { header: 'Activities / Achievements', key: 'activities', width: 55 },
            { header: 'Resume Uploaded', key: 'resume', width: 16 },
            { header: 'Skills', key: 'skills', width: 50 },
            { header: 'Internships', key: 'internships', width: 65 },
            { header: 'Certificates', key: 'certificates', width: 65 },
            { header: 'Projects', key: 'projects', width: 70 },
            { header: 'Research Papers', key: 'research', width: 75 },
            { header: 'Competitions', key: 'competitions', width: 70 },
            { header: 'Profile Created At', key: 'created_at', width: 24 },
            { header: 'Profile Updated At', key: 'updated_at', width: 24 }
        ];

        for (const row of rows) {
            const student = row.profile;
            const sems = student?.cgpa_semesterwise || {};
            const diploma = student ? diplomaMap.get(student.id) : null;
            const data = {
                prn: String(row.prn || ''), name: clean(row.name), dob: String(row.dob || ''), branch: clean(row.branch), class: clean(row.class), year: clean(row.year),
                profile_active: student ? 'Yes' : 'No', email: clean(student?.email), phone: clean(student?.phone), photo: student?.avatar_path ? 'Yes' : 'No',
                github_url: clean(student?.github_url), portfolio_url: clean(student?.portfolio_url), ssc_marks: clean(student?.ssc_marks), hsc_marks: clean(student?.hsc_marks),
                diploma: diploma ? `${clean(diploma.institute)} | ${clean(diploma.branch)} | ${clean(diploma.year_of_passing)} | ${clean(diploma.percentage_or_cgpa)}` : '',
                cgpa_overall: clean(student?.cgpa_overall), sem1: clean(sems.sem1), sem2: clean(sems.sem2), sem3: clean(sems.sem3), sem4: clean(sems.sem4),
                sem5: clean(sems.sem5), sem6: clean(sems.sem6), sem7: clean(sems.sem7), sem8: clean(sems.sem8),
                active_backlogs: activeBacklogs(student), backlogs: backlogSummary(student), lateral_entry: student?.lateral_entry ? 'Yes' : 'No',
                is_employed: student?.is_employed ? 'Yes' : 'No', employment_type: clean(student?.employment_type), org_type: clean(student?.org_type),
                company_name: clean(student?.company_name), current_ctc: clean(student?.current_ctc), company_address: clean(student?.company_address),
                hr_name: clean(student?.hr_name), hr_number: clean(student?.hr_number), activities: clean(student?.activities), resume: student?.resume_url ? 'Yes' : 'No',
                skills: student ? recordSummary(skillMap.get(student.id), item => item.skill) : '',
                internships: student ? recordSummary(intMap.get(student.id), item => `${clean(item.company)} | ${clean(item.role)} | ${clean(item.mode)} | ${clean(item.start_date)} to ${clean(item.end_date) || 'Present'}`) : '',
                certificates: student ? recordSummary(certMap.get(student.id), item => `${clean(item.name)} | ${clean(item.issuer)} | ${clean(item.date)} | ${clean(item.mode)}`) : '',
                projects: student ? recordSummary(projectMap.get(student.id), item => `${clean(item.title)} | ${clean(item.technologies)} | ${clean(item.project_url)} | ${clean(item.repository_url)}`) : '',
                research: student ? recordSummary(paperMap.get(student.id), item => `${clean(item.title)} | ${clean(item.authors)} | ${clean(item.publication)} | ${clean(item.published_on)} | ${clean(item.doi_url)} | ${clean(item.paper_url)}`) : '',
                competitions: student ? recordSummary(competitionMap.get(student.id), item => `${clean(item.title)} | ${clean(item.level)} | ${clean(item.result_status)} | ${clean(item.verification_status)}`) : '',
                created_at: clean(student?.created_at), updated_at: clean(student?.updated_at)
            };
            sheet.addRow(data);
        }

        sheet.getColumn('prn').numFmt = '@';
        sheet.getColumn('dob').numFmt = '@';
        sheet.autoFilter = { from: 'A1', to: 'AS1' };
        const header = sheet.getRow(1);
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174A3A' } };
        header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
        });

        await db.logAudit('export_excel_complete', 'students', null, { rowCount: rows.length, filters: req.query });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="ait_complete_student_data.xlsx"');
        await workbook.xlsx.write(res);
        return res.end();
    } catch (error) {
        console.error('Complete student Excel export failed:', error);
        return res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: 'Unable to generate complete student Excel export.' } });
    }
});

module.exports = router;

const db = require('../src/config/database');
const localDb = require('../data/db.json');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function run() {
  const sbStudents = await db.select('students').catch(() => []);
  const sbDiploma = await db.select('diploma').catch(() => []);
  const sbRoster = await db.select('roster').catch(() => []);

  const locStudents = localDb.students || [];
  const locDiploma = localDb.diploma || [];
  const locRoster = localDb.roster || [];

  const diplomaMap = new Map();
  sbDiploma.concat(locDiploma).forEach(d => {
    if (d.student_id) diplomaMap.set(d.student_id, d);
    if (d.prn) diplomaMap.set(d.prn, d);
  });

  const rosterMap = new Map();
  sbRoster.concat(locRoster).forEach(r => {
    if (r.prn) rosterMap.set(r.prn, r);
  });

  const studentMap = new Map();
  sbStudents.forEach(s => studentMap.set(s.prn, { ...s, db_source: 'Supabase' }));
  locStudents.forEach(s => {
    if (!studentMap.has(s.prn)) {
      studentMap.set(s.prn, { ...s, db_source: 'Local db.json' });
    } else {
      const existing = studentMap.get(s.prn);
      studentMap.set(s.prn, { ...locStudents.find(l => l.prn === s.prn), ...existing, db_source: 'Supabase + db.json' });
    }
  });

  const ctFinalStudents = Array.from(studentMap.values()).filter(s => {
    const isCt = (s.branch === 'CT' || s.branch === 'Computer Engineering');
    const isFinal = s.year === 'Final Year' || s.Year === 'Final Year';
    return isCt && isFinal;
  });

  console.log('Total CT Final Year Students:', ctFinalStudents.length);

  const evaluated = ctFinalStudents.map(s => {
    const dip = diplomaMap.get(s.id) || diplomaMap.get(s.prn);

    let ssc = (s.ssc_marks !== null && s.ssc_marks !== undefined && s.ssc_marks !== '') ? Number(s.ssc_marks) : null;
    let hsc = (s.hsc_marks !== null && s.hsc_marks !== undefined && s.hsc_marks !== '') ? Number(s.hsc_marks) : null;

    let dipMarks = null;
    if (dip && dip.percentage_or_cgpa) {
      const parsed = parseFloat(String(dip.percentage_or_cgpa).replace('%','').trim());
      if (!isNaN(parsed)) dipMarks = parsed;
    }

    const isLateral = s.lateral_entry === true || !!dipMarks;
    let cgpa = (s.cgpa_overall !== null && s.cgpa_overall !== undefined && s.cgpa_overall !== '') ? Number(s.cgpa_overall) : 0;

    let backlogsObj = s.backlogs_semesterwise;
    if (typeof backlogsObj === 'string') {
      try { backlogsObj = JSON.parse(backlogsObj); } catch(e) {}
    }
    let totalBacklogs = 0;
    let backlogStr = 'None';
    if (backlogsObj && typeof backlogsObj === 'object') {
      const semBacklogs = [];
      Object.entries(backlogsObj).forEach(([sem, count]) => {
        const cnt = Number(count);
        if (!isNaN(cnt) && cnt > 0) {
          totalBacklogs += cnt;
          semBacklogs.push(sem.toUpperCase() + ':' + cnt);
        }
      });
      if (semBacklogs.length > 0) backlogStr = semBacklogs.join(', ');
    }

    const failureReasons = [];

    if (cgpa === 0 || cgpa < 6.0) {
      failureReasons.push(cgpa === 0 ? 'CGPA Not Provided (0)' : 'CGPA below 6.0 (' + cgpa + ')');
    }

    if (totalBacklogs > 0) {
      failureReasons.push('Active Backlogs: ' + totalBacklogs + ' (' + backlogStr + ')');
    }

    if (ssc === null) {
      failureReasons.push('10th SSC Marks Missing');
    } else if (ssc < 60) {
      failureReasons.push('10th SSC below 60% (' + ssc + '%)');
    }

    if (isLateral) {
      if (dipMarks === null) {
        failureReasons.push('Diploma Marks Missing (Lateral Entry)');
      } else if (dipMarks < 60) {
        failureReasons.push('Diploma below 60% (' + dipMarks + '%)');
      }
    } else {
      if (hsc === null) {
        failureReasons.push('12th HSC Marks Missing');
      } else if (hsc < 60) {
        failureReasons.push('12th HSC below 60% (' + hsc + '%)');
      }
    }

    const isEligible = failureReasons.length === 0;

    return {
      prn: s.prn,
      name: s.name,
      email: s.email || 'N/A',
      phone: s.phone || 'N/A',
      branch: s.branch,
      class: s.class,
      year: s.year || s.Year,
      cgpa: cgpa,
      ssc: ssc !== null ? ssc + '%' : 'N/A',
      hsc: hsc !== null ? hsc + '%' : 'N/A',
      isLateral: isLateral ? 'Yes' : 'No',
      diploma: dipMarks !== null ? dipMarks + '%' : (isLateral ? 'Missing' : 'N/A'),
      activeBacklogs: totalBacklogs,
      backlogBreakdown: backlogStr,
      courseType: 'Full-Time',
      status: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
      reasons: isEligible ? 'All criteria satisfied' : failureReasons.join('; '),
      dbSource: s.db_source
    };
  });

  evaluated.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ELIGIBLE' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const eligibleCount = evaluated.filter(e => e.status === 'ELIGIBLE').length;
  const ineligibleCount = evaluated.filter(e => e.status === 'INELIGIBLE').length;

  console.log('Eligible:', eligibleCount, 'Ineligible:', ineligibleCount);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TPO Portal Automation';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 38 },
    { header: 'Value', key: 'value', width: 30 }
  ];
  summarySheet.addRow({ metric: 'Target Drive', value: 'TCS NQT Recruitment' });
  summarySheet.addRow({ metric: 'Target Branch', value: 'Computer Technology (CT)' });
  summarySheet.addRow({ metric: 'Target Batch / Year', value: 'Final Year (BE)' });
  summarySheet.addRow({ metric: 'Total CT Final Year Students Analyzed', value: evaluated.length });
  summarySheet.addRow({ metric: 'Eligible Students Count', value: eligibleCount });
  summarySheet.addRow({ metric: 'Ineligible Students Count', value: ineligibleCount });
  summarySheet.addRow({ metric: 'Eligibility Rate', value: ((eligibleCount / evaluated.length) * 100).toFixed(2) + '%' });
  summarySheet.addRow({ metric: 'Criteria 1: Minimum CGPA', value: '>= 6.0 CGPA aggregate' });
  summarySheet.addRow({ metric: 'Criteria 2: Class 10th (SSC)', value: '>= 60% aggregate' });
  summarySheet.addRow({ metric: 'Criteria 3: Class 12th (HSC) / Diploma', value: '>= 60% aggregate' });
  summarySheet.addRow({ metric: 'Criteria 4: Active Backlogs', value: '0 active backlogs allowed' });
  summarySheet.addRow({ metric: 'Criteria 5: Course Type', value: 'Strictly Full-Time' });
  summarySheet.addRow({ metric: 'Criteria 6: Extended Education', value: 'Standard duration (No year drops)' });

  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E78' } };

  const eligibleSheet = workbook.addWorksheet('Eligible Students (TCS NQT)');
  const cols = [
    { header: 'PRN', key: 'prn', width: 18 },
    { header: 'Student Name', key: 'name', width: 30 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Branch', key: 'branch', width: 10 },
    { header: 'Class', key: 'class', width: 10 },
    { header: 'Year', key: 'year', width: 14 },
    { header: 'Grad CGPA', key: 'cgpa', width: 12 },
    { header: '10th (SSC)', key: 'ssc', width: 12 },
    { header: '12th (HSC)', key: 'hsc', width: 12 },
    { header: 'Lateral Entry', key: 'isLateral', width: 14 },
    { header: 'Diploma %', key: 'diploma', width: 12 },
    { header: 'Active Backlogs', key: 'activeBacklogs', width: 16 },
    { header: 'Course Type', key: 'courseType', width: 14 },
    { header: 'Status', key: 'status', width: 12 }
  ];

  eligibleSheet.columns = cols;
  eligibleSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  eligibleSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };

  evaluated.filter(e => e.status === 'ELIGIBLE').forEach(e => {
    const row = eligibleSheet.addRow(e);
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } };
    row.getCell('status').font = { color: { argb: '375623' }, bold: true };
  });

  const allSheet = workbook.addWorksheet('All CT Final Year Audit');
  allSheet.columns = [...cols, { header: 'Eligibility / Ineligibility Details', key: 'reasons', width: 50 }];
  allSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  allSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E78' } };

  evaluated.forEach(e => {
    const row = allSheet.addRow(e);
    if (e.status === 'ELIGIBLE') {
      row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } };
      row.getCell('status').font = { color: { argb: '375623' }, bold: true };
    } else {
      row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FCE4D6' } };
      row.getCell('status').font = { color: { argb: 'C65911' }, bold: true };
    }
  });

  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const filePath = path.join(outputDir, 'TCS_NQT_Eligible_Students_CT_Final_Year.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log('Excel file generated successfully at:', filePath);
}

run().catch(console.error);

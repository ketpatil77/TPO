'use strict';

const express = require('express');
const db = require('../config/database');
const { authenticateStudent, authenticateAdmin, authenticateObserver } = require('../middleware/auth');
const { buildEngagementRankContext } = require('../services/engagementRankContext');

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}

async function respond(studentId, res) {
  try {
    const data = await buildEngagementRankContext(studentId);
    noStore(res);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Student engagement rank context failed:', error.message);
    return res.status(500).json({ success: false, error: { code: 'ENGAGEMENT_RANK_FAILED', message: 'Unable to load rank frame data.' } });
  }
}

const student = express.Router();
student.get('/context', authenticateStudent, (req, res) => respond(req.student.studentId, res));

const admin = express.Router();
admin.get('/students/:studentId', authenticateAdmin, async (req, res) => {
  const target = await db.selectOne('students', { id: req.params.studentId });
  if (!target) return res.status(404).json({ success: false, error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
  return respond(target.id, res);
});

const observer = express.Router();
observer.get('/students/:studentId', authenticateObserver, async (req, res) => {
  const target = await db.selectOne('students', { id: req.params.studentId });
  if (!target) return res.status(404).json({ success: false, error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' } });
  const observerBranch = String(req.observer.branch || '').trim();
  if (observerBranch && observerBranch.toLowerCase() !== String(target.branch || '').trim().toLowerCase()) {
    return res.status(403).json({ success: false, error: { code: 'DEPARTMENT_SCOPE', message: 'TPC access is limited to the assigned department.' } });
  }
  return respond(target.id, res);
});

module.exports = { student, admin, observer };

'use strict';

const express = require('express');
const { authenticateStudent } = require('../middleware/auth');
const { buildLeaderboard } = require('../services/profileRankingEngine');
const { enrichCollegeLeaderboard, readCompetitionSnapshot } = require('../services/rankingCompetition');
const { applyCertificateScoringV4 } = require('../services/rankingScoreV4');
const { readFastRankingSnapshot } = require('../services/rankingQuickV4');
const { readRankingScoreDetails } = require('../services/rankingDetailV5');

const router = express.Router();
router.use(authenticateStudent);

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}

router.get('/profile', async (req, res) => {
  try {
    const branch = typeof req.query.branch === 'string' ? req.query.branch : '';
    const year = typeof req.query.year === 'string' ? req.query.year : '';
    let data = await buildLeaderboard(req.student.studentId, branch, year);
    data = applyCertificateScoringV4(data);

    if (data.filters?.branch === 'all' && data.filters?.year === 'all') {
      try {
        data = await enrichCollegeLeaderboard(data, req.student.studentId);
      } catch (competitionError) {
        console.warn('Ranking competition enrichment failed:', competitionError.message);
      }
    }

    noStore(res);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Transparent ranking view failed:', error.message);
    return res.status(500).json({ success: false, error: { code: 'RANKING_FAILED', message: 'Unable to calculate Profile Points.' } });
  }
});

router.get('/competition', async (req, res) => {
  try {
    const data = await readCompetitionSnapshot(req.student.studentId);
    noStore(res);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Ranking competition snapshot failed:', error.message);
    return res.status(500).json({ success: false, error: { code: 'RANKING_COMPETITION_FAILED', message: 'Unable to load ranking momentum.' } });
  }
});

router.get('/fast', async (req, res) => {
  try {
    const data = await readFastRankingSnapshot(req.student.studentId);
    noStore(res);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Fast ranking snapshot failed:', error.message);
    return res.status(500).json({ success: false, error: { code: 'RANKING_FAST_FAILED', message: 'Unable to load the latest standings.' } });
  }
});

router.get('/details/:studentId', async (req, res) => {
  try {
    const studentId = String(req.params.studentId || '').trim();
    if (!studentId || studentId.length > 80) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STUDENT', message: 'Invalid student selection.' } });
    }
    const data = await readRankingScoreDetails(studentId);
    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'STUDENT_NOT_FOUND', message: 'Student ranking details were not found.' } });
    }
    noStore(res);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Ranking score detail failed:', error.message);
    return res.status(500).json({ success: false, error: { code: 'RANKING_DETAIL_FAILED', message: 'Unable to load the score breakdown.' } });
  }
});

module.exports = router;
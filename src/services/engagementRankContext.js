'use strict';

const db = require('../config/database');
const { buildLeaderboard } = require('./profileRankingEngine');
const { applyCertificateScoringV4 } = require('./rankingScoreV4');

function same(a, b) { return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase(); }
function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

function rankWithin(rows, currentStudentId, predicate = () => true) {
  const cohort = (rows || []).filter(predicate).sort((a, b) =>
    numeric(b.points) - numeric(a.points) || numeric(b.potential_points) - numeric(a.potential_points) || String(a.name || '').localeCompare(String(b.name || ''))
  );
  let lastPoints = null;
  let rank = 0;
  for (let index = 0; index < cohort.length; index += 1) {
    const row = cohort[index];
    if (lastPoints === null || numeric(row.points) !== lastPoints) rank = index + 1;
    if (String(row.student_id) === String(currentStudentId)) return { rank, cohort_size: cohort.length };
    lastPoints = numeric(row.points);
  }
  return { rank: null, cohort_size: cohort.length };
}

function selectFrame({ college_rank, branch_rank, class_year_rank }) {
  const triple = college_rank === 1 && branch_rank === 1 && class_year_rank === 1;
  if (triple) return 'triple';
  if (college_rank && college_rank <= 10) return 'gold';
  if (branch_rank === 1) return 'silver';
  if (class_year_rank === 1) return 'bronze';
  return 'none';
}

async function buildEngagementRankContext(studentId) {
  const raw = await buildLeaderboard(studentId, 'all', 'all');
  const leaderboard = applyCertificateScoringV4(raw);
  const current = (leaderboard.rows || []).find(row => String(row.student_id) === String(studentId));
  if (!current) throw new Error('Student ranking profile not found.');

  const branch = rankWithin(leaderboard.rows, studentId, row => same(row.branch, current.branch));
  const hasClass = Boolean(String(current.class || '').trim());
  const classYear = rankWithin(leaderboard.rows, studentId, row =>
    same(row.branch, current.branch) && same(row.year, current.year) && (!hasClass || same(row.class, current.class))
  );
  const state = (await db.select('leaderboard_rank_state', { scope_key: 'college' }))
    .find(row => String(row.student_id) === String(studentId));

  const result = {
    student_id: current.student_id,
    branch: current.branch || '',
    class: current.class || '',
    year: current.year || '',
    points: numeric(current.points),
    college_rank: numeric(current.rank) || null,
    college_size: (leaderboard.rows || []).length,
    branch_rank: branch.rank,
    branch_size: branch.cohort_size,
    class_year_rank: classYear.rank,
    class_year_size: classYear.cohort_size,
    rank_movement: numeric(state?.last_rank_delta),
    frame: 'none'
  };
  result.frame = selectFrame(result);
  return result;
}

module.exports = { rankWithin, selectFrame, buildEngagementRankContext };

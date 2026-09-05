'use strict';

const db = require('../config/database');
const { buildLeaderboard } = require('./profileRankingEngine');
const { applyCertificateScoringV4 } = require('./rankingScoreV4');
const { holdTier, momentum } = require('./rankingCompetition');

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const secondsBetween = (a, b) => Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000) || 0);

function competitionFor(state, liveRow, above, below, now) {
  const effectiveState = state || {};
  const livePoints = num(liveRow?.points);
  const liveRank = num(liveRow?.rank);
  const rankSince = effectiveState.rank_since || now.toISOString();
  const holdSeconds = secondsBetween(rankSince, now);
  const weeklyGain = Math.max(0, livePoints - num(effectiveState.week_start_points ?? livePoints));
  const rankDelta = state ? num(effectiveState.last_rank_delta) : 0;
  const pointDelta = state ? num(effectiveState.last_point_delta) : 0;
  const gapAhead = above ? Math.max(0, num(above.points) - livePoints) : 0;
  const gapBehind = below ? Math.max(0, livePoints - num(below.points)) : 0;
  return {
    movement: rankDelta,
    point_delta: pointDelta,
    weekly_gain: weeklyGain,
    growth_streak_weeks: num(effectiveState.growth_streak_weeks),
    hold_seconds: holdSeconds,
    hold_since: rankSince,
    hold_badge: holdTier(holdSeconds),
    longest_hold_seconds: num(effectiveState.longest_hold_seconds),
    longest_hold_rank: num(effectiveState.longest_hold_rank || liveRank),
    best_rank: num(effectiveState.best_rank || liveRank),
    gap_ahead: gapAhead,
    gap_behind: gapBehind,
    pressure: Boolean(below && gapBehind <= 6),
    safe_lead: Boolean(below && gapBehind >= 20),
    unbeaten: holdSeconds >= 7 * 86400,
    momentum: momentum({ rankDelta, pointDelta, weeklyGain })
  };
}

async function readFastRankingSnapshot(currentStudentId, { now = new Date() } = {}) {
  // The visible leaderboard and the score breakdown must come from the same
  // scoring engine. leaderboard_rank_state is competition history only; it is
  // not authoritative for the current points because verification/profile
  // changes can happen between competition-state reconciliations.
  const [states, liveRaw] = await Promise.all([
    db.select('leaderboard_rank_state', { scope_key: 'college' }),
    buildLeaderboard(currentStudentId, 'all', 'all')
  ]);
  const live = applyCertificateScoringV4(liveRaw);
  const stateByStudent = new Map(states.map(state => [String(state.student_id), state]));
  const liveRows = [...(live.rows || [])].sort((a, b) => num(a.rank) - num(b.rank) || num(b.points) - num(a.points) || String(a.name || '').localeCompare(String(b.name || '')));

  const rows = liveRows.map((row, index) => ({
    student_id: row.student_id,
    name: row.name || 'Student',
    branch: row.branch || '',
    year: row.year || '',
    avatar_url: row.avatar_url || null,
    rank: num(row.rank),
    points: num(row.points),
    is_me: row.student_id === currentStudentId,
    competition: competitionFor(
      stateByStudent.get(String(row.student_id)),
      row,
      index > 0 ? liveRows[index - 1] : null,
      index + 1 < liveRows.length ? liveRows[index + 1] : null,
      now
    )
  }));

  return {
    scope: 'college',
    current: rows.find(row => row.student_id === currentStudentId) || null,
    rows,
    generated_at: now.toISOString()
  };
}

module.exports = { readFastRankingSnapshot };

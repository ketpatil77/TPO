'use strict';

const db = require('../config/database');
const { holdTier, momentum, nearestDifferentRank } = require('./rankingCompetition');

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const secondsBetween = (a, b) => Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000) || 0);

async function signedAvatarMap(students) {
  if (db.isLocal()) return new Map();
  const withAvatar = students.filter(student => student.avatar_path);
  if (!withAvatar.length) return new Map();
  try {
    const paths = withAvatar.map(student => student.avatar_path);
    const { data, error } = await db.supabaseClient().storage.from('avatars').createSignedUrls(paths, 3600);
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((item, index) => {
      if (item?.signedUrl) map.set(withAvatar[index].id, item.signedUrl);
    });
    return map;
  } catch (error) {
    console.warn('Fast ranking avatar signing failed:', error.message);
    return new Map();
  }
}

function competitionFor(state, above, below, now) {
  const holdSeconds = secondsBetween(state.rank_since, now);
  const weeklyGain = Math.max(0, num(state.current_points) - num(state.week_start_points));
  const rankDelta = num(state.last_rank_delta);
  const pointDelta = num(state.last_point_delta);
  const gapAhead = above ? Math.max(0, num(above.current_points) - num(state.current_points)) : 0;
  const gapBehind = below ? Math.max(0, num(state.current_points) - num(below.current_points)) : 0;
  return {
    movement: rankDelta,
    point_delta: pointDelta,
    weekly_gain: weeklyGain,
    growth_streak_weeks: num(state.growth_streak_weeks),
    hold_seconds: holdSeconds,
    hold_since: state.rank_since,
    hold_badge: holdTier(holdSeconds),
    longest_hold_seconds: num(state.longest_hold_seconds),
    longest_hold_rank: num(state.longest_hold_rank || state.current_rank),
    best_rank: num(state.best_rank || state.current_rank),
    gap_ahead: gapAhead,
    gap_behind: gapBehind,
    pressure: Boolean(below && gapBehind <= 6),
    safe_lead: Boolean(below && gapBehind >= 20),
    unbeaten: holdSeconds >= 7 * 86400,
    momentum: momentum({ rankDelta, pointDelta, weeklyGain })
  };
}

async function readFastRankingSnapshot(currentStudentId, { now = new Date() } = {}) {
  const [states, students] = await Promise.all([
    db.select('leaderboard_rank_state', { scope_key: 'college' }),
    db.select('students')
  ]);
  const studentById = new Map(students.map(student => [student.id, student]));
  const activeStates = states
    .filter(state => studentById.get(state.student_id)?.status !== 'inactive')
    .sort((a, b) => num(a.current_rank) - num(b.current_rank) || num(b.current_points) - num(a.current_points) || String(studentById.get(a.student_id)?.name || '').localeCompare(String(studentById.get(b.student_id)?.name || '')));
  const activeStudents = activeStates.map(state => studentById.get(state.student_id)).filter(Boolean);
  const avatars = await signedAvatarMap(activeStudents);

  const rows = activeStates.map((state, index) => {
    const student = studentById.get(state.student_id) || {};
    const above = nearestDifferentRank(activeStates, index, -1);
    const below = nearestDifferentRank(activeStates, index, 1);
    return {
      student_id: state.student_id,
      name: student.name || 'Student',
      branch: student.branch || '',
      year: student.year || '',
      avatar_url: avatars.get(state.student_id) || null,
      rank: num(state.current_rank),
      points: num(state.current_points),
      is_me: state.student_id === currentStudentId,
      competition: competitionFor(state, above, below, now)
    };
  });

  return {
    scope: 'college',
    current: rows.find(row => row.student_id === currentStudentId) || null,
    rows,
    generated_at: now.toISOString()
  };
}

module.exports = { readFastRankingSnapshot };

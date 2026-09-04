'use strict';

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function certificatePointAtV4(index) {
  return index < 10 ? 2 : 1.5;
}

function certificateTotalV4(count) {
  const n = Math.max(0, Number(count) || 0);
  return money(Math.min(n, 10) * 2 + Math.max(0, n - 10) * 1.5);
}

function adjustCertificateExplanations(row, verifiedCount, pendingCount) {
  const earned = Array.isArray(row.explanations?.certificates) ? row.explanations.certificates : [];
  const pending = Array.isArray(row.pending_explanations?.certificates) ? row.pending_explanations.certificates : [];

  earned.forEach((item, index) => {
    item.points = certificatePointAtV4(index);
    item.reason = `${String(item.reason || '').split(' · ')[0] || 'Issuer'} · verified certificate #${index + 1}.`;
  });

  pending.forEach((item, index) => {
    item.points = certificatePointAtV4(verifiedCount + index);
  });

  return { earned, pending };
}

function applyCertificateScoringV4(data) {
  if (!data || !Array.isArray(data.rows)) return data;

  const rows = data.rows.map(original => {
    const row = { ...original };
    row.breakdown = { ...(original.breakdown || {}) };
    row.pending_breakdown = { ...(original.pending_breakdown || {}) };
    row.explanations = { ...(original.explanations || {}) };
    row.pending_explanations = { ...(original.pending_explanations || {}) };

    const verifiedCount = Number(original.certificate_counts?.verified || 0);
    const pendingCount = Number(original.certificate_counts?.pending || 0);
    const oldEarned = Number(original.breakdown?.certificates || 0);
    const oldPending = Number(original.pending_breakdown?.certificates || 0);
    const newEarned = certificateTotalV4(verifiedCount);
    const newPotentialTotal = certificateTotalV4(verifiedCount + pendingCount);
    const newPending = money(newPotentialTotal - newEarned);

    row.breakdown.certificates = newEarned;
    row.pending_breakdown.certificates = newPending;
    row.points = money(Number(original.points || 0) - oldEarned + newEarned);
    row.pending_points = money(Number(original.pending_points || 0) - oldPending + newPending);
    row.potential_points = money(row.points + row.pending_points);

    const adjusted = adjustCertificateExplanations(row, verifiedCount, pendingCount);
    row.explanations.certificates = adjusted.earned;
    row.pending_explanations.certificates = adjusted.pending;
    return row;
  }).sort((a, b) => b.points - a.points || b.potential_points - a.potential_points || String(a.name || '').localeCompare(String(b.name || '')));

  let lastScore = null;
  let lastRank = 0;
  rows.forEach((row, index) => {
    if (lastScore === null || row.points !== lastScore) lastRank = index + 1;
    row.rank = lastRank;
    lastScore = row.points;
  });

  const rules = { ...(data.rules || {}) };
  rules.version = '2026-27 v4.0';
  rules.certificates = 'Verified certificates only: first 10 verified certificates = 2 points each; every verified certificate after the first 10 = 1.5 points each. Pending/rejected certificates = 0 until verification.';

  return {
    ...data,
    rows,
    current: rows.find(row => row.is_me) || rows.find(row => row.student_id === data.current?.student_id) || null,
    rules
  };
}

module.exports = {
  certificatePointAtV4,
  certificateTotalV4,
  applyCertificateScoringV4
};

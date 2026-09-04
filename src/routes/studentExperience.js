const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');
const { scoreCandidate } = require('../utils/matching');
const { callGroqJson } = require('../utils/groqClient');
const experienceModel = require('../utils/studentExperienceModel');

const student = express.Router();
const publicRouter = express.Router();
student.use(authenticateStudent);

function cleanActivity(item) {
  return {
    id: item.id,
    action: item.action,
    category: item.category,
    summary: item.summary,
    changed_fields: item.changed_fields || [],
    created_at: item.created_at
  };
}

async function loadStudentBundle(studentId) {
  const [
    profile,
    internships,
    certificates,
    projects,
    research,
    skills,
    competitions,
    corrections,
    activities,
    drives,
    criteria,
    applications
  ] = await Promise.all([
    db.selectOne('students', { id: studentId }),
    db.select('internships', { student_id: studentId }),
    db.select('certificates', { student_id: studentId }),
    db.select('student_projects', { student_id: studentId }),
    db.select('research_papers', { student_id: studentId }),
    db.select('student_skills', { student_id: studentId }),
    db.select('student_competitions', { student_id: studentId }),
    db.select('correction_requests', { student_id: studentId }),
    db.select('student_activity_log', { student_id: studentId }).catch(() => []),
    db.select('placement_drives'),
    db.select('drive_criteria'),
    db.select('drive_applications', { student_id: studentId })
  ]);

  if (!profile) return null;

  const bundle = {
    student: profile,
    internships: internships || [],
    certificates: certificates || [],
    projects: projects || [],
    research_papers: research || [],
    skills: skills || [],
    competitions: competitions || [],
    links: {
      github_url: profile.github_url || '',
      portfolio_url: profile.portfolio_url || ''
    }
  };

  const fullCandidate = {
    ...profile,
    internships: bundle.internships,
    certificates: bundle.certificates,
    projects: bundle.projects,
    research_papers: bundle.research_papers,
    skills: bundle.skills
  };

  const opportunities = (drives || [])
    .filter(drive => drive.status !== 'draft')
    .map(drive => {
      const rule = (criteria || []).find(item => item.drive_id === drive.id);
      const eligibility = rule
        ? scoreCandidate(fullCandidate, rule)
        : { eligible: false, reasons: ['Criteria not confirmed.'], score: 0, matched_skills: [], missing_required: [] };
      return {
        id: drive.id,
        company: drive.company,
        role: drive.role,
        status: drive.status,
        deadline: drive.application_deadline || null,
        eligibility,
        criteria: rule || null,
        application: (applications || []).find(item => item.drive_id === drive.id) || null
      };
    })
    .sort((a, b) => Number(b.eligibility?.score || 0) - Number(a.eligibility?.score || 0));

  const sortedActivity = (activities || [])
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 12)
    .map(cleanActivity);

  const readiness = experienceModel.calculateReadiness(bundle);
  const completion = experienceModel.profileCompletion(bundle);
  const nextAction = experienceModel.nextBestAction({ bundle, corrections, opportunities });
  const strength = experienceModel.strengthMap(bundle);
  const achievements = experienceModel.achievements({ bundle, readiness });

  return {
    bundle,
    opportunities: opportunities.slice(0, 12),
    corrections: (corrections || []).filter(item => item.status === 'open').slice(0, 12),
    activity: sortedActivity,
    readiness,
    completion,
    next_action: nextAction,
    strength,
    achievements
  };
}

student.get('/home', async (req, res) => {
  try {
    const data = await loadStudentBundle(req.student.studentId);
    if (!data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Student experience home failed:', error.message);
    res.status(500).json({ success: false, error: { code: 'EXPERIENCE_HOME_FAILED', message: 'Could not load the student command center.' } });
  }
});

const copilotSchema = z.object({
  question: z.string().trim().min(2).max(800)
}).strict();

function deterministicCopilot(question, home) {
  const lower = question.toLowerCase();
  const readiness = home.readiness;
  const weakest = Object.values(readiness.breakdown).sort((a, b) => (a.score / a.max) - (b.score / b.max))[0];
  const bestOpportunity = home.opportunities.find(item => item.status === 'open');
  let answer = `${home.next_action.title}. ${home.next_action.detail}`;
  const actions = [{ label: home.next_action.title, tab: home.next_action.tab }];

  if (/readiness|score|improve|weak/.test(lower)) {
    answer = `Your career readiness is ${readiness.score}/100. The weakest area is ${weakest.label} at ${weakest.score}/${weakest.max}. Improve that first, then review the next lowest category.`;
  } else if (/job|drive|opportun|match|skill.*missing|missing.*skill/.test(lower) && bestOpportunity) {
    const missing = bestOpportunity.eligibility?.missing_required || [];
    answer = `${bestOpportunity.company || 'Your strongest current drive'} ${bestOpportunity.role ? `for ${bestOpportunity.role} ` : ''}is your best visible match at ${bestOpportunity.eligibility?.score || 0}%. ${missing.length ? `Missing required skills: ${missing.join(', ')}.` : 'Your required-skill coverage is currently complete for this drive.'}`;
    actions.unshift({ label: 'Open opportunities', tab: 'opportunities' });
  } else if (/resume|ats/.test(lower)) {
    answer = home.bundle.student.resume_url
      ? 'Your resume is uploaded. Keep it aligned with the role you are targeting, quantify outcomes, and make sure the skills shown in your profile also appear naturally in the resume.'
      : 'Your resume is currently missing. Uploading it is the highest-value resume action because it unlocks ATS analysis and recruiter review.';
    actions.unshift({ label: 'Open profile', tab: 'edit-profile' });
  } else if (/rank|leaderboard|point/.test(lower)) {
    answer = 'Profile Points reward academics, verified credentials, projects, research, internships, skills, and profile completeness. Open Ranking for the exact audited point breakdown instead of guessing which activity matters.';
    actions.unshift({ label: 'Open ranking', tab: 'ranking' });
  }

  return { answer, actions: actions.slice(0, 3), source: 'rules' };
}

student.post('/copilot', validate(copilotSchema), async (req, res) => {
  try {
    const home = await loadStudentBundle(req.student.studentId);
    if (!home) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } });

    const safeContext = {
      branch: home.bundle.student.branch,
      year: home.bundle.student.student?.year || home.bundle.student.year,
      cgpa: home.bundle.student.cgpa_overall,
      readiness: home.readiness,
      skills: home.bundle.skills.map(item => item.skill).slice(0, 30),
      internships: home.bundle.internships.map(item => ({ company: item.company, role: item.role })).slice(0, 8),
      projects: home.bundle.projects.map(item => ({ title: item.title, technologies: item.technologies })).slice(0, 8),
      opportunities: home.opportunities.slice(0, 5).map(item => ({
        company: item.company,
        role: item.role,
        score: item.eligibility?.score,
        eligible: item.eligibility?.eligible,
        missing_required: item.eligibility?.missing_required
      })),
      next_action: home.next_action
    };

    const systemPrompt = `You are AIT Placement Portal Career Copilot. Give concise, practical university placement guidance using ONLY the supplied student career context. Never invent jobs, scores, credentials or eligibility. Keep the answer under 140 words. Return JSON exactly as {"answer":"string","actions":[{"label":"string","tab":"overview|edit-profile|internships|certificates|projects|research|opportunities|ranking"}]}.`;
    const userPrompt = `Student career context:\n${JSON.stringify(safeContext)}\n\nQuestion: ${req.body.question}`;
    const ai = await callGroqJson(systemPrompt, userPrompt, { temperature: 0.2, maxTokens: 500 });
    const fallback = deterministicCopilot(req.body.question, home);
    const response = ai && typeof ai.answer === 'string'
      ? { answer: ai.answer.slice(0, 2000), actions: Array.isArray(ai.actions) ? ai.actions.slice(0, 3) : [], source: 'ai' }
      : fallback;
    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Career copilot failed:', error.message);
    res.status(500).json({ success: false, error: { code: 'COPILOT_FAILED', message: 'Career Copilot is temporarily unavailable.' } });
  }
});

student.post('/share', async (req, res) => {
  try {
    const profile = await db.selectOne('students', { id: req.student.studentId });
    if (!profile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } });
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(503).json({ success: false, error: { code: 'SHARE_UNAVAILABLE', message: 'Profile sharing is not configured.' } });
    const token = jwt.sign({ type: 'student-public-profile', studentId: profile.id }, secret, { expiresIn: '30d' });
    res.json({ success: true, data: { token, path: `/public-profile.html?t=${encodeURIComponent(token)}`, expires_in_days: 30 } });
  } catch (error) {
    console.error('Public profile share failed:', error.message);
    res.status(500).json({ success: false, error: { code: 'SHARE_FAILED', message: 'Could not create a public profile link.' } });
  }
});

function verifyPublicToken(value) {
  const secret = process.env.JWT_SECRET;
  if (!secret || !value) return null;
  try {
    const payload = jwt.verify(String(value), secret);
    return payload?.type === 'student-public-profile' && payload.studentId ? payload : null;
  } catch (_) {
    return null;
  }
}

async function publicProfile(studentId) {
  const [profile, internships, certificates, projects, research, skills, competitions] = await Promise.all([
    db.selectOne('students', { id: studentId }),
    db.select('internships', { student_id: studentId }),
    db.select('certificates', { student_id: studentId }),
    db.select('student_projects', { student_id: studentId }),
    db.select('research_papers', { student_id: studentId }),
    db.select('student_skills', { student_id: studentId }),
    db.select('student_competitions', { student_id: studentId })
  ]);
  if (!profile) return null;

  const verified = item => ['verified', 'approved'].includes(String(item?.verification_status || '').toLowerCase());
  const safeBundle = {
    student: {
      name: profile.name,
      branch: profile.branch,
      class: profile.class,
      year: profile.year,
      cgpa_overall: profile.cgpa_overall,
      activities: profile.activities,
      resume_url: profile.resume_url,
      github_url: profile.github_url,
      portfolio_url: profile.portfolio_url
    },
    internships: (internships || []).filter(item => !item.verification_status || verified(item)).map(item => ({
      company: item.company, role: item.role, start_date: item.start_date, end_date: item.end_date, mode: item.mode
    })),
    certificates: (certificates || []).filter(verified).map(item => ({ name: item.name, issuer: item.issuer, date: item.date, mode: item.mode })),
    projects: (projects || []).map(item => ({ title: item.title, summary: item.summary, technologies: item.technologies, project_url: item.project_url, repository_url: item.repository_url, completed_on: item.completed_on })),
    research_papers: (research || []).map(item => ({ title: item.title, authors: item.authors, publication: item.publication, published_on: item.published_on, abstract: item.abstract, doi_url: item.doi_url, paper_url: item.paper_url })),
    skills: (skills || []).map(item => ({ skill: item.skill })),
    competitions: (competitions || []).filter(verified).map(item => ({ title: item.title, level: item.level, result_status: item.result_status, event_date: item.event_date })),
    links: { github_url: profile.github_url || '', portfolio_url: profile.portfolio_url || '' }
  };
  const readiness = experienceModel.calculateReadiness(safeBundle);
  return {
    student: safeBundle.student,
    internships: safeBundle.internships,
    certificates: safeBundle.certificates,
    projects: safeBundle.projects,
    research_papers: safeBundle.research_papers,
    skills: safeBundle.skills,
    competitions: safeBundle.competitions,
    readiness,
    achievements: experienceModel.achievements({ bundle: safeBundle, readiness }),
    resume_available: Boolean(profile.resume_url)
  };
}

publicRouter.get('/profile', async (req, res) => {
  const payload = verifyPublicToken(req.query.token);
  if (!payload) return res.status(401).json({ success: false, error: { code: 'INVALID_SHARE', message: 'This profile link is invalid or expired.' } });
  try {
    const data = await publicProfile(payload.studentId);
    if (!data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Public profile read failed:', error.message);
    res.status(500).json({ success: false, error: { code: 'PUBLIC_PROFILE_FAILED', message: 'Could not load this public profile.' } });
  }
});

publicRouter.get('/resume', async (req, res) => {
  const payload = verifyPublicToken(req.query.token);
  if (!payload) return res.status(401).json({ success: false, error: { code: 'INVALID_SHARE', message: 'This profile link is invalid or expired.' } });
  try {
    const profile = await db.selectOne('students', { id: payload.studentId });
    if (!profile?.resume_url) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resume is not available.' } });
    if (db.isLocal()) return res.status(503).json({ success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Resume preview requires connected storage.' } });
    const { data, error } = await db.supabaseClient().storage.from('resumes').createSignedUrl(profile.resume_url, 120);
    if (error) throw error;
    res.json({ success: true, data: { url: data.signedUrl, expires_in: 120 } });
  } catch (error) {
    console.error('Public resume link failed:', error.message);
    res.status(500).json({ success: false, error: { code: 'PUBLIC_RESUME_FAILED', message: 'Could not open the shared resume.' } });
  }
});

module.exports = { student, public: publicRouter, loadStudentBundle, deterministicCopilot };

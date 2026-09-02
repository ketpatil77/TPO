const express = require('express');
const multer = require('multer');
const { createHash } = require('crypto');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateStudent);

const MAX_EVIDENCE_BYTES = 400 * 1024;
const STUDENT_EVIDENCE_QUOTA_BYTES = 15 * 1024 * 1024;
const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 }
});

function bucket() {
  return globalThis.cloudflareEnv?.CERTIFICATE_EVIDENCE || null;
}

function clearStudentCache() {
  try {
    const adminStudentsRouter = require('./adminStudents');
    adminStudentsRouter.clearStudentCache?.();
  } catch (_) {
    // Cache invalidation is non-critical for evidence operations.
  }
}

function sniffMime(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'image/png';
  return null;
}

function uploadOne(req, res, next) {
  upload.single('evidence')(req, res, error => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: { code: 'CERTIFICATE_IMAGE_TOO_LARGE', message: 'Optimized certificate image must be 400 KB or smaller.' }
      });
    }
    if (error) return next(error);
    next();
  });
}

async function ownedCertificate(studentId, certificateId) {
  return db.selectOne('certificates', { id: certificateId, student_id: studentId });
}

function publicEvidenceMeta(certificate) {
  return {
    id: certificate.id,
    has_evidence: Boolean(certificate.evidence_path),
    evidence_mime: certificate.evidence_mime || null,
    evidence_bytes: Number(certificate.evidence_bytes || 0),
    evidence_uploaded_at: certificate.evidence_uploaded_at || null
  };
}

router.get('/certificate-evidence/status', async (req, res) => {
  try {
    const rows = await db.select('certificates', { student_id: req.student.studentId });
    const items = (rows || []).map(publicEvidenceMeta);
    const usedBytes = items.reduce((sum, item) => sum + item.evidence_bytes, 0);
    res.json({
      success: true,
      data: {
        storage_ready: Boolean(bucket()),
        max_file_bytes: MAX_EVIDENCE_BYTES,
        quota_bytes: STUDENT_EVIDENCE_QUOTA_BYTES,
        used_bytes: usedBytes,
        remaining_bytes: Math.max(0, STUDENT_EVIDENCE_QUOTA_BYTES - usedBytes),
        certificates: items
      }
    });
  } catch (error) {
    console.error('Certificate evidence status failed:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Could not load certificate proof status.' } });
  }
});

router.post('/certificate-evidence/:id', uploadOne, async (req, res) => {
  const evidenceBucket = bucket();
  if (!evidenceBucket) {
    return res.status(503).json({
      success: false,
      error: { code: 'CERTIFICATE_STORAGE_NOT_CONFIGURED', message: 'Certificate storage is not configured yet.' }
    });
  }

  try {
    const studentId = req.student.studentId;
    const certificate = await ownedCertificate(studentId, req.params.id);
    if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
    if (!req.file?.buffer) return res.status(400).json({ success: false, error: { code: 'IMAGE_REQUIRED', message: 'Choose a JPG, JPEG, or PNG certificate image.' } });

    const actualMime = sniffMime(req.file.buffer);
    if (!actualMime || !ACCEPTED_MIME.has(actualMime)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_IMAGE', message: 'Only real JPG, JPEG, or PNG certificate images are accepted. PDF files are not supported.' } });
    }
    if (req.file.size > MAX_EVIDENCE_BYTES) {
      return res.status(413).json({ success: false, error: { code: 'CERTIFICATE_IMAGE_TOO_LARGE', message: 'Optimized certificate image must be 400 KB or smaller.' } });
    }

    const allCertificates = await db.select('certificates', { student_id: studentId });
    const currentBytes = Number(certificate.evidence_bytes || 0);
    const usedExcludingCurrent = (allCertificates || []).reduce((sum, item) => sum + Number(item.evidence_bytes || 0), 0) - currentBytes;
    if (usedExcludingCurrent + req.file.size > STUDENT_EVIDENCE_QUOTA_BYTES) {
      return res.status(413).json({
        success: false,
        error: { code: 'CERTIFICATE_STORAGE_QUOTA', message: 'Your 15 MB certificate proof storage quota is full. Remove or replace older proof files.' }
      });
    }

    const sha256 = createHash('sha256').update(req.file.buffer).digest('hex');
    if (certificate.evidence_sha256 === sha256 && certificate.evidence_path) {
      return res.json({ success: true, data: publicEvidenceMeta(certificate), message: 'This certificate proof is already uploaded.' });
    }

    const extension = actualMime === 'image/png' ? 'png' : 'jpg';
    const objectPath = `certificates/${studentId}/${certificate.id}.${extension}`;
    await evidenceBucket.put(objectPath, req.file.buffer, {
      httpMetadata: { contentType: actualMime, cacheControl: 'private, no-store' },
      customMetadata: { student_id: studentId, certificate_id: certificate.id, sha256 }
    });

    let updated;
    try {
      updated = await db.update('certificates', { id: certificate.id, student_id: studentId }, {
        evidence_path: objectPath,
        evidence_mime: actualMime,
        evidence_bytes: req.file.size,
        evidence_sha256: sha256,
        evidence_uploaded_at: new Date().toISOString()
      });
    } catch (error) {
      await evidenceBucket.delete(objectPath).catch(() => {});
      throw error;
    }

    if (certificate.evidence_path && certificate.evidence_path !== objectPath) {
      await evidenceBucket.delete(certificate.evidence_path).catch(error => console.warn('Old certificate proof cleanup failed:', error?.message || error));
    }
    clearStudentCache();
    res.json({ success: true, data: publicEvidenceMeta(updated), message: certificate.evidence_path ? 'Certificate proof replaced.' : 'Certificate proof uploaded.' });
  } catch (error) {
    console.error('Certificate evidence upload failed:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Could not upload certificate proof.' } });
  }
});

router.get('/certificate-evidence/:id', async (req, res) => {
  const evidenceBucket = bucket();
  if (!evidenceBucket) return res.status(503).json({ success: false, error: { code: 'CERTIFICATE_STORAGE_NOT_CONFIGURED', message: 'Certificate storage is not configured yet.' } });

  try {
    const certificate = await ownedCertificate(req.student.studentId, req.params.id);
    if (!certificate?.evidence_path) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate proof has not been uploaded.' } });
    const object = await evidenceBucket.get(certificate.evidence_path);
    if (!object) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate proof file is unavailable.' } });

    res.setHeader('Content-Type', certificate.evidence_mime || 'image/jpeg');
    res.setHeader('Content-Length', String(object.size || certificate.evidence_bytes || ''));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Content-Disposition', 'inline');
    const bytes = Buffer.from(await object.arrayBuffer());
    res.end(bytes);
  } catch (error) {
    console.error('Certificate evidence read failed:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Could not open certificate proof.' } });
  }
});

router.delete('/certificate-evidence/:id', async (req, res) => {
  try {
    const studentId = req.student.studentId;
    const certificate = await ownedCertificate(studentId, req.params.id);
    if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate not found.' } });
    if (!certificate.evidence_path) return res.json({ success: true, data: { removed: false }, message: 'No certificate proof was stored.' });

    const oldPath = certificate.evidence_path;
    await db.update('certificates', { id: certificate.id, student_id: studentId }, {
      evidence_path: null,
      evidence_mime: null,
      evidence_bytes: null,
      evidence_sha256: null,
      evidence_uploaded_at: null
    });
    await bucket()?.delete(oldPath).catch(error => console.warn('Certificate proof orphan cleanup failed:', error?.message || error));
    clearStudentCache();
    res.json({ success: true, data: { removed: true }, message: 'Certificate proof removed.' });
  } catch (error) {
    console.error('Certificate evidence delete failed:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Could not remove certificate proof.' } });
  }
});

// Shadow the legacy certificate delete route so R2 proof is cleaned up with the record.
router.delete('/certificates/:id', async (req, res) => {
  try {
    const studentId = req.student.studentId;
    const certificate = await ownedCertificate(studentId, req.params.id);
    if (!certificate) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Certificate record not found.' } });

    await db.delete('certificates', { id: certificate.id, student_id: studentId });
    if (certificate.evidence_path) {
      await bucket()?.delete(certificate.evidence_path).catch(error => console.warn('Deleted certificate left an R2 orphan:', error?.message || error));
    }
    clearStudentCache();
    res.json({ success: true, message: 'Certificate deleted successfully.' });
  } catch (error) {
    console.error('Certificate delete with evidence cleanup failed:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to delete certificate.' } });
  }
});

module.exports = router;

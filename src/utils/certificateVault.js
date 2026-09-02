const { createHash } = require('node:crypto');

const MAX_CERTIFICATE_BYTES = 400 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getVaultBucket() {
    return globalThis.cloudflareEnv?.CERTIFICATE_VAULT || null;
}

function isVaultConfigured() {
    return Boolean(getVaultBucket());
}

function detectImageMime(buffer) {
    if (!buffer || buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) return 'image/png';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}

function extensionForMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg') return 'jpg';
    return 'webp';
}

function hashBuffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function buildEvidencePath(studentId, certificateId, mime) {
    return `certificates/${studentId}/${certificateId}.${extensionForMime(mime)}`;
}

async function putCertificateEvidence({ studentId, certificateId, buffer, mime, previousPath = null }) {
    const bucket = getVaultBucket();
    if (!bucket) {
        const error = new Error('Certificate Vault R2 binding is not configured.');
        error.code = 'VAULT_NOT_CONFIGURED';
        throw error;
    }
    if (!ALLOWED_MIME_TYPES.has(mime)) {
        const error = new Error('Only JPG, JPEG, PNG or optimized WebP certificate images are allowed.');
        error.code = 'INVALID_IMAGE_TYPE';
        throw error;
    }
    if (!buffer?.length || buffer.length > MAX_CERTIFICATE_BYTES) {
        const error = new Error('Optimized certificate image must be 400 KB or smaller.');
        error.code = 'CERTIFICATE_TOO_LARGE';
        throw error;
    }

    const sha256 = hashBuffer(buffer);
    const path = buildEvidencePath(studentId, certificateId, mime);
    await bucket.put(path, buffer, {
        httpMetadata: {
            contentType: mime,
            cacheControl: 'private, no-store, max-age=0'
        },
        customMetadata: {
            studentId: String(studentId),
            certificateId: String(certificateId),
            sha256
        }
    });

    if (previousPath && previousPath !== path) {
        try { await bucket.delete(previousPath); }
        catch (error) { console.warn('Old certificate evidence cleanup failed:', error.message); }
    }

    return { path, mime, size: buffer.length, sha256 };
}

async function getCertificateEvidence(path) {
    const bucket = getVaultBucket();
    if (!bucket || !path) return null;
    return bucket.get(path);
}

async function deleteCertificateEvidence(path) {
    if (!path) return false;
    const bucket = getVaultBucket();
    if (!bucket) {
        const error = new Error('Certificate Vault R2 binding is not configured.');
        error.code = 'VAULT_NOT_CONFIGURED';
        throw error;
    }
    await bucket.delete(path);
    return true;
}

module.exports = {
    MAX_CERTIFICATE_BYTES,
    ALLOWED_MIME_TYPES,
    isVaultConfigured,
    detectImageMime,
    putCertificateEvidence,
    getCertificateEvidence,
    deleteCertificateEvidence
};

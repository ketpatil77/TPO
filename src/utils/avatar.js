const multer = require('multer');
const db = require('../config/database');

const MAX_AVATAR_BYTES = 1024 * 1024;
const AVATAR_REDIRECT_SIGNED_SECONDS = 21600;
const AVATAR_REDIRECT_CACHE_SECONDS = 14400;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_AVATAR_BYTES,
        files: 1,
        fields: 0,
        parts: 2,
        fieldNestingDepth: 0,
        fieldArrayIndexLimit: 0
    }
});

function acceptAvatar(req, res, next) {
    upload.single('avatar')(req, res, err => {
        if (err?.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, error: { code: 'IMAGE_TOO_LARGE', message: 'Profile picture must be under 1 MB.' } });
        }
        if (err) return next(err);
        return next();
    });
}

function detectImage(file) {
    if (!file?.buffer?.length) return null;
    const bytes = file.buffer;
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (png && file.mimetype === 'image/png') return { extension: 'png', contentType: 'image/png' };
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (jpeg && ['image/jpeg', 'image/jpg'].includes(file.mimetype)) return { extension: 'jpg', contentType: 'image/jpeg' };
    return null;
}

async function uploadAvatar(req, res, owner) {
    if (req.file?.size >= MAX_AVATAR_BYTES) {
        return res.status(413).json({ success: false, error: { code: 'IMAGE_TOO_LARGE', message: 'Profile picture must be under 1 MB.' } });
    }
    const image = detectImage(req.file);
    if (!image) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_IMAGE', message: 'Valid JPG, JPEG, or PNG profile picture required.' } });
    }
    const vault = globalThis.cloudflareEnv?.CERTIFICATE_VAULT || globalThis.cloudflareEnv?.RESUME_VAULT;
    if (!vault && db.isLocal()) {
        return res.status(503).json({ success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Profile picture storage requires R2 or Supabase.' } });
    }
    const record = await db.selectOne(owner.table, owner.filter);
    if (!record) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const version = Date.now();
    const path = `${owner.folder}/${owner.id}/avatar_v${version}.${image.extension}`;
    
    if (vault) {
        if (record.avatar_path) await vault.delete(record.avatar_path).catch(() => {});
        await vault.put(path, req.file.buffer, { httpMetadata: { contentType: image.contentType, cacheControl: 'public, max-age=31536000, immutable' } });
    } else {
        const storage = db.supabaseClient().storage.from('avatars');
        if (record.avatar_path && record.avatar_path !== path) await storage.remove([record.avatar_path]).catch(() => {});
        const { error } = await storage.upload(path, req.file.buffer, { contentType: image.contentType, upsert: true, cacheControl: '86400' });
        if (error) throw error;
    }
    
    await db.update(owner.table, owner.filter, { avatar_path: path });
    await db.logAudit('avatar_update', owner.table, owner.id, { role: owner.folder });
    return signedAvatar(res, path);
}

async function getAvatar(res, owner) {
    const record = await db.selectOne(owner.table, owner.filter);
    if (!record?.avatar_path) return res.json({ success: true, data: { url: null } });
    return signedAvatar(res, record.avatar_path);
}

async function deleteAvatar(res, owner) {
    const record = await db.selectOne(owner.table, owner.filter);
    if (!record) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const vault = globalThis.cloudflareEnv?.CERTIFICATE_VAULT || globalThis.cloudflareEnv?.RESUME_VAULT;
    if (record.avatar_path) {
        if (vault) {
            await vault.delete(record.avatar_path).catch(() => {});
        } else if (!db.isLocal()) {
            await db.supabaseClient().storage.from('avatars').remove([record.avatar_path]).catch(() => {});
        }
    }
    await db.update(owner.table, owner.filter, { avatar_path: null });
    await db.logAudit('avatar_remove', owner.table, owner.id, { role: owner.folder });
    return res.json({ success: true, data: { removed: true } });
}

async function signedAvatar(res, path) {
    const isD1 = process.env.USE_D1_BACKEND === 'true' || globalThis.cloudflareEnv?.USE_D1_BACKEND === 'true';
    const vault = globalThis.cloudflareEnv?.CERTIFICATE_VAULT || globalThis.cloudflareEnv?.RESUME_VAULT;
    if (isD1 || vault) {
        return res.json({ success: true, data: { url: `/api/student/student-avatars/${encodeURIComponent(res.req?.student?.studentId || path)}`, expires_in: 86400 } });
    }
    if (db.isLocal()) {
        return res.json({ success: true, data: { url: `https://ui-avatars.com/api/?name=Local+User&background=random`, expires_in: 3600 } });
    }
    const { data, error } = await db.supabaseClient().storage.from('avatars').createSignedUrl(path, 86400);
    if (error) throw error;
    return res.json({ success: true, data: { url: data.signedUrl, expires_in: 86400 } });
}

async function redirectAvatar(res, path) {
    if (!path) return res.status(404).send('Profile picture not uploaded.');
    const isD1 = process.env.USE_D1_BACKEND === 'true' || globalThis.cloudflareEnv?.USE_D1_BACKEND === 'true';
    const vault = globalThis.cloudflareEnv?.CERTIFICATE_VAULT || globalThis.cloudflareEnv?.RESUME_VAULT;
    if (isD1 || vault) {
        try {
            const D1R2Adapter = require('../db/adapters/D1R2Adapter');
            const stream = await new D1R2Adapter().getFileStream('avatars', path);
            if (stream) {
                res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
                if (stream.type) res.setHeader('Content-Type', stream.type);
                return res.send(stream.buffer);
            }
        } catch (_) {}
    }
    if (db.isLocal()) return res.status(404).send('Profile picture unavailable in local mode.');
    
    const { data, error } = await db.supabaseClient().storage.from('avatars').createSignedUrl(path, AVATAR_REDIRECT_SIGNED_SECONDS);
    if (error || !data?.signedUrl) return res.status(404).send('Profile picture unavailable.');
    
    res.setHeader('Cache-Control', `public, max-age=${AVATAR_REDIRECT_CACHE_SECONDS}, s-maxage=86400, stale-while-revalidate=600`);
    return res.redirect(302, data.signedUrl);
}

module.exports = { acceptAvatar, uploadAvatar, getAvatar, deleteAvatar, redirectAvatar, MAX_AVATAR_BYTES, AVATAR_REDIRECT_SIGNED_SECONDS, AVATAR_REDIRECT_CACHE_SECONDS };

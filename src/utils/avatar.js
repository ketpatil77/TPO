const multer = require('multer');
const db = require('../config/database');

const MAX_AVATAR_BYTES = 1024 * 1024;
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
    if (db.isLocal()) return res.status(503).json({ success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Profile picture storage requires Supabase.' } });
    const record = await db.selectOne(owner.table, owner.filter);
    if (!record) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found.' } });
    const path = `${owner.folder}/${owner.id}/avatar.${image.extension}`;
    const storage = db.supabaseClient().storage.from('avatars');
    if (record.avatar_path && record.avatar_path !== path) await storage.remove([record.avatar_path]);
    const { error } = await storage.upload(path, req.file.buffer, { contentType: image.contentType, upsert: true, cacheControl: '3600' });
    if (error) throw error;
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
    if (record.avatar_path && !db.isLocal()) await db.supabaseClient().storage.from('avatars').remove([record.avatar_path]);
    await db.update(owner.table, owner.filter, { avatar_path: null });
    await db.logAudit('avatar_remove', owner.table, owner.id, { role: owner.folder });
    return res.json({ success: true, data: { removed: true } });
}

async function signedAvatar(res, path) {
    if (db.isLocal()) {
        return res.json({ success: true, data: { url: `https://ui-avatars.com/api/?name=Local+User&background=random`, expires_in: 3600 } });
    }
    const { data, error } = await db.supabaseClient().storage.from('avatars').createSignedUrl(path, 3600);
    if (error) throw error;
    return res.json({ success: true, data: { url: data.signedUrl, expires_in: 3600 } });
}

module.exports = { acceptAvatar, uploadAvatar, getAvatar, deleteAvatar, MAX_AVATAR_BYTES };

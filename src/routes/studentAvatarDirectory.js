const express = require('express');
const db = require('../config/database');
const { redirectAvatar } = require('../utils/avatar');

function createStudentAvatarDirectory(authenticate) {
    const router = express.Router();
    router.use(authenticate);

    router.get('/:id', async (req, res) => {
        try {
            const student = await db.selectOne('students', { id: req.params.id });
            if (!student?.avatar_path) return res.status(404).send('Profile picture not uploaded.');
            return redirectAvatar(res, student.avatar_path);
        } catch (error) {
            console.error('Student avatar directory failed:', error.message);
            return res.status(404).send('Profile picture unavailable.');
        }
    });

    return router;
}

module.exports = { createStudentAvatarDirectory };

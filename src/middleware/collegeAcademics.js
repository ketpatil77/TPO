function protectCollegeAcademics(req, _res, next) {
    if (req.method === 'PUT' && req.path === '/profile' && req.body && typeof req.body === 'object') {
        delete req.body.cgpa_overall;
        delete req.body.cgpa_semesterwise;
    }
    next();
}

function blockAcademicVerification(req, res, next) {
    if (req.method === 'PUT' && /^\/evidence\/academics\//.test(req.path)) {
        return res.status(409).json({
            success: false,
            error: {
                code: 'COLLEGE_ACADEMICS_AUTHORITATIVE',
                message: 'CGPA and semester academic records are supplied by the college and do not require profile-evidence verification.'
            }
        });
    }
    next();
}

module.exports = { protectCollegeAcademics, blockAcademicVerification };
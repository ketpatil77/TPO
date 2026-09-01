function protectCollegeAcademics(_req, _res, next) {
    // Students are allowed to edit CGPA and semester CGPA from their profile.
    // Academic values count automatically for Profile Points and do not require
    // a separate TPO/TPC evidence-verification workflow.
    next();
}

function blockAcademicVerification(req, res, next) {
    if (req.method === 'PUT' && /^\/evidence\/academics\//.test(req.path)) {
        return res.status(409).json({
            success: false,
            error: {
                code: 'ACADEMIC_VERIFICATION_NOT_REQUIRED',
                message: 'CGPA and semester academic records do not require profile-evidence verification.'
            }
        });
    }
    next();
}

module.exports = { protectCollegeAcademics, blockAcademicVerification };
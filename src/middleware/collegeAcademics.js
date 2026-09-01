function protectCollegeAcademics(req, _res, next) {
    if (req.method === 'PUT' && req.path === '/profile' && req.body && typeof req.body === 'object') {
        delete req.body.cgpa_overall;
        delete req.body.cgpa_semesterwise;
    }
    next();
}

module.exports = { protectCollegeAcademics };

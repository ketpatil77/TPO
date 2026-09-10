const db = require('../config/database');
const SupabaseAdapter = require('./adapters/SupabaseAdapter');
const D1R2Adapter = require('./adapters/D1R2Adapter');

module.exports = {
    db,
    SupabaseAdapter,
    D1R2Adapter,
    getAdapter: () => db
};

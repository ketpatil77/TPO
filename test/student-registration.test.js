process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = 'registration-test-secret-at-least-32-characters';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `registration-${process.pid}.json`);
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const app = require('../src/server');
const db = require('../src/config/database');
const token = role => jwt.sign({ role, adminId:'registration-admin', observerId:'registration-tpc', department:'CT', sessionVersion:2 }, process.env.JWT_SECRET);
const row = { prn:'2505365111251504', name:'Registration Test Student', dob:'2006-05-17', branch:'CT', class:'BE-A', year:'Third Year' };

test('manual registration preserves exact 16-digit PRN and enables DDMMYY login', async () => {
    await request(app).post('/api/admin/roster/register').auth(token('admin'), { type:'bearer' }).send(row).expect(201);
    assert.equal((await db.selectOne('roster', { prn:row.prn })).prn, row.prn);
    const login = await request(app).post('/api/auth/login').send({ prn:row.prn, dob:'170506', token:'test-turnstile-token' }).expect(200);
    assert.equal(login.body.student.prn, row.prn);
});
test('duplicate manual registration never overwrites existing details', async () => {
    await request(app).post('/api/admin/roster/register').auth(token('admin'), { type:'bearer' }).send({ ...row, name:'Wrong Name' }).expect(409);
    assert.equal((await db.selectOne('roster', { prn:row.prn })).name, row.name);
});
test('anonymous and student users cannot register students', async () => {
    await request(app).post('/api/admin/roster/register').send(row).expect(401);
    await request(app).post('/api/admin/roster/register').auth(token('student'), { type:'bearer' }).send(row).expect(403);
});
test('TPC can register own department but cannot register another department', async () => {
    await request(app).post('/api/observer/register-student').auth(token('observer'), { type:'bearer' }).send({ ...row, prn:'2505365111251505' }).expect(201);
    await request(app).post('/api/observer/register-student').auth(token('observer'), { type:'bearer' }).send({ ...row, prn:'2505365111251506', branch:'ME' }).expect(403);
});
test('registration rejects numeric PRN, invalid DOB and unknown year', async () => {
    for (const change of [{prn:2505365111251504},{dob:'31-02-2006'},{year:'unknown'}]) {
        await request(app).post('/api/admin/roster/register').auth(token('admin'), { type:'bearer' }).send({...row,...change}).expect(400);
    }
});
test('Excel import rejects long numeric PRNs instead of importing rounded digits', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Roster');
    sheet.addRow(['prn','name','dob','branch','class','year']);
    sheet.addRow([2505365111251500,row.name,row.dob,row.branch,row.class,row.year]);
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    for (const action of ['preview','upload']) {
        const result = await request(app).post(`/api/admin/roster/${action}`).auth(token('admin'), {type:'bearer'}).attach('file',bytes,'roster.xlsx').expect(400);
        assert.match(result.body.error,/Text/);
    }
});
test('Excel text PRN import retains all 16 digits', async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Roster');
    sheet.addRow(['prn','name','dob','branch','class','year']);
    sheet.addRow([row.prn,row.name,row.dob,row.branch,row.class,row.year]);
    const result = await request(app).post('/api/admin/roster/preview').auth(token('admin'), {type:'bearer'}).attach('file',Buffer.from(await book.xlsx.writeBuffer()),'text-roster.xlsx').expect(200);
    assert.equal(result.body.data.rows[0].prn,row.prn);
});

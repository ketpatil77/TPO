const app = require('../src/server');
const { getExpectedAdminPassword } = require('../src/middleware/auth');
const http = require('http');

let server;
const PORT = 3002;

function startServer() {
    return new Promise((resolve) => {
        server = app.listen(PORT, () => {
            console.log(`🧪 Admin Test Server running on port ${PORT}...`);
            resolve();
        });
    });
}

function stopServer() {
    return new Promise((resolve) => {
        if (server) server.close(resolve);
        else resolve();
    });
}

async function runAdminTests() {
    await startServer();

    try {
        console.log('\n--- 1. Testing Admin Password Computation ---');
        const expectedPassword = getExpectedAdminPassword();
        console.log('Server Computed Password Today:', expectedPassword);
        if (!expectedPassword.startsWith('Tpo') || expectedPassword.length !== 9) {
            throw new Error(`Invalid password format: ${expectedPassword}`);
        }

        console.log('\n--- 2. Testing Admin Login Rejection with Wrong Password ---');
        const wrongRes = await fetch(`http://localhost:${PORT}/api/admin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'WrongPassword123' })
        });
        const wrongJson = await wrongRes.json();
        console.log('Wrong Password Result:', wrongRes.status, wrongJson.error);
        if (wrongRes.status !== 401) throw new Error('Expected 401 status for wrong admin password');

        console.log('\n--- 3. Testing Admin Login Success with Computed Password ---');
        const loginRes = await fetch(`http://localhost:${PORT}/api/admin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: expectedPassword })
        });
        const loginJson = await loginRes.json();
        console.log('Admin Login Result:', loginRes.status, loginJson.message);
        if (!loginJson.success || !loginJson.token) throw new Error('Admin login failed');

        const adminToken = loginJson.token;
        console.log('✅ Received Admin JWT Token scoped as role: admin');

        console.log('\n--- 4. Testing Roster CSV Upload Endpoint ---');
        const csvSample = `prn,name,dob,branch,class,year
24053651251520,Suresh Raina,180802,Computer Engineering,BE-A,Final Year
24053651251521,Anushka Sen,040403,Information Technology,BE-B,Final Year
24053651251515,Rahul Sharma,310703,Computer Engineering,BE-A,Final Year`;

        const uploadRes = await fetch(`http://localhost:${PORT}/api/admin/roster/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ csvContent: csvSample })
        });
        const uploadJson = await uploadRes.json();
        console.log('Roster CSV Upload Result:', uploadJson.message);
        console.log('Summary:', uploadJson.summary);
        if (!uploadJson.success) throw new Error('Roster CSV upload failed');

        console.log('\n--- 5. Testing Student List & Filtering Endpoints ---');
        // Register students in students table via student login for test data
        await fetch(`http://localhost:${PORT}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prn: '24053651251520', dob: '180802' })
        });

        const listRes = await fetch(`http://localhost:${PORT}/api/admin/students`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const listJson = await listRes.json();
        console.log('All Students Count:', listJson.count);
        console.log('Unique Branches:', listJson.branches);

        console.log('\n--- 5b. Testing Branch & CGPA Filtering ---');
        const filterRes = await fetch(`http://localhost:${PORT}/api/admin/students?branch=Computer%20Engineering&minCgpa=0.0`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const filterJson = await filterRes.json();
        console.log('Filtered Students (Computer Engineering):', filterJson.count);

        console.log('\n--- 6. Testing CSV Export Endpoint ---');
        const csvExportRes = await fetch(`http://localhost:${PORT}/api/admin/students/export/csv`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log('CSV Export Content-Type:', csvExportRes.headers.get('content-type'));
        console.log('CSV Export Content-Disposition:', csvExportRes.headers.get('content-disposition'));
        const csvText = await csvExportRes.text();
        console.log('CSV First 2 Lines:\n' + csvText.split('\n').slice(0, 2).join('\n'));
        if (!csvText.includes('"PRN"') || !csvText.includes('"Name"')) throw new Error('Invalid CSV export structure');

        console.log('\n--- 7. Testing Excel Export Endpoint ---');
        const excelExportRes = await fetch(`http://localhost:${PORT}/api/admin/students/export/excel`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log('Excel Export Status:', excelExportRes.status);
        console.log('Excel Content-Type:', excelExportRes.headers.get('content-type'));
        const excelBuffer = await excelExportRes.arrayBuffer();
        console.log('Excel File Size:', excelBuffer.byteLength, 'bytes');
        if (excelBuffer.byteLength < 1000) throw new Error('Excel export generated unusually small file');

        console.log('\n--- 8. Testing Audit Logs Retrieval ---');
        const auditRes = await fetch(`http://localhost:${PORT}/api/admin/audit-logs`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const auditJson = await auditRes.json();
        console.log('Audit Log Count:', auditJson.count);
        console.log('Latest Audit Action:', auditJson.logs[0]?.action, 'Target:', auditJson.logs[0]?.target_table);
        if (!auditJson.success || auditJson.logs.length === 0) throw new Error('Audit logs empty or missing');

        console.log('\n🎉 ALL PART 2 AUTOMATED ADMIN TESTS PASSED SUCCESSFULLY! 🎉');

    } catch (err) {
        console.error('❌ Admin test failed:', err);
        process.exitCode = 1;
    } finally {
        await stopServer();
    }
}

runAdminTests();

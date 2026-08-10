const app = require('../src/server');
const http = require('http');

let server;
const PORT = 3001;

function startServer() {
    return new Promise((resolve) => {
        server = app.listen(PORT, () => {
            console.log(`🧪 Test Server running on port ${PORT}...`);
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

async function runTests() {
    await startServer();

    try {
        console.log('\n--- 1. Testing Invalid Login ---');
        const invalidRes = await fetch(`http://localhost:${PORT}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prn: '24053651251515', dob: '000000' })
        });
        const invalidJson = await invalidRes.json();
        console.log('Invalid Login Result:', invalidRes.status, invalidJson);
        if (invalidRes.status !== 401) throw new Error('Expected 401 status for invalid login');

        console.log('\n--- 2. Testing Valid Login (PRN 24053651251515, DOB 310703) ---');
        const loginRes = await fetch(`http://localhost:${PORT}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prn: '24053651251515', dob: '310703' })
        });
        const loginJson = await loginRes.json();
        console.log('Login Result:', loginRes.status, loginJson.message);
        if (!loginJson.success || !loginJson.token) throw new Error('Login failed');

        const token = loginJson.token;
        const studentId = loginJson.student.id;
        console.log('✅ Received Auth Token & Student ID:', studentId);

        console.log('\n--- 3. Testing Get Profile ---');
        const profRes = await fetch(`http://localhost:${PORT}/api/student/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const profJson = await profRes.json();
        console.log('Profile Student Name:', profJson.data.student.name);

        console.log('\n--- 4. Testing Update Profile & CGPA ---');
        const updateRes = await fetch(`http://localhost:${PORT}/api/student/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: 'Rahul Sharma',
                branch: 'Computer Engineering',
                class: 'BE-A',
                year: 'Final Year',
                cgpa_overall: 8.92,
                cgpa_semesterwise: { sem1: 8.5, sem2: 8.7, sem3: 8.9, sem4: 9.1, sem5: 9.0, sem6: 9.3 },
                activities: 'Lead of Google Developer Student Club (GDSC), Hackathon 1st Runner Up',
                resume_url: 'https://drive.google.com/file/d/sample-rahul-resume'
            })
        });
        const updateJson = await updateRes.json();
        console.log('Update Profile Result:', updateJson.message, 'CGPA:', updateJson.student.cgpa_overall);

        console.log('\n--- 5. Testing Create Internship ---');
        const intRes = await fetch(`http://localhost:${PORT}/api/student/internships`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                company: 'TCS Digital',
                role: 'Software Engineer Intern',
                start_date: '2024-05-01',
                end_date: '2024-07-31',
                mode: 'offline'
            })
        });
        const intJson = await intRes.json();
        console.log('Internship Added:', intJson.message, intJson.internship.id);

        console.log('\n--- 6. Testing Create Certificate ---');
        const certRes = await fetch(`http://localhost:${PORT}/api/student/certificates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: 'AWS Certified Cloud Practitioner',
                issuer: 'Amazon Web Services',
                date: '2024-08-01',
                mode: 'online'
            })
        });
        const certJson = await certRes.json();
        console.log('Certificate Added:', certJson.message, certJson.certificate.id);

        console.log('\n--- 7. Testing Create Diploma Details ---');
        const dipRes = await fetch(`http://localhost:${PORT}/api/student/diploma`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                institute: 'Government Polytechnic Pune',
                branch: 'Computer Engineering',
                year_of_passing: '2022',
                percentage_or_cgpa: '91.50%'
            })
        });
        const dipJson = await dipRes.json();
        console.log('Diploma Added:', dipJson.message, dipJson.diploma.percentage_or_cgpa);

        console.log('\n--- 8. Verifying Final Aggregate Profile ---');
        const finalRes = await fetch(`http://localhost:${PORT}/api/student/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const finalJson = await finalRes.json();
        console.log('Final Verification Summary:');
        console.log('• Student:', finalJson.data.student.name, '| PRN:', finalJson.data.student.prn);
        console.log('• Overall CGPA:', finalJson.data.student.cgpa_overall);
        console.log('• Internships Count:', finalJson.data.internships.length, 'Company:', finalJson.data.internships[0].company);
        console.log('• Certificates Count:', finalJson.data.certificates.length, 'Name:', finalJson.data.certificates[0].name);
        console.log('• Diploma Institute:', finalJson.data.diploma ? finalJson.data.diploma.institute : 'None');

        console.log('\n🎉 ALL AUTOMATED API TESTS PASSED SUCCESSFULLY! 🎉');

    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exitCode = 1;
    } finally {
        await stopServer();
    }
}

runTests();

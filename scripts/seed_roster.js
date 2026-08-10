const db = require('../src/config/database');

const sampleRoster = [
    { prn: '24053651251515', name: 'Rahul Sharma', dob: '310703', branch: 'Computer Engineering', class: 'BE-A', year: 'Final Year' },
    { prn: '24053651251516', name: 'Priya Patel', dob: '150104', branch: 'Information Technology', class: 'BE-B', year: 'Final Year' },
    { prn: '24053651251517', name: 'Aman Verma', dob: '221103', branch: 'Electronics & Telecom', class: 'BE-A', year: 'Final Year' },
    { prn: '24053651251518', name: 'Neha Gupta', dob: '050903', branch: 'Mechanical Engineering', class: 'BE-C', year: 'Final Year' },
    { prn: '24053651251519', name: 'Siddharth Joshi', dob: '120402', branch: 'Civil Engineering', class: 'BE-A', year: 'Final Year' }
];

async function seed() {
    console.log('🌱 Preloading Roster sample dataset...');
    const dateHelper = require('../src/utils/dateHelper');

    for (const student of sampleRoster) {
        const formattedDob = dateHelper.parseDDMMYY(student.dob);
        const record = {
            prn: student.prn,
            name: student.name,
            dob: formattedDob,
            branch: student.branch,
            class: student.class,
            year: student.year
        };

        try {
            await db.upsert('roster', record, 'prn');
            console.log(`✅ Preloaded PRN: ${student.prn} (${student.name}, DOB: ${student.dob} -> ${formattedDob})`);
        } catch (err) {
            console.error(`❌ Failed to insert PRN ${student.prn}:`, err.message);
        }
    }
    console.log('🎉 Preload process complete!');
    process.exit(0);
}

seed();

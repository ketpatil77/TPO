const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { authenticateAdmin, authenticateSuperAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateAdmin);

const backupTables = ['roster','students','internships','certificates','student_projects','research_papers','diploma','student_skills','placement_drives','drive_criteria','drive_matches','shortlists','correction_requests','drive_applications','notifications','saved_filters','assessments','interviews','offers','calendar_events','notification_reads','import_batches','audit_log'];

router.get('/checklist', async (_req, res) => {
    const [roster, students, drives, profiles, notifications] = await Promise.all(['roster','students','placement_drives','profiles','notifications'].map(table => db.select(table)));
    const checks = [
        { key:'owner', label:'Super Admin active', complete:profiles.some(row => row.role === 'super_admin' && row.status === 'active'), action:'Security & intelligence' },
        { key:'roster', label:'Student roster uploaded', complete:roster.length > 0, action:'Upload roster' },
        { key:'profiles', label:'Student onboarding started', complete:students.length > 0, action:'Data readiness' },
        { key:'drives', label:'First drive reviewed', complete:drives.some(row => ['open','closed'].includes(row.status)), action:'Create drive' },
        { key:'alerts', label:'Student communications tested', complete:notifications.length > 0, action:'Send test alert' }
    ];
    res.json({ success:true, data:{ checks, completed:checks.filter(item=>item.complete).length, total:checks.length } });
});

router.post('/deadline-reminders', async (req, res) => {
    const today = Date.now(); const limit = today + 48 * 60 * 60 * 1000;
    const drives = (await db.select('placement_drives')).filter(row => row.status === 'open' && row.application_deadline && !row.reminder_sent_at && new Date(`${row.application_deadline}T23:59:59`).getTime() >= today && new Date(`${row.application_deadline}T23:59:59`).getTime() <= limit);
    for (const drive of drives) {
        await db.insert('notifications',{student_id:null,audience:'all',title:`Deadline reminder: ${drive.company}`,message:`Applications for ${drive.role} close on ${drive.application_deadline}.`,priority:'important',expires_at:new Date(`${drive.application_deadline}T23:59:59`).toISOString(),action_url:'/dashboard?tab=opportunities',created_at:new Date().toISOString()});
        await db.update('placement_drives',{id:drive.id},{reminder_sent_at:new Date().toISOString()});
    }
    if (drives.length) await db.logAudit('deadline_reminders_sent','notifications',null,{count:drives.length});
    res.json({success:true,sent:drives.length});
});

router.get('/security-alerts', async (_req,res) => {
    const [attempts,audits] = await Promise.all([db.select('login_attempts'),db.select('audit_log')]);
    const alerts = attempts.filter(row => Number(row.failures || 0) >= 3 || (row.locked_until && new Date(row.locked_until) > new Date())).map(row=>({severity:'high',type:'suspicious_login',message:`Repeated login failures (${row.failures})`,created_at:row.updated_at}));
    audits.filter(row=>/(fail|reject|denied|unauthorized)/i.test(row.action)).slice(-50).forEach(row=>alerts.push({severity:'medium',type:'security_event',message:row.action,created_at:row.created_at}));
    res.json({success:true,data:alerts.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,100)});
});

router.get('/audit.csv', async (_req,res) => {
    const rows=(await db.select('audit_log')).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
    const csv=[['timestamp','action','target_table','target_id','details'],...rows.map(row=>[row.created_at,row.action,row.target_table,row.target_id,JSON.stringify(row.details||{})])].map(row=>row.map(quote).join(',')).join('\r\n');
    res.type('text/csv').setHeader('Content-Disposition','attachment; filename="AIT-audit-log.csv"');res.send(csv);
});

router.get('/backups', authenticateSuperAdmin, async (_req,res) => {
    const rows=(await db.select('launch_backups')).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,20);
    res.json({success:true,data:rows.map(({snapshot,...row})=>({...row,table_counts:Object.fromEntries(Object.entries(snapshot||{}).map(([key,value])=>[key,value.length]))}))});
});

router.post('/backups', authenticateSuperAdmin, async (req,res) => {
    const snapshot={}; for(const table of backupTables) snapshot[table]=await db.select(table);
    const row=await db.insert('launch_backups',{id:crypto.randomUUID(),label:String(req.body?.label||`Manual backup ${new Date().toLocaleDateString('en-IN')}`).slice(0,100),created_by:req.admin.adminId,snapshot,created_at:new Date().toISOString()});
    await db.logAudit('launch_backup_created','launch_backups',row.id,{counts:Object.fromEntries(Object.entries(snapshot).map(([key,value])=>[key,value.length]))});
    res.status(201).json({success:true,data:{id:row.id,label:row.label,created_at:row.created_at}});
});

router.post('/backups/:id/restore', authenticateSuperAdmin, async (req,res) => {
    if (req.body?.confirmation !== 'RESTORE BACKUP') return res.status(400).json({success:false,error:'Type RESTORE BACKUP to confirm.'});
    const backup=await db.selectOne('launch_backups',{id:req.params.id});
    if(!backup || !backup.snapshot) return res.status(404).json({success:false,error:'Backup snapshot not found or invalid.'});

    const safetySnapshot={};
    for(const table of backupTables) safetySnapshot[table]=await db.select(table);
    const safetyBackup = await db.insert('launch_backups',{
        id: crypto.randomUUID(),
        label: `Pre-restore safety snapshot ${new Date().toISOString()}`,
        created_by: req.admin.adminId,
        snapshot: safetySnapshot,
        created_at: new Date().toISOString()
    });

    try {
        for(const table of [...backupTables].reverse()) await db.deleteAll(table);
        for(const table of backupTables){
            const rows=backup.snapshot?.[table]||[];
            for(let offset=0;offset<rows.length;offset+=250) await db.upsertMany(table,rows.slice(offset,offset+250),'id');
        }
        await db.update('launch_backups',{id:backup.id},{restored_at:new Date().toISOString()});
        await db.logAudit('launch_backup_restored','launch_backups',backup.id,{ safetyBackupId: safetyBackup.id });
        res.json({success:true,message:'Backup restored.', safetyBackupId: safetyBackup.id});
    } catch (err) {
        console.error('Restore failed, attempting rollback to safety backup:', err);
        try {
            for(const table of [...backupTables].reverse()) await db.deleteAll(table);
            for(const table of backupTables){
                const rows=safetySnapshot?.[table]||[];
                for(let offset=0;offset<rows.length;offset+=250) await db.upsertMany(table,rows.slice(offset,offset+250),'id');
            }
        } catch (rollbackErr) {
            console.error('Rollback also failed:', rollbackErr);
        }
        return res.status(500).json({
            success: false,
            error: `Restore failed: ${err.message}. Safety snapshot ${safetyBackup.id} preserved.`
        });
    }
});

module.exports=router;

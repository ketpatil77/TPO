const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const router = express.Router();
router.use(authenticateStudent);

const S = 'https://www.simplilearn.com/skillup-free-online-courses';
const HP = 'https://www.life-global.org/en/allcourses';
const IBM = 'https://skillsbuild.org/learning-catalog';

const CATEGORY_URLS = {
  Python:`${S}/python`, Programming:`${S}/programming`, Excel:`${S}/excel`, AI:`${S}/ai`, SQL:`${S}/sql`, Cloud:`${S}/cloud-computing`, ML:`${S}/machine-learning`,
  'Project Management':`${S}/project-management`, Cybersecurity:`${S}/cyber-security`, 'Data Analytics':`${S}/data-analytics`, 'Data Science':`${S}/data-science`, Docker:`${S}/docker`,
  JavaScript:`${S}/javascript`, Java:`${S}/java`, Agile:`${S}/agile-and-scrum`, 'Six Sigma':`${S}/six-sigma`
};

const DESCRIPTIONS = {
  Python:'Python programming for software, automation, analytics and AI workflows.', Programming:'Programming logic and problem-solving foundations for engineering work.',
  Excel:'Spreadsheet, dashboard and analysis skills useful across engineering roles.', AI:'Artificial intelligence concepts and practical modern AI applications.',
  SQL:'Database querying and structured data skills for software and analytics.', Cloud:'Cloud platforms, infrastructure, deployment and digital technology foundations.',
  ML:'Machine learning algorithms, modelling and applied predictive analytics.', 'Project Management':'Planning, scheduling, risk and technical project delivery skills.',
  Cybersecurity:'Security, threat awareness, ethical hacking and system protection foundations.', 'Data Analytics':'Practical analysis, visualization and business intelligence skills.',
  'Data Science':'Data science foundations spanning Python, SQL and applied analysis.', Docker:'Containers, Docker, Kubernetes and modern DevOps infrastructure.',
  JavaScript:'Modern web and full-stack development using JavaScript.', Java:'Java and object-oriented software development foundations.', Agile:'Agile and Scrum methods for iterative technical team delivery.',
  'Six Sigma':'Lean, Six Sigma and engineering process-quality improvement.', Communication:'Professional communication, presentation and workplace effectiveness.',
  'Self Development':'Career readiness, confidence and professional effectiveness.', Kanban:'Operations and workflow management skills.', 'Quality Assurance':'Quality, sustainability and process improvement skills.'
};

const simplilearn = [
  [1,'Python for Beginners','Python','Beginner'],[2,'Programming with Python 3.X','Python','Intermediate'],[3,'Advanced Python Course','Python','Advanced'],[5,'Python Libraries for Data Science','Python','Intermediate'],[6,'Python Pandas Basics Course','Python','Intermediate'],[10,'Python Django 101','Python','Intermediate'],
  [13,'C Programming Basics','Programming','Beginner'],[14,'Java Programming for Beginners','Programming','Beginner'],[15,'Introduction to C++','Programming','Beginner'],
  [17,'Business Analytics with Excel','Excel','Intermediate'],[18,'Introduction to MS Excel','Excel','Beginner'],[19,'Excel Dashboard for Beginners','Excel','Beginner'],[20,'Excel Macros & VBA for Beginners','Excel','Beginner'],
  [27,'Introduction to Artificial Intelligence','AI','Beginner'],[29,'Deep Learning for Beginners','AI','Beginner'],[30,'Introduction to Responsible AI','AI','Beginner'],[31,'Introduction to Generative AI','AI','Beginner'],[37,'AI Agents for Beginners','AI','Beginner'],
  [40,'Introduction to SQL','SQL','Beginner'],[41,'Fundamentals of Database: What is SQL?','SQL','Beginner'],[42,'SQL for Data Science','SQL','Intermediate'],
  [43,'Introduction to Cloud Computing','Cloud','Beginner'],[47,'AWS Cloud Practitioner Essential','Cloud','Intermediate'],[48,'Introduction to Cloud Security','Cloud','Intermediate'],[52,'Introduction to Google Cloud Platform','Cloud','Beginner'],
  [53,'Machine Learning using Python','ML','Intermediate'],[54,'Machine Learning for Beginners','ML','Beginner'],[55,'Getting Started with Machine Learning Algorithms','ML','Beginner'],
  [56,'Project Management 101','Project Management','Beginner'],[61,'Construction Project Management Course','Project Management','Intermediate'],[62,'Project Management for Engineers Course','Project Management','Intermediate'],
  [67,'Introduction to Cyber Security','Cybersecurity','Beginner'],[68,'Ethical Hacking Basics','Cybersecurity','Beginner'],[69,'Introduction to Cybercrime','Cybersecurity','Beginner'],[76,'Introduction to Kali Linux Basics','Cybersecurity','Beginner'],
  [77,'Introduction to Data Analytics Course','Data Analytics','Beginner'],[78,'Data Analytics Projects','Data Analytics','Intermediate'],[79,'ChatGPT for Data Analytics','Data Analytics','Intermediate'],
  [87,'Getting Started with Docker','Docker','Beginner'],[90,'Introduction to Kubernetes','Docker','Beginner'],[93,'JavaScript for Beginners','JavaScript','Beginner'],[102,'Full-Stack Development 101','JavaScript','Intermediate'],
  [106,'OOPs in Java Programming','Java','Intermediate'],[120,'Agile Scrum Master Basics','Agile','Beginner'],[141,'Introduction to Six Sigma','Six Sigma','Beginner']
].map(([id,title,category,difficulty]) => ({
  id,title,category,difficulty,provider:'Simplilearn SkillUp',url:CATEGORY_URLS[category],credential_type:'Completion Certificate',course_free:true,certificate_free:true,is_new:false,verified_on:'2026-09-06',summary:DESCRIPTIONS[category]
}));

const hpRows = [
  ['AI for Beginners','AI','Beginner'],['AI for Business Professionals','AI','Intermediate'],['Critical Thinking in the AI Era','Self Development','Intermediate'],['Strategic Planning in the AI Age','Project Management','Intermediate'],
  ['Introduction to Cybersecurity Awareness','Cybersecurity','Beginner'],['Agile Project Management','Agile','Intermediate'],['Data Science & Analytics','Data Analytics','Intermediate'],['Professional Networking for Career Growth','Self Development','Beginner'],
  ['Resume Writing and Job Interviewing','Self Development','Intermediate'],['Effective Leadership','Communication','Intermediate'],['Business Email','Communication','Beginner'],['Business Communications','Communication','Beginner'],
  ['Effective Presentations','Communication','Intermediate'],['Design Thinking','Project Management','Intermediate'],['IT for Business Success','Cloud','Beginner'],['Success Mindset','Self Development','Beginner'],
  ['Inventory Management','Kanban','Intermediate'],['Circular Economy','Quality Assurance','Intermediate'],['3D Printing','Programming','Intermediate'],['Starting a Small Business','Project Management','Beginner']
];

const ibmRows = [
  ['Explore Emerging Tech','Cloud','Beginner'],['Project Management Fundamentals','Project Management','Intermediate'],['Enterprise Design Thinking Practitioner','Project Management','Beginner'],['Getting Started with Cybersecurity','Cybersecurity','Beginner'],
  ['Craft Precise Prompts for AI Models','AI','Intermediate'],['Generative AI Essentials: Using LLMs to Work with Data','Data Analytics','Intermediate'],['AI Fundamentals: Foundations for Understanding AI','AI','Intermediate'],
  ['AI Literacy','AI','Beginner'],['Data Fundamentals','Data Science','Intermediate'],['Data Literacy','Data Analytics','Beginner']
];

let nextId = 1001;
const hp = hpRows.map(([title,category,difficulty]) => ({id:nextId++,title,category,difficulty,provider:'HP LIFE',url:HP,credential_type:'Certificate of Completion',course_free:true,certificate_free:true,is_new:true,verified_on:'2026-09-06',summary:DESCRIPTIONS[category]}));
const ibm = ibmRows.map(([title,category,difficulty]) => ({id:nextId++,title,category,difficulty,provider:'IBM SkillsBuild',url:IBM,credential_type:'IBM SkillsBuild Digital Credential',course_free:true,certificate_free:true,is_new:true,verified_on:'2026-09-06',summary:DESCRIPTIONS[category]}));
const RESOURCES = [...simplilearn,...hp,...ibm];
const RESOURCE_BY_ID = new Map(RESOURCES.map(row => [row.id,row]));

const WEIGHTS = {
  CT:{Python:5,Programming:5,Excel:3,AI:5,SQL:5,Cloud:5,ML:4,'Project Management':3,Cybersecurity:5,'Data Analytics':4,'Data Science':4,Docker:5,JavaScript:5,Java:5,Agile:4,Communication:2,'Six Sigma':2,Kanban:4,'Quality Assurance':4,'Self Development':2},
  AIML:{Python:5,Programming:4,Excel:3,AI:5,SQL:4,Cloud:4,ML:5,'Project Management':3,Cybersecurity:3,'Data Analytics':5,'Data Science':5,Docker:4,JavaScript:3,Java:3,Agile:3,Communication:2,'Six Sigma':2,Kanban:2,'Quality Assurance':2,'Self Development':2},
  EE:{Python:4,Programming:4,Excel:5,AI:4,SQL:2,Cloud:2,ML:4,'Project Management':5,Cybersecurity:3,'Data Analytics':4,'Data Science':3,Docker:2,JavaScript:1,Java:2,Agile:3,Communication:3,'Six Sigma':5,Kanban:3,'Quality Assurance':4,'Self Development':3},
  ME:{Python:3,Programming:3,Excel:5,AI:3,SQL:2,Cloud:1,ML:3,'Project Management':5,Cybersecurity:1,'Data Analytics':4,'Data Science':3,Docker:1,JavaScript:1,Java:1,Agile:3,Communication:3,'Six Sigma':5,Kanban:4,'Quality Assurance':5,'Self Development':3},
  CE:{Python:3,Programming:2,Excel:5,AI:3,SQL:2,Cloud:1,ML:2,'Project Management':5,Cybersecurity:1,'Data Analytics':4,'Data Science':2,Docker:1,JavaScript:1,Java:1,Agile:3,Communication:4,'Six Sigma':4,Kanban:4,'Quality Assurance':4,'Self Development':3}
};
const TARGET_COUNTS = {CT:{'Second Year':30,'Third Year':42,'Final Year':46},AIML:{'Second Year':32,'Third Year':44,'Final Year':48},EE:{'Second Year':22,'Third Year':30,'Final Year':34},ME:{'Second Year':20,'Third Year':28,'Final Year':32},CE:{'Second Year':20,'Third Year':28,'Final Year':32}};

function branchScore(branch,row){ return WEIGHTS[branch]?.[row.category] || 0; }
function difficultyScore(year,difficulty){
  if(year==='Second Year') return difficulty==='Beginner'?18:difficulty==='Intermediate'?9:0;
  if(year==='Third Year') return difficulty==='Intermediate'?18:difficulty==='Beginner'?12:8;
  if(year==='Final Year') return difficulty==='Advanced'?20:difficulty==='Intermediate'?17:10;
  return difficulty==='Beginner'?18:5;
}
function recommendationScore(branch,year,row){ return branchScore(branch,row)*10 + difficultyScore(year,row.difficulty) + (row.certificate_free?8:0); }
function recommendedFor(branch,year){
  const eligible = RESOURCES.filter(row => branchScore(branch,row)>=2)
    .map(row => ({...row,recommendation_score:recommendationScore(branch,year,row)}))
    .sort((a,b)=>b.recommendation_score-a.recommendation_score||a.title.localeCompare(b.title));
  const limit = TARGET_COUNTS[branch]?.[year] || eligible.length;
  return eligible.slice(0,limit).sort((a,b)=>Number(b.is_new)-Number(a.is_new)||b.recommendation_score-a.recommendation_score||a.title.localeCompare(b.title));
}

router.get('/', async (req,res) => {
  try {
    const student = await db.selectOne('students',{id:req.student.studentId});
    if(!student) return res.status(404).json({success:false,error:{code:'STUDENT_NOT_FOUND',message:'Student profile not found.'}});
    const branch=String(student.branch||'').toUpperCase(), year=student.year||'First Year';
    const mode=req.query.mode==='certificates'?'certificates':'courses';
    const q=String(req.query.q||'').trim().toLowerCase(), difficulty=String(req.query.difficulty||'').trim(), category=String(req.query.category||'').trim();
    const progress=await db.select('student_free_learning_progress',{student_id:req.student.studentId});
    const progressMap=new Map((progress||[]).map(row=>[Number(row.resource_id),row.state]));
    let rows=recommendedFor(branch,year).map(row=>({...row,state:progressMap.get(row.id)||null,relevance:branchScore(branch,row)>=5?'High':branchScore(branch,row)>=4?'Strong':'Relevant'}));
    if(mode==='certificates') rows=rows.filter(row=>row.certificate_free);
    if(difficulty&&difficulty!=='All') rows=rows.filter(row=>row.difficulty===difficulty);
    if(category&&category!=='All') rows=rows.filter(row=>row.category===category);
    if(q) rows=rows.filter(row=>`${row.title} ${row.category} ${row.provider} ${row.summary}`.toLowerCase().includes(q));
    const categories=[...new Set(rows.map(row=>row.category))].sort();
    res.json({success:true,data:{student:{branch,year},mode,total:rows.length,categories,rows,catalog_version:'2026-09-06-v2'}});
  } catch(error){
    console.error('Free learning v2 read error:',error.message);
    res.status(500).json({success:false,error:{code:'FREE_LEARNING_READ_FAILED',message:'Unable to load free learning resources.'}});
  }
});

const progressSchema=z.object({resource_id:z.coerce.number().int().positive(),state:z.enum(['saved','started','completed'])}).strict();
router.put('/progress',validate(progressSchema),async(req,res,next)=>{
  try{
    const resource=RESOURCE_BY_ID.get(Number(req.body.resource_id));
    if(!resource) return next();
    const student=await db.selectOne('students',{id:req.student.studentId});
    const branch=String(student?.branch||'').toUpperCase(), year=student?.year||'First Year';
    if(!student||!recommendedFor(branch,year).some(row=>row.id===resource.id)) return res.status(403).json({success:false,error:{code:'RESOURCE_NOT_AVAILABLE',message:'This resource is not available for your branch and year.'}});
    const saved=await db.upsert('student_free_learning_progress',{student_id:req.student.studentId,resource_id:resource.id,state:req.body.state,updated_at:new Date().toISOString()},'student_id,resource_id');
    res.json({success:true,data:saved});
  }catch(error){
    console.error('Free learning v2 progress error:',error.message);
    res.status(500).json({success:false,error:{code:'FREE_LEARNING_PROGRESS_FAILED',message:'Unable to save learning progress.'}});
  }
});

router._catalog = {RESOURCES,TARGET_COUNTS,recommendedFor};
module.exports = router;

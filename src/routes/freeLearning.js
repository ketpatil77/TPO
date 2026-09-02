const express = require('express');
const { z } = require('zod');
const db = require('../config/database');
const { authenticateStudent } = require('../middleware/auth');
const { validate } = require('../middleware/security');

const router = express.Router();
router.use(authenticateStudent);

const URLS = {
  Python:'https://www.simplilearn.com/skillup-free-online-courses/python', Programming:'https://www.simplilearn.com/skillup-free-online-courses/programming', Excel:'https://www.simplilearn.com/skillup-free-online-courses/excel', AI:'https://www.simplilearn.com/skillup-free-online-courses/ai', SQL:'https://www.simplilearn.com/skillup-free-online-courses/sql', Cloud:'https://www.simplilearn.com/skillup-free-online-courses/cloud-computing', ML:'https://www.simplilearn.com/skillup-free-online-courses/machine-learning', 'Project Management':'https://www.simplilearn.com/skillup-free-online-courses/project-management', Cybersecurity:'https://www.simplilearn.com/skillup-free-online-courses/cyber-security', 'Data Analytics':'https://www.simplilearn.com/skillup-free-online-courses/data-analytics', 'Data Science':'https://www.simplilearn.com/skillup-free-online-courses/data-science', Docker:'https://www.simplilearn.com/skillup-free-online-courses/docker', JavaScript:'https://www.simplilearn.com/skillup-free-online-courses/javascript', Java:'https://www.simplilearn.com/skillup-free-online-courses/java', Tableau:'https://www.simplilearn.com/skillup-free-online-courses/tableau', Linux:'https://www.simplilearn.com/skillup-free-online-courses/linux', Agile:'https://www.simplilearn.com/skillup-free-online-courses/agile-and-scrum', Communication:'https://www.simplilearn.com/skillup-free-online-courses/communication', 'Six Sigma':'https://www.simplilearn.com/skillup-free-online-courses/six-sigma', Kanban:'https://www.simplilearn.com/skillup-free-online-courses/kanban', 'Digital Marketing':'https://www.simplilearn.com/skillup-free-online-courses/digital-marketing', Microsoft:'https://www.simplilearn.com/skillup-free-online-courses/microsoft', HTML:'https://www.simplilearn.com/skillup-free-online-courses/html', 'Quality Assurance':'https://www.simplilearn.com/skillup-free-online-courses/quality-assurance', 'Self Development':'https://www.simplilearn.com/skillup-free-online-courses/self-development'
};

const CATALOG = {
Python:['Python for Beginners','Programming with Python 3.X','Advanced Python Course','Getting Python Interview Ready','Python Libraries for Data Science','Python Pandas Basics Course','ChatGPT for Python','AI Python for Beginners','Introduction to Applied Data Science with Python','Python Django 101','Data Structures & Algorithms in Python','Free Data Analysis with Python Course'],
Programming:['C Programming Basics','Java Programming for Beginners','Introduction to C++','Free Programming Course: Kickstart Your Coding Journey!'],
Excel:['Business Analytics with Excel','Introduction to MS Excel','Excel Dashboard for Beginners','Excel Macros & VBA for Beginners','Excel Dashboarding Basics','Introduction to Microsoft Excel Course','LOOKUP Function in Excel','Excel for Business Course With Certificate','Business Intelligence using Excel Basics Tutorial','Excel Automation using ChatGPT'],
AI:['Introduction to Artificial Intelligence','Artificial Intelligence for Business','Deep Learning for Beginners','Introduction to Responsible AI','Introduction to Generative AI','Generative AI for Everyone','Responsible AI: Applying AI Principles with Google Cloud','Sora AI for Beginners','AI Applications in Healthcare','AI for Entrepreneurs Course with Certificate','AI Agents for Beginners','AI in Finance','Generative AI for Marketers Course'],
SQL:['Introduction to SQL','Fundamentals of Database: What is SQL?','SQL for Data Science'],
Cloud:['Introduction to Cloud Computing','Cloud Computing Fundamentals','Digital Transformation with Google Cloud','AWS Compute Services Overview','AWS Cloud Practitioner Essential','Introduction to Cloud Security','Innovating with Google Cloud Artificial Intelligence','AWS for Beginners','Trust and Security with Google Cloud','Introduction to Google Cloud Platform'],
ML:['Machine Learning using Python','Machine Learning for Beginners','Getting Started with Machine Learning Algorithms'],
'Project Management':['Project Management 101','Free Project Manager Course','PMP Basics','Foundation of Project Management Course','ChatGPT for Project Management','Construction Project Management Course','Project Management for Engineers Course','Microsoft Project Management Course with Certificate','Planning a Machine Learning Project','Planning a Generative AI Project','Introduction to PRINCE2®'],
Cybersecurity:['Introduction to Cyber Security','Ethical Hacking Basics','Introduction to Cybercrime','Cyber Security Beginner Course with Certificate','Cybersecurity in Finance','Getting Started with AWS Security Hub','Introduction to CISSP Security Assessment & Testing and Security Operations','Deep Dive on Container Security','Introduction to ChatGPT for Cybersecurity','Introduction to Kali Linux Basics'],
'Data Analytics':['Introduction to Data Analytics Course','Data Analytics Projects','ChatGPT for Data Analytics','Introduction to Apache Spark Data Analytics for Beginners','HR Analytics Course','Introduction to Web Analytics','Introduction to Google Analytics','Data Analytics Course for Beginners','Get Started with SQL Analytics and BI on Databricks'],
'Data Science':['Introduction to Data Science','Python Libraries for Data Science','SQL for Data Science'],
Docker:['Getting Started with Docker','Master Docker Orchestration, Security & Microservices','Introduction to Devops Tools','Introduction to Kubernetes','n8n: No Code AI Agent Builder','Getting Started with Amazon ECS','Deep Dive on Container Security'],
JavaScript:['JavaScript for Beginners','Javascript Coding Interview Preparation','GitHub Copilot for Software Testing in JavaScript','Introduction to Front End Development','GenAI Code Generation with GitHub Copilot in JavaScript','Learn GenAI for Code Migration & Optimization in JavaScript','Web Development for Beginners','Introduction to MEAN Stack','GitHub Copilot for Software Deployment in JavaScript','Full-Stack Development 101','Full Stack Development Course'],
Java:['Java Programming for Beginners','Introduction to Java Spring framework 101','Getting Started with Full Stack Development','OOPs in Java Programming','Getting Started with Playwright with Java','Amazon Q Developer for Java Course with Certificate','Getting Started with Java Hibernate Basics','Learn Apache Maven Course','Introduction to Android Studio Course','Basics of Data Structures and Algorithms'],
Tableau:['Introduction to Data Visualization','Introduction to Tableau','Introduction to Data Visualization with Tableau Free Course','Tableau Data Visualization Basics Tutorial','Free Data Analyst Course','Business Intelligence Fundamentals','Data Analytics Projects'],
Linux:['Introduction to Kali Linux Basics','Introduction to VMware'],
Agile:['Agile Scrum Master Basics','Agile Scrum Foundation Basics','Introduction to PMI-ACP®','Introduction to Foundations of Agile and Frameworks','Introduction to Agile Course','Introduction to Agile Adoption and Transformation','Fundamentals of Scrum Roles Events and Artifacts','Foundations for Agile Enterprise Delivery Course','Agile for Complex Projects for Beginners','Free Safe Agile Scrum Course with Certificate','Free Agile Framework Course with Certificate'],
Communication:['Spoken English Course','Communication Skills Course','Introduction to Business Communication','Free Assertive Communication Course with Certificate','Digital Communications Course with Certificate','Personality Development Course','Introduction to Amazon Connect and the Connect Control Panel (CCP)','Brand Management Course','Public Speaking Course'],
'Six Sigma':['Lean Management','Introduction to Six Sigma','Minitab®','Introduction to DevOps and DevSecOps Course','Free Order Management Database Design Course with Certificate'],
Kanban:['Introduction to Kanban','Introduction to Scrumban','Introduction to JIRA'],
'Digital Marketing':['Digital Marketing 101','Introduction to Digital Marketing Fundamentals Course','Digital Marketing Tools and Techniques','Digital Marketing Strategy','Digital Marketing for CXOs','YouTube and Video Marketing','ChatGPT for Digital Marketing','Advanced Mobile Marketing','Content Marketing Strategy 101'],
'Quality Assurance':['Introduction to Software Testing','Free Product Quality Management Course'],
'Self Development':['Personality Development Course','Spoken English Course','Communication Skills Course'],
Microsoft:['Power BI for Beginners'],
HTML:['Introduction to Front End Development']
};

const WEIGHTS = {
CT:{Python:5,Programming:5,Excel:3,AI:5,SQL:5,Cloud:5,ML:4,'Project Management':3,Cybersecurity:5,'Data Analytics':4,'Data Science':4,Docker:5,JavaScript:5,Java:5,Tableau:3,Linux:5,Agile:4,Communication:2,'Six Sigma':2,Kanban:4,'Digital Marketing':1,'Quality Assurance':4,'Self Development':2,Microsoft:3,HTML:5},
AIML:{Python:5,Programming:4,Excel:3,AI:5,SQL:4,Cloud:4,ML:5,'Project Management':3,Cybersecurity:3,'Data Analytics':5,'Data Science':5,Docker:4,JavaScript:3,Java:3,Tableau:4,Linux:3,Agile:3,Communication:2,'Six Sigma':2,Kanban:2,'Digital Marketing':1,'Quality Assurance':2,'Self Development':2,Microsoft:4,HTML:2},
EE:{Python:4,Programming:4,Excel:5,AI:4,SQL:2,Cloud:2,ML:4,'Project Management':5,Cybersecurity:3,'Data Analytics':4,'Data Science':3,Docker:2,JavaScript:1,Java:2,Tableau:3,Linux:3,Agile:3,Communication:3,'Six Sigma':5,Kanban:3,'Digital Marketing':1,'Quality Assurance':4,'Self Development':3,Microsoft:4,HTML:1},
ME:{Python:3,Programming:3,Excel:5,AI:3,SQL:2,Cloud:1,ML:3,'Project Management':5,Cybersecurity:1,'Data Analytics':4,'Data Science':3,Docker:1,JavaScript:1,Java:1,Tableau:3,Linux:2,Agile:3,Communication:3,'Six Sigma':5,Kanban:4,'Digital Marketing':2,'Quality Assurance':5,'Self Development':3,Microsoft:4,HTML:1},
CE:{Python:3,Programming:2,Excel:5,AI:3,SQL:2,Cloud:1,ML:2,'Project Management':5,Cybersecurity:1,'Data Analytics':4,'Data Science':2,Docker:1,JavaScript:1,Java:1,Tableau:3,Linux:1,Agile:3,Communication:4,'Six Sigma':4,Kanban:4,'Digital Marketing':2,'Quality Assurance':4,'Self Development':3,Microsoft:4,HTML:1}
};

const beginner = /beginner|introduction|basics|basic|fundamentals|101|getting started|foundation|spoken english|personality development/i;
const advanced = /advanced|deep dive|interview|cissp|orchestration|security hub|prince2|pmi-acp|migration|optimization/i;
const descriptions = {
Python:'Python programming for software, automation, analytics and AI workflows.',Programming:'Programming logic and problem-solving foundations for engineering and software work.',Excel:'Spreadsheet, dashboard and analysis skills useful across engineering roles.',AI:'Artificial intelligence concepts and practical modern AI applications.',SQL:'Database querying and structured data skills for software and analytics.',Cloud:'Cloud platforms, infrastructure, deployment and security foundations.',ML:'Machine learning algorithms, modelling and applied predictive analytics.','Project Management':'Planning, scheduling, risk and technical project delivery skills.',Cybersecurity:'Security, threat awareness, ethical hacking and system protection foundations.','Data Analytics':'Practical analysis, visualization and business intelligence skills.','Data Science':'Data science foundations spanning Python, SQL and applied analysis.',Docker:'Containers, Docker, Kubernetes and modern DevOps infrastructure.',JavaScript:'Modern web and full-stack development using JavaScript.',Java:'Java, object-oriented development, frameworks and software testing.',Tableau:'Dashboards, visualization and business intelligence with Tableau.',Linux:'Linux, virtualization and system administration foundations.',Agile:'Agile and Scrum methods for iterative technical team delivery.',Communication:'Professional communication, speaking and employability skills.','Six Sigma':'Lean, Six Sigma and engineering process-quality improvement.',Kanban:'Visual workflow management with Kanban, Scrumban and Jira.','Digital Marketing':'Digital communication, content and entrepreneurship fundamentals.','Quality Assurance':'Testing, product quality and process assurance skills.','Self Development':'Professional confidence and personal effectiveness for career growth.',Microsoft:'Microsoft analytics and workplace productivity skills.',HTML:'Web structure and front-end development foundations.'
};

function buildCatalog() {
  const seen = new Set(); let id = 1; const out = [];
  for (const [category,titles] of Object.entries(CATALOG)) for (const title of titles) {
    const key = title.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
    const difficulty = advanced.test(title) ? 'Advanced' : beginner.test(title) ? 'Beginner' : 'Intermediate';
    const years = ['Communication','Self Development','Excel'].includes(category) ? ['First Year','Second Year','Third Year','Final Year'] : difficulty === 'Beginner' ? ['First Year','Second Year'] : difficulty === 'Intermediate' ? ['Second Year','Third Year','Final Year'] : ['Third Year','Final Year'];
    out.push({id:id++,title,provider:'Simplilearn SkillUp',category,difficulty,recommended_years:years,course_free:true,certificate_free:true,credential_type:'Completion Certificate',summary:descriptions[category],url:URLS[category],verified_on:'2026-09-02'});
  }
  return out;
}
const RESOURCES = buildCatalog();

function branchScore(branch,row) { return WEIGHTS[branch]?.[row.category] || 0; }
function yearScore(year,row) { return row.recommended_years.includes(year) ? 40 : 0; }

router.get('/', async (req,res) => {
  try {
    const student = await db.selectOne('students',{id:req.student.studentId});
    if (!student) return res.status(404).json({success:false,error:{code:'STUDENT_NOT_FOUND',message:'Student profile not found.'}});
    const branch = String(student.branch || '').toUpperCase();
    const year = student.year || 'First Year';
    const mode = req.query.mode === 'certificates' ? 'certificates' : 'courses';
    const q = String(req.query.q || '').trim().toLowerCase();
    const difficulty = String(req.query.difficulty || '').trim();
    const category = String(req.query.category || '').trim();
    const progress = await db.select('student_free_learning_progress',{student_id:req.student.studentId});
    const progressMap = new Map((progress || []).map(row => [Number(row.resource_id),row.state]));
    let rows = RESOURCES.filter(row => branchScore(branch,row) >= 2 && row.recommended_years.includes(year));
    if (mode === 'certificates') rows = rows.filter(row => row.certificate_free);
    if (difficulty && difficulty !== 'All') rows = rows.filter(row => row.difficulty === difficulty);
    if (category && category !== 'All') rows = rows.filter(row => row.category === category);
    if (q) rows = rows.filter(row => `${row.title} ${row.category} ${row.provider} ${row.summary}`.toLowerCase().includes(q));
    rows = rows.map(row => ({...row,state:progressMap.get(row.id) || null,relevance:branchScore(branch,row)>=5?'High':branchScore(branch,row)>=4?'Strong':'Relevant',recommendation_score:branchScore(branch,row)*10+yearScore(year,row)+(row.certificate_free?8:0)})).sort((a,b)=>b.recommendation_score-a.recommendation_score||a.title.localeCompare(b.title));
    const categories = [...new Set(rows.map(row=>row.category))].sort();
    res.json({success:true,data:{student:{branch,year},mode,total:rows.length,categories,rows}});
  } catch (error) {
    console.error('Free learning read error:',error.message);
    res.status(500).json({success:false,error:{code:'FREE_LEARNING_READ_FAILED',message:'Unable to load free learning resources.'}});
  }
});

const progressSchema = z.object({resource_id:z.coerce.number().int().positive(),state:z.enum(['saved','started','completed'])}).strict();
router.put('/progress', validate(progressSchema), async (req,res) => {
  try {
    const resource = RESOURCES.find(row=>row.id===Number(req.body.resource_id));
    if (!resource) return res.status(404).json({success:false,error:{code:'RESOURCE_NOT_FOUND',message:'Learning resource not found.'}});
    const student = await db.selectOne('students',{id:req.student.studentId});
    if (!student || branchScore(String(student.branch||'').toUpperCase(),resource)<2 || !resource.recommended_years.includes(student.year)) return res.status(403).json({success:false,error:{code:'RESOURCE_NOT_AVAILABLE',message:'This resource is not available for your branch and year.'}});
    const saved = await db.upsert('student_free_learning_progress',{student_id:req.student.studentId,resource_id:resource.id,state:req.body.state,updated_at:new Date().toISOString()},'student_id,resource_id');
    res.json({success:true,data:saved});
  } catch (error) {
    console.error('Free learning progress error:',error.message);
    res.status(500).json({success:false,error:{code:'FREE_LEARNING_PROGRESS_FAILED',message:'Unable to save learning progress.'}});
  }
});

module.exports = router;

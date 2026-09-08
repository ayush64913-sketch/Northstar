const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const dataDirectory = path.join(__dirname, 'data');
const databasePath = path.join(dataDirectory, 'northstar.sqlite');
const legacyStorePath = path.join(dataDirectory, 'store.json');
const uploadDirectory = path.join(__dirname, 'uploads');

fs.mkdirSync(dataDirectory, { recursive: true });
fs.mkdirSync(uploadDirectory, { recursive: true });

const seed = {
  profile: {
    name: 'Maya Chen',
    role: 'Product Designer',
    location: 'New York, NY',
    score: 91,
    summary: 'I design thoughtful systems for products people rely on. Previously at Northstar Labs and Field Notes, focused on clarity, craft, and measurable outcomes.',
    skills: ['Product design', 'Research', 'Design systems']
  },
  resume: {
    id: 'resume-v4',
    filename: 'Maya_Chen_Resume.pdf',
    version: 4,
    score: 82,
    updatedAt: '2 days ago',
    insights: [
      'Quantify your scope with a clear result.',
      'Mirror the language used in your target role.',
      'Lead your summary with the problems you solve.'
    ]
  },
  jobs: [
    { id: 'figma-senior-product-designer', company: 'Figma', title: 'Senior Product Designer', location: 'Remote / New York', salary: '$165k-$210k', match: 92, saved: false },
    { id: 'linear-growth-product-designer', company: 'Linear', title: 'Product Designer, Growth', location: 'Remote, Europe', salary: 'EUR110k-EUR145k', match: 88, saved: false },
    { id: 'stripe-product-designer', company: 'Stripe', title: 'Product Designer II', location: 'San Francisco, CA', salary: '$150k-$190k', match: 84, saved: false }
  ],
  applications: [
    { id: 'notion-product-designer', company: 'Notion', title: 'Product Designer', stage: 'Interview', updated: 'Today' },
    { id: 'airbnb-senior-ux', company: 'Airbnb', title: 'Senior UX Designer', stage: 'Applied', updated: 'Aug 29' },
    { id: 'adobe-product-designer', company: 'Adobe', title: 'Product Designer', stage: 'Saved', updated: 'Aug 25' }
  ],
  letters: []
};

const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS resume (id TEXT PRIMARY KEY, filename TEXT NOT NULL, version INTEGER NOT NULL, score INTEGER NOT NULL, updated_at TEXT NOT NULL, insights TEXT NOT NULL, summary TEXT, extracted_text TEXT);
  CREATE TABLE IF NOT EXISTS job (id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL, salary TEXT NOT NULL, match_score INTEGER NOT NULL, saved INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS application (id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL, stage TEXT NOT NULL, updated TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS letter (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, tone TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS session (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE);
`);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { hash: crypto.scryptSync(password, salt, 64).toString('hex'), salt };
}

function getCookie(request, name) {
  const cookies = String(request.headers.cookie || '').split(';').map((part) => part.trim());
  const pair = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

function getCurrentUser(request) {
  const token = getCookie(request, 'northstar_session');
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = database.prepare('SELECT user.id, user.email, user.name FROM session JOIN user ON user.id = session.user_id WHERE session.token_hash = ? AND session.expires_at > ?').get(tokenHash, Date.now());
  return row || null;
}

function startSession(response, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  database.prepare('INSERT INTO session (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, Date.now() + 1000 * 60 * 60 * 24 * 30);
  response.setHeader('Set-Cookie', `northstar_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Max-Age=2592000; Path=/`);
}

function readStore() {
  const profileRow = database.prepare('SELECT data FROM profile WHERE id = 1').get();
  const resumeRow = database.prepare('SELECT * FROM resume ORDER BY version DESC LIMIT 1').get();
  if (!profileRow || !resumeRow) {
    const legacy = fs.existsSync(legacyStorePath) ? JSON.parse(fs.readFileSync(legacyStorePath, 'utf8')) : structuredClone(seed);
    writeStore(legacy);
    return legacy;
  }
  return {
    profile: JSON.parse(profileRow.data),
    resume: { id: resumeRow.id, filename: resumeRow.filename, version: resumeRow.version, score: resumeRow.score, updatedAt: resumeRow.updated_at, insights: JSON.parse(resumeRow.insights), summary: resumeRow.summary, extractedText: resumeRow.extracted_text || '' },
    jobs: database.prepare('SELECT id, company, title, location, salary, match_score AS match, saved FROM job ORDER BY rowid').all().map((job) => ({ ...job, saved: Boolean(job.saved) })),
    applications: database.prepare('SELECT id, company, title, stage, updated FROM application ORDER BY rowid DESC').all(),
    letters: database.prepare('SELECT id, job_id AS jobId, tone, content, created_at AS createdAt FROM letter ORDER BY rowid').all()
  };
}

function writeStore(store) {
  database.exec('BEGIN;');
  try {
    database.prepare('INSERT OR REPLACE INTO profile (id, data) VALUES (1, ?)').run(JSON.stringify(store.profile));
    database.prepare('DELETE FROM resume').run();
    database.prepare('INSERT INTO resume (id, filename, version, score, updated_at, insights, summary, extracted_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(store.resume.id, store.resume.filename, store.resume.version, store.resume.score, store.resume.updatedAt, JSON.stringify(store.resume.insights || []), store.resume.summary || '', store.resume.extractedText || '');
    database.prepare('DELETE FROM job').run();
    const insertJob = database.prepare('INSERT INTO job (id, company, title, location, salary, match_score, saved) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const job of store.jobs) insertJob.run(job.id, job.company, job.title, job.location, job.salary, job.match, job.saved ? 1 : 0);
    database.prepare('DELETE FROM application').run();
    const insertApplication = database.prepare('INSERT INTO application (id, company, title, stage, updated) VALUES (?, ?, ?, ?, ?)');
    for (const application of store.applications) insertApplication.run(application.id, application.company, application.title, application.stage, application.updated);
    database.prepare('DELETE FROM letter').run();
    const insertLetter = database.prepare('INSERT INTO letter (id, job_id, tone, content, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const letter of store.letters) insertLetter.run(letter.id, letter.jobId, letter.tone, letter.content, letter.createdAt);
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

async function callOpenAI(instruction, input) {
  if (!process.env.OPENAI_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const result = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'gpt-4.1-mini', input: `${instruction}\n\n${input}`, max_output_tokens: 1200 })
    });
    const payload = await result.json();
    if (!result.ok) throw new Error(payload.error?.message || 'AI provider request failed.');
    return payload.output_text || payload.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('') || '';
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonResult(value) {
  if (!value) return null;
  const clean = value.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(clean);
}

function publicOverview(store) {
  return {
    profile: store.profile,
    resume: store.resume,
    jobs: store.jobs,
    applications: store.applications,
    stats: { profileViews: 247, matchPotential: 8.6, newMatches: 12 }
  };
}

const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const accepted = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    callback(null, accepted.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.pdf'));
  }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'northstar-api' }));

app.get('/api/auth/me', (request, response) => response.json({ user: getCurrentUser(request) }));

app.post('/api/auth/register', (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const name = String(request.body.name || '').trim();
  const password = String(request.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 8) return response.status(400).json({ error: 'Use a valid email, your name, and a password of at least 8 characters.' });
  if (database.prepare('SELECT id FROM user WHERE email = ?').get(email)) return response.status(409).json({ error: 'An account with this email already exists.' });
  const userId = crypto.randomUUID();
  const passwordData = hashPassword(password);
  database.prepare('INSERT INTO user (id, email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, email, name, passwordData.hash, passwordData.salt, new Date().toISOString());
  startSession(response, userId);
  response.status(201).json({ user: { id: userId, email, name } });
});

app.post('/api/auth/login', (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const password = String(request.body.password || '');
  const user = database.prepare('SELECT * FROM user WHERE email = ?').get(email);
  if (!user) return response.status(401).json({ error: 'Email or password is incorrect.' });
  const passwordData = hashPassword(password, user.password_salt);
  const matches = crypto.timingSafeEqual(Buffer.from(passwordData.hash, 'hex'), Buffer.from(user.password_hash, 'hex'));
  if (!matches) return response.status(401).json({ error: 'Email or password is incorrect.' });
  startSession(response, user.id);
  response.json({ user: { id: user.id, email: user.email, name: user.name } });
});

app.post('/api/auth/logout', (request, response) => {
  const token = getCookie(request, 'northstar_session');
  if (token) database.prepare('DELETE FROM session WHERE token_hash = ?').run(crypto.createHash('sha256').update(token).digest('hex'));
  response.setHeader('Set-Cookie', 'northstar_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
  response.json({ ok: true });
});

app.get('/api/overview', (_request, response) => response.json(publicOverview(readStore())));

app.get('/api/jobs', (request, response) => {
  const store = readStore();
  const query = String(request.query.q || '').toLowerCase();
  const jobs = query ? store.jobs.filter((job) => `${job.title} ${job.company} ${job.location}`.toLowerCase().includes(query)) : store.jobs;
  response.json({ jobs });
});

app.post('/api/jobs/:id/save', (request, response) => {
  const store = readStore();
  const job = store.jobs.find((item) => item.id === request.params.id);
  if (!job) return response.status(404).json({ error: 'Job not found' });
  job.saved = request.body.saved !== undefined ? Boolean(request.body.saved) : !job.saved;
  writeStore(store);
  return response.json({ job });
});

app.get('/api/resumes/latest', (_request, response) => response.json({ resume: readStore().resume }));

app.post('/api/resumes/scan', async (request, response) => {
  const store = readStore();
  const input = String(request.body.text || store.resume.extractedText || '');
  try {
    const aiResult = await callOpenAI('Review this resume for ATS readiness. Return only valid JSON with keys score (number 0-100), summary (string), and insights (array of three concise actionable strings). Do not invent experience.', input);
    const parsed = parseJsonResult(aiResult);
    const keywordBonus = Math.min(6, Math.floor(input.length / 150));
    store.resume.score = parsed?.score || Math.min(99, Math.max(82, 82 + keywordBonus));
    store.resume.insights = parsed?.insights || store.resume.insights;
    store.resume.summary = parsed?.summary || store.resume.summary;
    writeStore(store);
    response.json({ resume: store.resume, message: aiResult ? 'AI resume scan complete.' : 'Resume scan complete.' });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.post('/api/resumes/upload', upload.single('resume'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Upload a PDF or Word document.' });
  const store = readStore();
  let extractedText = '';
  if (request.file.mimetype === 'application/pdf') {
    const parsedPdf = await pdfParse(fs.readFileSync(request.file.path));
    extractedText = parsedPdf.text.slice(0, 30000);
  }
  store.resume = {
    ...store.resume,
    id: crypto.randomUUID(),
    filename: request.file.originalname,
    version: store.resume.version + 1,
    score: 82,
    updatedAt: 'just now',
    extractedText
  };
  writeStore(store);
  fs.rmSync(request.file.path, { force: true });
  response.status(201).json({ resume: store.resume, message: 'Resume uploaded and ready to scan.' });
});

app.post('/api/letters', async (request, response) => {
  const store = readStore();
  const job = store.jobs.find((item) => item.id === request.body.jobId) || store.jobs[0];
  const tone = request.body.tone || 'Direct';
  try {
    const aiContent = await callOpenAI(`Write a concise, specific cover letter for the role below using only the resume facts provided. Tone: ${tone}. Return only the letter text. Role: ${job.title} at ${job.company}, ${job.location}.`, store.resume.extractedText || 'Maya Chen is a Product Designer who led a workflow redesign used by 2.4M monthly users and improved completion by 34%.');
  const letter = {
    id: crypto.randomUUID(),
    jobId: job.id,
    tone,
    content: aiContent || `Hi ${job.company} hiring team,\n\nI design products that make complex work feel clear. At Northstar Labs, I led the redesign of a core workflow used by 2.4M monthly users, increasing completion by 34%.\n\n${job.company}'s product challenge is the kind of work I want to spend my time on. I would bring a systems-minded approach, a sharp eye for interaction detail, and a habit of connecting every design decision back to the people using it.\n\nI would love to talk about what you are building next.\n\nWarmly,\nMaya Chen`,
    createdAt: new Date().toISOString()
  };
  store.letters.push(letter);
  writeStore(store);
  response.status(201).json({ letter });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.get('/api/profile', (_request, response) => response.json({ profile: readStore().profile }));

app.put('/api/profile', (request, response) => {
  const store = readStore();
  store.profile = { ...store.profile, ...request.body };
  writeStore(store);
  response.json({ profile: store.profile });
});

app.post('/api/applications', (request, response) => {
  const { company, title, stage = 'Saved' } = request.body;
  if (!company || !title) return response.status(400).json({ error: 'Company and title are required.' });
  const store = readStore();
  const application = { id: crypto.randomUUID(), company, title, stage, updated: 'Today' };
  store.applications.unshift(application);
  writeStore(store);
  response.status(201).json({ application });
});

app.use((error, _request, response, _next) => {
  if (error.code === 'LIMIT_FILE_SIZE') return response.status(413).json({ error: 'Resume must be smaller than 8MB.' });
  return response.status(500).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(port, host, () => console.log(`Northstar running at http://${host}:${port}`));

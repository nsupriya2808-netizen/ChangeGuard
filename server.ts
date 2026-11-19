import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import {
  analyzeImpact,
  computeEvaluationMetrics,
  detectRequirementChanges,
  extractTextFromFile,
  prioritizeTests,
  simulateTestExecution,
  type ComponentRecord,
  type DetectedChange,
  type ImpactAnalysisResult,
  type LinkRecord,
  type PrioritizedTest,
  type SimulatedTestResultItem,
} from './server/analysis.ts';
import { db, getDatabaseStats, initDatabase } from './server/db.ts';
import { seedDatabaseIfEmpty } from './server/seed.ts';

dotenv.config();

initDatabase();
seedDatabaseIfEmpty();

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update(process.cwd() + 'changeguard-secret').digest('hex');

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  theme: string;
  preferences_json: string;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function signToken(userId: number, rememberMe: boolean): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: rememberMe ? '30d' : '12h' });
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const user = db
      .prepare('SELECT id, name, email, role, avatar_url, theme, preferences_json FROM users WHERE id = ?')
      .get(payload.userId) as AuthUser | undefined;
    if (!user) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

function createNotification(userId: number | null, projectId: number | null, title: string, message: string): void {
  db.prepare(`
    INSERT INTO notifications (user_id, project_id, title, message, is_read)
    VALUES (?, ?, ?, ?, 0)
  `).run(userId, projectId, title, message);
}

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password, rememberMe } = req.body as {
    email?: string;
    password?: string;
    rememberMe?: boolean;
  };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const row = db
    .prepare('SELECT id, name, email, password_hash, role, avatar_url, theme, preferences_json FROM users WHERE lower(email) = lower(?)')
    .get(email.trim()) as (AuthUser & { password_hash: string }) | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = signToken(row.id, Boolean(rememberMe));
  const { password_hash: _ignored, ...safeUser } = row;
  res.json({ token, user: safeUser });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { name, email, password, role } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  };
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
    res.status(400).json({ error: 'Provide full name, valid email, and a password of at least 8 characters.' });
    return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email.trim());
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(`
      INSERT INTO users (name, email, password_hash, role, avatar_url, theme, preferences_json)
      VALUES (?, ?, ?, ?, ?, 'light', '{}')
    `)
    .run(
      name.trim(),
      email.trim().toLowerCase(),
      hash,
      role?.trim() || 'Software Engineer',
      '/src/assets/images/avatar_engineer_user_1794974892087.jpg'
    );

  const userId = Number(info.lastInsertRowid);
  const user = db
    .prepare('SELECT id, name, email, role, avatar_url, theme, preferences_json FROM users WHERE id = ?')
    .get(userId) as AuthUser;
  const token = signToken(userId, true);
  res.status(201).json({ token, user });
});

app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: 'Please enter your registered email address.' });
    return;
  }
  const user = db.prepare('SELECT id, email FROM users WHERE lower(email) = lower(?)').get(email.trim()) as
    | { id: number; email: string }
    | undefined;
  if (!user) {
    res.status(404).json({ error: 'No account found for that email address.' });
    return;
  }
  const resetCode = crypto.randomInt(100000, 999999).toString();
  db.prepare('UPDATE users SET reset_token = ? WHERE id = ?').run(resetCode, user.id);
  res.json({
    message: 'Password reset verification code generated.',
    // Returned in response because no external SMTP relay is configured in local environment
    verificationCode: resetCode,
  });
});

app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body as { email?: string; code?: string; newPassword?: string };
  if (!email?.trim() || !code?.trim() || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: 'Email, verification code, and new password (8+ chars) are required.' });
    return;
  }
  const user = db
    .prepare('SELECT id, reset_token FROM users WHERE lower(email) = lower(?)')
    .get(email.trim()) as { id: number; reset_token: string | null } | undefined;

  if (!user || !user.reset_token || user.reset_token !== code.trim()) {
    res.status(400).json({ error: 'Invalid or expired reset verification code.' });
    return;
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL WHERE id = ?').run(hash, user.id);
  res.json({ message: 'Password updated successfully. You may now sign in.' });
});

app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res: Response) => {
  res.json({ user: req.user });
});

app.put('/api/auth/profile', authMiddleware, (req: AuthedRequest, res: Response) => {
  const { name, role, theme, preferences } = req.body as {
    name?: string;
    role?: string;
    theme?: 'light' | 'dark';
    preferences?: Record<string, unknown>;
  };
  const current = req.user!;
  const nextName = name?.trim() || current.name;
  const nextRole = role?.trim() || current.role;
  const nextTheme = theme === 'dark' || theme === 'light' ? theme : current.theme;
  const nextPrefs = preferences ? JSON.stringify(preferences) : current.preferences_json;

  db.prepare('UPDATE users SET name = ?, role = ?, theme = ?, preferences_json = ? WHERE id = ?').run(
    nextName,
    nextRole,
    nextTheme,
    nextPrefs,
    current.id
  );
  const updated = db
    .prepare('SELECT id, name, email, role, avatar_url, theme, preferences_json FROM users WHERE id = ?')
    .get(current.id) as AuthUser;
  res.json({ user: updated });
});

// ==================== DASHBOARD ROUTE ====================
app.get('/api/dashboard', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectIdParam = req.query.projectId ? Number(req.query.projectId) : null;

  const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Array<{
    id: number;
    name: string;
    description: string;
    current_version: string;
    is_demo: number;
    created_at: string;
    updated_at: string;
  }>;

  const totalProjects = projects.length;

  // Aggregate counts from stored analyses
  const changeAnalyses = db
    .prepare(
      projectIdParam
        ? 'SELECT * FROM change_analyses WHERE project_id = ? ORDER BY created_at DESC'
        : 'SELECT * FROM change_analyses ORDER BY created_at DESC'
    )
    .all(...(projectIdParam ? [projectIdParam] : [])) as Array<{
      id: number;
      project_id: number;
      old_version: string;
      new_version: string;
      summary_json: string;
      analysis_time_ms: number;
      created_at: string;
    }>;

  // Use latest analysis per project so aggregate stats reflect current project states cleanly
  const latestCaByProject = new Map<number, (typeof changeAnalyses)[number]>();
  for (const ca of changeAnalyses) {
    if (!latestCaByProject.has(ca.project_id)) {
      latestCaByProject.set(ca.project_id, ca);
    }
  }

  let totalRequirementsAnalyzed = 0;
  let changesDetected = 0;
  const changeDistribution = { added: 0, changed: 0, removed: 0, unchanged: 0 };

  for (const ca of latestCaByProject.values()) {
    const s = JSON.parse(ca.summary_json) as {
      totalNew: number;
      added: number;
      changed: number;
      removed: number;
      unchanged: number;
      totalChanges: number;
    };
    totalRequirementsAnalyzed += s.totalNew || 0;
    changesDetected += s.totalChanges || 0;
    changeDistribution.added += s.added || 0;
    changeDistribution.changed += s.changed || 0;
    changeDistribution.removed += s.removed || 0;
    changeDistribution.unchanged += s.unchanged || 0;
  }

  const impactAnalyses = db
    .prepare(
      projectIdParam
        ? 'SELECT * FROM impact_analyses WHERE project_id = ? ORDER BY created_at DESC'
        : 'SELECT * FROM impact_analyses ORDER BY created_at DESC'
    )
    .all(...(projectIdParam ? [projectIdParam] : [])) as Array<{
      id: number;
      project_id: number;
      summary_json: string;
      affected_nodes_json: string;
      created_at: string;
    }>;

  const latestIaByProject = new Map<number, (typeof impactAnalyses)[number]>();
  for (const ia of impactAnalyses) {
    if (!latestIaByProject.has(ia.project_id)) {
      latestIaByProject.set(ia.project_id, ia);
    }
  }

  let affectedComponents = 0;
  for (const ia of latestIaByProject.values()) {
    const s = JSON.parse(ia.summary_json) as { directlyAffected: number; indirectlyAffected: number };
    affectedComponents += (s.directlyAffected || 0) + (s.indirectlyAffected || 0);
  }

  const prioritizations = db
    .prepare(
      projectIdParam
        ? 'SELECT * FROM test_prioritizations WHERE project_id = ? ORDER BY created_at DESC'
        : 'SELECT * FROM test_prioritizations ORDER BY created_at DESC'
    )
    .all(...(projectIdParam ? [projectIdParam] : [])) as Array<{
      id: number;
      project_id: number;
      ranked_tests_json: string;
      tests_saved_count: number;
      time_saved_sec: number;
      created_at: string;
    }>;

  const latestTpByProject = new Map<number, (typeof prioritizations)[number]>();
  for (const tp of prioritizations) {
    if (!latestTpByProject.has(tp.project_id)) {
      latestTpByProject.set(tp.project_id, tp);
    }
  }

  let testsPrioritized = 0;
  let testsSaved = 0;
  const riskDistribution = { high: 0, medium: 0, low: 0 };

  for (const tp of latestTpByProject.values()) {
    const ranked = JSON.parse(tp.ranked_tests_json) as PrioritizedTest[];
    testsPrioritized += ranked.filter((t) => t.recommendedSelected).length;
    testsSaved += tp.tests_saved_count || 0;
    for (const t of ranked) {
      if (t.priorityLevel === 'High') riskDistribution.high++;
      else if (t.priorityLevel === 'Medium') riskDistribution.medium++;
      else riskDistribution.low++;
    }
  }

  const testRuns = db
    .prepare(
      projectIdParam
        ? 'SELECT * FROM test_runs WHERE project_id = ? ORDER BY executed_at DESC LIMIT 20'
        : 'SELECT * FROM test_runs ORDER BY executed_at DESC LIMIT 20'
    )
    .all(...(projectIdParam ? [projectIdParam] : [])) as Array<{
      id: number;
      project_id: number;
      passed_count: number;
      failed_count: number;
      skipped_count: number;
      total_duration_sec: number;
      run_mode: string;
      executed_at: string;
    }>;

  const regressionStatus = testRuns.reduce(
    (acc, r) => {
      acc.passed += r.passed_count;
      acc.failed += r.failed_count;
      acc.skipped += r.skipped_count;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0 }
  );

  // Recent Activity combined feed
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const recentActivity: Array<{
    id: string;
    type: 'change_detection' | 'impact_analysis' | 'test_run';
    projectId: number;
    projectName: string;
    isDemo: boolean;
    summary: string;
    timestamp: string;
  }> = [];

  for (const ca of changeAnalyses.slice(0, 5)) {
    const s = JSON.parse(ca.summary_json) as { totalChanges: number; added: number; changed: number; removed: number };
    const proj = projectMap.get(ca.project_id);
    recentActivity.push({
      id: `ca-${ca.id}`,
      type: 'change_detection',
      projectId: ca.project_id,
      projectName: proj?.name ?? 'Project',
      isDemo: Boolean(proj?.is_demo),
      summary: `${ca.old_version} → ${ca.new_version}: ${s.totalChanges} changes (${s.added} added, ${s.changed} modified, ${s.removed} removed)`,
      timestamp: ca.created_at,
    });
  }
  for (const ia of impactAnalyses.slice(0, 5)) {
    const s = JSON.parse(ia.summary_json) as { directlyAffected: number; indirectlyAffected: number };
    const proj = projectMap.get(ia.project_id);
    recentActivity.push({
      id: `ia-${ia.id}`,
      type: 'impact_analysis',
      projectId: ia.project_id,
      projectName: proj?.name ?? 'Project',
      isDemo: Boolean(proj?.is_demo),
      summary: `Impact graph: ${s.directlyAffected} direct and ${s.indirectlyAffected} indirect components affected`,
      timestamp: ia.created_at,
    });
  }
  for (const tr of testRuns.slice(0, 5)) {
    const proj = projectMap.get(tr.project_id);
    recentActivity.push({
      id: `tr-${tr.id}`,
      type: 'test_run',
      projectId: tr.project_id,
      projectName: proj?.name ?? 'Project',
      isDemo: Boolean(proj?.is_demo),
      summary: `${tr.run_mode === 'simulated' ? 'Simulated' : 'External'} run: ${tr.passed_count} passed, ${tr.failed_count} failed, ${tr.skipped_count} skipped (${tr.total_duration_sec}s)`,
      timestamp: tr.executed_at,
    });
  }

  recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const recentProjects = projects.map((p) => {
    const ca = latestCaByProject.get(p.id);
    const ia = latestIaByProject.get(p.id);
    const tp = latestTpByProject.get(p.id);
    const caSummary = ca ? (JSON.parse(ca.summary_json) as { totalChanges: number }) : null;
    const iaSummary = ia ? (JSON.parse(ia.summary_json) as { directlyAffected: number; indirectlyAffected: number }) : null;
    return {
      ...p,
      changesCount: caSummary?.totalChanges ?? 0,
      affectedCount: iaSummary ? iaSummary.directlyAffected + iaSummary.indirectlyAffected : 0,
      testsSaved: tp?.tests_saved_count ?? 0,
    };
  });

  res.json({
    kpis: {
      totalProjects,
      totalRequirementsAnalyzed,
      changesDetected,
      affectedComponents,
      testsPrioritized,
      testsSaved,
    },
    charts: {
      changeDistribution: [
        { name: 'Added', value: changeDistribution.added, fill: '#16A34A' },
        { name: 'Changed', value: changeDistribution.changed, fill: '#D97706' },
        { name: 'Removed', value: changeDistribution.removed, fill: '#DC2626' },
        { name: 'Unchanged', value: changeDistribution.unchanged, fill: '#94A3B8' },
      ],
      riskDistribution: [
        { name: 'High Priority', count: riskDistribution.high, fill: '#DC2626' },
        { name: 'Medium Priority', count: riskDistribution.medium, fill: '#D97706' },
        { name: 'Low Priority', count: riskDistribution.low, fill: '#2563EB' },
      ],
      regressionStatus: [
        { name: 'Passed', value: regressionStatus.passed, fill: '#16A34A' },
        { name: 'Failed', value: regressionStatus.failed, fill: '#DC2626' },
        { name: 'Skipped', value: regressionStatus.skipped, fill: '#64748B' },
      ],
    },
    recentActivity: recentActivity.slice(0, 8),
    recentProjects,
  });
});

// ==================== PROJECTS ROUTES ====================
app.get('/api/projects', authMiddleware, (_req: AuthedRequest, res: Response) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>;
  const enriched = projects.map((p) => {
    const pid = p.id as number;
    const compCount = (db.prepare('SELECT COUNT(*) as c FROM components WHERE project_id = ?').get(pid) as { c: number }).c;
    const verCount = (db.prepare('SELECT COUNT(*) as c FROM project_versions WHERE project_id = ?').get(pid) as { c: number }).c;
    const analysisCount = (db.prepare('SELECT COUNT(*) as c FROM change_analyses WHERE project_id = ?').get(pid) as { c: number }).c;
    const runCount = (db.prepare('SELECT COUNT(*) as c FROM test_runs WHERE project_id = ?').get(pid) as { c: number }).c;
    return {
      ...p,
      componentCount: compCount,
      versionCount: verCount,
      analysisCount,
      runCount,
    };
  });
  res.json({ projects: enriched });
});

app.post('/api/projects', authMiddleware, (req: AuthedRequest, res: Response) => {
  const { name, description, current_version, initialRequirements } = req.body as {
    name?: string;
    description?: string;
    current_version?: string;
    initialRequirements?: string;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Project name is required.' });
    return;
  }
  const version = current_version?.trim() || 'v1.0';
  const info = db
    .prepare(`
      INSERT INTO projects (name, description, current_version, is_demo, created_by)
      VALUES (?, ?, ?, 0, ?)
    `)
    .run(name.trim(), description?.trim() || '', version, req.user!.id);

  const projectId = Number(info.lastInsertRowid);

  if (initialRequirements?.trim()) {
    db.prepare(`
      INSERT INTO project_versions (project_id, version_label, notes, raw_text)
      VALUES (?, ?, 'Initial baseline requirements', ?)
    `).run(projectId, version, initialRequirements.trim());
  }

  // Create default Not Connected integrations for project
  const insertInt = db.prepare(`
    INSERT INTO integrations (project_id, provider, status, config_json, last_message)
    VALUES (?, ?, 'not_connected', '{}', 'Not Connected — Configure credentials to enable live sync')
  `);
  for (const provider of ['github', 'git', 'jenkins', 'github_actions']) {
    insertInt.run(projectId, provider);
  }

  createNotification(req.user!.id, projectId, 'Project Created', `Created project "${name.trim()}" (${version}).`);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  res.status(201).json({ project });
});

app.get('/api/projects/:id', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  const versions = db
    .prepare('SELECT * FROM project_versions WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
  const analyses = db
    .prepare('SELECT id, old_version, new_version, summary_json, analysis_time_ms, created_at FROM change_analyses WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
  const impactAnalyses = db
    .prepare('SELECT id, change_analysis_id, summary_json, analysis_time_ms, created_at FROM impact_analyses WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
  const testRuns = db
    .prepare('SELECT id, run_mode, executed_at, total_duration_sec, passed_count, failed_count, skipped_count FROM test_runs WHERE project_id = ? ORDER BY executed_at DESC')
    .all(projectId);

  res.json({ project, versions, analyses, impactAnalyses, testRuns });
});

app.put('/api/projects/:id', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!existing) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  const { name, description, current_version } = req.body as {
    name?: string;
    description?: string;
    current_version?: string;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Project name cannot be empty.' });
    return;
  }
  db.prepare(`
    UPDATE projects SET name = ?, description = ?, current_version = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name.trim(), description?.trim() ?? '', current_version?.trim() || 'v1.0', projectId);

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  res.json({ project: updated });
});

app.delete('/api/projects/:id', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!existing) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  res.json({ deleted: true });
});

app.post('/api/projects/:id/versions', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const { version_label, notes, raw_text } = req.body as {
    version_label?: string;
    notes?: string;
    raw_text?: string;
  };
  if (!version_label?.trim() || !raw_text?.trim()) {
    res.status(400).json({ error: 'Version label and requirements text are required.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO project_versions (project_id, version_label, notes, raw_text) VALUES (?, ?, ?, ?)')
    .run(projectId, version_label.trim(), notes?.trim() || '', raw_text.trim());
  db.prepare("UPDATE projects SET current_version = ?, updated_at = datetime('now') WHERE id = ?").run(
    version_label.trim(),
    projectId
  );
  const version = db.prepare('SELECT * FROM project_versions WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ version });
});

app.delete('/api/projects/:id/versions/:versionId', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const versionId = Number(req.params.versionId);
  db.prepare('DELETE FROM project_versions WHERE id = ? AND project_id = ?').run(versionId, projectId);
  res.json({ deleted: true });
});

// ==================== MODULE 1: CHANGE DETECTION ROUTES ====================
app.post('/api/extract-file', authMiddleware, upload.single('file'), async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }
    const text = await extractTextFromFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ text, fileName: req.file.originalname });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to extract document text.' });
  }
});

app.post('/api/projects/:id/change-detection', authMiddleware, (req: AuthedRequest, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
      | { id: number; name: string }
      | undefined;
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const { oldVersion, newVersion, oldText, newText, autoChain } = req.body as {
      oldVersion?: string;
      newVersion?: string;
      oldText?: string;
      newText?: string;
      autoChain?: boolean;
    };

    if (!oldText?.trim() || !newText?.trim()) {
      res.status(400).json({ error: 'Both Version 1 (old) and Version 2 (new) requirement texts are required.' });
      return;
    }

    const vOld = oldVersion?.trim() || 'v1.0';
    const vNew = newVersion?.trim() || 'v2.0';
    const result = detectRequirementChanges(oldText, newText);

    const caInfo = db
      .prepare(`
        INSERT INTO change_analyses (project_id, old_version, new_version, old_text, new_text, summary_json, warnings_json, analysis_time_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        projectId,
        vOld,
        vNew,
        oldText,
        newText,
        JSON.stringify(result.summary),
        JSON.stringify(result.warnings),
        result.analysisTimeMs
      );
    const analysisId = Number(caInfo.lastInsertRowid);

    const insertChange = db.prepare(`
      INSERT INTO requirement_changes (analysis_id, project_id, req_code, change_type, old_text, new_text, similarity_score, change_size, severity, diff_tokens_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ch of result.changes) {
      insertChange.run(
        analysisId,
        projectId,
        ch.reqCode,
        ch.changeType,
        ch.oldText,
        ch.newText,
        ch.similarityScore,
        ch.changeSize,
        ch.severity,
        JSON.stringify(ch.diffTokens)
      );
    }

    // Update project's current version & version snapshots if new
    db.prepare("UPDATE projects SET current_version = ?, updated_at = datetime('now') WHERE id = ?").run(
      vNew,
      projectId
    );

    let impactAnalysisId: number | null = null;
    let prioritizationId: number | null = null;

    // Automatically chain Module 2 & Module 3 if components exist (or autoChain requested)
    if (autoChain !== false) {
      const components = db.prepare('SELECT * FROM components WHERE project_id = ?').all(projectId) as ComponentRecord[];
      if (components.length > 0) {
        const links = db
          .prepare('SELECT * FROM traceability_links WHERE project_id = ?')
          .all(projectId) as LinkRecord[];
        const impactRes = analyzeImpact(result.changes, components, links);
        const iaInfo = db
          .prepare(`
            INSERT INTO impact_analyses (project_id, change_analysis_id, affected_nodes_json, impact_paths_json, summary_json, analysis_time_ms)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(
            projectId,
            analysisId,
            JSON.stringify(impactRes.affectedNodes),
            JSON.stringify(impactRes.impactPaths),
            JSON.stringify(impactRes.summary),
            impactRes.analysisTimeMs
          );
        impactAnalysisId = Number(iaInfo.lastInsertRowid);

        const prioRes = prioritizeTests(impactRes.affectedNodes, components);
        const recIds = prioRes.rankedTests.filter((t) => t.recommendedSelected).map((t) => t.componentId);
        const metrics = computeEvaluationMetrics(
          prioRes.rankedTests,
          recIds,
          null,
          Number((result.analysisTimeMs + impactRes.analysisTimeMs).toFixed(2))
        );
        const tpInfo = db
          .prepare(`
            INSERT INTO test_prioritizations (project_id, impact_analysis_id, ranked_tests_json, total_time_sec, prioritized_time_sec, time_saved_sec, tests_saved_count, metrics_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            projectId,
            impactAnalysisId,
            JSON.stringify(prioRes.rankedTests),
            prioRes.totalTimeSec,
            prioRes.prioritizedTimeSec,
            prioRes.timeSavedSec,
            prioRes.testsSavedCount,
            JSON.stringify(metrics)
          );
        prioritizationId = Number(tpInfo.lastInsertRowid);
      }
    }

    createNotification(
      req.user!.id,
      projectId,
      'Change Detection Complete',
      `${project.name}: Detected ${result.summary.totalChanges} requirement changes between ${vOld} and ${vNew}.`
    );

    res.status(201).json({
      analysisId,
      impactAnalysisId,
      prioritizationId,
      oldVersion: vOld,
      newVersion: vNew,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Change detection failed.' });
  }
});

app.get('/api/projects/:id/change-analyses', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const analyses = db
    .prepare('SELECT * FROM change_analyses WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as Array<{
      id: number;
      project_id: number;
      old_version: string;
      new_version: string;
      old_text: string;
      new_text: string;
      summary_json: string;
      warnings_json: string;
      analysis_time_ms: number;
      created_at: string;
    }>;

  const enriched = analyses.map((a) => {
    const items = db
      .prepare('SELECT * FROM requirement_changes WHERE analysis_id = ? ORDER BY id ASC')
      .all(a.id) as Array<{
        id: number;
        req_code: string;
        change_type: string;
        old_text: string;
        new_text: string;
        similarity_score: number;
        change_size: number;
        severity: string;
        diff_tokens_json: string;
      }>;
    return {
      id: a.id,
      project_id: a.project_id,
      oldVersion: a.old_version,
      newVersion: a.new_version,
      oldText: a.old_text,
      newText: a.new_text,
      summary: JSON.parse(a.summary_json),
      warnings: JSON.parse(a.warnings_json),
      analysisTimeMs: a.analysis_time_ms,
      createdAt: a.created_at,
      changes: items.map((i) => ({
        id: i.id,
        reqCode: i.req_code,
        changeType: i.change_type,
        oldText: i.old_text,
        newText: i.new_text,
        similarityScore: i.similarity_score,
        changeSize: i.change_size,
        severity: i.severity,
        diffTokens: JSON.parse(i.diff_tokens_json),
      })),
    };
  });

  res.json({ analyses: enriched });
});

// ==================== MODULE 2: TRACEABILITY & IMPACT ANALYSIS ====================
app.get('/api/projects/:id/traceability', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const components = db
    .prepare('SELECT * FROM components WHERE project_id = ? ORDER BY layer, comp_code')
    .all(projectId) as ComponentRecord[];
  const links = db
    .prepare('SELECT * FROM traceability_links WHERE project_id = ?')
    .all(projectId) as LinkRecord[];
  res.json({ components, links });
});

app.post('/api/projects/:id/components', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const { comp_code, name, layer, description, risk_weight, execution_time_sec, past_failures } = req.body as {
    comp_code?: string;
    name?: string;
    layer?: 'requirement' | 'design' | 'code' | 'test';
    description?: string;
    risk_weight?: number;
    execution_time_sec?: number;
    past_failures?: number;
  };
  if (!comp_code?.trim() || !name?.trim() || !layer) {
    res.status(400).json({ error: 'Component code, name, and layer are required.' });
    return;
  }
  try {
    const info = db
      .prepare(`
        INSERT INTO components (project_id, comp_code, name, layer, description, risk_weight, execution_time_sec, past_failures, total_runs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        projectId,
        comp_code.trim().toUpperCase(),
        name.trim(),
        layer,
        description?.trim() || '',
        Math.min(1, Math.max(0.1, Number(risk_weight ?? 0.6))),
        Math.max(1, Number(execution_time_sec ?? 15)),
        Math.max(0, Number(past_failures ?? 0)),
        Math.max(0, Number(past_failures ?? 0))
      );
    const component = db.prepare('SELECT * FROM components WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ component });
  } catch {
    res.status(409).json({ error: `Component code "${comp_code.trim().toUpperCase()}" already exists in this project.` });
  }
});

app.delete('/api/projects/:id/components/:compId', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const compId = Number(req.params.compId);
  db.prepare('DELETE FROM components WHERE id = ? AND project_id = ?').run(compId, projectId);
  res.json({ deleted: true });
});

app.post('/api/projects/:id/links', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const { source_id, target_id, link_type, weight } = req.body as {
    source_id?: number;
    target_id?: number;
    link_type?: string;
    weight?: number;
  };
  if (!source_id || !target_id || source_id === target_id) {
    res.status(400).json({ error: 'Select two distinct components to link.' });
    return;
  }
  try {
    const info = db
      .prepare(`
        INSERT INTO traceability_links (project_id, source_id, target_id, link_type, weight)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(projectId, source_id, target_id, link_type || 'depends_on', Math.min(1, Math.max(0.2, Number(weight ?? 1.0))));
    const link = db.prepare('SELECT * FROM traceability_links WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json({ link });
  } catch {
    res.status(409).json({ error: 'This traceability link already exists.' });
  }
});

app.delete('/api/projects/:id/links/:linkId', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const linkId = Number(req.params.linkId);
  db.prepare('DELETE FROM traceability_links WHERE id = ? AND project_id = ?').run(linkId, projectId);
  res.json({ deleted: true });
});

app.post('/api/projects/:id/impact-analysis', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const { changeAnalysisId } = req.body as { changeAnalysisId?: number };

  const ca = changeAnalysisId
    ? (db.prepare('SELECT * FROM change_analyses WHERE id = ? AND project_id = ?').get(changeAnalysisId, projectId) as
        | { id: number; analysis_time_ms: number }
        | undefined)
    : (db
        .prepare('SELECT * FROM change_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(projectId) as { id: number; analysis_time_ms: number } | undefined);

  if (!ca) {
    res.status(400).json({ error: 'Run Requirement Change Detection (Module 1) first before running Impact Analysis.' });
    return;
  }

  const changeRows = db
    .prepare('SELECT * FROM requirement_changes WHERE analysis_id = ?')
    .all(ca.id) as Array<{
      req_code: string;
      change_type: DetectedChange['changeType'];
      old_text: string;
      new_text: string;
      similarity_score: number;
      change_size: number;
      severity: DetectedChange['severity'];
      diff_tokens_json: string;
    }>;

  const changes: DetectedChange[] = changeRows.map((r) => ({
    reqCode: r.req_code,
    changeType: r.change_type,
    oldText: r.old_text,
    newText: r.new_text,
    similarityScore: r.similarity_score,
    changeSize: r.change_size,
    severity: r.severity,
    diffTokens: JSON.parse(r.diff_tokens_json),
  }));

  const components = db.prepare('SELECT * FROM components WHERE project_id = ?').all(projectId) as ComponentRecord[];
  const links = db.prepare('SELECT * FROM traceability_links WHERE project_id = ?').all(projectId) as LinkRecord[];

  if (components.length === 0) {
    res.status(400).json({ error: 'Add traceability components (Requirements, Design, Code, Tests) before running Impact Analysis.' });
    return;
  }

  const impactResult = analyzeImpact(changes, components, links);
  const iaInfo = db
    .prepare(`
      INSERT INTO impact_analyses (project_id, change_analysis_id, affected_nodes_json, impact_paths_json, summary_json, analysis_time_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      projectId,
      ca.id,
      JSON.stringify(impactResult.affectedNodes),
      JSON.stringify(impactResult.impactPaths),
      JSON.stringify(impactResult.summary),
      impactResult.analysisTimeMs
    );
  const impactAnalysisId = Number(iaInfo.lastInsertRowid);

  // Chain Module 3 prioritization automatically
  const prioRes = prioritizeTests(impactResult.affectedNodes, components);
  const recIds = prioRes.rankedTests.filter((t) => t.recommendedSelected).map((t) => t.componentId);
  const metrics = computeEvaluationMetrics(
    prioRes.rankedTests,
    recIds,
    null,
    Number((ca.analysis_time_ms + impactResult.analysisTimeMs).toFixed(2))
  );
  const tpInfo = db
    .prepare(`
      INSERT INTO test_prioritizations (project_id, impact_analysis_id, ranked_tests_json, total_time_sec, prioritized_time_sec, time_saved_sec, tests_saved_count, metrics_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      projectId,
      impactAnalysisId,
      JSON.stringify(prioRes.rankedTests),
      prioRes.totalTimeSec,
      prioRes.prioritizedTimeSec,
      prioRes.timeSavedSec,
      prioRes.testsSavedCount,
      JSON.stringify(metrics)
    );

  res.status(201).json({
    impactAnalysisId,
    prioritizationId: Number(tpInfo.lastInsertRowid),
    changeAnalysisId: ca.id,
    ...impactResult,
  });
});

app.get('/api/projects/:id/impact-analyses', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const rows = db
    .prepare('SELECT * FROM impact_analyses WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as Array<{
      id: number;
      project_id: number;
      change_analysis_id: number;
      affected_nodes_json: string;
      impact_paths_json: string;
      summary_json: string;
      analysis_time_ms: number;
      created_at: string;
    }>;

  res.json({
    impactAnalyses: rows.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      changeAnalysisId: r.change_analysis_id,
      affectedNodes: JSON.parse(r.affected_nodes_json),
      impactPaths: JSON.parse(r.impact_paths_json),
      summary: JSON.parse(r.summary_json),
      analysisTimeMs: r.analysis_time_ms,
      createdAt: r.created_at,
    })),
  });
});

// ==================== MODULE 3: TEST PRIORITIZATION & EXECUTION ====================
app.get('/api/projects/:id/prioritizations', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const rows = db
    .prepare('SELECT * FROM test_prioritizations WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as Array<{
      id: number;
      project_id: number;
      impact_analysis_id: number | null;
      ranked_tests_json: string;
      total_time_sec: number;
      prioritized_time_sec: number;
      time_saved_sec: number;
      tests_saved_count: number;
      metrics_json: string;
      created_at: string;
    }>;

  res.json({
    prioritizations: rows.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      impactAnalysisId: r.impact_analysis_id,
      rankedTests: JSON.parse(r.ranked_tests_json),
      totalTimeSec: r.total_time_sec,
      prioritizedTimeSec: r.prioritized_time_sec,
      timeSavedSec: r.time_saved_sec,
      testsSavedCount: r.tests_saved_count,
      metrics: JSON.parse(r.metrics_json),
      createdAt: r.created_at,
    })),
  });
});

app.post('/api/projects/:id/prioritize', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const components = db.prepare('SELECT * FROM components WHERE project_id = ?').all(projectId) as ComponentRecord[];
  const latestIa = db
    .prepare('SELECT * FROM impact_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(projectId) as { id: number; affected_nodes_json: string; analysis_time_ms: number; change_analysis_id: number } | undefined;

  if (!latestIa) {
    res.status(400).json({ error: 'Run Impact Analysis (Module 2) before prioritizing regression tests.' });
    return;
  }

  const affectedNodes = JSON.parse(latestIa.affected_nodes_json);
  const prioRes = prioritizeTests(affectedNodes, components);
  const recIds = prioRes.rankedTests.filter((t) => t.recommendedSelected).map((t) => t.componentId);
  const ca = db.prepare('SELECT analysis_time_ms FROM change_analyses WHERE id = ?').get(latestIa.change_analysis_id) as
    | { analysis_time_ms: number }
    | undefined;
  const totalAnalysisMs = Number(((ca?.analysis_time_ms ?? 0) + latestIa.analysis_time_ms).toFixed(2));
  const metrics = computeEvaluationMetrics(prioRes.rankedTests, recIds, null, totalAnalysisMs);

  const info = db
    .prepare(`
      INSERT INTO test_prioritizations (project_id, impact_analysis_id, ranked_tests_json, total_time_sec, prioritized_time_sec, time_saved_sec, tests_saved_count, metrics_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      projectId,
      latestIa.id,
      JSON.stringify(prioRes.rankedTests),
      prioRes.totalTimeSec,
      prioRes.prioritizedTimeSec,
      prioRes.timeSavedSec,
      prioRes.testsSavedCount,
      JSON.stringify(metrics)
    );

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    ...prioRes,
    metrics,
  });
});

app.post('/api/projects/:id/simulate-run', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const { prioritizationId, selectedComponentIds } = req.body as {
    prioritizationId?: number;
    selectedComponentIds?: number[];
  };

  const tp = prioritizationId
    ? (db.prepare('SELECT * FROM test_prioritizations WHERE id = ? AND project_id = ?').get(prioritizationId, projectId) as
        | { id: number; ranked_tests_json: string; impact_analysis_id: number | null; metrics_json: string }
        | undefined)
    : (db
        .prepare('SELECT * FROM test_prioritizations WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(projectId) as
        | { id: number; ranked_tests_json: string; impact_analysis_id: number | null; metrics_json: string }
        | undefined);

  if (!tp) {
    res.status(400).json({ error: 'No prioritization plan exists for this project.' });
    return;
  }

  const rankedTests = JSON.parse(tp.ranked_tests_json) as PrioritizedTest[];
  const selectedIds =
    selectedComponentIds && selectedComponentIds.length > 0
      ? selectedComponentIds
      : rankedTests.filter((t) => t.recommendedSelected).map((t) => t.componentId);

  const sim = simulateTestExecution(rankedTests, selectedIds);

  const runInfo = db
    .prepare(`
      INSERT INTO test_runs (project_id, prioritization_id, run_mode, total_duration_sec, passed_count, failed_count, skipped_count, results_json)
      VALUES (?, ?, 'simulated', ?, ?, ?, ?, ?)
    `)
    .run(
      projectId,
      tp.id,
      sim.totalDurationSec,
      sim.passedCount,
      sim.failedCount,
      sim.skippedCount,
      JSON.stringify(sim.results)
    );

  // Update evaluation metrics on this prioritization based on actual run results
  const prevMetrics = JSON.parse(tp.metrics_json) as { analysisTimeMs?: number };
  const updatedMetrics = computeEvaluationMetrics(
    rankedTests,
    selectedIds,
    sim.results,
    prevMetrics.analysisTimeMs ?? 0
  );
  db.prepare('UPDATE test_prioritizations SET metrics_json = ? WHERE id = ?').run(JSON.stringify(updatedMetrics), tp.id);

  // Update component run counters
  for (const r of sim.results) {
    if (r.status !== 'skipped') {
      db.prepare('UPDATE components SET total_runs = total_runs + 1 WHERE id = ?').run(r.componentId);
    }
  }

  createNotification(
    req.user!.id,
    projectId,
    'Simulated Test Run Recorded',
    `Executed ${sim.passedCount + sim.failedCount} tests (${sim.passedCount} passed, ${sim.failedCount} failed, ${sim.skippedCount} skipped).`
  );

  const runRow = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(Number(runInfo.lastInsertRowid));
  res.status(201).json({ run: runRow, results: sim.results, metrics: updatedMetrics });
});

// ==================== TEST EXECUTION HISTORY ====================
app.get('/api/test-runs', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const rows = db
    .prepare(
      projectId
        ? `SELECT tr.*, p.name as project_name, p.is_demo FROM test_runs tr JOIN projects p ON tr.project_id = p.id WHERE tr.project_id = ? ORDER BY tr.executed_at DESC`
        : `SELECT tr.*, p.name as project_name, p.is_demo FROM test_runs tr JOIN projects p ON tr.project_id = p.id ORDER BY tr.executed_at DESC`
    )
    .all(...(projectId ? [projectId] : [])) as Array<{
      id: number;
      project_id: number;
      project_name: string;
      is_demo: number;
      prioritization_id: number | null;
      run_mode: string;
      executed_at: string;
      total_duration_sec: number;
      passed_count: number;
      failed_count: number;
      skipped_count: number;
      results_json: string;
    }>;

  res.json({
    runs: rows.map((r) => ({
      ...r,
      results: JSON.parse(r.results_json) as SimulatedTestResultItem[],
    })),
  });
});

// ==================== REPORTS & ANALYTICS ====================
app.get('/api/projects/:id/report', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const latestCa = db
    .prepare('SELECT * FROM change_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(projectId) as
    | {
        id: number;
        old_version: string;
        new_version: string;
        summary_json: string;
        analysis_time_ms: number;
        created_at: string;
      }
    | undefined;

  const changes = latestCa
    ? (db.prepare('SELECT * FROM requirement_changes WHERE analysis_id = ? ORDER BY id ASC').all(latestCa.id) as Array<
        Record<string, unknown>
      >)
    : [];

  const latestIa = db
    .prepare('SELECT * FROM impact_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(projectId) as
    | {
        id: number;
        affected_nodes_json: string;
        impact_paths_json: string;
        summary_json: string;
        analysis_time_ms: number;
        created_at: string;
      }
    | undefined;

  const latestTp = db
    .prepare('SELECT * FROM test_prioritizations WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(projectId) as
    | {
        id: number;
        ranked_tests_json: string;
        total_time_sec: number;
        prioritized_time_sec: number;
        time_saved_sec: number;
        tests_saved_count: number;
        metrics_json: string;
        created_at: string;
      }
    | undefined;

  const latestRun = db
    .prepare('SELECT * FROM test_runs WHERE project_id = ? ORDER BY executed_at DESC LIMIT 1')
    .get(projectId) as
    | {
        id: number;
        run_mode: string;
        executed_at: string;
        total_duration_sec: number;
        passed_count: number;
        failed_count: number;
        skipped_count: number;
        results_json: string;
      }
    | undefined;

  res.json({
    project,
    changeAnalysis: latestCa
      ? {
          id: latestCa.id,
          oldVersion: latestCa.old_version,
          newVersion: latestCa.new_version,
          summary: JSON.parse(latestCa.summary_json),
          analysisTimeMs: latestCa.analysis_time_ms,
          createdAt: latestCa.created_at,
          changes: changes.map((c) => ({
            reqCode: c.req_code,
            changeType: c.change_type,
            oldText: c.old_text,
            newText: c.new_text,
            changeSize: c.change_size,
            severity: c.severity,
          })),
        }
      : null,
    impactAnalysis: latestIa
      ? {
          id: latestIa.id,
          affectedNodes: JSON.parse(latestIa.affected_nodes_json),
          impactPaths: JSON.parse(latestIa.impact_paths_json),
          summary: JSON.parse(latestIa.summary_json),
          analysisTimeMs: latestIa.analysis_time_ms,
          createdAt: latestIa.created_at,
        }
      : null,
    prioritization: latestTp
      ? {
          id: latestTp.id,
          rankedTests: JSON.parse(latestTp.ranked_tests_json),
          totalTimeSec: latestTp.total_time_sec,
          prioritizedTimeSec: latestTp.prioritized_time_sec,
          timeSavedSec: latestTp.time_saved_sec,
          testsSavedCount: latestTp.tests_saved_count,
          metrics: JSON.parse(latestTp.metrics_json),
          createdAt: latestTp.created_at,
        }
      : null,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          runMode: latestRun.run_mode,
          executedAt: latestRun.executed_at,
          totalDurationSec: latestRun.total_duration_sec,
          passedCount: latestRun.passed_count,
          failedCount: latestRun.failed_count,
          skippedCount: latestRun.skipped_count,
          results: JSON.parse(latestRun.results_json),
        }
      : null,
  });
});

// ==================== INTEGRATIONS ROUTES ====================
app.get('/api/projects/:id/integrations', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const rows = db.prepare('SELECT * FROM integrations WHERE project_id = ?').all(projectId) as Array<{
    id: number;
    project_id: number;
    provider: string;
    status: string;
    config_json: string;
    last_checked_at: string | null;
    last_message: string;
  }>;

  res.json({
    integrations: rows.map((r) => {
      const cfg = JSON.parse(r.config_json) as Record<string, string>;
      // Mask sensitive token fields before returning to client
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (k.toLowerCase().includes('token') || k.toLowerCase().includes('secret')) {
          masked[k] = v ? `••••${v.slice(-4)}` : '';
        } else {
          masked[k] = v;
        }
      }
      return {
        ...r,
        config: masked,
      };
    }),
  });
});

app.post('/api/projects/:id/integrations/:provider/test', authMiddleware, async (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const provider = req.params.provider;
  const config = req.body as Record<string, string>;

  if (!['github', 'git', 'jenkins', 'github_actions'].includes(provider)) {
    res.status(400).json({ error: 'Unknown integration provider.' });
    return;
  }

  let status = 'not_connected';
  let message = 'Missing required configuration fields.';

  try {
    if (provider === 'github' || provider === 'github_actions') {
      const repo = (config.repository || '').trim();
      const token = (config.token || '').trim();
      if (!repo || !repo.includes('/')) {
        throw new Error('Provide repository in owner/repo format (e.g. octocat/hello-world).');
      }
      if (!token) {
        throw new Error('Personal Access Token is required to verify authenticated GitHub connectivity.');
      }
      const ghRes = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ChangeGuard-App',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!ghRes.ok) {
        throw new Error(`GitHub API responded with HTTP ${ghRes.status}. Verify repository name and token scopes.`);
      }
      status = 'connected';
      message = `Connected and verified repository "${repo}".`;
    } else if (provider === 'jenkins') {
      const serverUrl = (config.serverUrl || '').trim();
      const jobName = (config.jobName || '').trim();
      const apiToken = (config.apiToken || '').trim();
      if (!serverUrl || !jobName || !apiToken) {
        throw new Error('Jenkins Server URL, Job Name, and API Token are required.');
      }
      const parsed = new URL(serverUrl);
      const jenkinsRes = await fetch(`${parsed.origin}/api/json`, {
        headers: config.username
          ? { Authorization: `Basic ${Buffer.from(`${config.username}:${apiToken}`).toString('base64')}` }
          : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!jenkinsRes.ok) {
        throw new Error(`Jenkins endpoint returned HTTP ${jenkinsRes.status}.`);
      }
      status = 'connected';
      message = `Connected to Jenkins job "${jobName}".`;
    } else if (provider === 'git') {
      const remoteUrl = (config.remoteUrl || '').trim();
      const branch = (config.branch || '').trim();
      if (!remoteUrl || !branch) {
        throw new Error('Git remote URL and default branch are required.');
      }
      const parsed = new URL(remoteUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Use an HTTPS Git repository URL to verify connectivity.');
      }
      const probe = await fetch(remoteUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (probe.status >= 400 && probe.status !== 401) {
        throw new Error(`Git remote returned HTTP ${probe.status}.`);
      }
      if (probe.status === 401 && !config.accessToken) {
        throw new Error('Repository requires authentication; provide an access token.');
      }
      status = 'connected';
      message = `Verified Git remote "${remoteUrl}" (${branch}).`;
    }
  } catch (err) {
    status = 'not_connected';
    message = err instanceof Error ? err.message : 'Connectivity check failed.';
  }

  db.prepare(`
    INSERT INTO integrations (project_id, provider, status, config_json, last_checked_at, last_message)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(project_id, provider) DO UPDATE SET
      status = excluded.status,
      config_json = excluded.config_json,
      last_checked_at = datetime('now'),
      last_message = excluded.last_message
  `).run(projectId, provider, status, JSON.stringify(config), message);

  const row = db
    .prepare('SELECT * FROM integrations WHERE project_id = ? AND provider = ?')
    .get(projectId, provider);

  if (status !== 'connected') {
    res.status(400).json({ error: message, integration: row });
    return;
  }
  res.json({ integration: row, message });
});

app.post('/api/projects/:id/integrations/:provider/disconnect', authMiddleware, (req: AuthedRequest, res: Response) => {
  const projectId = Number(req.params.id);
  const provider = req.params.provider;
  db.prepare(`
    UPDATE integrations SET status = 'not_connected', config_json = '{}', last_checked_at = datetime('now'),
      last_message = 'Disconnected — Not Connected'
    WHERE project_id = ? AND provider = ?
  `).run(projectId, provider);
  res.json({ disconnected: true });
});

// ==================== NOTIFICATIONS & SYSTEM ====================
app.get('/api/notifications', authMiddleware, (req: AuthedRequest, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 20')
    .all(req.user!.id);
  res.json({ notifications: rows });
});

app.post('/api/notifications/read-all', authMiddleware, (req: AuthedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL').run(req.user!.id);
  res.json({ ok: true });
});

app.get('/api/system/status', authMiddleware, (_req: AuthedRequest, res: Response) => {
  const stats = getDatabaseStats();
  res.json({
    database: {
      engine: 'SQLite (better-sqlite3 WAL)',
      status: 'Healthy',
      ...stats,
    },
    runtime: {
      backend: 'Node.js Express + TypeScript',
      nodeVersion: process.version,
      graphEngine: 'Directed Traceability Graph BFS/DFS Engine',
      nlpEngine: 'TF-IDF Cosine Similarity + Myers Word Diff',
      prioritizationEngine: 'Multi-Factor Weighted Regression Ranker',
    },
  });
});

// ==================== START SERVER + VITE ====================
async function startServer() {
  const httpServer = http.createServer(app);
  let viteServer: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const viteReady = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        },
        appType: 'spa',
      })
    );

    viteReady
      .then((v) => {
        viteServer = v;
      })
      .catch((err) => {
        console.error('Failed to initialize Vite dev middleware:', err);
      });

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const vite = viteServer ?? (await viteReady);
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ChangeGuard server listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    if (viteServer) {
      await viteServer.close().catch(() => {});
    }
    httpServer.close(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start ChangeGuard server:', err);
  process.exit(1);
});

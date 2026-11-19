import bcrypt from 'bcryptjs';
import { db } from './db.ts';
import {
  analyzeImpact,
  computeEvaluationMetrics,
  detectRequirementChanges,
  prioritizeTests,
  simulateTestExecution,
  type ComponentRecord,
  type LinkRecord,
} from './analysis.ts';

export const DEMO_V1_REQUIREMENTS = `REQ-01: Users can log in using email and password.
REQ-02: Users can reset forgotten passwords via verified email recovery links.
REQ-03: Users can view checking and savings account balances and recent transactions.
REQ-04: Users can transfer money between internal and external linked accounts.
REQ-05: System records an immutable audit log of authentication and transfer events.`;

export const DEMO_V2_REQUIREMENTS = `REQ-01: Users can log in using email, password, and a mandatory two-factor authentication (2FA) one-time verification code.
REQ-02: Users can reset forgotten passwords via verified email recovery links.
REQ-03: Users can view checking and savings account balances and recent transactions.
REQ-04: Users can transfer money between internal and external linked accounts with 2FA confirmation for transfers above threshold.
REQ-05: System records an immutable audit log of authentication and transfer events.
REQ-06: Users can enroll and manage authenticator app or SMS two-factor authentication devices in security settings.`;

export function seedDatabaseIfEmpty(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const passwordHash = bcrypt.hashSync('ChangeGuard2026!', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, avatar_url, theme, preferences_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const userRes = insertUser.run(
    'Priya Nair',
    'demo@changeguard.edu',
    passwordHash,
    'Lead QA & Release Engineer',
    '/src/assets/images/avatar_engineer_user_1794974892087.jpg',
    'light',
    JSON.stringify({ defaultPrioritizationThreshold: 60, autoRunImpactOnDiff: true })
  );
  const demoUserId = Number(userRes.lastInsertRowid);

  // Create Online Banking System Demonstration Project
  const projRes = db.prepare(`
    INSERT INTO projects (name, description, current_version, is_demo, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'Online Banking System',
    'Demonstration enterprise banking platform illustrating requirement change detection (2FA addition in v2.0), traceability graph impact propagation, and regression test prioritization.',
    'v2.0',
    1,
    demoUserId
  );
  const projectId = Number(projRes.lastInsertRowid);

  // Save versions v1.0 and v2.0
  const insertVer = db.prepare(`
    INSERT INTO project_versions (project_id, version_label, notes, raw_text)
    VALUES (?, ?, ?, ?)
  `);
  insertVer.run(projectId, 'v1.0', 'Baseline authentication, balances, transfers, and audit logging.', DEMO_V1_REQUIREMENTS);
  insertVer.run(projectId, 'v2.0', 'Added mandatory two-factor authentication (2FA) for login and high-value transfers.', DEMO_V2_REQUIREMENTS);

  // Create Traceability Components (Requirement -> Design -> Code -> Test)
  const insertComp = db.prepare(`
    INSERT INTO components (project_id, comp_code, name, layer, description, risk_weight, execution_time_sec, past_failures, total_runs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const compMap = new Map<string, number>();
  const addComp = (
    code: string,
    name: string,
    layer: 'requirement' | 'design' | 'code' | 'test',
    desc: string,
    risk: number,
    execSec: number,
    pastFail: number,
    totalRuns: number
  ) => {
    const r = insertComp.run(projectId, code, name, layer, desc, risk, execSec, pastFail, totalRuns);
    compMap.set(code, Number(r.lastInsertRowid));
  };

  // Requirement Layer
  addComp('REQ-01', 'Email, Password & 2FA Login', 'requirement', 'Core user sign-in workflow and session initiation.', 0.95, 0, 0, 0);
  addComp('REQ-02', 'Forgot Password Recovery', 'requirement', 'Self-service password reset via signed email link.', 0.65, 0, 0, 0);
  addComp('REQ-03', 'Account Balance & Ledger View', 'requirement', 'Read-only checking and savings balance overview.', 0.60, 0, 0, 0);
  addComp('REQ-04', 'Internal & External Funds Transfer', 'requirement', 'Money movement between accounts with validation.', 0.92, 0, 0, 0);
  addComp('REQ-05', 'Security & Transaction Audit Log', 'requirement', 'Immutable security event and transfer logging.', 0.55, 0, 0, 0);

  // Design Layer
  addComp('DES-01', 'Authentication Sequence & MFA Gate', 'design', 'Login state machine, credential validation, and OTP challenge.', 0.92, 0, 0, 0);
  addComp('DES-02', 'Password Recovery Workflow', 'design', 'Tokenized email recovery and password reset flow.', 0.60, 0, 0, 0);
  addComp('DES-03', 'Account Summary UI & API Contract', 'design', 'Balance aggregation read model and ledger display.', 0.55, 0, 0, 0);
  addComp('DES-04', 'Funds Transfer Orchestration', 'design', 'Atomic debit/credit pipeline and step-up verification.', 0.88, 0, 0, 0);
  addComp('DES-05', 'Audit Event Pipeline', 'design', 'Structured security telemetry sink and retention rules.', 0.50, 0, 0, 0);

  // Code Layer
  addComp('MOD-01', 'AuthController.ts', 'code', 'Handles login requests, lockout policy, and 2FA challenge.', 0.95, 0, 0, 0);
  addComp('MOD-02', 'SessionTokenService.ts', 'code', 'Issues JWTs, MFA verification claims, and refresh rotation.', 0.90, 0, 0, 0);
  addComp('MOD-03', 'PasswordResetService.ts', 'code', 'Generates and validates one-time password reset tokens.', 0.60, 0, 0, 0);
  addComp('MOD-04', 'AccountBalanceService.ts', 'code', 'Queries real-time checking and savings balances.', 0.55, 0, 0, 0);
  addComp('MOD-05', 'TransferProcessor.ts', 'code', 'Executes internal/external transfers and validates limits.', 0.90, 0, 0, 0);
  addComp('MOD-06', 'AuditLogger.ts', 'code', 'Appends tamper-evident event records to audit store.', 0.45, 0, 0, 0);

  // Test Layer
  addComp('TC-01', 'Verify Email, Password & 2FA Login', 'test', 'Validates successful login with credentials + valid OTP.', 0.95, 14, 2, 12);
  addComp('TC-02', 'Verify Invalid Login & OTP Lockout', 'test', 'Ensures account locks after 5 invalid credential or OTP attempts.', 0.90, 18, 1, 12);
  addComp('TC-03', 'Verify Session Token & MFA Claim Expiry', 'test', 'Verifies JWT cannot access protected routes without MFA claim.', 0.88, 16, 2, 12);
  addComp('TC-04', 'Verify Forgot Password Email Reset', 'test', 'Tests recovery token generation, expiry, and password update.', 0.60, 22, 0, 10);
  addComp('TC-05', 'Verify Account Balance Display Accuracy', 'test', 'Checks checking/savings balances and transaction history rendering.', 0.55, 15, 0, 10);
  addComp('TC-06', 'Verify Internal & External Transfer Flow', 'test', 'Executes transfer and checks step-up verification & ledger update.', 0.90, 32, 1, 12);
  addComp('TC-07', 'Verify Insufficient Funds Rejection', 'test', 'Confirms overdraft transfers are rejected cleanly.', 0.65, 20, 0, 10);
  addComp('TC-08', 'Verify Audit Log Entry Creation', 'test', 'Asserts login and transfer events appear in immutable audit log.', 0.50, 16, 0, 10);

  // Traceability Links (Requirement -> Design -> Code -> Test + Cross-Module Dependencies)
  const insertLink = db.prepare(`
    INSERT INTO traceability_links (project_id, source_id, target_id, link_type, weight)
    VALUES (?, ?, ?, ?, ?)
  `);
  const link = (from: string, to: string, type = 'depends_on', weight = 1.0) => {
    const s = compMap.get(from);
    const t = compMap.get(to);
    if (s && t) insertLink.run(projectId, s, t, type, weight);
  };

  // Req -> Design
  link('REQ-01', 'DES-01', 'refines', 1.0);
  link('REQ-02', 'DES-02', 'refines', 1.0);
  link('REQ-03', 'DES-03', 'refines', 1.0);
  link('REQ-04', 'DES-04', 'refines', 1.0);
  link('REQ-05', 'DES-05', 'refines', 1.0);

  // Design -> Code
  link('DES-01', 'MOD-01', 'implements', 1.0);
  link('DES-01', 'MOD-02', 'implements', 0.95);
  link('DES-02', 'MOD-03', 'implements', 1.0);
  link('DES-03', 'MOD-04', 'implements', 1.0);
  link('DES-04', 'MOD-05', 'implements', 1.0);
  link('DES-05', 'MOD-06', 'implements', 1.0);

  // Code -> Code (indirect coupling: Auth/Session changes propagate to Transfer step-up and Audit)
  link('MOD-02', 'MOD-05', 'depends_on', 0.72);
  link('MOD-01', 'MOD-06', 'depends_on', 0.65);

  // Code -> Test
  link('MOD-01', 'TC-01', 'verifies', 1.0);
  link('MOD-01', 'TC-02', 'verifies', 1.0);
  link('MOD-02', 'TC-03', 'verifies', 1.0);
  link('MOD-03', 'TC-04', 'verifies', 1.0);
  link('MOD-04', 'TC-05', 'verifies', 1.0);
  link('MOD-05', 'TC-06', 'verifies', 1.0);
  link('MOD-05', 'TC-07', 'verifies', 0.75);
  link('MOD-06', 'TC-08', 'verifies', 1.0);

  // Run Module 1 -> Module 2 -> Module 3 pipeline for demo project
  const diffResult = detectRequirementChanges(DEMO_V1_REQUIREMENTS, DEMO_V2_REQUIREMENTS);
  const caRes = db.prepare(`
    INSERT INTO change_analyses (project_id, old_version, new_version, old_text, new_text, summary_json, warnings_json, analysis_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    'v1.0',
    'v2.0',
    DEMO_V1_REQUIREMENTS,
    DEMO_V2_REQUIREMENTS,
    JSON.stringify(diffResult.summary),
    JSON.stringify(diffResult.warnings),
    diffResult.analysisTimeMs
  );
  const changeAnalysisId = Number(caRes.lastInsertRowid);

  const insertChange = db.prepare(`
    INSERT INTO requirement_changes (analysis_id, project_id, req_code, change_type, old_text, new_text, similarity_score, change_size, severity, diff_tokens_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ch of diffResult.changes) {
    insertChange.run(
      changeAnalysisId,
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

  const allComponents = db.prepare('SELECT * FROM components WHERE project_id = ?').all(projectId) as ComponentRecord[];
  const allLinks = db.prepare('SELECT * FROM traceability_links WHERE project_id = ?').all(projectId) as LinkRecord[];

  const impactResult = analyzeImpact(diffResult.changes, allComponents, allLinks);
  const iaRes = db.prepare(`
    INSERT INTO impact_analyses (project_id, change_analysis_id, affected_nodes_json, impact_paths_json, summary_json, analysis_time_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    changeAnalysisId,
    JSON.stringify(impactResult.affectedNodes),
    JSON.stringify(impactResult.impactPaths),
    JSON.stringify(impactResult.summary),
    impactResult.analysisTimeMs
  );
  const impactAnalysisId = Number(iaRes.lastInsertRowid);

  const prioResult = prioritizeTests(impactResult.affectedNodes, allComponents);
  const recommendedIds = prioResult.rankedTests
    .filter((t) => t.recommendedSelected)
    .map((t) => t.componentId);

  const simRun = simulateTestExecution(prioResult.rankedTests, recommendedIds);
  const totalAnalysisMs = Number((diffResult.analysisTimeMs + impactResult.analysisTimeMs).toFixed(2));
  const metrics = computeEvaluationMetrics(prioResult.rankedTests, recommendedIds, simRun.results, totalAnalysisMs);

  const tpRes = db.prepare(`
    INSERT INTO test_prioritizations (project_id, impact_analysis_id, ranked_tests_json, total_time_sec, prioritized_time_sec, time_saved_sec, tests_saved_count, metrics_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    impactAnalysisId,
    JSON.stringify(prioResult.rankedTests),
    prioResult.totalTimeSec,
    prioResult.prioritizedTimeSec,
    prioResult.timeSavedSec,
    prioResult.testsSavedCount,
    JSON.stringify(metrics)
  );
  const prioritizationId = Number(tpRes.lastInsertRowid);

  db.prepare(`
    INSERT INTO test_runs (project_id, prioritization_id, run_mode, executed_at, total_duration_sec, passed_count, failed_count, skipped_count, results_json)
    VALUES (?, ?, 'simulated', datetime('now', '-2 hours'), ?, ?, ?, ?, ?)
  `).run(
    projectId,
    prioritizationId,
    simRun.totalDurationSec,
    simRun.passedCount,
    simRun.failedCount,
    simRun.skippedCount,
    JSON.stringify(simRun.results)
  );

  // Seed default Not Connected integrations
  const insertInt = db.prepare(`
    INSERT INTO integrations (project_id, provider, status, config_json, last_message)
    VALUES (?, ?, 'not_connected', '{}', 'Not Connected — Configure credentials to enable live sync')
  `);
  for (const provider of ['github', 'git', 'jenkins', 'github_actions']) {
    insertInt.run(projectId, provider);
  }

  // Seed initial notification
  db.prepare(`
    INSERT INTO notifications (user_id, project_id, title, message, is_read)
    VALUES (?, ?, ?, ?, 0)
  `).run(
    demoUserId,
    projectId,
    'Demonstration Analysis Ready',
    'Online Banking System v2.0 (2FA change) was analyzed. Review impacted modules and prioritized regression tests.'
  );
}

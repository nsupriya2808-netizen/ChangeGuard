export type ChangeType = 'added' | 'changed' | 'removed' | 'unchanged';
export type SeverityLevel = 'high' | 'medium' | 'low' | 'none';
export type LayerType = 'requirement' | 'design' | 'code' | 'test';
export type ImpactKind = 'direct' | 'indirect' | 'unaffected';
export type PriorityLevel = 'High' | 'Medium' | 'Low';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  theme: 'light' | 'dark';
  preferences_json: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  current_version: string;
  is_demo: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  componentCount?: number;
  versionCount?: number;
  analysisCount?: number;
  runCount?: number;
  changesCount?: number;
  affectedCount?: number;
  testsSaved?: number;
}

export interface ProjectVersion {
  id: number;
  project_id: number;
  version_label: string;
  notes: string;
  raw_text: string;
  created_at: string;
}

export interface DiffToken {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface DetectedChange {
  id?: number;
  reqCode: string;
  changeType: ChangeType;
  oldText: string;
  newText: string;
  similarityScore: number;
  changeSize: number;
  severity: SeverityLevel;
  diffTokens: DiffToken[];
}

export interface ChangeAnalysis {
  id: number;
  project_id: number;
  oldVersion: string;
  newVersion: string;
  oldText: string;
  newText: string;
  summary: {
    totalOld: number;
    totalNew: number;
    added: number;
    changed: number;
    removed: number;
    unchanged: number;
    totalChanges: number;
    averageChangeSize: number;
    highestSeverity: SeverityLevel;
  };
  warnings: string[];
  analysisTimeMs: number;
  createdAt: string;
  changes: DetectedChange[];
}

export interface ComponentRecord {
  id: number;
  project_id: number;
  comp_code: string;
  name: string;
  layer: LayerType;
  description: string;
  risk_weight: number;
  execution_time_sec: number;
  past_failures: number;
  total_runs: number;
}

export interface LinkRecord {
  id: number;
  project_id: number;
  source_id: number;
  target_id: number;
  link_type: string;
  weight: number;
}

export interface AffectedNode {
  componentId: number;
  compCode: string;
  name: string;
  layer: LayerType;
  impactKind: ImpactKind;
  impactScore: number;
  hopDistance: number;
  sourceRequirements: string[];
  riskWeight: number;
  executionTimeSec: number;
  pastFailures: number;
}

export interface ImpactPath {
  fromCode: string;
  toCode: string;
  pathCodes: string[];
  pathNames: string[];
  impactKind: 'direct' | 'indirect';
  hopDistance: number;
}

export interface ImpactAnalysis {
  id: number;
  project_id: number;
  changeAnalysisId: number;
  affectedNodes: AffectedNode[];
  impactPaths: ImpactPath[];
  summary: {
    totalComponents: number;
    directlyAffected: number;
    indirectlyAffected: number;
    unaffected: number;
    affectedRequirements: number;
    affectedDesign: number;
    affectedCode: number;
    affectedTests: number;
    averageImpactScore: number;
  };
  analysisTimeMs: number;
  createdAt: string;
}

export interface PrioritizedTest {
  componentId: number;
  compCode: string;
  name: string;
  description: string;
  impactKind: ImpactKind;
  impactScore: number;
  riskWeight: number;
  pastFailures: number;
  totalRuns: number;
  executionTimeSec: number;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  recommendedSelected: boolean;
  rank: number;
  sourceRequirements: string[];
  scoreBreakdown: {
    impactContribution: number;
    riskContribution: number;
    failureContribution: number;
    efficiencyContribution: number;
  };
  explanation: string;
}

export interface EvaluationMetrics {
  precision: number | null;
  recall: number | null;
  apfd: number | null;
  testsSaved: number;
  timeSavedSec: number;
  analysisTimeMs: number;
  hasSufficientData: boolean;
  notes: string;
}

export interface TestPrioritization {
  id: number;
  project_id: number;
  impactAnalysisId: number | null;
  rankedTests: PrioritizedTest[];
  totalTimeSec: number;
  prioritizedTimeSec: number;
  timeSavedSec: number;
  testsSavedCount: number;
  metrics: EvaluationMetrics;
  createdAt: string;
}

export interface SimulatedTestResultItem {
  componentId: number;
  compCode: string;
  name: string;
  rank: number;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  status: 'passed' | 'failed' | 'skipped';
  durationSec: number;
  failureDetail: string | null;
  impactKind: ImpactKind;
}

export interface TestRun {
  id: number;
  project_id: number;
  project_name?: string;
  is_demo?: number;
  prioritization_id: number | null;
  run_mode: string;
  executed_at: string;
  total_duration_sec: number;
  passed_count: number;
  failed_count: number;
  skipped_count: number;
  results: SimulatedTestResultItem[];
}

export interface IntegrationItem {
  id: number;
  project_id: number;
  provider: 'github' | 'git' | 'jenkins' | 'github_actions';
  status: 'not_connected' | 'connected' | 'error';
  config: Record<string, string>;
  last_checked_at: string | null;
  last_message: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  project_id: number | null;
  is_read: number;
  created_at: string;
}

export interface DashboardData {
  kpis: {
    totalProjects: number;
    totalRequirementsAnalyzed: number;
    changesDetected: number;
    affectedComponents: number;
    testsPrioritized: number;
    testsSaved: number;
  };
  charts: {
    changeDistribution: Array<{ name: string; value: number; fill: string }>;
    riskDistribution: Array<{ name: string; count: number; fill: string }>;
    regressionStatus: Array<{ name: string; value: number; fill: string }>;
  };
  recentActivity: Array<{
    id: string;
    type: 'change_detection' | 'impact_analysis' | 'test_run';
    projectId: number;
    projectName: string;
    isDemo: boolean;
    summary: string;
    timestamp: string;
  }>;
  recentProjects: Project[];
}

export type PageKey =
  | 'dashboard'
  | 'projects'
  | 'changes'
  | 'impact'
  | 'prioritization'
  | 'dependency-map'
  | 'test-history'
  | 'reports'
  | 'integrations'
  | 'settings';

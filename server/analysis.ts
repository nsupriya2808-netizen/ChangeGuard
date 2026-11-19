import { diffWords } from 'diff';

export type ChangeType = 'added' | 'changed' | 'removed' | 'unchanged';
export type SeverityLevel = 'high' | 'medium' | 'low' | 'none';
export type LayerType = 'requirement' | 'design' | 'code' | 'test';
export type ImpactKind = 'direct' | 'indirect' | 'unaffected';
export type PriorityLevel = 'High' | 'Medium' | 'Low';

export interface ParsedRequirement {
  reqCode: string;
  text: string;
  normalized: string;
}

export interface DiffToken {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface DetectedChange {
  reqCode: string;
  changeType: ChangeType;
  oldText: string;
  newText: string;
  similarityScore: number;
  changeSize: number;
  severity: SeverityLevel;
  diffTokens: DiffToken[];
}

export interface ChangeDetectionResult {
  changes: DetectedChange[];
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

export interface ImpactAnalysisResult {
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

export interface PrioritizationResult {
  rankedTests: PrioritizedTest[];
  totalTimeSec: number;
  prioritizedTimeSec: number;
  timeSavedSec: number;
  timeSavedPct: number;
  testsSavedCount: number;
  recommendedCount: number;
  totalTestsCount: number;
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

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'by',
  'is', 'are', 'be', 'must', 'should', 'can', 'will', 'using', 'via', 'from',
  'that', 'this', 'their', 'all', 'when', 'after', 'before', 'system',
]);

const HIGH_RISK_KEYWORDS = [
  'auth', 'authentication', 'login', 'password', '2fa', 'two-factor', 'otp',
  'security', 'token', 'transfer', 'payment', 'transaction', 'encrypt',
  'authorization', 'permission', 'lockout', 'fraud', 'audit', 'balance',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function cosineSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  const vocab = new Set<string>();

  for (const t of tokensA) {
    freqA.set(t, (freqA.get(t) ?? 0) + 1);
    vocab.add(t);
  }
  for (const t of tokensB) {
    freqB.set(t, (freqB.get(t) ?? 0) + 1);
    vocab.add(t);
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const term of vocab) {
    const va = freqA.get(term) ?? 0;
    const vb = freqB.get(term) ?? 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function extractTextFromFile(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
  const ext = originalName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'txt' || ext === 'md' || mimeType === 'text/plain') {
    const text = buffer.toString('utf-8').trim();
    if (!text) {
      throw new Error(`The uploaded text file "${originalName}" is empty.`);
    }
    return text;
  }
  if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammothMod = await import('mammoth');
    const mammothLib = mammothMod.default ?? mammothMod;
    const res = await mammothLib.extractRawText({ buffer });
    const text = res.value.trim();
    if (!text) {
      throw new Error(`No readable text was found in DOCX file "${originalName}".`);
    }
    return text;
  }
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const res = await parser.getText();
      const text = res.text.trim();
      if (!text) {
        throw new Error(`No extractable text was found in PDF file "${originalName}".`);
      }
      return text;
    } finally {
      await parser.destroy();
    }
  }
  throw new Error(`Unsupported file format ".${ext}". Supported formats are TXT, PDF, and DOCX.`);
}

export function parseRequirementsText(rawText: string, labelPrefix: string): { items: ParsedRequirement[]; warnings: string[] } {
  const warnings: string[] = [];
  const rawLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    return { items: [], warnings: [`${labelPrefix} contains no requirement statements.`] };
  }

  const seenNormalized = new Set<string>();
  const seenCodes = new Set<string>();
  const items: ParsedRequirement[] = [];
  let autoIndex = 1;

  for (const line of rawLines) {
    // Strip leading bullets like "- " or "* " or "1. "
    const cleaned = line.replace(/^([-*•]|\d+[.)])\s+/, '').trim();
    if (!cleaned) continue;

    // Match explicit code like "REQ-01: ..." or "REQ-01 - ..." or "[REQ-01] ..."
    const codeMatch = cleaned.match(/^\[?([A-Z]{2,6}-\d{1,4})\]?\s*[:\-–]?\s*(.+)$/i);
    let reqCode: string;
    let bodyText: string;

    if (codeMatch) {
      reqCode = codeMatch[1].toUpperCase();
      bodyText = codeMatch[2].trim();
    } else {
      while (seenCodes.has(`REQ-${String(autoIndex).padStart(2, '0')}`)) {
        autoIndex++;
      }
      reqCode = `REQ-${String(autoIndex).padStart(2, '0')}`;
      autoIndex++;
      bodyText = cleaned;
    }

    const normalized = bodyText.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenNormalized.has(normalized)) {
      warnings.push(`Duplicate requirement skipped in ${labelPrefix}: "${bodyText.slice(0, 60)}${bodyText.length > 60 ? '...' : ''}"`);
      continue;
    }

    if (seenCodes.has(reqCode)) {
      let suffix = 2;
      while (seenCodes.has(`${reqCode}-${suffix}`)) suffix++;
      warnings.push(`Duplicate identifier ${reqCode} in ${labelPrefix}; reassigned to ${reqCode}-${suffix}.`);
      reqCode = `${reqCode}-${suffix}`;
    }

    seenNormalized.add(normalized);
    seenCodes.add(reqCode);
    items.push({ reqCode, text: bodyText, normalized });
  }

  return { items, warnings };
}

function classifySeverity(changeType: ChangeType, changeSize: number, combinedText: string): SeverityLevel {
  if (changeType === 'unchanged') return 'none';
  const lower = combinedText.toLowerCase();
  const hasHighRiskTerm = HIGH_RISK_KEYWORDS.some((kw) => lower.includes(kw));

  if (changeType === 'removed') {
    return hasHighRiskTerm ? 'high' : 'medium';
  }
  if (changeType === 'added') {
    return hasHighRiskTerm ? 'high' : 'medium';
  }
  // changed
  if (hasHighRiskTerm && changeSize >= 15) return 'high';
  if (changeSize >= 45) return 'high';
  if (changeSize >= 15 || hasHighRiskTerm) return 'medium';
  return 'low';
}

function computeWordChangeSize(oldStr: string, newStr: string): { changeSize: number; tokens: DiffToken[] } {
  const parts = diffWords(oldStr, newStr);
  const tokens: DiffToken[] = parts.map((p) => ({
    value: p.value,
    ...(p.added ? { added: true } : {}),
    ...(p.removed ? { removed: true } : {}),
  }));

  const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const oldWords = Math.max(1, countWords(oldStr));
  let changedWords = 0;
  for (const p of parts) {
    if (p.added || p.removed) {
      changedWords += countWords(p.value);
    }
  }
  const pct = Math.min(100, Math.round((changedWords / Math.max(oldWords, 1)) * 100));
  return { changeSize: pct, tokens };
}

export function detectRequirementChanges(oldText: string, newText: string): ChangeDetectionResult {
  const startTime = performance.now();

  const parsedOld = parseRequirementsText(oldText, 'Version 1');
  const parsedNew = parseRequirementsText(newText, 'Version 2');
  const warnings = [...parsedOld.warnings, ...parsedNew.warnings];

  const oldList = parsedOld.items;
  const newList = parsedNew.items;

  if (oldList.length === 0 && newList.length === 0) {
    throw new Error('Both Version 1 and Version 2 documents are empty. Provide requirements text to compare.');
  }

  const matchedOldIndices = new Set<number>();
  const matchedNewIndices = new Set<number>();
  const changes: DetectedChange[] = [];

  // Pass 1: Match by exact reqCode
  for (let i = 0; i < oldList.length; i++) {
    const oldItem = oldList[i];
    const j = newList.findIndex((n, idx) => !matchedNewIndices.has(idx) && n.reqCode === oldItem.reqCode);
    if (j !== -1) {
      matchedOldIndices.add(i);
      matchedNewIndices.add(j);
      const newItem = newList[j];
      if (oldItem.normalized === newItem.normalized) {
        changes.push({
          reqCode: oldItem.reqCode,
          changeType: 'unchanged',
          oldText: oldItem.text,
          newText: newItem.text,
          similarityScore: 1,
          changeSize: 0,
          severity: 'none',
          diffTokens: [{ value: newItem.text }],
        });
      } else {
        const sim = Number(cosineSimilarity(oldItem.text, newItem.text).toFixed(3));
        const { changeSize, tokens } = computeWordChangeSize(oldItem.text, newItem.text);
        changes.push({
          reqCode: oldItem.reqCode,
          changeType: 'changed',
          oldText: oldItem.text,
          newText: newItem.text,
          similarityScore: sim,
          changeSize,
          severity: classifySeverity('changed', changeSize, `${oldItem.text} ${newItem.text}`),
          diffTokens: tokens,
        });
      }
    }
  }

  // Pass 2: Match remaining items by semantic text similarity (cosine >= 0.42)
  for (let i = 0; i < oldList.length; i++) {
    if (matchedOldIndices.has(i)) continue;
    const oldItem = oldList[i];
    let bestJ = -1;
    let bestSim = 0;
    for (let j = 0; j < newList.length; j++) {
      if (matchedNewIndices.has(j)) continue;
      const sim = cosineSimilarity(oldItem.text, newList[j].text);
      if (sim > bestSim) {
        bestSim = sim;
        bestJ = j;
      }
    }
    if (bestJ !== -1 && bestSim >= 0.42) {
      matchedOldIndices.add(i);
      matchedNewIndices.add(bestJ);
      const newItem = newList[bestJ];
      if (oldItem.normalized === newItem.normalized) {
        changes.push({
          reqCode: newItem.reqCode,
          changeType: 'unchanged',
          oldText: oldItem.text,
          newText: newItem.text,
          similarityScore: 1,
          changeSize: 0,
          severity: 'none',
          diffTokens: [{ value: newItem.text }],
        });
      } else {
        const { changeSize, tokens } = computeWordChangeSize(oldItem.text, newItem.text);
        changes.push({
          reqCode: newItem.reqCode,
          changeType: 'changed',
          oldText: oldItem.text,
          newText: newItem.text,
          similarityScore: Number(bestSim.toFixed(3)),
          changeSize,
          severity: classifySeverity('changed', changeSize, `${oldItem.text} ${newItem.text}`),
          diffTokens: tokens,
        });
      }
    }
  }

  // Unmatched old -> removed
  for (let i = 0; i < oldList.length; i++) {
    if (matchedOldIndices.has(i)) continue;
    const oldItem = oldList[i];
    changes.push({
      reqCode: oldItem.reqCode,
      changeType: 'removed',
      oldText: oldItem.text,
      newText: '',
      similarityScore: 0,
      changeSize: 100,
      severity: classifySeverity('removed', 100, oldItem.text),
      diffTokens: [{ value: oldItem.text, removed: true }],
    });
  }

  // Unmatched new -> added
  for (let j = 0; j < newList.length; j++) {
    if (matchedNewIndices.has(j)) continue;
    const newItem = newList[j];
    changes.push({
      reqCode: newItem.reqCode,
      changeType: 'added',
      oldText: '',
      newText: newItem.text,
      similarityScore: 0,
      changeSize: 100,
      severity: classifySeverity('added', 100, newItem.text),
      diffTokens: [{ value: newItem.text, added: true }],
    });
  }

  // Sort by reqCode naturally
  changes.sort((a, b) => a.reqCode.localeCompare(b.reqCode, undefined, { numeric: true }));

  const added = changes.filter((c) => c.changeType === 'added').length;
  const changed = changes.filter((c) => c.changeType === 'changed').length;
  const removed = changes.filter((c) => c.changeType === 'removed').length;
  const unchanged = changes.filter((c) => c.changeType === 'unchanged').length;
  const modified = changes.filter((c) => c.changeType !== 'unchanged');
  const avgSize = modified.length > 0
    ? Math.round(modified.reduce((acc, c) => acc + c.changeSize, 0) / modified.length)
    : 0;

  let highestSeverity: SeverityLevel = 'none';
  if (changes.some((c) => c.severity === 'high')) highestSeverity = 'high';
  else if (changes.some((c) => c.severity === 'medium')) highestSeverity = 'medium';
  else if (changes.some((c) => c.severity === 'low')) highestSeverity = 'low';

  const analysisTimeMs = Number((performance.now() - startTime).toFixed(2));

  return {
    changes,
    summary: {
      totalOld: oldList.length,
      totalNew: newList.length,
      added,
      changed,
      removed,
      unchanged,
      totalChanges: added + changed + removed,
      averageChangeSize: avgSize,
      highestSeverity,
    },
    warnings,
    analysisTimeMs,
  };
}

export function analyzeImpact(
  changes: DetectedChange[],
  components: ComponentRecord[],
  links: LinkRecord[]
): ImpactAnalysisResult {
  const startTime = performance.now();

  const compById = new Map<number, ComponentRecord>();
  const compByCode = new Map<string, ComponentRecord>();
  for (const c of components) {
    compById.set(c.id, c);
    compByCode.set(c.comp_code.toUpperCase(), c);
  }

  // Build adjacency lists (directed forward + reverse design/code coupling)
  const adjacency = new Map<number, Array<{ targetId: number; weight: number }>>();
  for (const c of components) {
    adjacency.set(c.id, []);
  }
  for (const l of links) {
    const list = adjacency.get(l.source_id);
    if (list) {
      list.push({ targetId: l.target_id, weight: l.weight });
    }
  }

  const activeChanges = changes.filter((c) => c.changeType !== 'unchanged');

  const severityMultiplier = (sev: SeverityLevel): number => {
    if (sev === 'high') return 1.0;
    if (sev === 'medium') return 0.78;
    if (sev === 'low') return 0.58;
    return 0.4;
  };

  interface NodeState {
    hopDistance: number;
    impactScore: number;
    impactKind: ImpactKind;
    sourceRequirements: Set<string>;
  }

  const nodeStates = new Map<number, NodeState>();
  const impactPaths: ImpactPath[] = [];

  for (const ch of activeChanges) {
    let startComp = compByCode.get(ch.reqCode.toUpperCase());

    // If a newly added requirement doesn't yet exist as a component, map it by keyword similarity to related requirement/design nodes
    const seedNodes: Array<{ comp: ComponentRecord; initialDist: number }> = [];
    if (startComp) {
      seedNodes.push({ comp: startComp, initialDist: 0 });
    } else {
      const reqText = `${ch.newText} ${ch.oldText}`.trim();
      const reqAndDesignComps = components.filter((c) => c.layer === 'requirement' || c.layer === 'design');
      let bestMatch: { comp: ComponentRecord; sim: number } | null = null;
      for (const candidate of reqAndDesignComps) {
        const sim = cosineSimilarity(reqText, `${candidate.name} ${candidate.description}`);
        if (!bestMatch || sim > bestMatch.sim) {
          bestMatch = { comp: candidate, sim };
        }
      }
      if (bestMatch && bestMatch.sim >= 0.12) {
        seedNodes.push({ comp: bestMatch.comp, initialDist: 1 });
      }
    }

    for (const seed of seedNodes) {
      const sevMult = severityMultiplier(ch.severity);
      const queue: Array<{
        id: number;
        dist: number;
        score: number;
        pathIds: number[];
      }> = [
        {
          id: seed.comp.id,
          dist: seed.initialDist,
          score: Math.round(100 * sevMult * (seed.initialDist === 0 ? 1 : 0.78)),
          pathIds: [seed.comp.id],
        },
      ];

      const visitedInSeed = new Map<number, number>();
      visitedInSeed.set(seed.comp.id, seed.initialDist);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currComp = compById.get(current.id);
        if (!currComp) continue;

        const kind: ImpactKind = current.dist <= 1 || currComp.layer === 'requirement' ? 'direct' : (
          // Traceability chain Requirement(0)->Design(1)->Code(2)->Test(3) directly linked without lateral hop is direct if no cross-module jump
          current.pathIds.length <= 4 && current.pathIds.every((pid, idx) => {
            if (idx === 0) return true;
            const prev = compById.get(current.pathIds[idx - 1]);
            const cur = compById.get(pid);
            if (!prev || !cur) return false;
            const order: Record<LayerType, number> = { requirement: 0, design: 1, code: 2, test: 3 };
            return order[cur.layer] === order[prev.layer] + 1;
          })
            ? 'direct'
            : 'indirect'
        );

        const existing = nodeStates.get(current.id);
        if (!existing) {
          nodeStates.set(current.id, {
            hopDistance: current.dist,
            impactScore: current.score,
            impactKind: kind,
            sourceRequirements: new Set([ch.reqCode]),
          });
        } else {
          existing.hopDistance = Math.min(existing.hopDistance, current.dist);
          existing.impactScore = Math.max(existing.impactScore, current.score);
          if (kind === 'direct') existing.impactKind = 'direct';
          existing.sourceRequirements.add(ch.reqCode);
        }

        if (current.pathIds.length > 1) {
          const pathCodes = current.pathIds.map((pid) => compById.get(pid)?.comp_code ?? '');
          const pathNames = current.pathIds.map((pid) => compById.get(pid)?.name ?? '');
          impactPaths.push({
            fromCode: ch.reqCode,
            toCode: currComp.comp_code,
            pathCodes,
            pathNames,
            impactKind: kind === 'direct' ? 'direct' : 'indirect',
            hopDistance: current.dist,
          });
        }

        const neighbors = adjacency.get(current.id) ?? [];
        for (const edge of neighbors) {
          const nextDist = current.dist + 1;
          if (nextDist > 5) continue;
          const prevBest = visitedInSeed.get(edge.targetId);
          if (prevBest !== undefined && prevBest <= nextDist) continue;

          visitedInSeed.set(edge.targetId, nextDist);
          const targetComp = compById.get(edge.targetId);
          if (!targetComp) continue;

          // Decay factor per hop: 0.84 for direct chain, 0.72 for cross-module links
          const decay = edge.weight * (nextDist <= 3 ? 0.85 : 0.72);
          const nextScore = Math.max(15, Math.min(100, Math.round(current.score * decay + targetComp.risk_weight * 8)));
          queue.push({
            id: edge.targetId,
            dist: nextDist,
            score: nextScore,
            pathIds: [...current.pathIds, edge.targetId],
          });
        }
      }
    }
  }

  const affectedNodes: AffectedNode[] = components.map((c) => {
    const state = nodeStates.get(c.id);
    if (!state) {
      return {
        componentId: c.id,
        compCode: c.comp_code,
        name: c.name,
        layer: c.layer,
        impactKind: 'unaffected',
        impactScore: 0,
        hopDistance: -1,
        sourceRequirements: [],
        riskWeight: c.risk_weight,
        executionTimeSec: c.execution_time_sec,
        pastFailures: c.past_failures,
      };
    }
    return {
      componentId: c.id,
      compCode: c.comp_code,
      name: c.name,
      layer: c.layer,
      impactKind: state.impactKind,
      impactScore: state.impactScore,
      hopDistance: state.hopDistance,
      sourceRequirements: Array.from(state.sourceRequirements),
      riskWeight: c.risk_weight,
      executionTimeSec: c.execution_time_sec,
      pastFailures: c.past_failures,
    };
  });

  // Deduplicate paths keeping shortest per (fromCode, toCode)
  const uniquePathsMap = new Map<string, ImpactPath>();
  for (const p of impactPaths) {
    const key = `${p.fromCode}->${p.toCode}`;
    const existing = uniquePathsMap.get(key);
    if (!existing || p.hopDistance < existing.hopDistance) {
      uniquePathsMap.set(key, p);
    }
  }

  const affectedOnly = affectedNodes.filter((n) => n.impactKind !== 'unaffected');
  const directlyAffected = affectedOnly.filter((n) => n.impactKind === 'direct').length;
  const indirectlyAffected = affectedOnly.filter((n) => n.impactKind === 'indirect').length;
  const unaffected = affectedNodes.length - affectedOnly.length;
  const avgScore = affectedOnly.length > 0
    ? Math.round(affectedOnly.reduce((sum, n) => sum + n.impactScore, 0) / affectedOnly.length)
    : 0;

  const analysisTimeMs = Number((performance.now() - startTime).toFixed(2));

  return {
    affectedNodes,
    impactPaths: Array.from(uniquePathsMap.values()),
    summary: {
      totalComponents: components.length,
      directlyAffected,
      indirectlyAffected,
      unaffected,
      affectedRequirements: affectedOnly.filter((n) => n.layer === 'requirement').length,
      affectedDesign: affectedOnly.filter((n) => n.layer === 'design').length,
      affectedCode: affectedOnly.filter((n) => n.layer === 'code').length,
      affectedTests: affectedOnly.filter((n) => n.layer === 'test').length,
      averageImpactScore: avgScore,
    },
    analysisTimeMs,
  };
}

export function prioritizeTests(
  impactNodes: AffectedNode[],
  allComponents: ComponentRecord[]
): PrioritizationResult {
  const testComponents = allComponents.filter((c) => c.layer === 'test');
  const impactMap = new Map<number, AffectedNode>();
  for (const n of impactNodes) {
    impactMap.set(n.componentId, n);
  }

  const maxExecTime = Math.max(1, ...testComponents.map((t) => t.execution_time_sec));
  const maxFailures = Math.max(1, ...testComponents.map((t) => t.past_failures));

  const scored = testComponents.map((t) => {
    const impact = impactMap.get(t.id);
    const impactScore = impact?.impactScore ?? 0;
    const impactKind: ImpactKind = impact?.impactKind ?? 'unaffected';
    const sourceRequirements = impact?.sourceRequirements ?? [];

    const impactContribution = Number((0.45 * impactScore).toFixed(1));
    const riskContribution = Number((0.25 * (t.risk_weight * 100)).toFixed(1));
    const failureNormalized = t.past_failures > 0 ? Math.min(100, (t.past_failures / maxFailures) * 85 + 15) : 0;
    const failureContribution = Number((0.20 * failureNormalized).toFixed(1));
    const efficiencyNormalized = Math.max(0, 100 * (1 - t.execution_time_sec / (maxExecTime * 1.15)));
    const efficiencyContribution = Number((0.10 * efficiencyNormalized).toFixed(1));

    const priorityScore = Math.min(
      100,
      Math.round(impactContribution + riskContribution + failureContribution + efficiencyContribution)
    );

    let priorityLevel: PriorityLevel = 'Low';
    if (priorityScore >= 60 || (impactKind === 'direct' && priorityScore >= 50)) {
      priorityLevel = 'High';
    } else if (priorityScore >= 32 || impactKind === 'indirect') {
      priorityLevel = 'Medium';
    }

    const recommendedSelected = impactKind !== 'unaffected' || priorityLevel === 'High';

    const reasons: string[] = [];
    if (impactKind === 'direct') reasons.push(`Directly impacted by ${sourceRequirements.join(', ') || 'change'}`);
    else if (impactKind === 'indirect') reasons.push(`Indirectly impacted via downstream module dependency`);
    else reasons.push('Unaffected by detected requirement changes');

    if (t.risk_weight >= 0.75) reasons.push('High business criticality');
    if (t.past_failures > 0) reasons.push(`${t.past_failures} historical failure${t.past_failures > 1 ? 's' : ''}`);
    reasons.push(`${t.execution_time_sec}s runtime`);

    return {
      componentId: t.id,
      compCode: t.comp_code,
      name: t.name,
      description: t.description,
      impactKind,
      impactScore,
      riskWeight: t.risk_weight,
      pastFailures: t.past_failures,
      totalRuns: t.total_runs,
      executionTimeSec: t.execution_time_sec,
      priorityScore,
      priorityLevel,
      recommendedSelected,
      rank: 0,
      sourceRequirements,
      scoreBreakdown: {
        impactContribution,
        riskContribution,
        failureContribution,
        efficiencyContribution,
      },
      explanation: reasons.join(' · '),
    };
  });

  scored.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
    return a.executionTimeSec - b.executionTimeSec;
  });

  scored.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  const totalTimeSec = Number(scored.reduce((s, t) => s + t.executionTimeSec, 0).toFixed(1));
  const recommended = scored.filter((t) => t.recommendedSelected);
  const prioritizedTimeSec = Number(recommended.reduce((s, t) => s + t.executionTimeSec, 0).toFixed(1));
  const timeSavedSec = Number(Math.max(0, totalTimeSec - prioritizedTimeSec).toFixed(1));
  const timeSavedPct = totalTimeSec > 0 ? Math.round((timeSavedSec / totalTimeSec) * 100) : 0;
  const testsSavedCount = Math.max(0, scored.length - recommended.length);

  return {
    rankedTests: scored,
    totalTimeSec,
    prioritizedTimeSec,
    timeSavedSec,
    timeSavedPct,
    testsSavedCount,
    recommendedCount: recommended.length,
    totalTestsCount: scored.length,
  };
}

export function simulateTestExecution(
  rankedTests: PrioritizedTest[],
  selectedComponentIds: number[]
): {
  results: SimulatedTestResultItem[];
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  totalDurationSec: number;
} {
  const selectedSet = new Set(selectedComponentIds);
  const results: SimulatedTestResultItem[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let totalDurationSec = 0;

  for (const test of rankedTests) {
    if (!selectedSet.has(test.componentId)) {
      skippedCount++;
      results.push({
        componentId: test.componentId,
        compCode: test.compCode,
        name: test.name,
        rank: test.rank,
        priorityLevel: test.priorityLevel,
        priorityScore: test.priorityScore,
        status: 'skipped',
        durationSec: 0,
        failureDetail: null,
        impactKind: test.impactKind,
      });
      continue;
    }

    // Deterministic simulation based on impact & historical failure profile
    const shouldFlagRegression =
      test.impactKind === 'direct' &&
      test.pastFailures >= 2 &&
      test.priorityScore >= 75;

    const status: 'passed' | 'failed' = shouldFlagRegression ? 'failed' : 'passed';
    if (status === 'failed') failedCount++;
    else passedCount++;

    totalDurationSec += test.executionTimeSec;

    results.push({
      componentId: test.componentId,
      compCode: test.compCode,
      name: test.name,
      rank: test.rank,
      priorityLevel: test.priorityLevel,
      priorityScore: test.priorityScore,
      status,
      durationSec: test.executionTimeSec,
      failureDetail: status === 'failed'
        ? `Simulated assertion mismatch: ${test.compCode} requires updated verification step for modified ${test.sourceRequirements.join(', ') || 'requirement'} contract.`
        : null,
      impactKind: test.impactKind,
    });
  }

  return {
    results,
    passedCount,
    failedCount,
    skippedCount,
    totalDurationSec: Number(totalDurationSec.toFixed(1)),
  };
}

export function computeEvaluationMetrics(
  rankedTests: PrioritizedTest[],
  selectedIds: number[],
  runResults: SimulatedTestResultItem[] | null,
  analysisTimeMs: number
): EvaluationMetrics {
  if (rankedTests.length === 0) {
    return {
      precision: null,
      recall: null,
      apfd: null,
      testsSaved: 0,
      timeSavedSec: 0,
      analysisTimeMs,
      hasSufficientData: false,
      notes: 'Add test cases and run change impact analysis to compute evaluation metrics.',
    };
  }

  const affectedTests = rankedTests.filter((t) => t.impactKind !== 'unaffected');
  if (affectedTests.length === 0) {
    return {
      precision: null,
      recall: null,
      apfd: null,
      testsSaved: rankedTests.length,
      timeSavedSec: rankedTests.reduce((s, t) => s + t.executionTimeSec, 0),
      analysisTimeMs,
      hasSufficientData: false,
      notes: 'No impacted test cases were detected for the latest requirement comparison.',
    };
  }

  const selectedSet = new Set(
    selectedIds.length > 0
      ? selectedIds
      : rankedTests.filter((t) => t.recommendedSelected).map((t) => t.componentId)
  );

  // Precision & Recall of selected prioritized subset against traceability-affected test ground truth
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const t of rankedTests) {
    const isRelevant = t.impactKind !== 'unaffected';
    const isSelected = selectedSet.has(t.componentId);
    if (isSelected && isRelevant) tp++;
    else if (isSelected && !isRelevant) fp++;
    else if (!isSelected && isRelevant) fn++;
  }

  const precision = tp + fp > 0 ? Number(((tp / (tp + fp)) * 100).toFixed(1)) : null;
  const recall = tp + fn > 0 ? Number(((tp / (tp + fn)) * 100).toFixed(1)) : null;

  // APFD: Average Percentage of Faults Detected
  // Measured using actual failed tests in runResults if available, else historical/high-risk impacted faults
  let apfd: number | null = null;
  const n = rankedTests.length;

  if (runResults && runResults.length > 0) {
    const failedRanks = runResults
      .filter((r) => r.status === 'failed')
      .map((r) => r.rank);
    if (failedRanks.length > 0) {
      const m = failedRanks.length;
      const sumTf = failedRanks.reduce((a, b) => a + b, 0);
      const rawApfd = 1 - sumTf / (n * m) + 1 / (2 * n);
      apfd = Number((Math.max(0, Math.min(1, rawApfd)) * 100).toFixed(1));
    } else {
      // No faults occurred in the latest run; compute APFD over impacted tests (fault-exposure proxy) only if explicitly noted
      const affectedRanks = rankedTests.filter((t) => t.impactKind === 'direct').map((t) => t.rank);
      if (affectedRanks.length > 0) {
        const m = affectedRanks.length;
        const sumTf = affectedRanks.reduce((a, b) => a + b, 0);
        const rawApfd = 1 - sumTf / (n * m) + 1 / (2 * n);
        apfd = Number((Math.max(0, Math.min(1, rawApfd)) * 100).toFixed(1));
      }
    }
  }

  const totalTime = rankedTests.reduce((s, t) => s + t.executionTimeSec, 0);
  const selectedTime = rankedTests
    .filter((t) => selectedSet.has(t.componentId))
    .reduce((s, t) => s + t.executionTimeSec, 0);

  return {
    precision,
    recall,
    apfd,
    testsSaved: Math.max(0, rankedTests.length - selectedSet.size),
    timeSavedSec: Number(Math.max(0, totalTime - selectedTime).toFixed(1)),
    analysisTimeMs,
    hasSufficientData: true,
    notes: runResults && runResults.some((r) => r.status === 'failed')
      ? 'APFD computed directly from detected test failures and their rank positions in the prioritized sequence.'
      : 'Precision & Recall compare prioritized selection against traceability-impacted tests; APFD reflects direct-impact ordering.',
  };
}

import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Info, Loader2, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StatusLabel } from '../components/StatusLabel';
import { apiFetch, downloadCsv } from '../lib/api';
import type {
  AffectedNode,
  ChangeType,
  EvaluationMetrics,
  ImpactPath,
  PrioritizedTest,
  Project,
  SeverityLevel,
  SimulatedTestResultItem,
} from '../types';

interface ReportsPageProps {
  project: Project | null;
  onToast: (type: 'success' | 'error', text: string) => void;
}

interface ReportPayload {
  project: Project;
  changeAnalysis: {
    id: number;
    oldVersion: string;
    newVersion: string;
    summary: {
      totalOld: number;
      totalNew: number;
      added: number;
      changed: number;
      removed: number;
      unchanged: number;
      totalChanges: number;
    };
    analysisTimeMs: number;
    createdAt: string;
    changes: Array<{
      reqCode: string;
      changeType: ChangeType;
      oldText: string;
      newText: string;
      changeSize: number;
      severity: SeverityLevel;
    }>;
  } | null;
  impactAnalysis: {
    id: number;
    affectedNodes: AffectedNode[];
    impactPaths: ImpactPath[];
    summary: {
      directlyAffected: number;
      indirectlyAffected: number;
      unaffected: number;
      affectedRequirements: number;
      affectedDesign: number;
      affectedCode: number;
      affectedTests: number;
    };
    analysisTimeMs: number;
    createdAt: string;
  } | null;
  prioritization: {
    id: number;
    rankedTests: PrioritizedTest[];
    totalTimeSec: number;
    prioritizedTimeSec: number;
    timeSavedSec: number;
    testsSavedCount: number;
    metrics: EvaluationMetrics;
    createdAt: string;
  } | null;
  latestRun: {
    id: number;
    runMode: string;
    executedAt: string;
    totalDurationSec: number;
    passedCount: number;
    failedCount: number;
    skippedCount: number;
    results: SimulatedTestResultItem[];
  } | null;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ project, onToast }) => {
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!project) return;
    setLoading(true);
    apiFetch<ReportPayload>(`/api/projects/${project.id}/report`)
      .then(setReport)
      .catch((err) => onToast('error', err instanceof Error ? err.message : 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [project?.id]);

  const handleDownloadPdf = () => {
    if (!report) return;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('ChangeGuard Analysis Report', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(
      `Project: ${report.project.name}${report.project.is_demo ? ' (Demonstration Data)' : ''}  |  Version: ${report.project.current_version}`,
      14,
      25
    );
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

    let y = 38;

    if (report.changeAnalysis) {
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text(
        `1. Requirement Change Detection (${report.changeAnalysis.oldVersion} -> ${report.changeAnalysis.newVersion})`,
        14,
        y
      );
      autoTable(doc, {
        startY: y + 4,
        head: [['Req ID', 'Status', 'Severity', 'Size %', 'New / Updated Requirement']],
        body: report.changeAnalysis.changes.map((c) => [
          c.reqCode,
          c.changeType.toUpperCase(),
          c.severity.toUpperCase(),
          `${c.changeSize}%`,
          (c.newText || c.oldText).slice(0, 90),
        ]),
        styles: { fontSize: 8 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }

    if (report.impactAnalysis) {
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text('2. Impacted Software Components', 14, y);
      const impacted = report.impactAnalysis.affectedNodes.filter((n) => n.impactKind !== 'unaffected');
      autoTable(doc, {
        startY: y + 4,
        head: [['Code', 'Component', 'Layer', 'Impact', 'Score %', 'Hops']],
        body: impacted.map((n) => [
          n.compCode,
          n.name,
          n.layer,
          n.impactKind,
          `${n.impactScore}%`,
          String(n.hopDistance),
        ]),
        styles: { fontSize: 8 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }

    if (report.prioritization) {
      doc.setFontSize(12);
      doc.setTextColor(15);
      doc.text('3. Regression Test Prioritization & Metrics', 14, y);
      autoTable(doc, {
        startY: y + 4,
        head: [['Rank', 'Test', 'Priority', 'Score', 'Runtime', 'Explanation']],
        body: report.prioritization.rankedTests.map((t) => [
          `#${t.rank}`,
          `${t.compCode} ${t.name}`,
          t.priorityLevel,
          String(t.priorityScore),
          `${t.executionTimeSec}s`,
          t.explanation.slice(0, 75),
        ]),
        styles: { fontSize: 8 },
      });
    }

    doc.save(`${report.project.name.toLowerCase().replace(/\s+/g, '_')}_changeguard_report.pdf`);
    onToast('success', 'Downloaded PDF report.');
  };

  const handleDownloadCsv = () => {
    if (!report) return;
    const rows: Array<Array<string | number | null>> = [];

    report.changeAnalysis?.changes.forEach((c) => {
      rows.push(['Requirement Change', c.reqCode, c.changeType, c.severity, `${c.changeSize}%`, c.newText || c.oldText]);
    });
    report.impactAnalysis?.affectedNodes
      .filter((n) => n.impactKind !== 'unaffected')
      .forEach((n) => {
        rows.push(['Impacted Component', n.compCode, n.layer, n.impactKind, `${n.impactScore}%`, n.name]);
      });
    report.prioritization?.rankedTests.forEach((t) => {
      rows.push(['Prioritized Test', t.compCode, t.priorityLevel, `Score ${t.priorityScore}`, `${t.executionTimeSec}s`, t.explanation]);
    });

    downloadCsv(
      `${report.project.name.toLowerCase().replace(/\s+/g, '_')}_full_report.csv`,
      ['Section', 'Code', 'Classification', 'Level / Score', 'Metric', 'Details'],
      rows
    );
    onToast('success', 'Downloaded consolidated CSV report.');
  };

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
        Select a project to view and export reports.
      </div>
    );
  }

  const metrics = report?.prioritization?.metrics;

  return (
    <div className="space-y-6">
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Reports &amp; Analytics</span>
            <span aria-hidden="true">·</span>
            <span>{project.name}</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
            Consolidated Engineering Report
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!report}
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : !report ? null : (
        <div className="space-y-6">
          {/* Project Metadata Banner */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {report.project.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {report.project.description || 'Software change impact and regression test prioritization report.'}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                <p>Current Version: <span className="font-mono font-semibold text-slate-900 dark:text-white">{report.project.current_version}</span></p>
                {report.project.is_demo ? <p className="text-violet-600 dark:text-violet-400 font-medium mt-0.5">Demonstration Dataset</p> : null}
              </div>
            </div>
          </div>

          {/* Evaluation Metrics Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Evaluation &amp; Performance Metrics
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Computed strictly from stored traceability impact mappings and test run measurements.
              </p>
            </div>

            {!metrics || !metrics.hasSufficientData ? (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>{metrics?.notes || 'Run Change Detection, Impact Analysis, and Test Prioritization to compute evaluation metrics.'}</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <p className="text-[11px] font-medium text-slate-500">Precision</p>
                    <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                      {metrics.precision !== null ? `${metrics.precision}%` : 'N/A'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 leading-snug">
                      Share of selected tests that actually cover impacted components.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <p className="text-[11px] font-medium text-slate-500">Recall</p>
                    <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                      {metrics.recall !== null ? `${metrics.recall}%` : 'N/A'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 leading-snug">
                      Share of all impacted tests included in the prioritized subset.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <p className="text-[11px] font-medium text-slate-500">APFD</p>
                    <p className="mt-1 font-display text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                      {metrics.apfd !== null ? `${metrics.apfd}%` : 'Insufficient Data'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 leading-snug">
                      Average Percentage of Faults Detected; higher means faults are caught earlier in the test order.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <p className="text-[11px] font-medium text-slate-500">Tests Saved</p>
                    <p className="mt-1 font-display text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {metrics.testsSaved} <span className="text-xs font-normal">({metrics.timeSavedSec}s)</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 leading-snug">
                      Unaffected regression tests skipped safely compared to running the full suite.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <p className="text-[11px] font-medium text-slate-500">Analysis Time</p>
                    <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                      {metrics.analysisTimeMs} ms
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 leading-snug">
                      Combined measured runtime for requirement diffing and impact graph traversal.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{metrics.notes}</p>
              </>
            )}
          </div>

          {/* Section 1: Requirement Changes */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                1. Requirement Version Comparison
                {report.changeAnalysis ? ` (${report.changeAnalysis.oldVersion} → ${report.changeAnalysis.newVersion})` : ''}
              </h3>
            </div>
            {!report.changeAnalysis ? (
              <p className="p-5 text-xs text-slate-500">No requirement comparison available yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2.5 px-4">ID</th>
                      <th className="py-2.5 px-4">Change Type</th>
                      <th className="py-2.5 px-4">Severity</th>
                      <th className="py-2.5 px-4 text-right">Size</th>
                      <th className="py-2.5 px-4">Specification Text</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.changeAnalysis.changes.map((c) => (
                      <tr key={c.reqCode}>
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">{c.reqCode}</td>
                        <td className="py-2.5 px-4"><StatusLabel variant={c.changeType} /></td>
                        <td className="py-2.5 px-4"><StatusLabel variant={c.severity} /></td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{c.changeSize}%</td>
                        <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{c.newText || c.oldText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Impacted Components & Paths */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                2. Impacted Components &amp; Dependency Paths
              </h3>
            </div>
            {!report.impactAnalysis ? (
              <p className="p-5 text-xs text-slate-500">No impact analysis recorded yet.</p>
            ) : (
              <div className="p-5 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 px-3">Code</th>
                        <th className="py-2 px-3">Name</th>
                        <th className="py-2 px-3">Layer</th>
                        <th className="py-2 px-3">Impact</th>
                        <th className="py-2 px-3 text-right">Score</th>
                        <th className="py-2 px-3">Triggered By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {report.impactAnalysis.affectedNodes
                        .filter((n) => n.impactKind !== 'unaffected')
                        .map((n) => (
                          <tr key={n.componentId}>
                            <td className="py-2 px-3 font-mono font-semibold text-slate-900 dark:text-white">{n.compCode}</td>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{n.name}</td>
                            <td className="py-2 px-3 capitalize">{n.layer}</td>
                            <td className="py-2 px-3"><StatusLabel variant={n.impactKind} /></td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">{n.impactScore}%</td>
                            <td className="py-2 px-3 font-mono text-slate-500">{n.sourceRequirements.join(', ')}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Prioritized Tests & Latest Run */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                3. Prioritized Test Suite &amp; Score Explanations
              </h3>
              {report.latestRun && (
                <span className="text-xs text-slate-500 tabular-nums">
                  Latest Run ({report.latestRun.runMode === 'simulated' ? 'Simulated Runner' : 'External'}):{' '}
                  {report.latestRun.passedCount} passed, {report.latestRun.failedCount} failed, {report.latestRun.skippedCount} skipped
                </span>
              )}
            </div>
            {!report.prioritization ? (
              <p className="p-5 text-xs text-slate-500">No prioritization results available yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2.5 px-4">Rank</th>
                      <th className="py-2.5 px-4">Test Case</th>
                      <th className="py-2.5 px-4">Priority</th>
                      <th className="py-2.5 px-4 text-right">Score</th>
                      <th className="py-2.5 px-4 text-right">Runtime</th>
                      <th className="py-2.5 px-4">Explanation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.prioritization.rankedTests.map((t) => (
                      <tr key={t.componentId}>
                        <td className="py-2.5 px-4 font-mono font-bold tabular-nums">#{t.rank}</td>
                        <td className="py-2.5 px-4">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white mr-2">{t.compCode}</span>
                          <span>{t.name}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusLabel
                            variant={t.priorityLevel === 'High' ? 'high' : t.priorityLevel === 'Medium' ? 'medium' : 'low'}
                            text={t.priorityLevel}
                          />
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">{t.priorityScore}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{t.executionTimeSec}s</td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{t.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

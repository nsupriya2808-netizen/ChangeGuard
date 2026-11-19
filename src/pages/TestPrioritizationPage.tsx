import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Clock,
  Download,
  Info,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { StatusLabel } from '../components/StatusLabel';
import { apiFetch, downloadCsv } from '../lib/api';
import type {
  PageKey,
  PriorityLevel,
  Project,
  SimulatedTestResultItem,
  TestPrioritization,
} from '../types';

interface TestPrioritizationPageProps {
  project: Project | null;
  onNavigate: (page: PageKey) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
  searchQuery: string;
}

type SortField = 'rank' | 'priorityScore' | 'impactScore' | 'executionTimeSec' | 'pastFailures';

export const TestPrioritizationPage: React.FC<TestPrioritizationPageProps> = ({
  project,
  onNavigate,
  onToast,
  searchQuery,
}) => {
  const [prio, setPrio] = useState<TestPrioritization | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<'All' | PriorityLevel>('All');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortAsc, setSortAsc] = useState(true);

  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResults, setSimResults] = useState<SimulatedTestResultItem[] | null>(null);
  const [expandedScoreId, setExpandedScoreId] = useState<number | null>(null);

  const loadData = async (projectId: number) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ prioritizations: TestPrioritization[] }>(
        `/api/projects/${projectId}/prioritizations`
      );
      const latest = res.prioritizations[0] ?? null;
      setPrio(latest);
      if (latest) {
        setSelectedIds(
          latest.rankedTests.filter((t) => t.recommendedSelected).map((t) => t.componentId)
        );
      } else {
        setSelectedIds([]);
      }
      setSimResults(null);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load test prioritization.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (project) {
      loadData(project.id);
    }
  }, [project?.id]);

  const handleRecalculate = async () => {
    if (!project) return;
    setRecomputing(true);
    try {
      await apiFetch(`/api/projects/${project.id}/prioritize`, { method: 'POST', body: JSON.stringify({}) });
      await loadData(project.id);
      onToast('success', 'Test prioritization recalculated from latest impact graph.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Unable to calculate test prioritization.');
    } finally {
      setRecomputing(false);
    }
  };

  const handleSimulateRun = async () => {
    if (!project || !prio) return;
    if (selectedIds.length === 0) {
      onToast('error', 'Select at least one test case to run.');
      return;
    }
    setSimulating(true);
    try {
      const res = await apiFetch<{ results: SimulatedTestResultItem[] }>(
        `/api/projects/${project.id}/simulate-run`,
        {
          method: 'POST',
          body: JSON.stringify({ prioritizationId: prio.id, selectedComponentIds: selectedIds }),
        }
      );
      setSimResults(res.results);
      onToast('success', 'Simulated regression test execution finished and logged to Test History.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setSimulating(false);
    }
  };

  const handleExportCsv = () => {
    if (!prio || !project) return;
    downloadCsv(
      `${project.name.toLowerCase().replace(/\s+/g, '_')}_prioritized_tests.csv`,
      [
        'Rank',
        'Test Code',
        'Test Name',
        'Priority Level',
        'Priority Score',
        'Impact Type',
        'Impact Score',
        'Risk Weight',
        'Past Failures',
        'Execution Time (s)',
        'Selected',
        'Explanation',
      ],
      prio.rankedTests.map((t) => [
        t.rank,
        t.compCode,
        t.name,
        t.priorityLevel,
        t.priorityScore,
        t.impactKind,
        t.impactScore,
        t.riskWeight,
        t.pastFailures,
        t.executionTimeSec,
        selectedIds.includes(t.componentId) ? 'Yes' : 'No',
        t.explanation,
      ])
    );
    onToast('success', 'Exported prioritized regression tests to CSV.');
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((a) => !a);
    } else {
      setSortField(field);
      setSortAsc(field === 'rank' || field === 'executionTimeSec');
    }
  };

  const visibleTests = useMemo(() => {
    if (!prio) return [];
    return prio.rankedTests
      .filter((t) => {
        if (priorityFilter !== 'All' && t.priorityLevel !== priorityFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            t.compCode.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.explanation.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const va = a[sortField];
        const vb = b[sortField];
        return sortAsc ? va - vb : vb - va;
      });
  }, [prio, priorityFilter, searchQuery, sortField, sortAsc]);

  const selectionStats = useMemo(() => {
    if (!prio) return { totalTime: 0, selectedTime: 0, savedTime: 0, savedPct: 0, skippedCount: 0 };
    const totalTime = prio.rankedTests.reduce((s, t) => s + t.executionTimeSec, 0);
    const selectedTime = prio.rankedTests
      .filter((t) => selectedIds.includes(t.componentId))
      .reduce((s, t) => s + t.executionTimeSec, 0);
    const savedTime = Math.max(0, totalTime - selectedTime);
    const savedPct = totalTime > 0 ? Math.round((savedTime / totalTime) * 100) : 0;
    return {
      totalTime: Number(totalTime.toFixed(1)),
      selectedTime: Number(selectedTime.toFixed(1)),
      savedTime: Number(savedTime.toFixed(1)),
      savedPct,
      skippedCount: Math.max(0, prio.rankedTests.length - selectedIds.length),
    };
  }, [prio, selectedIds]);

  const simByComp = useMemo(() => {
    const m = new Map<number, SimulatedTestResultItem>();
    if (simResults) {
      for (const r of simResults) m.set(r.componentId, r);
    }
    return m;
  }, [simResults]);

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
        Select a project to view prioritized regression tests.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Module 3</span>
            <span aria-hidden="true">·</span>
            <span>{project.name}</span>
            {project.is_demo ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-violet-600 dark:text-violet-400 font-medium">Demonstration Data</span>
              </>
            ) : null}
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
            Regression Test Prioritization
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={recomputing}
            onClick={handleRecalculate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {recomputing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>Recalculate</span>
          </button>

          {prio && (
            <>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                disabled={simulating}
                onClick={handleSimulateRun}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>{simulating ? 'Running Simulation...' : 'Simulate Selected Tests'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : !prio ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No prioritization computed yet</p>
          <p className="text-xs text-slate-500 mt-1">Run Change Detection and Impact Analysis first to rank regression tests.</p>
          <button
            type="button"
            onClick={() => onNavigate('changes')}
            className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
          >
            Go to Requirement Changes
          </button>
        </div>
      ) : (
        <>
          {/* Time Savings & Execution Notice */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Selected Regression Subset</p>
              <p className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {selectedIds.length} <span className="text-sm font-normal text-slate-400">/ {prio.rankedTests.length}</span>
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Selected Execution Time</p>
              <p className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {selectionStats.selectedTime}s <span className="text-sm font-normal text-slate-400">/ {selectionStats.totalTime}s</span>
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Estimated Time Saved</p>
              <p className="mt-1.5 font-display text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {selectionStats.savedTime}s <span className="text-sm font-medium">({selectionStats.savedPct}%)</span>
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Tests Skipped Safely</p>
              <p className="mt-1.5 font-display text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {selectionStats.skippedCount}
              </p>
            </div>
          </div>

          {/* Recommended Execution Sequence */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Recommended Execution Sequence (Highest Risk &amp; Impact First)
              </h3>
              <span className="text-[11px] text-slate-500">
                Formula: 45% Impact + 25% Risk + 20% Failure History + 10% Runtime Efficiency
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              {prio.rankedTests
                .filter((t) => selectedIds.includes(t.componentId))
                .map((t, i) => (
                  <React.Fragment key={t.componentId}>
                    {i > 0 && <span className="text-slate-400">→</span>}
                    <span className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      #{t.rank} {t.compCode} ({t.priorityScore})
                    </span>
                  </React.Fragment>
                ))}
            </div>
          </div>

          {/* Simulated Execution Results Banner */}
          {simResults && (
            <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>Simulated Test Execution Complete (Demo Runner — Not Connected to Live CI Test Runner)</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('test-history')}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View in Test History
                </button>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                <span>Passed: <strong className="text-emerald-700 dark:text-emerald-400">{simResults.filter((r) => r.status === 'passed').length}</strong></span>
                <span>Failed: <strong className="text-red-700 dark:text-red-400">{simResults.filter((r) => r.status === 'failed').length}</strong></span>
                <span>Skipped: <strong className="text-slate-700 dark:text-slate-300">{simResults.filter((r) => r.status === 'skipped').length}</strong></span>
              </div>
            </div>
          )}

          {/* Ranked Tests Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(['All', 'High', 'Medium', 'Low'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setPriorityFilter(lvl)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        priorityFilter === lvl
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIds(prio.rankedTests.filter((t) => t.recommendedSelected).map((t) => t.componentId))
                  }
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Select Recommended
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(prio.rankedTests.map((t) => t.componentId))}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4 w-10">Run</th>
                    <th className="py-2.5 px-4">
                      <button type="button" onClick={() => toggleSort('rank')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Rank <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-4">Test Case</th>
                    <th className="py-2.5 px-4">Priority</th>
                    <th className="py-2.5 px-4 text-right">
                      <button type="button" onClick={() => toggleSort('priorityScore')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Score <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-4">Impact</th>
                    <th className="py-2.5 px-4 text-right">
                      <button type="button" onClick={() => toggleSort('pastFailures')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Failures <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-4 text-right">
                      <button type="button" onClick={() => toggleSort('executionTimeSec')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Duration <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    {simResults && <th className="py-2.5 px-4">Simulated Status</th>}
                    <th className="py-2.5 px-4 text-right">Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleTests.map((t) => {
                    const checked = selectedIds.includes(t.componentId);
                    const simItem = simByComp.get(t.componentId);
                    const isExpanded = expandedScoreId === t.componentId;
                    return (
                      <React.Fragment key={t.componentId}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={checked}
                              aria-label={`Select ${t.compCode}`}
                              onChange={() =>
                                setSelectedIds((prev) =>
                                  prev.includes(t.componentId)
                                    ? prev.filter((id) => id !== t.componentId)
                                    : [...prev, t.componentId]
                                )
                              }
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                            />
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                            #{t.rank}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono font-semibold text-slate-900 dark:text-white">{t.compCode}</div>
                            <div className="text-slate-600 dark:text-slate-300">{t.name}</div>
                          </td>
                          <td className="py-3 px-4">
                            <StatusLabel
                              variant={t.priorityLevel === 'High' ? 'high' : t.priorityLevel === 'Medium' ? 'medium' : 'low'}
                              text={t.priorityLevel}
                            />
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                            {t.priorityScore}
                          </td>
                          <td className="py-3 px-4">
                            <StatusLabel variant={t.impactKind} />
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {t.pastFailures}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {t.executionTimeSec}s
                            </span>
                          </td>
                          {simResults && (
                            <td className="py-3 px-4">
                              {simItem ? <StatusLabel variant={simItem.status} /> : '—'}
                            </td>
                          )}
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setExpandedScoreId(isExpanded ? null : t.componentId)}
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {isExpanded ? 'Hide' : 'Explain'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                            <td colSpan={simResults ? 10 : 9} className="px-6 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                                <p className="text-slate-700 dark:text-slate-300">{t.explanation}</p>
                                <div className="flex flex-wrap gap-4 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                  <span>Impact: +{t.scoreBreakdown.impactContribution}</span>
                                  <span>Risk: +{t.scoreBreakdown.riskContribution}</span>
                                  <span>Failures: +{t.scoreBreakdown.failureContribution}</span>
                                  <span>Efficiency: +{t.scoreBreakdown.efficiencyContribution}</span>
                                </div>
                              </div>
                              {simItem?.failureDetail && (
                                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{simItem.failureDetail}</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

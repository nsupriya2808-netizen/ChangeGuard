import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, History, Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StatusLabel } from '../components/StatusLabel';
import { apiFetch } from '../lib/api';
import type { Project, TestRun } from '../types';

interface TestHistoryPageProps {
  projects: Project[];
  selectedProjectId: number | null;
  onToast: (type: 'success' | 'error', text: string) => void;
  searchQuery: string;
}

export const TestHistoryPage: React.FC<TestHistoryPageProps> = ({
  projects,
  selectedProjectId,
  onToast,
  searchQuery,
}) => {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [filterProjectId, setFilterProjectId] = useState<string>(selectedProjectId ? String(selectedProjectId) : 'all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'failed' | 'passed'>('all');
  const [fromDate, setFromDate] = useState('');
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = filterProjectId === 'all' ? '/api/test-runs' : `/api/test-runs?projectId=${filterProjectId}`;
    apiFetch<{ runs: TestRun[] }>(url)
      .then((res) => {
        setRuns(res.runs);
        if (res.runs.length > 0) setExpandedRunId(res.runs[0].id);
      })
      .catch((err) => {
        onToast('error', err instanceof Error ? err.message : 'Failed to load test execution history.');
      })
      .finally(() => setLoading(false));
  }, [filterProjectId]);

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (filterStatus === 'failed' && r.failed_count === 0) return false;
      if (filterStatus === 'passed' && r.failed_count > 0) return false;
      if (fromDate) {
        const runDay = r.executed_at.slice(0, 10);
        if (runDay < fromDate) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchProj = (r.project_name ?? '').toLowerCase().includes(q);
        const matchTest = r.results.some(
          (item) => item.compCode.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
        );
        return matchProj || matchTest;
      }
      return true;
    });
  }, [runs, filterStatus, fromDate, searchQuery]);

  const chartData = useMemo(() => {
    return [...filteredRuns]
      .reverse()
      .slice(-12)
      .map((r) => ({
        label: `#${r.id} (${new Date(r.executed_at + 'Z').toLocaleDateString()})`,
        Passed: r.passed_count,
        Failed: r.failed_count,
        Skipped: r.skipped_count,
      }));
  }, [filteredRuns]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Regression Test Execution History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit past simulated and connected test runs, duration, and failure diagnostics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter by project"
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by outcome"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'failed' | 'passed')}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value="all">All Outcomes</option>
            <option value="passed">All Passed</option>
            <option value="failed">Contains Failures</option>
          </select>

          <input
            type="date"
            aria-label="Filter from date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Historical Chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            Pass / Fail / Skip Trend Across Test Runs
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Passed" stackId="a" fill="#16A34A" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Failed" stackId="a" fill="#DC2626" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Skipped" stackId="a" fill="#94A3B8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Runs List */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <History className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No test execution runs found</p>
          <p className="text-xs text-slate-500 mt-1">Run a simulated execution in Test Prioritization to record results.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRuns.map((run) => {
            const expanded = expandedRunId === run.id;
            return (
              <div
                key={run.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedRunId(expanded ? null : run.id)}
                  className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">Run #{run.id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{run.project_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{run.run_mode === 'simulated' ? 'Simulated Runner (Demo)' : 'Connected CI Runner'}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        Executed {new Date(run.executed_at + 'Z').toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{run.passed_count} Passed</span>
                    <span className="text-red-700 dark:text-red-400 font-semibold">{run.failed_count} Failed</span>
                    <span className="text-slate-500">{run.skipped_count} Skipped</span>
                    <span className="inline-flex items-center gap-1 font-mono text-slate-600 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {run.total_duration_sec}s
                    </span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <th className="py-2 px-4">Rank</th>
                          <th className="py-2 px-4">Test Case</th>
                          <th className="py-2 px-4">Status</th>
                          <th className="py-2 px-4 text-right">Duration</th>
                          <th className="py-2 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {run.results.map((item) => (
                          <tr key={item.componentId}>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                              #{item.rank}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="font-mono font-semibold text-slate-900 dark:text-white mr-2">
                                {item.compCode}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300">{item.name}</span>
                            </td>
                            <td className="py-2.5 px-4">
                              <StatusLabel variant={item.status} />
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {item.durationSec}s
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                              {item.failureDetail ? (
                                <span className="text-red-600 dark:text-red-400">{item.failureDetail}</span>
                              ) : item.status === 'skipped' ? (
                                'Excluded by prioritization subset'
                              ) : (
                                'Assertions verified'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

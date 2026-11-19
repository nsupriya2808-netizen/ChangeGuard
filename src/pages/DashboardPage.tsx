import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  FileBarChart2,
  FolderKanban,
  GitCompare,
  Network,
  Plus,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../lib/api';
import type { DashboardData, PageKey, Project } from '../types';

interface DashboardPageProps {
  selectedProject: Project | null;
  onSelectProject: (id: number) => void;
  onNavigate: (page: PageKey) => void;
  searchQuery: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  selectedProject,
  onSelectProject,
  onNavigate,
  searchQuery,
}) => {
  const [scopeAll, setScopeAll] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const url = scopeAll || !selectedProject ? '/api/dashboard' : `/api/dashboard?projectId=${selectedProject.id}`;
    apiFetch<DashboardData>(url)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scopeAll, selectedProject]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const filteredProjects = data.recentProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredActivity = data.recentActivity.filter(
    (a) =>
      a.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const kpiItems = [
    { label: 'Total Projects', value: data.kpis.totalProjects, sub: 'Managed workspaces' },
    { label: 'Requirements Analyzed', value: data.kpis.totalRequirementsAnalyzed, sub: 'Latest specifications' },
    { label: 'Changes Detected', value: data.kpis.changesDetected, sub: 'Added, modified, removed' },
    { label: 'Affected Components', value: data.kpis.affectedComponents, sub: 'Direct & indirect nodes' },
    { label: 'Tests Prioritized', value: data.kpis.testsPrioritized, sub: 'Recommended subset' },
    { label: 'Tests Saved', value: data.kpis.testsSaved, sub: 'Skipped safely per cycle' },
  ];

  const totalRegStatus = data.charts.regressionStatus.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-6">
      {/* Header Action Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Workspace Overview</span>
            <span aria-hidden="true">·</span>
            <span>{scopeAll ? 'All Stored Projects' : selectedProject?.name}</span>
            {selectedProject?.is_demo ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">Includes Demonstration Data</span>
              </>
            ) : null}
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
            Requirement Change &amp; Regression Impact Summary
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setScopeAll(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                scopeAll
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All Projects
            </button>
            <button
              type="button"
              disabled={!selectedProject}
              onClick={() => setScopeAll(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap disabled:opacity-50 ${
                !scopeAll
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Selected Project
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('changes')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Analysis</span>
          </button>
        </div>
      </div>

      {/* 6 KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiItems.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{kpi.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {kpi.value}
            </p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* 3 Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Change Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Change Distribution</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Latest specification comparison</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.changeDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {data.charts.changeDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Test Priority &amp; Risk</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Prioritized regression test tiers</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.riskDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {data.charts.riskDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Regression Testing Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Regression Run Status</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Aggregated recorded test outcomes</p>
            </div>
          </div>
          {totalRegStatus === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center text-xs text-slate-500">
              <p>No test runs recorded yet.</p>
              <button
                type="button"
                onClick={() => onNavigate('prioritization')}
                className="mt-2 text-blue-600 hover:underline font-medium"
              >
                Run Simulated Test Execution
              </button>
            </div>
          ) : (
            <div className="h-56 flex items-center">
              <div className="w-1/2 h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.charts.regressionStatus}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={42}
                      outerRadius={68}
                      paddingAngle={2}
                    >
                      {data.charts.regressionStatus.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 space-y-2.5 pl-2">
                {data.charts.regressionStatus.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.fill }} />
                      <span className="text-slate-700 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('changes')}
          className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Compare Versions</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Module 1 Change Detection</p>
          </div>
          <GitCompare className="w-5 h-5 text-blue-600 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('impact')}
          className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-violet-400 dark:hover:border-violet-600 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Trace Impact</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Module 2 Impact Graph</p>
          </div>
          <Activity className="w-5 h-5 text-violet-600 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('dependency-map')}
          className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Dependency Map</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Interactive node paths</p>
          </div>
          <Network className="w-5 h-5 text-blue-600 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reports')}
          className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-violet-400 dark:hover:border-violet-600 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Export Report</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">PDF, CSV &amp; metrics</p>
          </div>
          <FileBarChart2 className="w-5 h-5 text-violet-600 shrink-0" />
        </button>
      </div>

      {/* Bottom Split: Recent Projects Table + Recent Analysis Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Projects</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Select a project to inspect or run analysis</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <span>Manage Projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Project</th>
                  <th className="py-2.5 px-4">Version</th>
                  <th className="py-2.5 px-4 text-right">Changes</th>
                  <th className="py-2.5 px-4 text-right">Affected</th>
                  <th className="py-2.5 px-4 text-right">Tests Saved</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      No matching projects found.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                          <FolderKanban className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{p.name}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                          {p.is_demo ? 'Demonstration Data · ' : ''}
                          {p.description || 'No description'}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">{p.current_version}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {p.changesCount ?? 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {p.affectedCount ?? 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                        {p.testsSaved ?? 0}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProject(p.id);
                            onNavigate('changes');
                          }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Analysis Activity</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Latest change detections, impact graphs, and test runs</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
            {filteredActivity.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No recent analysis events recorded.</div>
            ) : (
              filteredActivity.map((item) => (
                <div key={item.id} className="px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {item.projectName} {item.isDemo ? '(Demo)' : ''}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {new Date(item.timestamp + 'Z').toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{item.summary}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

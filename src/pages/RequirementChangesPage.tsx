import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Download,
  FileText,
  GitCompare,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { StatusLabel } from '../components/StatusLabel';
import { apiFetch, downloadCsv } from '../lib/api';
import type { ChangeAnalysis, PageKey, Project, ProjectVersion } from '../types';

interface RequirementChangesPageProps {
  project: Project | null;
  onNavigate: (page: PageKey) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
  searchQuery: string;
}

export const RequirementChangesPage: React.FC<RequirementChangesPageProps> = ({
  project,
  onNavigate,
  onToast,
  searchQuery,
}) => {
  const [oldVersion, setOldVersion] = useState('v1.0');
  const [newVersion, setNewVersion] = useState('v2.0');
  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [analyses, setAnalyses] = useState<ChangeAnalysis[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<ChangeAnalysis | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'added' | 'changed' | 'removed' | 'unchanged'>('all');

  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [uploadingSide, setUploadingSide] = useState<'old' | 'new' | null>(null);

  const loadData = async (projectId: number) => {
    setLoading(true);
    try {
      const [projDetail, caRes] = await Promise.all([
        apiFetch<{ versions: ProjectVersion[] }>(`/api/projects/${projectId}`),
        apiFetch<{ analyses: ChangeAnalysis[] }>(`/api/projects/${projectId}/change-analyses`),
      ]);
      setVersions(projDetail.versions);
      setAnalyses(caRes.analyses);
      if (caRes.analyses.length > 0) {
        const latest = caRes.analyses[0];
        setActiveAnalysis(latest);
        setOldVersion(latest.oldVersion);
        setNewVersion(latest.newVersion);
        setOldText(latest.oldText);
        setNewText(latest.newText);
      } else {
        setActiveAnalysis(null);
        setOldText(projDetail.versions[0]?.raw_text ?? '');
        setNewText('');
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load requirement comparisons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (project) {
      loadData(project.id);
    }
  }, [project?.id]);

  const handleFileUpload = async (side: 'old' | 'new', file: File | undefined) => {
    if (!file) return;
    setUploadingSide(side);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<{ text: string; fileName: string }>('/api/extract-file', {
        method: 'POST',
        body: formData,
      });
      if (side === 'old') {
        setOldText(res.text);
      } else {
        setNewText(res.text);
      }
      onToast('success', `Extracted text from "${res.fileName}".`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Unable to parse uploaded file.');
    } finally {
      setUploadingSide(null);
    }
  };

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!oldText.trim() || !newText.trim()) {
      onToast('error', 'Both Version 1 and Version 2 requirement texts are required.');
      return;
    }
    setComparing(true);
    try {
      await apiFetch(`/api/projects/${project.id}/change-detection`, {
        method: 'POST',
        body: JSON.stringify({
          oldVersion: oldVersion.trim() || 'v1.0',
          newVersion: newVersion.trim() || 'v2.0',
          oldText,
          newText,
          autoChain: true,
        }),
      });
      await loadData(project.id);
      onToast('success', 'Requirement changes detected and chained to Impact Analysis & Test Prioritization.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Change detection failed.');
    } finally {
      setComparing(false);
    }
  };

  const handleLoadSampleScenario = () => {
    setOldVersion('v1.0');
    setNewVersion('v2.0');
    setOldText(`REQ-01: Users can log in using email and password.
REQ-02: Users can reset forgotten passwords via verified email recovery links.
REQ-03: Users can view checking and savings account balances and recent transactions.
REQ-04: Users can transfer money between internal and external linked accounts.
REQ-05: System records an immutable audit log of authentication and transfer events.`);
    setNewText(`REQ-01: Users can log in using email, password, and a mandatory two-factor authentication (2FA) one-time verification code.
REQ-02: Users can reset forgotten passwords via verified email recovery links.
REQ-03: Users can view checking and savings account balances and recent transactions.
REQ-04: Users can transfer money between internal and external linked accounts with 2FA confirmation for transfers above threshold.
REQ-05: System records an immutable audit log of authentication and transfer events.
REQ-06: Users can enroll and manage authenticator app or SMS two-factor authentication devices in security settings.`);
    onToast('success', 'Loaded Online Banking v1.0 → v2.0 (2FA addition) demonstration requirements.');
  };

  const handleExportCsv = () => {
    if (!activeAnalysis || !project) return;
    downloadCsv(
      `${project.name.toLowerCase().replace(/\s+/g, '_')}_requirement_changes.csv`,
      ['Req Code', 'Change Type', 'Severity', 'Change Size (%)', 'Similarity', 'Old Requirement', 'New Requirement'],
      activeAnalysis.changes.map((c) => [
        c.reqCode,
        c.changeType,
        c.severity,
        c.changeSize,
        c.similarityScore,
        c.oldText,
        c.newText,
      ])
    );
    onToast('success', 'Downloaded requirement comparison CSV report.');
  };

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">Select or create a project to compare requirements.</p>
      </div>
    );
  }

  const filteredChanges = (activeAnalysis?.changes ?? []).filter((c) => {
    if (filterType !== 'all' && c.changeType !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.reqCode.toLowerCase().includes(q) ||
        c.oldText.toLowerCase().includes(q) ||
        c.newText.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Module 1</span>
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
            Requirement Change Detection
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSampleScenario}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            <span>Load 2FA Demo Specs</span>
          </button>
          {activeAnalysis && (
            <button
              type="button"
              onClick={() => onNavigate('impact')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
            >
              <span>Inspect Impact Analysis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleCompare}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Version 1 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Version 1 (Old Baseline)</span>
                <input
                  type="text"
                  value={oldVersion}
                  onChange={(e) => setOldVersion(e.target.value)}
                  className="w-20 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200"
                  aria-label="Old version label"
                />
              </div>

              <div className="flex items-center gap-2">
                {versions.length > 0 && (
                  <select
                    aria-label="Load saved version into V1"
                    defaultValue=""
                    onChange={(e) => {
                      const v = versions.find((item) => item.id === Number(e.target.value));
                      if (v) {
                        setOldVersion(v.version_label);
                        setOldText(v.raw_text);
                      }
                    }}
                    className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <option value="">Load saved...</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.version_label}
                      </option>
                    ))}
                  </select>
                )}

                <label className="cursor-pointer inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-medium text-slate-700 dark:text-slate-200">
                  {uploadingSide === 'old' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>Upload TXT/PDF/DOCX</span>
                  <input
                    type="file"
                    accept=".txt,.pdf,.docx,.md"
                    className="hidden"
                    onChange={(e) => {
                      handleFileUpload('old', e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            <textarea
              rows={7}
              value={oldText}
              onChange={(e) => setOldText(e.target.value)}
              placeholder="Paste or upload Version 1 requirements (one per line, e.g. REQ-01: Users can log in...)"
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 text-xs font-mono leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Version 2 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Version 2 (New Revision)</span>
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  className="w-20 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200"
                  aria-label="New version label"
                />
              </div>

              <div className="flex items-center gap-2">
                {versions.length > 0 && (
                  <select
                    aria-label="Load saved version into V2"
                    defaultValue=""
                    onChange={(e) => {
                      const v = versions.find((item) => item.id === Number(e.target.value));
                      if (v) {
                        setNewVersion(v.version_label);
                        setNewText(v.raw_text);
                      }
                    }}
                    className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <option value="">Load saved...</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.version_label}
                      </option>
                    ))}
                  </select>
                )}

                <label className="cursor-pointer inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-medium text-slate-700 dark:text-slate-200">
                  {uploadingSide === 'new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>Upload TXT/PDF/DOCX</span>
                  <input
                    type="file"
                    accept=".txt,.pdf,.docx,.md"
                    className="hidden"
                    onChange={(e) => {
                      handleFileUpload('new', e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            <textarea
              rows={7}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Paste or upload Version 2 requirements (one per line, e.g. REQ-01: Users can log in with 2FA...)"
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 text-xs font-mono leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Supports TXT, PDF, and DOCX parsing. Automatically detects duplicates, computes word-level diffs, and updates Impact Analysis.
          </p>
          <button
            type="submit"
            disabled={comparing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
          >
            {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
            <span>{comparing ? 'Comparing Specifications...' : 'Compare Requirement Versions'}</span>
          </button>
        </div>
      </form>

      {/* Results Section */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : !activeAnalysis ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No comparisons recorded for this project yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Enter or upload Version 1 and Version 2 specifications above and click Compare Requirement Versions.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Warnings if duplicate content detected */}
          {activeAnalysis.warnings.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4" />
                <span>Document Normalization Notices</span>
              </div>
              {activeAnalysis.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {/* Summary Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500">Total Changes</p>
              <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                {activeAnalysis.summary.totalChanges}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Added</p>
              <p className="text-xl font-display font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
                {activeAnalysis.summary.added}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Changed</p>
              <p className="text-xl font-display font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-1">
                {activeAnalysis.summary.changed}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <p className="text-[11px] text-red-600 dark:text-red-400">Removed</p>
              <p className="text-xl font-display font-bold text-red-700 dark:text-red-400 tabular-nums mt-1">
                {activeAnalysis.summary.removed}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500">Unchanged</p>
              <p className="text-xl font-display font-bold text-slate-700 dark:text-slate-300 tabular-nums mt-1">
                {activeAnalysis.summary.unchanged}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500">Avg Change Size</p>
              <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                {activeAnalysis.summary.averageChangeSize}%
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <p className="text-[11px] text-slate-500">Runtime</p>
              <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                {activeAnalysis.analysisTimeMs}ms
              </p>
            </div>
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(['all', 'added', 'changed', 'removed', 'unchanged'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFilterType(t)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                        filterType === t
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {analyses.length > 1 && (
                  <select
                    aria-label="Select past comparison run"
                    value={activeAnalysis.id}
                    onChange={(e) => {
                      const found = analyses.find((a) => a.id === Number(e.target.value));
                      if (found) setActiveAnalysis(found);
                    }}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                  >
                    {analyses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.oldVersion} → {a.newVersion} ({new Date(a.createdAt + 'Z').toLocaleString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Comparison CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4 w-24">ID</th>
                    <th className="py-2.5 px-4 w-28">Status</th>
                    <th className="py-2.5 px-4">Version 1 (Old)</th>
                    <th className="py-2.5 px-4">Version 2 (New &amp; Highlighted Diff)</th>
                    <th className="py-2.5 px-4 text-right w-24">Change Size</th>
                    <th className="py-2.5 px-4 w-28">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredChanges.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No requirements match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredChanges.map((c, idx) => (
                      <tr key={`${c.reqCode}-${idx}`} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {c.reqCode}
                        </td>
                        <td className="py-3 px-4">
                          <StatusLabel variant={c.changeType} />
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 leading-relaxed max-w-md">
                          {c.oldText || <span className="italic text-slate-400">— Not present in baseline —</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-800 dark:text-slate-200 leading-relaxed max-w-lg">
                          {c.changeType === 'removed' ? (
                            <span className="italic text-red-600 dark:text-red-400">Removed in {activeAnalysis.newVersion}</span>
                          ) : (
                            <span>
                              {c.diffTokens.map((tok, tIdx) => {
                                if (tok.added) {
                                  return (
                                    <ins
                                      key={tIdx}
                                      className="bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 px-0.5 rounded no-underline font-medium"
                                    >
                                      {tok.value}
                                    </ins>
                                  );
                                }
                                if (tok.removed) {
                                  return (
                                    <del
                                      key={tIdx}
                                      className="bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 px-0.5 rounded line-through"
                                    >
                                      {tok.value}
                                    </del>
                                  );
                                }
                                return <span key={tIdx}>{tok.value}</span>;
                              })}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {c.changeSize}%
                        </td>
                        <td className="py-3 px-4">
                          <StatusLabel variant={c.severity} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

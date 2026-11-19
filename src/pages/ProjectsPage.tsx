import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Edit3,
  FolderPlus,
  GitBranch,
  History,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { PageKey, Project, ProjectVersion } from '../types';

interface ProjectsPageProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number) => void;
  onRefreshProjects: () => Promise<void>;
  onNavigate: (page: PageKey) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
  searchQuery: string;
}

interface ProjectDetailResponse {
  project: Project;
  versions: ProjectVersion[];
  analyses: Array<{
    id: number;
    old_version: string;
    new_version: string;
    summary_json: string;
    analysis_time_ms: number;
    created_at: string;
  }>;
  impactAnalyses: Array<{
    id: number;
    summary_json: string;
    created_at: string;
  }>;
  testRuns: Array<{
    id: number;
    run_mode: string;
    executed_at: string;
    passed_count: number;
    failed_count: number;
    skipped_count: number;
  }>;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  selectedProjectId,
  onSelectProject,
  onRefreshProjects,
  onNavigate,
  onToast,
  searchQuery,
}) => {
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create / Edit modal
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formVersion, setFormVersion] = useState('v1.0');
  const [formInitialReqs, setFormInitialReqs] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add Version modal
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [verLabel, setVerLabel] = useState('');
  const [verNotes, setVerNotes] = useState('');
  const [verText, setVerText] = useState('');

  const loadDetail = async (id: number) => {
    setLoadingDetail(true);
    try {
      const data = await apiFetch<ProjectDetailResponse>(`/api/projects/${id}`);
      setDetail(data);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load project details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      loadDetail(selectedProjectId);
    } else {
      setDetail(null);
    }
  }, [selectedProjectId]);

  const openCreateModal = () => {
    setFormName('');
    setFormDesc('');
    setFormVersion('v1.0');
    setFormInitialReqs('');
    setModalMode('create');
  };

  const openEditModal = (p: Project) => {
    setFormName(p.name);
    setFormDesc(p.description);
    setFormVersion(p.current_version);
    setModalMode('edit');
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      onToast('error', 'Project name is required.');
      return;
    }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        const res = await apiFetch<{ project: Project }>('/api/projects', {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            description: formDesc.trim(),
            current_version: formVersion.trim() || 'v1.0',
            initialRequirements: formInitialReqs.trim(),
          }),
        });
        await onRefreshProjects();
        onSelectProject(res.project.id);
        onToast('success', `Project "${res.project.name}" created.`);
      } else if (modalMode === 'edit' && selectedProjectId) {
        await apiFetch(`/api/projects/${selectedProjectId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formName.trim(),
            description: formDesc.trim(),
            current_version: formVersion.trim() || 'v1.0',
          }),
        });
        await onRefreshProjects();
        await loadDetail(selectedProjectId);
        onToast('success', 'Project updated successfully.');
      }
      setModalMode(null);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
      onToast('success', `Deleted project "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await onRefreshProjects();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to delete project.');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !verLabel.trim() || !verText.trim()) {
      onToast('error', 'Version label and requirement text are required.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/projects/${selectedProjectId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          version_label: verLabel.trim(),
          notes: verNotes.trim(),
          raw_text: verText.trim(),
        }),
      });
      setVersionModalOpen(false);
      setVerLabel('');
      setVerNotes('');
      setVerText('');
      await onRefreshProjects();
      await loadDetail(selectedProjectId);
      onToast('success', `Saved requirement version ${verLabel.trim()}.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to save version.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVersion = async (versionId: number, label: string) => {
    if (!selectedProjectId) return;
    try {
      await apiFetch(`/api/projects/${selectedProjectId}/versions/${versionId}`, { method: 'DELETE' });
      await loadDetail(selectedProjectId);
      onToast('success', `Removed version ${label}.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to delete version.');
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Software Engineering Projects
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Create workspaces, manage requirement version baselines, and inspect analysis history.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <FolderPlus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Project List */}
        <div className="xl:col-span-5 space-y-3">
          {filteredProjects.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No projects match your filter</p>
              <p className="text-xs text-slate-500 mt-1">Create a new project to begin requirement change analysis.</p>
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Create First Project
              </button>
            </div>
          ) : (
            filteredProjects.map((p) => {
              const active = p.id === selectedProjectId;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                    active
                      ? 'bg-white dark:bg-slate-900 border-blue-600 ring-1 ring-blue-600/30'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-medium text-blue-600 dark:text-blue-400">{p.current_version}</span>
                        {p.is_demo ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-violet-600 dark:text-violet-400">Demonstration Project</span>
                          </>
                        ) : null}
                      </div>
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white mt-1 truncate">
                        {p.name}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {p.description || 'No description provided.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject(p.id);
                          openEditModal(p);
                        }}
                        aria-label={`Edit ${p.name}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        aria-label={`Delete ${p.name}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>{p.versionCount ?? 0} versions</span>
                    <span>{p.componentCount ?? 0} components</span>
                    <span>{p.analysisCount ?? 0} analyses</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Project Details */}
        <div className="xl:col-span-7">
          {loadingDetail ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !detail ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
              Select a project on the left to view versions and analysis history.
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
              {/* Project Summary */}
              <div className="p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{detail.project.current_version}</span>
                      <span aria-hidden="true">·</span>
                      <span>Updated {new Date(detail.project.updated_at + 'Z').toLocaleDateString()}</span>
                      {detail.project.is_demo ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-violet-600 dark:text-violet-400 font-medium">Demonstration Data</span>
                        </>
                      ) : null}
                    </div>
                    <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1">
                      {detail.project.name}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                      {detail.project.description || 'No description added.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate('changes')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <span>Compare Versions</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Project Versions */}
              <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-slate-400" />
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Requirement Versions</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVersionModalOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Version
                  </button>
                </div>

                {detail.versions.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">
                    No saved requirement snapshots yet. Add a version or run Module 1 Change Detection.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {detail.versions.map((v) => (
                      <div
                        key={v.id}
                        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-slate-900 dark:text-white">
                              {v.version_label}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-600 dark:text-slate-300">{v.notes || 'Requirement snapshot'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteVersion(v.id, v.version_label)}
                            aria-label={`Delete version ${v.version_label}`}
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <pre className="mt-2 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-3">
                          {v.raw_text}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Project Analysis History */}
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Analysis History</h4>
                </div>
                {detail.analyses.length === 0 ? (
                  <p className="text-xs text-slate-500">No change analyses have been executed for this project yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <th className="py-2 pr-3 font-medium">Versions</th>
                          <th className="py-2 pr-3 font-medium">Detected Changes</th>
                          <th className="py-2 pr-3 font-medium text-right">Duration</th>
                          <th className="py-2 font-medium text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {detail.analyses.map((a) => {
                          const s = JSON.parse(a.summary_json) as {
                            added: number;
                            changed: number;
                            removed: number;
                            totalChanges: number;
                          };
                          return (
                            <tr key={a.id}>
                              <td className="py-2.5 pr-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                                {a.old_version} → {a.new_version}
                              </td>
                              <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300 tabular-nums">
                                {s.totalChanges} total ({s.added} added, {s.changed} changed, {s.removed} removed)
                              </td>
                              <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-500">
                                {a.analysis_time_ms} ms
                              </td>
                              <td className="py-2.5 text-right text-slate-500 tabular-nums">
                                {new Date(a.created_at + 'Z').toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Project Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {modalMode === 'create' ? 'Create New Project' : 'Edit Project'}
              </h3>
              <button type="button" onClick={() => setModalMode(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProject} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Project Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Healthcare Patient Portal"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Version Label</label>
                <input
                  type="text"
                  value={formVersion}
                  onChange={(e) => setFormVersion(e.target.value)}
                  placeholder="v1.0"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Brief software system overview..."
                  className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              {modalMode === 'create' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Initial Baseline Requirements (optional)
                  </label>
                  <textarea
                    rows={4}
                    value={formInitialReqs}
                    onChange={(e) => setFormInitialReqs(e.target.value)}
                    placeholder="REQ-01: Users can sign in...&#10;REQ-02: Users can view profile..."
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {saving ? 'Saving...' : modalMode === 'create' ? 'Create Project' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Version Modal */}
      {versionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Add Requirement Version Snapshot
              </h3>
              <button type="button" onClick={() => setVersionModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddVersion} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Version Label *</label>
                  <input
                    type="text"
                    value={verLabel}
                    onChange={(e) => setVerLabel(e.target.value)}
                    placeholder="v2.1"
                    required
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Release Notes</label>
                  <input
                    type="text"
                    value={verNotes}
                    onChange={(e) => setVerNotes(e.target.value)}
                    placeholder="Summary of revision"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Requirements Text *</label>
                <textarea
                  rows={6}
                  value={verText}
                  onChange={(e) => setVerText(e.target.value)}
                  placeholder="REQ-01: ..."
                  required
                  className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVersionModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  {saving ? 'Saving...' : 'Save Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Delete Project?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
              This will permanently remove <span className="font-semibold">{deleteTarget.name}</span> along with its requirement comparisons, traceability links, impact graphs, and test execution records.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

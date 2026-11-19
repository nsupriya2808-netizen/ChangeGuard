import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Download,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { DependencyGraphCanvas } from '../components/DependencyGraphCanvas';
import { StatusLabel } from '../components/StatusLabel';
import { apiFetch, downloadCsv } from '../lib/api';
import type {
  ComponentRecord,
  ImpactAnalysis,
  LayerType,
  LinkRecord,
  PageKey,
  Project,
} from '../types';

interface ImpactAnalysisPageProps {
  project: Project | null;
  onNavigate: (page: PageKey) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
  searchQuery: string;
}

export const ImpactAnalysisPage: React.FC<ImpactAnalysisPageProps> = ({
  project,
  onNavigate,
  onToast,
  searchQuery,
}) => {
  const [components, setComponents] = useState<ComponentRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [activeLayer, setActiveLayer] = useState<'all' | LayerType>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  // Add component form
  const [compCode, setCompCode] = useState('');
  const [compName, setCompName] = useState('');
  const [compLayer, setCompLayer] = useState<LayerType>('code');
  const [compRisk, setCompRisk] = useState('0.7');
  const [compTime, setCompTime] = useState('15');

  // Add link form
  const [linkSource, setLinkSource] = useState<string>('');
  const [linkTarget, setLinkTarget] = useState<string>('');
  const [linkType, setLinkType] = useState('depends_on');

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'component'; id: number; label: string }
    | { kind: 'link'; id: number; label: string }
    | null
  >(null);

  const loadAll = async (projectId: number) => {
    setLoading(true);
    try {
      const [traceRes, iaRes] = await Promise.all([
        apiFetch<{ components: ComponentRecord[]; links: LinkRecord[] }>(`/api/projects/${projectId}/traceability`),
        apiFetch<{ impactAnalyses: ImpactAnalysis[] }>(`/api/projects/${projectId}/impact-analyses`),
      ]);
      setComponents(traceRes.components);
      setLinks(traceRes.links);
      setImpact(iaRes.impactAnalyses[0] ?? null);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load impact analysis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (project) {
      loadAll(project.id);
    }
  }, [project?.id]);

  const handleRunImpact = async () => {
    if (!project) return;
    setRunning(true);
    try {
      await apiFetch(`/api/projects/${project.id}/impact-analysis`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadAll(project.id);
      onToast('success', 'Dependency graph traversal completed and Test Prioritization updated.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Impact analysis failed.');
    } finally {
      setRunning(false);
    }
  };

  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !compCode.trim() || !compName.trim()) return;
    try {
      await apiFetch(`/api/projects/${project.id}/components`, {
        method: 'POST',
        body: JSON.stringify({
          comp_code: compCode.trim(),
          name: compName.trim(),
          layer: compLayer,
          risk_weight: Number(compRisk),
          execution_time_sec: Number(compTime),
        }),
      });
      setCompCode('');
      setCompName('');
      await loadAll(project.id);
      onToast('success', `Added ${compCode.trim().toUpperCase()} to traceability matrix.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to add component.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!project || !pendingDelete) return;
    try {
      if (pendingDelete.kind === 'component') {
        await apiFetch(`/api/projects/${project.id}/components/${pendingDelete.id}`, { method: 'DELETE' });
        onToast('success', `Removed component ${pendingDelete.label}.`);
      } else {
        await apiFetch(`/api/projects/${project.id}/links/${pendingDelete.id}`, { method: 'DELETE' });
        onToast('success', 'Traceability link removed.');
      }
      setPendingDelete(null);
      await loadAll(project.id);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to remove record.');
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !linkSource || !linkTarget) return;
    try {
      await apiFetch(`/api/projects/${project.id}/links`, {
        method: 'POST',
        body: JSON.stringify({
          source_id: Number(linkSource),
          target_id: Number(linkTarget),
          link_type: linkType,
        }),
      });
      setLinkSource('');
      setLinkTarget('');
      await loadAll(project.id);
      onToast('success', 'Traceability link added.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to add link.');
    }
  };

  const handleExportCsv = () => {
    if (!impact || !project) return;
    downloadCsv(
      `${project.name.toLowerCase().replace(/\s+/g, '_')}_impact_analysis.csv`,
      ['Code', 'Name', 'Layer', 'Impact Classification', 'Impact Score (%)', 'Hop Distance', 'Triggered By', 'Risk Weight'],
      impact.affectedNodes.map((n) => [
        n.compCode,
        n.name,
        n.layer,
        n.impactKind,
        n.impactScore,
        n.hopDistance >= 0 ? n.hopDistance : 'N/A',
        n.sourceRequirements.join('; '),
        n.riskWeight,
      ])
    );
    onToast('success', 'Downloaded Impact Analysis CSV report.');
  };

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
        Select a project to analyze component dependencies.
      </div>
    );
  }

  const affectedNodes = impact?.affectedNodes ?? [];
  const filteredNodes = affectedNodes.filter((n) => {
    if (activeLayer !== 'all' && n.layer !== activeLayer) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return n.compCode.toLowerCase().includes(q) || n.name.toLowerCase().includes(q);
    }
    return true;
  });

  const compById = new Map(components.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Module 2</span>
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
            Change Impact Analysis &amp; Traceability Matrix
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={running}
            onClick={handleRunImpact}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-60"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>{running ? 'Analyzing Graph...' : 'Recalculate Impact Graph'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('prioritization')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
          >
            <span>Test Prioritization</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          {impact && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                <p className="text-[11px] text-red-600 dark:text-red-400">Direct Impact</p>
                <p className="text-xl font-display font-bold text-red-700 dark:text-red-400 tabular-nums mt-1">
                  {impact.summary.directlyAffected}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                <p className="text-[11px] text-amber-600 dark:text-amber-400">Indirect Impact</p>
                <p className="text-xl font-display font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-1">
                  {impact.summary.indirectlyAffected}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                <p className="text-[11px] text-slate-500">Unaffected</p>
                <p className="text-xl font-display font-bold text-slate-700 dark:text-slate-300 tabular-nums mt-1">
                  {impact.summary.unaffected}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                <p className="text-[11px] text-slate-500">Affected Req</p>
                <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                  {impact.summary.affectedRequirements}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                <p className="text-[11px] text-slate-500">Affected Design</p>
                <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                  {impact.summary.affectedDesign}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                <p className="text-[11px] text-slate-500">Affected Code</p>
                <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                  {impact.summary.affectedCode}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                <p className="text-[11px] text-slate-500">Affected Tests</p>
                <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
                  {impact.summary.affectedTests}
                </p>
              </div>
            </div>
          )}

          {/* Graph Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Traceability &amp; Impact Propagation Preview
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('dependency-map')}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Open Full Dependency Map
              </button>
            </div>
            <DependencyGraphCanvas
              components={components}
              links={links}
              affectedNodes={affectedNodes}
              impactPaths={impact?.impactPaths ?? []}
              selectedReqCode={null}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              compact
            />
          </div>

          {/* Affected Components Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['all', 'requirement', 'design', 'code', 'test'] as const).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => setActiveLayer(layer)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                      activeLayer === layer
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {layer}
                  </button>
                ))}
              </div>

              {impact && (
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Impact CSV</span>
                </button>
              )}
            </div>

            {!impact ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <Activity className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                Run Requirement Change Detection (Module 1) and click Recalculate Impact Graph to analyze component impact.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4">Code</th>
                      <th className="py-2.5 px-4">Component Name</th>
                      <th className="py-2.5 px-4">Layer</th>
                      <th className="py-2.5 px-4">Impact Level</th>
                      <th className="py-2.5 px-4 text-right">Impact Score</th>
                      <th className="py-2.5 px-4 text-right">Hops</th>
                      <th className="py-2.5 px-4">Source Changes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredNodes.map((n) => (
                      <tr key={n.componentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                          {n.compCode}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 font-medium">{n.name}</td>
                        <td className="py-2.5 px-4 capitalize text-slate-600 dark:text-slate-400">{n.layer}</td>
                        <td className="py-2.5 px-4">
                          <StatusLabel variant={n.impactKind} />
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {n.impactScore}%
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                          {n.hopDistance >= 0 ? n.hopDistance : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {n.sourceRequirements.length > 0 ? n.sourceRequirements.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Traceability Matrix Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add Component & Component List */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Manage Traceability Nodes</h3>
                <p className="text-xs text-slate-500">Add Requirement, Design, Code, or Test components.</p>
              </div>
              <form onSubmit={handleAddComponent} className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                <input
                  type="text"
                  value={compCode}
                  onChange={(e) => setCompCode(e.target.value)}
                  placeholder="Code (e.g. MOD-07)"
                  required
                  className="col-span-1 sm:col-span-2 h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="Component Name"
                  required
                  className="col-span-1 sm:col-span-2 h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
                <select
                  value={compLayer}
                  onChange={(e) => setCompLayer(e.target.value as LayerType)}
                  className="col-span-1 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="requirement">Requirement</option>
                  <option value="design">Design</option>
                  <option value="code">Code</option>
                  <option value="test">Test</option>
                </select>
                <button
                  type="submit"
                  className="col-span-1 h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
                <div className="col-span-2 sm:col-span-3 flex items-center gap-2 text-xs text-slate-500">
                  <span>Risk Weight (0.1–1.0):</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.0"
                    value={compRisk}
                    onChange={(e) => setCompRisk(e.target.value)}
                    className="w-20 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                {compLayer === 'test' && (
                  <div className="col-span-2 sm:col-span-3 flex items-center gap-2 text-xs text-slate-500">
                    <span>Exec Time (sec):</span>
                    <input
                      type="number"
                      min="1"
                      value={compTime}
                      onChange={(e) => setCompTime(e.target.value)}
                      className="w-20 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                )}
              </form>

              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                {components.map((c) => (
                  <div key={c.id} className="py-2 flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 mr-2">{c.comp_code}</span>
                      <span className="text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                      <span className="ml-2 text-slate-400 capitalize">({c.layer})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ kind: 'component', id: c.id, label: c.comp_code })}
                      aria-label={`Remove ${c.comp_code}`}
                      className="text-slate-400 hover:text-red-600 p-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Traceability Links */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Manage Traceability Links</h3>
                <p className="text-xs text-slate-500">Define Requirement → Design → Code → Test relationships.</p>
              </div>
              <form onSubmit={handleAddLink} className="grid grid-cols-1 sm:grid-cols-7 gap-2.5">
                <select
                  value={linkSource}
                  onChange={(e) => setLinkSource(e.target.value)}
                  required
                  className="sm:col-span-2 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">Source node...</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.comp_code} ({c.layer})
                    </option>
                  ))}
                </select>
                <select
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value)}
                  className="sm:col-span-2 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="refines">refines</option>
                  <option value="implements">implements</option>
                  <option value="verifies">verifies</option>
                  <option value="depends_on">depends_on</option>
                </select>
                <select
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(e.target.value)}
                  required
                  className="sm:col-span-2 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">Target node...</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.comp_code} ({c.layer})
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="sm:col-span-1 h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Link
                </button>
              </form>

              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                {links.map((l) => {
                  const s = compById.get(l.source_id);
                  const t = compById.get(l.target_id);
                  return (
                    <div key={l.id} className="py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{s?.comp_code ?? l.source_id}</span>
                        <span className="text-slate-400">→ ({l.link_type}) →</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{t?.comp_code ?? l.target_id}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({
                            kind: 'link',
                            id: l.id,
                            label: `${s?.comp_code ?? l.source_id} → ${t?.comp_code ?? l.target_id}`,
                          })
                        }
                        aria-label="Remove link"
                        className="text-slate-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Confirm Removal
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
              Are you sure you want to remove <span className="font-mono font-semibold">{pendingDelete.label}</span> from the traceability matrix?
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Network } from 'lucide-react';
import { DependencyGraphCanvas } from '../components/DependencyGraphCanvas';
import { StatusLabel } from '../components/StatusLabel';
import { apiFetch } from '../lib/api';
import type { ChangeAnalysis, ComponentRecord, ImpactAnalysis, LinkRecord, Project } from '../types';

interface DependencyMapPageProps {
  project: Project | null;
  onToast: (type: 'success' | 'error', text: string) => void;
}

export const DependencyMapPage: React.FC<DependencyMapPageProps> = ({ project, onToast }) => {
  const [components, setComponents] = useState<ComponentRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [changedReqs, setChangedReqs] = useState<string[]>([]);
  const [selectedReqCode, setSelectedReqCode] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!project) return;
    setLoading(true);
    Promise.all([
      apiFetch<{ components: ComponentRecord[]; links: LinkRecord[] }>(`/api/projects/${project.id}/traceability`),
      apiFetch<{ impactAnalyses: ImpactAnalysis[] }>(`/api/projects/${project.id}/impact-analyses`),
      apiFetch<{ analyses: ChangeAnalysis[] }>(`/api/projects/${project.id}/change-analyses`),
    ])
      .then(([trace, ia, ca]) => {
        setComponents(trace.components);
        setLinks(trace.links);
        setImpact(ia.impactAnalyses[0] ?? null);
        const latestCa = ca.analyses[0];
        const reqs = latestCa
          ? latestCa.changes.filter((c) => c.changeType !== 'unchanged').map((c) => c.reqCode)
          : [];
        setChangedReqs(reqs);
        setSelectedReqCode(null);
        setSelectedNodeId(null);
      })
      .catch((err) => {
        onToast('error', err instanceof Error ? err.message : 'Failed to load dependency map.');
      })
      .finally(() => setLoading(false));
  }, [project?.id]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const comp = components.find((c) => c.id === selectedNodeId);
    if (!comp) return null;
    const aff = impact?.affectedNodes.find((n) => n.componentId === selectedNodeId);
    const inbound = links
      .filter((l) => l.target_id === selectedNodeId)
      .map((l) => components.find((c) => c.id === l.source_id))
      .filter(Boolean) as ComponentRecord[];
    const outbound = links
      .filter((l) => l.source_id === selectedNodeId)
      .map((l) => components.find((c) => c.id === l.target_id))
      .filter(Boolean) as ComponentRecord[];
    return { comp, aff, inbound, outbound };
  }, [selectedNodeId, components, links, impact]);

  const visiblePaths = useMemo(() => {
    const paths = impact?.impactPaths ?? [];
    if (!selectedReqCode) return paths;
    return paths.filter((p) => p.fromCode === selectedReqCode);
  }, [impact, selectedReqCode]);

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
        Select a project to inspect its dependency map.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Traceability Visualization</span>
            <span aria-hidden="true">·</span>
            <span>{project.name}</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
            Interactive Dependency Map
          </h2>
        </div>

        {/* Isolate Changed Requirement */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Filter by Changed Requirement:</span>
          <button
            type="button"
            onClick={() => setSelectedReqCode(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              selectedReqCode === null
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            All Paths
          </button>
          {changedReqs.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setSelectedReqCode(code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors ${
                selectedReqCode === code
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8">
            <DependencyGraphCanvas
              components={components}
              links={links}
              affectedNodes={impact?.affectedNodes ?? []}
              impactPaths={impact?.impactPaths ?? []}
              selectedReqCode={selectedReqCode}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          </div>

          <div className="xl:col-span-4 space-y-5">
            {/* Node Inspector */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Component Inspector</h3>
              {!selectedNode ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  <Network className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                  Click any node in the graph to inspect its impact score, upstream requirements, and downstream dependencies.
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {selectedNode.comp.comp_code}
                    </span>
                    <StatusLabel variant={selectedNode.aff?.impactKind ?? 'unaffected'} />
                  </div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{selectedNode.comp.name}</p>
                  <p className="text-slate-500 dark:text-slate-400">{selectedNode.comp.description || 'No description.'}</p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 tabular-nums">
                    <div>
                      <span className="text-slate-400">Layer:</span>{' '}
                      <span className="capitalize font-medium text-slate-800 dark:text-slate-200">{selectedNode.comp.layer}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Impact Score:</span>{' '}
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {selectedNode.aff?.impactScore ?? 0}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Risk Weight:</span>{' '}
                      <span className="font-mono text-slate-800 dark:text-slate-200">{selectedNode.comp.risk_weight}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Hops:</span>{' '}
                      <span className="font-mono text-slate-800 dark:text-slate-200">
                        {selectedNode.aff && selectedNode.aff.hopDistance >= 0 ? selectedNode.aff.hopDistance : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Depends On (Upstream):</p>
                    <p className="font-mono text-slate-500">
                      {selectedNode.inbound.length > 0
                        ? selectedNode.inbound.map((c) => c.comp_code).join(', ')
                        : 'None'}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Impacts (Downstream):</p>
                    <p className="font-mono text-slate-500">
                      {selectedNode.outbound.length > 0
                        ? selectedNode.outbound.map((c) => c.comp_code).join(', ')
                        : 'None'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Impact Propagation Paths */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                Propagated Impact Paths ({visiblePaths.length})
              </h3>
              {visiblePaths.length === 0 ? (
                <p className="text-xs text-slate-500">No impact paths recorded for the current filter.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {visiblePaths.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <StatusLabel variant={p.impactKind} />
                        <span className="font-mono text-slate-400 tabular-nums">{p.hopDistance} hop{p.hopDistance > 1 ? 's' : ''}</span>
                      </div>
                      <p className="font-mono text-slate-800 dark:text-slate-200 break-words">
                        {p.pathCodes.join(' → ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

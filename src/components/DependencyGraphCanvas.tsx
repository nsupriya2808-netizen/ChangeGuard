import React, { useMemo, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { AffectedNode, ComponentRecord, ImpactPath, LayerType, LinkRecord } from '../types';

interface DependencyGraphCanvasProps {
  components: ComponentRecord[];
  links: LinkRecord[];
  affectedNodes: AffectedNode[];
  impactPaths: ImpactPath[];
  selectedReqCode: string | null;
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number | null) => void;
  compact?: boolean;
}

const LAYER_ORDER: LayerType[] = ['requirement', 'design', 'code', 'test'];
const LAYER_LABELS: Record<LayerType, string> = {
  requirement: 'Requirements',
  design: 'Design Components',
  code: 'Code Modules',
  test: 'Test Cases',
};

export const DependencyGraphCanvas: React.FC<DependencyGraphCanvasProps> = ({
  components,
  links,
  affectedNodes,
  impactPaths,
  selectedReqCode,
  selectedNodeId,
  onSelectNode,
  compact = false,
}) => {
  const [zoom, setZoom] = useState(1);

  const affectedMap = useMemo(() => {
    const m = new Map<number, AffectedNode>();
    for (const n of affectedNodes) m.set(n.componentId, n);
    return m;
  }, [affectedNodes]);

  const highlightedCodes = useMemo(() => {
    if (!selectedReqCode) return null;
    const codes = new Set<string>([selectedReqCode]);
    for (const p of impactPaths) {
      if (p.fromCode === selectedReqCode) {
        p.pathCodes.forEach((c) => codes.add(c));
      }
    }
    return codes;
  }, [selectedReqCode, impactPaths]);

  const layout = useMemo(() => {
    const colWidth = 240;
    const nodeWidth = 176;
    const nodeHeight = 56;
    const rowGap = 22;
    const topPad = 56;
    const leftPad = 36;

    const grouped: Record<LayerType, ComponentRecord[]> = {
      requirement: [],
      design: [],
      code: [],
      test: [],
    };
    for (const c of components) {
      grouped[c.layer].push(c);
    }

    const maxRows = Math.max(1, ...LAYER_ORDER.map((l) => grouped[l].length));
    const totalHeight = Math.max(compact ? 360 : 460, topPad + maxRows * (nodeHeight + rowGap) + 32);
    const totalWidth = leftPad * 2 + (LAYER_ORDER.length - 1) * colWidth + nodeWidth;

    const positions = new Map<number, { x: number; y: number; comp: ComponentRecord }>();

    LAYER_ORDER.forEach((layer, colIdx) => {
      const list = grouped[layer];
      const colHeight = list.length * nodeHeight + Math.max(0, list.length - 1) * rowGap;
      const startY = topPad + Math.max(0, (totalHeight - topPad - 24 - colHeight) / 2);
      const x = leftPad + colIdx * colWidth;

      list.forEach((comp, rowIdx) => {
        positions.set(comp.id, {
          x,
          y: startY + rowIdx * (nodeHeight + rowGap),
          comp,
        });
      });
    });

    return { positions, totalWidth, totalHeight, colWidth, nodeWidth, nodeHeight, leftPad };
  }, [components, compact]);

  if (components.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
        No traceability components defined for this project yet.
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/70 dark:bg-slate-950/60 overflow-hidden">
      {/* Legend + Zoom Toolbar */}
      <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-600 inline-block" />
            Direct Impact
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />
            Indirect Impact
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-400 inline-block" />
            Unaffected
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.1).toFixed(2))))}
            aria-label="Zoom out"
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
            aria-label="Zoom in"
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset zoom"
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive SVG Viewport */}
      <div className="overflow-auto p-3" style={{ maxHeight: compact ? '420px' : '620px' }}>
        <svg
          width={layout.totalWidth * zoom}
          height={layout.totalHeight * zoom}
          viewBox={`0 0 ${layout.totalWidth} ${layout.totalHeight}`}
          className="mx-auto select-none"
        >
          <defs>
            <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94A3B8" />
            </marker>
            <marker id="arrow-direct" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#DC2626" />
            </marker>
            <marker id="arrow-indirect" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#D97706" />
            </marker>
          </defs>

          {/* Column Headers */}
          {LAYER_ORDER.map((layer, idx) => (
            <text
              key={layer}
              x={layout.leftPad + idx * layout.colWidth + layout.nodeWidth / 2}
              y={26}
              textAnchor="middle"
              className="fill-slate-500 dark:fill-slate-400 text-[12px] font-semibold"
            >
              {LAYER_LABELS[layer]}
            </text>
          ))}

          {/* Edges */}
          {links.map((link) => {
            const sPos = layout.positions.get(link.source_id);
            const tPos = layout.positions.get(link.target_id);
            if (!sPos || !tPos) return null;

            const sAff = affectedMap.get(link.source_id);
            const tAff = affectedMap.get(link.target_id);

            const isPathMatch =
              highlightedCodes === null ||
              (highlightedCodes.has(sPos.comp.comp_code) && highlightedCodes.has(tPos.comp.comp_code));

            const isImpactedEdge =
              sAff && tAff && sAff.impactKind !== 'unaffected' && tAff.impactKind !== 'unaffected';

            let stroke = '#CBD5E1';
            let marker = 'url(#arrow-muted)';
            let strokeWidth = 1.5;

            if (isImpactedEdge && isPathMatch) {
              if (tAff.impactKind === 'direct') {
                stroke = '#DC2626';
                marker = 'url(#arrow-direct)';
                strokeWidth = 2.2;
              } else {
                stroke = '#D97706';
                marker = 'url(#arrow-indirect)';
                strokeWidth = 2;
              }
            }

            const sameLayer = sPos.comp.layer === tPos.comp.layer;
            const startX = sameLayer ? sPos.x + layout.nodeWidth / 2 : sPos.x + layout.nodeWidth;
            const startY = sameLayer ? sPos.y + layout.nodeHeight : sPos.y + layout.nodeHeight / 2;
            const endX = sameLayer ? tPos.x + layout.nodeWidth / 2 : tPos.x;
            const endY = sameLayer ? tPos.y : tPos.y + layout.nodeHeight / 2;

            const midX = (startX + endX) / 2;
            const pathD = sameLayer
              ? `M ${startX} ${startY} C ${startX + 48} ${startY + 20}, ${endX + 48} ${endY - 20}, ${endX} ${endY}`
              : `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

            return (
              <path
                key={link.id}
                d={pathD}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeOpacity={isPathMatch ? 0.9 : 0.18}
                markerEnd={marker}
              />
            );
          })}

          {/* Nodes */}
          {Array.from(layout.positions.values()).map(({ x, y, comp }) => {
            const aff = affectedMap.get(comp.id);
            const kind = aff?.impactKind ?? 'unaffected';
            const score = aff?.impactScore ?? 0;
            const isSelected = selectedNodeId === comp.id;
            const isPathMatch = highlightedCodes === null || highlightedCodes.has(comp.comp_code);

            let fill = '#FFFFFF';
            let border = '#CBD5E1';
            let codeColor = '#475569';

            if (kind === 'direct') {
              fill = '#FEF2F2';
              border = '#DC2626';
              codeColor = '#B91C1C';
            } else if (kind === 'indirect') {
              fill = '#FFFBEB';
              border = '#D97706';
              codeColor = '#B45309';
            }

            if (isSelected) {
              border = '#2563EB';
            }

            return (
              <g
                key={comp.id}
                transform={`translate(${x}, ${y})`}
                onClick={() => onSelectNode(isSelected ? null : comp.id)}
                style={{ cursor: 'pointer', opacity: isPathMatch ? 1 : 0.25 }}
              >
                <rect
                  width={layout.nodeWidth}
                  height={layout.nodeHeight}
                  rx={8}
                  fill={fill}
                  stroke={border}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
                <text x={10} y={19} fontSize={11} fontWeight={700} fontFamily="JetBrains Mono, monospace" fill={codeColor}>
                  {comp.comp_code}
                </text>
                {score > 0 && (
                  <text
                    x={layout.nodeWidth - 10}
                    y={19}
                    textAnchor="end"
                    fontSize={10}
                    fontWeight={600}
                    fontFamily="JetBrains Mono, monospace"
                    fill={codeColor}
                  >
                    {score}%
                  </text>
                )}
                <text x={10} y={38} fontSize={11} fontWeight={500} fill="#0F172A">
                  {comp.name.length > 22 ? `${comp.name.slice(0, 21)}...` : comp.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

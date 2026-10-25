import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  Edge,
  Node,
  NodeChange,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import {
  Plus,
  Undo2,
  Redo2,
  LayoutGrid,
  Download,
  Image as ImageIcon,
  Trash2,
  FolderPlus,
  ExternalLink,
  Search,
  Database,
  ShieldCheck,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  KnowledgeNodeDefinition,
  UnityProjectProfile,
  UVSConnection,
  UVSGraphSpec,
  UVSNodeInstance,
  ValidationReport,
  VariableScope,
} from '../types/uvs';
import {
  UVSGroupNodeComponent,
  UVSUnitNodeComponent,
  shortCSharpType,
} from './UVSCustomNode';
import { areValueTypesCompatible } from '../validator/graphValidator';
import { applyAutoLayout } from '../exporter/autoLayout';
import { isNodeSupportedInVersion } from '../knowledge-base/registry';

interface GraphEditorViewProps {
  graph: UVSGraphSpec;
  profile: UnityProjectProfile;
  knowledgeNodes: KnowledgeNodeDefinition[];
  validation: ValidationReport;
  canUndo: boolean;
  canRedo: boolean;
  focusedNodeId: string | null;
  onFocusNodeChange: (nodeId: string | null) => void;
  onUpdateGraph: (nextGraph: UVSGraphSpec, recordHistory?: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveProject: () => void;
  onExportJson: () => void;
  onNavigateValidator: () => void;
}

const NODE_TYPES = {
  uvsUnit: UVSUnitNodeComponent,
  uvsGroup: UVSGroupNodeComponent,
};

function parseHandleId(handleId?: string | null): {
  direction: 'in' | 'out';
  kind: 'control' | 'value';
  portKey: string;
} | null {
  if (!handleId) return null;
  const match = handleId.match(/^(in|out)-(control|value)-(.+)$/);
  if (!match) return null;
  return {
    direction: match[1] as 'in' | 'out',
    kind: match[2] as 'control' | 'value',
    portKey: match[3],
  };
}

export const GraphEditorView: React.FC<GraphEditorViewProps> = ({
  graph,
  profile,
  knowledgeNodes,
  validation,
  canUndo,
  canRedo,
  focusedNodeId,
  onFocusNodeChange,
  onUpdateGraph,
  onUndo,
  onRedo,
  onSaveProject,
  onExportJson,
  onNavigateValidator,
}) => {
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const [showFinder, setShowFinder] = useState(false);
  const [finderQuery, setFinderQuery] = useState('');
  const [finderOriginFilter, setFinderOriginFilter] = useState<string>('all');
  const [rightPanelTab, setRightPanelTab] = useState<'inspector' | 'variables' | 'groups'>(
    'inspector'
  );
  const [strictWiringGuard, setStrictWiringGuard] = useState(true);
  const [bannerFeedback, setBannerFeedback] = useState<string | null>(null);

  // New Variable Form State
  const [newVarName, setNewVarName] = useState('');
  const [newVarScope, setNewVarScope] = useState<VariableScope>('Graph');
  const [newVarType, setNewVarType] = useState('System.Single');
  const [newVarDefault, setNewVarDefault] = useState('0');

  // New Group Form State
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  const kbMap = useMemo(
    () => new Map(knowledgeNodes.map((n) => [n.id, n])),
    [knowledgeNodes]
  );

  const selectedNodeInstance = useMemo(
    () => graph.nodes.find((n) => n.id === focusedNodeId) ?? null,
    [graph.nodes, focusedNodeId]
  );

  const selectedNodeDef = useMemo(
    () => (selectedNodeInstance ? kbMap.get(selectedNodeInstance.definitionId) : undefined),
    [selectedNodeInstance, kbMap]
  );

  // Build React Flow Nodes (Groups behind Units)
  const rfNodes: Node[] = useMemo(() => {
    const groupNodes: Node[] = graph.groups.map((grp) => ({
      id: `group-${grp.id}`,
      type: 'uvsGroup',
      position: { x: grp.bounds.x, y: grp.bounds.y },
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: {
        title: grp.title,
        descriptionAr: grp.descriptionAr,
        width: grp.bounds.width,
        height: grp.bounds.height,
      },
    }));

    const unitNodes: Node[] = graph.nodes.map((n) => {
      const def = kbMap.get(n.definitionId);
      const nodeIssues = validation.issues.filter((i) => i.nodeId === n.id);
      const connectedInputKeys = graph.connections
        .filter((c) => c.targetNodeId === n.id && c.kind === 'value')
        .map((c) => c.targetPortKey);

      return {
        id: n.id,
        type: 'uvsUnit',
        position: n.position,
        selected: n.id === focusedNodeId,
        data: {
          instance: n,
          definition: def,
          issues: nodeIssues,
          connectedInputKeys,
          isSelectedNode: n.id === focusedNodeId,
        },
      };
    });

    return [...groupNodes, ...unitNodes];
  }, [graph.groups, graph.nodes, graph.connections, kbMap, validation.issues, focusedNodeId]);

  // Build React Flow Edges (Visual Distinction between Flow & Value)
  const rfEdges: Edge[] = useMemo(() => {
    return graph.connections.map((conn) => {
      const hasIssue = validation.issues.some((i) => i.connectionId === conn.id);
      const isFlow = conn.kind === 'flow';
      const strokeColor = hasIssue ? '#EF4444' : isFlow ? '#10B981' : '#38BDF8';

      return {
        id: conn.id,
        source: conn.sourceNodeId,
        target: conn.targetNodeId,
        sourceHandle: `out-${isFlow ? 'control' : 'value'}-${conn.sourcePortKey}`,
        targetHandle: `in-${isFlow ? 'control' : 'value'}-${conn.targetPortKey}`,
        animated: isFlow && !hasIssue,
        label: isFlow ? undefined : conn.sourcePortKey,
        labelStyle: { fill: '#94A3B8', fontSize: 10, fontFamily: 'IBM Plex Mono' },
        labelBgStyle: { fill: '#0F172A', fillOpacity: 0.85 },
        style: {
          stroke: strokeColor,
          strokeWidth: isFlow ? 2.8 : 1.9,
          strokeDasharray: isFlow ? undefined : '5 3',
        },
        markerEnd: isFlow
          ? {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
              width: 16,
              height: 16,
            }
          : undefined,
      };
    });
  }, [graph.connections, validation.issues]);

  // Handle Node Dragging / Selection / Deletion
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let positionChanged = false;
      let finishDrag = false;
      const posUpdates = new Map<string, { x: number; y: number }>();
      const removedIds = new Set<string>();

      for (const ch of changes) {
        if (ch.type === 'position' && ch.position && !ch.id.startsWith('group-')) {
          positionChanged = true;
          posUpdates.set(ch.id, {
            x: Math.round(ch.position.x),
            y: Math.round(ch.position.y),
          });
          if (ch.dragging === false) {
            finishDrag = true;
          }
        } else if (ch.type === 'select' && ch.selected && !ch.id.startsWith('group-')) {
          onFocusNodeChange(ch.id);
          setRightPanelTab('inspector');
        } else if (ch.type === 'remove' && !ch.id.startsWith('group-')) {
          removedIds.add(ch.id);
        }
      }

      if (removedIds.size > 0) {
        const nextNodes = graph.nodes.filter((n) => !removedIds.has(n.id));
        const nextConns = graph.connections.filter(
          (c) => !removedIds.has(c.sourceNodeId) && !removedIds.has(c.targetNodeId)
        );
        if (focusedNodeId && removedIds.has(focusedNodeId)) {
          onFocusNodeChange(null);
        }
        onUpdateGraph(
          {
            ...graph,
            updatedAt: new Date().toISOString(),
            nodes: nextNodes,
            connections: nextConns,
          },
          true
        );
        return;
      }

      if (positionChanged) {
        const nextNodes = graph.nodes.map((n) =>
          posUpdates.has(n.id) ? { ...n, position: posUpdates.get(n.id)! } : n
        );
        onUpdateGraph(
          {
            ...graph,
            updatedAt: new Date().toISOString(),
            nodes: nextNodes,
          },
          finishDrag
        );
      }
    },
    [graph, focusedNodeId, onFocusNodeChange, onUpdateGraph]
  );

  // Connect Ports with optional strict validation guard
  const handleConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      const srcParsed = parseHandleId(params.sourceHandle);
      const dstParsed = parseHandleId(params.targetHandle);
      if (!srcParsed || !dstParsed) return;

      if (strictWiringGuard) {
        if (srcParsed.kind !== dstParsed.kind) {
          setBannerFeedback(
            'تم منع الوصلة: لا يجوز خلط منفذ تنفيذ (Flow) مع منفذ بيانات (Value).'
          );
          return;
        }

        const srcNode = graph.nodes.find((n) => n.id === params.source);
        const dstNode = graph.nodes.find((n) => n.id === params.target);
        const srcDef = srcNode ? kbMap.get(srcNode.definitionId) : undefined;
        const dstDef = dstNode ? kbMap.get(dstNode.definitionId) : undefined;

        if (srcParsed.kind === 'value' && srcDef && dstDef) {
          const sPort = srcDef.valueOutputs.find((p) => p.key === srcParsed.portKey);
          const dPort = dstDef.valueInputs.find((p) => p.key === dstParsed.portKey);
          if (sPort && dPort && !areValueTypesCompatible(sPort.dataType, dPort.dataType)) {
            setBannerFeedback(
              `تم منع الوصلة: النوع (${shortCSharpType(
                sPort.dataType
              )}) غير متوافق مع (${shortCSharpType(dPort.dataType)}).`
            );
            return;
          }
        }
      }

      // Replace existing wire if single-connection port already occupied (mirrors Unity VS behavior in strict mode)
      let filteredConnections = [...graph.connections];
      if (strictWiringGuard) {
        if (srcParsed.kind === 'control') {
          filteredConnections = filteredConnections.filter(
            (c) =>
              !(
                c.kind === 'flow' &&
                c.sourceNodeId === params.source &&
                c.sourcePortKey === srcParsed.portKey
              )
          );
        } else {
          filteredConnections = filteredConnections.filter(
            (c) =>
              !(
                c.kind === 'value' &&
                c.targetNodeId === params.target &&
                c.targetPortKey === dstParsed.portKey
              )
          );
        }
      }

      const newConn: UVSConnection = {
        id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: srcParsed.kind === 'control' ? 'flow' : 'value',
        sourceNodeId: params.source,
        sourcePortKey: srcParsed.portKey,
        targetNodeId: params.target,
        targetPortKey: dstParsed.portKey,
      };

      setBannerFeedback(null);
      onUpdateGraph(
        {
          ...graph,
          updatedAt: new Date().toISOString(),
          connections: [...filteredConnections, newConn],
        },
        true
      );
    },
    [graph, kbMap, strictWiringGuard, onUpdateGraph]
  );

  const handleDeleteConnection = (connId: string) => {
    onUpdateGraph(
      {
        ...graph,
        updatedAt: new Date().toISOString(),
        connections: graph.connections.filter((c) => c.id !== connId),
      },
      true
    );
  };

  const handleAddNodeFromKB = (def: KnowledgeNodeDefinition) => {
    const inlineDefaults: Record<string, string | number | boolean> = {};
    for (const f of def.inlineFields ?? []) {
      inlineDefaults[f.key] = f.defaultValue;
    }
    for (const vi of def.valueInputs) {
      if (vi.defaultValue !== undefined && vi.defaultValue !== null) {
        inlineDefaults[vi.key] = vi.defaultValue;
      }
    }

    const offset = graph.nodes.length * 36;
    const newNode: UVSNodeInstance = {
      id: `n-${Date.now().toString(36)}`,
      definitionId: def.id,
      unitClassName: def.unitClassName,
      position: { x: 180 + (offset % 420), y: 120 + (offset % 280) },
      inlineValues: inlineDefaults,
    };

    onUpdateGraph(
      {
        ...graph,
        updatedAt: new Date().toISOString(),
        nodes: [...graph.nodes, newNode],
      },
      true
    );
    onFocusNodeChange(newNode.id);
    setShowFinder(false);
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedNodeInstance) return;
    const targetId = selectedNodeInstance.id;
    onFocusNodeChange(null);
    onUpdateGraph(
      {
        ...graph,
        updatedAt: new Date().toISOString(),
        nodes: graph.nodes.filter((n) => n.id !== targetId),
        connections: graph.connections.filter(
          (c) => c.sourceNodeId !== targetId && c.targetNodeId !== targetId
        ),
      },
      true
    );
  };

  const handleInlineValueChange = (key: string, value: string | number | boolean) => {
    if (!selectedNodeInstance) return;
    const nextNodes = graph.nodes.map((n) =>
      n.id === selectedNodeInstance.id
        ? {
            ...n,
            inlineValues: {
              ...n.inlineValues,
              [key]: value,
            },
          }
        : n
    );
    onUpdateGraph(
      {
        ...graph,
        updatedAt: new Date().toISOString(),
        nodes: nextNodes,
      },
      true
    );
  };

  const handleAutoLayout = () => {
    const next = applyAutoLayout(graph, knowledgeNodes);
    onUpdateGraph(next, true);
    setBannerFeedback('تمت إعادة ترتيب العقد والمجموعات طوبولوجياً.');
  };

  const handleExportHighResPng = async () => {
    if (!canvasWrapperRef.current) return;
    try {
      const dataUrl = await toPng(canvasWrapperRef.current, {
        backgroundColor: '#0B0F17',
        pixelRatio: 2.5,
      });
      const link = document.createElement('a');
      link.download = `${graph.name || 'uvs-graph'}.png`;
      link.href = dataUrl;
      link.click();
      setBannerFeedback('تم تصدير صورة PNG عالية الدقة للمخطط بنجاح.');
    } catch {
      setBannerFeedback('تعذر تصدير الصورة؛ جرّب التصدير من تبويب التصدير والنسخ الاحتياطية.');
    }
  };

  const handleAddVariable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVarName.trim()) return;
    const exists = graph.variables.some(
      (v) => v.name === newVarName.trim() && v.scope === newVarScope
    );
    if (exists) {
      setBannerFeedback('يوجد متغير بنفس الاسم والنطاق مسبقاً.');
      return;
    }
    onUpdateGraph(
      {
        ...graph,
        updatedAt: new Date().toISOString(),
        variables: [
          ...graph.variables,
          {
            id: `var-${Date.now().toString(36)}`,
            name: newVarName.trim(),
            scope: newVarScope,
            dataType: newVarType,
            defaultValue: newVarDefault,
            descriptionAr: 'متغير مضاف من محرر المخطط.',
          },
        ],
      },
      true
    );
    setNewVarName('');
  };

  const handleCreateGroupFromAllOrSelected = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupTitle.trim()) return;
    const targetNodes = selectedNodeInstance ? [selectedNodeInstance] : graph.nodes.slice(0, 3);
    const minX = targetNodes.length
      ? Math.min(...targetNodes.map((n) => n.position.x)) - 32
      : 100;
    const minY = targetNodes.length
      ? Math.min(...targetNodes.map((n) => n.position.y)) - 52
      : 100;

    onUpdateGraph(
      {
        ...graph,
        updatedAt: new Date().toISOString(),
        groups: [
          ...graph.groups,
          {
            id: `grp-${Date.now().toString(36)}`,
            title: newGroupTitle.trim(),
            descriptionAr: newGroupDesc.trim(),
            bounds: { x: minX, y: minY, width: 420, height: 280 },
            nodeIds: targetNodes.map((n) => n.id),
          },
        ],
      },
      true
    );
    setNewGroupTitle('');
    setNewGroupDesc('');
  };

  const filteredFinderNodes = useMemo(() => {
    const q = finderQuery.trim().toLowerCase();
    return knowledgeNodes.filter((n) => {
      if (finderOriginFilter !== 'all' && n.originKind !== finderOriginFilter) return false;
      if (!q) return true;
      return (
        n.displayName.toLowerCase().includes(q) ||
        n.unitClassName.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.summaryAr.toLowerCase().includes(q)
      );
    });
  }, [knowledgeNodes, finderQuery, finderOriginFilter]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0B0F17]">
      {/* Workspace Editor Toolbar */}
      <div className="px-4 py-2.5 bg-[#111827] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFinder(true)}
            className="px-3.5 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة عقدة (Fuzzy Finder)</span>
          </button>

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-35 text-xs flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="تراجع"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>تراجع</span>
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-35 text-xs flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="إعادة"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span>إعادة</span>
          </button>

          <button
            type="button"
            onClick={handleAutoLayout}
            className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-sky-400" />
            <span>ترتيب تلقائي</span>
          </button>

          <label className="flex items-center gap-1.5 text-xs text-slate-400 px-2 select-none cursor-pointer whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={strictWiringGuard}
              onChange={(e) => setStrictWiringGuard(e.target.checked)}
              className="rounded border-slate-600 bg-slate-900 text-sky-500"
            />
            <span>منع التوصيل غير المتوافق فورياً</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNavigateValidator}
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-xs flex items-center gap-1.5 text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {validation.counts.errors > 0 ? (
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="tabular-nums">
              المدقق: {validation.counts.errors} خطأ · {validation.counts.warnings} تحذير
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportHighResPng}
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-xs flex items-center gap-1.5 text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>PNG</span>
          </button>

          <button
            type="button"
            onClick={onExportJson}
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-xs flex items-center gap-1.5 text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>

          <button
            type="button"
            onClick={onSaveProject}
            className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-white text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            حفظ المخطط
          </button>
        </div>
      </div>

      {bannerFeedback && (
        <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-sky-300">
          <span>{bannerFeedback}</span>
          <button
            type="button"
            onClick={() => setBannerFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split: Canvas (Left/Center) + Inspector & Blackboard Drawer (Right in RTL) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Interactive React Flow Canvas (LTR coordinate space for accurate port geometry) */}
        <div ref={canvasWrapperRef} dir="ltr" className="flex-1 h-[55vh] lg:h-full relative bg-[#0B0F17]">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onConnect={handleConnect}
            onPaneClick={() => onFocusNodeChange(null)}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.2}
              color="#1E293B"
            />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeColor={(n) => (n.type === 'uvsGroup' ? '#1E293B' : '#38BDF8')}
              maskColor="rgba(11, 15, 23, 0.75)"
            />
          </ReactFlow>

          {/* Visual Legend Overlay */}
          <div
            dir="rtl"
            className="absolute top-3 right-3 px-3 py-1.5 rounded-md bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-3 pointer-events-none"
          >
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-emerald-400" />
              <span>تدفق التنفيذ (Flow)</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-sky-400" />
              <span>تدفق البيانات (Value)</span>
            </span>
          </div>
        </div>

        {/* Inspector / Blackboard / Groups Side Panel */}
        <aside className="w-full lg:w-[360px] bg-[#111827] border-t lg:border-t-0 lg:border-r border-slate-800 flex flex-col overflow-hidden shrink-0">
          {/* Segmented Control Tabs */}
          <div className="p-2 border-b border-slate-800 grid grid-cols-3 gap-1 bg-slate-950/50">
            <button
              type="button"
              onClick={() => setRightPanelTab('inspector')}
              className={`py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                rightPanelTab === 'inspector'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              مفتش العقدة
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('variables')}
              className={`py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                rightPanelTab === 'variables'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              المتغيرات ({graph.variables.length})
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('groups')}
              className={`py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                rightPanelTab === 'groups'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الروابط والمجموعات
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
            {rightPanelTab === 'inspector' && (
              <>
                {!selectedNodeInstance ? (
                  <div className="py-10 text-center space-y-2 text-slate-400">
                    <Database className="w-7 h-7 mx-auto text-slate-600" />
                    <p className="text-xs leading-relaxed">
                      اضغط على أي عقدة داخل مساحة الرسم لعرض مصدرها الرسمي، منافذها، وتعديل قيمها الافتراضية.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
                      <div>
                        <h3 className="font-semibold text-slate-100 font-mono text-sm" dir="ltr">
                          {selectedNodeDef?.displayName ?? selectedNodeInstance.unitClassName}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono mt-0.5 break-all" dir="ltr">
                          {selectedNodeDef?.unitClassName ?? selectedNodeInstance.definitionId}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDeleteSelectedNode}
                        className="p-1.5 rounded border border-red-900/60 text-red-400 hover:bg-red-950/60 cursor-pointer"
                        title="حذف العقدة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {selectedNodeDef ? (
                      <>
                        <div className="text-xs text-slate-300 leading-relaxed space-y-1.5">
                          <p>{selectedNodeDef.summaryAr}</p>
                          <p className="text-slate-400">{selectedNodeDef.usageConditionsAr}</p>
                          <div className="pt-1 text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                            <span>الأصل: {selectedNodeDef.originKind}</span>
                            <span>·</span>
                            <span>الحالة: {selectedNodeDef.verificationStatus}</span>
                            <span>·</span>
                            <span>أدنى إصدار: {selectedNodeDef.minVsVersion}</span>
                          </div>
                          {selectedNodeDef.sourceDocUrl.startsWith('http') && (
                            <a
                              href={selectedNodeDef.sourceDocUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline pt-1"
                            >
                              <span>الوثائق الرسمية في Unity</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        {/* Inline Editable Fields */}
                        {(selectedNodeDef.inlineFields ?? []).length > 0 && (
                          <div className="space-y-2.5 pt-3 border-t border-slate-800">
                            <h4 className="text-xs font-semibold text-slate-200">
                              خصائص العقدة (Unit Settings)
                            </h4>
                            {(selectedNodeDef.inlineFields ?? []).map((field) => {
                              const currentVal =
                                selectedNodeInstance.inlineValues[field.key] ?? field.defaultValue;
                              return (
                                <div key={field.key} className="space-y-1">
                                  <label className="block text-xs text-slate-300 font-mono" dir="ltr">
                                    {field.label} ({shortCSharpType(field.dataType)})
                                  </label>
                                  {field.options ? (
                                    <select
                                      value={String(currentVal)}
                                      onChange={(e) =>
                                        handleInlineValueChange(field.key, e.target.value)
                                      }
                                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                                      dir="ltr"
                                    >
                                      {field.options.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : field.dataType === 'System.Boolean' ? (
                                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(currentVal)}
                                        onChange={(e) =>
                                          handleInlineValueChange(field.key, e.target.checked)
                                        }
                                      />
                                      <span>{field.descriptionAr}</span>
                                    </label>
                                  ) : (
                                    <input
                                      type={
                                        field.dataType === 'System.Int32' ||
                                        field.dataType === 'System.Single'
                                          ? 'number'
                                          : 'text'
                                      }
                                      value={String(currentVal)}
                                      onChange={(e) =>
                                        handleInlineValueChange(
                                          field.key,
                                          field.dataType === 'System.Int32' ||
                                            field.dataType === 'System.Single'
                                            ? Number(e.target.value)
                                            : e.target.value
                                        )
                                      }
                                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                                      dir="ltr"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Editable Unconnected Value Inputs */}
                        {selectedNodeDef.valueInputs.length > 0 && (
                          <div className="space-y-2.5 pt-3 border-t border-slate-800">
                            <h4 className="text-xs font-semibold text-slate-200">
                              القيم المضمنة للمدخلات غير المتصلة
                            </h4>
                            {selectedNodeDef.valueInputs.map((vIn) => {
                              const isConnected = graph.connections.some(
                                (c) =>
                                  c.kind === 'value' &&
                                  c.targetNodeId === selectedNodeInstance.id &&
                                  c.targetPortKey === vIn.key
                              );
                              const val =
                                selectedNodeInstance.inlineValues[vIn.key] ??
                                vIn.defaultValue ??
                                '';
                              return (
                                <div key={vIn.key} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-mono text-slate-300" dir="ltr">
                                      {vIn.label} : {shortCSharpType(vIn.dataType)}
                                    </span>
                                    {isConnected && (
                                      <span className="text-[11px] text-emerald-400">
                                        متصل بسلك
                                      </span>
                                    )}
                                  </div>
                                  {!isConnected && (
                                    <input
                                      type="text"
                                      value={String(val)}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (
                                          (vIn.dataType === 'System.Single' ||
                                            vIn.dataType === 'System.Int32') &&
                                          raw !== '' &&
                                          !Number.isNaN(Number(raw))
                                        ) {
                                          handleInlineValueChange(vIn.key, Number(raw));
                                        } else if (vIn.dataType === 'System.Boolean') {
                                          handleInlineValueChange(vIn.key, raw === 'true');
                                        } else {
                                          handleInlineValueChange(vIn.key, raw);
                                        }
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                                      dir="ltr"
                                    />
                                  )}
                                  <p className="text-[11px] text-slate-500">{vIn.descriptionAr}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-3 rounded border border-red-800/60 bg-red-950/30 text-xs text-red-200 space-y-2">
                        <p>
                          هذه العقدة غير موجودة في قاعدة المعرفة الحالية. قد تكون Custom Unit لم يُرفع تقرير فحصها بعد، أو اسماً غير صالح.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {rightPanelTab === 'variables' && (
              <div className="space-y-4">
                <form onSubmit={handleAddVariable} className="space-y-2.5 pb-4 border-b border-slate-800">
                  <h4 className="text-xs font-semibold text-slate-200">
                    إضافة متغير جديد (Blackboard)
                  </h4>
                  <input
                    type="text"
                    placeholder="اسم المتغير بالإنجليزية (مثلاً Speed)"
                    value={newVarName}
                    onChange={(e) => setNewVarName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                    dir="ltr"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newVarScope}
                      onChange={(e) => setNewVarScope(e.target.value as VariableScope)}
                      className="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                      dir="ltr"
                    >
                      <option value="Graph">Graph</option>
                      <option value="Object">Object</option>
                      <option value="Scene">Scene</option>
                      <option value="Application">Application</option>
                      <option value="Saved">Saved</option>
                      <option value="Flow">Flow</option>
                    </select>
                    <select
                      value={newVarType}
                      onChange={(e) => setNewVarType(e.target.value)}
                      className="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                      dir="ltr"
                    >
                      <option value="System.Single">Float</option>
                      <option value="System.Int32">Integer</option>
                      <option value="System.Boolean">Boolean</option>
                      <option value="System.String">String</option>
                      <option value="UnityEngine.Vector3">Vector3</option>
                      <option value="UnityEngine.GameObject">GameObject</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="القيمة الابتدائية"
                    value={newVarDefault}
                    onChange={(e) => setNewVarDefault(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                    dir="ltr"
                  />
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer"
                  >
                    إضافة المتغير
                  </button>
                </form>

                <div className="space-y-2">
                  {graph.variables.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد متغيرات معرفة في هذا المخطط.</p>
                  ) : (
                    graph.variables.map((v) => (
                      <div
                        key={v.id}
                        className="p-2.5 rounded border border-slate-800 bg-slate-900/60 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-semibold text-slate-100 truncate" dir="ltr">
                            {v.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                            {v.scope} · {shortCSharpType(v.dataType)} = {v.defaultValue}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateGraph(
                              {
                                ...graph,
                                updatedAt: new Date().toISOString(),
                                variables: graph.variables.filter((x) => x.id !== v.id),
                              },
                              true
                            )
                          }
                          className="text-slate-500 hover:text-red-400 cursor-pointer"
                          title="حذف المتغير"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {rightPanelTab === 'groups' && (
              <div className="space-y-5">
                <form
                  onSubmit={handleCreateGroupFromAllOrSelected}
                  className="space-y-2 pb-4 border-b border-slate-800"
                >
                  <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
                    <span>إنشاء مجموعة تنظيمية (Graph Group)</span>
                  </h4>
                  <input
                    type="text"
                    placeholder="عنوان المجموعة"
                    value={newGroupTitle}
                    onChange={(e) => setNewGroupTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                  <input
                    type="text"
                    placeholder="وصف مختصر للمرحلة"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 cursor-pointer"
                  >
                    إضافة المجموعة حول العقدة المحددة
                  </button>
                </form>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-200">
                    الوصلات الفعالة ({graph.connections.length}) — اضغط لفصل أي سلك
                  </h4>
                  {graph.connections.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد توصيلات حالية.</p>
                  ) : (
                    graph.connections.map((c) => (
                      <div
                        key={c.id}
                        className="px-2.5 py-2 rounded border border-slate-800 bg-slate-900/50 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="min-w-0 font-mono text-slate-300 truncate" dir="ltr">
                          [{c.kind}] {c.sourceNodeId}.{c.sourcePortKey} → {c.targetNodeId}.
                          {c.targetPortKey}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteConnection(c.id)}
                          className="text-slate-500 hover:text-red-400 shrink-0 cursor-pointer"
                          title="فصل السلك"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Fuzzy Node Finder Modal */}
      {showFinder && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#111827] border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                البحث وإضافة عقدة موثقة (Knowledge Base Fuzzy Finder)
              </h3>
              <button
                type="button"
                onClick={() => setShowFinder(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-800 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  autoFocus
                  placeholder="ابحث باسم العقدة بالإنجليزية أو الوظيفة بالعربية (مثل AddForce, If, Cooldown, قفز)..."
                  value={finderQuery}
                  onChange={(e) => setFinderQuery(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: 'الكل' },
                  { id: 'builtin', label: 'مدمجة (Built-in)' },
                  { id: 'reflection', label: 'انعكاس (Reflection)' },
                  { id: 'external_package', label: 'حزم خارجية' },
                  { id: 'custom', label: 'مخصصة (Custom)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFinderOriginFilter(tab.id)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                      finderOriginFilter === tab.id
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/80">
              {filteredFinderNodes.map((def) => {
                const compatible = isNodeSupportedInVersion(def, profile.vsPackageVersion);
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => handleAddNodeFromKB(def)}
                    className="w-full px-4 py-3 text-right hover:bg-slate-800/70 transition-colors flex items-start justify-between gap-4 cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="font-mono text-xs font-semibold text-slate-100" dir="ltr">
                        {def.displayName}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1">{def.summaryAr}</p>
                      <div className="text-[11px] text-slate-500 font-mono" dir="ltr">
                        {def.unitClassName} · {def.originKind} · min v{def.minVsVersion}
                      </div>
                    </div>
                    <div className="shrink-0 text-left">
                      {!compatible ? (
                        <span className="text-[11px] text-red-400">
                          يتطلب v{def.minVsVersion}
                        </span>
                      ) : (
                        <span className="text-[11px] text-sky-400">إضافة +</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, HelpCircle, Play } from 'lucide-react';
import { KnowledgeNodeDefinition, UVSNodeInstance, ValidationIssue } from '../types/uvs';

export interface UVSFlowNodeData extends Record<string, unknown> {
  instance: UVSNodeInstance;
  definition?: KnowledgeNodeDefinition;
  issues: ValidationIssue[];
  connectedInputKeys: string[];
  isSelectedNode: boolean;
}

export interface UVSGroupNodeData extends Record<string, unknown> {
  title: string;
  descriptionAr: string;
  width: number;
  height: number;
}

export function shortCSharpType(fullType?: string): string {
  if (!fullType) return 'any';
  const map: Record<string, string> = {
    'System.Single': 'float',
    'System.Int32': 'int',
    'System.Boolean': 'bool',
    'System.String': 'string',
    'System.Object': 'object',
    'UnityEngine.Vector2': 'Vector2',
    'UnityEngine.Vector3': 'Vector3',
    'UnityEngine.GameObject': 'GameObject',
    'UnityEngine.Transform': 'Transform',
    'UnityEngine.Rigidbody': 'Rigidbody',
    'UnityEngine.Rigidbody2D': 'Rigidbody2D',
    'UnityEngine.Collider': 'Collider',
    'UnityEngine.Collider2D': 'Collider2D',
    'UnityEngine.Component': 'Component',
    'UnityEngine.Object': 'UnityObject',
    'UnityEngine.Animator': 'Animator',
    'UnityEngine.KeyCode': 'KeyCode',
    'UnityEngine.ForceMode': 'ForceMode',
    'Unity.VisualScripting.PressState': 'PressState',
    'UnityEngine.InputSystem.InputAction': 'InputAction',
  };
  if (map[fullType]) return map[fullType];
  const parts = fullType.split('.');
  return parts[parts.length - 1] || fullType;
}

export function portColorClass(dataType?: string): string {
  const short = shortCSharpType(dataType);
  switch (short) {
    case 'float':
    case 'int':
      return '!bg-sky-400 !border-sky-950';
    case 'bool':
      return '!bg-violet-400 !border-violet-950';
    case 'string':
      return '!bg-amber-400 !border-amber-950';
    case 'Vector2':
    case 'Vector3':
      return '!bg-orange-400 !border-orange-950';
    case 'GameObject':
    case 'Transform':
    case 'Rigidbody':
    case 'Rigidbody2D':
    case 'Collider':
    case 'Collider2D':
    case 'Component':
    case 'Animator':
      return '!bg-rose-400 !border-rose-950';
    default:
      return '!bg-slate-300 !border-slate-900';
  }
}

export const UVSGroupNodeComponent = memo(({ data }: NodeProps) => {
  const d = data as UVSGroupNodeData;
  return (
    <div
      style={{ width: d.width, height: d.height }}
      className="rounded-xl border border-dashed border-slate-700/80 bg-slate-900/25 p-3 pointer-events-none select-none"
      dir="rtl"
    >
      <div className="text-xs font-semibold text-slate-300 tracking-wide">{d.title}</div>
      {d.descriptionAr && (
        <div className="text-[11px] text-slate-500 mt-0.5">{d.descriptionAr}</div>
      )}
    </div>
  );
});
UVSGroupNodeComponent.displayName = 'UVSGroupNodeComponent';

export const UVSUnitNodeComponent = memo(({ data, selected }: NodeProps) => {
  const { instance, definition, issues, connectedInputKeys } = data as UVSFlowNodeData;
  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarning = issues.some((i) => i.severity === 'warning');
  const isMissing = !definition;
  const isUnverified = definition && definition.verificationStatus !== 'verified';

  const headerTone = isMissing || hasError
    ? 'bg-red-950/90 border-b border-red-800/70 text-red-100'
    : definition?.isEventNode
    ? 'bg-emerald-950/85 border-b border-emerald-800/60 text-emerald-50'
    : definition?.originKind === 'reflection'
    ? 'bg-sky-950/85 border-b border-sky-800/60 text-sky-50'
    : definition?.originKind === 'custom'
    ? 'bg-amber-950/85 border-b border-amber-800/60 text-amber-50'
    : 'bg-slate-800/95 border-b border-slate-700/80 text-slate-100';

  const ringClass = selected
    ? 'ring-2 ring-sky-400 border-sky-400'
    : hasError || isMissing
    ? 'border-red-500/80'
    : hasWarning || isUnverified
    ? 'border-amber-500/70'
    : 'border-slate-700/90';

  const originLabel = isMissing
    ? 'مفقودة'
    : definition.originKind === 'builtin'
    ? 'Built-in'
    : definition.originKind === 'reflection'
    ? 'Reflection'
    : definition.originKind === 'external_package'
    ? 'Package'
    : 'Custom Unit';

  const controlInputs = definition?.controlInputs ?? [];
  const valueInputs = definition?.valueInputs ?? [];
  const controlOutputs = definition?.controlOutputs ?? [];
  const valueOutputs = definition?.valueOutputs ?? [];

  return (
    <div
      dir="ltr"
      className={`w-[272px] rounded-lg bg-[#111827] border ${ringClass} shadow-lg transition-colors text-left font-sans`}
    >
      {/* Unit Header */}
      <div className={`px-3 py-2 rounded-t-[7px] flex items-center justify-between gap-2 ${headerTone}`}>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate font-mono">
            {instance.titleOverride || definition?.displayName || instance.unitClassName}
          </div>
          <div className="text-[10px] opacity-75 truncate font-mono mt-0.5">
            {originLabel} · {definition?.category || 'Unresolved'}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {isMissing || hasError ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" aria-label="خطأ في العقدة" />
          ) : isUnverified || hasWarning ? (
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" aria-label="تحذير تحقق" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/90" aria-label="موثقة" />
          )}
        </div>
      </div>

      {/* Missing / Unverified Explicit Banner */}
      {isMissing && (
        <div dir="rtl" className="px-2.5 py-1.5 bg-red-950/40 text-[11px] text-red-300 border-b border-red-900/50">
          عقدة غير موجودة في قاعدة المعرفة ({instance.definitionId})
        </div>
      )}
      {!isMissing && isUnverified && (
        <div dir="rtl" className="px-2.5 py-1 bg-amber-950/35 text-[10px] text-amber-300 border-b border-amber-900/40">
          غير متحقق منها داخل Unity Editor
        </div>
      )}

      {/* Inline Special Configuration Summary (Variable Name / Coroutine) */}
      {(instance.inlineValues['name'] !== undefined ||
        Boolean(instance.inlineValues['coroutine'])) && (
        <div className="px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-300">
          {instance.inlineValues['name'] !== undefined ? (
            <span className="truncate">
              [{String(instance.inlineValues['kind'] ?? 'Graph')}] {String(instance.inlineValues['name'])}
            </span>
          ) : (
            <span />
          )}
          {Boolean(instance.inlineValues['coroutine']) && (
            <span className="text-[10px] text-emerald-300">Coroutine</span>
          )}
        </div>
      )}

      {/* Two-Column Ports Matrix: Inputs (Left) | Outputs (Right) */}
      <div className="grid grid-cols-2 gap-2 py-2.5 px-2.5 text-[11px]">
        {/* Left Column: Inputs */}
        <div className="space-y-2">
          {controlInputs.map((port) => (
            <div key={`ci-${port.key}`} className="relative flex items-center gap-1.5 min-h-[22px] pl-2">
              <Handle
                type="target"
                position={Position.Left}
                id={`in-control-${port.key}`}
                className="!w-3 !h-3 !rounded-xs !bg-emerald-400 !border-2 !border-emerald-950 !-left-[16px]"
              />
              <Play className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400 shrink-0" />
              <span className="font-mono text-slate-200 truncate">{port.label}</span>
            </div>
          ))}

          {valueInputs.map((port) => {
            const isConnected = connectedInputKeys.includes(port.key);
            const inlineVal =
              instance.inlineValues[port.key] !== undefined
                ? instance.inlineValues[port.key]
                : port.defaultValue;
            return (
              <div key={`vi-${port.key}`} className="relative flex flex-col justify-center min-h-[24px] pl-2">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`in-value-${port.key}`}
                  className={`!w-2.5 !h-2.5 !rounded-full !border-2 !-left-[15px] ${portColorClass(
                    port.dataType
                  )}`}
                />
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-mono text-slate-200 truncate">{port.label}</span>
                  <span className="font-mono text-[9px] text-slate-500 shrink-0">
                    :{shortCSharpType(port.dataType)}
                  </span>
                </div>
                {!isConnected && inlineVal !== undefined && inlineVal !== null && (
                  <div className="font-mono text-[10px] text-sky-300/90 bg-slate-900/90 border border-slate-800 rounded px-1.5 py-0.5 mt-0.5 truncate max-w-[112px]">
                    {String(inlineVal)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Outputs */}
        <div className="space-y-2 text-right">
          {controlOutputs.map((port) => (
            <div
              key={`co-${port.key}`}
              className="relative flex items-center justify-end gap-1.5 min-h-[22px] pr-2"
            >
              <span className="font-mono text-emerald-200 truncate">{port.label}</span>
              <Play className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400 shrink-0" />
              <Handle
                type="source"
                position={Position.Right}
                id={`out-control-${port.key}`}
                className="!w-3 !h-3 !rounded-xs !bg-emerald-400 !border-2 !border-emerald-950 !-right-[16px]"
              />
            </div>
          ))}

          {valueOutputs.map((port) => (
            <div
              key={`vo-${port.key}`}
              className="relative flex items-center justify-end gap-1 min-h-[24px] pr-2"
            >
              <span className="font-mono text-[9px] text-slate-500 shrink-0">
                {shortCSharpType(port.dataType)}:
              </span>
              <span className="font-mono text-slate-200 truncate">{port.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`out-value-${port.key}`}
                className={`!w-2.5 !h-2.5 !rounded-full !border-2 !-right-[15px] ${portColorClass(
                  port.dataType
                )}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Footer Diagnostic Line if Node has Validator Issues */}
      {issues.length > 0 && (
        <div
          dir="rtl"
          className="px-2.5 py-1.5 border-t border-slate-800 bg-slate-950/70 text-[10px] text-amber-300 truncate"
        >
          {issues[0].titleAr}
        </div>
      )}
    </div>
  );
});
UVSUnitNodeComponent.displayName = 'UVSUnitNodeComponent';

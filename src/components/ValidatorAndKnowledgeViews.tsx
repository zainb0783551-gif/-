import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Search,
  Upload,
  ExternalLink,
} from 'lucide-react';
import {
  KnowledgeNodeDefinition,
  NodeOriginKind,
  UnityProjectProfile,
  ValidationReport,
  VerificationStatus,
} from '../types/uvs';
import {
  filterKnowledgeNodes,
  parseUserKnowledgeImportJson,
  VERSION_COMPARISON_NOTES,
} from '../knowledge-base/registry';
import { shortCSharpType } from './UVSCustomNode';

interface ValidatorViewProps {
  validation: ValidationReport;
  onFocusNodeInEditor: (nodeId: string) => void;
}

export const ValidatorDashboardView: React.FC<ValidatorViewProps> = ({
  validation,
  onFocusNodeInEditor,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const statusMeta = {
    [VerificationStatus.VERIFIED]: {
      labelAr: 'متحقق منه (اجتاز كافة الفحوص البنيوية وتطابق الإصدار)',
      icon: ShieldCheck,
      tone: 'text-emerald-400',
    },
    [VerificationStatus.PARTIALLY_VERIFIED]: {
      labelAr: 'متحقق جزئياً (بنية صالحة مع تحذيرات أو مكونات خارجية تتطلب المراجعة)',
      icon: AlertTriangle,
      tone: 'text-amber-300',
    },
    [VerificationStatus.UNVERIFIED]: {
      labelAr: 'غير متحقق منه (إصدار الحزمة غير مؤكد أو يتضمن عقداً غير مفحوصة محلياً)',
      icon: HelpCircle,
      tone: 'text-slate-300',
    },
    [VerificationStatus.INVALID]: {
      labelAr: 'غير صالح (يحتوي على أخطاء عقد مفقودة أو تعارض منافذ/إصدارات تمنع التشغيل)',
      icon: XCircle,
      tone: 'text-red-400',
    },
  }[validation.overallStatus];

  const StatusIcon = statusMeta.icon;

  const filteredIssues = validation.issues.filter(
    (i) => severityFilter === 'all' || i.severity === severityFilter
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="space-y-2 pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-slate-50">
          محرك التدقيق المستقل (Independent Deterministic Validator)
        </h1>
        <p className="text-xs text-slate-400">
          يعمل هذا المدقق بمعزل تام عن الذكاء الاصطناعي؛ يفحص وجود العقد في الإصدار، فصل Flow عن Value، توافق أنواع C#، المتغيرات، ومخاطر الحلقات والـ Coroutines.
        </p>
      </div>

      {/* Summary Grid */}
      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
        <div className={`flex items-center gap-2.5 text-base font-semibold ${statusMeta.tone}`}>
          <StatusIcon className="w-5 h-5 shrink-0" />
          <span>{statusMeta.labelAr}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-800 text-xs">
          <div>
            <div className="text-slate-400">صحة بنية المخطط</div>
            <div className="font-mono font-semibold text-slate-100 mt-1" dir="ltr">
              {validation.structuralStatus}
            </div>
          </div>
          <div>
            <div className="text-slate-400">مخاطر وقت التشغيل (PlayMode)</div>
            <div className="font-mono font-semibold text-slate-100 mt-1" dir="ltr">
              {validation.runtimeRiskStatus}
            </div>
          </div>
          <div>
            <div className="text-slate-400">أساس التحقق (نظري مقابل محرر Unity)</div>
            <div className="font-mono font-semibold text-slate-100 mt-1" dir="ltr">
              {validation.verificationBasis === 'unity_editor_scan_backed'
                ? 'UnityBridge Scan (فعلي)'
                : validation.verificationBasis === 'official_docs_theoretical'
                ? 'Official Docs (نظري)'
                : 'Unverified Version'}
            </div>
          </div>
          <div>
            <div className="text-slate-400">ملخص العدّاد</div>
            <div className="font-mono font-semibold text-slate-100 mt-1 tabular-nums">
              {validation.counts.errors} أخطاء · {validation.counts.warnings} تحذيرات
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 text-xs text-slate-300 space-y-1.5">
          <div>
            <span className="text-slate-400">حالة الاستيراد إلى UnityBridge: </span>
            <span>{validation.unityBridgeImportReasonAr}</span>
          </div>
          <div>
            <span className="text-slate-400">المكونات المطلوبة على GameObject: </span>
            <span className="font-mono" dir="ltr">
              {validation.requiredComponentsSummary.join(' · ') || 'ScriptMachine'}
            </span>
          </div>
        </div>
      </section>

      {/* Filter Bar & Issues Table */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-100">
            سجل الفحوص والملاحظات ({filteredIssues.length})
          </h2>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111827] border border-slate-800">
            {[
              { id: 'all', label: `الكل (${validation.issues.length})` },
              { id: 'error', label: `أخطاء (${validation.counts.errors})` },
              { id: 'warning', label: `تحذيرات (${validation.counts.warnings})` },
              { id: 'info', label: `معلومات (${validation.counts.infos})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSeverityFilter(tab.id as typeof severityFilter)}
                className={`px-3 py-1 rounded text-xs transition-colors tabular-nums cursor-pointer ${
                  severityFilter === tab.id
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#111827] border border-slate-800 text-center text-xs text-emerald-300">
            لا توجد ملاحظات مسجلة ضمن هذا التصنيف؛ جميع الفحوص المطابقة سليمة.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 rounded-xl bg-[#111827] border border-slate-800">
            {filteredIssues.map((issue) => (
              <div key={issue.id} className="p-4 flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        issue.severity === 'error'
                          ? 'text-red-400'
                          : issue.severity === 'warning'
                          ? 'text-amber-300'
                          : 'text-sky-300'
                      }`}
                    >
                      {issue.severity === 'error'
                        ? 'خطأ بنيوي'
                        : issue.severity === 'warning'
                        ? 'تحذير'
                        : 'تنبيه'}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-slate-400" dir="ltr">
                      {issue.code}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100">{issue.titleAr}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{issue.detailAr}</p>
                  <p className="text-xs text-sky-300/90">الحل المقترح: {issue.remediationAr}</p>
                </div>

                {issue.nodeId && (
                  <button
                    type="button"
                    onClick={() => onFocusNodeInEditor(issue.nodeId!)}
                    className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    الانتقال للعقدة
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

interface KnowledgeBaseViewProps {
  nodes: KnowledgeNodeDefinition[];
  profile: UnityProjectProfile;
  onImportCustomNodes: (imported: KnowledgeNodeDefinition[]) => void;
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  nodes,
  profile,
  onImportCustomNodes,
}) => {
  const [query, setQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<NodeOriginKind | 'all'>('all');
  const [onlyCompatible, setOnlyCompatible] = useState(false);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNodeDefinition | null>(nodes[0] ?? null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      filterKnowledgeNodes(nodes, {
        query,
        originKind: originFilter,
        targetVsVersion: profile.vsPackageVersion,
        onlyCompatibleWithVersion: onlyCompatible,
      }),
    [nodes, query, originFilter, profile.vsPackageVersion, onlyCompatible]
  );

  const handleImportDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseUserKnowledgeImportJson(String(reader.result || ''));
        onImportCustomNodes(parsed);
        setImportMessage(
          `تم استيراد ${parsed.length} عقدة بنجاح ووُسمت بحالة (unverified) لحين تأكيدها بتقرير UnityBridge.`
        );
      } catch (err) {
        setImportMessage(err instanceof Error ? err.message : 'فشل استيراد ملف الوثائق.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-50">
            قاعدة المعرفة الموثقة والفروق بين الإصدارات
          </h1>
          <p className="text-xs text-slate-400">
            جميع العقد المعروضة هنا موثقة من Unity 2021.3 أو مستوردة من تقارير الفحص؛ لا توجد أي عقد تخمينية.
          </p>
        </div>

        <label className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0">
          <Upload className="w-3.5 h-3.5 text-sky-400" />
          <span>استيراد وثائق عقد JSON مخصصة</span>
          <input type="file" accept=".json" onChange={handleImportDocFile} className="hidden" />
        </label>
      </div>

      {importMessage && (
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-sky-300">
          {importMessage}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم الإنجليزي أو الكلاس أو الوصف العربي..."
            className="w-full pr-9 pl-3 py-2 rounded-lg bg-[#111827] border border-slate-800 text-xs text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'builtin', label: 'Built-in' },
            { id: 'reflection', label: 'Reflection' },
            { id: 'external_package', label: 'حزم خارجية' },
            { id: 'custom', label: 'Custom' },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setOriginFilter(btn.id as NodeOriginKind | 'all')}
              className={`px-3 py-1.5 rounded text-xs cursor-pointer ${
                originFilter === btn.id
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-[#111827] border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {btn.label}
            </button>
          ))}

          <label className="flex items-center gap-1.5 text-xs text-slate-400 pr-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyCompatible}
              onChange={(e) => setOnlyCompatible(e.target.checked)}
            />
            <span>المتوافق مع إصداري فقط</span>
          </label>
        </div>
      </div>

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl bg-[#111827] border border-slate-800 divide-y divide-slate-800 max-h-[560px] overflow-y-auto">
          {filtered.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => setSelectedNode(node)}
              className={`w-full p-3.5 text-right transition-colors cursor-pointer ${
                selectedNode?.id === node.id ? 'bg-slate-800/90' : 'hover:bg-slate-800/40'
              }`}
            >
              <div className="font-mono text-xs font-semibold text-slate-100" dir="ltr">
                {node.displayName}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">{node.summaryAr}</div>
              <div className="text-[10px] text-slate-500 font-mono mt-1" dir="ltr">
                {node.originKind} · {node.verificationStatus} · min v{node.minVsVersion}
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-7 rounded-xl bg-[#111827] border border-slate-800 p-5 space-y-4">
          {selectedNode ? (
            <>
              <div className="pb-3 border-b border-slate-800 space-y-1">
                <h2 className="text-base font-bold font-mono text-slate-100" dir="ltr">
                  {selectedNode.displayName}
                </h2>
                <div className="text-xs font-mono text-slate-400 break-all" dir="ltr">
                  Class: {selectedNode.unitClassName} · Assembly: {selectedNode.assembly}
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>{selectedNode.summaryAr}</p>
                <p className="text-slate-400">شروط الاستخدام: {selectedNode.usageConditionsAr}</p>
                <div className="text-slate-400">
                  الحالة: <span className="text-slate-200">{selectedNode.verificationStatus}</span> ·
                  تاريخ آخر فحص: <span className="font-mono">{selectedNode.lastVerifiedAt}</span> ·
                  أدنى إصدار حزمة: <span className="font-mono">{selectedNode.minVsVersion}</span>
                </div>
                {selectedNode.sourceDocUrl.startsWith('http') && (
                  <a
                    href={selectedNode.sourceDocUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                  >
                    <span>فتح المرجع الرسمي في توثيق Unity</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Ports Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800 text-xs">
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-slate-200">المدخلات (Inputs)</h3>
                  {selectedNode.controlInputs.map((p) => (
                    <div key={p.key} className="font-mono text-emerald-300" dir="ltr">
                      [ControlIn] {p.key} ({p.label})
                    </div>
                  ))}
                  {selectedNode.valueInputs.map((p) => (
                    <div key={p.key} className="font-mono text-sky-300" dir="ltr">
                      [ValueIn] {p.key} : {shortCSharpType(p.dataType)}
                    </div>
                  ))}
                  {selectedNode.controlInputs.length === 0 &&
                    selectedNode.valueInputs.length === 0 && (
                      <div className="text-slate-500">لا توجد مدخلات</div>
                    )}
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-semibold text-slate-200">المخرجات (Outputs)</h3>
                  {selectedNode.controlOutputs.map((p) => (
                    <div key={p.key} className="font-mono text-emerald-300" dir="ltr">
                      [ControlOut] {p.key} ({p.label})
                    </div>
                  ))}
                  {selectedNode.valueOutputs.map((p) => (
                    <div key={p.key} className="font-mono text-sky-300" dir="ltr">
                      [ValueOut] {p.key} : {shortCSharpType(p.dataType)}
                    </div>
                  ))}
                  {selectedNode.controlOutputs.length === 0 &&
                    selectedNode.valueOutputs.length === 0 && (
                      <div className="text-slate-500">لا توجد مخرجات</div>
                    )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">اختر عقدة من القائمة لعرض مواصفاتها.</p>
          )}
        </div>
      </div>

      {/* Version Differences Matrix (1.7.x vs 1.8.0 in Unity 2021.3 LTS) */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-100">
          جدول الفروق الموثقة بين إصدارات Visual Scripting في Unity 2021.3 LTS
        </h2>
        <div className="overflow-x-auto rounded-xl bg-[#111827] border border-slate-800">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-3 px-4 font-medium">الميزة / السلوك</th>
                <th className="py-3 px-4 font-medium">سلسلة 1.7.x</th>
                <th className="py-3 px-4 font-medium">إصدار 1.8.0</th>
                <th className="py-3 px-4 font-medium">الأثر على المخطط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {VERSION_COMPARISON_NOTES.map((row, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 px-4 font-medium text-slate-200">{row.feature}</td>
                  <td className="py-2.5 px-4 text-slate-400">{row.v1_7}</td>
                  <td className="py-2.5 px-4 text-emerald-300">{row.v1_8}</td>
                  <td className="py-2.5 px-4 text-slate-300">{row.impactAr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

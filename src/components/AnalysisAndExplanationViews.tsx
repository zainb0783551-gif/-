import React from 'react';
import { ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  KnowledgeNodeDefinition,
  ProblemAnalysisReport,
  UVSGraphSpec,
} from '../types/uvs';
import { shortCSharpType } from './UVSCustomNode';

interface AnalysisViewProps {
  analysis: ProblemAnalysisReport | null;
  onOpenEditor: () => void;
  onOpenHome: () => void;
}

export const AnalysisTenStagesView: React.FC<AnalysisViewProps> = ({
  analysis,
  onOpenEditor,
  onOpenHome,
}) => {
  if (!analysis) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center space-y-4">
        <h2 className="text-xl font-semibold text-slate-100">
          لا يوجد تقرير تحليل حالي
        </h2>
        <p className="text-sm text-slate-400">
          أدخل مشكلة برمجية في الصفحة الرئيسية أو حمّل أحد المخططات المرجعية لاستعراض المراحل الهندسية العشر.
        </p>
        <button
          type="button"
          onClick={onOpenHome}
          className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold text-xs cursor-pointer"
        >
          الانتقال لإدخال مشكلة
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-50">
            تحليل الحل الهندسي (10 مراحل)
          </h1>
          <p className="text-xs text-slate-400">{analysis.problemSummaryInput}</p>
        </div>
        <button
          type="button"
          onClick={onOpenEditor}
          className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>فتح المخطط في المحرر التفاعلي</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stage 1: Goal & Behavior */}
      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
        <h2 className="text-sm font-semibold text-slate-100">
          01. الهدف والسلوك المطلوب وقت التشغيل
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          {analysis.goalAndBehaviorAr.objective}
        </p>
        <p className="text-xs text-slate-400 leading-relaxed">
          {analysis.goalAndBehaviorAr.expectedRuntimeBehavior}
        </p>
        <div className="pt-2 flex items-center gap-2 text-xs">
          {analysis.goalAndBehaviorAr.canSolvePurelyInVisualScripting ? (
            <span className="text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>قابل للحل بالكامل عبر عقد Visual Scripting الموثقة دون كود C# مخفي.</span>
            </span>
          ) : (
            <span className="text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>
                يتطلب جزءاً مخصصاً أو إضافة خارجية: {analysis.goalAndBehaviorAr.limitationExplanationAr}
              </span>
            </span>
          )}
        </div>
      </section>

      {/* Stage 2: Events, Conditions, Inputs, Outputs */}
      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
        <h2 className="text-sm font-semibold text-slate-100">
          02. الأحداث والشروط والمدخلات والمخرجات
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-300">الأحداث القادحة (Events)</h3>
            <ul className="space-y-1 text-slate-400 list-disc pr-4">
              {analysis.eventsConditionsIO.events.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-300">الشروط المنطقية (Conditions)</h3>
            <ul className="space-y-1 text-slate-400 list-disc pr-4">
              {analysis.eventsConditionsIO.conditions.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-300">المدخلات (Inputs)</h3>
            <ul className="space-y-1 text-slate-400 list-disc pr-4">
              {analysis.eventsConditionsIO.inputs.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-300">المخرجات والتأثيرات (Outputs)</h3>
            <ul className="space-y-1 text-slate-400 list-disc pr-4">
              {analysis.eventsConditionsIO.outputs.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Stage 3 & 4: Subgraphs & Variables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">
            03. تقسيم المخططات الفرعية والمجموعات
          </h2>
          {analysis.subgraphDecomposition.length === 0 ? (
            <p className="text-xs text-slate-400">مخطط مباشر لا يتطلب تجزئة فرعية إضافية.</p>
          ) : (
            <div className="divide-y divide-slate-800 text-xs">
              {analysis.subgraphDecomposition.map((sub, i) => (
                <div key={i} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="font-mono font-semibold text-slate-200" dir="ltr">
                    {sub.name}
                  </div>
                  <p className="text-slate-400">{sub.responsibilityAr}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">
            04. المتغيرات ونطاقاتها وأنواعها
          </h2>
          {analysis.variablesPlan.length === 0 ? (
            <p className="text-xs text-slate-400">لا يتطلب الحل متغيرات مخزنة.</p>
          ) : (
            <div className="divide-y divide-slate-800 text-xs">
              {analysis.variablesPlan.map((v, i) => (
                <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono font-semibold text-slate-200" dir="ltr">
                      {v.name} ({shortCSharpType(v.dataType)}) = {v.defaultValue}
                    </div>
                    <p className="text-slate-400 mt-0.5">{v.descriptionAr}</p>
                  </div>
                  <span className="font-mono text-slate-400 shrink-0" dir="ltr">
                    Scope: {v.scope}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Stage 5 & 6: Selected KB Nodes & Explicit Port Wiring */}
      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
        <h2 className="text-sm font-semibold text-slate-100">
          05. العقد المختارة من قاعدة المعرفة الموثقة فقط
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2 pl-4 font-medium">المعرف / الكلاس</th>
                <th className="py-2 px-4 font-medium">المصدر</th>
                <th className="py-2 pr-4 font-medium">سبب الاختيار الهندسي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {analysis.selectedNodesRationale.map((item, i) => (
                <tr key={i}>
                  <td className="py-2.5 pl-4 font-mono text-slate-200" dir="ltr">
                    {item.unitClassName}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-400" dir="ltr">
                    {item.originKind}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-300">{item.reasonAr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
        <h2 className="text-sm font-semibold text-slate-100">
          06. خطة توصيل المنافذ الصريحة (Flow مقابل Value)
        </h2>
        <div className="divide-y divide-slate-800 text-xs">
          {analysis.explicitPortWiringPlan.map((w, i) => (
            <div key={i} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono text-slate-200" dir="ltr">
                [{w.kind.toUpperCase()}] {w.from} ──► {w.to}
              </div>
              <span className="text-slate-400">{w.purposeAr}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Stage 7, 8, 9: Edge Cases, Alternatives, External Components */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2.5">
          <h2 className="text-sm font-semibold text-slate-100">
            07. الحالات الاستثنائية وتعارضات التنفيذ
          </h2>
          <ul className="space-y-1.5 text-xs text-slate-400 list-disc pr-4 leading-relaxed">
            {analysis.edgeCasesAndConflictsAr.map((ec, i) => (
              <li key={i}>{ec}</li>
            ))}
          </ul>
        </section>

        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2.5">
          <h2 className="text-sm font-semibold text-slate-100">
            08. البدائل الموثقة والاعتماد على C#
          </h2>
          {analysis.documentedAlternativesAr.length === 0 ? (
            <p className="text-xs text-slate-400">
              المسار الأساسي مدعوم مباشرة بالعقد القياسية دون الحاجة لبديل مخصص.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              {analysis.documentedAlternativesAr.map((alt, i) => (
                <div key={i} className="space-y-1">
                  <div className="font-medium text-slate-200">{alt.scenarioAr}</div>
                  <p className="text-slate-400">{alt.alternativeApproachAr}</p>
                  <div className="text-[11px] text-amber-300">
                    {alt.requiresCustomCSharpUnit
                      ? 'يتطلب كتابة Custom C# Unit'
                      : 'لا يتطلب كود C#'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-2.5">
          <h2 className="text-sm font-semibold text-slate-100">
            09. المكونات وإعدادات المشهد الخارجية
          </h2>
          <div className="space-y-2 text-xs text-slate-400">
            <div>
              <span className="text-slate-200 font-medium">المكونات: </span>
              <span className="font-mono" dir="ltr">
                {analysis.externalRequirements.components.join(', ') || 'ScriptMachine'}
              </span>
            </div>
            <div>
              <span className="text-slate-200 font-medium">إعدادات المشروع: </span>
              <span>{analysis.externalRequirements.projectSettingsAr.join(' · ') || 'افتراضي'}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Stage 10: PlayMode Verification Test Plan */}
      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
        <h2 className="text-sm font-semibold text-slate-100">
          10. خطة الاختبار والتحقق داخل Unity Play Mode
        </h2>
        <div className="divide-y divide-slate-800 text-xs">
          {analysis.testPlanAr.map((step) => (
            <div key={step.stepNumber} className="py-3 first:pt-0 last:pb-0 space-y-1">
              <div className="font-semibold text-slate-200 tabular-nums">
                خطوة {step.stepNumber}: {step.actionAr}
              </div>
              <div className="text-emerald-300/90">النتيجة المتوقعة: {step.expectedResultAr}</div>
              <div className="text-slate-400">عند الفشل تحقق من: {step.failureCheckAr}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

interface ExplanationViewProps {
  graph: UVSGraphSpec;
  knowledgeNodes: KnowledgeNodeDefinition[];
  onFocusNodeInEditor: (nodeId: string) => void;
}

export const NodesAndWiringExplanationView: React.FC<ExplanationViewProps> = ({
  graph,
  knowledgeNodes,
  onFocusNodeInEditor,
}) => {
  const kbMap = new Map(knowledgeNodes.map((n) => [n.id, n]));
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="space-y-1 pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-slate-50">
          شرح العقد والتوصيلات بالتفصيل ({graph.name})
        </h1>
        <p className="text-xs text-slate-400">
          دليل تنفيذي يشرح وظيفة كل عقدة ومصدرها البرمجي وكل سلك Flow و Value لبناء المخطط أو مراجعته بدقة.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-100">
          أولاً: تفصيل العقد المستخدمة ({graph.nodes.length})
        </h2>
        <div className="divide-y divide-slate-800 rounded-xl bg-[#111827] border border-slate-800">
          {graph.nodes.map((node, index) => {
            const def = kbMap.get(node.definitionId);
            return (
              <div key={node.id} className="p-4 flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      {String(index + 1).padStart(2, '0')}.
                    </span>
                    <span className="text-sm font-semibold font-mono text-slate-100" dir="ltr">
                      {def?.displayName ?? node.unitClassName}
                    </span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs font-mono text-slate-400" dir="ltr">
                      {def?.originKind ?? 'missing'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {def?.summaryAr ?? 'عقدة غير موجودة في قاعدة المعرفة الموثقة.'}
                  </p>
                  {Object.keys(node.inlineValues).length > 0 && (
                    <div className="text-[11px] font-mono text-sky-300" dir="ltr">
                      Inline Values:{' '}
                      {Object.entries(node.inlineValues)
                        .map(([k, v]) => `${k}=${String(v)}`)
                        .join(', ')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onFocusNodeInEditor(node.id)}
                  className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  تحديد في المحرر
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-100">
          ثانياً: جدول الأسلاك والتوصيلات ({graph.connections.length})
        </h2>
        <div className="overflow-x-auto rounded-xl bg-[#111827] border border-slate-800">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-3 px-4 font-medium">النوع</th>
                <th className="py-3 px-4 font-medium">من (المخرج)</th>
                <th className="py-3 px-4 font-medium">إلى (المدخل)</th>
                <th className="py-3 px-4 font-medium">الوظيفة المنطقية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {graph.connections.map((conn) => {
                const srcN = nodeMap.get(conn.sourceNodeId);
                const dstN = nodeMap.get(conn.targetNodeId);
                const srcDef = srcN ? kbMap.get(srcN.definitionId) : undefined;
                const dstDef = dstN ? kbMap.get(dstN.definitionId) : undefined;
                return (
                  <tr key={conn.id}>
                    <td className="py-2.5 px-4 font-mono">
                      <span
                        className={
                          conn.kind === 'flow' ? 'text-emerald-400' : 'text-sky-400'
                        }
                      >
                        {conn.kind === 'flow' ? 'Flow (تنفيذ)' : 'Value (بيانات)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-200" dir="ltr">
                      {srcDef?.displayName ?? conn.sourceNodeId}.{conn.sourcePortKey}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-200" dir="ltr">
                      {dstDef?.displayName ?? conn.targetNodeId}.{conn.targetPortKey}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      {conn.explanationAr ||
                        (conn.kind === 'flow'
                          ? 'نقل نبضة التنفيذ إلى الخطوة التالية'
                          : 'تمرير قيمة البيانات المحسوبة')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

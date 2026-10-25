import {
  KnowledgeNodeDefinition,
  ProblemAnalysisReport,
  UnityProjectProfile,
  UVSGraphSpec,
  ValidationReport,
} from '../types/uvs';

export interface DocumentedGraphExportBundle {
  exportSchema: 'uvs-expert-bundle-v1';
  exportedAt: string;
  disclaimerAr: string;
  engineContext: {
    unityVersion: string;
    unityVersionSource: string;
    visualScriptingVersion: string | null;
    visualScriptingVersionSource: string;
  };
  verificationSummary: {
    overallStatus: string;
    structuralStatus: string;
    runtimeRiskStatus: string;
    verificationBasis: string;
    unityBridgeImportable: boolean;
    unityBridgeImportReasonAr: string;
    validatedAt: string;
  };
  graph: UVSGraphSpec;
  resolvedNodeCatalog: {
    instanceId: string;
    definitionId: string;
    unitClassName: string;
    originKind: string;
    reflectionMember?: KnowledgeNodeDefinition['reflectionMember'];
    controlInputs: string[];
    controlOutputs: string[];
    valueInputs: { key: string; dataType?: string }[];
    valueOutputs: { key: string; dataType?: string }[];
    sourceDocUrl: string;
    verificationStatus: string;
  }[];
  unityBridgePayload: {
    formatVersion: 'uvs-bridge-import-v1';
    importSupported: boolean;
    unsupportedReasonAr?: string;
    targetAssetPathSuggestion: string;
    variables: UVSGraphSpec['variables'];
    units: {
      id: string;
      unitClassName: string;
      originKind: string;
      position: { x: number; y: number };
      inlineValues: Record<string, string | number | boolean>;
      inlineEntries: { key: string; valueType: string; stringValue: string }[];
      reflectionMember?: KnowledgeNodeDefinition['reflectionMember'];
    }[];
    controlConnections: {
      sourceUnitId: string;
      sourcePortKey: string;
      targetUnitId: string;
      targetPortKey: string;
    }[];
    valueConnections: {
      sourceUnitId: string;
      sourcePortKey: string;
      targetUnitId: string;
      targetPortKey: string;
    }[];
  };
}

/**
 * Exports a complete, documented JSON bundle explicitly separated from Unity's internal YAML ScriptGraphAsset format.
 */
export function serializeGraphBundle(
  graph: UVSGraphSpec,
  profile: UnityProjectProfile,
  knowledgeNodes: KnowledgeNodeDefinition[],
  validation: ValidationReport
): DocumentedGraphExportBundle {
  const kbMap = new Map(knowledgeNodes.map((n) => [n.id, n]));

  const resolvedNodeCatalog = graph.nodes.map((n) => {
    const def = kbMap.get(n.definitionId);
    return {
      instanceId: n.id,
      definitionId: n.definitionId,
      unitClassName: def?.unitClassName ?? n.unitClassName,
      originKind: def?.originKind ?? 'unverified',
      reflectionMember: def?.reflectionMember,
      controlInputs: def ? def.controlInputs.map((p) => p.key) : [],
      controlOutputs: def ? def.controlOutputs.map((p) => p.key) : [],
      valueInputs: def
        ? def.valueInputs.map((p) => ({ key: p.key, dataType: p.dataType }))
        : [],
      valueOutputs: def
        ? def.valueOutputs.map((p) => ({ key: p.key, dataType: p.dataType }))
        : [],
      sourceDocUrl: def?.sourceDocUrl ?? 'unverified',
      verificationStatus: def?.verificationStatus ?? 'unverified',
    };
  });

  const safeSlug =
    graph.name
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'GeneratedFlowGraph';

  return {
    exportSchema: 'uvs-expert-bundle-v1',
    exportedAt: new Date().toISOString(),
    disclaimerAr:
      'هذا الملف يمثل توصيفاً وسيطاً موثقاً للمخطط وليس ملف YAML الداخلي لـ Unity ScriptGraphAsset؛ يتم تحويله صراحةً عبر أداة UnityBridge داخل محرر Unity 2021.3.',
    engineContext: {
      unityVersion: profile.unityVersion,
      unityVersionSource: profile.unityVersionSource,
      visualScriptingVersion: profile.vsPackageVersion,
      visualScriptingVersionSource: profile.vsVersionSource,
    },
    verificationSummary: {
      overallStatus: validation.overallStatus,
      structuralStatus: validation.structuralStatus,
      runtimeRiskStatus: validation.runtimeRiskStatus,
      verificationBasis: validation.verificationBasis,
      unityBridgeImportable: validation.unityBridgeImportable,
      unityBridgeImportReasonAr: validation.unityBridgeImportReasonAr,
      validatedAt: validation.validatedAt,
    },
    graph,
    resolvedNodeCatalog,
    unityBridgePayload: {
      formatVersion: 'uvs-bridge-import-v1',
      importSupported: validation.unityBridgeImportable,
      unsupportedReasonAr: validation.unityBridgeImportable
        ? undefined
        : validation.unityBridgeImportReasonAr,
      targetAssetPathSuggestion: `Assets/VisualScripting/${safeSlug}.asset`,
      variables: graph.variables,
      units: graph.nodes.map((n) => {
        const def = kbMap.get(n.definitionId);
        const inlineEntries = Object.entries(n.inlineValues).map(([key, val]) => {
          const portMatch = def?.valueInputs.find((p) => p.key === key);
          const fieldMatch = def?.inlineFields?.find((f) => f.key === key);
          const valueType =
            portMatch?.dataType ??
            fieldMatch?.dataType ??
            (typeof val === 'boolean'
              ? 'System.Boolean'
              : typeof val === 'number'
              ? 'System.Single'
              : 'System.String');
          return {
            key,
            valueType,
            stringValue: String(val),
          };
        });
        return {
          id: n.id,
          unitClassName: def?.unitClassName ?? n.unitClassName,
          originKind: def?.originKind ?? 'unknown',
          position: n.position,
          inlineValues: n.inlineValues,
          inlineEntries,
          reflectionMember: def?.reflectionMember,
        };
      }),
      controlConnections: graph.connections
        .filter((c) => c.kind === 'flow')
        .map((c) => ({
          sourceUnitId: c.sourceNodeId,
          sourcePortKey: c.sourcePortKey,
          targetUnitId: c.targetNodeId,
          targetPortKey: c.targetPortKey,
        })),
      valueConnections: graph.connections
        .filter((c) => c.kind === 'value')
        .map((c) => ({
          sourceUnitId: c.sourceNodeId,
          sourcePortKey: c.sourcePortKey,
          targetUnitId: c.targetNodeId,
          targetPortKey: c.targetPortKey,
        })),
    },
  };
}

/**
 * Strictly validates and imports either a `DocumentedGraphExportBundle` or a direct `UVSGraphSpec`.
 * Throws explicit Arabic diagnostic errors on incomplete or malformed JSON.
 */
export function parseGraphFromJson(rawJson: string): UVSGraphSpec {
  if (!rawJson || !rawJson.trim()) {
    throw new Error('فشل الاستيراد: نص JSON فارغ تماماً.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('فشل الاستيراد: ملف JSON تالف أو غير مكتمل الأقواس.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('فشل الاستيراد: الجذر يجب أن يكون كائن JSON صالحاً.');
  }

  const root = parsed as Record<string, unknown>;
  const candidateGraph =
    root.exportSchema === 'uvs-expert-bundle-v1' && root.graph && typeof root.graph === 'object'
      ? (root.graph as Record<string, unknown>)
      : root;

  if (candidateGraph.schemaVersion !== '1.0.0') {
    throw new Error(
      `فشل الاستيراد: إصدار مخطط البيانات غير موجود أو غير متوافق (المتوقع schemaVersion: "1.0.0").`
    );
  }

  if (typeof candidateGraph.id !== 'string' || typeof candidateGraph.name !== 'string') {
    throw new Error('فشل الاستيراد: بيانات المخطط ناقصة (تفتقر إلى id أو name).');
  }

  if (!Array.isArray(candidateGraph.nodes) || !Array.isArray(candidateGraph.connections)) {
    throw new Error('فشل الاستيراد: بنية JSON غير مكتملة (تفتقر إلى مصفوفة nodes أو connections).');
  }

  for (let i = 0; i < candidateGraph.nodes.length; i++) {
    const n = candidateGraph.nodes[i] as Record<string, unknown>;
    if (
      !n ||
      typeof n.id !== 'string' ||
      typeof n.definitionId !== 'string' ||
      typeof n.unitClassName !== 'string' ||
      !n.position ||
      typeof (n.position as { x?: unknown }).x !== 'number' ||
      typeof (n.position as { y?: unknown }).y !== 'number'
    ) {
      throw new Error(
        `فشل الاستيراد: العقدة رقم ${i + 1} غير مكتملة الحقول (تتطلب id, definitionId, unitClassName, position).`
      );
    }
  }

  for (let i = 0; i < candidateGraph.connections.length; i++) {
    const c = candidateGraph.connections[i] as Record<string, unknown>;
    if (
      !c ||
      typeof c.id !== 'string' ||
      (c.kind !== 'flow' && c.kind !== 'value') ||
      typeof c.sourceNodeId !== 'string' ||
      typeof c.sourcePortKey !== 'string' ||
      typeof c.targetNodeId !== 'string' ||
      typeof c.targetPortKey !== 'string'
    ) {
      throw new Error(
        `فشل الاستيراد: الوصلة رقم ${i + 1} تالفة أو تفتقر إلى تحديد النوع (flow/value) والمنافذ.`
      );
    }
  }

  return {
    schemaVersion: '1.0.0',
    id: candidateGraph.id,
    name: candidateGraph.name,
    descriptionAr:
      typeof candidateGraph.descriptionAr === 'string' ? candidateGraph.descriptionAr : '',
    createdAt:
      typeof candidateGraph.createdAt === 'string'
        ? candidateGraph.createdAt
        : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetUnityVersion:
      typeof candidateGraph.targetUnityVersion === 'string'
        ? candidateGraph.targetUnityVersion
        : '2021.3 LTS',
    targetVsVersion:
      typeof candidateGraph.targetVsVersion === 'string' ? candidateGraph.targetVsVersion : null,
    variables: Array.isArray(candidateGraph.variables)
      ? (candidateGraph.variables as UVSGraphSpec['variables'])
      : [],
    groups: Array.isArray(candidateGraph.groups)
      ? (candidateGraph.groups as UVSGraphSpec['groups'])
      : [],
    subgraphs: Array.isArray(candidateGraph.subgraphs)
      ? (candidateGraph.subgraphs as UVSGraphSpec['subgraphs'])
      : [],
    nodes: candidateGraph.nodes as UVSGraphSpec['nodes'],
    connections: candidateGraph.connections as UVSGraphSpec['connections'],
  };
}

/**
 * Generates a detailed Arabic & Technical Markdown Implementation Report for manual or assisted Unity setup.
 */
export function generateImplementationReportMarkdown(
  graph: UVSGraphSpec,
  profile: UnityProjectProfile,
  knowledgeNodes: KnowledgeNodeDefinition[],
  validation: ValidationReport,
  analysis?: ProblemAnalysisReport | null
): string {
  const kbMap = new Map(knowledgeNodes.map((n) => [n.id, n]));
  const lines: string[] = [];

  lines.push(`# تقرير تنفيذ وتدقيق مخطط Unity Visual Scripting`);
  lines.push(`**اسم المخطط:** ${graph.name}`);
  lines.push(`**تاريخ التوليد:** ${new Date().toISOString()}`);
  lines.push(`**إصدار Unity المستهدف:** \`${profile.unityVersion}\` (${profile.unityVersionSource})`);
  lines.push(
    `**إصدار حزمة Visual Scripting:** \`${
      profile.vsPackageVersion ?? 'غير محدد بعد'
    }\` (${profile.vsVersionSource})`
  );
  lines.push(`**حالة التحقق الكلية:** \`${validation.overallStatus}\``);
  lines.push(`**حالة البنية مقابل التشغيل:** بنية=\`${validation.structuralStatus}\` | مخاطر التشغيل=\`${validation.runtimeRiskStatus}\``);
  lines.push(`**قابلية الاستيراد عبر UnityBridge:** ${validation.unityBridgeImportable ? 'مدعوم' : 'يتطلب خطوات يدوية'} — ${validation.unityBridgeImportReasonAr}`);
  lines.push('');

  if (analysis) {
    lines.push(`## 1. ملخص تحليل المشكلة والسلوك المطلوب`);
    lines.push(`- **الهدف:** ${analysis.goalAndBehaviorAr.objective}`);
    lines.push(`- **السلوك المتوقع:** ${analysis.goalAndBehaviorAr.expectedRuntimeBehavior}`);
    lines.push('');
  }

  lines.push(`## 2. المكونات والحزم المطلوبة قبل التنفيذ`);
  lines.push(
    `- **الحزم المطلوبة:** ${
      validation.requiredPackagesSummary.map((p) => `\`${p}\``).join('، ') || 'لا يوجد'
    }`
  );
  lines.push(
    `- **المكونات على GameObject:** ${
      validation.requiredComponentsSummary.map((c) => `\`${c}\``).join('، ') || 'ScriptMachine فقط'
    }`
  );
  lines.push('');

  lines.push(`## 3. جدول المتغيرات (Blackboard Variables)`);
  if (graph.variables.length === 0) {
    lines.push(`- لا يتطلب هذا المخطط متغيرات مخزنة.`);
  } else {
    for (const v of graph.variables) {
      lines.push(
        `- \`${v.name}\` | النطاق: \`${v.scope}\` | النوع: \`${v.dataType}\` | القيمة الافتراضية: \`${v.defaultValue}\` — ${v.descriptionAr}`
      );
    }
  }
  lines.push('');

  lines.push(`## 4. قائمة العقد الفعلية (Units)`);
  graph.nodes.forEach((n, idx) => {
    const def = kbMap.get(n.definitionId);
    lines.push(
      `${idx + 1}. **${def?.displayName ?? n.unitClassName}** (\`${n.id}\`) — Class: \`${
        def?.unitClassName ?? n.unitClassName
      }\` | التصنيف: \`${def?.originKind ?? 'غير موثق'}\``
    );
    const entries = Object.entries(n.inlineValues);
    if (entries.length > 0) {
      lines.push(
        `   - القيم المضمنة: ${entries.map(([k, val]) => `\`${k} = ${String(val)}\``).join('، ')}`
      );
    }
    if (def?.summaryAr) {
      lines.push(`   - الشرح: ${def.summaryAr}`);
    }
  });
  lines.push('');

  lines.push(`## 5. جدول التوصيلات الدقيق (Flow & Value Connections)`);
  graph.connections.forEach((c, idx) => {
    lines.push(
      `${idx + 1}. [${c.kind.toUpperCase()}] \`${c.sourceNodeId}.${c.sourcePortKey}\` ──► \`${c.targetNodeId}.${c.targetPortKey}\`${
        c.explanationAr ? ` (${c.explanationAr})` : ''
      }`
    );
  });
  lines.push('');

  lines.push(`## 6. نتائج المدقق المستقل (${validation.issues.length} ملاحظة)`);
  if (validation.issues.length === 0) {
    lines.push(`- لم يتم رصد أي أخطاء أو تحذيرات بنية.`);
  } else {
    for (const iss of validation.issues) {
      lines.push(`- **[${iss.severity.toUpperCase()} - ${iss.code}]** ${iss.titleAr}: ${iss.detailAr}`);
      lines.push(`  - *الإجراء التصحيحي:* ${iss.remediationAr}`);
    }
  }

  if (analysis && analysis.testPlanAr.length > 0) {
    lines.push('');
    lines.push(`## 7. خطة الاختبار داخل Unity Play Mode`);
    for (const step of analysis.testPlanAr) {
      lines.push(
        `${step.stepNumber}. **الإجراء:** ${step.actionAr} | **النتيجة المتوقعة:** ${step.expectedResultAr} | **فحص الفشل:** ${step.failureCheckAr}`
      );
    }
  }

  return lines.join('\n');
}

import { GoogleGenAI, Type } from '@google/genai';
import {
  KnowledgeNodeDefinition,
  ProblemAnalysisReport,
  UnityProjectProfile,
  UVSGraphSpec,
  ValidationReport,
} from '../types/uvs';
import { isNodeSupportedInVersion } from '../knowledge-base/registry';
import { applyAutoLayout } from '../exporter/autoLayout';
import { validateGraph } from '../validator/graphValidator';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح GEMINI_API_KEY غير متوفر في بيئة الخادم.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface AnalyzeProblemRequest {
  problemText: string;
  errorLogText?: string;
  imageBase64?: string;
  imageMimeType?: string;
  profile: UnityProjectProfile;
  knowledgeNodes: KnowledgeNodeDefinition[];
}

export interface AnalyzeProblemResponse {
  analysis: ProblemAnalysisReport;
  graph: UVSGraphSpec;
  validation: ValidationReport;
}

/**
 * Server-side 10-Stage Unity Visual Scripting Problem Analyzer.
 * Constrained strictly to the verified Knowledge Base catalog and post-verified by our independent Validator.
 */
export async function analyzeProblemWithGemini(
  req: AnalyzeProblemRequest
): Promise<AnalyzeProblemResponse> {
  const ai = getGeminiClient();

  const compatibleNodes = req.knowledgeNodes.filter((n) =>
    isNodeSupportedInVersion(n, req.profile.vsPackageVersion)
  );

  // Build compact, unambiguous catalog of allowed nodes & exact port keys
  const catalogContext = compatibleNodes.map((n) => ({
    definitionId: n.id,
    unitClassName: n.unitClassName,
    displayName: n.displayName,
    originKind: n.originKind,
    minVsVersion: n.minVsVersion,
    requiredPackages: n.requiredPackages,
    requiredComponents: n.requiredComponents,
    isCoroutineUnit: Boolean(n.isCoroutineUnit),
    supportsCoroutineToggle: Boolean(n.supportsCoroutineToggle),
    controlInputs: n.controlInputs.map((p) => p.key),
    controlOutputs: n.controlOutputs.map((p) => p.key),
    valueInputs: n.valueInputs.map((p) => ({
      key: p.key,
      type: p.dataType,
      default: p.defaultValue,
    })),
    valueOutputs: n.valueOutputs.map((p) => ({
      key: p.key,
      type: p.dataType,
    })),
    inlineFields: (n.inlineFields ?? []).map((f) => ({
      key: f.key,
      type: f.dataType,
      options: f.options,
    })),
  }));

  const systemInstruction = `أنت خبير هندسي صارم في Unity Visual Scripting للإصدار المستهدف Unity 2021.3 LTS.
مهمتك تحليل مشكلة المستخدم عبر 10 مراحل هندسية إلزامية ثم بناء مخطط عقد دقيق وقابل للتحقق.

قواعد صارمة ضد الهلوسة (ممنوع مخالفتها تحت أي ظرف):
1. يُسمح لك باختيار العقد حصراً من القائمة الموثقة المرفقة في ALLOWED_KNOWLEDGE_BASE_CATALOG باستخدام حقل definitionId و unitClassName المطابقين تماماً.
2. ممنوع اختراع أي definitionId أو unitClassName أو منفذ (Port Key) غير موجود حرفياً في الكتالوج المرفق.
3. فرّق بدقة بين وصلات التنفيذ (kind = "flow" بين controlOutputs و controlInputs فقط) ووصلات البيانات (kind = "value" بين valueOutputs و valueInputs فقط).
4. في Unity Visual Scripting لا يمكن لمخرج ControlOutput واحد أن يتصل بأكثر من مدخل ControlInput واحد؛ استخدم عقدة Sequence (uvs.control.sequence) لتنفيذ خطوتين أو أكثر على التوالي.
5. لا توصل مدخل ValueInput بأكثر من مخرج واحد، ولا توصل أنواع بيانات غير متوافقة.
6. إذا استخدمت عقدة انتظار مثل Wait For Seconds (uvs.time.wait_for_seconds)، يجب أن تبدأ السلسلة بحدث يدعم Coroutine (مثل On Start أو On Trigger Enter أو Custom Event) مع ضبط inlineValues.coroutine = true، ويُمنع وصلها بـ On Update.
7. إذا كانت المشكلة تتطلب واجهة برمجية غير موجودة في ALLOWED_KNOWLEDGE_BASE_CATALOG، اضبط canSolvePurelyInVisualScripting = false، واشرح النقص بصراحة تامة في limitationExplanationAr واقترح Custom C# Unit موثقة في documentedAlternativesAr، وابنِ في المخطط الجزء القابل للتنفيذ فقط من العقد المتاحة دون تخمين أو اختراع عقد وهمية.
8. اكتب جميع الشروحات باللغة العربية الفصحى الواضحة مع إبقاء أسماء العقد والمنافذ والأنواع التقنية باللغة الإنجليزية.

بيانات مشروع المستخدم الحالية:
- Unity Version: ${req.profile.unityVersion}
- Visual Scripting Package Version: ${req.profile.vsPackageVersion ?? 'غير مؤكد بعد'}
- Installed Packages: ${
    req.profile.installedPackages.map((p) => `${p.name}@${p.version}`).join(', ') || 'غير محدد'
  }

ALLOWED_KNOWLEDGE_BASE_CATALOG:
${JSON.stringify(catalogContext)}`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (req.imageBase64 && req.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: req.imageMimeType,
        data: req.imageBase64,
      },
    });
  }

  parts.push({
    text: `المشكلة أو السلوك المطلوب تحليله:\n${req.problemText}\n${
      req.errorLogText ? `\nرسالة الخطأ أو السجل المرفق:\n${req.errorLogText}` : ''
    }`,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: { parts },
    config: {
      systemInstruction,
      temperature: 0.15,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          graphName: { type: Type.STRING },
          graphDescriptionAr: { type: Type.STRING },
          goalAndBehaviorAr: {
            type: Type.OBJECT,
            properties: {
              objective: { type: Type.STRING },
              expectedRuntimeBehavior: { type: Type.STRING },
              canSolvePurelyInVisualScripting: { type: Type.BOOLEAN },
              limitationExplanationAr: { type: Type.STRING },
            },
            required: ['objective', 'expectedRuntimeBehavior', 'canSolvePurelyInVisualScripting'],
          },
          eventsConditionsIO: {
            type: Type.OBJECT,
            properties: {
              events: { type: Type.ARRAY, items: { type: Type.STRING } },
              conditions: { type: Type.ARRAY, items: { type: Type.STRING } },
              inputs: { type: Type.ARRAY, items: { type: Type.STRING } },
              outputs: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['events', 'conditions', 'inputs', 'outputs'],
          },
          subgraphDecomposition: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                responsibilityAr: { type: Type.STRING },
                triggers: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['name', 'responsibilityAr', 'triggers'],
            },
          },
          variablesPlan: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                scope: { type: Type.STRING },
                dataType: { type: Type.STRING },
                defaultValue: { type: Type.STRING },
                descriptionAr: { type: Type.STRING },
              },
              required: ['id', 'name', 'scope', 'dataType', 'defaultValue', 'descriptionAr'],
            },
          },
          selectedNodesRationale: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                definitionId: { type: Type.STRING },
                unitClassName: { type: Type.STRING },
                originKind: { type: Type.STRING },
                reasonAr: { type: Type.STRING },
              },
              required: ['definitionId', 'unitClassName', 'originKind', 'reasonAr'],
            },
          },
          explicitPortWiringPlan: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                kind: { type: Type.STRING },
                from: { type: Type.STRING },
                to: { type: Type.STRING },
                purposeAr: { type: Type.STRING },
              },
              required: ['kind', 'from', 'to', 'purposeAr'],
            },
          },
          edgeCasesAndConflictsAr: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          documentedAlternativesAr: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scenarioAr: { type: Type.STRING },
                alternativeApproachAr: { type: Type.STRING },
                requiresCustomCSharpUnit: { type: Type.BOOLEAN },
              },
              required: ['scenarioAr', 'alternativeApproachAr', 'requiresCustomCSharpUnit'],
            },
          },
          externalRequirements: {
            type: Type.OBJECT,
            properties: {
              components: { type: Type.ARRAY, items: { type: Type.STRING } },
              projectSettingsAr: { type: Type.ARRAY, items: { type: Type.STRING } },
              packages: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['components', 'projectSettingsAr', 'packages'],
          },
          testPlanAr: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stepNumber: { type: Type.INTEGER },
                actionAr: { type: Type.STRING },
                expectedResultAr: { type: Type.STRING },
                failureCheckAr: { type: Type.STRING },
              },
              required: ['stepNumber', 'actionAr', 'expectedResultAr', 'failureCheckAr'],
            },
          },
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                definitionId: { type: Type.STRING },
                unitClassName: { type: Type.STRING },
                commentAr: { type: Type.STRING },
                inlineEntries: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      value: { type: Type.STRING },
                    },
                    required: ['key', 'value'],
                  },
                },
              },
              required: ['id', 'definitionId', 'unitClassName', 'inlineEntries'],
            },
          },
          connections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                kind: { type: Type.STRING },
                sourceNodeId: { type: Type.STRING },
                sourcePortKey: { type: Type.STRING },
                targetNodeId: { type: Type.STRING },
                targetPortKey: { type: Type.STRING },
                explanationAr: { type: Type.STRING },
              },
              required: [
                'id',
                'kind',
                'sourceNodeId',
                'sourcePortKey',
                'targetNodeId',
                'targetPortKey',
              ],
            },
          },
        },
        required: [
          'graphName',
          'graphDescriptionAr',
          'goalAndBehaviorAr',
          'eventsConditionsIO',
          'subgraphDecomposition',
          'variablesPlan',
          'selectedNodesRationale',
          'explicitPortWiringPlan',
          'edgeCasesAndConflictsAr',
          'documentedAlternativesAr',
          'externalRequirements',
          'testPlanAr',
          'nodes',
          'connections',
        ],
      },
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('لم يُرجع نموذج التحليل استجابة نصية صالحة.');
  }

  const parsed = JSON.parse(rawText);
  const nowIso = new Date().toISOString();

  const kbMap = new Map(req.knowledgeNodes.map((n) => [n.id, n]));

  const nodes: UVSGraphSpec['nodes'] = (parsed.nodes ?? []).map(
    (
      n: {
        id: string;
        definitionId: string;
        unitClassName: string;
        commentAr?: string;
        inlineEntries?: { key: string; value: string }[];
      },
      index: number
    ) => {
      const def = kbMap.get(n.definitionId);
      const inlineValues: Record<string, string | number | boolean> = {};
      for (const entry of n.inlineEntries ?? []) {
        const rawVal = entry.value;
        if (rawVal === 'true') inlineValues[entry.key] = true;
        else if (rawVal === 'false') inlineValues[entry.key] = false;
        else if (rawVal !== '' && !Number.isNaN(Number(rawVal))) {
          inlineValues[entry.key] = Number(rawVal);
        } else {
          inlineValues[entry.key] = rawVal;
        }
      }

      return {
        id: n.id || `node-${index + 1}`,
        definitionId: n.definitionId,
        unitClassName: def?.unitClassName ?? n.unitClassName,
        position: { x: index * 300, y: 120 },
        inlineValues,
        commentAr: n.commentAr,
      };
    }
  );

  const validScopes = new Set(['Flow', 'Graph', 'Object', 'Scene', 'Application', 'Saved']);
  const variables: UVSGraphSpec['variables'] = (parsed.variablesPlan ?? []).map(
    (v: {
      id?: string;
      name: string;
      scope: string;
      dataType: string;
      defaultValue: string;
      descriptionAr: string;
    }, idx: number) => ({
      id: v.id || `var-${idx + 1}`,
      name: v.name,
      scope: (validScopes.has(v.scope) ? v.scope : 'Graph') as UVSGraphSpec['variables'][number]['scope'],
      dataType: v.dataType || 'System.Single',
      defaultValue: String(v.defaultValue ?? '0'),
      descriptionAr: v.descriptionAr || '',
    })
  );

  const connections: UVSGraphSpec['connections'] = (parsed.connections ?? []).map(
    (
      c: {
        id?: string;
        kind: string;
        sourceNodeId: string;
        sourcePortKey: string;
        targetNodeId: string;
        targetPortKey: string;
        explanationAr?: string;
      },
      idx: number
    ) => ({
      id: c.id || `conn-${idx + 1}`,
      kind: c.kind === 'flow' ? 'flow' : 'value',
      sourceNodeId: c.sourceNodeId,
      sourcePortKey: c.sourcePortKey,
      targetNodeId: c.targetNodeId,
      targetPortKey: c.targetPortKey,
      explanationAr: c.explanationAr,
    })
  );

  const rawGraph: UVSGraphSpec = {
    schemaVersion: '1.0.0',
    id: `graph-${Date.now()}`,
    name: parsed.graphName || 'GeneratedVisualScript',
    descriptionAr: parsed.graphDescriptionAr || '',
    createdAt: nowIso,
    updatedAt: nowIso,
    targetUnityVersion: req.profile.unityVersion,
    targetVsVersion: req.profile.vsPackageVersion,
    variables,
    groups: [],
    subgraphs: [],
    nodes,
    connections,
  };

  // Arrange topology cleanly left-to-right
  const laidOutGraph = rawGraph.nodes.length > 0
    ? applyAutoLayout(rawGraph, req.knowledgeNodes)
    : rawGraph;

  // Run independent deterministic Validator immediately (never trust AI blindly!)
  const validation = validateGraph(laidOutGraph, req.profile, req.knowledgeNodes);

  const analysis: ProblemAnalysisReport = {
    id: `analysis-${Date.now()}`,
    createdAt: nowIso,
    problemSummaryInput: req.problemText,
    goalAndBehaviorAr: parsed.goalAndBehaviorAr,
    eventsConditionsIO: parsed.eventsConditionsIO,
    subgraphDecomposition: parsed.subgraphDecomposition ?? [],
    variablesPlan: variables,
    selectedNodesRationale: parsed.selectedNodesRationale ?? [],
    explicitPortWiringPlan: parsed.explicitPortWiringPlan ?? [],
    edgeCasesAndConflictsAr: parsed.edgeCasesAndConflictsAr ?? [],
    documentedAlternativesAr: parsed.documentedAlternativesAr ?? [],
    externalRequirements: parsed.externalRequirements ?? {
      components: [],
      projectSettingsAr: [],
      packages: [],
    },
    testPlanAr: parsed.testPlanAr ?? [],
  };

  return {
    analysis,
    graph: laidOutGraph,
    validation,
  };
}

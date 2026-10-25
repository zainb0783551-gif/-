import {
  KnowledgeNodeDefinition,
  KnowledgePortDefinition,
  UnityProjectProfile,
  UVSGraphSpec,
  ValidationIssue,
  ValidationReport,
  VerificationStatus,
} from '../types/uvs';
import { isNodeSupportedInVersion } from '../knowledge-base/registry';

const NUMERIC_TYPES = new Set([
  'System.Single',
  'System.Int32',
  'System.Double',
  'System.Int64',
]);

const COMPONENT_SUBTYPES = new Set([
  'UnityEngine.Component',
  'UnityEngine.Transform',
  'UnityEngine.Collider',
  'UnityEngine.Collider2D',
  'UnityEngine.Rigidbody',
  'UnityEngine.Rigidbody2D',
  'UnityEngine.Animator',
  'UnityEngine.AudioSource',
  'UnityEngine.InputSystem.PlayerInput',
]);

/**
 * Mirrors Unity Visual Scripting's `ConversionUtility.CanConvert` rules for verified built-in & UnityEngine types.
 * Never allows arbitrary incompatible wiring (e.g. String -> Vector3 or Boolean -> Rigidbody).
 */
export function areValueTypesCompatible(sourceType?: string, targetType?: string): boolean {
  const src = sourceType || 'System.Object';
  const dst = targetType || 'System.Object';

  if (src === dst) return true;
  if (dst === 'System.Object' || src === 'System.Object') return true;

  // Numeric implicit conversion in Unity Visual Scripting (int -> float, float -> double)
  if (src === 'System.Int32' && (dst === 'System.Single' || dst === 'System.Double')) {
    return true;
  }
  if (src === 'System.Single' && dst === 'System.Double') {
    return true;
  }

  // UnityEngine inheritance hierarchy: Component subtypes -> Component or UnityEngine.Object
  if (COMPONENT_SUBTYPES.has(src) && (dst === 'UnityEngine.Component' || dst === 'UnityEngine.Object')) {
    return true;
  }
  if (src === 'UnityEngine.GameObject' && dst === 'UnityEngine.Object') {
    return true;
  }
  // Unity Visual Scripting supports implicit Component <-> GameObject component-holder conversion on target ports
  if (COMPONENT_SUBTYPES.has(src) && dst === 'UnityEngine.GameObject') {
    return true;
  }
  if (src === 'UnityEngine.GameObject' && COMPONENT_SUBTYPES.has(dst)) {
    return true;
  }

  // Vector2 -> Vector3 implicit conversion exists in UnityEngine/VS
  if (src === 'UnityEngine.Vector2' && dst === 'UnityEngine.Vector3') {
    return true;
  }

  // Strictly reject numeric <-> string, boolean <-> vector, etc. without explicit conversion unit
  if (NUMERIC_TYPES.has(src) && dst === 'System.String') {
    return false;
  }

  return false;
}

/**
 * Independent, deterministic Graph Validator (Zero dependency on Gemini).
 * Inspects node existence, target VS version, UPM packages, Flow vs Value separation,
 * port multiplicity, type compatibility, variable consistency, required components,
 * coroutine constraints, and infinite synchronous cycles.
 */
export function validateGraph(
  graph: UVSGraphSpec,
  profile: UnityProjectProfile,
  knowledgeNodes: KnowledgeNodeDefinition[]
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const kbById = new Map<string, KnowledgeNodeDefinition>();
  const kbByClass = new Map<string, KnowledgeNodeDefinition[]>();

  for (const def of knowledgeNodes) {
    kbById.set(def.id, def);
    const list = kbByClass.get(def.unitClassName) ?? [];
    list.push(def);
    kbByClass.set(def.unitClassName, list);
  }

  let issueSeq = 1;
  const pushIssue = (issue: Omit<ValidationIssue, 'id'>) => {
    issues.push({ id: `val-${issueSeq++}`, ...issue });
  };

  // 1. Version Profile Check
  const effectiveVsVersion = profile.vsPackageVersion ?? graph.targetVsVersion;
  if (!effectiveVsVersion) {
    pushIssue({
      code: 'VS_VERSION_UNCONFIGURED',
      severity: 'info',
      category: 'version_profile',
      titleAr: 'إصدار حزمة Visual Scripting غير مؤكد بعد',
      detailAr:
        'لم يتم تحديد إصدار com.unity.visualscripting المثبت فعلياً في مشروع المستخدم، لذا يبقى التحقق نظرياً غير مكتمل.',
      remediationAr:
        'ارفع ملف Packages/packages-lock.json أو تقرير UnityBridge أو حدد الإصدار المثبت في إعدادات المشروع.',
    });
  } else if (profile.vsVersionSource === 'manifest_json') {
    pushIssue({
      code: 'VS_VERSION_MANIFEST_ONLY',
      severity: 'warning',
      category: 'version_profile',
      titleAr: 'الإصدار مأخوذ من manifest.json فقط دون ملف القفل أو المحرك',
      detailAr: `الإصدار المعلن (${effectiveVsVersion}) قد يختلف عن النسخة المحلولة فعلياً داخل المشروع.`,
      remediationAr:
        'ارفع Packages/packages-lock.json أو تقرير فحص UnityBridge للتثبت القاطع من الإصدار الفعلي.',
    });
  }

  if (graph.nodes.length === 0) {
    pushIssue({
      code: 'EMPTY_GRAPH',
      severity: 'error',
      category: 'execution_path',
      titleAr: 'المخطط فارغ لا يحتوي على أي عقد',
      detailAr: 'لا يمكن التحقق من مخطط خالٍ من العقد أو تصديره.',
      remediationAr: 'أضف عقدة حدث (مثل On Start) وعقد المنطق المطلوبة.',
    });
  }

  // Maps for graph topology inspection
  const nodeInstanceMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const resolvedDefMap = new Map<string, KnowledgeNodeDefinition>();
  const requiredComponentsSet = new Set<string>();
  const requiredPackagesSet = new Set<string>(['com.unity.visualscripting']);

  let verifiedNodesCount = 0;
  let unverifiedNodesCount = 0;
  let missingNodesCount = 0;

  const installedPackageNames = new Set(profile.installedPackages.map((p) => p.name));
  const hasExplicitPackageList = profile.installedPackages.length > 0;

  // 2. Node Existence, Custom Units, Version Support, & Package Requirements
  for (const node of graph.nodes) {
    const def = kbById.get(node.definitionId);
    if (!def) {
      missingNodesCount++;
      const looksLikeCustom =
        node.definitionId.includes('custom') ||
        (!node.unitClassName.startsWith('Unity.VisualScripting') &&
          !node.unitClassName.startsWith('UnityEngine'));

      pushIssue({
        code: looksLikeCustom ? 'CUSTOM_UNIT_MISSING' : 'NODE_NOT_IN_KNOWLEDGE_BASE',
        severity: 'error',
        category: 'node_existence',
        nodeId: node.id,
        titleAr: looksLikeCustom
          ? `وحدة مخصصة (Custom Unit) مفقودة: ${node.unitClassName || node.definitionId}`
          : `عقدة غير موجودة في قاعدة المعرفة الموثقة: ${node.unitClassName || node.definitionId}`,
        detailAr: looksLikeCustom
          ? `المخطط يشير إلى الوحدة المخصصة (${node.unitClassName}) ولكن لم يتم استيراد تقرير UnityBridge يثبت وجودها في أسمبلي المشروع.`
          : `المعرف (${node.definitionId}) غير مسجل ضمن وحدات Unity 2021.3 الموثقة؛ يُمنع افتراض وجود عقد غير موثقة.`,
        remediationAr: looksLikeCustom
          ? 'شغّل أداة UnityBridge داخل محرر Unity لتصدير تقرير الوحدات المخصصة واستورده إلى المنصة، أو أنشئ الكلاس الموروث من Unit.'
          : 'استبدل هذه العقدة بعقدة موثقة من قاعدة المعرفة أو استورد تقرير فحص المشروع.',
      });
      continue;
    }

    resolvedDefMap.set(node.id, def);

    if (def.verificationStatus === 'verified') {
      verifiedNodesCount++;
    } else {
      unverifiedNodesCount++;
      pushIssue({
        code: 'NODE_UNVERIFIED_SOURCE',
        severity: 'warning',
        category: 'undocumented_api',
        nodeId: node.id,
        titleAr: `عقدة غير متحقق منها داخل Unity Editor: ${def.displayName}`,
        detailAr: `مصدر العقدة (${def.sourceType}) لم يتم التثبت منه عبر الوثائق الرسمية المؤكدة أو فحص UnityBridge.`,
        remediationAr: 'تحقق من توافر العقدة ومنافذها بتصدير تقرير فحص من أداة UnityBridge.',
      });
    }

    // Version compatibility check
    if (effectiveVsVersion && !isNodeSupportedInVersion(def, effectiveVsVersion)) {
      pushIssue({
        code: 'NODE_VERSION_INCOMPATIBLE',
        severity: 'error',
        category: 'version_profile',
        nodeId: node.id,
        titleAr: `العقدة (${def.displayName}) غير مدعومة في إصدار الحزمة (${effectiveVsVersion})`,
        detailAr: `تتطلب هذه العقدة إصدار com.unity.visualscripting >= ${def.minVsVersion}${
          def.maxVsVersion ? ` و <= ${def.maxVsVersion}` : ''
        }.`,
        remediationAr: `قم بترقية حزمة Visual Scripting في Package Manager إلى ${def.minVsVersion} أو استبدل العقدة ببديل متوافق.`,
      });
    }

    // Required components & packages
    for (const comp of def.requiredComponents) {
      requiredComponentsSet.add(comp);
    }
    for (const pkg of def.requiredPackages) {
      requiredPackagesSet.add(pkg);
      if (pkg !== 'com.unity.visualscripting') {
        if (hasExplicitPackageList && !installedPackageNames.has(pkg)) {
          pushIssue({
            code: 'REQUIRED_PACKAGE_MISSING',
            severity: 'error',
            category: 'package_dependency',
            nodeId: node.id,
            titleAr: `حزمة مطلوبة غير مثبتة في المشروع: ${pkg}`,
            detailAr: `العقدة (${def.displayName}) تعتمد كلياً على حزمة (${pkg}) غير الموجودة في ملفات الحزم المرفوعة.`,
            remediationAr: `ثبّت حزمة ${pkg} عبر Unity Package Manager أو استخدم بدائل الإدخال المدمجة (مثل On Keyboard Input).`,
          });
        } else if (!hasExplicitPackageList) {
          pushIssue({
            code: 'EXTERNAL_PACKAGE_UNCONFIRMED',
            severity: 'warning',
            category: 'package_dependency',
            nodeId: node.id,
            titleAr: `العقدة (${def.displayName}) تتطلب التحقق من تثبيت حزمة ${pkg}`,
            detailAr: `لم يتم رفع manifest.json أو packages-lock.json للتأكد من وجود الحزمة (${pkg}).`,
            remediationAr: `تأكد من تثبيت ${pkg} في مشروعك أو ارفع ملف manifest.json للتحقق الآلي.`,
          });
        }
      }
    }

    // Special dangerous parameter checks (e.g., For Loop step == 0)
    if (def.id === 'uvs.control.for_loop') {
      const stepVal = node.inlineValues['step'];
      if (stepVal !== undefined && Number(stepVal) === 0) {
        pushIssue({
          code: 'FOR_LOOP_ZERO_STEP',
          severity: 'error',
          category: 'loop_or_coroutine_hazard',
          nodeId: node.id,
          titleAr: 'خطر حلقة لا نهائية: قيمة Step تساوي صفراً في عقدة For Loop',
          detailAr: 'تعيين Step = 0 يمنع تقدم العداد ويؤدي إلى تجميد محرر Unity تماماً وقت التشغيل.',
          remediationAr: 'اضبط قيمة Step على عدد صحيح غير صفري (مثل 1 أو -1).',
        });
      }
    }
  }

  // 3. Connections Inspection: Port Existence, Direction, Flow vs Value Separation, Multiplicity & Types
  const outgoingControlCount = new Map<string, number>();
  const incomingValueCount = new Map<string, number>();
  const incomingControlCount = new Map<string, number>();
  const connectedValueInputs = new Set<string>();
  const connectedControlOutputs = new Set<string>();

  // Adjacency for flow traversal (cycles & coroutine reachability)
  const flowAdjacency = new Map<string, string[]>();

  for (const conn of graph.connections) {
    const srcNode = nodeInstanceMap.get(conn.sourceNodeId);
    const dstNode = nodeInstanceMap.get(conn.targetNodeId);

    if (!srcNode || !dstNode) {
      pushIssue({
        code: 'DANGLING_CONNECTION_NODE',
        severity: 'error',
        category: 'port_compatibility',
        connectionId: conn.id,
        titleAr: 'وصلة مرتبطة بعقدة محذوفة أو غير موجودة',
        detailAr: `الوصلة (${conn.id}) تشير إلى معرف عقدة غير موجود داخل المخطط.`,
        remediationAr: 'احذف الوصلة التالفة وأعد ربط المنافذ الصحيحة.',
      });
      continue;
    }

    if (conn.sourceNodeId === conn.targetNodeId) {
      pushIssue({
        code: 'SELF_CONNECTION',
        severity: 'error',
        category: 'loop_or_coroutine_hazard',
        nodeId: conn.sourceNodeId,
        connectionId: conn.id,
        titleAr: 'وصلة ذاتية مباشرة على نفس العقدة',
        detailAr: `العقدة (${srcNode.unitClassName}) متصلة بنفسها مباشرة مما يسبب خطأ تقييم أو حلقة مفرغة.`,
        remediationAr: 'افصل الوصلة الذاتية عن العقدة.',
      });
      continue;
    }

    const srcDef = resolvedDefMap.get(srcNode.id);
    const dstDef = resolvedDefMap.get(dstNode.id);
    if (!srcDef || !dstDef) {
      // Node existence error already reported above
      continue;
    }

    const allSrcOutputs: KnowledgePortDefinition[] = [
      ...srcDef.controlOutputs,
      ...srcDef.valueOutputs,
    ];
    const allDstInputs: KnowledgePortDefinition[] = [
      ...dstDef.controlInputs,
      ...dstDef.valueInputs,
    ];

    const srcPort = allSrcOutputs.find((p) => p.key === conn.sourcePortKey);
    const dstPort = allDstInputs.find((p) => p.key === conn.targetPortKey);

    if (!srcPort) {
      // Check if user accidentally tried to wire from an INPUT port!
      const reversedSrc = [...srcDef.controlInputs, ...srcDef.valueInputs].find(
        (p) => p.key === conn.sourcePortKey
      );
      pushIssue({
        code: reversedSrc ? 'INVALID_PORT_DIRECTION' : 'SOURCE_PORT_NOT_FOUND',
        severity: 'error',
        category: 'port_compatibility',
        nodeId: srcNode.id,
        connectionId: conn.id,
        titleAr: reversedSrc
          ? `اتجاه منفذ خاطئ في العقدة (${srcDef.displayName})`
          : `منفذ مخرج غير موجود (${conn.sourcePortKey}) في (${srcDef.displayName})`,
        detailAr: reversedSrc
          ? `المنفذ (${conn.sourcePortKey}) هو منفذ إدخال (Input) ولا يمكن السحب منه كمخرج.`
          : `العقدة (${srcDef.unitClassName}) لا تملك مخرجاً بالمعرف (${conn.sourcePortKey}).`,
        remediationAr: 'استخدم أحد مخارج العقدة الموثقة في قاعدة المعرفة.',
      });
      continue;
    }

    if (!dstPort) {
      const reversedDst = [...dstDef.controlOutputs, ...dstDef.valueOutputs].find(
        (p) => p.key === conn.targetPortKey
      );
      pushIssue({
        code: reversedDst ? 'INVALID_PORT_DIRECTION' : 'TARGET_PORT_NOT_FOUND',
        severity: 'error',
        category: 'port_compatibility',
        nodeId: dstNode.id,
        connectionId: conn.id,
        titleAr: reversedDst
          ? `اتجاه منفذ خاطئ في العقدة (${dstDef.displayName})`
          : `منفذ مدخل غير موجود (${conn.targetPortKey}) في (${dstDef.displayName})`,
        detailAr: reversedDst
          ? `المنفذ (${conn.targetPortKey}) هو منفذ إخراج (Output) ولا يمكن التوصيل إليه كمدخل.`
          : `العقدة (${dstDef.unitClassName}) لا تملك مدخلاً بالمعرف (${conn.targetPortKey}).`,
        remediationAr: 'اختر منفذ إدخال صالحاً في العقدة المستهدفة.',
      });
      continue;
    }

    // Strict Flow vs Value separation!
    if (srcPort.kind !== dstPort.kind || conn.kind !== (srcPort.kind === 'control' ? 'flow' : 'value')) {
      pushIssue({
        code: 'FLOW_VALUE_MIX_FORBIDDEN',
        severity: 'error',
        category: 'flow_value_separation',
        connectionId: conn.id,
        nodeId: dstNode.id,
        titleAr: 'خلط غير قانوني بين تدفق التنفيذ (Flow) وتدفق البيانات (Value)',
        detailAr: `محاولة توصيل منفذ (${srcPort.label}: ${srcPort.kind}) في (${srcDef.displayName}) بمنفذ (${dstPort.label}: ${dstPort.kind}) في (${dstDef.displayName}).`,
        remediationAr:
          'في Unity Visual Scripting توصل منافذ Control (المثلثات) بمنافذ Control فقط، ومنافذ Value (الدوائر الملونة) بمنافذ Value فقط.',
      });
      continue;
    }

    if (srcPort.kind === 'control') {
      const outKey = `${srcNode.id}:${srcPort.key}`;
      const prevCount = outgoingControlCount.get(outKey) ?? 0;
      outgoingControlCount.set(outKey, prevCount + 1);
      connectedControlOutputs.add(outKey);

      const inKey = `${dstNode.id}:${dstPort.key}`;
      incomingControlCount.set(inKey, (incomingControlCount.get(inKey) ?? 0) + 1);

      if (prevCount >= 1) {
        pushIssue({
          code: 'MULTIPLE_CONTROL_OUTPUT_WIRES',
          severity: 'error',
          category: 'flow_value_separation',
          nodeId: srcNode.id,
          connectionId: conn.id,
          titleAr: `أكثر من وصلة Flow خارجة من نفس المنفذ (${srcPort.label}) في (${srcDef.displayName})`,
          detailAr:
            'لا يسمح Unity Visual Scripting بإخراج أكثر من سلك تحكم واحد من منفذ ControlOutput واحد (يؤدي لاستبدال الوصلة السابقة).',
          remediationAr:
            'ضع عقدة Sequence بعد هذا المخرج لتوزيع تدفق التنفيذ على عدة مسارات بالترتيب.',
        });
      }

      const adj = flowAdjacency.get(srcNode.id) ?? [];
      adj.push(dstNode.id);
      flowAdjacency.set(srcNode.id, adj);
    } else {
      // Value connection checks
      const inValKey = `${dstNode.id}:${dstPort.key}`;
      const prevValCount = incomingValueCount.get(inValKey) ?? 0;
      incomingValueCount.set(inValKey, prevValCount + 1);
      connectedValueInputs.add(inValKey);

      if (prevValCount >= 1) {
        pushIssue({
          code: 'MULTIPLE_VALUE_INPUT_WIRES',
          severity: 'error',
          category: 'port_compatibility',
          nodeId: dstNode.id,
          connectionId: conn.id,
          titleAr: `توصيل أكثر من مصدر بيانات واحد إلى منفذ الإدخال (${dstPort.label})`,
          detailAr: `منفذ البيانات (${dstPort.label}) في (${dstDef.displayName}) لا يقبل إلا مصدر قيمة واحداً فقط.`,
          remediationAr: 'ادمج القيم عبر عقدة حسابية أو منطقية أولاً ثم أوصل الناتج بالمنفذ.',
        });
      }

      // Resolve effective dynamic types for GetVariable / SetVariable when possible
      let effectiveSrcType = srcPort.dataType;
      let effectiveDstType = dstPort.dataType;

      if (srcDef.id === 'uvs.variables.get') {
        const varName = String(srcNode.inlineValues['name'] ?? '');
        const varScope = String(srcNode.inlineValues['kind'] ?? 'Graph');
        const declared = graph.variables.find(
          (v) => v.name === varName && v.scope === varScope
        );
        if (declared) effectiveSrcType = declared.dataType;
      }

      if (dstDef.id === 'uvs.variables.set' && dstPort.key === 'input') {
        const varName = String(dstNode.inlineValues['name'] ?? '');
        const varScope = String(dstNode.inlineValues['kind'] ?? 'Graph');
        const declared = graph.variables.find(
          (v) => v.name === varName && v.scope === varScope
        );
        if (declared) effectiveDstType = declared.dataType;
      }

      if (!areValueTypesCompatible(effectiveSrcType, effectiveDstType)) {
        pushIssue({
          code: 'PORT_TYPE_MISMATCH',
          severity: 'error',
          category: 'port_compatibility',
          nodeId: dstNode.id,
          connectionId: conn.id,
          titleAr: `عدم توافق أنواع البيانات بين (${srcDef.displayName}) و (${dstDef.displayName})`,
          detailAr: `لا يمكن تحويل النوع (${effectiveSrcType}) الخارج من (${srcPort.label}) ضمنياً إلى النوع (${effectiveDstType}) المطلوب في (${dstPort.label}).`,
          remediationAr:
            'أضف عقدة تحويل صريحة متوافقة أو صحّح المنفذ المتصل ليتطابق مع نوع البيانات المطلوب.',
        });
      }
    }
  }

  // 4. Variables Integrity, Scopes & Required Unconnected Value Inputs
  const declaredVarMap = new Map<string, string>();
  for (const v of graph.variables) {
    declaredVarMap.set(`${v.scope}:${v.name}`, v.dataType);
    if (v.scope === 'Object') {
      requiredComponentsSet.add('Unity.VisualScripting.Variables');
    }
  }

  for (const node of graph.nodes) {
    const def = resolvedDefMap.get(node.id);
    if (!def) continue;

    if (def.id === 'uvs.variables.get' || def.id === 'uvs.variables.set') {
      const varName = String(node.inlineValues['name'] ?? '').trim();
      const varScope = String(node.inlineValues['kind'] ?? 'Graph');
      const nameConnected = connectedValueInputs.has(`${node.id}:name`);

      if (!varName && !nameConnected) {
        pushIssue({
          code: 'VARIABLE_NAME_EMPTY',
          severity: 'error',
          category: 'variable_integrity',
          nodeId: node.id,
          titleAr: `اسم المتغير فارغ في عقدة (${def.displayName})`,
          detailAr: 'استدعاء Get/Set Variable بدون اسم متغير يسبب استثناءً فورياً وقت التشغيل.',
          remediationAr: 'حدد اسم المتغير في خصائص العقدة وأضفه إلى جدول متغيرات المخطط.',
        });
      } else if (varName && varScope !== 'Flow' && !declaredVarMap.has(`${varScope}:${varName}`)) {
        pushIssue({
          code: 'VARIABLE_NOT_DECLARED_IN_BLACKBOARD',
          severity: def.id === 'uvs.variables.get' ? 'warning' : 'info',
          category: 'variable_integrity',
          nodeId: node.id,
          titleAr: `المتغير (${varName}) في النطاق (${varScope}) غير مسجل في قائمة المتغيرات`,
          detailAr:
            def.id === 'uvs.variables.get'
              ? `قراءة المتغير (${varName}) قبل إنشائه أو تعريفه في Blackboard ستؤدي إلى خطأ متغير غير معرّف وقت التشغيل.`
              : `تقوم Set Variable بإنشاء المتغير ديناميكياً عند التنفيذ، ولكن يُفضّل تعريفه صراحةً مع نوعه وقيمته الابتدائية.`,
          remediationAr: `أضف المتغير (${varName}) بنطاق (${varScope}) في لوحة متغيرات المخطط.`,
        });
      }

      if (varScope === 'Object') {
        requiredComponentsSet.add('Unity.VisualScripting.Variables');
      }
    }

    // Check required value inputs without connection or inline value
    for (const vIn of def.valueInputs) {
      if (!vIn.required) continue;
      const isConnected = connectedValueInputs.has(`${node.id}:${vIn.key}`);
      const hasInline =
        node.inlineValues[vIn.key] !== undefined && node.inlineValues[vIn.key] !== '';
      const hasDefault = vIn.defaultValue !== undefined && vIn.defaultValue !== null;
      if (!isConnected && !hasInline && !hasDefault) {
        pushIssue({
          code: 'MISSING_REQUIRED_VALUE_INPUT',
          severity: 'error',
          category: 'port_compatibility',
          nodeId: node.id,
          titleAr: `مدخل بيانات إلزامي غير متصل وبدون قيمة افتراضية: (${vIn.label})`,
          detailAr: `العقدة (${def.displayName}) تحتاج قيمة في المنفذ (${vIn.label}) من نوع (${vIn.dataType}).`,
          remediationAr: 'أوصل سلك بيانات مناسب بالمنفذ أو أدخل قيمة مضمنة في مفتش العقدة.',
        });
      }
    }

    // Check disconnected action units (nodes with controlInputs where NONE are connected)
    if (def.controlInputs.length > 0) {
      const anyControlConnected = def.controlInputs.some(
        (ci) => (incomingControlCount.get(`${node.id}:${ci.key}`) ?? 0) > 0
      );
      // Note: Pure-capable InvokeMember (like Component.CompareTag) has valueOutputs and can evaluate lazily without control flow!
      const canEvaluateLazilyAsValue = def.valueOutputs.length > 0 && def.originKind === 'reflection';
      if (!anyControlConnected && !canEvaluateLazilyAsValue) {
        pushIssue({
          code: 'UNREACHABLE_ACTION_NODE',
          severity: 'warning',
          category: 'execution_path',
          nodeId: node.id,
          titleAr: `عقدة تنفيذية معزولة لن تعمل أبداً: (${def.displayName})`,
          detailAr: `لا توجد أي وصلة Flow داخلة إلى العقدة (${def.displayName})، لذا لن يتم استدعاؤها أثناء اللعب.`,
          remediationAr: 'أوصل مدخل التنفيذ بحدث (Event) أو عقدة تحكم سابقة، أو احذف العقدة إن كانت زائدة.',
        });
      }
    }

    // Check If node with neither True nor False connected
    if (def.id === 'uvs.control.if') {
      const hasTrue = connectedControlOutputs.has(`${node.id}:ifTrue`);
      const hasFalse = connectedControlOutputs.has(`${node.id}:ifFalse`);
      if (!hasTrue && !hasFalse) {
        pushIssue({
          code: 'INCOMPLETE_IF_BRANCHES',
          severity: 'warning',
          category: 'execution_path',
          nodeId: node.id,
          titleAr: 'عقدة الشرط (If) بلا أي مسار تنفيذ خارج (True أو False)',
          detailAr: 'فحص الشرط لا يؤدي إلى أي سلوك لأن كلا المخرجين غير متصلين.',
          remediationAr: 'أوصل مخرج True أو False بالعقدة المراد تنفيذها عند تحقق الشرط.',
        });
      }
    }
  }

  // 5. Cycle Detection & Coroutine / Per-Frame Event Hazard Analysis
  const visitState = new Map<string, 'visiting' | 'visited'>();
  const detectCycleDfs = (u: string, stack: string[]) => {
    visitState.set(u, 'visiting');
    const neighbors = flowAdjacency.get(u) ?? [];
    for (const v of neighbors) {
      const st = visitState.get(v);
      if (st === 'visiting') {
        // Check if cycle passes through a coroutine wait unit; synchronous cycle freezes Unity!
        const cycleSlice = stack.slice(stack.indexOf(v));
        const hasYieldInCycle = cycleSlice.some(
          (nid) => resolvedDefMap.get(nid)?.isCoroutineUnit
        );
        if (!hasYieldInCycle) {
          pushIssue({
            code: 'INFINITE_SYNCHRONOUS_FLOW_CYCLE',
            severity: 'error',
            category: 'loop_or_coroutine_hazard',
            nodeId: v,
            titleAr: 'حلقة تدفق تنفيذ متزامنة مغلقة (تسبب تجميد محرك Unity)',
            detailAr:
              'تم رصد مسار Flow يعود إلى عقدة سابقة في نفس الإطار دون وجود عقدة انتظار (Yield/Wait).',
            remediationAr:
              'اكسر الحلقة المغلقة أو استخدم عقدة For محدودة أو Timer/Wait For Seconds داخل حدث Coroutine.',
          });
        }
      } else if (!st) {
        detectCycleDfs(v, [...stack, v]);
      }
    }
    visitState.set(u, 'visited');
  };

  for (const node of graph.nodes) {
    if (!visitState.has(node.id)) {
      detectCycleDfs(node.id, [node.id]);
    }
  }

  // Check reachability from Event nodes to Coroutine units (e.g., WaitForSecondsUnit)
  const eventNodes = graph.nodes.filter((n) => resolvedDefMap.get(n.id)?.isEventNode);
  for (const evNode of eventNodes) {
    const evDef = resolvedDefMap.get(evNode.id)!;
    const visitedFromEvent = new Set<string>();
    const queue = [evNode.id];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visitedFromEvent.has(curr)) continue;
      visitedFromEvent.add(curr);
      for (const nxt of flowAdjacency.get(curr) ?? []) {
        queue.push(nxt);
      }
    }

    for (const reachableId of visitedFromEvent) {
      const targetDef = resolvedDefMap.get(reachableId);
      if (targetDef?.isCoroutineUnit) {
        if (evDef.id === 'uvs.event.update' || evDef.id === 'uvs.event.fixed_update') {
          pushIssue({
            code: 'COROUTINE_IN_PER_FRAME_EVENT',
            severity: 'error',
            category: 'loop_or_coroutine_hazard',
            nodeId: reachableId,
            titleAr: `خطأ قاتل: استخدام (${targetDef.displayName}) داخل حدث إطاري متكرر (${evDef.displayName})`,
            detailAr: `أحداث (${evDef.displayName}) لا تدعم Coroutines في Unity Visual Scripting، كما أن جدولة انتظار في كل إطار تسبب استنزاف الذاكرة وفشل التنفيذ.`,
            remediationAr:
              'استخدم عقدة Cooldown أو Timer بدلاً من Wait For Seconds، أو انقل السلسلة إلى حدث غير إطاري مثل On Start أو Custom Event مع تفعيل Coroutine.',
          });
        } else if (evDef.supportsCoroutineToggle && !Boolean(evNode.inlineValues['coroutine'])) {
          pushIssue({
            code: 'EVENT_COROUTINE_TOGGLE_DISABLED',
            severity: 'error',
            category: 'loop_or_coroutine_hazard',
            nodeId: evNode.id,
            titleAr: `يجب تفعيل خيار Coroutine على الحدث (${evDef.displayName})`,
            detailAr: `السلسلة المتفرعة من (${evDef.displayName}) تحتوي على عقدة انتظار (${targetDef.displayName})، وسترمي InvalidOperationException وقت التشغيل إن لم يُفعّل خيار Coroutine.`,
            remediationAr: `حدد عقدة (${evDef.displayName}) وفعّل خيار Coroutine = true في خصائصها.`,
          });
        }
      }
    }
  }

  // Required components informative notice
  const requiredComponentsSummary = Array.from(requiredComponentsSet);
  const requiredPackagesSummary = Array.from(requiredPackagesSet);

  // Tally counts & compute overall verification status
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const infos = issues.filter((i) => i.severity === 'info').length;

  let overallStatus: VerificationStatus;
  if (errors > 0 || missingNodesCount > 0) {
    overallStatus = VerificationStatus.INVALID;
  } else if (!effectiveVsVersion || unverifiedNodesCount > 0) {
    overallStatus = VerificationStatus.UNVERIFIED;
  } else if (warnings > 0) {
    overallStatus = VerificationStatus.PARTIALLY_VERIFIED;
  } else {
    overallStatus = VerificationStatus.VERIFIED;
  }

  const structuralStatus =
    errors > 0 ? 'invalid' : warnings > 0 ? 'warnings_only' : 'valid';

  const hasPerFrameEvents = eventNodes.some(
    (n) => n.definitionId === 'uvs.event.update' || n.definitionId === 'uvs.event.fixed_update'
  );
  const runtimeRiskStatus =
    errors > 0
      ? 'high_risk'
      : warnings > 0 || hasPerFrameEvents || requiredComponentsSummary.length > 1
      ? 'needs_playmode_test'
      : 'low_risk';

  const verificationBasis =
    profile.vsVersionSource === 'unity_bridge_report'
      ? 'unity_editor_scan_backed'
      : effectiveVsVersion
      ? 'official_docs_theoretical'
      : 'unverified_profile';

  // UnityBridge direct asset import readiness
  const unsupportedBridgeNodes = graph.nodes
    .map((n) => resolvedDefMap.get(n.id))
    .filter((d): d is KnowledgeNodeDefinition => Boolean(d && !d.unityBridgeImportSupported));

  const unityBridgeImportable =
    errors === 0 &&
    missingNodesCount === 0 &&
    graph.nodes.length > 0 &&
    unsupportedBridgeNodes.length === 0;

  let unityBridgeImportReasonAr = '';
  if (errors > 0 || missingNodesCount > 0) {
    unityBridgeImportReasonAr =
      'الاستيراد المباشر متوقف لوجود أخطاء بنية أو عقد غير متوافقة يجب إصلاحها أولاً.';
  } else if (unsupportedBridgeNodes.length > 0) {
    unityBridgeImportReasonAr = `المخطط سليم منطقياً، لكنه يتضمن عقداً (${unsupportedBridgeNodes
      .map((u) => u.displayName)
      .join('، ')}) تتطلب ربط أصول فرعية يدوياً داخل محرر Unity؛ سيوفر التصدير خطوات البناء الدقيقة.`;
  } else {
    unityBridgeImportReasonAr =
      'جميع عقد المخطط مدعومة بمحول UnityBridge الصريح لإنشاء ScriptGraphAsset داخل Unity 2021.3 بعد أخذ نسخة احتياطية.';
  }

  return {
    reportId: `val-rep-${Date.now()}`,
    validatedAt: new Date().toISOString(),
    overallStatus,
    structuralStatus,
    runtimeRiskStatus,
    verificationBasis,
    unityBridgeImportable,
    unityBridgeImportReasonAr,
    requiredComponentsSummary,
    requiredPackagesSummary,
    counts: {
      errors,
      warnings,
      infos,
      verifiedNodes: verifiedNodesCount,
      unverifiedNodes: unverifiedNodesCount,
      missingNodes: missingNodesCount,
    },
    issues,
  };
}

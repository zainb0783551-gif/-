import { KnowledgeNodeDefinition, NodeOriginKind } from '../types/uvs';
import { OFFICIAL_KNOWLEDGE_NODES } from './officialNodes';
import { compareSemver } from './projectDetector';

export interface KnowledgeFilterOptions {
  query?: string;
  category?: string;
  originKind?: NodeOriginKind | 'all';
  verificationStatus?: 'all' | 'verified' | 'partially_verified' | 'unverified';
  targetVsVersion?: string | null;
  onlyCompatibleWithVersion?: boolean;
}

export function isNodeSupportedInVersion(
  node: KnowledgeNodeDefinition,
  vsVersion: string | null
): boolean {
  if (!vsVersion) return true;
  if (node.minVsVersion && compareSemver(vsVersion, node.minVsVersion) < 0) {
    return false;
  }
  if (node.maxVsVersion && compareSemver(vsVersion, node.maxVsVersion) > 0) {
    return false;
  }
  return true;
}

export function mergeKnowledgeNodes(
  customOrScannedNodes: KnowledgeNodeDefinition[] = []
): KnowledgeNodeDefinition[] {
  const byId = new Map<string, KnowledgeNodeDefinition>();
  for (const official of OFFICIAL_KNOWLEDGE_NODES) {
    byId.set(official.id, official);
  }
  for (const extra of customOrScannedNodes) {
    byId.set(extra.id, extra);
  }
  return Array.from(byId.values());
}

export function filterKnowledgeNodes(
  nodes: KnowledgeNodeDefinition[],
  options: KnowledgeFilterOptions
): KnowledgeNodeDefinition[] {
  const q = (options.query ?? '').trim().toLowerCase();
  return nodes.filter((node) => {
    if (options.category && options.category !== 'all' && node.category !== options.category) {
      return false;
    }
    if (options.originKind && options.originKind !== 'all' && node.originKind !== options.originKind) {
      return false;
    }
    if (
      options.verificationStatus &&
      options.verificationStatus !== 'all' &&
      node.verificationStatus !== options.verificationStatus
    ) {
      return false;
    }
    if (
      options.onlyCompatibleWithVersion &&
      options.targetVsVersion &&
      !isNodeSupportedInVersion(node, options.targetVsVersion)
    ) {
      return false;
    }
    if (q) {
      const haystack = [
        node.id,
        node.displayName,
        node.unitClassName,
        node.category,
        node.summaryAr,
        node.reflectionMember?.targetType ?? '',
        node.reflectionMember?.memberName ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Validates and imports user-supplied custom node documentation JSON.
 * User-imported docs without a UnityBridge scan are explicitly marked `unverified` unless already verified by scan.
 */
export function parseUserKnowledgeImportJson(rawJson: string): KnowledgeNodeDefinition[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('ملف وثائق المستخدم غير صالح: صيغة JSON غير سليمة.');
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { nodes?: unknown[] }).nodes)
    ? (parsed as { nodes: unknown[] }).nodes
    : null;

  if (!list || list.length === 0) {
    throw new Error('ملف وثائق العقد يجب أن يحتوي على مصفوفة عقد غير فارغة.');
  }

  return list.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`العنصر رقم ${idx + 1} ليس كائن عقدة صالحاً.`);
    }
    const raw = item as Partial<KnowledgeNodeDefinition>;
    if (!raw.id || !raw.unitClassName || !raw.displayName) {
      throw new Error(
        `العقدة رقم ${idx + 1} تفتقر إلى الحقول الإلزامية (id, unitClassName, displayName).`
      );
    }

    return {
      id: String(raw.id),
      unitClassName: String(raw.unitClassName),
      namespace: String(raw.namespace || 'Custom'),
      assembly: String(raw.assembly || 'Assembly-CSharp'),
      displayName: String(raw.displayName),
      category: String(raw.category || 'User Imported'),
      originKind: raw.originKind ?? 'custom',
      reflectionMember: raw.reflectionMember,
      controlInputs: Array.isArray(raw.controlInputs) ? raw.controlInputs : [],
      controlOutputs: Array.isArray(raw.controlOutputs) ? raw.controlOutputs : [],
      valueInputs: Array.isArray(raw.valueInputs) ? raw.valueInputs : [],
      valueOutputs: Array.isArray(raw.valueOutputs) ? raw.valueOutputs : [],
      inlineFields: Array.isArray(raw.inlineFields) ? raw.inlineFields : [],
      requiredComponents: Array.isArray(raw.requiredComponents) ? raw.requiredComponents : [],
      requiredPackages: Array.isArray(raw.requiredPackages)
        ? raw.requiredPackages
        : ['com.unity.visualscripting'],
      minVsVersion: String(raw.minVsVersion || '1.7.0'),
      maxVsVersion: raw.maxVsVersion ? String(raw.maxVsVersion) : undefined,
      versionChanges: Array.isArray(raw.versionChanges) ? raw.versionChanges : [],
      // Enforce anti-hallucination rule: user-imported doc entries are marked unverified until scanned from Unity Editor!
      verificationStatus: 'unverified',
      sourceType: 'user_imported_doc',
      sourceDocUrl: String(raw.sourceDocUrl || 'user-doc://local-import'),
      lastVerifiedAt: new Date().toISOString().slice(0, 10),
      summaryAr: String(raw.summaryAr || 'عقدة مستوردة من وثائق المستخدم (غير متحقق منها داخل Unity Editor بعد).'),
      usageConditionsAr: String(
        raw.usageConditionsAr || 'تحقق من وجود الكلاس والأسمبلي فعلياً عبر أداة UnityBridge قبل الاستيراد.'
      ),
      unityBridgeImportSupported: false,
    };
  });
}

export const VERSION_COMPARISON_NOTES = [
  {
    feature: 'Sticky Notes (الملاحظات اللاصقة)',
    v1_7: 'غير متوفرة في 1.7.x',
    v1_8: 'مضافة رسمياً (Unity.VisualScripting.StickyNote)',
    impactAr: 'استخدام عقدة StickyNote في مشروع مثبت على 1.7.8 يؤدي إلى فشل فك التسلسل أو عقدة مفقودة.',
  },
  {
    feature: 'Dummy Nodes للعقد المفقودة',
    v1_7: 'حذف كلاس C# قد يعطل فتح المخطط بالكامل',
    v1_8: 'تحويل تلقائي إلى Dummy Node مع خيار Replace Node في Inspector',
    impactAr: 'إصدار 1.8.0 أكثر أماناً عند إعادة تسمية أو حذف Custom Units.',
  },
  {
    feature: 'توليد AOT Stubs لبناء IL2CPP',
    v1_7: 'قد يغفل بعض عقد Reflection في البناء النهائي',
    v1_8: 'توليد شامل لجميع العقد لتفادي أخطاء التجريد (Stripping) على الهواتف والمنصات',
    impactAr: 'ضروري عند التصدير إلى Android / iOS / WebGL مع تفعيل IL2CPP.',
  },
  {
    feature: 'روابط Subgraph عند التحميل الأول',
    v1_7: 'خلل مسجل يؤدي أحياناً لفقدان روابط منافذ المخطط الفرعي عند الفتح الأول',
    v1_8: 'تم إصلاح خلل فك تسلسل منافذ SubgraphUnit',
    impactAr: 'يوصى بالترقية إلى 1.8.0 في المشاريع متعددة المخططات الفرعية داخل Unity 2021.3.',
  },
];

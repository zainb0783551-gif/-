import {
  DetectedPackageEntry,
  KnowledgeNodeDefinition,
  UnityBridgeReport,
  UnityProjectProfile,
} from '../types/uvs';

export function createDefaultProjectProfile(projectName = 'مشروع Unity جديد'): UnityProjectProfile {
  return {
    projectName,
    unityVersion: '2021.3 LTS',
    unityVersionSource: 'default_target',
    vsPackageVersion: null,
    vsVersionSource: 'unconfigured',
    installedPackages: [],
    availableAssemblies: [
      'UnityEngine.CoreModule',
      'UnityEngine.PhysicsModule',
      'UnityEngine.Physics2DModule',
      'UnityEngine.AnimationModule',
      'UnityEngine.InputLegacyModule',
      'Unity.VisualScripting.Core',
      'Unity.VisualScripting.Flow',
    ],
    notesAr: [
      'لم يتم تحديد إصدار حزمة Visual Scripting المثبت فعلياً بعد. ارفع ملف Packages/packages-lock.json أو تقرير UnityBridge أو حدد الإصدار يدوياً.',
    ],
  };
}

/**
 * Compares two semantic version strings (e.g., "1.7.8" vs "1.8.0").
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const clean = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const pa = clean(a);
  const pb = clean(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

export function normalizePackageVersion(raw: string): string | null {
  const trimmed = raw.trim();
  const semverMatch = trimmed.match(/(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/);
  return semverMatch ? semverMatch[1] : null;
}

/**
 * Parses Unity's `Packages/manifest.json`
 */
export function parseManifestJson(
  rawJson: string,
  baseProfile: UnityProjectProfile
): UnityProjectProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('ملف manifest.json غير صالح: تعذر قراءة بنية JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || !('dependencies' in parsed)) {
    throw new Error('ملف manifest.json يفتقر إلى حقل dependencies الأساسي.');
  }

  const deps = (parsed as { dependencies: Record<string, unknown> }).dependencies;
  if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
    throw new Error('حقل dependencies في manifest.json ليس كائناً صالحاً.');
  }

  const mergedPackages = new Map<string, DetectedPackageEntry>();
  for (const pkg of baseProfile.installedPackages) {
    mergedPackages.set(pkg.name, pkg);
  }

  let detectedVsVersion = baseProfile.vsPackageVersion;
  let vsVersionSource = baseProfile.vsVersionSource;
  const notes = [...baseProfile.notesAr.filter((n) => !n.includes('لم يتم تحديد إصدار حزمة'))];

  for (const [name, rawVer] of Object.entries(deps)) {
    if (typeof rawVer !== 'string') continue;
    const cleanVer = normalizePackageVersion(rawVer) ?? rawVer;
    const existing = mergedPackages.get(name);
    // Do not overwrite lockfile/unity_bridge resolution with loose manifest entry
    if (!existing || existing.source === 'manifest' || existing.source === 'manual') {
      mergedPackages.set(name, {
        name,
        version: cleanVer,
        source: 'manifest',
        resolvedSource: rawVer,
      });
    }

    if (name === 'com.unity.visualscripting') {
      const normalized = normalizePackageVersion(rawVer);
      if (
        normalized &&
        vsVersionSource !== 'packages_lock_json' &&
        vsVersionSource !== 'unity_bridge_report'
      ) {
        detectedVsVersion = normalized;
        vsVersionSource = 'manifest_json';
        notes.push(
          `تم رصد com.unity.visualscripting (${normalized}) من manifest.json؛ يُنصح برفع packages-lock.json أو تقرير UnityBridge لتأكيد الإصدار المثبت فعلياً.`
        );
      }
    }
  }

  if (!deps['com.unity.visualscripting'] && vsVersionSource === 'unconfigured') {
    notes.push(
      'تنبيه: لم يتم العثور على com.unity.visualscripting صراحةً في manifest.json (قد تكون مضافة كاعتمادية فرعية في packages-lock.json أو غير مثبتة).'
    );
  }

  return {
    ...baseProfile,
    vsPackageVersion: detectedVsVersion,
    vsVersionSource,
    installedPackages: Array.from(mergedPackages.values()),
    detectedAt: new Date().toISOString(),
    notesAr: notes,
  };
}

/**
 * Parses Unity's `Packages/packages-lock.json` (authoritative resolved package versions)
 */
export function parsePackagesLockJson(
  rawJson: string,
  baseProfile: UnityProjectProfile
): UnityProjectProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('ملف packages-lock.json غير صالح: تعذر قراءة بنية JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || !('dependencies' in parsed)) {
    throw new Error('ملف packages-lock.json يفتقر إلى كائن dependencies.');
  }

  const deps = (
    parsed as {
      dependencies: Record<string, { version?: string; source?: string }>;
    }
  ).dependencies;

  if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
    throw new Error('بنية dependencies داخل packages-lock.json غير صالحة.');
  }

  const mergedPackages = new Map<string, DetectedPackageEntry>();
  for (const pkg of baseProfile.installedPackages) {
    mergedPackages.set(pkg.name, pkg);
  }

  let detectedVsVersion = baseProfile.vsPackageVersion;
  let vsVersionSource = baseProfile.vsVersionSource;
  const notes = [...baseProfile.notesAr.filter((n) => !n.includes('لم يتم تحديد إصدار حزمة'))];

  for (const [name, info] of Object.entries(deps)) {
    if (!info || typeof info !== 'object' || typeof info.version !== 'string') continue;
    const cleanVer = normalizePackageVersion(info.version) ?? info.version;
    mergedPackages.set(name, {
      name,
      version: cleanVer,
      source: 'lockfile',
      resolvedSource: info.source ?? 'registry',
    });

    if (name === 'com.unity.visualscripting') {
      const normalized = normalizePackageVersion(info.version);
      if (normalized && vsVersionSource !== 'unity_bridge_report') {
        detectedVsVersion = normalized;
        vsVersionSource = 'packages_lock_json';
        notes.push(
          `تم تأكيد الإصدار الفعلي المثبت لحزمة com.unity.visualscripting (${normalized}) من ملف القفل packages-lock.json.`
        );
      }
    }
  }

  return {
    ...baseProfile,
    vsPackageVersion: detectedVsVersion,
    vsVersionSource,
    installedPackages: Array.from(mergedPackages.values()),
    detectedAt: new Date().toISOString(),
    notesAr: notes,
  };
}

/**
 * Parses `ProjectSettings/ProjectVersion.txt`
 */
export function parseProjectVersionTxt(
  rawText: string,
  baseProfile: UnityProjectProfile
): UnityProjectProfile {
  const match = rawText.match(/m_EditorVersion:\s*([^\r\n]+)/);
  if (!match || !match[1]) {
    throw new Error('ملف ProjectVersion.txt لا يحتوي على السطر القياسي m_EditorVersion.');
  }

  const editorVersion = match[1].trim();
  const notes = [...baseProfile.notesAr];

  if (!editorVersion.startsWith('2021.3.')) {
    notes.push(
      `تحذير توافق المحرك: إصدار المشروع المكتشف هو (${editorVersion}) بينما الإصدار المستهدف للمنصة هو Unity 2021.3 LTS.`
    );
  } else {
    notes.push(`تم التحقق من إصدار محرك Unity (${editorVersion}) ضمن سلسلة 2021.3 LTS.`);
  }

  return {
    ...baseProfile,
    unityVersion: editorVersion,
    unityVersionSource: 'project_version_txt',
    detectedAt: new Date().toISOString(),
    notesAr: notes,
  };
}

/**
 * Validates and parses a JSON report generated by the UnityBridge Editor companion tool.
 */
export function parseUnityBridgeReport(
  rawJson: string,
  baseProfile: UnityProjectProfile
): {
  report: UnityBridgeReport;
  updatedProfile: UnityProjectProfile;
  extractedNodes: KnowledgeNodeDefinition[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('تقرير UnityBridge غير صالح: الملف ليس JSON سليم البنية.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('تقرير UnityBridge غير صالح: الجذر ليس كائناً.');
  }

  const candidate = parsed as Partial<UnityBridgeReport>;

  if (candidate.schemaIdentifier !== 'uvs-unity-bridge-report-v1') {
    throw new Error(
      `تقرير UnityBridge مرفوض: معرّف المخطط (schemaIdentifier) مفقود أو غير مدعوم (${String(
        candidate.schemaIdentifier ?? 'غير موجود'
      )}).`
    );
  }

  if (
    typeof candidate.unityVersion !== 'string' ||
    !candidate.unityVersion.trim() ||
    typeof candidate.visualScriptingVersion !== 'string' ||
    !normalizePackageVersion(candidate.visualScriptingVersion)
  ) {
    throw new Error(
      'تقرير UnityBridge غير مكتمل: يجب توفر unityVersion و visualScriptingVersion بصيغة صحيحة.'
    );
  }

  if (!Array.isArray(candidate.scannedUnits)) {
    throw new Error('تقرير UnityBridge غير صالح: حقل scannedUnits مفقود أو ليس مصفوفة.');
  }

  const vsVer = normalizePackageVersion(candidate.visualScriptingVersion)!;
  const extractedNodes: KnowledgeNodeDefinition[] = [];

  for (const unit of candidate.scannedUnits) {
    if (
      !unit ||
      typeof unit.unitClassName !== 'string' ||
      !unit.unitClassName.trim() ||
      typeof unit.displayName !== 'string' ||
      !Array.isArray(unit.controlInputs) ||
      !Array.isArray(unit.controlOutputs) ||
      !Array.isArray(unit.valueInputs) ||
      !Array.isArray(unit.valueOutputs)
    ) {
      throw new Error(
        `تقرير UnityBridge يحتوي على بيانات عقدة تالفة أو ناقصة المنافذ (${String(
          unit?.unitClassName ?? 'بدون اسم'
        )}).`
      );
    }

    const sanitizedId = `uvs.scanned.${unit.unitClassName
      .replace(/[^a-zA-Z0-9._]/g, '_')
      .toLowerCase()}`;

    extractedNodes.push({
      id: sanitizedId,
      unitClassName: unit.unitClassName,
      namespace: unit.namespace || 'Global',
      assembly: unit.assembly || 'Assembly-CSharp',
      displayName: unit.displayName,
      category: unit.category || (unit.isCustomUnit ? 'Custom' : 'Scanned'),
      originKind: unit.isCustomUnit ? 'custom' : 'builtin',
      controlInputs: unit.controlInputs.map((p) => ({
        key: p.key,
        label: p.label || p.key,
        kind: 'control',
        direction: 'input',
        descriptionAr: `منفذ تدفق مستخرج من فحص محرر Unity (${p.key}).`,
      })),
      controlOutputs: unit.controlOutputs.map((p) => ({
        key: p.key,
        label: p.label || p.key,
        kind: 'control',
        direction: 'output',
        descriptionAr: `مخرج تدفق مستخرج من فحص محرر Unity (${p.key}).`,
      })),
      valueInputs: unit.valueInputs.map((p) => ({
        key: p.key,
        label: p.label || p.key,
        kind: 'value',
        direction: 'input',
        dataType: p.dataType || 'System.Object',
        required: !p.hasDefaultValue,
        descriptionAr: `مدخل بيانات (${p.dataType}) مستخرج من فحص محرر Unity.`,
      })),
      valueOutputs: unit.valueOutputs.map((p) => ({
        key: p.key,
        label: p.label || p.key,
        kind: 'value',
        direction: 'output',
        dataType: p.dataType || 'System.Object',
        descriptionAr: `مخرج بيانات (${p.dataType}) مستخرج من فحص محرر Unity.`,
      })),
      requiredComponents: [],
      requiredPackages: ['com.unity.visualscripting'],
      minVsVersion: vsVer,
      versionChanges: [],
      verificationStatus: 'verified',
      sourceType: 'unity_editor_scan',
      sourceDocUrl: 'unity-editor://UnityBridge/LocalProjectScan',
      lastVerifiedAt: (candidate.generatedAtUtc || new Date().toISOString()).slice(0, 10),
      summaryAr: unit.isCustomUnit
        ? `وحدة مخصصة (Custom C# Unit) تم التحقق من وجودها فعلياً داخل مشروع Unity (${unit.assembly}).`
        : `وحدة تم استخراج منافذها مباشرة من مشروع Unity (${candidate.unityVersion}).`,
      usageConditionsAr: `تم فحصها محلياً عبر UnityBridge بتاريخ ${(
        candidate.generatedAtUtc || ''
      ).slice(0, 10)}.`,
      unityBridgeImportSupported: unit.isCustomUnit,
    });
  }

  const installedPackages: DetectedPackageEntry[] = Array.isArray(candidate.installedPackages)
    ? candidate.installedPackages
        .filter((p) => p && typeof p.name === 'string' && typeof p.version === 'string')
        .map((p) => ({
          name: p.name,
          version: normalizePackageVersion(p.version) ?? p.version,
          source: 'unity_bridge',
          resolvedSource: p.source,
        }))
    : baseProfile.installedPackages;

  if (!installedPackages.some((p) => p.name === 'com.unity.visualscripting')) {
    installedPackages.push({
      name: 'com.unity.visualscripting',
      version: vsVer,
      source: 'unity_bridge',
    });
  }

  const updatedProfile: UnityProjectProfile = {
    ...baseProfile,
    unityVersion: candidate.unityVersion.trim(),
    unityVersionSource: 'unity_bridge_report',
    vsPackageVersion: vsVer,
    vsVersionSource: 'unity_bridge_report',
    installedPackages,
    availableAssemblies: Array.isArray(candidate.assembliesScanned)
      ? candidate.assembliesScanned
      : baseProfile.availableAssemblies,
    detectedAt: new Date().toISOString(),
    notesAr: [
      `تم التحقق الفعلي من بيئة المشروع عبر تقرير UnityBridge: المحرك ${candidate.unityVersion}، حزمة Visual Scripting ${vsVer}، وإجمالي ${extractedNodes.length} وحدة مفحوصة.`,
    ],
  };

  return {
    report: candidate as UnityBridgeReport,
    updatedProfile,
    extractedNodes,
  };
}

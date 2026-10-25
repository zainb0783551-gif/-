/**
 * Core Domain Types for Unity Visual Scripting Expert
 * Target Engine Baseline: Unity 2021.3 LTS
 * Strict separation of UI, Knowledge Base, Problem Analysis, Independent Validator, and UnityBridge Exporter.
 */

export enum VerificationStatus {
  VERIFIED = 'verified',
  PARTIALLY_VERIFIED = 'partially_verified',
  UNVERIFIED = 'unverified',
  INVALID = 'invalid',
}

export type NodeOriginKind =
  | 'builtin'
  | 'reflection'
  | 'custom'
  | 'external_package';

export type VariableScope =
  | 'Flow'
  | 'Graph'
  | 'Object'
  | 'Scene'
  | 'Application'
  | 'Saved';

export type PortKind = 'control' | 'value';
export type PortDirection = 'input' | 'output';

export type VsVersionDetectionSource =
  | 'unconfigured'
  | 'manual'
  | 'manifest_json'
  | 'packages_lock_json'
  | 'unity_bridge_report';

export interface KnowledgePortDefinition {
  key: string;
  label: string;
  kind: PortKind;
  direction: PortDirection;
  /** Exact .NET / Unity type name for value ports (e.g., System.Single, UnityEngine.Vector3, System.Object) */
  dataType?: string;
  defaultValue?: string | number | boolean | null;
  allowsNull?: boolean;
  required?: boolean;
  descriptionAr: string;
}

export interface InlineFieldDefinition {
  key: string;
  label: string;
  dataType: string;
  options?: string[];
  defaultValue: string | number | boolean;
  descriptionAr: string;
}

export interface ReflectionMemberMetadata {
  targetType: string;
  memberName: string;
  memberKind: 'Method' | 'PropertyGet' | 'PropertySet' | 'Constructor';
  parameterTypes?: string[];
  returnType?: string;
  isStatic: boolean;
}

export interface VersionChangeNote {
  version: string;
  changeType: 'introduced' | 'modified' | 'behavior_fix' | 'deprecated';
  noteAr: string;
}

export interface KnowledgeNodeDefinition {
  /** Stable identifier used in graph specifications (e.g. "uvs.event.start", "uvs.reflect.rigidbody.add_force") */
  id: string;
  /** Exact C# Unit class in Unity.VisualScripting (e.g. "Unity.VisualScripting.Start", "Unity.VisualScripting.InvokeMember") */
  unitClassName: string;
  namespace: string;
  assembly: string;
  displayName: string;
  category: string;
  originKind: NodeOriginKind;
  reflectionMember?: ReflectionMemberMetadata;
  controlInputs: KnowledgePortDefinition[];
  controlOutputs: KnowledgePortDefinition[];
  valueInputs: KnowledgePortDefinition[];
  valueOutputs: KnowledgePortDefinition[];
  inlineFields?: InlineFieldDefinition[];
  /** Components required on the host or target GameObject */
  requiredComponents: string[];
  /** UPM packages required (e.g. ["com.unity.visualscripting", "com.unity.inputsystem"]) */
  requiredPackages: string[];
  /** Minimum supported com.unity.visualscripting version */
  minVsVersion: string;
  maxVsVersion?: string;
  /** True if this node yields execution (e.g. WaitForSecondsUnit) and requires parent Event coroutine=true */
  isCoroutineUnit?: boolean;
  /** True if this is an Event root node */
  isEventNode?: boolean;
  supportsCoroutineToggle?: boolean;
  variableScopesSupported?: VariableScope[];
  versionChanges: VersionChangeNote[];
  verificationStatus: 'verified' | 'partially_verified' | 'unverified';
  sourceType: 'unity_official_docs' | 'unity_editor_scan' | 'user_imported_doc';
  sourceDocUrl: string;
  lastVerifiedAt: string;
  summaryAr: string;
  usageConditionsAr: string;
  /** Whether our UnityBridge C# importer has an explicit verified builder for this unit */
  unityBridgeImportSupported: boolean;
}

export interface DetectedPackageEntry {
  name: string;
  version: string;
  source: 'manifest' | 'lockfile' | 'unity_bridge' | 'manual';
  resolvedSource?: string;
}

export interface UnityProjectProfile {
  projectName: string;
  unityVersion: string;
  unityVersionSource: 'default_target' | 'project_version_txt' | 'unity_bridge_report' | 'manual';
  /** Null when not yet specified or detected — never silently assumed! */
  vsPackageVersion: string | null;
  vsVersionSource: VsVersionDetectionSource;
  installedPackages: DetectedPackageEntry[];
  availableAssemblies: string[];
  detectedAt?: string;
  notesAr: string[];
}

export interface VariableSpec {
  id: string;
  name: string;
  scope: VariableScope;
  dataType: string;
  defaultValue: string;
  descriptionAr: string;
}

export interface UVSNodeInstance {
  id: string;
  definitionId: string;
  /** Stored snapshot of class name so missing KB definitions are still diagnosable */
  unitClassName: string;
  titleOverride?: string;
  position: { x: number; y: number };
  groupId?: string;
  subgraphId?: string;
  /** Inline values for unconnected valueInputs or inline unit fields (e.g., variable name, coroutine toggle) */
  inlineValues: Record<string, string | number | boolean>;
  commentAr?: string;
}

export interface UVSConnection {
  id: string;
  kind: 'flow' | 'value';
  sourceNodeId: string;
  sourcePortKey: string;
  targetNodeId: string;
  targetPortKey: string;
  /** Optional annotation explaining the purpose of this connection */
  explanationAr?: string;
}

export interface UVSGroup {
  id: string;
  title: string;
  descriptionAr: string;
  bounds: { x: number; y: number; width: number; height: number };
  nodeIds: string[];
}

export interface UVSSubgraphSpec {
  id: string;
  name: string;
  purposeAr: string;
  inputs: { key: string; kind: PortKind; dataType?: string; label: string }[];
  outputs: { key: string; kind: PortKind; dataType?: string; label: string }[];
  nodeIds: string[];
}

export interface UVSGraphSpec {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  descriptionAr: string;
  createdAt: string;
  updatedAt: string;
  targetUnityVersion: string;
  targetVsVersion: string | null;
  variables: VariableSpec[];
  groups: UVSGroup[];
  subgraphs: UVSSubgraphSpec[];
  nodes: UVSNodeInstance[];
  connections: UVSConnection[];
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationCategory =
  | 'version_profile'
  | 'node_existence'
  | 'package_dependency'
  | 'port_compatibility'
  | 'flow_value_separation'
  | 'variable_integrity'
  | 'required_component'
  | 'execution_path'
  | 'loop_or_coroutine_hazard'
  | 'undocumented_api';

export interface ValidationIssue {
  id: string;
  code: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  titleAr: string;
  detailAr: string;
  remediationAr: string;
  nodeId?: string;
  connectionId?: string;
}

export interface ValidationReport {
  reportId: string;
  validatedAt: string;
  overallStatus: VerificationStatus;
  /** Distinguishes static structural soundness from runtime behavioral guarantees */
  structuralStatus: 'valid' | 'warnings_only' | 'invalid';
  runtimeRiskStatus: 'low_risk' | 'needs_playmode_test' | 'high_risk';
  /** Explicitly separates theoretical KB validation vs live Unity Editor scan verification */
  verificationBasis: 'unity_editor_scan_backed' | 'official_docs_theoretical' | 'unverified_profile';
  unityBridgeImportable: boolean;
  unityBridgeImportReasonAr: string;
  requiredComponentsSummary: string[];
  requiredPackagesSummary: string[];
  counts: {
    errors: number;
    warnings: number;
    infos: number;
    verifiedNodes: number;
    unverifiedNodes: number;
    missingNodes: number;
  };
  issues: ValidationIssue[];
}

/** 10-Stage Structured Problem Analysis Output (Section 5) */
export interface ProblemAnalysisReport {
  id: string;
  createdAt: string;
  problemSummaryInput: string;
  /** 1. تحليل الهدف والسلوك المطلوب */
  goalAndBehaviorAr: {
    objective: string;
    expectedRuntimeBehavior: string;
    canSolvePurelyInVisualScripting: boolean;
    limitationExplanationAr?: string;
  };
  /** 2. تحديد الأحداث والشروط والمدخلات والمخرجات */
  eventsConditionsIO: {
    events: string[];
    conditions: string[];
    inputs: string[];
    outputs: string[];
  };
  /** 3. تقسيم الأنظمة المعقدة إلى مخططات فرعية */
  subgraphDecomposition: {
    name: string;
    responsibilityAr: string;
    triggers: string[];
  }[];
  /** 4. تحديد المتغيرات ونطاقاتها وأنواعها */
  variablesPlan: VariableSpec[];
  /** 5. اختيار العقد من قاعدة المعرفة المتاحة فقط */
  selectedNodesRationale: {
    definitionId: string;
    unitClassName: string;
    originKind: NodeOriginKind;
    reasonAr: string;
  }[];
  /** 6. تحديد كل وصلة بين المنافذ */
  explicitPortWiringPlan: {
    kind: 'flow' | 'value';
    from: string;
    to: string;
    purposeAr: string;
  }[];
  /** 7. تحليل الحالات الاستثنائية وتعارضات التنفيذ */
  edgeCasesAndConflictsAr: string[];
  /** 8. اقتراح بدائل موثقة عند تعذر تنفيذ المسار الأصلي */
  documentedAlternativesAr: {
    scenarioAr: string;
    alternativeApproachAr: string;
    requiresCustomCSharpUnit: boolean;
  }[];
  /** 9. توضيح ما يحتاج إلى مكونات أو إعدادات خارجية */
  externalRequirements: {
    components: string[];
    projectSettingsAr: string[];
    packages: string[];
  };
  /** 10. إنشاء خطة اختبار للتحقق من صحة الحل */
  testPlanAr: {
    stepNumber: number;
    actionAr: string;
    expectedResultAr: string;
    failureCheckAr: string;
  }[];
}

/** Schema of the JSON report exported by UnityBridge inside Unity 2021.3 Editor */
export interface UnityBridgeScannedUnit {
  unitClassName: string;
  namespace: string;
  assembly: string;
  displayName: string;
  category: string;
  isCustomUnit: boolean;
  controlInputs: { key: string; label: string }[];
  controlOutputs: { key: string; label: string }[];
  valueInputs: { key: string; label: string; dataType: string; hasDefaultValue: boolean }[];
  valueOutputs: { key: string; label: string; dataType: string }[];
}

export interface UnityBridgeReport {
  schemaIdentifier: 'uvs-unity-bridge-report-v1';
  generatedAtUtc: string;
  unityVersion: string;
  visualScriptingVersion: string;
  renderPipeline: string;
  activeInputHandling: string;
  installedPackages: { name: string; version: string; source: string }[];
  assembliesScanned: string[];
  scannedUnits: UnityBridgeScannedUnit[];
}

export interface SavedProjectRecord {
  id: string;
  name: string;
  descriptionAr: string;
  createdAt: string;
  updatedAt: string;
  profile: UnityProjectProfile;
  graph: UVSGraphSpec;
  analysis?: ProblemAnalysisReport | null;
  lastValidation?: ValidationReport | null;
}

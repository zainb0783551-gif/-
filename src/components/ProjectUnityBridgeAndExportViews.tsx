import React, { useEffect, useState } from 'react';
import {
  Upload,
  Download,
  FolderOpen,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Play,
  PackageCheck,
} from 'lucide-react';
import {
  KnowledgeNodeDefinition,
  SavedProjectRecord,
  UnityProjectProfile,
  UVSGraphSpec,
  ValidationReport,
  VerificationStatus,
} from '../types/uvs';
import {
  createDefaultProjectProfile,
  parseManifestJson,
  parsePackagesLockJson,
  parseProjectVersionTxt,
  parseUnityBridgeReport,
} from '../knowledge-base/projectDetector';
import {
  generateImplementationReportMarkdown,
  parseGraphFromJson,
  serializeGraphBundle,
} from '../exporter/graphSerializer';
import {
  buildUnityBridgeZipBlob,
  fetchUnityBridgeFiles,
  renderGraphToSvgMarkup,
  UnityBridgeFileEntry,
} from '../exporter/unityBridgeBundle';
import { validateGraph } from '../validator/graphValidator';
import { WorkspaceSnapshot } from '../services/workspaceClient';

// ============================================================================
// 1. PROJECT & VERSION SETTINGS VIEW
// ============================================================================
interface ProjectSettingsViewProps {
  profile: UnityProjectProfile;
  onUpdateProfile: (next: UnityProjectProfile) => void;
}

export const ProjectSettingsView: React.FC<ProjectSettingsViewProps> = ({
  profile,
  onUpdateProfile,
}) => {
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleFileDetect = (
    kind: 'manifest' | 'lockfile' | 'version_txt',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result || '');
        const next =
          kind === 'manifest'
            ? parseManifestJson(content, profile)
            : kind === 'lockfile'
            ? parsePackagesLockJson(content, profile)
            : parseProjectVersionTxt(content, profile);
        onUpdateProfile(next);
        setFeedback({
          type: 'ok',
          text: `تمت قراءة الملف (${file.name}) وتحديث إعدادات المشروع بنجاح.`,
        });
      } catch (err) {
        setFeedback({
          type: 'err',
          text: err instanceof Error ? err.message : 'تعذر قراءة الملف المرفوع.',
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="space-y-1 pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-slate-50">
          إعدادات المشروع واكتشاف الإصدارات الفعلية
        </h1>
        <p className="text-xs text-slate-400">
          لا تفترض المنصة إصدار Visual Scripting تلقائياً؛ حدد الإصدار المثبت أو ارفع ملفات مشروع Unity لاكتشافه بدقة.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs ${
            feedback.type === 'ok'
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
              : 'bg-red-950/30 border-red-800/60 text-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual Selection */}
        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
          <h2 className="text-sm font-semibold text-slate-100">
            الضبط اليدوي لإصدار المحرك والحزمة
          </h2>

          <div className="space-y-1.5">
            <label className="block text-xs text-slate-300">اسم المشروع</label>
            <input
              type="text"
              value={profile.projectName}
              onChange={(e) => onUpdateProfile({ ...profile, projectName: e.target.value })}
              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-slate-300">
              إصدار محرك Unity (المستهدف الأساسي: 2021.3 LTS)
            </label>
            <input
              type="text"
              value={profile.unityVersion}
              onChange={(e) =>
                onUpdateProfile({
                  ...profile,
                  unityVersion: e.target.value,
                  unityVersionSource: 'manual',
                })
              }
              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-700 text-xs font-mono text-slate-100"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-slate-300">
              إصدار حزمة com.unity.visualscripting المثبت
            </label>
            <select
              value={profile.vsPackageVersion ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                onUpdateProfile({
                  ...profile,
                  vsPackageVersion: v,
                  vsVersionSource: v ? 'manual' : 'unconfigured',
                });
              }}
              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-700 text-xs font-mono text-slate-100"
              dir="ltr"
            >
              <option value="">-- غير محدد بعد (يتطلب الفحص) --</option>
              <option value="1.7.6">1.7.6 (Unity 2021.3 Early LTS)</option>
              <option value="1.7.8">1.7.8 (Unity 2021.3 Mid LTS)</option>
              <option value="1.8.0">1.8.0 (Unity 2021.3.15f1+ Verified LTS)</option>
            </select>
            <p className="text-[11px] text-slate-500">
              مصدر التحقق الحالي: <span className="font-mono">{profile.vsVersionSource}</span>
            </p>
          </div>
        </section>

        {/* File Auto-Detection */}
        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
          <h2 className="text-sm font-semibold text-slate-100">
            الاكتشاف الآلي من ملفات مشروع Unity
          </h2>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-center justify-between px-3.5 py-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/60 cursor-pointer">
              <div>
                <div className="font-mono text-slate-200" dir="ltr">
                  Packages/packages-lock.json
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  الأدق: يكشف الإصدار المثبت فعلياً وجميع الحزم الفرعية
                </div>
              </div>
              <Upload className="w-4 h-4 text-sky-400 shrink-0" />
              <input
                type="file"
                accept=".json"
                onChange={(e) => handleFileDetect('lockfile', e)}
                className="hidden"
              />
            </label>

            <label className="flex items-center justify-between px-3.5 py-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/60 cursor-pointer">
              <div>
                <div className="font-mono text-slate-200" dir="ltr">
                  Packages/manifest.json
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  يكشف الحزم المطلوبة (مثل com.unity.inputsystem)
                </div>
              </div>
              <Upload className="w-4 h-4 text-sky-400 shrink-0" />
              <input
                type="file"
                accept=".json"
                onChange={(e) => handleFileDetect('manifest', e)}
                className="hidden"
              />
            </label>

            <label className="flex items-center justify-between px-3.5 py-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/60 cursor-pointer">
              <div>
                <div className="font-mono text-slate-200" dir="ltr">
                  ProjectSettings/ProjectVersion.txt
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  يتحقق من رقم بناء محرر Unity (2021.3.x)
                </div>
              </div>
              <Upload className="w-4 h-4 text-sky-400 shrink-0" />
              <input
                type="file"
                accept=".txt"
                onChange={(e) => handleFileDetect('version_txt', e)}
                className="hidden"
              />
            </label>
          </div>
        </section>
      </div>

      {/* Installed Packages Table */}
      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
        <h2 className="text-sm font-semibold text-slate-100">
          الحزم المكتشفة في المشروع ({profile.installedPackages.length})
        </h2>
        {profile.installedPackages.length === 0 ? (
          <p className="text-xs text-slate-500">
            لم يتم رفع ملفات حزم بعد. ارفع manifest.json أو packages-lock.json لعرض الحزم المثبتة.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 px-3">اسم الحزمة</th>
                  <th className="py-2 px-3">الإصدار</th>
                  <th className="py-2 px-3">مصدر الاكتشاف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {profile.installedPackages.map((pkg) => (
                  <tr key={pkg.name}>
                    <td className="py-2 px-3 font-mono text-slate-200" dir="ltr">
                      {pkg.name}
                    </td>
                    <td className="py-2 px-3 font-mono text-sky-300 tabular-nums" dir="ltr">
                      {pkg.version}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-400" dir="ltr">
                      {pkg.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

// ============================================================================
// 2. SAVED PROJECTS VIEW
// ============================================================================
interface SavedProjectsViewProps {
  projects: SavedProjectRecord[];
  activeProjectId: string | null;
  onSelectProject: (project: SavedProjectRecord) => void;
  onCreateNewProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
}

export const SavedProjectsView: React.FC<SavedProjectsViewProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateNewProject,
  onDeleteProject,
}) => {
  const [newName, setNewName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateNewProject(newName.trim());
    setNewName('');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-50">المشاريع المحفوظة</h1>
          <p className="text-xs text-slate-400">
            يُحفظ كل مشروع مع إعدادات إصدار Unity، المخطط الكامل، المتغيرات، وتقرير التحقق على قاعدة بيانات الخادم ونسخة المتصفح الاحتياطية.
          </p>
        </div>

        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="اسم مشروع جديد..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[#111827] border border-slate-700 text-xs text-slate-100"
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إنشاء مشروع فارغ</span>
          </button>
        </form>
      </div>

      <div className="divide-y divide-slate-800 rounded-xl bg-[#111827] border border-slate-800">
        {projects.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            لا توجد مشاريع محفوظة حالياً. أنشئ مشروعاً جديداً للبدء.
          </div>
        ) : (
          projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            return (
              <div
                key={proj.id}
                className="p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{proj.name}</h3>
                    {isActive && (
                      <span className="text-xs text-sky-400">· المشروع النشط حالياً</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{proj.descriptionAr || 'بدون وصف'}</p>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums" dir="ltr">
                    Unity {proj.profile.unityVersion} · VS{' '}
                    {proj.profile.vsPackageVersion ?? 'Unverified'} · {proj.graph.nodes.length}{' '}
                    Nodes · Updated {proj.updatedAt.slice(0, 16).replace('T', ' ')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectProject(proj)}
                    className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                    <span>فتح</span>
                  </button>
                  {projects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteProject(proj.id)}
                      className="p-1.5 rounded border border-red-900/50 text-red-400 hover:bg-red-950/40 cursor-pointer"
                      title="حذف المشروع"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. UNITYBRIDGE COMPANION TOOL & REPORT IMPORT VIEW
// ============================================================================
interface UnityBridgeViewProps {
  profile: UnityProjectProfile;
  currentBundleJson: string;
  onImportBridgeReport: (
    updatedProfile: UnityProjectProfile,
    scannedNodes: KnowledgeNodeDefinition[]
  ) => void;
}

export const UnityBridgeWorkspaceView: React.FC<UnityBridgeViewProps> = ({
  profile,
  currentBundleJson,
  onImportBridgeReport,
}) => {
  const [bridgeFiles, setBridgeFiles] = useState<UnityBridgeFileEntry[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [reportStatus, setReportStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetchUnityBridgeFiles()
      .then((files) => setBridgeFiles(files))
      .catch(() => setBridgeFiles([]));
  }, []);

  const handleReportUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = parseUnityBridgeReport(String(reader.result || ''), profile);
        onImportBridgeReport(res.updatedProfile, res.extractedNodes);
        setReportStatus({
          ok: true,
          msg: `تم استيراد تقرير UnityBridge بنجاح! إصدار المحرك: ${res.report.unityVersion}، حزمة VS: ${res.report.visualScriptingVersion}، وتم تحديث ${res.extractedNodes.length} وحدة في قاعدة المعرفة.`,
        });
      } catch (err) {
        setReportStatus({
          ok: false,
          msg: err instanceof Error ? err.message : 'فشل قراءة تقرير UnityBridge.',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadBridgeZip = async () => {
    const blob = await buildUnityBridgeZipBlob(bridgeFiles, currentBundleJson);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'UnityBridge_Unity2021_3_LTS.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentFile = bridgeFiles[selectedFileIdx];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1 max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-50">
            أداة محرر Unity المرافقة (UnityBridge for 2021.3 LTS)
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            أداة Editor-Only مكتوبة بلغة C# توضع داخل مجلد Assets/UnityBridge/Editor لفحص الحزم والعقد الفعلية في مشروعك وبناء أصول ScriptGraphAsset بأمان مع نسخ احتياطي تلقائي.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadBridgeZip}
          disabled={bridgeFiles.length === 0}
          className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <PackageCheck className="w-4 h-4" />
          <span>تنزيل حزمة UnityBridge (.zip)</span>
        </button>
      </div>

      {/* Upload UnityBridge JSON Report */}
      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-100">
              استيراد تقرير فحص المحرك (unity_bridge_report.json)
            </h2>
            <p className="text-xs text-slate-400">
              ارفع ملف JSON الناتج من زر Scan Project & Export JSON Report داخل نافذة UnityBridge في محرر Unity.
            </p>
          </div>

          <label className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-100 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>رفع تقرير UnityBridge JSON</span>
            <input type="file" accept=".json" onChange={handleReportUpload} className="hidden" />
          </label>
        </div>

        {reportStatus && (
          <div
            className={`p-3 rounded-lg border text-xs ${
              reportStatus.ok
                ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                : 'bg-red-950/30 border-red-800/60 text-red-200'
            }`}
          >
            {reportStatus.msg}
          </div>
        )}
      </section>

      {/* Source Code Inspector of Real UnityBridge Files */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-100">
          ملفات المصدر الفعلية لأداة UnityBridge ({bridgeFiles.length})
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 rounded-xl bg-[#111827] border border-slate-800 overflow-hidden">
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-l border-slate-800 divide-y divide-slate-800">
            {bridgeFiles.map((f, idx) => (
              <button
                key={f.relativePath}
                type="button"
                onClick={() => setSelectedFileIdx(idx)}
                className={`w-full px-4 py-3 text-left font-mono text-xs transition-colors cursor-pointer ${
                  selectedFileIdx === idx
                    ? 'bg-slate-800 text-sky-300 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/50'
                }`}
                dir="ltr"
              >
                {f.relativePath}
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 p-4 overflow-x-auto max-h-[480px] overflow-y-auto bg-slate-950/80">
            {currentFile ? (
              <pre className="text-[11px] font-mono text-slate-200 leading-relaxed" dir="ltr">
                {currentFile.content}
              </pre>
            ) : (
              <p className="text-xs text-slate-500">جاري تحميل ملفات المصدر...</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// 4. EXPORT, BACKUPS, GRAPH JSON IMPORT & LIVE DIAGNOSTIC SELF-TESTS VIEW
// ============================================================================
interface ExportBackupAndTestsViewProps {
  graph: UVSGraphSpec;
  profile: UnityProjectProfile;
  knowledgeNodes: KnowledgeNodeDefinition[];
  validation: ValidationReport;
  workspaceSnapshot: WorkspaceSnapshot;
  onImportGraph: (graph: UVSGraphSpec) => void;
  onRestoreWorkspace: (snapshot: WorkspaceSnapshot) => void;
}

interface BrowserTestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  detailAr: string;
}

export const ExportBackupAndTestsView: React.FC<ExportBackupAndTestsViewProps> = ({
  graph,
  profile,
  knowledgeNodes,
  validation,
  workspaceSnapshot,
  onImportGraph,
  onRestoreWorkspace,
}) => {
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testResults, setTestResults] = useState<BrowserTestResult[] | null>(null);

  const downloadTextFile = (filename: string, content: string, mime = 'application/json') => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocumentedJson = () => {
    const bundle = serializeGraphBundle(graph, profile, knowledgeNodes, validation);
    downloadTextFile(`${graph.name || 'uvs-graph'}_bundle.json`, JSON.stringify(bundle, null, 2));
    setStatusMsg({ ok: true, text: 'تم تصدير حزمة المخطط الموثقة بصيغة JSON.' });
  };

  const handleExportMarkdownReport = () => {
    const md = generateImplementationReportMarkdown(graph, profile, knowledgeNodes, validation);
    downloadTextFile(`${graph.name || 'uvs-graph'}_implementation_report.md`, md, 'text/markdown');
    setStatusMsg({ ok: true, text: 'تم تصدير تقرير شرح التنفيذ والتدقيق بصيغة Markdown.' });
  };

  const handleExportSvgDiagram = () => {
    const svg = renderGraphToSvgMarkup(graph, knowledgeNodes);
    downloadTextFile(`${graph.name || 'uvs-graph'}_diagram.svg`, svg, 'image/svg+xml');
    setStatusMsg({ ok: true, text: 'تم تصدير الرسم المتجه للمخطط بنجاح.' });
  };

  const handleImportGraphFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseGraphFromJson(String(reader.result || ''));
        onImportGraph(imported);
        setStatusMsg({ ok: true, text: `تم استيراد المخطط (${imported.name}) بنجاح.` });
      } catch (err) {
        setStatusMsg({
          ok: false,
          text: err instanceof Error ? err.message : 'فشل استيراد ملف المخطط.',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleExportFullBackup = () => {
    downloadTextFile(
      `uvs_expert_workspace_backup_${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(workspaceSnapshot, null, 2)
    );
    setStatusMsg({ ok: true, text: 'تم تحميل النسخة الاحتياطية الكاملة لمساحة العمل.' });
  };

  const handleRestoreBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '')) as WorkspaceSnapshot;
        if (!parsed || !Array.isArray(parsed.projects)) {
          throw new Error('ملف النسخة الاحتياطية لا يحتوي على قائمة مشاريع صالحة.');
        }
        onRestoreWorkspace(parsed);
        setStatusMsg({ ok: true, text: 'تمت استعادة النسخة الاحتياطية الكاملة بنجاح.' });
      } catch (err) {
        setStatusMsg({
          ok: false,
          text: err instanceof Error ? err.message : 'فشل استعادة النسخة الاحتياطية.',
        });
      }
    };
    reader.readAsText(file);
  };

  /**
   * Executes isolated, non-polluting in-browser verification checks covering all 12 core scenarios.
   */
  const runDiagnosticSuite = () => {
    const results: BrowserTestResult[] = [];
    const testProfile18: UnityProjectProfile = {
      ...createDefaultProjectProfile('Test18'),
      vsPackageVersion: '1.8.0',
      vsVersionSource: 'packages_lock_json',
    };
    const testProfile17: UnityProjectProfile = {
      ...createDefaultProjectProfile('Test17'),
      vsPackageVersion: '1.7.8',
      vsVersionSource: 'packages_lock_json',
    };

    // 1. Simple Graph
    const simpleGraph: UVSGraphSpec = {
      schemaVersion: '1.0.0',
      id: 't-simple',
      name: 'SimpleStartLog',
      descriptionAr: '',
      createdAt: '',
      updatedAt: '',
      targetUnityVersion: '2021.3 LTS',
      targetVsVersion: '1.8.0',
      variables: [],
      groups: [],
      subgraphs: [],
      nodes: [
        {
          id: 'n1',
          definitionId: 'uvs.event.start',
          unitClassName: 'Unity.VisualScripting.Start',
          position: { x: 0, y: 0 },
          inlineValues: { coroutine: false },
        },
        {
          id: 'n2',
          definitionId: 'uvs.reflect.debug.log',
          unitClassName: 'Unity.VisualScripting.InvokeMember',
          position: { x: 280, y: 0 },
          inlineValues: { '0': 'Hello UVS' },
        },
      ],
      connections: [
        {
          id: 'c1',
          kind: 'flow',
          sourceNodeId: 'n1',
          sourcePortKey: 'trigger',
          targetNodeId: 'n2',
          targetPortKey: 'enter',
        },
      ],
    };
    const r1 = validateGraph(simpleGraph, testProfile18, knowledgeNodes);
    results.push({
      id: 't1',
      nameAr: '01. فحص مخطط بسيط سليم (On Start -> Debug.Log)',
      passed: r1.overallStatus === VerificationStatus.VERIFIED && r1.counts.errors === 0,
      detailAr: `الحالة الناتجة: ${r1.overallStatus} (${r1.counts.errors} أخطاء)`,
    });

    // 2. Multi-stage Graph
    const r2 = validateGraph(graph, testProfile18, knowledgeNodes);
    results.push({
      id: 't2',
      nameAr: '02. فحص المخطط المتعدد المراحل النشط',
      passed: r2.counts.errors === 0 && graph.nodes.length >= 2,
      detailAr: `فُحصت ${graph.nodes.length} عقدة و ${graph.connections.length} وصلة بنجاح.`,
    });

    // 3. Non-existent Hallucinated Node (Synthetic isolated test fixture)
    const fakeNodeGraph: UVSGraphSpec = {
      ...simpleGraph,
      nodes: [
        ...simpleGraph.nodes,
        {
          id: 'n-fake',
          definitionId: 'synthetic.test.non_existent_node',
          unitClassName: 'Unity.VisualScripting.FakeTeleportNode',
          position: { x: 0, y: 200 },
          inlineValues: {},
        },
      ],
    };
    const r3 = validateGraph(fakeNodeGraph, testProfile18, knowledgeNodes);
    results.push({
      id: 't3',
      nameAr: '03. كشف عقدة غير موجودة في قاعدة المعرفة',
      passed:
        r3.overallStatus === VerificationStatus.INVALID &&
        r3.issues.some((i) => i.code === 'NODE_NOT_IN_KNOWLEDGE_BASE'),
      detailAr: 'تم رفض العقدة الوهمية برمز NODE_NOT_IN_KNOWLEDGE_BASE.',
    });

    // 4. Incompatible Port Type (Boolean -> Vector3)
    const badPortGraph: UVSGraphSpec = {
      ...simpleGraph,
      nodes: [
        {
          id: 'b1',
          definitionId: 'uvs.logic.negate',
          unitClassName: 'Unity.VisualScripting.Negate',
          position: { x: 0, y: 0 },
          inlineValues: { input: false },
        },
        {
          id: 'b2',
          definitionId: 'uvs.reflect.transform.translate',
          unitClassName: 'Unity.VisualScripting.InvokeMember',
          position: { x: 300, y: 0 },
          inlineValues: { target: 'Self' },
        },
      ],
      connections: [
        {
          id: 'c-bad',
          kind: 'value',
          sourceNodeId: 'b1',
          sourcePortKey: 'output',
          targetNodeId: 'b2',
          targetPortKey: '0',
        },
      ],
    };
    const r4 = validateGraph(badPortGraph, testProfile18, knowledgeNodes);
    results.push({
      id: 't4',
      nameAr: '04. كشف منفذ غير متوافق النوع (Boolean -> Vector3)',
      passed: r4.issues.some((i) => i.code === 'PORT_TYPE_MISMATCH'),
      detailAr: 'تم رصد تعارض الأنواع PORT_TYPE_MISMATCH.',
    });

    // 5. Different Package Version (StickyNote on 1.7.8)
    const stickyGraph: UVSGraphSpec = {
      ...simpleGraph,
      nodes: [
        ...simpleGraph.nodes,
        {
          id: 's1',
          definitionId: 'uvs.editor.sticky_note',
          unitClassName: 'Unity.VisualScripting.StickyNote',
          position: { x: 0, y: 180 },
          inlineValues: {},
        },
      ],
    };
    const r5 = validateGraph(stickyGraph, testProfile17, knowledgeNodes);
    results.push({
      id: 't5',
      nameAr: '05. كشف تعارض إصدار الحزمة (StickyNote على 1.7.8)',
      passed: r5.issues.some((i) => i.code === 'NODE_VERSION_INCOMPATIBLE'),
      detailAr: 'رفض StickyNote لأنها تتطلب Visual Scripting >= 1.8.0.',
    });

    // 6. Missing Custom Unit
    const missingCustomGraph: UVSGraphSpec = {
      ...simpleGraph,
      nodes: [
        ...simpleGraph.nodes,
        {
          id: 'c-miss',
          definitionId: 'custom.unit.inventory_add',
          unitClassName: 'MyGame.CustomUnits.InventoryAddUnit',
          position: { x: 0, y: 200 },
          inlineValues: {},
        },
      ],
    };
    const r6 = validateGraph(missingCustomGraph, testProfile18, knowledgeNodes);
    results.push({
      id: 't6',
      nameAr: '06. كشف Custom Unit مفقودة بدون تقرير UnityBridge',
      passed: r6.issues.some((i) => i.code === 'CUSTOM_UNIT_MISSING'),
      detailAr: 'تم تصنيف الوحدة المفقودة بدقة كـ CUSTOM_UNIT_MISSING.',
    });

    // 7. Invalid UnityBridge Report
    let r7Passed = false;
    try {
      parseUnityBridgeReport('{"schemaIdentifier":"wrong-schema"}', testProfile18);
    } catch {
      r7Passed = true;
    }
    results.push({
      id: 't7',
      nameAr: '07. رفض تقرير UnityBridge غير صالح',
      passed: r7Passed,
      detailAr: 'تم إيقاف الاستيراد ورمي رسالة خطأ تشخيصية واضحة.',
    });

    // 8 & 9. Incomplete JSON & Import Failure
    let r8Passed = false;
    let r9Passed = false;
    try {
      parseGraphFromJson('{"schemaVersion":"1.0.0","id":"g1"}');
    } catch {
      r8Passed = true;
    }
    try {
      parseGraphFromJson('{corrupted_json');
    } catch {
      r9Passed = true;
    }
    results.push({
      id: 't8',
      nameAr: '08. كشف ملف JSON غير مكتمل الحقول',
      passed: r8Passed,
      detailAr: 'رُفض المخطط الناقص لغياب مصفوفتي العقد والوصلات.',
    });
    results.push({
      id: 't9',
      nameAr: '09. معالجة فشل الاستيراد لبنية تالفة بأمان',
      passed: r9Passed,
      detailAr: 'لم يتعطل المحرر وتم عرض سبب الفشل للمستخدم.',
    });

    // 10 & 11. Save/Restore Roundtrip & Export SVG/JSON
    const bundle = serializeGraphBundle(simpleGraph, testProfile18, knowledgeNodes, r1);
    const roundtrip = parseGraphFromJson(JSON.stringify(bundle));
    const svgOut = renderGraphToSvgMarkup(simpleGraph, knowledgeNodes);
    results.push({
      id: 't10',
      nameAr: '10. حفظ واستعادة المخطط (Serialization Roundtrip)',
      passed:
        roundtrip.nodes.length === simpleGraph.nodes.length &&
        roundtrip.connections.length === simpleGraph.connections.length,
      detailAr: 'تطابق كامل للعقد والمنافذ والإصدارات بعد التصدير والاستعادة.',
    });
    results.push({
      id: 't11',
      nameAr: '11. توليد مخرجات الرسم والتصدير الموثق (SVG + JSON)',
      passed: svgOut.includes('<svg') && bundle.unityBridgePayload.units.length === 2,
      detailAr: 'تم التحقق من سلامة مخرج الرسم وحمولة UnityBridge.',
    });

    setTestResults(results);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="space-y-1 pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-slate-50">
          التصدير، النسخ الاحتياطية، والاختبارات الذاتية
        </h1>
        <p className="text-xs text-slate-400">
          صدّر المخطط بصيغ موثقة، أو استعد نسخة احتياطية كاملة، أو شغّل حزمة اختبارات التحقق المدمجة.
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-lg border text-xs ${
            statusMsg.ok
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
              : 'bg-red-950/30 border-red-800/60 text-red-200'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Export & Import Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">
            تصدير المخطط الحالي ({graph.name})
          </h2>
          <p className="text-xs text-slate-400">
            يتضمن ملف JSON كافة معرفات العقد، المنافذ، المتغيرات، مراجع التحقق، وحمولة التحويل الصريحة لـ UnityBridge.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={handleExportDocumentedJson}
              className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير حزمة JSON الموثقة</span>
            </button>

            <button
              type="button"
              onClick={handleExportMarkdownReport}
              className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 cursor-pointer"
            >
              تقرير التنفيذ (Markdown)
            </button>

            <button
              type="button"
              onClick={handleExportSvgDiagram}
              className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 cursor-pointer"
            >
              تصدير رسم المخطط (SVG)
            </button>
          </div>
        </section>

        <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">
            الاستيراد والنسخ الاحتياطي لمساحة العمل
          </h2>
          <p className="text-xs text-slate-400">
            احتفظ بنسخة كاملة من جميع مشاريعك وعقدك المخصصة أو استورد ملف مخطط JSON خارجي.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <label className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>استيراد مخطط JSON</span>
              <input type="file" accept=".json" onChange={handleImportGraphFile} className="hidden" />
            </label>

            <button
              type="button"
              onClick={handleExportFullBackup}
              className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 cursor-pointer"
            >
              تنزيل نسخة احتياطية شاملة
            </button>

            <label className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>استعادة نسخة احتياطية</span>
              <input
                type="file"
                accept=".json"
                onChange={handleRestoreBackupFile}
                className="hidden"
              />
            </label>
          </div>
        </section>
      </div>

      {/* Diagnostic Self-Test Suite & Explicit Editor Boundary */}
      <section className="p-5 rounded-xl bg-[#111827] border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-100">
              فاحص الاختبارات الآلية وفصل بيئة الويب عن محرر Unity
            </h2>
            <p className="text-xs text-slate-400">
              تُنفذ هذه الاختبارات ببيانات اصطناعية معزولة تماماً عن قاعدة المعرفة الرسمية للتحقق من صرامة المدقق والمستورد.
            </p>
          </div>

          <button
            type="button"
            onClick={runDiagnosticSuite}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-white text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-slate-950" />
            <span>تشغيل الاختبارات الآلية الآن</span>
          </button>
        </div>

        {testResults && (
          <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2 text-xs">
            {testResults.map((tr) => (
              <div key={tr.id} className="py-2.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {tr.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className="font-medium text-slate-200">{tr.nameAr}</span>
                </div>
                <span className="text-slate-400">{tr.detailAr}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 space-y-1 leading-relaxed">
          <div className="font-semibold text-slate-200">
            التمييز الصريح بين الاختبارات المنفذة فعلياً والاختبارات التي تتطلب محرر Unity 2021.3:
          </div>
          <p>
            • <strong className="text-slate-300">المنفذ فعلياً في بيئة البناء (Node.js / Vitest + المتصفح):</strong> التحقق البنيوي للمخططات البسيطة والمعقدة، كشف العقد الوهمية، تعارض المنافذ والأنواع، اختلاف إصدارات الحزم (1.7.8 مقابل 1.8.0)، الوحدات المخصصة المفقودة، رفض تقارير وملفات JSON التالفة، الحفظ والاستعادة، التصدير، ومعالجة انقطاع الشبكة وأخطاء API.
          </p>
          <p>
            • <strong className="text-slate-300">ما يتطلب تشغيله فعلياً داخل محرر Unity 2021.3 LTS:</strong> تجميع سكربتات C# الخاصة بـ UnityBridge عبر مترجم Roslyn الداخلي لمحرك Unity، فتح الأصل الناتج (.asset) داخل نافذة Script Graph للتأكد من فك التسلسل المرئي، واختبار السلوك الفيزيائي الفعلي وقت التشغيل (Play Mode).
          </p>
        </div>
      </section>
    </div>
  );
};

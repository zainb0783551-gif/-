/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Menu,
  X,
  Home,
  Sliders,
  FolderKanban,
  FileSearch,
  Workflow,
  BookOpenText,
  ShieldAlert,
  Database,
  Cpu,
  DownloadCloud,
} from 'lucide-react';
import {
  KnowledgeNodeDefinition,
  ProblemAnalysisReport,
  SavedProjectRecord,
  UnityProjectProfile,
  UVSGraphSpec,
} from './types/uvs';
import { createDefaultProjectProfile } from './knowledge-base/projectDetector';
import { VERIFIED_PRESET_BLUEPRINTS, VerifiedPresetBlueprint } from './knowledge-base/presetTemplates';
import { mergeKnowledgeNodes } from './knowledge-base/registry';
import { validateGraph } from './validator/graphValidator';
import { serializeGraphBundle } from './exporter/graphSerializer';
import {
  deleteProjectFromServer,
  fetchWorkspaceState,
  requestProblemAnalysis,
  restoreWorkspaceOnServer,
  saveProjectToServer,
  syncCustomKnowledgeToServer,
  WorkspaceSnapshot,
} from './services/workspaceClient';
import { HomeProblemView } from './components/HomeProblemView';
import { GraphEditorView } from './components/GraphEditorView';
import {
  AnalysisTenStagesView,
  NodesAndWiringExplanationView,
} from './components/AnalysisAndExplanationViews';
import {
  KnowledgeBaseView,
  ValidatorDashboardView,
} from './components/ValidatorAndKnowledgeViews';
import {
  ExportBackupAndTestsView,
  ProjectSettingsView,
  SavedProjectsView,
  UnityBridgeWorkspaceView,
} from './components/ProjectUnityBridgeAndExportViews';

type WorkspaceSection =
  | 'home'
  | 'settings'
  | 'projects'
  | 'analysis'
  | 'editor'
  | 'explanation'
  | 'validator'
  | 'knowledge'
  | 'unity_bridge'
  | 'export';

const SIDEBAR_ITEMS: {
  id: WorkspaceSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'home', label: 'الرئيسية وإدخال المشكلة', icon: Home },
  { id: 'settings', label: 'إعدادات المشروع والإصدارات', icon: Sliders },
  { id: 'projects', label: 'المشاريع المحفوظة', icon: FolderKanban },
  { id: 'analysis', label: 'تحليل الحل (10 مراحل)', icon: FileSearch },
  { id: 'editor', label: 'محرر المخططات التفاعلي', icon: Workflow },
  { id: 'explanation', label: 'شرح العقد والتوصيلات', icon: BookOpenText },
  { id: 'validator', label: 'مدقق الأخطاء المستقل', icon: ShieldAlert },
  { id: 'knowledge', label: 'قاعدة المعرفة والبحث', icon: Database },
  { id: 'unity_bridge', label: 'استيراد تقارير UnityBridge', icon: Cpu },
  { id: 'export', label: 'التصدير والنسخ الاحتياطية', icon: DownloadCloud },
];

export default function App() {
  const initialPreset = VERIFIED_PRESET_BLUEPRINTS[0];

  const [activeSection, setActiveSection] = useState<WorkspaceSection>('home');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Persistent Workspace State
  const [projects, setProjects] = useState<SavedProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('proj-initial-jump');
  const [customKnowledgeNodes, setCustomKnowledgeNodes] = useState<KnowledgeNodeDefinition[]>([]);

  // Active Project Working State
  const [profile, setProfile] = useState<UnityProjectProfile>(() => ({
    ...createDefaultProjectProfile('مشروع القفز الفيزيائي التجريبي'),
    vsPackageVersion: '1.8.0',
    vsVersionSource: 'manual',
  }));
  const [graph, setGraph] = useState<UVSGraphSpec>(initialPreset.graph);
  const [analysis, setAnalysis] = useState<ProblemAnalysisReport | null>(initialPreset.analysis);

  // Undo / Redo Graph History
  const [historyPast, setHistoryPast] = useState<UVSGraphSpec[]>([]);
  const [historyFuture, setHistoryFuture] = useState<UVSGraphSpec[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Analysis Async State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const knowledgeNodes = useMemo(
    () => mergeKnowledgeNodes(customKnowledgeNodes),
    [customKnowledgeNodes]
  );

  // Independent Deterministic Validator (runs live on every graph/profile/KB update)
  const validation = useMemo(
    () => validateGraph(graph, profile, knowledgeNodes),
    [graph, profile, knowledgeNodes]
  );

  const currentBundleJson = useMemo(
    () =>
      JSON.stringify(
        serializeGraphBundle(graph, profile, knowledgeNodes, validation),
        null,
        2
      ),
    [graph, profile, knowledgeNodes, validation]
  );

  const workspaceSnapshot: WorkspaceSnapshot = useMemo(
    () => ({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      activeProjectId,
      customKnowledgeNodes,
      projects,
    }),
    [activeProjectId, customKnowledgeNodes, projects]
  );

  // Load workspace from backend (or offline cache fallback) on startup
  useEffect(() => {
    let mounted = true;
    fetchWorkspaceState()
      .then((snap) => {
        if (!mounted) return;
        setProjects(snap.projects);
        setCustomKnowledgeNodes(snap.customKnowledgeNodes ?? []);
        const current =
          snap.projects.find((p) => p.id === snap.activeProjectId) ?? snap.projects[0];
        if (current) {
          setActiveProjectId(current.id);
          setProfile(current.profile);
          setGraph(current.graph);
          setAnalysis(current.analysis ?? null);
        }
        if (snap.isOfflineFallback) {
          setStatusNotice('يعمل التطبيق حالياً على النسخة المحلية المحفوظة لعدم توفر الخادم.');
        }
      })
      .catch(() => {
        // Keep seeded local state cleanly
      })
      .finally(() => {
        if (mounted) setIsBooting(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateGraph = useCallback(
    (nextGraph: UVSGraphSpec, recordHistory = true) => {
      if (recordHistory) {
        setHistoryPast((prev) => [...prev.slice(-29), graph]);
        setHistoryFuture([]);
      }
      setGraph(nextGraph);
    },
    [graph]
  );

  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((fut) => [graph, ...fut]);
    setGraph(previous);
  }, [historyPast, graph]);

  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((fut) => fut.slice(1));
    setHistoryPast((prev) => [...prev, graph]);
    setGraph(next);
  }, [historyFuture, graph]);

  // Keyboard shortcuts for Undo / Redo inside editor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeSection !== 'editor') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSection, handleUndo, handleRedo]);

  const handleSaveActiveProject = async () => {
    const record: SavedProjectRecord = {
      id: activeProjectId,
      name: profile.projectName || graph.name || 'مشروع بدون عنوان',
      descriptionAr: graph.descriptionAr,
      createdAt:
        projects.find((p) => p.id === activeProjectId)?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profile,
      graph,
      analysis,
      lastValidation: validation,
    };

    const res = await saveProjectToServer(record, workspaceSnapshot);
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === res.project.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = res.project;
        return copy;
      }
      return [res.project, ...prev];
    });
    setStatusNotice(res.warningAr ?? 'تم حفظ المشروع والمخطط بنجاح.');
  };

  const handleSelectSavedProject = (proj: SavedProjectRecord) => {
    setActiveProjectId(proj.id);
    setProfile(proj.profile);
    setGraph(proj.graph);
    setAnalysis(proj.analysis ?? null);
    setHistoryPast([]);
    setHistoryFuture([]);
    setFocusedNodeId(null);
    setActiveSection('editor');
  };

  const handleCreateBlankProject = async (name: string) => {
    const newId = `proj-${Date.now().toString(36)}`;
    const newProfile = createDefaultProjectProfile(name);
    const blankGraph: UVSGraphSpec = {
      schemaVersion: '1.0.0',
      id: `graph-${Date.now().toString(36)}`,
      name: 'NewScriptGraph',
      descriptionAr: 'مخطط جديد جاهز للبناء.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetUnityVersion: '2021.3 LTS',
      targetVsVersion: null,
      variables: [],
      groups: [],
      subgraphs: [],
      nodes: [
        {
          id: 'n-start',
          definitionId: 'uvs.event.start',
          unitClassName: 'Unity.VisualScripting.Start',
          position: { x: 120, y: 140 },
          inlineValues: { coroutine: false },
        },
      ],
      connections: [],
    };

    const newProj: SavedProjectRecord = {
      id: newId,
      name,
      descriptionAr: blankGraph.descriptionAr,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profile: newProfile,
      graph: blankGraph,
      analysis: null,
      lastValidation: validateGraph(blankGraph, newProfile, knowledgeNodes),
    };

    const saved = await saveProjectToServer(newProj, workspaceSnapshot);
    setProjects((prev) => [saved.project, ...prev]);
    handleSelectSavedProject(saved.project);
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProjectFromServer(id);
      const remaining = projects.filter((p) => p.id !== id);
      setProjects(remaining);
      if (activeProjectId === id && remaining[0]) {
        handleSelectSavedProject(remaining[0]);
      }
      setStatusNotice('تم حذف المشروع.');
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'تعذر حذف المشروع.');
    }
  };

  const handleRunGeminiAnalysis = async (payload: {
    problemText: string;
    errorLogText?: string;
    imageBase64?: string;
    imageMimeType?: string;
  }) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await requestProblemAnalysis({
        ...payload,
        profile,
      });
      setAnalysis(result.analysis);
      handleUpdateGraph(result.graph, true);
      setActiveSection('analysis');
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'فشل تحليل المشكلة؛ تحقق من الاتصال بالخادم.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoadPreset = (preset: VerifiedPresetBlueprint) => {
    setAnalysis(preset.analysis);
    handleUpdateGraph(preset.graph, true);
    setActiveSection('editor');
    setStatusNotice(`تم تحميل المخطط الموثق: ${preset.titleAr}`);
  };

  const handleImportCustomNodes = async (imported: KnowledgeNodeDefinition[]) => {
    const mergedMap = new Map(customKnowledgeNodes.map((n) => [n.id, n]));
    for (const n of imported) {
      mergedMap.set(n.id, n);
    }
    const nextList = Array.from(mergedMap.values());
    setCustomKnowledgeNodes(nextList);
    try {
      await syncCustomKnowledgeToServer(nextList);
    } catch {
      // Kept locally if server unreachable
    }
  };

  const handleImportBridgeReport = async (
    updatedProfile: UnityProjectProfile,
    scannedNodes: KnowledgeNodeDefinition[]
  ) => {
    setProfile(updatedProfile);
    await handleImportCustomNodes(scannedNodes);
  };

  const handleQuickExportJson = () => {
    const blob = new Blob([currentBundleJson], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${graph.name || 'uvs-graph'}_bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFocusNodeInEditor = (nodeId: string) => {
    setFocusedNodeId(nodeId);
    setActiveSection('editor');
  };

  const handleRestoreWorkspace = async (snap: WorkspaceSnapshot) => {
    try {
      const restored = await restoreWorkspaceOnServer(snap);
      setProjects(restored.projects);
      setCustomKnowledgeNodes(restored.customKnowledgeNodes ?? []);
      if (restored.projects[0]) {
        handleSelectSavedProject(restored.projects[0]);
      }
    } catch {
      setProjects(snap.projects);
      setCustomKnowledgeNodes(snap.customKnowledgeNodes ?? []);
      if (snap.projects[0]) {
        handleSelectSavedProject(snap.projects[0]);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="h-16 px-4 sm:px-6 border-b border-slate-800 bg-[#0B0F17] flex items-center justify-between gap-8 sticky top-0 z-30">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('home');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0"
          dir="ltr"
        >
          Unity Visual Scripting Expert
        </a>

        {/* Zone 2: Concise Single-Line Primary Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveSection('home')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'home' ? 'text-slate-50 underline underline-offset-8 decoration-sky-400' : ''
            }`}
          >
            الرئيسية
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('editor')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'editor' ? 'text-slate-50 underline underline-offset-8 decoration-sky-400' : ''
            }`}
          >
            محرر المخططات
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('validator')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'validator' ? 'text-slate-50 underline underline-offset-8 decoration-sky-400' : ''
            }`}
          >
            المدقق
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('knowledge')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'knowledge' ? 'text-slate-50 underline underline-offset-8 decoration-sky-400' : ''
            }`}
          >
            قاعدة المعرفة
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('unity_bridge')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'unity_bridge' ? 'text-slate-50 underline underline-offset-8 decoration-sky-400' : ''
            }`}
          >
            UnityBridge
          </button>
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-800 cursor-pointer"
            aria-label="القائمة الجانبية"
          >
            {mobileDrawerOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleSaveActiveProject}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            حفظ المشروع
          </button>
        </div>
      </header>

      {/* Workspace Body: Sidebar + Main Viewport */}
      <div className="flex-1 flex relative">
        {/* Desktop & Mobile Responsive Sidebar */}
        <aside
          className={`${
            mobileDrawerOpen ? 'fixed inset-y-16 right-0 z-40 block' : 'hidden'
          } md:block w-64 bg-[#111827] border-l border-slate-800 shrink-0 overflow-y-auto`}
        >
          <div className="p-4 border-b border-slate-800 space-y-1">
            <div className="text-xs font-semibold text-slate-200 truncate">
              {profile.projectName}
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate" dir="ltr">
              {profile.unityVersion} · VS {profile.vsPackageVersion ?? 'Unverified'}
            </div>
          </div>

          <div className="p-2.5 space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-slate-800 text-sky-300'
                      : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'validator' && validation.counts.errors > 0 && (
                    <span className="font-mono text-[11px] text-red-400 tabular-nums">
                      {validation.counts.errors}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {statusNotice && (
            <div className="px-6 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
              <span>{statusNotice}</span>
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                className="text-slate-500 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {isBooting ? (
            <div className="max-w-5xl mx-auto p-8 space-y-4">
              <div className="h-7 w-72 bg-slate-800/70 rounded" />
              <div className="h-48 bg-slate-900 border border-slate-800 rounded-xl" />
            </div>
          ) : (
            <>
              {activeSection === 'home' && (
                <HomeProblemView
                  profile={profile}
                  isAnalyzing={isAnalyzing}
                  analysisError={analysisError}
                  onRunAnalysis={handleRunGeminiAnalysis}
                  onLoadPreset={handleLoadPreset}
                  onOpenSettings={() => setActiveSection('settings')}
                  onOpenEditor={() => setActiveSection('editor')}
                />
              )}

              {activeSection === 'settings' && (
                <ProjectSettingsView profile={profile} onUpdateProfile={setProfile} />
              )}

              {activeSection === 'projects' && (
                <SavedProjectsView
                  projects={projects}
                  activeProjectId={activeProjectId}
                  onSelectProject={handleSelectSavedProject}
                  onCreateNewProject={handleCreateBlankProject}
                  onDeleteProject={handleDeleteProject}
                />
              )}

              {activeSection === 'analysis' && (
                <AnalysisTenStagesView
                  analysis={analysis}
                  onOpenEditor={() => setActiveSection('editor')}
                  onOpenHome={() => setActiveSection('home')}
                />
              )}

              {activeSection === 'editor' && (
                <GraphEditorView
                  graph={graph}
                  profile={profile}
                  knowledgeNodes={knowledgeNodes}
                  validation={validation}
                  canUndo={historyPast.length > 0}
                  canRedo={historyFuture.length > 0}
                  focusedNodeId={focusedNodeId}
                  onFocusNodeChange={setFocusedNodeId}
                  onUpdateGraph={handleUpdateGraph}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onSaveProject={handleSaveActiveProject}
                  onExportJson={handleQuickExportJson}
                  onNavigateValidator={() => setActiveSection('validator')}
                />
              )}

              {activeSection === 'explanation' && (
                <NodesAndWiringExplanationView
                  graph={graph}
                  knowledgeNodes={knowledgeNodes}
                  onFocusNodeInEditor={handleFocusNodeInEditor}
                />
              )}

              {activeSection === 'validator' && (
                <ValidatorDashboardView
                  validation={validation}
                  onFocusNodeInEditor={handleFocusNodeInEditor}
                />
              )}

              {activeSection === 'knowledge' && (
                <KnowledgeBaseView
                  nodes={knowledgeNodes}
                  profile={profile}
                  onImportCustomNodes={handleImportCustomNodes}
                />
              )}

              {activeSection === 'unity_bridge' && (
                <UnityBridgeWorkspaceView
                  profile={profile}
                  currentBundleJson={currentBundleJson}
                  onImportBridgeReport={handleImportBridgeReport}
                />
              )}

              {activeSection === 'export' && (
                <ExportBackupAndTestsView
                  graph={graph}
                  profile={profile}
                  knowledgeNodes={knowledgeNodes}
                  validation={validation}
                  workspaceSnapshot={workspaceSnapshot}
                  onImportGraph={(imported) => {
                    handleUpdateGraph(imported, true);
                    setActiveSection('editor');
                  }}
                  onRestoreWorkspace={handleRestoreWorkspace}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

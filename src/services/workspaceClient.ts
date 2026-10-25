import {
  KnowledgeNodeDefinition,
  ProblemAnalysisReport,
  SavedProjectRecord,
  UnityProjectProfile,
  UVSGraphSpec,
  ValidationReport,
} from '../types/uvs';

export interface WorkspaceSnapshot {
  schemaVersion: 1;
  updatedAt: string;
  activeProjectId: string | null;
  customKnowledgeNodes: KnowledgeNodeDefinition[];
  projects: SavedProjectRecord[];
  isOfflineFallback?: boolean;
}

const LOCAL_CACHE_KEY = 'uvs_expert_offline_cache_v1';

export function saveOfflineSnapshot(snapshot: WorkspaceSnapshot): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // Ignore storage quota errors safely
  }
}

export function loadOfflineSnapshot(): WorkspaceSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceSnapshot;
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    return { ...parsed, isOfflineFallback: true };
  } catch {
    return null;
  }
}

export async function fetchWorkspaceState(
  customFetch: typeof fetch = fetch
): Promise<WorkspaceSnapshot> {
  try {
    const res = await customFetch('/api/workspace');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `خطأ خادم (${res.status})`);
    }
    const data = (await res.json()) as WorkspaceSnapshot;
    saveOfflineSnapshot(data);
    return { ...data, isOfflineFallback: false };
  } catch (err) {
    const cached = loadOfflineSnapshot();
    if (cached) {
      return cached;
    }
    throw new Error(
      err instanceof Error
        ? `انقطاع الاتصال بالخادم وتعذر العثور على نسخة محلية: ${err.message}`
        : 'انقطاع الشبكة وتعذر تحميل مساحة العمل.'
    );
  }
}

export async function saveProjectToServer(
  project: SavedProjectRecord,
  currentSnapshot: WorkspaceSnapshot,
  customFetch: typeof fetch = fetch
): Promise<{
  project: SavedProjectRecord;
  validation?: ValidationReport;
  savedRemotely: boolean;
  warningAr?: string;
}> {
  // Always persist locally immediately so user never loses work on network drop
  const updatedProjects = [...currentSnapshot.projects];
  const idx = updatedProjects.findIndex((p) => p.id === project.id);
  const stamped: SavedProjectRecord = {
    ...project,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) updatedProjects[idx] = stamped;
  else updatedProjects.unshift(stamped);

  saveOfflineSnapshot({
    ...currentSnapshot,
    updatedAt: stamped.updatedAt,
    activeProjectId: stamped.id,
    projects: updatedProjects,
  });

  try {
    const res = await customFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stamped),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `فشل الحفظ على الخادم (${res.status})`);
    }
    const data = (await res.json()) as {
      project: SavedProjectRecord;
      validation: ValidationReport;
    };
    return {
      project: data.project,
      validation: data.validation,
      savedRemotely: true,
    };
  } catch (err) {
    return {
      project: stamped,
      savedRemotely: false,
      warningAr:
        err instanceof Error
          ? `تم حفظ المشروع محلياً في المتصفح بسبب تعذر الاتصال بالخادم (${err.message}).`
          : 'تم الحفظ محلياً مؤقتاً لحين عودة الاتصال بالخادم.',
    };
  }
}

export async function deleteProjectFromServer(
  projectId: string,
  customFetch: typeof fetch = fetch
): Promise<void> {
  const res = await customFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'تعذر حذف المشروع من الخادم.');
  }
}

export async function syncCustomKnowledgeToServer(
  nodes: KnowledgeNodeDefinition[],
  customFetch: typeof fetch = fetch
): Promise<KnowledgeNodeDefinition[]> {
  const res = await customFetch('/api/knowledge/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'فشل مزامنة العقد المخصصة مع الخادم.');
  }
  const data = (await res.json()) as { customKnowledgeNodes: KnowledgeNodeDefinition[] };
  return data.customKnowledgeNodes;
}

export async function restoreWorkspaceOnServer(
  snapshot: WorkspaceSnapshot,
  customFetch: typeof fetch = fetch
): Promise<WorkspaceSnapshot> {
  const res = await customFetch('/api/workspace/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'فشل استعادة النسخة الاحتياطية على الخادم.');
  }
  const restored = (await res.json()) as WorkspaceSnapshot;
  saveOfflineSnapshot(restored);
  return restored;
}

export async function requestProblemAnalysis(
  payload: {
    problemText: string;
    errorLogText?: string;
    imageBase64?: string;
    imageMimeType?: string;
    profile: UnityProjectProfile;
  },
  customFetch: typeof fetch = fetch
): Promise<{
  analysis: ProblemAnalysisReport;
  graph: UVSGraphSpec;
  validation: ValidationReport;
}> {
  let res: Response;
  try {
    res = await customFetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new Error(
      `تعذر الوصول إلى خادم التحليل (تحقق من اتصال الشبكة): ${
        networkErr instanceof Error ? networkErr.message : 'خطأ شبكة'
      }`
    );
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody.error || `رفض خادم التحليل الطلب برمز الحالة (${res.status}).`
    );
  }

  return res.json();
}

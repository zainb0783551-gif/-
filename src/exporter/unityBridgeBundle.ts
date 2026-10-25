import JSZip from 'jszip';
import { KnowledgeNodeDefinition, UVSGraphSpec } from '../types/uvs';

export interface UnityBridgeFileEntry {
  relativePath: string;
  content: string;
}

export async function fetchUnityBridgeFiles(
  customFetch: typeof fetch = fetch
): Promise<UnityBridgeFileEntry[]> {
  const res = await customFetch('/api/unity-bridge/files');
  if (!res.ok) {
    throw new Error('تعذر تحميل ملفات مصدر UnityBridge من الخادم.');
  }
  const data = (await res.json()) as { files: UnityBridgeFileEntry[] };
  return data.files ?? [];
}

export async function buildUnityBridgeZipBlob(
  files: UnityBridgeFileEntry[],
  optionalExportBundleJson?: string
): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.relativePath, file.content);
  }
  if (optionalExportBundleJson) {
    zip.file('SampleExport/current_graph_bundle.json', optionalExportBundleJson);
  }
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Generates a clean, high-resolution deterministic SVG snapshot of a UVSGraphSpec.
 * Used both as a headless/testable vector diagram generator and fallback alongside html-to-image PNG export.
 */
export function renderGraphToSvgMarkup(
  graph: UVSGraphSpec,
  knowledgeNodes: KnowledgeNodeDefinition[]
): string {
  const kbMap = new Map(knowledgeNodes.map((n) => [n.id, n]));
  const padding = 80;
  const nodeWidth = 270;
  const nodeHeight = 148;

  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  const minX = xs.length ? Math.min(...xs) - padding : 0;
  const minY = ys.length ? Math.min(...ys) - padding : 0;
  const maxX = xs.length ? Math.max(...xs) + nodeWidth + padding : 800;
  const maxY = ys.length ? Math.max(...ys) + nodeHeight + padding : 500;
  const width = Math.max(800, maxX - minX);
  const height = Math.max(480, maxY - minY);

  const escapeXml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const edgesSvg = graph.connections
    .map((c) => {
      const src = nodeMap.get(c.sourceNodeId);
      const dst = nodeMap.get(c.targetNodeId);
      if (!src || !dst) return '';
      const x1 = src.position.x - minX + nodeWidth;
      const y1 = src.position.y - minY + (c.kind === 'flow' ? 52 : 98);
      const x2 = dst.position.x - minX;
      const y2 = dst.position.y - minY + (c.kind === 'flow' ? 52 : 98);
      const dx = Math.max(60, Math.abs(x2 - x1) * 0.45);
      const stroke = c.kind === 'flow' ? '#10B981' : '#38BDF8';
      const strokeWidth = c.kind === 'flow' ? '3' : '2';
      const dash = c.kind === 'flow' ? '' : 'stroke-dasharray="5,4"';
      return `<path d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash} />`;
    })
    .join('\n');

  const nodesSvg = graph.nodes
    .map((n) => {
      const def = kbMap.get(n.definitionId);
      const x = n.position.x - minX;
      const y = n.position.y - minY;
      const title = escapeXml(def?.displayName ?? n.unitClassName);
      const subtitle = escapeXml(def?.unitClassName ?? 'MISSING UNIT');
      const headerFill = !def
        ? '#7F1D1D'
        : def.isEventNode
        ? '#065F46'
        : def.originKind === 'reflection'
        ? '#1E3A8A'
        : '#1E293B';
      return `<g transform="translate(${x}, ${y})">
        <rect width="${nodeWidth}" height="${nodeHeight}" rx="8" fill="#111827" stroke="#334155" stroke-width="1.5" />
        <rect width="${nodeWidth}" height="36" rx="8" fill="${headerFill}" />
        <text x="12" y="23" fill="#F8FAFC" font-family="monospace" font-size="13" font-weight="bold">${title}</text>
        <text x="12" y="58" fill="#94A3B8" font-family="monospace" font-size="10">${subtitle}</text>
      </g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#0B0F17" />
    ${edgesSvg}
    ${nodesSvg}
  </svg>`;
}

import dagre from 'dagre';
import { KnowledgeNodeDefinition, UVSGraphSpec } from '../types/uvs';

/**
 * Automatically arranges Unity Visual Scripting nodes left-to-right (execution & data flow direction)
 * using a deterministic Dagre topological layout.
 */
export function applyAutoLayout(
  graph: UVSGraphSpec,
  knowledgeNodes: KnowledgeNodeDefinition[]
): UVSGraphSpec {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 75,
    ranksep: 130,
    marginx: 48,
    marginy: 48,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const kbMap = new Map(knowledgeNodes.map((n) => [n.id, n]));

  for (const node of graph.nodes) {
    const def = kbMap.get(node.definitionId);
    const portRows = def
      ? Math.max(
          def.controlInputs.length + def.valueInputs.length,
          def.controlOutputs.length + def.valueOutputs.length,
          2
        )
      : 3;
    const height = 96 + portRows * 30;
    g.setNode(node.id, { width: 280, height });
  }

  for (const conn of graph.connections) {
    if (g.hasNode(conn.sourceNodeId) && g.hasNode(conn.targetNodeId)) {
      g.setEdge(conn.sourceNodeId, conn.targetNodeId, {
        weight: conn.kind === 'flow' ? 3 : 1,
      });
    }
  }

  dagre.layout(g);

  const updatedNodes = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: {
        x: Math.round(pos.x - pos.width / 2),
        y: Math.round(pos.y - pos.height / 2),
      },
    };
  });

  // Update group bounding boxes around member nodes if groups exist
  const nodePosMap = new Map(updatedNodes.map((n) => [n.id, n]));
  const updatedGroups = graph.groups.map((grp) => {
    const members = grp.nodeIds
      .map((id) => nodePosMap.get(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n));
    if (members.length === 0) return grp;

    const minX = Math.min(...members.map((m) => m.position.x)) - 36;
    const minY = Math.min(...members.map((m) => m.position.y)) - 56;
    const maxX = Math.max(...members.map((m) => m.position.x + 290)) + 36;
    const maxY = Math.max(...members.map((m) => m.position.y + 190)) + 36;

    return {
      ...grp,
      bounds: {
        x: minX,
        y: minY,
        width: Math.max(360, maxX - minX),
        height: Math.max(240, maxY - minY),
      },
    };
  });

  return {
    ...graph,
    updatedAt: new Date().toISOString(),
    nodes: updatedNodes,
    groups: updatedGroups,
  };
}

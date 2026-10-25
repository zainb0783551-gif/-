/**
 * SYNTHETIC_TEST_FIXTURES_ONLY
 * Strictly isolated from `/src/knowledge-base/officialNodes.ts`.
 * Never imported by production application code or exposed to users as official Unity nodes.
 */
import { UVSGraphSpec, UnityBridgeReport } from '../../src/types/uvs';

export const SYNTHETIC_SIMPLE_VALID_GRAPH: UVSGraphSpec = {
  schemaVersion: '1.0.0',
  id: 'synth-simple-graph',
  name: 'SyntheticSimpleStartLog',
  descriptionAr: 'مخطط اختبار بسيط سليم',
  createdAt: '2026-10-24T00:00:00.000Z',
  updatedAt: '2026-10-24T00:00:00.000Z',
  targetUnityVersion: '2021.3.38f1',
  targetVsVersion: '1.8.0',
  variables: [],
  groups: [],
  subgraphs: [],
  nodes: [
    {
      id: 's-start',
      definitionId: 'uvs.event.start',
      unitClassName: 'Unity.VisualScripting.Start',
      position: { x: 0, y: 0 },
      inlineValues: { coroutine: false },
    },
    {
      id: 's-log',
      definitionId: 'uvs.reflect.debug.log',
      unitClassName: 'Unity.VisualScripting.InvokeMember',
      position: { x: 260, y: 0 },
      inlineValues: { '0': 'Boot OK' },
    },
  ],
  connections: [
    {
      id: 's-c1',
      kind: 'flow',
      sourceNodeId: 's-start',
      sourcePortKey: 'trigger',
      targetNodeId: 's-log',
      targetPortKey: 'enter',
    },
  ],
};

export const SYNTHETIC_HALLUCINATED_NODE_GRAPH: UVSGraphSpec = {
  ...SYNTHETIC_SIMPLE_VALID_GRAPH,
  id: 'synth-hallucinated',
  nodes: [
    ...SYNTHETIC_SIMPLE_VALID_GRAPH.nodes,
    {
      id: 's-fake',
      definitionId: 'synthetic.fake.auto_aim_magic_node',
      unitClassName: 'Unity.VisualScripting.AutoAimMagicUnit',
      position: { x: 500, y: 0 },
      inlineValues: {},
    },
  ],
};

export const SYNTHETIC_VALID_UNITY_BRIDGE_REPORT: UnityBridgeReport = {
  schemaIdentifier: 'uvs-unity-bridge-report-v1',
  generatedAtUtc: '2026-10-24T12:00:00Z',
  unityVersion: '2021.3.38f1',
  visualScriptingVersion: '1.8.0',
  renderPipeline: 'UniversalRenderPipelineAsset',
  activeInputHandling: 'Both',
  installedPackages: [
    { name: 'com.unity.visualscripting', version: '1.8.0', source: 'BuiltIn' },
    { name: 'com.unity.inputsystem', version: '1.5.1', source: 'Registry' },
  ],
  assembliesScanned: ['Unity.VisualScripting.Flow', 'Assembly-CSharp'],
  scannedUnits: [
    {
      unitClassName: 'StudioTest.CustomUnits.ApplyShieldUnit',
      namespace: 'StudioTest.CustomUnits',
      assembly: 'Assembly-CSharp',
      displayName: 'Apply Shield (Test Only)',
      category: 'Custom/Combat',
      isCustomUnit: true,
      controlInputs: [{ key: 'enter', label: 'Enter' }],
      controlOutputs: [{ key: 'exit', label: 'Exit' }],
      valueInputs: [
        { key: 'amount', label: 'Amount', dataType: 'System.Single', hasDefaultValue: true },
      ],
      valueOutputs: [
        { key: 'totalShield', label: 'Total', dataType: 'System.Single' },
      ],
    },
  ],
};

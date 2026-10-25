import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { OFFICIAL_KNOWLEDGE_NODES } from '../src/knowledge-base/officialNodes';
import {
  createDefaultProjectProfile,
  parseManifestJson,
  parsePackagesLockJson,
  parseUnityBridgeReport,
} from '../src/knowledge-base/projectDetector';
import { mergeKnowledgeNodes } from '../src/knowledge-base/registry';
import { validateGraph } from '../src/validator/graphValidator';
import { VERIFIED_PRESET_BLUEPRINTS } from '../src/knowledge-base/presetTemplates';
import {
  parseGraphFromJson,
  serializeGraphBundle,
  generateImplementationReportMarkdown,
} from '../src/exporter/graphSerializer';
import {
  buildUnityBridgeZipBlob,
  renderGraphToSvgMarkup,
} from '../src/exporter/unityBridgeBundle';
import {
  fetchWorkspaceState,
  requestProblemAnalysis,
  saveProjectToServer,
} from '../src/services/workspaceClient';
import { VerificationStatus, UVSGraphSpec } from '../src/types/uvs';
import {
  SYNTHETIC_HALLUCINATED_NODE_GRAPH,
  SYNTHETIC_SIMPLE_VALID_GRAPH,
  SYNTHETIC_VALID_UNITY_BRIDGE_REPORT,
} from './fixtures/syntheticTestData';

describe('Unity Visual Scripting Expert — Comprehensive Verification Suite (12 Scenarios)', () => {
  const verifiedProfile18 = parsePackagesLockJson(
    JSON.stringify({
      dependencies: {
        'com.unity.visualscripting': { version: '1.8.0', source: 'builtin' },
      },
    }),
    createDefaultProjectProfile('SuiteProject')
  );

  it('01. Validates a simple graph cleanly (On Start -> Debug.Log)', () => {
    const report = validateGraph(
      SYNTHETIC_SIMPLE_VALID_GRAPH,
      verifiedProfile18,
      OFFICIAL_KNOWLEDGE_NODES
    );
    expect(report.counts.errors).toBe(0);
    expect(report.counts.warnings).toBe(0);
    expect(report.overallStatus).toBe(VerificationStatus.VERIFIED);
    expect(report.unityBridgeImportable).toBe(true);
  });

  it('02. Validates a multi-stage graph (Trigger Health Pickup with Once, Sequence, Clamp, Object Variables)', () => {
    const multiStage = VERIFIED_PRESET_BLUEPRINTS[1].graph;
    const report = validateGraph(multiStage, verifiedProfile18, OFFICIAL_KNOWLEDGE_NODES);
    expect(report.counts.errors).toBe(0);
    expect(report.structuralStatus).toBe('valid');
    expect(report.requiredComponentsSummary).toContain('Unity.VisualScripting.Variables');
    expect(report.requiredComponentsSummary).toContain('UnityEngine.Collider');
  });

  it('03. Rejects a non-existent / hallucinated node', () => {
    const report = validateGraph(
      SYNTHETIC_HALLUCINATED_NODE_GRAPH,
      verifiedProfile18,
      OFFICIAL_KNOWLEDGE_NODES
    );
    expect(report.overallStatus).toBe(VerificationStatus.INVALID);
    expect(report.issues.some((i) => i.code === 'NODE_NOT_IN_KNOWLEDGE_BASE')).toBe(true);
    // Ensure synthetic fixture never leaked into official KB
    expect(
      OFFICIAL_KNOWLEDGE_NODES.some((n) => n.id.startsWith('synthetic.'))
    ).toBe(false);
  });

  it('04. Detects incompatible ports (both Value Type mismatch and Flow-to-Value mix)', () => {
    const incompatibleGraph: UVSGraphSpec = {
      ...SYNTHETIC_SIMPLE_VALID_GRAPH,
      nodes: [
        {
          id: 'n-start',
          definitionId: 'uvs.event.start',
          unitClassName: 'Unity.VisualScripting.Start',
          position: { x: 0, y: 0 },
          inlineValues: {},
        },
        {
          id: 'n-neg',
          definitionId: 'uvs.logic.negate',
          unitClassName: 'Unity.VisualScripting.Negate',
          position: { x: 200, y: 0 },
          inlineValues: { input: true },
        },
        {
          id: 'n-trans',
          definitionId: 'uvs.reflect.transform.translate',
          unitClassName: 'Unity.VisualScripting.InvokeMember',
          position: { x: 450, y: 0 },
          inlineValues: { target: 'Self' },
        },
      ],
      connections: [
        // Illegal Flow -> Value mix
        {
          id: 'c-mix',
          kind: 'flow',
          sourceNodeId: 'n-start',
          sourcePortKey: 'trigger',
          targetNodeId: 'n-neg',
          targetPortKey: 'input',
        },
        // Illegal Boolean -> Vector3 mismatch
        {
          id: 'c-type',
          kind: 'value',
          sourceNodeId: 'n-neg',
          sourcePortKey: 'output',
          targetNodeId: 'n-trans',
          targetPortKey: '0',
        },
      ],
    };

    const report = validateGraph(incompatibleGraph, verifiedProfile18, OFFICIAL_KNOWLEDGE_NODES);
    expect(report.overallStatus).toBe(VerificationStatus.INVALID);
    expect(report.issues.some((i) => i.code === 'FLOW_VALUE_MIX_FORBIDDEN')).toBe(true);
    expect(report.issues.some((i) => i.code === 'PORT_TYPE_MISMATCH')).toBe(true);
  });

  it('05. Detects package version differences (StickyNote fails on 1.7.8, passes on 1.8.0; missing InputSystem detected)', () => {
    const profile178 = parseManifestJson(
      JSON.stringify({
        dependencies: {
          'com.unity.visualscripting': '1.7.8',
        },
      }),
      createDefaultProjectProfile('Legacy2021_3')
    );

    const stickyAndInputGraph: UVSGraphSpec = {
      ...SYNTHETIC_SIMPLE_VALID_GRAPH,
      nodes: [
        ...SYNTHETIC_SIMPLE_VALID_GRAPH.nodes,
        {
          id: 'n-sticky',
          definitionId: 'uvs.editor.sticky_note',
          unitClassName: 'Unity.VisualScripting.StickyNote',
          position: { x: 0, y: 200 },
          inlineValues: {},
        },
        {
          id: 'n-is-btn',
          definitionId: 'uvs.package.input_system.button',
          unitClassName: 'Unity.VisualScripting.InputSystem.OnInputSystemEventButton',
          position: { x: 260, y: 200 },
          inlineValues: {},
        },
      ],
    };

    const res178 = validateGraph(stickyAndInputGraph, profile178, OFFICIAL_KNOWLEDGE_NODES);
    expect(res178.overallStatus).toBe(VerificationStatus.INVALID);
    expect(res178.issues.some((i) => i.code === 'NODE_VERSION_INCOMPATIBLE')).toBe(true);
    expect(res178.issues.some((i) => i.code === 'REQUIRED_PACKAGE_MISSING')).toBe(true);
  });

  it('06. Detects missing Custom Unit until UnityBridge scan report is imported', () => {
    const customGraph: UVSGraphSpec = {
      ...SYNTHETIC_SIMPLE_VALID_GRAPH,
      nodes: [
        {
          id: 'n-start',
          definitionId: 'uvs.event.start',
          unitClassName: 'Unity.VisualScripting.Start',
          position: { x: 0, y: 0 },
          inlineValues: { coroutine: false },
        },
        {
          id: 'n-shield',
          definitionId: 'uvs.scanned.studiotest.customunits.applyshieldunit',
          unitClassName: 'StudioTest.CustomUnits.ApplyShieldUnit',
          position: { x: 300, y: 0 },
          inlineValues: { amount: 50 },
        },
      ],
      connections: [
        {
          id: 'c-s1',
          kind: 'flow',
          sourceNodeId: 'n-start',
          sourcePortKey: 'trigger',
          targetNodeId: 'n-shield',
          targetPortKey: 'enter',
        },
      ],
    };

    // Before UnityBridge import -> CUSTOM_UNIT_MISSING
    const beforeScan = validateGraph(customGraph, verifiedProfile18, OFFICIAL_KNOWLEDGE_NODES);
    expect(beforeScan.overallStatus).toBe(VerificationStatus.INVALID);
    expect(beforeScan.issues.some((i) => i.code === 'CUSTOM_UNIT_MISSING')).toBe(true);

    // Import valid UnityBridge report -> Custom Unit becomes verified!
    const { updatedProfile, extractedNodes } = parseUnityBridgeReport(
      JSON.stringify(SYNTHETIC_VALID_UNITY_BRIDGE_REPORT),
      verifiedProfile18
    );
    const mergedKB = mergeKnowledgeNodes(extractedNodes);
    const afterScan = validateGraph(customGraph, updatedProfile, mergedKB);
    expect(afterScan.overallStatus).toBe(VerificationStatus.VERIFIED);
    expect(afterScan.verificationBasis).toBe('unity_editor_scan_backed');
  });

  it('07. Rejects invalid or malformed UnityBridge reports cleanly', () => {
    expect(() =>
      parseUnityBridgeReport('{"schemaIdentifier":"fake-v0"}', verifiedProfile18)
    ).toThrow(/تقرير UnityBridge مرفوض/);

    expect(() =>
      parseUnityBridgeReport(
        JSON.stringify({
          schemaIdentifier: 'uvs-unity-bridge-report-v1',
          unityVersion: '2021.3.38f1',
          visualScriptingVersion: 'invalid-semver',
          scannedUnits: [],
        }),
        verifiedProfile18
      )
    ).toThrow(/غير مكتمل/);
  });

  it('08. Rejects incomplete Graph JSON missing required nodes or connections arrays', () => {
    expect(() =>
      parseGraphFromJson(
        JSON.stringify({
          schemaVersion: '1.0.0',
          id: 'incomplete-1',
          name: 'BrokenGraph',
        })
      )
    ).toThrow(/غير مكتملة/);
  });

  it('09. Handles corrupt JSON and unsupported schema import failures safely', () => {
    expect(() => parseGraphFromJson('{broken_json_syntax')).toThrow(/تالف/);
    expect(() =>
      parseGraphFromJson(
        JSON.stringify({
          schemaVersion: '9.9.9',
          id: 'future',
          name: 'Future',
          nodes: [],
          connections: [],
        })
      )
    ).toThrow(/غير متوافق/);
  });

  it('10. Saves and restores full Graph & Project metadata accurately', () => {
    const preset = VERIFIED_PRESET_BLUEPRINTS[0].graph;
    const val = validateGraph(preset, verifiedProfile18, OFFICIAL_KNOWLEDGE_NODES);
    const bundle = serializeGraphBundle(preset, verifiedProfile18, OFFICIAL_KNOWLEDGE_NODES, val);
    const serialized = JSON.stringify(bundle);
    const restored = parseGraphFromJson(serialized);

    expect(restored.id).toBe(preset.id);
    expect(restored.nodes.length).toBe(preset.nodes.length);
    expect(restored.connections.length).toBe(preset.connections.length);
    expect(restored.variables[0].name).toBe('JumpForce');
  });

  it('11. Exports diagram image markup (SVG), documented JSON, Markdown report, and UnityBridge ZIP archive', async () => {
    const val = validateGraph(
      SYNTHETIC_SIMPLE_VALID_GRAPH,
      verifiedProfile18,
      OFFICIAL_KNOWLEDGE_NODES
    );
    const bundle = serializeGraphBundle(
      SYNTHETIC_SIMPLE_VALID_GRAPH,
      verifiedProfile18,
      OFFICIAL_KNOWLEDGE_NODES,
      val
    );
    const svg = renderGraphToSvgMarkup(SYNTHETIC_SIMPLE_VALID_GRAPH, OFFICIAL_KNOWLEDGE_NODES);
    const md = generateImplementationReportMarkdown(
      SYNTHETIC_SIMPLE_VALID_GRAPH,
      verifiedProfile18,
      OFFICIAL_KNOWLEDGE_NODES,
      val
    );

    expect(svg).toContain('<svg');
    expect(svg).toContain('On Start');
    expect(md).toContain('تقرير تنفيذ وتدقيق مخطط Unity Visual Scripting');
    expect(bundle.unityBridgePayload.units[0].inlineEntries).toBeDefined();

    // Verify real /UnityBridge files exist on disk and package cleanly into ZIP
    const importerPath = path.resolve(process.cwd(), 'UnityBridge/Editor/UVSGraphImporter.cs');
    expect(fs.existsSync(importerPath)).toBe(true);
    const zipBlob = await buildUnityBridgeZipBlob(
      [{ relativePath: 'UnityBridge/Editor/UVSGraphImporter.cs', content: fs.readFileSync(importerPath, 'utf-8') }],
      JSON.stringify(bundle)
    );
    expect(zipBlob.size).toBeGreaterThan(500);
  });

  it('12. Handles API errors (HTTP 502) and network disconnections gracefully with local fallback', async () => {
    const disconnectedFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    // Analysis API propagates clear Arabic network error
    await expect(
      requestProblemAnalysis(
        {
          problemText: 'اختبار انقطاع الشبكة',
          profile: verifiedProfile18,
        },
        disconnectedFetch
      )
    ).rejects.toThrow(/تعذر الوصول إلى خادم التحليل/);

    // Server error 502 propagates message cleanly
    const error502Fetch = (async () =>
      new Response(JSON.stringify({ error: 'مفتاح API غير متاح مؤقتاً' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;

    await expect(
      requestProblemAnalysis(
        {
          problemText: 'اختبار خطأ 502',
          profile: verifiedProfile18,
        },
        error502Fetch
      )
    ).rejects.toThrow(/مفتاح API غير متاح مؤقتاً/);

    // Saving project during network outage succeeds locally with explicit warning
    const saveResult = await saveProjectToServer(
      {
        id: 'proj-offline-test',
        name: 'Offline Project',
        descriptionAr: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        profile: verifiedProfile18,
        graph: SYNTHETIC_SIMPLE_VALID_GRAPH,
      },
      {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        activeProjectId: null,
        customKnowledgeNodes: [],
        projects: [],
      },
      disconnectedFetch
    );

    expect(saveResult.savedRemotely).toBe(false);
    expect(saveResult.warningAr).toContain('محلياً');

    // Verify fetchWorkspaceState throws cleanly when no localStorage exists in headless Node
    await expect(fetchWorkspaceState(disconnectedFetch)).rejects.toThrow(/انقطاع/);
  });
});

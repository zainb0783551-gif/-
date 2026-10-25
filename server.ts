import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { readDatabase, writeDatabase } from './src/server/storage';
import { analyzeProblemWithGemini } from './src/server/analysisEngine';
import { mergeKnowledgeNodes } from './src/knowledge-base/registry';
import { validateGraph } from './src/validator/graphValidator';
import { SavedProjectRecord } from './src/types/uvs';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // 1. Health & Workspace State API
  app.get('/api/workspace', (_req, res) => {
    try {
      const db = readDatabase();
      res.json(db);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'فشل قراءة قاعدة بيانات مساحة العمل.',
      });
    }
  });

  // 2. Save / Upsert Project
  app.post('/api/projects', (req, res) => {
    try {
      const incoming = req.body as SavedProjectRecord;
      if (!incoming || !incoming.id || !incoming.name || !incoming.graph || !incoming.profile) {
        res.status(400).json({ error: 'بيانات المشروع غير مكتملة للحفظ.' });
        return;
      }

      const db = readDatabase();
      const kb = mergeKnowledgeNodes(db.customKnowledgeNodes);
      const validation = validateGraph(incoming.graph, incoming.profile, kb);

      const record: SavedProjectRecord = {
        ...incoming,
        updatedAt: new Date().toISOString(),
        lastValidation: validation,
      };

      const idx = db.projects.findIndex((p) => p.id === record.id);
      if (idx >= 0) {
        db.projects[idx] = record;
      } else {
        db.projects.unshift(record);
      }
      db.activeProjectId = record.id;
      writeDatabase(db);

      res.json({ project: record, validation });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر حفظ المشروع على الخادم.',
      });
    }
  });

  // 3. Delete Project
  app.delete('/api/projects/:id', (req, res) => {
    try {
      const { id } = req.params;
      const db = readDatabase();
      db.projects = db.projects.filter((p) => p.id !== id);
      if (db.activeProjectId === id) {
        db.activeProjectId = db.projects[0]?.id ?? null;
      }
      writeDatabase(db);
      res.json({ ok: true, activeProjectId: db.activeProjectId });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر حذف المشروع.',
      });
    }
  });

  // 4. Sync Custom / Scanned Knowledge Base Nodes
  app.post('/api/knowledge/custom', (req, res) => {
    try {
      const { nodes } = req.body;
      if (!Array.isArray(nodes)) {
        res.status(400).json({ error: 'يجب تمرير مصفوفة nodes صالحة.' });
        return;
      }
      const db = readDatabase();
      const map = new Map(db.customKnowledgeNodes.map((n) => [n.id, n]));
      for (const n of nodes) {
        if (n && typeof n.id === 'string') {
          map.set(n.id, n);
        }
      }
      db.customKnowledgeNodes = Array.from(map.values());
      writeDatabase(db);
      res.json({ customKnowledgeNodes: db.customKnowledgeNodes });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر تحديث قاعدة المعرفة.',
      });
    }
  });

  // 5. Full Workspace Backup Restore
  app.post('/api/workspace/restore', (req, res) => {
    try {
      const payload = req.body;
      if (!payload || !Array.isArray(payload.projects)) {
        res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح.' });
        return;
      }
      writeDatabase({
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        activeProjectId: payload.activeProjectId ?? payload.projects[0]?.id ?? null,
        customKnowledgeNodes: Array.isArray(payload.customKnowledgeNodes)
          ? payload.customKnowledgeNodes
          : [],
        projects: payload.projects,
      });
      res.json(readDatabase());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'فشل استعادة النسخة الاحتياطية.',
      });
    }
  });

  // 6. Serve Real UnityBridge Companion Source Files from Disk
  app.get('/api/unity-bridge/files', (_req, res) => {
    try {
      const bridgeRoot = path.resolve(process.cwd(), 'UnityBridge');
      const files: { relativePath: string; content: string }[] = [];

      const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else {
            const rel = path.relative(bridgeRoot, full).replace(/\\/g, '/');
            files.push({
              relativePath: `UnityBridge/${rel}`,
              content: fs.readFileSync(full, 'utf-8'),
            });
          }
        }
      };

      walk(bridgeRoot);
      res.json({ files });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'تعذر قراءة ملفات UnityBridge.',
      });
    }
  });

  // 7. Server-Side Gemini 10-Stage Problem Analysis Endpoint
  app.post('/api/analyze', async (req, res) => {
    try {
      const { problemText, errorLogText, imageBase64, imageMimeType, profile } = req.body ?? {};
      if (typeof problemText !== 'string' || !problemText.trim()) {
        res.status(400).json({ error: 'يرجى كتابة وصف المشكلة أو السلوك المطلوب تحليله.' });
        return;
      }
      if (!profile || typeof profile !== 'object') {
        res.status(400).json({ error: 'ملف إعدادات المشروع مطلوب لإجراء التحليل.' });
        return;
      }

      const db = readDatabase();
      const knowledgeNodes = mergeKnowledgeNodes(db.customKnowledgeNodes);

      const result = await analyzeProblemWithGemini({
        problemText: problemText.trim(),
        errorLogText: typeof errorLogText === 'string' ? errorLogText.trim() : undefined,
        imageBase64: typeof imageBase64 === 'string' ? imageBase64 : undefined,
        imageMimeType: typeof imageMimeType === 'string' ? imageMimeType : undefined,
        profile,
        knowledgeNodes,
      });

      res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'حدث خطأ أثناء الاتصال بمحرك التحليل في الخادم.';
      res.status(502).json({ error: message });
    }
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Unity Visual Scripting Expert server listening on http://0.0.0.0:${port}`);
  });
}

// Only start HTTP listener when executed directly (allows importing createApp in Vitest!)
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(process.cwd(), 'server.ts');

if (isDirectRun) {
  startServer();
}

import fs from 'fs';
import path from 'path';
import {
  KnowledgeNodeDefinition,
  SavedProjectRecord,
  UnityProjectProfile,
} from '../types/uvs';
import { createDefaultProjectProfile } from '../knowledge-base/projectDetector';
import { VERIFIED_PRESET_BLUEPRINTS } from '../knowledge-base/presetTemplates';
import { mergeKnowledgeNodes } from '../knowledge-base/registry';
import { validateGraph } from '../validator/graphValidator';

export interface PersistentDatabaseSchema {
  schemaVersion: 1;
  updatedAt: string;
  activeProjectId: string | null;
  customKnowledgeNodes: KnowledgeNodeDefinition[];
  projects: SavedProjectRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'uvs-expert-db.json');

function createSeedDatabase(): PersistentDatabaseSchema {
  const preset = VERIFIED_PRESET_BLUEPRINTS[0];
  const defaultProfile: UnityProjectProfile = {
    ...createDefaultProjectProfile('مشروع القفز الفيزيائي التجريبي'),
    vsPackageVersion: '1.8.0',
    vsVersionSource: 'manual',
    notesAr: [
      'مشروع نموذجي مضبوط مبدئياً على Unity 2021.3 LTS مع Visual Scripting 1.8.0؛ يمكنك رفع manifest.json أو packages-lock.json من مشروعك الفعلي في أي وقت.',
    ],
  };

  const kb = mergeKnowledgeNodes([]);
  const initialValidation = validateGraph(preset.graph, defaultProfile, kb);

  const initialProject: SavedProjectRecord = {
    id: 'proj-initial-jump',
    name: 'مشروع القفز الفيزيائي التجريبي',
    descriptionAr: preset.summaryAr,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: defaultProfile,
    graph: preset.graph,
    analysis: preset.analysis,
    lastValidation: initialValidation,
  };

  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    activeProjectId: initialProject.id,
    customKnowledgeNodes: [],
    projects: [initialProject],
  };
}

export function readDatabase(): PersistentDatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const seed = createSeedDatabase();
      writeDatabase(seed);
      return seed;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistentDatabaseSchema;
    if (!parsed || !Array.isArray(parsed.projects)) {
      const seed = createSeedDatabase();
      writeDatabase(seed);
      return seed;
    }
    return parsed;
  } catch {
    return createSeedDatabase();
  }
}

export function writeDatabase(db: PersistentDatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const next: PersistentDatabaseSchema = {
    ...db,
    updatedAt: new Date().toISOString(),
  };
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

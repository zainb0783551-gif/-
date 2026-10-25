# Unity Visual Scripting Expert

منصة هندسية متخصصة لتحليل مشاكل الألعاب وبناء وتدقيق وتصدير مخططات **Unity Visual Scripting** للإصدار المستهدف **Unity 2021.3 LTS**.

---

## التشغيل والتطوير محلياً (خارج Google AI Studio)

1. تثبيت الاعتماديات:
   ```bash
   npm install
   ```
2. إعداد متغيرات البيئة:
   انسخ ملف `.env.example` إلى `.env` وأضف مفتاح `GEMINI_API_KEY` الخاص بك (يُستخدم حصراً في الخادم `server.ts` ولا يُرسل إلى المتصفح إطلاقاً):
   ```bash
   cp .env.example .env
   ```
3. تشغيل خادم التطوير المتكامل (الواجهة + الخادم على المنفذ `3000`):
   ```bash
   npm run dev
   ```
4. تشغيل حزمة الاختبارات الآلية (12 سيناريو تحقق):
   ```bash
   npm test
   ```
5. البناء للإنتاج:
   ```bash
   npm run build
   npm start
   ```

---

## بنية المشروع المفصولة

- `src/types/uvs.ts` — تعريفات الأنواع الصارمة للمخططات، المنافذ، المتغيرات، وتقارير التحقق.
- `src/knowledge-base/` — قاعدة المعرفة الرسمية الموثقة لـ `com.unity.visualscripting` (1.7.x / 1.8.0) ومكتشف ملفات المشروع (`manifest.json`, `packages-lock.json`, `ProjectVersion.txt`, وتقارير `UnityBridge`).
- `src/validator/graphValidator.ts` — محرك التدقيق الحتمي المستقل كلياً عن Gemini.
- `src/exporter/` — محرك التصدير والاستيراد وحزم `UnityBridge` والترتيب التلقائي للعقد (`Dagre`).
- `src/server/` & `server.ts` — خادم Express مع حفظ المشاريع الدائم (`data/uvs-expert-db.json`) ومحرك التحليل ذي المراحل العشر عبر `@google/genai`.
- `UnityBridge/Editor/` — أداة محرر Unity 2021.3 المرافقة (`Editor-Only C#`) لفحص العقد الفعلية واستيراد أصول `ScriptGraphAsset` مع نسخ احتياطي تلقائي.
- `tests/` — اختبارات `Vitest` الفعلية ببيانات اختبار اصطناعية معزولة عن قاعدة المعرفة الرسمية.

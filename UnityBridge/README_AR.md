# أداة UnityBridge المرافقة لمحرر Unity 2021.3 LTS

تعمل هذه الأداة **حصراً داخل بيئة المحرر (`Editor-Only`)** عبر ملف تعريف الأسمبلي `UnityVisualScriptingExpert.Bridge.Editor.asmdef`، ولا تُضمَّن إطلاقاً في بناء اللعبة النهائي، ولا تحتوي على أي منطق لعب مخفي بلغة C#.

---

## 1. خطوات التثبيت داخل مشروع Unity 2021.3

1. افتح مجلد مشروعك في Unity 2021.3 LTS.
2. انسخ مجلد `UnityBridge` بالكامل وضعه داخل مجلد `Assets/` ليصبح المسار:
   `Assets/UnityBridge/Editor/`
3. انتظر انتهاء Unity من تجميع سكربتات المحرر (Domain Reload).
4. افتح نافذة الأداة من الشريط العلوي في محرر Unity:
   `Tools > Unity Visual Scripting Expert > Bridge Window`

---

## 2. تصدير تقرير الفحص الفعلي للمشروع

1. من داخل نافذة `UVS Expert Bridge` اضغط على الزر:
   **`Scan Project & Export JSON Report...`**
2. تقوم الأداة بالآتي عبر واجهات Unity الرسمية:
   - قراءة `Application.unityVersion` وإصدار `com.unity.visualscripting` المثبت فعلياً عبر `UnityEditor.PackageManager.Client.List(true, false)`.
   - فحص جميع الأسمبليات المحملة بحثاً عن الكلاسات المنفذة لواجهة `Unity.VisualScripting.IUnit` (بما فيها وحداتك المخصصة `Custom Units`).
   - استخراج منافذ `controlInputs` و `controlOutputs` و `valueInputs` و `valueOutputs` وأنواع بياناتها الفعلية.
3. ارفع ملف `unity_bridge_report.json` الناتج في قسم **"أداة وتقارير UnityBridge"** داخل تطبيق الويب لتحديث قاعدة المعرفة والتحقق الفعلي.

---

## 3. استيراد مخطط JSON وإنشاء `ScriptGraphAsset`

1. صدّر حزمة المخطط (`JSON`) من تطبيق الويب بعد التأكد من اجتياز المدقق وحصوله على قابلية الاستيراد.
2. في نافذة `UVS Expert Bridge` داخل Unity، اختر ملف الـ JSON وحدد مسار الحفظ (مثلاً `Assets/VisualScripting/PlayerJump.asset`).
3. اضغط **`Validate & Create ScriptGraphAsset (With Backup)`**:
   - تتحقق الأداة أولاً من وجود جميع كلاسات العقد والمنافذ قبل لمس أي ملف.
   - إذا كان الأصل موجوداً مسبقاً، تنشئ الأداة تلقائياً نسخة احتياطية مؤرخة (`_backup_YYYYMMDD_HHMMSS.asset`) عبر `AssetDatabase.CopyAsset`.
   - تنشئ الأصل عبر `ScriptableObject.CreateInstance<ScriptGraphAsset>()` وتبني `FlowGraph` والـ `ControlConnection` والـ `ValueConnection` ومتغيرات `Graph`.

---

## 4. حدود التحقق والشفافية الهندسية

- **ما تم التحقق منه برمجياً في واجهات API:** أسماء الكلاسات (`ScriptGraphAsset`, `FlowGraph`, `IUnit`, `ControlConnection`, `ValueConnection`, `InvokeMember`, `GetMember`, `SetMember`, `Member`, `GetVariable`, `SetVariable`, `VariableKind`) متوافقة مع توثيق `com.unity.visualscripting` 1.7.x / 1.8.0 في Unity 2021.3 LTS، وتم تصميم نماذج JSON لتعمل مباشرة مع `UnityEngine.JsonUtility` دون حزم خارجية.
- **ما يتطلب الاختبار داخل محرر Unity الفعلي:** نظراً لأن بيئة الويب لا تشغّل محرك Unity ثنائي التجميع، يجب تنفيذ خطوة ` Regenerate Units` من `Project Settings > Visual Scripting` داخل Unity عند إضافة Custom Units جديدة، ومراجعة مراجع كائنات المشهد (`Scene Object References`) يدوياً لأن أصول `ScriptGraphAsset` المستقلة (Macro) لا يمكنها تخزين مراجع مباشرة لكائنات داخل المشهد (وهو قيد معماري أصيل في Unity).

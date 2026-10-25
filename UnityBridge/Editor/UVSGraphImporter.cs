using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
#if UVS_BRIDGE_ENABLED
using Unity.VisualScripting;
#endif

namespace UVSExpert.Bridge.Editor
{
    public class UVSImportResult
    {
        public bool success;
        public string createdAssetPath;
        public string backupAssetPath;
        public List<string> errors = new List<string>();
        public List<string> logs = new List<string>();
    }

    /// <summary>
    /// Validates incoming JSON from Unity Visual Scripting Expert and constructs a real ScriptGraphAsset
    /// using verified Unity.VisualScripting APIs. Creates an automatic backup before overwriting any existing asset.
    /// </summary>
    public static class UVSGraphImporter
    {
        public static UVSImportResult ValidateAndImportJson(string rawJson, string targetAssetPath)
        {
            var result = new UVSImportResult();

            if (string.IsNullOrWhiteSpace(rawJson))
            {
                result.errors.Add("ملف JSON فارغ.");
                return result;
            }

            UVSBridgeImportPayload payload = ExtractPayload(rawJson, result.errors);
            if (payload == null)
            {
                return result;
            }

            if (payload.formatVersion != "uvs-bridge-import-v1")
            {
                result.errors.Add($"تنسيق الاستيراد غير مدعوم: {payload.formatVersion}");
                return result;
            }

            if (!payload.importSupported)
            {
                result.errors.Add(
                    "هذا المخطط مُعلّم من التطبيق بأنه غير قابل للاستيراد الآلي المباشر: " +
                    (payload.unsupportedReasonAr ?? "راجع تقرير التنفيذ اليدوي المرفق.")
                );
                return result;
            }

#if !UVS_BRIDGE_ENABLED
            result.errors.Add("حزمة com.unity.visualscripting (>= 1.7.0) غير مثبتة في هذا المشروع.");
            return result;
#else
            return BuildScriptGraphAsset(payload, targetAssetPath, result);
#endif
        }

        private static UVSBridgeImportPayload ExtractPayload(string rawJson, List<string> errors)
        {
            try
            {
                if (rawJson.Contains("\"exportSchema\""))
                {
                    var envelope = JsonUtility.FromJson<UVSBundleEnvelope>(rawJson);
                    if (envelope != null && envelope.unityBridgePayload != null &&
                        !string.IsNullOrEmpty(envelope.unityBridgePayload.formatVersion))
                    {
                        return envelope.unityBridgePayload;
                    }
                }

                var direct = JsonUtility.FromJson<UVSBridgeImportPayload>(rawJson);
                if (direct == null || string.IsNullOrEmpty(direct.formatVersion))
                {
                    errors.Add("تعذر العثور على بنية unityBridgePayload الصالحة داخل ملف JSON.");
                    return null;
                }
                return direct;
            }
            catch (Exception ex)
            {
                errors.Add("فشل تحليل JSON عبر JsonUtility: " + ex.Message);
                return null;
            }
        }

#if UVS_BRIDGE_ENABLED
        private static UVSImportResult BuildScriptGraphAsset(
            UVSBridgeImportPayload payload,
            string targetAssetPath,
            UVSImportResult result)
        {
            if (string.IsNullOrWhiteSpace(targetAssetPath))
            {
                targetAssetPath = string.IsNullOrWhiteSpace(payload.targetAssetPathSuggestion)
                    ? "Assets/VisualScripting/ImportedFlowGraph.asset"
                    : payload.targetAssetPathSuggestion;
            }

            if (!targetAssetPath.StartsWith("Assets/") || !targetAssetPath.EndsWith(".asset"))
            {
                result.errors.Add("مسار الحفظ يجب أن يبدأ بـ Assets/ وينتهي بامتداد .asset");
                return result;
            }

            // 1. Pre-flight verification of all units BEFORE modifying any project asset
            var instantiatedUnits = new Dictionary<string, IUnit>();
            foreach (var unitDto in payload.units)
            {
                try
                {
                    IUnit unit = InstantiateVerifiedUnit(unitDto, result.logs);
                    if (unit == null)
                    {
                        result.errors.Add($"تعذر إنشاء الوحدة ({unitDto.unitClassName}) ذات المعرف ({unitDto.id}).");
                        return result;
                    }

                    unit.Define();
                    if (unitDto.position != null)
                    {
                        unit.position = new Vector2(unitDto.position.x, unitDto.position.y);
                    }

                    ApplyInlineDefaultValues(unit, unitDto, result.logs);
                    instantiatedUnits[unitDto.id] = unit;
                }
                catch (Exception ex)
                {
                    result.errors.Add($"خطأ أثناء تهيئة العقدة ({unitDto.unitClassName}): {ex.Message}");
                    return result;
                }
            }

            // 2. Verify all Control & Value port keys exist before writing asset
            foreach (var cc in payload.controlConnections)
            {
                if (!instantiatedUnits.TryGetValue(cc.sourceUnitId, out var src) ||
                    !instantiatedUnits.TryGetValue(cc.targetUnitId, out var dst))
                {
                    result.errors.Add($"وصلة تدفق تشير إلى عقدة غير موجودة ({cc.sourceUnitId} -> {cc.targetUnitId}).");
                    return result;
                }
                if (!src.controlOutputs.Contains(cc.sourcePortKey))
                {
                    result.errors.Add($"منفذ ControlOutput ({cc.sourcePortKey}) غير موجود في ({src.GetType().Name}).");
                    return result;
                }
                if (!dst.controlInputs.Contains(cc.targetPortKey))
                {
                    result.errors.Add($"منفذ ControlInput ({cc.targetPortKey}) غير موجود في ({dst.GetType().Name}).");
                    return result;
                }
            }

            foreach (var vc in payload.valueConnections)
            {
                if (!instantiatedUnits.TryGetValue(vc.sourceUnitId, out var src) ||
                    !instantiatedUnits.TryGetValue(vc.targetUnitId, out var dst))
                {
                    result.errors.Add($"وصلة بيانات تشير إلى عقدة غير موجودة ({vc.sourceUnitId} -> {vc.targetUnitId}).");
                    return result;
                }
                if (!src.valueOutputs.Contains(vc.sourcePortKey))
                {
                    result.errors.Add($"منفذ ValueOutput ({vc.sourcePortKey}) غير موجود في ({src.GetType().Name}).");
                    return result;
                }
                if (!dst.valueInputs.Contains(vc.targetPortKey))
                {
                    result.errors.Add($"منفذ ValueInput ({vc.targetPortKey}) غير موجود في ({dst.GetType().Name}).");
                    return result;
                }
            }

            // 3. Ensure directory exists & create automatic backup if target asset already exists
            string folder = Path.GetDirectoryName(targetAssetPath)?.Replace("\\", "/");
            if (!string.IsNullOrEmpty(folder) && !Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
                AssetDatabase.Refresh();
            }

            var existingAsset = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(targetAssetPath);
            if (existingAsset != null)
            {
                string timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
                string backupPath = targetAssetPath.Replace(".asset", $"_backup_{timestamp}.asset");
                if (AssetDatabase.CopyAsset(targetAssetPath, backupPath))
                {
                    result.backupAssetPath = backupPath;
                    result.logs.Add($"تم حفظ نسخة احتياطية للأصل السابق في: {backupPath}");
                }
                else
                {
                    result.errors.Add("فشل إنشاء نسخة احتياطية للأصل الموجود؛ تم إلغاء التعديل حفاظاً على بيانات المشروع.");
                    return result;
                }
            }

            // 4. Construct ScriptGraphAsset & FlowGraph
            var graphAsset = ScriptableObject.CreateInstance<ScriptGraphAsset>();
            var flowGraph = new FlowGraph();

            // Populate Graph-scoped variables
            foreach (var v in payload.variables)
            {
                if (v.scope == "Graph" && !string.IsNullOrEmpty(v.name))
                {
                    object parsedDefault = ParseLiteralValue(v.dataType, v.defaultValue);
                    flowGraph.variables.Set(v.name, parsedDefault);
                    result.logs.Add($"تم تسجيل متغير Graph: {v.name} ({v.dataType})");
                }
            }

            // Add Units
            foreach (var kv in instantiatedUnits)
            {
                flowGraph.units.Add(kv.Value);
            }

            // Add Control Connections
            foreach (var cc in payload.controlConnections)
            {
                var srcPort = instantiatedUnits[cc.sourceUnitId].controlOutputs[cc.sourcePortKey];
                var dstPort = instantiatedUnits[cc.targetUnitId].controlInputs[cc.targetPortKey];
                flowGraph.controlConnections.Add(new ControlConnection(srcPort, dstPort));
            }

            // Add Value Connections
            foreach (var vc in payload.valueConnections)
            {
                var srcPort = instantiatedUnits[vc.sourceUnitId].valueOutputs[vc.sourcePortKey];
                var dstPort = instantiatedUnits[vc.targetUnitId].valueInputs[vc.targetPortKey];
                flowGraph.valueConnections.Add(new ValueConnection(srcPort, dstPort));
            }

            graphAsset.graph = flowGraph;

            if (existingAsset != null)
            {
                AssetDatabase.DeleteAsset(targetAssetPath);
            }

            AssetDatabase.CreateAsset(graphAsset, targetAssetPath);
            EditorUtility.SetDirty(graphAsset);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            result.success = true;
            result.createdAssetPath = targetAssetPath;
            result.logs.Add($"تم إنشاء أصل ScriptGraphAsset بنجاح ({instantiatedUnits.Count} عقدة) في المسار: {targetAssetPath}");
            return result;
        }

        private static IUnit InstantiateVerifiedUnit(UVSUnitImportDto dto, List<string> logs)
        {
            string InlineStr(string key, string fallback = "")
            {
                var hit = dto.inlineEntries?.FirstOrDefault(e => e.key == key);
                return hit != null ? hit.stringValue : fallback;
            }

            // Reflection Member Units (InvokeMember / GetMember / SetMember)
            if (dto.originKind == "reflection" && dto.reflectionMember != null)
            {
                Type targetType = FindTypeAcrossAssemblies(dto.reflectionMember.targetType);
                if (targetType == null)
                {
                    logs.Add($"لم يتم العثور على النوع الهدف للانعكاس: {dto.reflectionMember.targetType}");
                    return null;
                }

                if (dto.unitClassName == "Unity.VisualScripting.InvokeMember")
                {
                    Type[] paramTypes = (dto.reflectionMember.parameterTypes ?? new List<string>())
                        .Select(FindTypeAcrossAssemblies)
                        .ToArray();
                    if (paramTypes.Any(t => t == null))
                    {
                        return null;
                    }
                    var member = new Member(targetType, dto.reflectionMember.memberName, paramTypes);
                    return new InvokeMember(member);
                }

                if (dto.unitClassName == "Unity.VisualScripting.GetMember")
                {
                    var member = new Member(targetType, dto.reflectionMember.memberName, Type.EmptyTypes);
                    return new GetMember(member);
                }

                if (dto.unitClassName == "Unity.VisualScripting.SetMember")
                {
                    var member = new Member(targetType, dto.reflectionMember.memberName, Type.EmptyTypes);
                    return new SetMember(member);
                }
            }

            // Special configurable built-in units
            if (dto.unitClassName == "Unity.VisualScripting.GetVariable")
            {
                var unit = new GetVariable();
                if (Enum.TryParse<VariableKind>(InlineStr("kind", "Graph"), out var kind))
                {
                    unit.kind = kind;
                }
                return unit;
            }

            if (dto.unitClassName == "Unity.VisualScripting.SetVariable")
            {
                var unit = new SetVariable();
                if (Enum.TryParse<VariableKind>(InlineStr("kind", "Graph"), out var kind))
                {
                    unit.kind = kind;
                }
                return unit;
            }

            if (dto.unitClassName == "Unity.VisualScripting.Sequence")
            {
                int steps = 2;
                int.TryParse(InlineStr("outputCount", "2"), out steps);
                return new Sequence(Mathf.Clamp(steps, 1, 10));
            }

            if (dto.unitClassName == "Unity.VisualScripting.Sum<System.Single>")
            {
                return new ScalarSum();
            }

            // Standard parameterless IUnit classes (Start, Update, If, Cooldown, WaitForSecondsUnit, Custom Units, etc.)
            Type unitType = FindTypeAcrossAssemblies(dto.unitClassName);
            if (unitType != null && typeof(IUnit).IsAssignableFrom(unitType))
            {
                var unit = (IUnit)Activator.CreateInstance(unitType);
                if (unit is IEventUnit eventUnit && InlineStr("coroutine", "false").Equals("true", StringComparison.OrdinalIgnoreCase))
                {
                    var prop = unitType.GetProperty("coroutine");
                    if (prop != null && prop.CanWrite)
                    {
                        prop.SetValue(unit, true);
                    }
                }
                return unit;
            }

            return null;
        }

        private static void ApplyInlineDefaultValues(IUnit unit, UVSUnitImportDto dto, List<string> logs)
        {
            if (dto.inlineEntries == null) return;

            foreach (var entry in dto.inlineEntries)
            {
                if (!unit.valueInputs.Contains(entry.key)) continue;
                var port = unit.valueInputs[entry.key];
                if (!port.hasDefaultValue && port.type == typeof(GameObject)) continue;

                try
                {
                    object parsed = ParseLiteralValue(port.type?.FullName ?? entry.valueType, entry.stringValue);
                    if (parsed != null)
                    {
                        port.SetDefaultValue(parsed);
                    }
                }
                catch (Exception ex)
                {
                    logs.Add($"تعذر تعيين القيمة الافتراضية للمنفذ ({entry.key}): {ex.Message}");
                }
            }
        }

        private static object ParseLiteralValue(string typeName, string raw)
        {
            if (raw == null || raw == "Self") return null;

            switch (typeName)
            {
                case "System.Single":
                    return float.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var f) ? f : 0f;
                case "System.Int32":
                    return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i) ? i : 0;
                case "System.Boolean":
                    return bool.TryParse(raw, out var b) && b;
                case "System.String":
                    return raw;
                case "UnityEngine.KeyCode":
                    return Enum.TryParse<KeyCode>(raw, true, out var kc) ? kc : KeyCode.Space;
                case "UnityEngine.ForceMode":
                    return Enum.TryParse<ForceMode>(raw, true, out var fm) ? fm : ForceMode.Impulse;
                case "UnityEngine.Vector3":
                    var cleaned3 = raw.Trim('(', ')', ' ');
                    var p3 = cleaned3.Split(',');
                    if (p3.Length == 3 &&
                        float.TryParse(p3[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var vx) &&
                        float.TryParse(p3[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var vy) &&
                        float.TryParse(p3[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var vz))
                    {
                        return new Vector3(vx, vy, vz);
                    }
                    return Vector3.zero;
                default:
                    return null;
            }
        }

        private static Type FindTypeAcrossAssemblies(string fullTypeName)
        {
            if (string.IsNullOrWhiteSpace(fullTypeName)) return null;
            var direct = Type.GetType(fullTypeName);
            if (direct != null) return direct;

            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (asm.IsDynamic) continue;
                var found = asm.GetType(fullTypeName);
                if (found != null) return found;
            }
            return null;
        }
#endif
    }
}

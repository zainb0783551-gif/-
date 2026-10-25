using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;
using UnityEngine.Rendering;
#if UVS_BRIDGE_ENABLED
using Unity.VisualScripting;
#endif

namespace UVSExpert.Bridge.Editor
{
    /// <summary>
    /// Scans the active Unity 2021.3 project for installed UPM packages, assemblies,
    /// built-in Visual Scripting units, and custom IUnit implementations.
    /// </summary>
    public static class UVSProjectScanner
    {
        public static UVSBridgeExportReport GenerateProjectReport(out List<string> warnings)
        {
            warnings = new List<string>();
            var report = new UVSBridgeExportReport
            {
                schemaIdentifier = "uvs-unity-bridge-report-v1",
                generatedAtUtc = DateTime.UtcNow.ToString("o"),
                unityVersion = Application.unityVersion,
                visualScriptingVersion = "uninstalled",
                renderPipeline = DetectRenderPipeline(),
                activeInputHandling = DetectActiveInputHandling()
            };

            // 1. Synchronous UPM Package list lookup
            try
            {
                var listRequest = Client.List(true, false);
                while (!listRequest.IsCompleted)
                {
                    // Editor utility synchronous wait
                }

                if (listRequest.Status == StatusCode.Success && listRequest.Result != null)
                {
                    foreach (var pkg in listRequest.Result)
                    {
                        report.installedPackages.Add(new UVSPackageRecord
                        {
                            name = pkg.name,
                            version = pkg.version,
                            source = pkg.source.ToString()
                        });

                        if (pkg.name == "com.unity.visualscripting")
                        {
                            report.visualScriptingVersion = pkg.version;
                        }
                    }
                }
                else if (listRequest.Error != null)
                {
                    warnings.Add("تعذر قراءة قائمة الحزم من PackageManager: " + listRequest.Error.message);
                }
            }
            catch (Exception ex)
            {
                warnings.Add("استثناء أثناء فحص الحزم: " + ex.Message);
            }

#if UVS_BRIDGE_ENABLED
            ScanVisualScriptingUnits(report, warnings);
#else
            warnings.Add("حزمة com.unity.visualscripting (>= 1.7.0) غير مفعلة حالياً؛ تم تصدير بيانات الحزم والمحرك فقط.");
#endif

            return report;
        }

        private static string DetectRenderPipeline()
        {
            var asset = GraphicsSettings.currentRenderPipeline;
            return asset == null ? "Built-in Render Pipeline" : asset.GetType().FullName;
        }

        private static string DetectActiveInputHandling()
        {
#if ENABLE_INPUT_SYSTEM && ENABLE_LEGACY_INPUT_MANAGER
            return "Both";
#elif ENABLE_INPUT_SYSTEM
            return "InputSystemPackage";
#else
            return "InputManagerLegacy";
#endif
        }

#if UVS_BRIDGE_ENABLED
        private static void ScanVisualScriptingUnits(UVSBridgeExportReport report, List<string> warnings)
        {
            var assemblies = AppDomain.CurrentDomain.GetAssemblies();
            foreach (var asm in assemblies)
            {
                if (asm.IsDynamic) continue;
                var asmName = asm.GetName().Name;
                report.assembliesScanned.Add(asmName);

                Type[] types;
                try
                {
                    types = asm.GetTypes();
                }
                catch (ReflectionTypeLoadException rtle)
                {
                    types = rtle.Types.Where(t => t != null).ToArray();
                }
                catch
                {
                    continue;
                }

                foreach (var type in types)
                {
                    if (type == null || type.IsAbstract || type.IsInterface || type.ContainsGenericParameters)
                        continue;

                    if (!typeof(IUnit).IsAssignableFrom(type))
                        continue;

                    // Only instantiate units that expose a parameterless constructor safely
                    var defaultCtor = type.GetConstructor(Type.EmptyTypes);
                    if (defaultCtor == null)
                        continue;

                    bool isBuiltIn = asmName.StartsWith("Unity.VisualScripting");
                    var dto = new UVSScannedUnitDto
                    {
                        unitClassName = type.FullName,
                        @namespace = type.Namespace ?? string.Empty,
                        assembly = asmName,
                        displayName = ExtractUnitTitle(type),
                        category = ExtractUnitCategory(type),
                        isCustomUnit = !isBuiltIn
                    };

                    try
                    {
                        var instance = (IUnit)Activator.CreateInstance(type);
                        instance.Define();

                        foreach (var ci in instance.controlInputs)
                        {
                            dto.controlInputs.Add(new UVSScannedPortDto
                            {
                                key = ci.key,
                                label = ci.key
                            });
                        }

                        foreach (var co in instance.controlOutputs)
                        {
                            dto.controlOutputs.Add(new UVSScannedPortDto
                            {
                                key = co.key,
                                label = co.key
                            });
                        }

                        foreach (var vi in instance.valueInputs)
                        {
                            dto.valueInputs.Add(new UVSScannedPortDto
                            {
                                key = vi.key,
                                label = vi.key,
                                dataType = vi.type != null ? vi.type.FullName : "System.Object",
                                hasDefaultValue = vi.hasDefaultValue
                            });
                        }

                        foreach (var vo in instance.valueOutputs)
                        {
                            dto.valueOutputs.Add(new UVSScannedPortDto
                            {
                                key = vo.key,
                                label = vo.key,
                                dataType = vo.type != null ? vo.type.FullName : "System.Object"
                            });
                        }

                        report.scannedUnits.Add(dto);
                    }
                    catch (Exception ex)
                    {
                        // Units requiring contextual parameters during Define() are logged transparently without crashing
                        if (!isBuiltIn)
                        {
                            warnings.Add($"تعذر استخراج منافذ الوحدة المخصصة {type.FullName} تلقائياً: {ex.Message}");
                        }
                    }
                }
            }
        }

        private static string ExtractUnitTitle(Type unitType)
        {
            var titleAttr = unitType.GetCustomAttribute<UnitTitleAttribute>(true);
            return titleAttr != null && !string.IsNullOrEmpty(titleAttr.title)
                ? titleAttr.title
                : unitType.Name;
        }

        private static string ExtractUnitCategory(Type unitType)
        {
            var catAttr = unitType.GetCustomAttribute<UnitCategory>(true);
            return catAttr != null && !string.IsNullOrEmpty(catAttr.fullName)
                ? catAttr.fullName
                : (unitType.Namespace ?? "Uncategorized");
        }
#endif
    }
}

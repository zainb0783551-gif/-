using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace UVSExpert.Bridge.Editor
{
    /// <summary>
    /// Unity 2021.3 Editor Window for Unity Visual Scripting Expert.
    /// Accessible via Menu: Tools > Unity Visual Scripting Expert > Bridge Window
    /// </summary>
    public class UVSExpertBridgeWindow : EditorWindow
    {
        private string _importJsonPath = "";
        private string _targetAssetPath = "Assets/VisualScripting/GeneratedGraph.asset";
        private Vector2 _scrollPos;
        private readonly List<string> _statusMessages = new List<string>();
        private MessageType _lastMessageType = MessageType.Info;

        [MenuItem("Tools/Unity Visual Scripting Expert/Bridge Window")]
        public static void ShowWindow()
        {
            var window = GetWindow<UVSExpertBridgeWindow>("UVS Expert Bridge");
            window.minSize = new Vector2(480, 420);
            window.Show();
        }

        private void OnGUI()
        {
            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("Unity Visual Scripting Expert — Editor Bridge (2021.3 LTS)", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "أداة محرر فقط (Editor-Only): تفحص الحزم والعقد المثبتة فعلياً لتصدير تقرير JSON موثق، وتبني أصول ScriptGraphAsset بعد التحقق وحفظ نسخة احتياطية.",
                MessageType.None
            );

            EditorGUILayout.Space(10);
            DrawExportSection();

            EditorGUILayout.Space(14);
            DrawImportSection();

            EditorGUILayout.Space(14);
            DrawLogsSection();
        }

        private void DrawExportSection()
        {
            EditorGUILayout.LabelField("1. فحص المشروع وتصدير تقرير المعرفة الفعلي", EditorStyles.boldLabel);
            if (GUILayout.Button("Scan Project & Export JSON Report...", GUILayout.Height(32)))
            {
                _statusMessages.Clear();
                var report = UVSProjectScanner.GenerateProjectReport(out var warnings);
                string savePath = EditorUtility.SaveFilePanel(
                    "Export UnityBridge Report",
                    Application.dataPath,
                    "unity_bridge_report.json",
                    "json"
                );

                if (!string.IsNullOrEmpty(savePath))
                {
                    string json = JsonUtility.ToJson(report, true);
                    File.WriteAllText(savePath, json);
                    _lastMessageType = warnings.Count > 0 ? MessageType.Warning : MessageType.Info;
                    _statusMessages.Add($"تم تصدير التقرير بنجاح إلى: {savePath}");
                    _statusMessages.Add($"إصدار المحرك: {report.unityVersion} | حزمة VS: {report.visualScriptingVersion}");
                    _statusMessages.Add($"إجمالي العقد المفحوصة: {report.scannedUnits.Count}");
                    _statusMessages.AddRange(warnings);
                }
            }
        }

        private void DrawImportSection()
        {
            EditorGUILayout.LabelField("2. التحقق واستيراد مخطط JSON إلى ScriptGraphAsset", EditorStyles.boldLabel);

            EditorGUILayout.BeginHorizontal();
            _importJsonPath = EditorGUILayout.TextField("ملف JSON المستلم", _importJsonPath);
            if (GUILayout.Button("Browse...", GUILayout.Width(85)))
            {
                string picked = EditorUtility.OpenFilePanel("Select UVS Expert JSON", Application.dataPath, "json");
                if (!string.IsNullOrEmpty(picked))
                {
                    _importJsonPath = picked;
                }
            }
            EditorGUILayout.EndHorizontal();

            _targetAssetPath = EditorGUILayout.TextField("مسار حفظ الـ Asset", _targetAssetPath);

            GUI.enabled = !string.IsNullOrEmpty(_importJsonPath) && File.Exists(_importJsonPath);
            if (GUILayout.Button("Validate & Create ScriptGraphAsset (With Backup)", GUILayout.Height(32)))
            {
                _statusMessages.Clear();
                string rawJson = File.ReadAllText(_importJsonPath);
                var importRes = UVSGraphImporter.ValidateAndImportJson(rawJson, _targetAssetPath);

                if (importRes.success)
                {
                    _lastMessageType = MessageType.Info;
                    _statusMessages.AddRange(importRes.logs);
                    var createdObj = AssetDatabase.LoadMainAssetAtPath(importRes.createdAssetPath);
                    if (createdObj != null)
                    {
                        Selection.activeObject = createdObj;
                        EditorGUIUtility.PingObject(createdObj);
                    }
                }
                else
                {
                    _lastMessageType = MessageType.Error;
                    _statusMessages.Add("فشل الاستيراد نتيجة أخطاء التحقق التالية:");
                    _statusMessages.AddRange(importRes.errors);
                }
            }
            GUI.enabled = true;
        }

        private void DrawLogsSection()
        {
            EditorGUILayout.LabelField("3. سجل نتائج الفحص والاستيراد", EditorStyles.boldLabel);
            if (_statusMessages.Count == 0)
            {
                EditorGUILayout.LabelField("لا توجد عمليات منفذة في هذه الجلسة بعد.", EditorStyles.miniLabel);
                return;
            }

            EditorGUILayout.HelpBox(string.Join("\n• ", _statusMessages), _lastMessageType);
            _scrollPos = EditorGUILayout.BeginScrollView(_scrollPos, GUILayout.MaxHeight(140));
            foreach (var msg in _statusMessages)
            {
                EditorGUILayout.SelectableLabel(msg, EditorStyles.wordWrappedMiniLabel, GUILayout.Height(20));
            }
            EditorGUILayout.EndScrollView();
        }
    }
}

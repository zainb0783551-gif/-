using System;
using System.Collections.Generic;

namespace UVSExpert.Bridge.Editor
{
    /// <summary>
    /// Serializable DTOs designed specifically for Unity 2021.3's native UnityEngine.JsonUtility
    /// (avoids Dictionary serialization limitations and requires zero third-party JSON packages).
    /// Editor-only: contains zero runtime game logic.
    /// </summary>
    [Serializable]
    public class UVSBridgeExportReport
    {
        public string schemaIdentifier = "uvs-unity-bridge-report-v1";
        public string generatedAtUtc;
        public string unityVersion;
        public string visualScriptingVersion;
        public string renderPipeline;
        public string activeInputHandling;
        public List<UVSPackageRecord> installedPackages = new List<UVSPackageRecord>();
        public List<string> assembliesScanned = new List<string>();
        public List<UVSScannedUnitDto> scannedUnits = new List<UVSScannedUnitDto>();
    }

    [Serializable]
    public class UVSPackageRecord
    {
        public string name;
        public string version;
        public string source;
    }

    [Serializable]
    public class UVSScannedPortDto
    {
        public string key;
        public string label;
        public string dataType;
        public bool hasDefaultValue;
    }

    [Serializable]
    public class UVSScannedUnitDto
    {
        public string unitClassName;
        public string @namespace;
        public string assembly;
        public string displayName;
        public string category;
        public bool isCustomUnit;
        public List<UVSScannedPortDto> controlInputs = new List<UVSScannedPortDto>();
        public List<UVSScannedPortDto> controlOutputs = new List<UVSScannedPortDto>();
        public List<UVSScannedPortDto> valueInputs = new List<UVSScannedPortDto>();
        public List<UVSScannedPortDto> valueOutputs = new List<UVSScannedPortDto>();
    }

    // =========================================================================
    // Import Payload DTOs (compatible with UnityEngine.JsonUtility.FromJson)
    // =========================================================================

    [Serializable]
    public class UVSBundleEnvelope
    {
        public string exportSchema;
        public UVSBridgeImportPayload unityBridgePayload;
    }

    [Serializable]
    public class UVSBridgeImportPayload
    {
        public string formatVersion;
        public bool importSupported;
        public string unsupportedReasonAr;
        public string targetAssetPathSuggestion;
        public List<UVSVariableDto> variables = new List<UVSVariableDto>();
        public List<UVSUnitImportDto> units = new List<UVSUnitImportDto>();
        public List<UVSConnectionDto> controlConnections = new List<UVSConnectionDto>();
        public List<UVSConnectionDto> valueConnections = new List<UVSConnectionDto>();
    }

    [Serializable]
    public class UVSVariableDto
    {
        public string id;
        public string name;
        public string scope;
        public string dataType;
        public string defaultValue;
        public string descriptionAr;
    }

    [Serializable]
    public class UVSNodePositionDto
    {
        public float x;
        public float y;
    }

    [Serializable]
    public class UVSInlineEntryDto
    {
        public string key;
        public string valueType;
        public string stringValue;
    }

    [Serializable]
    public class UVSReflectionMemberDto
    {
        public string targetType;
        public string memberName;
        public string memberKind;
        public List<string> parameterTypes = new List<string>();
        public string returnType;
        public bool isStatic;
    }

    [Serializable]
    public class UVSUnitImportDto
    {
        public string id;
        public string unitClassName;
        public string originKind;
        public UVSNodePositionDto position;
        public List<UVSInlineEntryDto> inlineEntries = new List<UVSInlineEntryDto>();
        public UVSReflectionMemberDto reflectionMember;
    }

    [Serializable]
    public class UVSConnectionDto
    {
        public string sourceUnitId;
        public string sourcePortKey;
        public string targetUnitId;
        public string targetPortKey;
    }
}

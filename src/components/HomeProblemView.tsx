import React, { useState } from 'react';
import {
  Upload,
  Play,
  AlertCircle,
  FileCode2,
  Layers,
  X,
  ArrowLeft,
} from 'lucide-react';
import { UnityProjectProfile } from '../types/uvs';
import {
  VERIFIED_PRESET_BLUEPRINTS,
  VerifiedPresetBlueprint,
} from '../knowledge-base/presetTemplates';

interface HomeProblemViewProps {
  profile: UnityProjectProfile;
  isAnalyzing: boolean;
  analysisError: string | null;
  onRunAnalysis: (payload: {
    problemText: string;
    errorLogText?: string;
    imageBase64?: string;
    imageMimeType?: string;
  }) => void;
  onLoadPreset: (preset: VerifiedPresetBlueprint) => void;
  onOpenSettings: () => void;
  onOpenEditor: () => void;
}

export const HomeProblemView: React.FC<HomeProblemViewProps> = ({
  profile,
  isAnalyzing,
  analysisError,
  onRunAnalysis,
  onLoadPreset,
  onOpenSettings,
  onOpenEditor,
}) => {
  const [problemText, setProblemText] = useState('');
  const [errorLogText, setErrorLogText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageMimeType, setImageMimeType] = useState<string | undefined>(undefined);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setImagePreview(result);
      const commaIdx = result.indexOf(',');
      if (commaIdx > 0) {
        setImageBase64(result.slice(commaIdx + 1));
        setImageMimeType(file.type || 'image/png');
      }
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageBase64(undefined);
    setImageMimeType(undefined);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemText.trim() || isAnalyzing) return;
    onRunAnalysis({
      problemText: problemText.trim(),
      errorLogText: errorLogText.trim() || undefined,
      imageBase64,
      imageMimeType,
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Hero / Context Strip */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/90">
          <div className="space-y-1.5 max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 tracking-tight text-balance">
              محرك تحليل وبناء مخططات Unity Visual Scripting
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              يحلل السلوك المطلوب أو أخطاء المخططات عبر 10 مراحل هندسية، ويختار العقد حصراً من قاعدة المعرفة الموثقة لإصدار Unity 2021.3 LTS، ثم يتحقق منها بمحرك تدقيق مستقل قبل التصدير.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono" dir="ltr">
            <span>Engine: {profile.unityVersion}</span>
            <span aria-hidden="true">·</span>
            <span>
              VS Package: {profile.vsPackageVersion ?? 'Unverified'}
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-sky-400 hover:underline font-sans cursor-pointer"
              dir="rtl"
            >
              ضبط الإصدار والملفات
            </button>
          </div>
        </div>

        {!profile.vsPackageVersion && (
          <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-800/60 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
            <span>
              لم يتم تأكيد إصدار حزمة Visual Scripting المثبت في مشروعك بعد. ارفع ملف packages-lock.json أو تقرير UnityBridge لضمان مطابقة 100% للإصدار.
            </span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-1.5 rounded bg-amber-400 text-slate-950 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              تحديد إصدار المشروع
            </button>
          </div>
        )}
      </section>

      {/* Main 2-Column Split: Problem Input Form + Quick Verified Blueprints */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Column (7 cols) */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="problem-input"
              className="block text-sm font-semibold text-slate-100"
            >
              وصف المشكلة البرمجية أو ميكانيكية اللعب المطلوبة
            </label>
            <p className="text-xs text-slate-400">
              اشرح السلوك المطلوب، الأحداث، شروط التوقف، أو المشكلة التي تواجهها في المخطط الحالي.
            </p>
            <textarea
              id="problem-input"
              rows={5}
              required
              value={problemText}
              onChange={(e) => setProblemText(e.target.value)}
              placeholder="مثال: أريد نظام التقاط عملات عند دخول اللاعب (Tag: Player) في منطقة Trigger، بحيث يزداد متغير Score بمقدار 10 مرة واحدة فقط دون تكرار، ثم يتم حذف العملة..."
              className="w-full px-3.5 py-3 rounded-lg bg-slate-950 border border-slate-700 focus:border-sky-400 focus:outline-none text-sm text-slate-100 leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="error-log-input"
              className="block text-xs font-semibold text-slate-200"
            >
              رسالة الخطأ من Unity Console (اختياري)
            </label>
            <textarea
              id="error-log-input"
              rows={2}
              value={errorLogText}
              onChange={(e) => setErrorLogText(e.target.value)}
              placeholder="InvalidOperationException: Coroutine cannot be started from Update..."
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-sky-400 focus:outline-none text-xs font-mono text-slate-200"
              dir="ltr"
            />
          </div>

          {/* Optional Diagram / Screenshot Attachment */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-200">
              إرفاق لقطة شاشة للمخطط أو الخطأ (اختياري)
            </span>
            {!imagePreview ? (
              <label className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg border border-dashed border-slate-700 hover:border-sky-400/70 bg-slate-950/60 text-xs text-slate-400 cursor-pointer transition-colors">
                <Upload className="w-4 h-4 text-sky-400" />
                <span>اختر صورة مخطط Visual Scripting (PNG / JPG)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="relative rounded-lg border border-slate-700 bg-slate-950 p-2">
                <img
                  src={imagePreview}
                  alt="معاينة صورة المخطط المرفقة"
                  referrerPolicy="no-referrer"
                  className="max-h-44 rounded object-contain mx-auto"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-3 left-3 p-1.5 rounded bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {analysisError && (
            <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/70 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">تعذر إتمام التحليل عبر الخادم</div>
                <p>{analysisError}</p>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="text-xs text-sky-300 font-medium">
                جاري تحليل المتطلبات، مطابقة قاعدة المعرفة، وتشغيل المدقق المستقل...
              </div>
              <div className="h-2 bg-slate-800 rounded overflow-hidden">
                <div className="h-full w-2/3 bg-sky-500/70 rounded" />
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              disabled={isAnalyzing || !problemText.trim()}
              className="px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>{isAnalyzing ? 'جاري التحليل وبناء المخطط...' : 'تحليل المشكلة وتوليد المخطط'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenEditor}
              className="px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>فتح محرر المخططات مباشرة</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Verified Starter Blueprints Column (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-100">
              مخططات مرجعية موثقة وجاهزة للتدقيق
            </h2>
            <p className="text-xs text-slate-400">
              افتح مخططاً مرجعياً مبنياً من عقد Unity 2021.3 الموثقة لاستعراض المحرر والمدقق والتصدير فوراً.
            </p>
          </div>

          <div className="space-y-3">
            {VERIFIED_PRESET_BLUEPRINTS.map((preset) => (
              <div
                key={preset.id}
                className="p-4 rounded-xl bg-[#111827] border border-slate-800 hover:border-slate-700 transition-colors space-y-2.5"
              >
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span>{preset.categoryAr}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{preset.graph.nodes.length} عقدة</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{preset.graph.connections.length} وصلة</span>
                </div>

                <h3 className="text-sm font-semibold text-slate-100">{preset.titleAr}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{preset.summaryAr}</p>

                <div className="pt-1 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setProblemText(preset.analysis.problemSummaryInput)
                    }
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span>نسخ نص المشكلة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoadPreset(preset)}
                    className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>تحميل المخطط والتحليل</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

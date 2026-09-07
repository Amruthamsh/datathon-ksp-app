import { useMemo, useRef, useState } from "react";
import { ScanLine, Loader2, Upload, Sparkles, Send, Eye, EyeOff, FileImage } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { analyzeDocumentImage } from "../api/ocr";

const KIND_STYLE = {
  fir_no: "border-red-600 text-red-700 bg-red-600/10",
  section: "border-amber-600 text-amber-800 bg-amber-500/10",
  vehicle: "border-blue-700 text-blue-800 bg-blue-600/10",
  phone: "border-green-700 text-green-800 bg-green-600/10",
  station: "border-purple-700 text-purple-800 bg-purple-600/10",
  date: "border-cyan-700 text-cyan-800 bg-cyan-600/10",
  name: "border-slate-700 text-slate-800 bg-slate-500/10",
  other: "border-slate-400 text-slate-600 bg-slate-400/10",
};

function makeSampleFIR() {
  // Demo-safe synthetic FIR rendered client-side — no PII, no asset needed.
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 800;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 1200, 800);
  g.fillStyle = "#0f172a";
  g.font = "bold 34px sans-serif";
  g.fillText("FIRST INFORMATION REPORT - KARNATAKA STATE POLICE", 60, 80);
  g.font = "26px sans-serif";
  const lines = [
    "Police Station: Whitefield PS, Bengaluru City   FIR No: 0234/2025",
    "Date: 12/07/2025   Time: 21:30   Act: BNS 303(2), 317(2)",
    "Complainant: Ramesh K, Ph: 98860 12345",
    "Place: ITPL Main Road, Whitefield",
    "Vehicle: KA-03-MN-4521 (Black Pulsar)",
    "Report: Two persons snatched mobile + bag at knife point,",
    "fled towards Hope Farm. Witness: Suresh, Shop No. 12.",
  ];
  lines.forEach((l, i) => g.fillText(l, 60, 150 + i * 52));
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}

export default function DocOcrPanel({ caseData, onAsk }) {
  const { token, officer } = useAuth();
  const lang = (officer?.language || "en").startsWith("kn") ? "kn" : "en";
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBoxes, setShowBoxes] = useState(true);
  const inputRef = useRef(null);

  const caseHint = useMemo(() => {
    if (!caseData) return "";
    return `Case ${caseData.CrimeNo || ""} ${caseData.CrimeGroupName || ""} PS:${caseData.UnitName || ""} Dist:${caseData.DistrictName || ""}`;
  }, [caseData]);

  const run = async (file) => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    setPreview(URL.createObjectURL(file));
    try {
      const res = await analyzeDocumentImage(token, file, { caseHint, language: lang });
      setResult(res);
    } catch (e) {
      setError(e.message || "OCR failed. Check backend / Groq key and retry.");
    } finally {
      setLoading(false);
    }
  };

  const useSample = async () => {
    const blob = await makeSampleFIR();
    await run(new File([blob], "sample-fir.png", { type: "image/png" }));
  };

  const entities = result?.entities || {};
  const chips = Object.entries(entities).flatMap(([k, vals]) =>
    (vals || []).map((v) => ({ group: k, value: v })),
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-900">
          <ScanLine size={14} /> Document OCR <span className="text-slate-400">· POC</span>
        </h3>
        {result?.blocks?.length > 0 && (
          <button
            onClick={() => setShowBoxes((s) => !s)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
          >
            {showBoxes ? <EyeOff size={12} /> : <Eye size={12} />}
            {showBoxes ? "Hide boxes" : "Show boxes"}
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <Upload size={13} /> Upload FIR / photo
          </button>
          <button
            onClick={useSample}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <FileImage size={13} /> Use sample FIR
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => run(e.target.files?.[0])}
          />
        </div>

        {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}

        {loading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Reading document + asking CrimeLens…
          </div>
        )}

        {preview && (
          <div className="relative mt-3 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            <img src={preview} alt="OCR input" className="block w-full" />
            {showBoxes &&
              (result?.blocks || []).map((b, i) => (
                <div
                  key={i}
                  title={`${b.text} (${Math.round(b.conf * 100)}%)`}
                  className={`group absolute border-2 ${KIND_STYLE[b.kind] || KIND_STYLE.other}`}
                  style={{
                    left: `${b.x / 10}%`,
                    top: `${b.y / 10}%`,
                    width: `${b.w / 10}%`,
                    height: `${b.h / 10}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 hidden whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:block">
                    {b.text} · {Math.round(b.conf * 100)}%
                  </span>
                  {b.kind !== "other" && (
                    <span className="absolute -top-2 -left-2 rounded-sm bg-slate-900 px-1 text-[9px] font-bold uppercase text-white">
                      {b.kind}
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}

        {result && (
          <div className="mt-3 space-y-3">
            <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3">
              <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-blue-900">
                <Sparkles size={11} /> Summary {result.crime_head && `· ${result.crime_head}`}
              </p>
              <p className="mt-1 text-[13px] leading-6 text-slate-800">{result.summary || "—"}</p>
              {result.insights?.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-6 text-slate-700">
                  {result.insights.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              <button
                onClick={() =>
                  onAsk?.(`OCR of uploaded document says: "${(result.ocr_text || "").slice(0, 600)}". Summary: ${result.summary}. How does this link to case ${caseData?.CrimeNo}?`)
                }
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-800"
              >
                <Send size={11} /> Ask CrimeLens about this
              </button>
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c, i) => (
                  <span
                    key={i}
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-800"
                    title={c.group}
                  >
                    {c.value}
                  </span>
                ))}
              </div>
            )}

            {result.verify?.length > 0 && (
              <p className="text-[11px] leading-relaxed text-amber-800">
                Verify against original: {result.verify.join(" · ")}
              </p>
            )}

            <details className="rounded-md border border-slate-200">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">
                Full OCR text ({result.ocr_text?.length || 0} chars)
              </summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-[11px] leading-5 text-slate-700">
                {result.ocr_text}
              </pre>
            </details>
          </div>
        )}

        {!preview && !loading && (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Upload a scanned FIR, complaint, seizure memo, number-plate or CCTV still. Boxes are
            colour-coded (red FIR-No, amber sections, blue vehicles, green phones) — hover any box
            for text + confidence.
          </p>
        )}
      </div>
    </div>
  );
}

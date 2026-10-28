import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Printer, AlertTriangle, CircleHelp, PenLine, Check, Loader2 } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getFinalReport } from "../api/investigations";

// Final Report (chargesheet) draft. Built server-side from case records only
// (services/final_report_service.py); every gap is shown as an IO task, never
// filled in. Printable via the browser (#final-report print rules in index.css).

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Todo({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[11.5px] font-medium text-amber-800 print:border-amber-600">
      <PenLine size={11} className="shrink-0" />
      {children}
    </span>
  );
}

// Renders a {value, todo} field from the API.
function Field({ f, render = (v) => v }) {
  if (!f) return "—";
  if (f.todo) return <Todo>{f.todo}</Todo>;
  return render(f.value);
}

function Section({ n, title, children }) {
  return (
    <section className="break-inside-avoid border-t border-slate-300 pt-3">
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-900">
        {n}. {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-3 py-1 text-[12.5px]">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900">{children}</span>
    </div>
  );
}

const FLAG_STYLE = {
  flag: { box: "border-red-200 bg-red-50 text-red-900", Icon: AlertTriangle },
  confirm: { box: "border-amber-200 bg-amber-50 text-amber-900", Icon: CircleHelp },
  todo: { box: "border-slate-200 bg-slate-50 text-slate-800", Icon: PenLine },
};

export default function FinalReportDraft({ caseId, onClose }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFinalReport(token, caseId)
      .then((r) => !cancelled && setData(r.data))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [token, caseId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const h = data?.header;
  const o = data?.offence;

  return (
    <div className="fixed inset-0 z-[120] flex justify-center overflow-y-auto bg-slate-900/50 px-3 py-6 print:static print:bg-white print:p-0" onClick={onClose}>
      <div
        id="final-report"
        role="dialog"
        aria-modal="true"
        aria-label={t("workspace.finalReport.title")}
        className="h-fit w-full max-w-[860px] rounded-lg bg-white shadow-2xl print:max-w-none print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="sticky -top-6 z-10 flex items-center justify-between gap-3 rounded-t-lg border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur print:hidden">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-red-700">
              {t("workspace.finalReport.eyebrow")}
            </p>
            <p className="truncate text-[13px] text-slate-600">
              {data ? t("workspace.finalReport.todoCount", { count: data.todo_count }) : t("workspace.finalReport.loading")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => window.print()}
              disabled={!data}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <Printer size={14} /> {t("workspace.finalReport.print")}
            </button>
            <button
              onClick={onClose}
              aria-label={t("workspace.finalReport.close")}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {error && <p className="p-8 text-sm text-slate-600">{t("workspace.finalReport.error")}</p>}
        {!data && !error && (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> {t("workspace.finalReport.loading")}
          </div>
        )}

        {data && (
          <div className="space-y-4 px-6 pb-8 pt-5 font-[Georgia,'Times_New_Roman',serif] print:px-0">
            {/* Title block */}
            <div className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                {t("workspace.finalReport.org")}
              </p>
              <h2 className="mt-1 text-[19px] font-bold text-slate-900">
                {t("workspace.finalReport.heading", { section: data.law.report_section })}
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-600">
                {t("workspace.finalReport.subheading", { type: h.report_type })}
              </p>
              <p className="mx-auto mt-2 w-fit rounded border border-red-300 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-red-700">
                {t("workspace.finalReport.draftStamp")}
              </p>
            </div>

            {/* What must be resolved before filing */}
            {data.flags.length > 0 && (
              <div className="space-y-1.5 font-sans print:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {t("workspace.finalReport.flagsTitle")}
                </p>
                {data.flags.map((f, i) => {
                  const st = FLAG_STYLE[f.level] || FLAG_STYLE.todo;
                  return (
                    <div key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[12.5px] leading-5 ${st.box}`}>
                      <st.Icon size={14} className="mt-0.5 shrink-0" />
                      <span>{f.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <Section n={1} title={t("workspace.finalReport.s1")}>
              <Row label={t("workspace.finalReport.district")}>{h.district}</Row>
              <Row label={t("workspace.finalReport.station")}>{h.station}</Row>
              <Row label={t("workspace.finalReport.fir")}>
                <span className="font-mono">{h.fir_no}</span> · {fmtDate(h.fir_date)}
              </Row>
              <Row label={t("workspace.finalReport.offenceDate")}>{fmtDate(h.offence_date)}</Row>
              <Row label={t("workspace.finalReport.reportNo")}><Field f={h.report_no} /></Row>
              <Row label={t("workspace.finalReport.reportDate")}><Field f={h.report_date} /></Row>
              <Row label={t("workspace.finalReport.court")}><Field f={h.court} /></Row>
              <Row label={t("workspace.finalReport.io")}>{h.io.name || "—"}{h.io.rank ? `, ${h.io.rank}` : ""}</Row>
              <Row label={t("workspace.finalReport.law")}>
                {data.law.substantive} · {data.law.procedure}
                {data.law.note ? <span className="text-slate-500"> — {data.law.note}</span> : null}
              </Row>
            </Section>

            <Section n={2} title={t("workspace.finalReport.s2")}>
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-3 font-semibold">{t("workspace.finalReport.act")}</th>
                    <th className="py-1 pr-3 font-semibold">{t("workspace.finalReport.section")}</th>
                    <th className="py-1 font-semibold">{t("workspace.finalReport.offence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {o.charges.map((c) => (
                    <tr key={`${c.act}-${c.section}`} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 font-semibold">{c.act}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.section}</td>
                      <td className="py-1.5">{c.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {o.punishment && (
                <p className="mt-2 text-[12px] text-slate-700">
                  <span className="text-slate-500">{t("workspace.finalReport.punishment")}:</span> {o.punishment} ·{" "}
                  {o.cognizable ? t("workspace.finalReport.cognizable") : t("workspace.finalReport.nonCognizable")} ·{" "}
                  {o.bailable ? t("workspace.finalReport.bailable") : t("workspace.finalReport.nonBailable")}
                </p>
              )}
              {o.recorded_sections.some((r) => !r.consistent) && (
                <p className="mt-1.5 font-sans text-[11.5px] text-red-700 print:hidden">
                  {t("workspace.finalReport.excluded")}:{" "}
                  {o.recorded_sections.filter((r) => !r.consistent).map((r) => (
                    <span key={`${r.act}-${r.section}`} className="mr-1.5 line-through">{r.act} {r.section}</span>
                  ))}
                </p>
              )}
            </Section>

            <Section n={3} title={t("workspace.finalReport.s3")}>
              <Row label={t("workspace.finalReport.complainant")}>
                {data.complainant ? `${data.complainant.name}, ${data.complainant.age ?? "—"} yrs` : <Todo>{t("workspace.finalReport.missing")}</Todo>}
              </Row>
              <Row label={t("workspace.finalReport.victims")}>
                {data.victims.length ? data.victims.map((v) => `${v.name}, ${v.age ?? "—"} yrs`).join("; ") : "—"}
              </Row>
            </Section>

            <Section n={4} title={t("workspace.finalReport.s4")}>
              <div className="space-y-2.5">
                {data.accused.map((a) => (
                  <div key={a.label} className="rounded-md border border-slate-200 p-3">
                    <p className="text-[13px] font-bold text-slate-900">
                      {a.label} · {a.name}
                      <span className="ml-2 font-normal text-slate-500">
                        {a.age ?? "—"} yrs{a.other_firs ? ` · ${t("workspace.finalReport.otherFirs", { count: a.other_firs })}` : ""}
                      </span>
                    </p>
                    <Row label={t("workspace.finalReport.parent")}><Field f={a.parent} /></Row>
                    <Row label={t("workspace.finalReport.address")}><Field f={a.address} /></Row>
                    <Row label={t("workspace.finalReport.arrest")}><Field f={a.arrest} render={fmtDate} /></Row>
                    <Row label={t("workspace.finalReport.custody")}><Field f={a.custody} /></Row>
                    {a.default_bail && (
                      <Row label={t("workspace.finalReport.defaultBail")}>
                        <span className={a.default_bail.band === "breached" ? "font-semibold text-red-700" : a.default_bail.band === "critical" ? "font-semibold text-orange-700" : ""}>
                          {a.default_bail.days_left < 0
                            ? t("workspace.finalReport.bailPassed", { date: fmtDate(a.default_bail.deadline), count: Math.abs(a.default_bail.days_left) })
                            : t("workspace.finalReport.bailBy", { date: fmtDate(a.default_bail.deadline), count: a.default_bail.days_left })}
                        </span>
                      </Row>
                    )}
                  </div>
                ))}
                {data.accused.length === 0 && <Todo>{t("workspace.finalReport.noAdults")}</Todo>}
              </div>
            </Section>

            {data.juveniles.length > 0 && (
              <Section n={5} title={t("workspace.finalReport.s5")}>
                <p className="text-[12.5px] text-slate-700">{t("workspace.finalReport.jjbNote")}</p>
                <ul className="mt-1.5 list-disc pl-5 text-[12.5px]">
                  {data.juveniles.map((j) => (
                    <li key={j.label}>{j.label} · {j.name}, {j.age} yrs</li>
                  ))}
                </ul>
              </Section>
            )}

            <Section n={data.juveniles.length ? 6 : 5} title={t("workspace.finalReport.s6")}>
              <table className="w-full border-collapse text-[12.5px]">
                <tbody>
                  {data.witnesses.map((w) => (
                    <tr key={w.label} className="border-b border-slate-100 align-top">
                      <td className="w-12 py-1.5 font-mono font-semibold">{w.label}</td>
                      <td className="py-1.5 pr-3">
                        {w.name || <Todo>{t("workspace.finalReport.names")}</Todo>}
                        <span className="block text-[11.5px] text-slate-500">{w.role}</span>
                      </td>
                      <td className="py-1.5"><Field f={w.proves} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section n={data.juveniles.length ? 7 : 6} title={t("workspace.finalReport.s7")}>
              <ul className="space-y-1 text-[12.5px]">
                {data.documents.map((d) => (
                  <li key={d.name} className="flex items-start gap-2">
                    {d.status === "on_record" ? (
                      <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                    ) : (
                      <PenLine size={13} className="mt-0.5 shrink-0 text-amber-600" />
                    )}
                    <span className={d.status === "on_record" ? "" : "text-amber-900"}>
                      {d.name}
                      {d.status !== "on_record" && (
                        <span className="ml-1.5 text-[11px] text-amber-700">— {t("workspace.finalReport.toAttach")}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section n={data.juveniles.length ? 8 : 7} title={t("workspace.finalReport.s8")}>
              <p className="text-[13px] leading-6 text-slate-900">{data.narrative.value}</p>
              <p className="mt-1.5"><Todo>{data.narrative.todo}</Todo></p>
            </Section>

            <Section n={data.juveniles.length ? 9 : 8} title={t("workspace.finalReport.s9", { section: data.law.procedure === "BNSS" ? "s.193(3) BNSS" : "s.173(2) CrPC" })}>
              <table className="w-full border-collapse text-[12.5px]">
                <tbody>
                  {data.disclosures.map((x, i) => (
                    <tr key={x.item} className="border-b border-slate-100 align-top">
                      <td className="w-6 py-1.5 text-slate-500">({String.fromCharCode(97 + i)})</td>
                      <td className="w-[46%] py-1.5 pr-3 text-slate-700">{x.item}</td>
                      <td className="py-1.5"><Field f={x.field} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.victim_update && (
                <p className="mt-2 text-[12px] text-slate-700">
                  {t("workspace.finalReport.victimUpdate", { date: fmtDate(data.victim_update.deadline) })}
                </p>
              )}
            </Section>

            {/* Signature block */}
            <div className="grid grid-cols-2 gap-8 pt-8 text-[12px] text-slate-600">
              <div className="border-t border-slate-400 pt-1">{t("workspace.finalReport.signIo")}</div>
              <div className="border-t border-slate-400 pt-1 text-right">{t("workspace.finalReport.signSho")}</div>
            </div>
            <p className="text-center font-sans text-[10.5px] text-slate-400">
              {t("workspace.finalReport.footer", { date: fmtDate(data.as_of) })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

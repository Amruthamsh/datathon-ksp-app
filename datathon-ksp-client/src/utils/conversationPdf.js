import { jsPDF } from "jspdf";
import { toCanvas } from "html-to-image";

// Conversation → PDF, fully client-side (the server PDF path needs
// Playwright, which isn't bundled on Catalyst). Each block is rendered by the
// browser and rasterised, so Kannada script prints exactly as on screen —
// jsPDF's built-in fonts have no Kannada glyphs.

const PAGE_W = 595.28; // A4 in pt
const PAGE_H = 841.89;
const MARGIN = 36;
const FOOTER = 22;
const RENDER_W = 760; // px width blocks are laid out at
const FOOTER_TEXT = "KSP CrimeLens  |  RESTRICTED - for official use  |  Answers generated from KSP crime records with read-only, audited queries";

function el(tag, style = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

const FONT =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Noto Sans Kannada', 'Kannada Sangam MN', sans-serif";

function headerBlock({ officer, conversationId, turns, labels }) {
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const row = (k, v) =>
    el("div", { display: "flex", gap: "8px", fontSize: "12px", lineHeight: "18px" }, [
      el("span", { color: "#64748b", width: "120px", flexShrink: "0" }, k),
      el("span", { color: "#0f172a", fontWeight: "600" }, v || "—"),
    ]);
  return el("div", { padding: "0 0 14px", borderBottom: "2px solid #17233c" }, [
    el("div", { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, [
      el("div", {}, [
        el("div", { fontSize: "11px", letterSpacing: "0.2em", color: "#c00000", fontWeight: "700" }, labels.org),
        el("div", { fontSize: "22px", fontWeight: "700", color: "#0f172a", marginTop: "4px" }, labels.title),
      ]),
      el(
        "div",
        {
          border: "1.5px solid #c00000",
          color: "#c00000",
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.14em",
          padding: "4px 8px",
          borderRadius: "4px",
        },
        labels.classification,
      ),
    ]),
    el("div", { marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }, [
      row(labels.officer, [officer?.full_name, officer?.rank_name || officer?.rank].filter(Boolean).join(", ")),
      row(labels.kgid, officer?.kgid),
      row(labels.jurisdiction, officer?.unit_name || officer?.district_name || officer?.district),
      row(labels.generated, `${now} IST`),
      row(labels.conversation, conversationId || labels.unsaved),
      row(labels.turns, String(turns)),
    ]),
  ]);
}

function cloneBubble(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll("button, [data-pdf-skip]").forEach((b) => b.remove());
  Object.assign(clone.style, { maxWidth: "100%", boxShadow: "none" });
  return clone;
}

function evidenceBlock(analysis, labels) {
  const parts = [];
  const rows = Array.isArray(analysis?.sql_result) ? analysis.sql_result : [];
  const audit = analysis?.audit;
  const guard = audit?.sql_guard;

  if (guard || analysis?.sql_query) {
    const ms = (audit?.trace || []).reduce((a, s) => a + (s.ms || 0), 0);
    const steps = (audit?.trace || []).filter((s) => !s.detail?.skipped).length;
    parts.push(
      el(
        "div",
        { fontSize: "11px", color: guard?.passed === false ? "#b42318" : "#166534", fontWeight: "600" },
        [
          guard?.passed === false ? `✕ ${guard.reason}` : `✓ ${labels.verified}`,
          steps ? ` · ${steps} ${labels.steps} · ${(ms / 1000).toFixed(1)}s` : "",
          guard?.tables?.length ? ` · ${labels.sources}: ${guard.tables.join(", ")}` : "",
          ` · ${rows.length} ${labels.rows}`,
        ],
      ),
    );
  }
  if (analysis?.sql_query) {
    parts.push(
      el(
        "pre",
        {
          margin: "6px 0 0",
          padding: "8px 10px",
          background: "#0f172a",
          color: "#e2e8f0",
          borderRadius: "6px",
          fontSize: "10px",
          lineHeight: "15px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "ui-monospace, Menlo, monospace",
        },
        analysis.sql_query,
      ),
    );
  }
  if (rows.length) {
    const cols = Object.keys(rows[0]).slice(0, 6);
    const shown = rows.slice(0, 8);
    const cell = { padding: "3px 6px", borderBottom: "1px solid #e2e8f0", fontSize: "10px", textAlign: "left" };
    parts.push(
      el("table", { marginTop: "6px", borderCollapse: "collapse", width: "100%" }, [
        el("thead", {}, el("tr", { background: "#f1f5f9" }, cols.map((c) => el("th", { ...cell, fontWeight: "700" }, c)))),
        el(
          "tbody",
          {},
          shown.map((r) => el("tr", {}, cols.map((c) => el("td", cell, String(r?.[c] ?? ""))))),
        ),
      ]),
    );
    if (rows.length > shown.length) {
      parts.push(
        el("div", { fontSize: "10px", color: "#64748b", marginTop: "3px" }, labels.moreRows.replace("{{count}}", rows.length - shown.length)),
      );
    }
  }
  if (!parts.length) return null;
  return el("div", { marginTop: "8px", paddingLeft: "10px", borderLeft: "3px solid #cbd5e1" }, parts);
}

function turnBlock(msg, bubble, labels, index) {
  const isUser = msg.role === "user";
  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })
    : "";
  return el("div", { padding: "12px 0", borderBottom: "1px solid #e2e8f0" }, [
    el("div", { display: "flex", justifyContent: "space-between", fontSize: "10.5px", fontWeight: "700", letterSpacing: "0.12em", color: isUser ? "#c00000" : "#17233c", marginBottom: "6px" }, [
      `${index}. ${isUser ? labels.question : labels.answer}`,
      el("span", { color: "#94a3b8", fontWeight: "500", letterSpacing: "0" }, time),
    ]),
    bubble ? cloneBubble(bubble) : el("div", { fontSize: "13px" }, msg.content || ""),
    !isUser ? evidenceBlock(msg.analysis, labels) : null,
  ]);
}

/**
 * @param messages   [{ msg, index }] chat turns (greeting excluded by caller)
 * @param getBubble  (index) => DOM node of the rendered bubble, or null
 */
export async function exportConversationPdf({ messages, getBubble, officer, conversationId, labels }) {
  const host = el("div", {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_W}px`,
    background: "#ffffff",
    fontFamily: FONT,
    color: "#0f172a",
  });
  document.body.appendChild(host);

  try {
    const blocks = [headerBlock({ officer, conversationId, turns: messages.filter(({ msg }) => msg.role === "user").length, labels })];
    let q = 0;
    messages.forEach(({ msg, index }) => {
      if (msg.role === "user") q += 1;
      blocks.push(turnBlock(msg, getBubble(index), labels, q));
    });
    blocks.forEach((b) => host.appendChild(el("div", { padding: "0 4px", background: "#fff" }, b)));

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const contentW = PAGE_W - MARGIN * 2;
    const bottom = PAGE_H - MARGIN - FOOTER;
    let y = MARGIN;

    for (const wrapper of Array.from(host.children)) {
      const canvas = await toCanvas(wrapper, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
      const scale = contentW / canvas.width;
      let srcY = 0;
      while (srcY < canvas.height) {
        const room = bottom - y;
        const remaining = (canvas.height - srcY) * scale;
        // Start a fresh page rather than splitting a short block.
        if (remaining > room && remaining <= bottom - MARGIN && y > MARGIN) {
          pdf.addPage();
          y = MARGIN;
          continue;
        }
        const sliceH = Math.min(canvas.height - srcY, Math.floor(room / scale));
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        slice.getContext("2d").drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN, y, contentW, sliceH * scale);
        y += sliceH * scale;
        srcY += sliceH;
        if (srcY < canvas.height) {
          pdf.addPage();
          y = MARGIN;
        }
      }
    }

    const pages = pdf.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      // Drawn as text with jsPDF's Latin-1 font — keep it English.
      pdf.text(FOOTER_TEXT, MARGIN, PAGE_H - MARGIN + 6);
      pdf.text(`${p} / ${pages}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 6, { align: "right" });
    }

    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    pdf.save(`KSP_CrimeLens_${officer?.kgid || "session"}_${stamp}.pdf`);
  } finally {
    host.remove();
  }
}

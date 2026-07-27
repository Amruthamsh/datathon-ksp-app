"""Lightweight markdown-to-HTML converter for LLM agent responses.

Handles the common markdown patterns produced by LangGraph agents:
bold, italic, inline code, headings, unordered lists, blockquotes,
horizontal rules, and paragraphs. No external dependencies.
"""

import re
from html import escape as _esc


def _inline(text: str) -> str:
    """Convert inline markdown (bold, italic, code) to HTML."""
    # Inline code first (protect from further processing)
    text = re.sub(
        r"`([^`]+)`",
        lambda m: f"<code>{_esc(m.group(1))}</code>",
        text,
    )
    # Bold + italic
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", text)
    # Bold
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    # Italic
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", text)
    return text


def markdown_to_html(text: str) -> str:
    """Convert a markdown string to HTML.

    Returns well-formed HTML suitable for embedding in a <div> or Jinja template.
    """
    if not text or not text.strip():
        return ""

    lines = text.split("\n")
    html_parts: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Blank line -> paragraph break
        if not stripped:
            i += 1
            continue

        # Horizontal rule
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", stripped):
            html_parts.append('<hr class="md-hr">')
            i += 1
            continue

        # Headings
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            content = _inline(heading_match.group(2))
            html_parts.append(f"<h{level}>{content}</h{level}>")
            i += 1
            continue

        # Blockquote
        if stripped.startswith(">"):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(
                    re.sub(r"^>\s?", "", lines[i].strip())
                )
                i += 1
            inner = markdown_to_html("\n".join(quote_lines))
            html_parts.append(f'<blockquote class="md-blockquote">{inner}</blockquote>')
            continue

        # Unordered list
        if re.match(r"^[-*+]\s+", stripped):
            items: list[str] = []
            while i < len(lines) and re.match(
                r"^[-*+]\s+", lines[i].strip()
            ):
                item_text = re.sub(r"^[-*+]\s+", "", lines[i].strip())
                items.append(f"<li>{_inline(item_text)}</li>")
                i += 1
            html_parts.append(
                "<ul>" + "".join(items) + "</ul>"
            )
            continue

        # Ordered list
        ol_match = re.match(r"^\d+\.\s+", stripped)
        if ol_match:
            items = []
            while i < len(lines) and re.match(
                r"^\d+\.\s+", lines[i].strip()
            ):
                item_text = re.sub(r"^\d+\.\s+", "", lines[i].strip())
                items.append(f"<li>{_inline(item_text)}</li>")
                i += 1
            html_parts.append(
                "<ol>" + "".join(items) + "</ol>"
            )
            continue

        # Paragraph: collect consecutive non-empty, non-special lines
        para_lines = []
        while i < len(lines):
            s = lines[i].strip()
            if (
                not s
                or s.startswith("#")
                or s.startswith(">")
                or re.match(r"^[-*+]\s+", s)
                or re.match(r"^\d+\.\s+", s)
                or re.match(r"^(-{3,}|\*{3,}|_{3,})$", s)
            ):
                break
            para_lines.append(s)
            i += 1
        if para_lines:
            html_parts.append(
                f"<p>{_inline(' '.join(para_lines))}</p>"
            )

    return "\n".join(html_parts)

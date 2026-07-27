"""Language detection for user queries.

Uses Unicode range detection as a lightweight fallback,
with optional langdetect for more accurate detection.
"""

import re


_KANNADA_RANGE = re.compile(r"[\u0C80-\u0CFF]")


def detect_language(text: str) -> str:
    """Detect whether text is primarily Kannada or English.

    Uses Unicode character ratio: if >=30% of alphabetic chars are
    Kannada script, classify as 'kn', otherwise 'en'.
    """
    if not text or not text.strip():
        return "en"

    alphabetic = [ch for ch in text if ch.isalpha()]
    if not alphabetic:
        return "en"

    kannada_count = sum(1 for ch in alphabetic if _KANNADA_RANGE.match(ch))
    ratio = kannada_count / len(alphabetic)

    return "kn" if ratio >= 0.3 else "en"

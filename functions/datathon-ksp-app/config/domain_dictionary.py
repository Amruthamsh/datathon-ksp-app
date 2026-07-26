"""Kannada-English domain dictionaries for KSP crime data.

Maps Kannada terms to their canonical English equivalents used in the
SQLite database. The agent uses these to resolve user input before
generating SQL, and to translate output back.
"""

# ── Crime Heads (Major Categories) ──────────────────────────────────────────

CRIME_HEAD_KN_EN: dict[str, str] = {
    "ದೈಹಿಕ ಅಪರಾಧಗಳು": "Crimes Against Body",
    "ಆಸ್ತಿ ಅಪರಾಧಗಳು": "Crimes Against Property",
    "ಮಹಿಳಾ ಅಪರಾಧಗಳು": "Crimes Against Women",
    "ಸಾರ್ವಜನಿಕ ಸುವ್ಯವಸ್ಥೆ ಅಪರಾಧಗಳು": "Crimes Against Public Order",
    "ಆರ್ಥಿಕ ಅಪರಾಧಗಳು": "Economic Offences",
}

CRIME_HEAD_EN_KN: dict[str, str] = {v: k for k, v in CRIME_HEAD_KN_EN.items()}

# ── Crime Sub-Heads (Specific Crime Types) ──────────────────────────────────

CRIME_SUBHEAD_KN_EN: dict[str, str] = {
    "ಕೊಲೆ": "Murder",
    "ಕೊಲೆ ಯತ್ನ": "Attempt to Murder",
    "ಗಂಭೀರ ಗಾಯ": "Grievous Hurt",
    "ದಾಳಿ": "Assault",
    "ಅಪಹರಣ": "Kidnapping",
    "ಕಳ್ಳತನ": "Theft",
    "ಮನೆ ಕಳ್ಳತನ": "Burglary",
    "ದರೋಡೆ": "Robbery",
    "ವಾಹನ ಕಳವು": "Vehicle Theft",
    "ಹಾನಿ": "Mischief",
    "ಗೃಹ ಹಿಂಸೆ": "Domestic Violence",
    "ದೌರ್ಜನ್ಯ ಕಿರುಕುಳ": "Dowry Harassment",
    "ಲೈಂಗಿಕ ದೌರ್ಜನ್ಯ": "Sexual Assault",
    "ಕಿರುಕುಳ": "Stalking",
    "ಗಲಾಟೆ": "Rioting",
    "ಅಕ್ರಮ ಸಭೆ": "Unlawful Assembly",
    "ಸಾರ್ವಜನಿಕ ತೊಂದರೆ": "Public Nuisance",
    "ವಂಚನೆ": "Cheating",
    "ಸೋಗು ಹಾಕುವಿಕೆ": "Forgery",
    "ವಿಶ್ವಾಸ ದ್ರೋಹ": "Criminal Breach of Trust",
    "ಸೈಬರ್ ಅಪರಾಧ": "Cybercrime / Online Fraud",
    "ಸೈಬರ್": "Cybercrime / Online Fraud",
    "ಆನ್ಲೈನ್ ವಂಚನೆ": "Cybercrime / Online Fraud",
}

CRIME_SUBHEAD_EN_KN: dict[str, str] = {v: k for k, v in CRIME_SUBHEAD_KN_EN.items()}

# ── Districts (31 Karnataka districts) ──────────────────────────────────────

DISTRICT_KN_EN: dict[str, str] = {
    "ಬಾಗಲಕೋಟೆ": "Bagalkot",
    "ಬಳ್ಳಾರಿ": "Ballari",
    "ಬೆಳಗಾವಿ": "Belagavi",
    "ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ": "Bengaluru Rural",
    "ಬೆಂಗಳೂರು ನಗರ": "Bengaluru Urban",
    "ಬೀದರ್": "Bidar",
    "ಚಾಮರಾಜನಗರ": "Chamarajanagar",
    "ಚಿಕ್ಕಬಲ್ಲಾಪುರ": "Chikballapur",
    "ಚಿಕ್ಕಮಗಳೂರು": "Chikkamagaluru",
    "ಚಿತ್ರದುರ್ಗ": "Chitradurga",
    "ದಕ್ಷಿಣ ಕನ್ನಡ": "Dakshina Kannada",
    "ದಾವಣಗೆರೆ": "Davanagere",
    "ಧಾರವಾಡ": "Dharwad",
    "ಗದಗ": "Gadag",
    "ಹಾಸನ": "Hassan",
    "ಹಾವೇರಿ": "Haveri",
    "ಕಲಬುರಗಿ": "Kalaburagi",
    "ಕೊಡಗು": "Kodagu",
    "ಕೋಲಾರ": "Kolar",
    "ಕೊಪ್ಪಳ": "Koppal",
    "ಮಂಡ್ಯ": "Mandya",
    "ಮೈಸೂರು": "Mysuru",
    "ರಾಯಚೂರು": "Raichur",
    "ರಾಮನಗರ": "Ramanagara",
    "ಶಿವಮೊಗ್ಗ": "Shivamogga",
    "ತುಮಕೂರು": "Tumakuru",
    "ಉಡುಪಿ": "Udupi",
    "ಉತ್ತರ ಕನ್ನಡ": "Uttara Kannada",
    "ವಿಜಯಪುರ": "Vijayapura",
    "ಯಾದಗಿರಿ": "Yadgir",
    "ವಿಜಯನಗರ": "Vijayanagara",
    # Common aliases
    "ಬೆಂಗಳೂರು": "Bengaluru Urban",
    "ಬೆಂಗಳೂರು ಸಿಟಿ": "Bengaluru Urban",
    "ಬೆಂಗಳೂರು ನಗರ ಜಿಲ್ಲೆ": "Bengaluru Urban",
    "Bangalore": "Bengaluru Urban",
    "Bengaluru": "Bengaluru Urban",
    "Bangalore Rural": "Bengaluru Rural",
    "Mysore": "Mysuru",
    "Mangalore": "Dakshina Kannada",
    "Hubli": "Dharwad",
    "Belgaum": "Belagavi",
    "Gulbarga": "Kalaburagi",
    "Bellary": "Ballari",
}

DISTRICT_EN_KN: dict[str, str] = {v: k for k, v in DISTRICT_KN_EN.items()}

# ── Case Status ─────────────────────────────────────────────────────────────

CASE_STATUS_KN_EN: dict[str, str] = {
    "ತನಿಖೆ ನಡೆಯುತ್ತಿದೆ": "Under Investigation",
    "ಚಾರ್ಜ್‌ಶೀಟ್ ಸಲ್ಲಿಸಲಾಗಿದೆ": "Charge Sheeted",
    "ಮುಚ್ಚಲಾಗಿದೆ": "Closed",
    "ದೋಷಾರೋಪಿಸಲಾಗಿದೆ": "Convicted",
    "ಖುಲಾಸೆಗೊಳಿಸಲಾಗಿದೆ": "Acquitted",
    "ವಿಚಾರಣೆ ಬಾಕಿ": "Pending Trial",
}

CASE_STATUS_EN_KN: dict[str, str] = {v: k for k, v in CASE_STATUS_KN_EN.items()}

# ── Gravity ─────────────────────────────────────────────────────────────────

GRAVITY_KN_EN: dict[str, str] = {
    "ಗಂಭೀರ": "Heinous",
    "ಗಂಭೀರವಲ್ಲದ": "Non-Heinous",
    "ಸಣ್ಣ": "Petty",
}

GRAVITY_EN_KN: dict[str, str] = {v: k for k, v in GRAVITY_KN_EN.items()}

# ── Police Ranks ────────────────────────────────────────────────────────────

RANK_KN_EN: dict[str, str] = {
    "ಮಹಾನಿರ್ದೇಶಕ ಮತ್ತು ಮಹಾ ನಿರ್ದೇಶಕ": "Director General of Police",
    "ಹೆಚ್ಚುವರಿ ಮಹಾನಿರ್ದೇಶಕ": "Additional Director General of Police",
    "ಪೊಲೀಸ್ ಮಹಾ ಇನ್ಸ್‌ಪೆಕ್ಟರ್ ಜನರಲ್": "Inspector General of Police",
    "ಉಪ ಪೊಲೀಸ್ ಮಹಾ ಇನ್ಸ್‌ಪೆಕ್ಟರ್ ಜನರಲ್": "Deputy Inspector General of Police",
    "ಪೊಲೀಸ್ ಅಧೀಕ್ಷಕ": "Superintendent of Police",
    "ಉಪ ಪೊಲೀಸ್ ಅಧೀಕ್ಷಕ": "Deputy Superintendent of Police",
    "ಇನ್ಸ್‌ಪೆಕ್ಟರ್": "Inspector",
    "ಸಬ್ ಇನ್ಸ್‌ಪೆಕ್ಟರ್": "Sub-Inspector",
    "ಸಹಾಯಕ ಸಬ್ ಇನ್ಸ್‌ಪೆಕ್ಟರ್": "Assistant Sub-Inspector",
    "ಹೆಡ್ ಕಾನ್ಸ್ಟೇಬಲ್": "Head Constable",
    "ಪೊಲೀಸ್ ಕಾನ್ಸ್ಟೇಬಲ್": "Police Constable",
}

RANK_EN_KN: dict[str, str] = {v: k for k, v in RANK_KN_EN.items()}

# ── Case Categories ─────────────────────────────────────────────────────────

CASE_CATEGORY_KN_EN: dict[str, str] = {
    "ಎಫ್‌ಐಆರ್": "FIR",
    "ಯುಡಿಆರ್": "UDR",
    "ಪಾರ್": "PAR",
    "ಜೀರೋ ಎಫ್‌ಐಆರ್": "Zero FIR",
}

CASE_CATEGORY_EN_KN: dict[str, str] = {v: k for k, v in CASE_CATEGORY_KN_EN.items()}

# ── Legal Acts ──────────────────────────────────────────────────────────────

ACT_KN_EN: dict[str, str] = {
    "ಭಾರತೀಯ ದಂಡ ಸಂಹಿತೆ": "IPC",
    "ಎನ್‌ಡಿಪಿಎಸ್": "NDPS",
    "ಪೋಕ್ಸೊ": "POCSO",
    "ಶಸ್ತ್ರ ಕಾಯ್ದೆ": "ARMS",
    "ಮೋಟಾರು ವಾಹನ ಕಾಯ್ದೆ": "MV",
    "ಮಾಹಿತಿ ತಂತ್ರಜ್ಞಾನ ಕಾಯ್ದೆ": "IT",
}

ACT_EN_KN: dict[str, str] = {v: k for k, v in ACT_KN_EN.items()}

# ── Police Station / Unit Types ─────────────────────────────────────────────

UNIT_TYPE_KN_EN: dict[str, str] = {
    "ರಾಜ್ಯ ಮುಖ್ಯಾಲಯ": "State Headquarters",
    "ಜಿಲ್ಲಾ ಪೊಲೀಸ್ ಕಚೇರಿ": "District Police Office",
    "ವೃತ್ತ ಕಚೇರಿ": "Circle Office",
    "ಪೊಲೀಸ್ ಠಾಣೆ": "Police Station",
}

UNIT_TYPE_EN_KN: dict[str, str] = {v: k for k, v in UNIT_TYPE_KN_EN.items()}

# ── Gender ──────────────────────────────────────────────────────────────────

GENDER_KN_EN: dict[str, str] = {
    "ಪುರುಷ": "Male",
    "ಮಹಿಳೆ": "Female",
    "ತೃತೀಯ ಲಿಂಗಿ": "Transgender",
}

GENDER_EN_KN: dict[str, str] = {v: k for k, v in GENDER_KN_EN.items()}

# ── Religion ────────────────────────────────────────────────────────────────

RELIGION_KN_EN: dict[str, str] = {
    "ಹಿಂದೂ": "Hindu",
    "ಮುಸ್ಲಿಂ": "Muslim",
    "ಕ್ರೈಸ್ತ": "Christian",
    "ಸಿಖ್": "Sikh",
    "ಜೈನ": "Jain",
    "ಬೌದ್ಧ": "Buddhist",
    "ಇತರೆ": "Other",
}

RELIGION_EN_KN: dict[str, str] = {v: k for k, v in RELIGION_KN_EN.items()}

# ── Common Query Terms ──────────────────────────────────────────────────────

QUERY_TERM_KN_EN: dict[str, str] = {
    "ಪ್ರಕರಣಗಳು": "cases",
    "ಪ್ರಕರಣ": "case",
    "ಆರೋಪಿಗಳು": "accused",
    "ಆರೋಪಿ": "accused",
    "ಬಾಧಿತರು": "victims",
    "ಬಾಧಿತ": "victim",
    "ಠಾಣೆ": "police station",
    "ಠಾಣೆಗಳು": "police stations",
    "ಜಿಲ್ಲೆ": "district",
    "ಜಿಲ್ಲೆಗಳು": "districts",
    "ಎಫ್‌ಐಆರ್‌ಗಳು": "FIRs",
    "ಎಫ್‌ಐಆರ್": "FIR",
    "ಬಂಧನ": "arrest",
    "ಬಂಧನಗಳು": "arrests",
    "ಚಾರ್ಜ್‌ಶೀಟ್": "chargesheet",
    "ಚಾರ್ಜ್‌ಶೀಟ್‌ಗಳು": "chargesheets",
    "ಕೊಲೆ": "murder",
    "ಕಳ್ಳತನ": "theft",
    "ದರೋಡೆ": "robbery",
    "ವಾಹನ ಕಳವು": "vehicle theft",
    "ವಂಚನೆ": "cheating",
    "ಸೈಬರ್ ಅಪರಾಧ": "cybercrime",
    "ಕಳೆದ ತಿಂಗಳು": "last month",
    "ಕಳೆದ ವಾರ": "last week",
    "ಕಳೆದ ವರ್ಷ": "last year",
    "ಈ ತಿಂಗಳು": "this month",
    "ಈ ವರ್ಷ": "this year",
    "ಹೆಚ್ಚು": "most",
    "ಕಡಿಮೆ": "least",
    "ಶ್ರೇಷ್ಠ": "top",
    "ಎಷ್ಟು": "how many",
    "ಯಾವುದು": "which",
    "ಯಾವುದು": "which",
    "ಎಲ್ಲಿ": "where",
    "ಯಾವಾಗ": "when",
    "ಯಾಕೆ": "why",
    "ಹೇಗೆ": "how",
    "ಪಟ್ಟಿ": "list",
    "ವಿಶ್ಲೇಷಣೆ": "analysis",
    "ಅಂಕಿಅಂಶಗಳು": "statistics",
    "ಪ್ರವೃತ್ತಿ": "trend",
    "ಹೆಚ್ಚಳ": "increase",
    "ಕಡಿಮೆಯಾಗುವಿಕೆ": "decrease",
}

QUERY_TERM_EN_KN: dict[str, str] = {v: k for k, v in QUERY_TERM_KN_EN.items()}


def resolve_district(name: str) -> str | None:
    """Resolve any Kannada/English district variant to canonical English name."""
    if name in DISTRICT_KN_EN:
        return DISTRICT_KN_EN[name]
    if name in DISTRICT_EN_KN:
        return name  # Already English canonical
    # Case-insensitive English match
    name_lower = name.lower()
    for en_name in DISTRICT_EN_KN:
        if en_name.lower() == name_lower:
            return en_name
    return None


def resolve_crime_head(name: str) -> str | None:
    """Resolve Kannada/English crime head to canonical English name."""
    if name in CRIME_HEAD_KN_EN:
        return CRIME_HEAD_KN_EN[name]
    if name in CRIME_HEAD_EN_KN:
        return name
    name_lower = name.lower()
    for en_name in CRIME_HEAD_EN_KN:
        if en_name.lower() == name_lower:
            return en_name
    return None


def resolve_crime_subhead(name: str) -> str | None:
    """Resolve Kannada/English crime sub-head to canonical English name."""
    if name in CRIME_SUBHEAD_KN_EN:
        return CRIME_SUBHEAD_KN_EN[name]
    if name in CRIME_SUBHEAD_EN_KN:
        return name
    name_lower = name.lower()
    for en_name in CRIME_SUBHEAD_EN_KN:
        if en_name.lower() == name_lower:
            return en_name
    return None


def resolve_case_status(name: str) -> str | None:
    """Resolve Kannada/English case status to canonical English name."""
    if name in CASE_STATUS_KN_EN:
        return CASE_STATUS_KN_EN[name]
    if name in CASE_STATUS_EN_KN:
        return name
    name_lower = name.lower()
    for en_name in CASE_STATUS_EN_KN:
        if en_name.lower() == name_lower:
            return en_name
    return None


def resolve_gravity(name: str) -> str | None:
    """Resolve Kannada/English gravity to canonical English name."""
    if name in GRAVITY_KN_EN:
        return GRAVITY_KN_EN[name]
    if name in GRAVITY_EN_KN:
        return name
    name_lower = name.lower()
    for en_name in GRAVITY_EN_KN:
        if en_name.lower() == name_lower:
            return en_name
    return None


def get_all_domainictionaries() -> dict[str, dict]:
    """Return all dictionaries for inclusion in LLM prompts."""
    return {
        "crime_heads": CRIME_HEAD_KN_EN,
        "crime_subheads": CRIME_SUBHEAD_KN_EN,
        "districts": DISTRICT_KN_EN,
        "case_statuses": CASE_STATUS_KN_EN,
        "gravity_levels": GRAVITY_KN_EN,
        "ranks": RANK_KN_EN,
        "case_categories": CASE_CATEGORY_KN_EN,
        "acts": ACT_KN_EN,
        "unit_types": UNIT_TYPE_KN_EN,
        "genders": GENDER_KN_EN,
        "religions": RELIGION_KN_EN,
    }

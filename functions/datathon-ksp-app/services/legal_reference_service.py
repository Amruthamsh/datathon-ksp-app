"""Legal Reference (Codebook) service — deterministic section lookup.

Covers IPC (+ BNS equivalents), NDPS, POCSO, Arms Act, IT Act, MV Act:
section title, plain-language meaning, punishment range, bailability,
cognizability, and reference links.

Mirrors ``datathon-ksp-client/src/data/actSectionMetadata.json`` so the
chat agent and the analysis workspace share one canonical source without
an extra data file in the deploy bundle.

Usage:
    from services.legal_reference_service import find_legal_references, build_legal_context
    refs = find_legal_references("What is IPC 302 punishment? Is it bailable?")
"""

import re

# ── Canonical codebook ────────────────────────────────────────────────────
# act -> { full_name, note, indiacode_url, kanoon_url, sections: { num -> {...} } }

_CODEBOOK = {
    "IPC": {
        "full_name": "Indian Penal Code, 1860",
        "note": "Replaced by Bharatiya Nyaya Sanhita (BNS) from 1 July 2024. Cases before that date continue under IPC.",
        "indiacode_url": "https://www.indiacode.nic.in/handle/123456789/12850",
        "kanoon_url": "https://indiankanoon.org/search/?formInput=Indian+Penal+Code",
        "sections": {
            "302": {"title": "Murder", "plain_language": "Causing the death of a person with intention to kill or with knowledge that the act is likely to cause death.", "offence_category": "Violent / Against Person", "cognizable": True, "bailable": False, "punishment": "Death or Life Imprisonment + fine", "bns_equivalent": "103"},
            "307": {"title": "Attempt to Murder", "plain_language": "Attempting to cause the death of a person with intention to kill. The victim survives.", "offence_category": "Violent / Against Person", "cognizable": True, "bailable": False, "punishment": "Up to 10 years + fine; Life imprisonment if hurt caused", "bns_equivalent": "109"},
            "323": {"title": "Voluntarily Causing Hurt", "plain_language": "Deliberately causing bodily pain, disease, or infirmity to another person (simple hurt, not grievous).", "offence_category": "Violent / Against Person", "cognizable": False, "bailable": True, "punishment": "Up to 1 year imprisonment or fine up to \u20b91,000, or both", "bns_equivalent": "115"},
            "324": {"title": "Voluntarily Causing Hurt by Dangerous Weapon", "plain_language": "Causing bodily hurt using a knife, fire, poison, or any instrument that can cause death or grievous hurt.", "offence_category": "Violent / Against Person", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment or fine, or both", "bns_equivalent": "118"},
            "354": {"title": "Assault or Criminal Force on Woman (Outraging Modesty)", "plain_language": "Using assault or criminal force against a woman with the intent to outrage or knowing it will outrage her modesty.", "offence_category": "Against Women", "cognizable": True, "bailable": False, "punishment": "1 to 5 years imprisonment + fine", "bns_equivalent": "74"},
            "376": {"title": "Rape", "plain_language": "Sexual intercourse by a man with a woman without her consent or under coercion/fraud/fear.", "offence_category": "Against Women", "cognizable": True, "bailable": False, "punishment": "Rigorous imprisonment of not less than 10 years, up to life + fine", "bns_equivalent": "64"},
            "379": {"title": "Theft", "plain_language": "Dishonestly taking movable property out of the possession of a person without their consent.", "offence_category": "Property Offence", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment or fine, or both", "bns_equivalent": "303"},
            "392": {"title": "Robbery", "plain_language": "Theft or extortion with the use of or threat of force \u2014 theft that escalates to use of violence.", "offence_category": "Property Offence", "cognizable": True, "bailable": False, "punishment": "Up to 10 years + fine; 14 years if on highway", "bns_equivalent": "309"},
            "406": {"title": "Criminal Breach of Trust", "plain_language": "Dishonestly misappropriating or converting to one's own use property entrusted to them.", "offence_category": "Financial / Fraud", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment or fine, or both", "bns_equivalent": "316"},
            "420": {"title": "Cheating and Dishonestly Inducing Delivery of Property", "plain_language": "Deceiving a person and thereby dishonestly inducing them to hand over property or to alter/destroy a valuable document.", "offence_category": "Financial / Fraud", "cognizable": True, "bailable": False, "punishment": "Up to 7 years imprisonment + fine", "bns_equivalent": "318"},
            "498A": {"title": "Cruelty by Husband or Relatives of Husband", "plain_language": "Subjecting a woman to cruelty by her husband or his relatives \u2014 includes physical/mental harassment and dowry-related coercion.", "offence_category": "Against Women / Domestic Violence", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment + fine", "bns_equivalent": "85"},
        },
    },
    "BNS": {
        "full_name": "Bharatiya Nyaya Sanhita, 2023",
        "note": "Replaces the Indian Penal Code for offences on/after 1 July 2024.",
        "indiacode_url": "https://www.indiacode.nic.in/handle/123456789/4655",
        "kanoon_url": "https://indiankanoon.org/search/?formInput=Bharatiya+Nyaya+Sanhita",
        "sections": {
            "103": {"title": "Murder (BNS)", "plain_language": "BNS successor to IPC 302 — causing death with intention to kill or knowledge it is likely to cause death.", "offence_category": "Violent / Against Person", "cognizable": True, "bailable": False, "punishment": "Death or Life Imprisonment + fine", "ipc_equivalent": "302"},
            "109": {"title": "Attempt to Murder (BNS)", "plain_language": "BNS successor to IPC 307 — attempt to cause death where the victim survives.", "offence_category": "Violent / Against Person", "cognizable": True, "bailable": False, "punishment": "Up to 10 years + fine; Life imprisonment if hurt caused", "ipc_equivalent": "307"},
            "115": {"title": "Voluntarily Causing Hurt (BNS)", "plain_language": "BNS successor to IPC 323 — deliberately causing simple hurt.", "offence_category": "Violent / Against Person", "cognizable": False, "bailable": True, "punishment": "Up to 1 year imprisonment or fine up to \u20b91,000, or both", "ipc_equivalent": "323"},
            "118": {"title": "Hurt by Dangerous Weapon (BNS)", "plain_language": "BNS successor to IPC 324 — hurt caused with a dangerous weapon or means.", "offence_category": "Violent / Against Person", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment or fine, or both", "ipc_equivalent": "324"},
            "74": {"title": "Outraging Modesty of Woman (BNS)", "plain_language": "BNS successor to IPC 354.", "offence_category": "Against Women", "cognizable": True, "bailable": False, "punishment": "1 to 5 years imprisonment + fine", "ipc_equivalent": "354"},
            "64": {"title": "Rape (BNS)", "plain_language": "BNS successor to IPC 376.", "offence_category": "Against Women", "cognizable": True, "bailable": False, "punishment": "Rigorous imprisonment of not less than 10 years, up to life + fine", "ipc_equivalent": "376"},
            "303": {"title": "Theft (BNS)", "plain_language": "BNS successor to IPC 379.", "offence_category": "Property Offence", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment or fine, or both", "ipc_equivalent": "379"},
            "309": {"title": "Robbery (BNS)", "plain_language": "BNS successor to IPC 392.", "offence_category": "Property Offence", "cognizable": True, "bailable": False, "punishment": "Up to 10 years + fine; 14 years if on highway", "ipc_equivalent": "392"},
            "316": {"title": "Criminal Breach of Trust (BNS)", "plain_language": "BNS successor to IPC 406.", "offence_category": "Financial / Fraud", "cognizable": True, "bailable": False, "punishment": "Up to 5 years imprisonment or fine, or both", "ipc_equivalent": "406"},
            "318": {"title": "Cheating (BNS)", "plain_language": "BNS successor to IPC 420.", "offence_category": "Financial / Fraud", "cognizable": True, "bailable": False, "punishment": "Up to 7 years imprisonment + fine", "ipc_equivalent": "420"},
            "85": {"title": "Cruelty by Husband or Relatives (BNS)", "plain_language": "BNS successor to IPC 498A.", "offence_category": "Against Women / Domestic Violence", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment + fine", "ipc_equivalent": "498A"},
        },
    },
    "NDPS": {
        "full_name": "Narcotic Drugs and Psychotropic Substances Act, 1985",
        "note": "",
        "indiacode_url": "https://www.indiacode.nic.in/handle/123456789/1392",
        "kanoon_url": "https://indiankanoon.org/search/?formInput=NDPS+Act",
        "sections": {
            "8": {"title": "Prohibition of Certain Operations", "plain_language": "Core prohibition section \u2014 makes it illegal to cultivate, produce, manufacture, possess, sell, purchase, transport, use or consume any narcotic drug or psychotropic substance.", "offence_category": "Narcotics", "cognizable": True, "bailable": False, "punishment": "Varies by quantity (small / intermediate / commercial) \u2014 see Sections 15\u201322"},
            "20": {"title": "Punishment for Contravention relating to Cannabis", "plain_language": "Punishment for producing, possessing, selling, buying, transporting or using cannabis (ganja, charas, etc.).", "offence_category": "Narcotics", "cognizable": True, "bailable": False, "punishment": "Small qty: up to 1 year; Intermediate: up to 10 years; Commercial qty: 10\u201320 years rigorous imprisonment"},
            "21": {"title": "Punishment for Contravention relating to Manufactured Drugs", "plain_language": "Punishment for offences related to manufactured drugs (e.g. heroin, morphine) and preparations containing them.", "offence_category": "Narcotics", "cognizable": True, "bailable": False, "punishment": "Small qty: up to 1 year; Intermediate: up to 10 years; Commercial qty: 10\u201320 years rigorous imprisonment"},
            "22": {"title": "Punishment for Contravention relating to Psychotropic Substances", "plain_language": "Punishment for offences relating to psychotropic substances (e.g. amphetamines, LSD, certain prescription drugs misused).", "offence_category": "Narcotics", "cognizable": True, "bailable": False, "punishment": "Small qty: up to 1 year; Intermediate: up to 10 years; Commercial qty: 10\u201320 years rigorous imprisonment"},
        },
    },
    "POCSO": {
        "full_name": "Protection of Children from Sexual Offences Act, 2012",
        "note": "",
        "indiacode_url": "https://www.indiacode.nic.in/handle/123456789/2079",
        "kanoon_url": "https://indiankanoon.org/search/?formInput=POCSO+Act",
        "sections": {
            "4": {"title": "Punishment for Penetrative Sexual Assault", "plain_language": "Punishment for penetrative sexual assault on a child (under 18). Covers acts defined under Section 3.", "offence_category": "Child Sexual Offence", "cognizable": True, "bailable": False, "punishment": "Minimum 10 years (20 years if the child is below 16), up to life imprisonment + fine"},
            "6": {"title": "Punishment for Aggravated Penetrative Sexual Assault", "plain_language": "Aggravated form \u2014 offence committed by police, armed forces, public servant, or in a position of trust/authority; or on a child below 12.", "offence_category": "Child Sexual Offence", "cognizable": True, "bailable": False, "punishment": "Minimum 20 years up to Life Imprisonment or Death + fine"},
            "8": {"title": "Punishment for Sexual Assault", "plain_language": "Sexual assault on a child (non-penetrative but with sexual intent \u2014 touching private parts, etc.).", "offence_category": "Child Sexual Offence", "cognizable": True, "bailable": False, "punishment": "3 to 5 years imprisonment + fine"},
            "10": {"title": "Punishment for Aggravated Sexual Assault", "plain_language": "Aggravated form of sexual assault \u2014 by police, armed forces, or persons in authority over the child.", "offence_category": "Child Sexual Offence", "cognizable": True, "bailable": False, "punishment": "5 to 7 years imprisonment + fine"},
        },
    },
    "ARMS": {
        "full_name": "Arms Act, 1959",
        "note": "",
        "indiacode_url": "https://www.indiacode.nic.in/handle/123456789/1398",
        "kanoon_url": "https://indiankanoon.org/search/?formInput=Arms+Act",
        "sections": {
            "25": {"title": "Punishment for Certain Offences (Unlicensed Arms)", "plain_language": "Possessing, carrying, or using firearms or ammunition without a valid license.", "offence_category": "Arms / Weapons", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment or fine, or both; enhanced for prohibited arms"},
            "27": {"title": "Punishment for Using Arms, etc.", "plain_language": "Using any firearm or imitation firearm in contravention of law \u2014 discharging a weapon in public or threatening with it.", "offence_category": "Arms / Weapons", "cognizable": True, "bailable": False, "punishment": "Minimum 3 years up to 7 years imprisonment"},
        },
    },
    "MV": {
        "full_name": "Motor Vehicles Act, 1988",
        "note": "",
        "indiacode_url": "https://www.indiacode.nic.in/handle/123456789/1798",
        "kanoon_url": "https://indiankanoon.org/search/?formInput=Motor+Vehicles+Act",
        "sections": {
            "184": {"title": "Driving Dangerously", "plain_language": "Driving a motor vehicle at a speed or in a manner which is dangerous to the public, given road/traffic conditions.", "offence_category": "Road Safety", "cognizable": True, "bailable": True, "punishment": "First offence: up to 6 months or \u20b91,000\u20135,000; Second offence: up to 2 years or \u20b910,000"},
            "185": {"title": "Driving by a Drunken Person or by a Person under the Influence of Drugs", "plain_language": "Driving while blood alcohol content exceeds the legal limit (30 mg/100 ml) or under influence of drugs.", "offence_category": "Road Safety", "cognizable": True, "bailable": True, "punishment": "First offence: up to 6 months or \u20b910,000; Second offence: up to 2 years or \u20b915,000"},
            "196": {"title": "Driving an Uninsured Vehicle", "plain_language": "Driving a motor vehicle in a public place without a valid third-party insurance policy.", "offence_category": "Road Safety / Documentation", "cognizable": False, "bailable": True, "punishment": "Up to 3 months imprisonment or \u20b92,000 fine, or both"},
        },
    },
    "IT": {
        "full_name": "Information Technology Act, 2000",
        "note": "",
        "indiacode_url": "https://www.indiacode.nic.in/handle/123456789/1999",
        "kanoon_url": "https://indiankanoon.org/search/?formInput=Information+Technology+Act",
        "sections": {
            "66": {"title": "Computer Related Offences", "plain_language": "Dishonestly or fraudulently doing any act prohibited under Section 43 \u2014 includes hacking, unauthorized access, data theft, virus spreading.", "offence_category": "Cybercrime", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment or \u20b95 lakh fine, or both"},
            "66C": {"title": "Punishment for Identity Theft", "plain_language": "Fraudulently or dishonestly using another person's electronic signature, password, or unique identification feature.", "offence_category": "Cybercrime", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment + \u20b91 lakh fine"},
            "66D": {"title": "Punishment for Cheating by Personation using Computer Resource", "plain_language": "Cheating someone by pretending to be another person using a computer, mobile, or communication device (e.g. fake profiles, phishing).", "offence_category": "Cybercrime", "cognizable": True, "bailable": False, "punishment": "Up to 3 years imprisonment + \u20b91 lakh fine"},
            "67": {"title": "Punishment for Publishing Obscene Material in Electronic Form", "plain_language": "Publishing or transmitting obscene material (text, image, video) in electronic form that would deprave and corrupt readers/viewers.", "offence_category": "Cybercrime / Obscenity", "cognizable": True, "bailable": False, "punishment": "First: up to 3 years + \u20b95 lakh fine; Second: up to 5 years + \u20b910 lakh fine"},
        },
    },
}

# ── Act aliases → canonical key ───────────────────────────────────────────

_ACT_ALIASES = {
    "ipc": "IPC",
    "i.p.c": "IPC",
    "indian penal code": "IPC",
    "bns": "BNS",
    "b.n.s": "BNS",
    "bnss": "BNS",
    "bharatiya nyaya sanhita": "BNS",
    "bharatiya nagarik suraksha sanhita": "BNS",
    "ndps": "NDPS",
    "narcotic": "NDPS",
    "pocso": "POCSO",
    "posco": "POCSO",
    "arms": "ARMS",
    "arm": "ARMS",
    "arms act": "ARMS",
    "it act": "IT",
    "information technology": "IT",
    "i.t. act": "IT",
    "mv act": "MV",
    "motor vehicles": "MV",
    "mva": "MV",
}

# Matches "IPC 302", "Section 302 IPC", "U/s 376 IPC", "NDPS Act Section 20",
# "POCSO 4", "Arms Act 25", "IT Act 66C", "BNS 103", "498A IPC".
_SECTION_RE = re.compile(
    r"(?:\b(?P<act1>IPC|BNS|BNSS|NDPS|POCSO|POSCO|ARMS?|IT|MV)\b[\s.,-]*(?:Act)?[\s.,-]*"
    r"(?:Sec(?:tion)?s?\.?|S\/s|U\/s)?[\s.,-]*)?"
    r"(?P<section>\d{1,3}[A-Z]{0,3}(?:\(\d+\))?)"
    r"(?:[\s.,-]*\b(?P<act2>IPC|BNS|BNSS|NDPS|POCSO|POSCO|ARMS?|IT|MV)\b)?",
    re.I,
)

# Triggers that suggest a legal-reference question even without an
# explicit "ACT + number" pair (e.g. "punishment for murder?").
_LEGAL_HINT_RE = re.compile(
    r"\b(section|u\/s|under section|punishment|bailable|bail|non-?bailable|cognizable|"
    r"sentence|imprisonment|fine|ipc|bns|bnss|ndps|pocso|arms?\s*act|it\s*act|"
    r"kanoon|indiacode|chargesheet\s*section|what\s+law|which\s+section)\b",
    re.I,
)


def _normalize_act(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().lower().rstrip("s") if raw.strip().lower() not in ("arms",) else "arms"
    key = raw.strip().lower()
    if key in _ACT_ALIASES:
        return _ACT_ALIASES[key]
    upper = raw.strip().upper()
    return upper if upper in _CODEBOOK else None


def _kanoon_url(act: str, section: str) -> str:
    base = "https://indiankanoon.org/search/?formInput="
    return f"{base}{act}+Section+{section}"


def lookup(act: str, section: str) -> dict | None:
    """Direct codebook lookup. Returns a reference dict or None."""
    act_key = _normalize_act(act)
    if not act_key or act_key not in _CODEBOOK:
        return None
    sec_key = str(section).strip().upper()
    entry = _CODEBOOK[act_key]["sections"].get(sec_key)
    if not entry:
        # Try without parenthetical sub-section, e.g. "303(2)" -> "303"
        m = re.match(r"(\d+[A-Z]*)", sec_key)
        if m:
            entry = _CODEBOOK[act_key]["sections"].get(m.group(1))
            if not entry:
                return None
        else:
            return None
    meta = _CODEBOOK[act_key]
    return {
        "act": act_key,
        "act_full_name": meta["full_name"],
        "act_note": meta.get("note", ""),
        "section": sec_key,
        "title": entry["title"],
        "plain_language": entry["plain_language"],
        "offence_category": entry.get("offence_category", ""),
        "cognizable": bool(entry.get("cognizable")),
        "bailable": bool(entry.get("bailable")),
        "punishment": entry.get("punishment", ""),
        "ipc_equivalent": entry.get("ipc_equivalent", ""),
        "bns_equivalent": entry.get("bns_equivalent", ""),
        "source": "codebook",
        "kanoon_url": _kanoon_url(act_key, sec_key),
        "indiacode_url": meta.get("indiacode_url", ""),
    }


def extract_act_sections(text: str) -> list[tuple[str | None, str]]:
    """Extract (act, section) candidate pairs from free text."""
    found: list[tuple[str | None, str]] = []
    seen: set[tuple[str, str]] = set()
    for m in _SECTION_RE.finditer(text or ""):
        section = (m.group("section") or "").strip().upper()
        if not section or not re.match(r"^\d", section):
            continue
        # Skip years / quantities (4-digit numbers) and tiny fragments
        if re.fullmatch(r"\d{4}", section):
            continue
        act = _normalize_act(m.group("act1") or m.group("act2") or "")
        key = (act or "", section)
        if key in seen:
            continue
        seen.add(key)
        found.append((act, section))
    return found[:8]


def is_legal_query(text: str) -> bool:
    """Heuristic: does this look like a section-lookup question?"""
    return bool(_LEGAL_HINT_RE.search(text or ""))


def _resolve_bare_section(section: str) -> list[dict]:
    """A bare number (no act) — return matches across all acts."""
    refs = []
    for act_key in _CODEBOOK:
        ref = lookup(act_key, section)
        if ref:
            refs.append(ref)
    return refs


def find_legal_references(query: str, evidence_text: str = "") -> list[dict]:
    """Deterministic lookup over the query (+ optional evidence text).

    - Explicit "ACT + number" pairs resolve directly.
    - Bare numbers resolve only when the text is clearly a legal question
      (avoids turning every FIR number / year into a section card).
    - Unknown ACT+number pairs return a placeholder with source
      "codebook-missing" so the workspace shows what was looked up and the
      LLM fills the substance.
    """
    haystack = f"{query or ''}\n{evidence_text or ''}"
    pairs = extract_act_sections(haystack)
    legal = is_legal_query(haystack)
    refs: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for act, section in pairs:
        if act:
            ref = lookup(act, section)
            if ref:
                key = (ref["act"], ref["section"])
                if key not in seen:
                    seen.add(key)
                    refs.append(ref)
            elif legal:
                # Known act, unknown section — still surface a card so the
                # workspace shows what was looked up; the LLM answers substance.
                key = (act, section)
                if key not in seen:
                    seen.add(key)
                    meta = _CODEBOOK.get(act, {})
                    refs.append({
                        "act": act,
                        "act_full_name": meta.get("full_name", act),
                        "act_note": meta.get("note", ""),
                        "section": section,
                        "title": "",
                        "plain_language": "",
                        "offence_category": "",
                        "cognizable": None,
                        "bailable": None,
                        "punishment": "",
                        "ipc_equivalent": "",
                        "bns_equivalent": "",
                        "source": "codebook-missing",
                        "kanoon_url": _kanoon_url(act, section),
                        "indiacode_url": meta.get("indiacode_url", ""),
                    })
        elif legal:
            for ref in _resolve_bare_section(section):
                key = (ref["act"], ref["section"])
                if key not in seen:
                    seen.add(key)
                    refs.append(ref)
        if len(refs) >= 6:
            break
    return refs[:6]


def build_legal_context(refs: list[dict]) -> str:
    """Compact citable block injected into LLM prompts + workspace."""
    if not refs:
        return ""
    lines = ["Legal Codebook references for this turn (cite these exact values — punishment, bailability, cognizability):"]
    for r in refs:
        if r.get("source") == "codebook-missing":
            lines.append(
                f"- {r['act']} Section {r['section']}: NOT in the local codebook "
                f"— answer from statute knowledge; flag verification via IndiaCode/Indian Kanoon ({r.get('kanoon_url', '')})."
            )
            continue
        bail = "Bailable" if r.get("bailable") else "Non-bailable"
        cog = "Cognizable" if r.get("cognizable") else "Non-cognizable"
        equiv = ""
        if r.get("bns_equivalent"):
            equiv = f" | BNS equivalent: {r['bns_equivalent']}"
        elif r.get("ipc_equivalent"):
            equiv = f" | IPC equivalent: {r['ipc_equivalent']}"
        lines.append(
            f"- {r['act']} Section {r['section']} — {r['title']}{equiv} | "
            f"{r['plain_language']} | Punishment: {r['punishment']} | "
            f"{bail}, {cog}."
        )
    return "\n".join(lines)

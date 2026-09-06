"""Standalone AI case briefing service.

Mirrors how the crime-intelligence-map exposes dedicated endpoints
(patrol-recommendations, prevention-plan): the briefing is generated
server-side from case facts so the frontend calls one purpose-built API
instead of the generic chat /generate endpoint.
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _get_llm():
    """Lazy LLM access — keeps Catalyst cold starts light (no import at startup)."""
    try:
        from llm.groq_service import groq_service
        if not os.getenv("GROQ_API_KEY"):
            return None
        return groq_service
    except Exception as e:
        print(f"LLM unavailable: {e}")
        return None


def build_case_brief_prompt(details: Dict[str, Any], intel: Dict[str, Any]) -> str:
    accused = intel.get("accused") or []
    accused_names = ", ".join(a.get("AccusedName", "—") for a in accused) or "—"
    acts = intel.get("acts") or []
    charges = "; ".join(
        f"{a.get('ActID', '—')} Section {a.get('SectionID', '—')}" for a in acts
    ) or "—"

    return (
        "Facts: Crime %(crime_no)s registered %(registered)s at %(station)s, "
        "%(district)s district. Category: %(group)s; Gravity: %(gravity)s. "
        "Charges: %(charges)s. Status: %(status)s. "
        "Accused (%(accused_n)d): %(accused)s. Victims: %(victim_n)d. "
        "Investigating officer: %(io)s."
        % {
            "crime_no": details.get("CrimeNo", "—"),
            "registered": details.get("CrimeRegisteredDate", "—"),
            "station": details.get("UnitName", "—"),
            "district": details.get("DistrictName", "—"),
            "group": details.get("CrimeGroupName") or details.get("CrimeHeadName", "—"),
            "gravity": details.get("Gravity", "—"),
            "charges": charges,
            "status": details.get("CaseStatusName", "open"),
            "accused_n": len(accused),
            "accused": accused_names,
            "victim_n": len(intel.get("victims") or []),
            "io": details.get("FirstName", "—"),
        }
    )


def generate_case_brief(
    details: Dict[str, Any],
    intel: Dict[str, Any],
    language: str = "en",
) -> Optional[Dict[str, str]]:
    """Generate a short narrative briefing. Returns None when the LLM is unavailable."""
    llm = _get_llm()
    if llm is None:
        return None

    lang_name = "Kannada" if str(language).startswith("kn") else "English"
    system_prompt = (
        "You are CrimeLens, an investigative analyst for Karnataka State Police. "
        f"Write a vivid but professional case briefing in {lang_name} for the "
        "investigating officer: two short paragraphs narrating what happened, "
        "who is involved, and where the case stands — then one 'Focus now:' line "
        "naming the single most urgent next step. Under 120 words. Plain "
        "professional language, no template filler, no greetings."
    )
    try:
        text = llm.generate(build_case_brief_prompt(details, intel), system_prompt).strip()
    except Exception as e:
        print(f"Case brief generation failed: {e}")
        return None

    if not text:
        return None
    return {
        "brief": text,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

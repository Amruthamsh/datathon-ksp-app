import json
import os

def _get_llm():
    try:
        from llm.groq_service import groq_service
        if not os.getenv("GROQ_API_KEY"):
            return None
        return groq_service
    except Exception:
        return None

SYSTEM_PROMPT = """You are KSP CrimeLens Cyber Intelligence Advisor for Karnataka State Police.
You generate non-physical, intelligence-led response plans for cybercrime / online fraud.
Physical patrol routes are INEFFECTIVE for cybercrime. Instead recommend:
- Cyber Crime Cell deployment, digital forensics, SOC monitoring
- Victim awareness & prevention drives
- Payment gateway / telecom coordination
- Dark-web / OSINT monitoring
Always structure output as valid JSON with keys:
{
  "threat_summary": "2-3 sentence spike assessment",
  "why_no_physical_patrol": "1 sentence",
  "digital_strategy": [{"title": "...", "detail": "...", "priority": "High/Medium/Low"}],
  "station_actions": [{"station": "...", "action": "..."}],
  "awareness_plan": [{"audience": "...", "channel": "...", "message": "..."}],
  "metrics_to_track": ["..."]
}
Keep it concise, operational, Karnataka context. Use English. No markdown code fences.
"""

def build_user_prompt(stats, district, crime_label, time_range):
    return f"""
District: {district or "All Karnataka"}
Crime: {crime_label}
Time focus: {time_range}
Stats (last 30d vs prior 30d):
- Total cases (30d): {stats.get('total_30d', 0)}
- Previous 30d: {stats.get('prev_30d', 0)}
- Change: {stats.get('change_pct', 0)}%
- Top stations: {json.dumps(stats.get('top_stations', [])[:5])}
- Hot stations repeat offenders: {stats.get('repeat_offenders', 0)}
Generate cyber response plan JSON.
"""

HEURISTIC_FALLBACK = {
    "threat_summary": "Cybercrime spike indicates organized online fraud activity requiring digital response, not physical patrol.",
    "why_no_physical_patrol": "Cybercrime has no fixed geographic hotspot; offenders operate via phones/internet across jurisdictions.",
    "digital_strategy": [
        {"title": "Cyber Crime Cell surge", "detail": "Deploy 2 digital forensics analysts per district to triage 1930 reports within 2h", "priority": "High"},
        {"title": "Payment gateway triage", "detail": "Coordinate with banks for lien marking on beneficiary accounts within golden hour", "priority": "High"},
        {"title": "OSINT & telecom coord", "detail": "Track mule SIMs / UPI IDs via CEIR and telecom nodal officers", "priority": "Medium"},
    ],
    "station_actions": [],
    "awareness_plan": [
        {"audience": "General public", "channel": "SMS / Radio", "message": "KSP never asks for OTP; report on 1930 immediately"},
        {"audience": "Students / elders", "channel": "School camps", "message": "Loan / lottery fraud awareness"},
    ],
    "metrics_to_track": ["1930 report-to-lien time", "Amount put on hold", "Repeat mule accounts blocked"],
}

def generate_cyber_advisory(stats, district, crime_label="Cybercrime / Online Fraud", time_range="night"):
    llm = _get_llm()
    if not llm:
        data = dict(HEURISTIC_FALLBACK)
        data["station_actions"] = [{"station": s["station"], "action": f"Appoint cyber nodal officer; review {s['count']} cases for mule account linkage"} for s in stats.get("top_stations", [])[:3]]
        data["_llm"] = "heuristic"
        return data
    try:
        user_prompt = build_user_prompt(stats, district, crime_label, time_range)
        raw = llm.generate(user_prompt=user_prompt, system_prompt=SYSTEM_PROMPT)
        # strip fences
        if raw.startswith("```"):
            raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        parsed["_llm"] = "groq"
        return parsed
    except Exception as e:
        print(f"cyber llm failed {e}")
        data = dict(HEURISTIC_FALLBACK)
        data["station_actions"] = [{"station": s["station"], "action": f"Review {s['count']} cases; coordinate with bank nodal"} for s in stats.get("top_stations", [])[:3]]
        data["_error"] = str(e)
        data["_llm"] = "heuristic-fallback"
        return data

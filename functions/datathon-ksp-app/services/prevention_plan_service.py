import json
import os
from typing import Dict, Any

def _get_llm():
    try:
        from llm.groq_service import groq_service
        if not os.getenv("GROQ_API_KEY"):
            return None
        return groq_service
    except Exception as e:
        print(f"LLM unavailable: {e}")
        return None

# Mapping crime subhead -> deployment archetype for prompt guidance
CRIME_ARCHETYPE = {
    # Body
    "Murder": "homicide_prevention",
    "Attempt to Murder": "homicide_prevention",
    "Grievous Hurt": "assault_prevention",
    "Assault": "assault_prevention",
    "Kidnapping": "kidnapping_response",
    # Property
    "Theft": "property_patrol",
    "Burglary": "property_patrol",
    "Robbery": "property_patrol",
    "Vehicle Theft": "vehicle_patrol",
    "Mischief": "property_patrol",
    # Women
    "Domestic Violence": "women_safety",
    "Dowry Harassment": "women_safety",
    "Sexual Assault": "women_safety",
    "Stalking": "women_safety",
    # Public Order
    "Rioting": "public_order",
    "Unlawful Assembly": "public_order",
    "Public Nuisance": "public_order",
    # Economic / Cyber
    "Cheating": "economic_cell",
    "Forgery": "economic_cell",
    "Criminal Breach of Trust": "economic_cell",
    "Cybercrime / Online Fraud": "cyber_cell",
    # Groups
    "Crimes Against Body": "homicide_prevention",
    "Crimes Against Property": "property_patrol",
    "Crimes Against Women": "women_safety",
    "Crimes Against Public Order": "public_order",
    "Economic Offences": "economic_cell",
}

ARCHETYPE_GUIDANCE = {
    "homicide_prevention": "Physical surveillance, history-sheeters check, weapon seizure drives, beat patrol at peak hours",
    "assault_prevention": "Beat patrol, de-escalation, hotspot nakabandi, repeat offender tracking",
    "kidnapping_response": "Checkpoint deployment, CCTV tracing, missing-person SOP",
    "property_patrol": "Night patrol, nakabandi at entry/exit points, CCTV, second-hand dealer checks",
    "vehicle_patrol": "Vehicle naka, parking lot surveillance, interstate coordination",
    "women_safety": "Women Safety Wing, 112 helpline, family counselling, SHE teams, home visits — NOT routine lathi patrol",
    "public_order": "Preventive detention (Sec 107/151), crowd control, liquor shop surveillance, peace committee meetings",
    "economic_cell": "Economic Offences Wing, bank coordination, document verification, awareness",
    "cyber_cell": "Cyber Crime Cell, 1930 helpline, digital forensics, payment gateway lien, telecom CEIR — NO physical lathi patrol",
}

SYSTEM_PROMPT = """You are KSP CrimeLens Intelligence Planner for Karnataka State Police.
Generate a tailored prevention & reaction plan for the given CRIME CATEGORY.
You MUST adapt deployment type — do NOT prescribe physical patrol for cyber/economic/women-safety cases where specialized cells are effective.

Return ONLY valid JSON with this schema:
{
  "crime_label": "string",
  "deployment_type": "one of: physical_patrol, women_safety, cyber_cell, economic_cell, public_order, homicide_prevention",
  "threat_summary": "2-3 sentences, data-driven, mention district, trend, peak window",
  "why_this_deployment": "1 sentence why this deployment fits this crime type",
  "immediate_actions": [{"title": "...", "detail": "specific 1-line action", "priority": "High/Medium/Low", "where": "station or district"}],
  "preventive_measures": [{"title": "...", "detail": "..."}],
  "resource_allocation": {"teams": 3, "officers": 12, "notes": "..."},
  "metrics_to_track": ["metric 1", "metric 2"],
  "physical_patrol_note": "if deployment is non-physical, explain that physical patrol is limited; otherwise null"
}
Be concise, operational, Karnataka-specific. Use English. No markdown fences. Base all numbers on provided stats — do not hallucinate station names beyond top_stations.
"""

HEURISTIC_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "cyber_cell": {
        "deployment_type": "cyber_cell",
        "why_this_deployment": "Cybercrime is faceless and jurisdictionally dispersed; digital forensics and bank coordination outrank lathi patrol.",
        "immediate_actions": [
            {"title": "Cyber Cell surge", "detail": "Post 2 analysts to triage 1930 complaints within 2h", "priority": "High", "where": ""},
            {"title": "Golden-hour lien", "detail": "Mark beneficiary accounts via bank nodal within 60 min", "priority": "High", "where": ""},
            {"title": "Mule SIM/UPI hunt", "detail": "CEIR + telecom coordination for repeat mule IDs", "priority": "Medium", "where": ""},
        ],
        "preventive_measures": [
            {"title": "Awareness drive", "detail": "SMS/Radio: 'KSP never asks OTP- report 1930'"},
            {"title": "School/elder camps", "detail": "Lottery/loan fraud awareness"},
        ],
    },
    "women_safety": {
        "deployment_type": "women_safety",
        "why_this_deployment": "Domestic/sexual offences need victim-centric intervention, not punitive patrol.",
        "immediate_actions": [
            {"title": "SHE teams + 112", "detail": "Home visit + counselling within 24h", "priority": "High", "where": ""},
            {"title": "Protection officer link", "detail": "Connect with Women & Child Dept for shelter/legal aid", "priority": "High", "where": ""},
            {"title": "Repeat offender check", "detail": "Verify bail conditions, history of DV", "priority": "Medium", "where": ""},
        ],
        "preventive_measures": [
            {"title": "Helpline visibility", "detail": "Display 112/181 at stations, PHCs"},
            {"title": "Community counsellors", "detail": "Weekly family counselling at station"},
        ],
    },
    "property_patrol": {
        "deployment_type": "physical_patrol",
        "why_this_deployment": "Property crimes cluster geographically; visible patrol deters opportunity.",
        "immediate_actions": [
            {"title": "Night beat + naka", "detail": "22:00-02:00 checkpoint at entry/exit points", "priority": "High", "where": ""},
            {"title": "CCTV sweep", "detail": "Verify cameras at top stations, fix blind spots", "priority": "Medium", "where": ""},
            {"title": "Second-hand dealer check", "detail": "Verify stolen property registers", "priority": "Medium", "where": ""},
        ],
        "preventive_measures": [
            {"title": "Beat book update", "detail": "Refresh rowdy sheeters, jail releases"},
        ],
    },
    "public_order": {
        "deployment_type": "public_order",
        "why_this_deployment": "Rioting/unlawful assembly needs preventive and crowd-control deployment, not crime-scene patrol.",
        "immediate_actions": [
            {"title": "Preventive CRPC 107/151", "detail": "Bind over habitual instigators", "priority": "High", "where": ""},
            {"title": "Peace committee", "detail": "Convene leaders at sensitive stations", "priority": "High", "where": ""},
            {"title": "Liquor & DJ check", "detail": "Evening excise + loudspeaker checks", "priority": "Medium", "where": ""},
        ],
        "preventive_measures": [
            {"title": "Videography deployment", "detail": "Bodycams + drone where permitted"},
        ],
    },
    "homicide_prevention": {
        "deployment_type": "homicide_prevention",
        "why_this_deployment": "Body offences stem from enmity/weapons; needs targeted prevention over general patrol.",
        "immediate_actions": [
            {"title": "Enmity mapping", "detail": "Review history-sheeters, bail jumpers near hotspot", "priority": "High", "where": ""},
            {"title": "Weapon seizure", "detail": "Special drive for illegal arms", "priority": "High", "where": ""},
            {"title": "Peak-hour presence", "detail": "Deploy at identified peak window", "priority": "Medium", "where": ""},
        ],
        "preventive_measures": [
            {"title": "Dispute mediation", "detail": "Rowdy parade + community mediation"},
        ],
    },
    "economic_cell": {
        "deployment_type": "economic_cell",
        "why_this_deployment": "Cheating/forgery needs document forensics and EOW, not lathi patrol.",
        "immediate_actions": [
            {"title": "EOW triage", "detail": "Prioritize cases with >5L loss, attach accounts", "priority": "High", "where": ""},
            {"title": "Bank coordination", "detail": "Freeze beneficiary accounts via 1930/cyber cell", "priority": "High", "where": ""},
        ],
        "preventive_measures": [
            {"title": "Awareness", "detail": "Investment fraud clinics at stations"},
        ],
    },
}

def build_user_prompt(stats, district, crime_label, time_range, archetype):
    guidance = ARCHETYPE_GUIDANCE.get(archetype, "")
    top_stations = stats.get("top_stations", [])[:4]
    return f"""
Crime: {crime_label} (archetype: {archetype})
District: {district or "All Karnataka"}
Time focus: {time_range}
Guidance for this archetype: {guidance}
Stats 30d: total={stats.get('total_30d',0)}, prev30d={stats.get('prev_30d',0)}, change={stats.get('change_pct',0)}% (peak window {stats.get('peak_time','N/A')})
Top stations: {json.dumps(top_stations)}
Repeat offender stations: {stats.get('repeat_offenders',0)} areas
Generate tailored JSON. If archetype is cyber_cell/women_safety/economic_cell, do NOT prescribe physical patrol routes; instead give specialized cell deployment.
"""

def heuristic_plan(stats, district, crime_label, archetype):
    tpl = HEURISTIC_TEMPLATES.get(archetype, HEURISTIC_TEMPLATES["property_patrol"])
    # clone
    import copy
    data = copy.deepcopy(tpl)
    data["crime_label"] = crime_label
    data["threat_summary"] = f"{crime_label} in {district or 'Karnataka'}: {stats.get('total_30d',0)} cases in 30d ({stats.get('change_pct',0):+g}% vs prior). Top station {stats.get('top_stations',[{}])[0].get('station','N/A')} drives hotspot. Peak {stats.get('peak_time','N/A')}."
    # inject where
    top = stats.get("top_stations", [])[:3]
    for i, act in enumerate(data["immediate_actions"]):
        if not act.get("where") and top:
            act["where"] = top[i % len(top)]["station"] if top else (district or "District HQ")
        if not act.get("where"):
            act["where"] = district or "District HQ"
    data["resource_allocation"] = {"teams": max(2, min(6, (stats.get("total_30d",0)//10)+2)), "officers": max(6, min(24, stats.get("total_30d",0)//2 + 6)), "notes": f"Scale with {archetype}"}
    data["metrics_to_track"] = data.get("metrics_to_track") or ["FIRs in next 14d", "Repeat offender checks", "Case disposal %"]
    if archetype in ("cyber_cell", "women_safety", "economic_cell"):
        data["physical_patrol_note"] = "Physical patrol limited — prioritize specialized cell response"
    else:
        data["physical_patrol_note"] = None
    data["stats"] = stats
    data["_llm"] = "heuristic"
    return data

def generate_prevention_plan(stats, district, crime_label, time_range="night"):
    crime_label = crime_label or "All Crimes"
    archetype = CRIME_ARCHETYPE.get(crime_label, "property_patrol")
    # fallback for unknown labels via group inference
    if archetype == "property_patrol" and "cyber" in crime_label.lower():
        archetype = "cyber_cell"
    if archetype == "property_patrol" and any(k in crime_label.lower() for k in ["domestic", "dowry", "sexual", "stalking", "women"]):
        archetype = "women_safety"

    llm = _get_llm()
    if not llm:
        return heuristic_plan(stats, district, crime_label, archetype)
    try:
        user_prompt = build_user_prompt(stats, district, crime_label, time_range, archetype)
        raw = llm.generate(user_prompt=user_prompt, system_prompt=SYSTEM_PROMPT)
        if raw.startswith("```"):
            raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        # ensure required keys
        parsed.setdefault("crime_label", crime_label)
        parsed.setdefault("stats", stats)
        parsed["_llm"] = "groq"
        if not parsed.get("deployment_type"):
            parsed["deployment_type"] = archetype
        return parsed
    except Exception as e:
        print(f"prevention llm failed {e}")
        data = heuristic_plan(stats, district, crime_label, archetype)
        data["_error"] = str(e)
        data["_llm"] = "heuristic-fallback"
        return data

import json

import db.dependencies as db_dependencies
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from llm.catalyst_llm_service import catalyst_llm_service as llm
from agents.sql_query_db.state import SQLAgentState

SCHEMA_HINTS = """
CRITICAL SCHEMA REFERENCE (use these exact column names — do NOT invent others):

CaseMaster (central case table):
  - CaseMasterID (PK)
  - CrimeRegisteredDate (TEXT, date of crime — NOT "FIRDate")
  - PoliceStationID (FK → Unit.UnitID — NOT DistrictID)
  - CaseCategoryID (FK → CaseCategory — values: FIR, UDR, PAR, Zero FIR — NOT crime type)
  - CrimeMajorHeadID (FK → CrimeHead.CrimeHeadID)
  - CrimeMinorHeadID (FK → CrimeSubHead.CrimeSubHeadID — this is where specific crimes like "Murder" live)
  - CaseStatusID (FK → CaseStatus)
  - GravityOffenceID (FK → GravityOffence)

District lookup path (CRITICAL — CaseMaster has NO DistrictID):
  CaseMaster.PoliceStationID → Unit.UnitID → Unit.DistrictID → District.DistrictName

Crime type lookup (CRITICAL — "Murder", "Theft", etc. are NOT in CaseCategory):
  CaseMaster.CrimeMinorHeadID → CrimeSubHead.CrimeSubHeadID
  CaseMaster.CrimeMajorHeadID → CrimeHead.CrimeHeadID

CaseCategory values: FIR, UDR, PAR, Zero FIR (filing types, NOT crime types)
"""


def planner_node(state: SQLAgentState):

    metadata_repo = db_dependencies.get_metadata_repository()

    schemas = metadata_repo.get_schemas()

    conversation = []

    for message in state["messages"]:
        if isinstance(message, HumanMessage):
            role = "User"
        elif isinstance(message, AIMessage):
            role = "Assistant"
        else:
            role = "System"

        conversation.append(f"{role}: {message.content}")

    conversation = "\n".join(conversation)

    schema_text = "\n\n".join(
        f"{table}\n{ddl}"
        for table, ddl in schemas.items()
    )

    system_prompt = f"""
You are a database planning assistant.

You are given:
1. The conversation between the user and the assistant.
2. The database schemas.
3. A critical schema reference with correct column names and table relationships.

Your job is to understand the latest user request in the context of the previous conversation.

Determine:

1. Which tables are required.
2. Which columns require DISTINCT value lookup (typically columns used in filters).

{SCHEMA_HINTS}

Return ONLY valid JSON.

Example:

{{
    "tables": ["Employee"],
    "value_lookup_columns": {{
        "Employee": [
            "gender",
            "city"
        ]
    }}
}}
"""

    human_prompt = f"""
Conversation

{conversation}

Database Schemas

{schema_text}
"""
    
    try:
        response = llm.generate(
            user_prompt=human_prompt,
            system_prompt=system_prompt,
        )
    except Exception as e:
        print("Error during LLM.generate (planner):", str(e))
        raise

    response = response.strip()
    if response.startswith("```"):
        response = response.replace("```json", "").replace("```", "").strip()

    plan = json.loads(response)

    print("Planner Node Output:", plan)

    return {
        "schemas": schemas,
        "selected_tables": plan["tables"],
        "value_lookup_columns": plan["value_lookup_columns"],
    }

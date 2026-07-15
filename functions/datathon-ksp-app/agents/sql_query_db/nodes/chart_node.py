import json

from langchain_core.messages import AIMessage, HumanMessage

from llm.catalyst_llm_service import catalyst_llm_service as llm
from agents.sql_query_db.state import SQLAgentState


def chart_node(state: SQLAgentState):
    """
    Determines the analytical intent and relevant columns for the SQL result.
    Delegates the specific chart type selection (e.g., pie vs horizontal_bar) 
    to the deterministic frontend renderer.
    """

    if state.get("error"):
        return {"charts": []}

    rows = state.get("sql_result", [])

    if not rows:
        return {"charts": []}

    # Single scalar — no chart needed
    if len(rows) == 1 and len(rows[0]) == 1:
        return {"charts": []}

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

    columns = list(rows[0].keys())

    prompt = f"""
You are a senior business intelligence engineer specialising in crime analytics dashboards.

Your task: decide the analytical intent for the SQL result below.
You may recommend 1 to 3 charts. Each chart must add distinct analytical value.

Conversation:

{conversation}

SQL Query:

{state["sql_query"]}

Columns available:

{columns}

Query Result (first 50 rows):

{json.dumps(rows[:50], indent=2)}

Rules:
1. If NO chart adds value (e.g. a single row), return: {{"charts": []}}
2. DO NOT decide the specific chart type (e.g., bar, pie). The frontend renderer handles that.
3. Your job is ONLY to determine the broad analytical intent. You MUST use exactly one of these string values for "intent":
   - "distribution": Comparing values across exactly ONE categorical column (e.g., crimes by district).
   - "heatmap": Comparing values across a matrix of exactly TWO categorical columns (e.g., crimes by district AND month, or offence by time of day).
   - "time_series": Showing a trend over a temporal/date column.
   - "part_of_whole": Showing shares or percentages of a whole.
   - "correlation": Comparing exactly TWO numeric columns.
4. Select the exact "columns" from the SQL result that support this intent. 
5. NEVER use identifier columns (e.g., CaseMasterID, CrimeID, UUID) as quantitative values.

Return ONLY valid JSON with NO markdown fences using the schema below:

{{
  "charts": [
    {{
      "title": "Crime Volume by District",
      "intent": "distribution",
      "columns": ["DistrictName", "CaseCount"],
      "reason": "Compare crime volume by district."
    }}
  ]
}}
"""

    try:
        response = llm.generate(
            system_prompt="You are an expert in business intelligence and data visualization. Return only valid JSON with no markdown fences.",
            user_prompt=prompt,
        )
    except Exception as e:
        print("Error during LLM.generate (chart):", str(e))
        return {"charts": []}

    response = response.strip()
    if response.startswith("```"):
        # Strip out markdown formatting if the LLM ignores the prompt rule
        response = response.replace("```json", "").replace("```", "").strip()

    try:
        result = json.loads(response)
    except json.JSONDecodeError:
        return {"charts": []}

    charts = result.get("charts", [])
    if not isinstance(charts, list):
        return {"charts": []}

    # Validate based on the new, simplified schema
    valid_charts = [
        c for c in charts
        if isinstance(c, dict) and c.get("intent") and c.get("columns")
    ]

    return {"charts": valid_charts}
import json

from langchain_core.messages import AIMessage, HumanMessage

from llm.catalyst_llm_service import catalyst_llm_service as llm
from agents.sql_query_db.state import SQLAgentState


def chart_node(state: SQLAgentState):
    """
    Determines the analytical intent and relevant columns for the SQL result.
    Delegates specific chart type selection (e.g., pie vs horizontal_bar)
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

    available_columns = list(rows[0].keys())

    prompt = f"""
You are a senior business intelligence engineer specialising in crime analytics dashboards.

Your task: decide the analytical intent for the SQL result below.
You may recommend 1 to 3 charts. Each chart must add distinct analytical value.

Conversation:

{conversation}

SQL Query:

{state["sql_query"]}

Available columns (these are the ONLY valid column names — use them exactly as written):

{json.dumps(available_columns)}

Query Result (first 50 rows):

{json.dumps(rows[:50], indent=2)}

Rules:
1. If NO chart adds value (e.g. a single row lookup with no aggregation), return: {{"charts": []}}
2. DO NOT decide the specific chart type (e.g., bar, pie). The frontend renderer handles that.
3. Your job is ONLY to determine the broad analytical intent. You MUST use exactly one of these string values for "intent":
   - "distribution": Comparing counts or values across one categorical column (e.g., crimes by district).
                     Works even with a SINGLE categorical column — the frontend will count frequencies.
   - "ranking":      Same as distribution, but explicitly ordered by value (e.g., top 10 stations by crime count).
   - "heatmap":      Comparing values across a matrix of exactly TWO categorical columns (e.g., district × month).
   - "time_series":  Showing a trend over a temporal/date column. Works with a single date column — the frontend
                     will count occurrences per date unit automatically.
   - "part_of_whole": Showing shares or percentages of a whole.
   - "correlation":  Comparing exactly TWO numeric columns against each other.
4. "columns" MUST be a subset of the available columns listed above. Copy column names exactly — do NOT invent or rename them.
5. For "distribution" or "ranking" with a single categorical column (e.g., ["CaseStatusName"]), that is valid —
   include just that one column. The frontend will aggregate frequencies automatically.
6. For "time_series" with a single date column (e.g., ["CrimeRegisteredDate"]), that is valid —
   include just that one column. The frontend will count occurrences per date unit automatically.
7. NEVER use identifier columns (e.g., CaseMasterID, CrimeID, UUID, EmployeeID) as values or categories.

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
        response = response.replace("```json", "").replace("```", "").strip()

    try:
        result = json.loads(response)
    except json.JSONDecodeError:
        return {"charts": []}

    charts = result.get("charts", [])
    if not isinstance(charts, list):
        return {"charts": []}

    valid_intents = {"distribution", "ranking", "heatmap", "time_series", "part_of_whole", "correlation"}

    validated = []
    for c in charts:
        if not isinstance(c, dict):
            continue
        intent = c.get("intent")
        columns = c.get("columns")
        if not intent or intent not in valid_intents:
            continue
        if not isinstance(columns, list) or len(columns) == 0:
            continue
        # Ensure every referenced column actually exists in the result
        bad_cols = [col for col in columns if col not in available_columns]
        if bad_cols:
            print(f"chart_node: dropping chart '{c.get('title')}' — unknown columns: {bad_cols}")
            continue
        validated.append(c)

    return {"charts": validated}
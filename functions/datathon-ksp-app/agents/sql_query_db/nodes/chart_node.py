import json

from langchain_core.messages import AIMessage, HumanMessage

from llm.catalyst_llm_service import catalyst_llm_service as llm
from agents.sql_query_db.state import SQLAgentState


def chart_node(state: SQLAgentState):
    """
    Determines whether one or more visualizations should be shown for the SQL result.
    Returns a list of chart configurations for the frontend.
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

Your task: decide which visualizations best illuminate the SQL result below.
You may recommend 1 to 3 charts. Each chart must add distinct analytical value.

Conversation

{conversation}

SQL Query

{state["sql_query"]}

Columns available

{columns}

Query Result (first 50 rows)

{json.dumps(rows[:50], indent=2)}

Rules:
1. If NO chart adds value (e.g. a single row), return: {{"charts": []}}
2. Otherwise return up to 3 chart configs. Each must use exact column names from the result.

Supported chart types:
- bar              (categories with counts/values, ≤20 categories)
- horizontal_bar   (categories with counts/values, >20 categories or long labels)
- line             (time-series or ordered sequence)
- area             (cumulative or continuous trend)
- pie              (part-of-whole, ≤8 slices)
- donut            (part-of-whole with center label, ≤8 slices)
- scatter          (two numeric variables, correlation)
- heatmap          (two categorical dimensions × one numeric value)

Chart selection guidelines:
- Time/date sequence → line or area
- Category distribution → bar or horizontal_bar
- Part of whole (shares, percentages) → donut
- Two numeric columns → scatter
- Two categorical axes (e.g. hour vs district) → heatmap
- If top-N category question: primary = bar/horizontal_bar, optional secondary = donut for share
- Prefer horizontal_bar when any label exceeds 15 characters or there are >12 categories
- A heatmap requires exactly: xKey (category), yKey (category), valueKey (numeric)
- Do NOT duplicate the same chart type with the same columns

Return ONLY valid JSON:

{{
  "charts": [
    {{
      "chart_type": "...",
      "title": "...",
      "x_axis": "...",
      "y_axis": "...",
      "series": null,
      "reason": "..."
    }}
  ]
}}
"""

    try:
        response = llm.generate(
            system_prompt="You are an expert in business intelligence and data visualization. Return only valid JSON.",
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

    # Filter out any malformed entries
    valid_charts = [
        c for c in charts
        if isinstance(c, dict) and c.get("chart_type")
    ]

    return {"charts": valid_charts}

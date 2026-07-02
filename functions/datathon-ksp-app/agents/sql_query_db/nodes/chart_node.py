import json

from langchain_core.messages import AIMessage, HumanMessage

from llm.groq_service import groq_service
from agents.sql_query_db.state import SQLAgentState


def chart_node(state: SQLAgentState):
    """
    Determines whether a visualization should be shown for the SQL result.

    Returns a chart configuration for the frontend.
    """

    # Don't generate charts if the query failed
    if state.get("error"):
        return {
            "chart_config": None
        }

    rows = state.get("sql_result", [])

    # Nothing to visualize
    if not rows:
        return {
            "chart_config": None
        }

    # Single scalar value usually doesn't need a chart
    if len(rows) == 1 and len(rows[0]) == 1:
        return {
            "chart_config": None
        }

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
You are an expert data visualization assistant.

Your task is to determine whether the SQL result should be visualized.

Conversation

{conversation}

SQL Query

{state["sql_query"]}

Columns

{columns}

Query Result

{json.dumps(rows[:50], indent=2)}

Rules:

1. If a chart would NOT add value, return:
{{
    "show_chart": false
}}

2. If a chart IS useful, return:

{{
    "show_chart": true,
    "chart_type": "...",
    "title": "...",
    "x_axis": "...",
    "y_axis": "...",
    "series": null,
    "reason": "..."
}}

Supported chart types:

- bar
- horizontal_bar
- line
- area
- pie
- donut
- scatter
- heatmap

Guidelines:

- Time/date -> line
- Categories + count -> bar
- Percentages -> pie/donut
- Two numeric columns -> scatter
- Hour vs district -> heatmap
- If there are many categories (>20), prefer horizontal_bar.
- Choose EXACT column names from the SQL result.
- Do NOT invent columns.
- Return ONLY valid JSON.
"""

    try:
        response = groq_service.generate(
            system_prompt="You are an expert in business intelligence and data visualization.",
            user_prompt=prompt,
        )
    except Exception as e:
        print("Error during GroqService.generate:", str(e))
        raise

    response = response.strip()

    if response.startswith("```"):
        response = response.replace("```json", "")
        response = response.replace("```", "")
        response = response.strip()

    chart = json.loads(response)

    if not chart.get("show_chart", False):
        return {
            "chart_config": None
        }

    return {
        "chart_config": chart
    }
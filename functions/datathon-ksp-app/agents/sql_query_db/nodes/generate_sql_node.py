import re

from langchain_core.messages import AIMessage, HumanMessage

from llm.catalyst_llm_service import catalyst_llm_service as llm
from agents.sql_query_db.state import SQLAgentState


def generate_sql_node(state: SQLAgentState):
    """
    Generates a SQLite query from the conversation,
    database schemas, and distinct column values.
    """

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
        for table, ddl in state["schemas"].items()
    )

    system_prompt = """
You are an expert SQLite SQL generator for a Karnataka State Police (KSP) crime database.

Generate a valid SQLite query that answers the user's latest question with maximum analytical depth.

Use the conversation history to resolve references such as "those", "them", "same district", "previous result".

Use the provided DISTINCT values when constructing WHERE clauses — match them exactly (case-sensitive).

Rules:
- Return ONLY the SQL query.
- Do not include explanations or markdown fences.
- Generate valid SQLite syntax only.
- Use only the provided tables and columns.
- For aggregation queries, always include ORDER BY to show most significant results first.
- Use LIMIT 50 unless the user asks for more or asks for all records.
- Prefer meaningful aliases (e.g., COUNT(*) AS CrimeCount, AVG(...) AS AvgAge).
- Use ROUND() for decimal values (2 places).
- When counting, always label the count column clearly (e.g., CrimeCount, VictimCount).
- For trend analysis, group by the relevant time column (year, month, hour).
- When comparing across categories, include percentage columns where useful:
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) AS Percentage
- For top-N queries, use ORDER BY ... DESC LIMIT N.
- Always add a secondary sort for ties (e.g., ORDER BY count DESC, name ASC).
"""

    human_prompt = f"""
Conversation

{conversation}

Database Schemas

{schema_text}

Distinct Values

{state["distinct_values"]}
"""

    try:
        sql = llm.generate(
            system_prompt=system_prompt,
            user_prompt=human_prompt,
        )
    except Exception as e:
        print("Error during LLM.generate (sql):", str(e))
        raise

    sql = re.sub(r"^```(?:sql)?", "", sql.strip(), flags=re.IGNORECASE)
    sql = re.sub(r"```$", "", sql.strip())

    return {
        "sql_query": sql.strip()
    }

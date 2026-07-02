import re

from langchain_core.messages import AIMessage, HumanMessage

from llm.groq_service import groq_service
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
You are an expert SQLite SQL generator.

Generate a valid SQLite query that answers the user's latest question.

Use the conversation history to resolve references such as:
- those
- them
- same department
- same city
- previous result

Use the provided DISTINCT values when constructing WHERE clauses.

Rules:
- Return ONLY SQL.
- Do not include explanations.
- Do not wrap the SQL in markdown.
- Generate valid SQLite syntax.
- Use only the provided tables and columns.
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
        sql = groq_service.generate(
            system_prompt=system_prompt,
            user_prompt=human_prompt,
        )
    except Exception as e:
        print("Error during GroqService.generate:", str(e))
        raise

    # Remove markdown fences if the model ignores instructions
    sql = re.sub(r"^```(?:sql)?", "", sql.strip(), flags=re.IGNORECASE)
    sql = re.sub(r"```$", "", sql.strip())

    return {
        "sql_query": sql.strip()
    }
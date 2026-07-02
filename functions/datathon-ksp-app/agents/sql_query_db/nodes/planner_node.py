import json

import db.dependencies as db_dependencies
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from llm.groq_service import groq_service
from agents.sql_query_db.state import SQLAgentState


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

    system_prompt = """
You are a database planning assistant.

You are given:
1. The conversation between the user and the assistant.
2. The database schemas.

Your job is to understand the latest user request in the context of the previous conversation.

Determine:

1. Which tables are required.
2. Which columns require DISTINCT value lookup (typically columns used in filters).

Return ONLY valid JSON.

Example:

{
    "tables": ["Employee"],
    "value_lookup_columns": {
        "Employee": [
            "gender",
            "city"
        ]
    }
}
"""

    human_prompt = f"""
Conversation

{conversation}

Database Schemas

{schema_text}
"""
    
    try:
        response = groq_service.generate(
            user_prompt=human_prompt,
            system_prompt=system_prompt,
        )
    except Exception as e:
        print("Error during GroqService.generate:", str(e))
        raise

    plan = json.loads(response)

    print("Planner Node Output:", plan)

    return {
        "schemas": schemas,
        "selected_tables": plan["tables"],
        "value_lookup_columns": plan["value_lookup_columns"],
    }
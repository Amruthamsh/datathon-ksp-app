import json

from langchain_core.messages import AIMessage, HumanMessage

from llm.groq_service import groq_service
from sql_query_db.state import SQLAgentState


def response_node(state: SQLAgentState):
    """
    Generates a natural language response and suggested follow-up questions.
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

    if state.get("error"):

        prompt = f"""
Conversation

{conversation}

SQL Query

{state['sql_query']}

Error

{state['error']}

Return ONLY valid JSON.

{{
    "answer": "...",
    "follow_up_questions": []
}}
"""

    else:

        prompt = f"""
Conversation

{conversation}

SQL Query

{state['sql_query']}

Query Result

{state['sql_result']}

Answer the user's latest question.

Then suggest 4 useful follow-up questions that naturally continue the analysis.

Rules:
- Follow-up questions should be specific to the returned data.
- They should help the user explore the data further.
- Return ONLY valid JSON.

Example:

{{
    "answer": "There are 125 employees in Bangalore.",
    "follow_up_questions": [
        "How many are female?",
        "Which department has the most employees?",
        "What is the average salary?",
        "How many joined this year?"
    ]
}}
"""

    response = groq_service.generate(
        system_message="You are a helpful data analyst.",
        human_message=prompt,
    )

    response = json.loads(response)

    return {
        "response": response["answer"],
        "follow_up_questions": response["follow_up_questions"],
        "messages": [
            AIMessage(content=response["answer"])
        ],
    }
from langchain_core.messages import AIMessage
from agents.sql_query_db.state import SQLAgentState

def chat_node(state: SQLAgentState):

    response = "I'm sorry, I can only help with questions related to KSP Crime data. How can I assist you with that?"

    return {
        "messages": [
            AIMessage(content=response)
        ],
        "follow_up_questions": [],
        "response": response
    }
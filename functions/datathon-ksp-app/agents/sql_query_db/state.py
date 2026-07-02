from typing import Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict, Literal

class SQLAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    intent: Literal["sql", "chat"]
    schemas: dict
    selected_tables: list[str]
    value_lookup_columns: dict[str, list[str]]
    distinct_values: dict
    sql_query: str
    sql_result: list[dict]
    error: str | None
    response: str
    follow_up_questions: list[str]
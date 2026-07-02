from typing import Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class SQLAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    schemas: dict
    selected_tables: list[str]
    value_lookup_columns: dict[str, list[str]]
    distinct_values: dict
    sql_query: str
    sql_result: list[dict]
    error: str | None
    response: str
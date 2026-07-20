# schemas/report.py
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VisualizationSchema(BaseModel):
    id: str
    title: str
    intent: Optional[str] = None
    reason: Optional[str] = None


class SQLDataSchema(BaseModel):
    query: str
    row_count: int
    rows: List[Dict[str, Any]] = Field(default_factory=list)


class ReportPayload(BaseModel):
    title: str
    generated_at: str
    generated_by: str = "KSP Intelligence Platform"
    executive_summary: Optional[str] = None
    sql: SQLDataSchema
    visualizations: List[VisualizationSchema] = Field(default_factory=list)
    follow_up_questions: List[str] = Field(default_factory=list)
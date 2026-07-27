import logging
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse

from auth.dependencies import get_current_user
from db.catalyst.report_repository import CatalystReportRepository
from db.dependencies import get_report_repository
from db.dependencies import get_metadata_repository
from db.sqlite.sqlite_metadata_repository import SQLiteMetadataRepository
from schemas.report import SaveReportRequest, ExecuteQueryRequest
from services.report_service import ReportService

logger = logging.getLogger("fastapi_function")

router = APIRouter(prefix="/reports", tags=["Reports"])


def cleanup_temp_file(file_path: str):
    """Safely delete temporary directory and artifacts post response streaming."""
    try:
        path = Path(file_path)
        if path.parent.exists() and "ksp_report_" in path.parent.name:
            shutil.rmtree(path.parent)
    except Exception as e:
        logger.error(f"Error during file cleanup: {e}")


@router.post("/export/{format}")
async def export_report(
    format: str,
    background_tasks: BackgroundTasks,
    report: str = Form(...),  # Received as stringified JSON blob inside multipart
    charts: List[UploadFile] = File(default=[]),
):
    try:
        service = ReportService()
        generated_file = await service.generate_report(
            report_json_str=report,
            charts=charts,
            output_format=format,
        )

        # Register background cleanup task to run AFTER FileResponse completes
        background_tasks.add_task(cleanup_temp_file, str(generated_file))

        media_type = (
            "application/pdf"
            if format == "pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )

        return FileResponse(
            path=generated_file,
            filename=f"ksp_intelligence_report.{format}",
            media_type=media_type,
        )

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Report Generation Failed: {str(e)}"
        )


@router.post("", status_code=201)
async def create_report(
    payload: SaveReportRequest,
    current_user: dict = Depends(get_current_user),
    report_repo: Optional[CatalystReportRepository] = Depends(
        get_report_repository
    ),
):
    if not report_repo:
        raise HTTPException(
            status_code=500, detail="Report repository unavailable"
        )

    logger.info(
        f"Creating report for user {current_user['kgid']} with title '{payload.title}'"
    )

    try:
        report = report_repo.create_report(
            kgid=current_user["kgid"],
            title=payload.title,
            sql_query=payload.sql_query,
            charts=payload.charts,
            summary=payload.summary,
        )
    except Exception as e:
        logger.error(
            f"Failed to save report for user {current_user['kgid']}: {e}"
        )
        raise HTTPException(
            status_code=500, detail="Failed to save report, error: " + str(e)
        )

    return {
        "status": "success",
        "report_id": report["ROWID"],
    }


@router.get("", status_code=200)
async def list_reports(
    current_user: dict = Depends(get_current_user),
    report_repo: Optional[CatalystReportRepository] = Depends(
        get_report_repository
    ),
):
    if not report_repo:
        return {"status": "success", "reports": []}

    try:
        reports = report_repo.list_for_user(current_user["kgid"])
    except Exception as e:
        logger.warning(f"Failed to list reports: {e}")
        return {"status": "success", "reports": []}

    return {
        "status": "success",
        "reports": [
            {
                "report_id": r["ROWID"],
                "title": r["title"],
                "summary": r.get("summary", ""),
                "created_at": r.get("CREATEDTIME", ""),
                "updated_at": r.get("MODIFIEDTIME", ""),
                "charts": r.get("charts", []),
                "sql_query": r.get("sql_query", ""),
            }
            for r in reports
        ],
    }


@router.get("/{report_id}", status_code=200)
async def get_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
    report_repo: Optional[CatalystReportRepository] = Depends(
        get_report_repository
    ),
):
    if not report_repo:
        raise HTTPException(
            status_code=500, detail="Report repository unavailable"
        )

    report = report_repo.get_report(
        report_id=report_id,
        kgid=current_user["kgid"],
    )

    if not report:
        raise HTTPException(
            status_code=404, detail="Report not found or permission denied"
        )

    return {
        "status": "success",
        "report": report,
    }


@router.delete("/{report_id}", status_code=200)
async def delete_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
    report_repo: Optional[CatalystReportRepository] = Depends(
        get_report_repository
    ),
):
    if not report_repo:
        raise HTTPException(
            status_code=500, detail="Report repository unavailable"
        )

    deleted = report_repo.delete_report(
        report_id=report_id,
        kgid=current_user["kgid"],
    )

    if not deleted:
        raise HTTPException(
            status_code=404, detail="Report not found or permission denied"
        )

    return {
        "status": "success",
        "message": "Report deleted successfully",
    }

@router.post("/execute-query", status_code=200)
async def execute_query(
    payload: ExecuteQueryRequest,
    current_user: dict = Depends(get_current_user),
    metadata_repo: Optional[SQLiteMetadataRepository] = Depends(
        get_metadata_repository
    ),
):
    print(f"Executing query for user {current_user.get('kgid')}: {payload.sql_query}")
    if not metadata_repo:
        raise HTTPException(
            status_code=500, detail="Metadata repository unavailable"
        )

    try:
        result = metadata_repo.execute_sql(payload.sql_query)
        return {
            "status": "success",
            "data": result,
        }
    except Exception as e:
        logger.error(
            f"Query execution failed for user {current_user.get('kgid')}: {e}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"Failed to execute query: {str(e)}",
        )
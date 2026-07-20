# api/routes/report.py
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
import shutil

from services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Reports"])


def cleanup_temp_file(file_path: str):
    """Safely delete temporary directory and artifacts post response streaming."""
    try:
        path = Path(file_path)
        if path.parent.exists() and "ksp_report_" in path.parent.name:
            shutil.rmtree(path.parent)
    except Exception as e:
        print(f"Error during file cleanup: {e}")


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
        raise HTTPException(status_code=500, detail=f"Report Generation Failed: {str(e)}")
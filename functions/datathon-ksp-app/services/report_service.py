# services/report_service.py
import json
import tempfile
from pathlib import Path
from typing import Dict, List
from fastapi import UploadFile

from schemas.report import ReportPayload
from services.pdf_generator import PDFGenerator
from services.word_generator import WordGenerator


class ReportService:
    async def generate_report(
        self,
        report_json_str: str,
        charts: List[UploadFile],
        output_format: str,
    ) -> Path:
        # 1. Parse payload into validated schema
        report_data = json.loads(report_json_str)
        report = ReportPayload(**report_data)

        # 2. Build temporary workspace
        temp_dir = Path(tempfile.mkdtemp(prefix="ksp_report_"))
        chart_paths: Dict[str, Path] = {}

        # 3. Store upload chart blobs matching their unique IDs
        for chart in charts:
            # Strip file extensions if present to extract pure chart key ID
            chart_key = Path(chart.filename).stem  # e.g. 'chart-0' from 'chart-0.png'
            dest = temp_dir / f"{chart_key}.png"

            with open(dest, "wb") as f:
                f.write(await chart.read())

            chart_paths[chart_key] = dest

        # 4. Delegate output format execution
        output_format = output_format.lower()
        output_file = temp_dir / f"analysis_report.{output_format}"

        if output_format == "pdf":
            generator = PDFGenerator()
            return await generator.generate(report, chart_paths, output_file)

        elif output_format == "docx":
            generator = WordGenerator()
            return generator.generate(report, chart_paths, output_file)

        else:
            raise ValueError(f"Unsupported output format requested: '{output_format}'")
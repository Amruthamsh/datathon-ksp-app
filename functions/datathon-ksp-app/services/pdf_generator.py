# services/pdf_generator.py
import base64
from pathlib import Path
from typing import Dict
from jinja2 import Environment, FileSystemLoader

from schemas.report import ReportPayload
from utils.markdown import markdown_to_html


class PDFGenerator:
    def __init__(self):
        self.template_dir = Path(__file__).parent.parent / "templates"
        self.env = Environment(loader=FileSystemLoader(str(self.template_dir)))

    async def generate(
        self,
        report: ReportPayload,
        chart_paths: Dict[str, Path],
        output_path: Path,
    ) -> Path:
        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            raise ValueError(
                "PDF export is not available on this deployment "
                "(playwright is not bundled). Please export the report as DOCX instead."
            ) from exc
        # 1. Convert chart images to base64
        chart_map = {}
        for chart_id, image_path in chart_paths.items():
            if image_path.exists():
                with open(image_path, "rb") as img_file:
                    chart_map[chart_id] = base64.b64encode(
                        img_file.read()
                    ).decode("utf-8")

        # 2. Pre-render analysis_response markdown to HTML
        report_data = report.model_dump()
        if report.analysis_response:
            report_data["analysis_response_html"] = markdown_to_html(
                report.analysis_response
            )

        # 3. Load CSS
        css_path = self.template_dir / "report.css"
        css_content = css_path.read_text(encoding="utf-8") if css_path.exists() else ""

        # 4. Render template
        template = self.env.get_template("report.html")
        html_content = template.render(
            report=report_data,
            chart_map=chart_map,
            css_content=css_content,
        )

        # 5. Playwright headless Chrome -> PDF
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content(html_content, wait_until="networkidle")

            await page.pdf(
                path=str(output_path),
                format="A4",
                print_background=True,
                margin={
                    "top": "30mm",
                    "bottom": "28mm",
                    "left": "15mm",
                    "right": "15mm",
                },
            )
            await browser.close()

        return output_path

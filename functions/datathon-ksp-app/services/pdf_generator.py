# services/pdf_generator.py
import base64
from pathlib import Path
from typing import Dict
from jinja2 import Environment, FileSystemLoader
from playwright.async_api import async_playwright
from schemas.report import ReportPayload


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
        # 1. Convert chart images to base64 inline data for reliable Playwright rendering
        chart_map = {}
        for chart_id, image_path in chart_paths.items():
            if image_path.exists():
                with open(image_path, "rb") as img_file:
                    chart_map[chart_id] = base64.b64encode(img_file.read()).decode("utf-8")

        # 2. Load CSS & HTML Templates
        css_path = self.template_dir / "report.css"
        css_content = css_path.read_text(encoding="utf-8") if css_path.exists() else ""

        template = self.env.get_template("report.html")
        html_content = template.render(
            report=report.model_dump(),
            chart_map=chart_map,
            css_content=css_content,
        )

        # 3. Render HTML to PDF via Playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            # Set static content
            await page.set_content(html_content, wait_until="networkidle")

            # Print to A4 PDF with background styling preserved
            await page.pdf(
                path=str(output_path),
                format="A4",
                print_background=True,
                margin={
                    "top": "30mm",     # Matches CSS @page margin
                    "bottom": "30mm",  # Matches CSS @page margin
                    "left": "15mm",
                    "right": "15mm"
                }
            )
            await browser.close()

        return output_path
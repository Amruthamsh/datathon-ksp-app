import json
from datetime import datetime


class CatalystReportRepository:
    def __init__(self, catalyst_app, table_name="SavedReports"):
        self.table_name = table_name
        self.table = catalyst_app.datastore().table(table_name)
        self.catalyst_app = catalyst_app

    def create_report(
        self,
        kgid: str,
        title: str,
        sql_query: str,
        charts: list,
        summary: str,
    ):
        row = {
            "kgid": kgid,
            "title": title,
            "sql_query": sql_query,
            "charts": json.dumps(charts),
            "summary": summary,
        }

        return self.table.insert_row(row)

    def get_reports(self):
        query = f"""
        SELECT *
        FROM {self.table_name}
        ORDER BY CREATEDTIME DESC
        """

        result = self.catalyst_app.zcql().execute_query(query)
        if not result:
            return []

        reports = []
        for row in result:
            report = row[self.table_name]
            if isinstance(report.get("charts"), str):
                try:
                    report["charts"] = json.loads(report["charts"])
                except Exception:
                    report["charts"] = []
            reports.append(report)

        return reports

    def get_report(self, report_id: str, kgid: str):
        query = f"""
        SELECT *
        FROM {self.table_name}
        WHERE ROWID='{report_id}' AND kgid='{kgid}'
        """

        result = self.catalyst_app.zcql().execute_query(query)

        if not result:
            return None

        report = result[0][self.table_name]
        if isinstance(report.get("charts"), str):
            try:
                report["charts"] = json.loads(report["charts"])
            except Exception:
                report["charts"] = []

        return report

    def delete_report(self, report_id: str, kgid: str) -> bool:
        # First verify user owns the report before deleting
        report = self.get_report(report_id=report_id, kgid=kgid)
        if not report:
            return False

        self.table.delete_row(report_id)
        return True

    def list_for_user(self, kgid: str):
        query = f"""
        SELECT *
        FROM {self.table_name}
        WHERE kgid='{kgid}'
        ORDER BY CREATEDTIME DESC
        """

        result = self.catalyst_app.zcql().execute_query(query)

        if not result:
            return []

        reports = []
        for row in result:
            report = row[self.table_name]
            if isinstance(report.get("charts"), str):
                try:
                    report["charts"] = json.loads(report["charts"])
                except Exception:
                    report["charts"] = []
            reports.append(report)

        return reports

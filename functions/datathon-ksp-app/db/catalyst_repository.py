from db.repository import EmployeeRepository

class CatalystEmployeeRepository(EmployeeRepository):

    def __init__(self, catalyst_app):
        self.table = catalyst_app.datastore().table("Employee")

    def get_employees(self, page: int, page_size: int):

        rows = self.table.get_paged_rows(
            page=page,
            per_page=page_size,
        )

        return {
            "page": page,
            "page_size": page_size,
            "rows": rows,
        }
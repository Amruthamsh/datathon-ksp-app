from __future__ import annotations
from auth.security import hash_password

class CatalystUserRepository:
    def __init__(self, catalyst_app, table_name: str = "EmployeeAccounts"):
        self.catalyst_app = catalyst_app
        self.table_name = table_name
        self.table = catalyst_app.datastore().table(table_name)

    def create_user(
        self,
        kgid: str,
        password_plain: str,
        full_name: str,
        rank: str,
        district: str,
        phone: str | None,
        email: str | None,
    ) -> dict | None:
        row = {
            "kgid": kgid,
            "password_hash": hash_password(password_plain),
            "full_name": full_name,
            "rank": rank,
            "district": district,
        }

        if phone:
            row["phone"] = phone

        if email:
            row["email"] = email

        try:
            return self.table.insert_row(row)
        except Exception as err:
            print(f"Failed to create user with KGID {kgid}: {err}")
            return None

    def get_user(self, kgid: str) -> dict | None:
        try:
            # 1. Construct the SQL query string
            query = f"SELECT * FROM {self.table_name} WHERE kgid = '{kgid}'"
            
            # 2. Get the dedicated ZCQL service instance from the app
            zcql_service = self.catalyst_app.zcql()
            
            # 3. Execute query using the correct Python SDK method
            results = zcql_service.execute_query(query)
            
        except Exception as err:
            print(f"Failed to get user with KGID {kgid}: {err}")
            return None

        # If no records match, execute_query returns an empty list
        if not results:
            return None

        # ZCQL returns a list of dictionaries grouped by table name: 
        # [{'EmployeeAccounts': {'ROWID': ..., 'kgid': ...}}]
        first_row_wrapper = results[0]
        return first_row_wrapper.get(self.table_name)
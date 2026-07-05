from __future__ import annotations

from datetime import datetime, timezone

from auth.security import hash_password


class CatalystUserRepository:
    def __init__(self, catalyst_app, table_name: str = "employee_accounts"):
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
    ):
        row = {
            "kgid": kgid,
            "password_hash": hash_password(password_plain),
            "full_name": full_name,
            "rank": rank,
            "district": district,
            # "created_at": datetime.now(timezone.utc).isoformat(),
        }

        if phone:
            row["phone"] = phone

        if email:
            row["email"] = email

        return self.table.insert_row(row)

    def get_user(self, kgid: str) -> dict | None:
        try:
            row = self.table.get_row(kgid)
        except Exception:
            return None

        if not row:
            return None

        return row.to_dict() if hasattr(row, "to_dict") else dict(row)
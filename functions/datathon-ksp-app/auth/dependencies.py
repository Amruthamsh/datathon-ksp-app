from fastapi import Depends, HTTPException, Request, status
from auth.security import decode_token
from auth.roles import (
    build_scope,
    tier_from_hierarchy,
    tier_from_rank_name,
)


def _lookup_officer_context(kgid: str) -> dict | None:
    """Best-effort Employee + Rank lookup. Returns None if SQLite unavailable."""
    try:
        from db.sqlite.sqlite import get_connection

        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT e.EmployeeID AS employee_id,
                       e.DistrictID AS district_id,
                       e.UnitID AS unit_id,
                       e.RankID AS rank_id,
                       r.RankName AS rank_name,
                       r.Hierarchy AS hierarchy
                FROM Employee e
                LEFT JOIN Rank r ON r.RankID = e.RankID
                WHERE e.KGID = ?
                """,
                (kgid,),
            ).fetchone()
            return dict(row) if row else None
    except Exception:
        return None


def get_current_user(request: Request) -> dict:
    token = request.headers.get("X-Auth-Token", "")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token.",
        )

    try:
        payload = decode_token(token)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid.",
        ) from err

    kgid = payload.get("sub")
    if not kgid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid.",
        )

    ctx = _lookup_officer_context(kgid) or {}
    rank_name = ctx.get("rank_name") or payload.get("rank", "")
    hierarchy = ctx.get("hierarchy")
    tier = tier_from_hierarchy(hierarchy) if hierarchy is not None else tier_from_rank_name(rank_name)

    user = {
        "kgid": kgid,
        "rank": rank_name,
        "rank_id": ctx.get("rank_id"),
        "hierarchy": hierarchy,
        "tier": tier,
        "employee_id": ctx.get("employee_id"),
        "district_id": ctx.get("district_id"),
        "unit_id": ctx.get("unit_id"),
    }
    user["scope"] = build_scope(tier, user["employee_id"], user["district_id"], user["unit_id"])
    return user


def require_tier(*allowed_tiers: str):
    """Feature gate: 403 unless the caller's tier is allowed.

    Usage: `Depends(require_tier("state_command", "district_command"))`
    returns a dependency callable yielding the enriched user.
    """

    def _check(request: Request) -> dict:
        user = get_current_user(request)
        if user.get("tier") not in allowed_tiers:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role is not authorized for this feature.",
            )
        return user

    return _check

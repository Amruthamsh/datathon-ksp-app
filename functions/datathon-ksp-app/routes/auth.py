from fastapi import APIRouter, Depends, HTTPException, Request, status
from schemas.auth import SignUpRequest, SignInRequest, AuthResponse, ChangePasswordRequest
from db.dependencies import get_officer_repository, get_catalyst_user_repository
from db.sqlite.officer_repository import SQLiteOfficerRepository
from db.catalyst.user_repository import CatalystUserRepository
from auth.security import verify_password, create_token, decode_token
from auth.roles import build_scope, scope_level_for_tier, tier_from_hierarchy, tier_from_rank_name

router = APIRouter(prefix="/auth", tags=["auth"])


def _officer_scope_context(kgid: str) -> dict:
    """Employee posting + RBAC tier for auth responses. Never raises."""
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
                       r.Hierarchy AS hierarchy,
                       d.DistrictName AS district_name,
                       u.UnitName AS unit_name
                FROM Employee e
                LEFT JOIN Rank r ON r.RankID = e.RankID
                LEFT JOIN District d ON d.DistrictID = e.DistrictID
                LEFT JOIN Unit u ON u.UnitID = e.UnitID
                WHERE e.KGID = ?
                """,
                (kgid,),
            ).fetchone()
            if not row:
                return {}
            d = dict(row)
            tier = (
                tier_from_hierarchy(d.get("hierarchy"))
                if d.get("hierarchy") is not None
                else tier_from_rank_name(d.get("rank_name"))
            )
            return {
                "tier": tier,
                "scope_level": scope_level_for_tier(tier),
                "hierarchy": d.get("hierarchy"),
                "rank_id": d.get("rank_id"),
                "district_id": d.get("district_id"),
                "district_name": d.get("district_name"),
                "unit_id": d.get("unit_id"),
                "unit_name": d.get("unit_name"),
                "scope": build_scope(tier, d.get("employee_id"), d.get("district_id"), d.get("unit_id")),
            }
    except Exception:
        return {}

     
def _extract_bearer_token(request: Request) -> str:
    token = request.headers.get("X-Auth-Token", "")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token.",
        )
    return token


@router.post("/verify")
def verify_identity(
    req: SignUpRequest,
    repository: SQLiteOfficerRepository = Depends(get_officer_repository),
    user_repository: CatalystUserRepository = Depends(get_catalyst_user_repository),
):
    officer = repository.verify_officer(req.kgid, req.dob)
    if not officer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KGID and date of birth do not match any officer record.",
        )

    if user_repository.get_user(req.kgid):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This KGID is already registered. Use sign in.",
        )

    return {
        "message": "Officer verified.",
        "officer": {
            "kgid": officer["kgid"],
            "full_name": officer["full_name"],
            "rank": officer["rank"],
            "district": officer["district"],
        },
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(
    req: SignUpRequest,
    officer_repository: SQLiteOfficerRepository = Depends(get_officer_repository),
    user_repository: CatalystUserRepository = Depends(get_catalyst_user_repository),
):
    # Step 1: Verify officer identity against KSP SQLite DB
    officer = officer_repository.verify_officer(req.kgid, req.dob)
    if not officer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KGID and date of birth do not match any officer record.",
        )

    # Step 2: Check not already registered
    if user_repository.get_user(req.kgid):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This KGID is already registered. Use sign in.",
        )

    # Step 3: Create Catalyst account
    try:
        user_repository.create_user(
            kgid=req.kgid,
            password_plain=req.password,
            full_name=officer["full_name"],
            rank=officer["rank"],
            district=officer["district"],
            phone=req.phone,
            email=req.email,
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create the Catalyst account.",
        ) from err

    return {"message": f"Account created for {officer['full_name']} ({officer['rank']})"}


@router.post("/signin", response_model=AuthResponse)
def signin(
    req: SignInRequest,
    user_repository: CatalystUserRepository = Depends(get_catalyst_user_repository),
):
    user = user_repository.get_user(req.kgid)

    print("User:", user)

    if user:
        print("Password OK:", verify_password(req.password, user["password_hash"]))

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid KGID or password.",
        )

    token = create_token(kgid=user["kgid"], rank=user["rank"])
    officer = {
        "kgid": user["kgid"],
        "full_name": user["full_name"],
        "rank": user["rank"],
        "district": user["district"],
        **_officer_scope_context(user["kgid"]),
    }
    return AuthResponse(
        access_token=token,
        officer=officer,
    )


@router.get("/me")
def me(
    request: Request,
    user_repository: CatalystUserRepository = Depends(get_catalyst_user_repository),
):
    token = _extract_bearer_token(request)

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

    user = user_repository.get_user(kgid)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid.",
        )

    return {
        "officer": {
            "kgid": user["kgid"],
            "full_name": user["full_name"],
            "rank": user["rank"],
            "district": user["district"],
            **_officer_scope_context(kgid),
        }
    }


def _get_authenticated_user(
    request: Request, user_repository: CatalystUserRepository
) -> dict:
    token = _extract_bearer_token(request)

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

    user = user_repository.get_user(kgid) if user_repository else None
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid.",
        )
    return user


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    request: Request,
    user_repository: CatalystUserRepository = Depends(get_catalyst_user_repository),
):
    if user_repository is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account service is unavailable. Try again later.",
        )

    user = _get_authenticated_user(request, user_repository)

    if not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    if verify_password(req.new_password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )

    if not user_repository.update_password(user["kgid"], req.new_password):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update the password.",
        )

    return {"message": "Password updated successfully."}
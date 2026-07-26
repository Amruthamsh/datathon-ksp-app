from fastapi import APIRouter, Depends, HTTPException, Request, status
from schemas.auth import SignUpRequest, SignInRequest, AuthResponse
from db.dependencies import get_officer_repository, get_catalyst_user_repository
from db.sqlite.officer_repository import SQLiteOfficerRepository
from db.catalyst.user_repository import CatalystUserRepository
from auth.security import verify_password, create_token, decode_token

router = APIRouter(prefix="/auth", tags=["auth"])

     
def _extract_bearer_token(request: Request) -> str:
    token = request.headers.get("X-Auth-Token", "")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
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
    return AuthResponse(
        access_token=token,
        officer={
            "kgid": user["kgid"],
            "full_name": user["full_name"],
            "rank": user["rank"],
            "district": user["district"],
        },
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
        }
    }

@router.post("/debug")
async def debug(request: Request):
    body = await request.body()

    return {
        "headers": dict(request.headers),
        "body": body.decode(errors="ignore")
    }
from fastapi import HTTPException, Request, status
from auth.security import decode_token


def get_current_user(request: Request) -> dict:
    token = request.headers.get("X-Auth-Token", "")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
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

    # Token payload already carries kgid and rank — no Catalyst round-trip needed
    return {"kgid": kgid, "rank": payload.get("rank", "")}

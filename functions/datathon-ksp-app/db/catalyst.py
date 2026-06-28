import logging
from threading import Lock

from fastapi import HTTPException, Request
import zcatalyst_sdk

logger = logging.getLogger("fastapi_function")

_catalyst_app = None
_catalyst_lock = Lock()


def get_catalyst_app(request: Request):
    global _catalyst_app

    if _catalyst_app is not None:
        return _catalyst_app

    with _catalyst_lock:
        if _catalyst_app is not None:
            return _catalyst_app

        try:
            _catalyst_app = zcatalyst_sdk.initialize(req=request)
            return _catalyst_app
        except Exception as err:
            logger.error(f"Failed to initialize Catalyst SDK: {err}")
            raise HTTPException(status_code=500, detail="Catalyst SDK initialization failed")

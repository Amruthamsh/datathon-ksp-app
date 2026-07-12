import logging
from threading import Lock

from fastapi import HTTPException, Request
import zcatalyst_sdk

from llm.catalyst_llm_service import catalyst_llm_service

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
            catalyst_llm_service.set_catalyst_app(_catalyst_app)
            return _catalyst_app
        except Exception as err:
            logger.error(f"Failed to initialize Catalyst SDK: {err}")
            raise HTTPException(status_code=500, detail="Catalyst SDK initialization failed")

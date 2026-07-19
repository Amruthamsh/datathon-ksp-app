import logging

from fastapi import HTTPException, Request
import zcatalyst_sdk

from llm.catalyst_llm_service import catalyst_llm_service

logger = logging.getLogger("fastapi_function")


def get_catalyst_app(request: Request):
    try:
        catalyst_app = zcatalyst_sdk.initialize(req=request)
        catalyst_llm_service.set_catalyst_app(catalyst_app)
        return catalyst_app
    except Exception as err:
        logger.exception("Failed to initialize Catalyst SDK")
        raise HTTPException(
            status_code=500,
            detail="Catalyst SDK initialization failed",
        ) from err
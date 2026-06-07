import logging

from flask import jsonify, make_response
from fastapi import FastAPI
import zcatalyst_sdk
'''
Execute below command to install SDK in global for enabling code suggestions
-> python3 -m pip install zcatalyst-sdk
'''

logger = logging.getLogger(__name__)
app = FastAPI(title="Datathon KSP")


def root_payload():
    return {
        "status": "success",
        "message": "Hello from FastAPI",
    }


def cache_payload():
    catalyst_app = zcatalyst_sdk.initialize()
    default_segment = catalyst_app.cache().segment()

    insert_resp = default_segment.put('Name', 'DefaultName')
    logger.info('Inserted cache : %s', insert_resp)
    get_resp = default_segment.get('Name')

    return get_resp


@app.get("/")
def read_root():
    return root_payload()


@app.get("/cache")
def read_cache():
    try:
        return cache_payload()
    except Exception as exc:
        logger.exception("Cache route failed")
        return {
            "status": "error",
            "message": "Cache route is only available in a Catalyst runtime.",
            "detail": str(exc),
        }, 500


def handler(request):
    if request.path == "/":
        return jsonify(root_payload()), 200
    if request.path == "/cache":
        try:
            return jsonify(cache_payload()), 200
        except Exception as exc:
            logger.exception("Cache route failed")
            return {
                "status": "error",
                "message": "Cache route is only available in a Catalyst runtime.",
                "detail": str(exc),
            }, 500

    response = make_response('Unknown path')
    response.status_code = 400
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

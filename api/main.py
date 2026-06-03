import os

import sentry_sdk
from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from utils import env_bool

load_dotenv()


def _scrub_event(event, hint):
    """Drop request bodies (which contain health data) from Sentry events."""
    if event.get("request"):
        event["request"].pop("data", None)
        event["request"].pop("cookies", None)
    return event


_dsn = os.environ.get("SENTRY_DSN")
if _dsn:
    sentry_sdk.init(
        dsn=_dsn,
        traces_sample_rate=0.1,
        send_default_pii=False,
        before_send=_scrub_event,
    )

app = Flask(__name__)

# CORS is locked down to an explicit allowlist. Empty => no cross-origin access.
_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if _origins:
    CORS(app, origins=_origins)

# v1 has been removed: it accepted an arbitrary `userid` with no authentication,
# allowing anyone to read/write/delete any user's data.
# Imported here (not at module top) because it opens the Mongo connection at
# import time and so must run after load_dotenv() above.
from apiVersions.v2 import init_app as init_v2  # noqa: E402

init_v2(app)

# Serve the built Web UI SPA from the same Flask process, but only when a built
# dist/ is present (WEB_DIST points at a directory). Registered AFTER the API so
# the catch-all never shadows /api/*; a pure-API deploy (WEB_DIST unset/missing)
# behaves exactly as before — no blueprint registered.
_web_dist = os.environ.get("WEB_DIST")
if _web_dist and os.path.isdir(_web_dist):
    from static_web import create_web_blueprint

    app.register_blueprint(create_web_blueprint(_web_dist))


if __name__ == "__main__":
    # Development entrypoint only. Production runs under gunicorn (see Dockerfile),
    # which imports the module-level `app` above and never executes this block.
    app.run(
        host=os.environ.get("APP_HOST", "0.0.0.0"),
        port=int(os.environ.get("APP_PORT", 6644)),
        debug=env_bool("APP_DEBUG", False),
    )

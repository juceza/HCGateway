import os
import sentry_sdk
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()


def _env_bool(name, default=False):
    """Parse a boolean env var. Only 1/true/yes/on (any case) are truthy.

    The previous `bool(os.environ.get(...))` treated the string "False" as
    True, which silently enabled Flask debug mode in production.
    """
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


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
from apiVersions.v2 import init_app as init_v2
init_v2(app)


if __name__ == "__main__":
    # Development entrypoint only. Production runs under gunicorn (see Dockerfile),
    # which imports the module-level `app` above and never executes this block.
    app.run(
        host=os.environ.get("APP_HOST", "0.0.0.0"),
        port=int(os.environ.get("APP_PORT", 6644)),
        debug=_env_bool("APP_DEBUG", False),
    )

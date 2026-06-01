"""Catch-all blueprint that serves the built Web UI SPA.

The React SPA is built to a static ``dist/`` directory (see ``api/web/``). This
blueprint serves that directory with an ``index.html`` fallback so client-side
routes (e.g. ``/records/Steps``, ``/settings``) resolve to the SPA shell instead
of 404ing.

It is registered in ``main.py`` *only* when the ``WEB_DIST`` env var points at a
real directory, so the pure-API deployment stays behaviour-identical when no UI
is built.

The catch-all deliberately refuses to serve anything under ``/api/*`` — those
paths belong to the API blueprints and must keep their own 401/403 semantics.
The more specific ``/api/v2/...`` rules win in Flask's URL map, but a request to
an unknown ``/api/...`` path would otherwise fall through to this catch-all; the
guard returns 404 there instead of leaking ``index.html`` (see TechSpec Known
Risks).
"""

import os

from flask import Blueprint, abort, send_from_directory


def create_web_blueprint(dist_dir):
    """Build the SPA-serving blueprint rooted at ``dist_dir``.

    Serves the requested file when it exists under ``dist_dir``; otherwise falls
    back to ``index.html`` so the SPA router can handle the path. Any request
    whose path starts with ``api/`` is rejected with 404 so the API surface is
    never shadowed.
    """
    dist_dir = os.path.abspath(dist_dir)
    web = Blueprint("web", __name__)

    @web.route("/", defaults={"path": ""})
    @web.route("/<path:path>")
    def serve_spa(path):
        # Never shadow the API surface — let unknown /api/* paths 404 rather
        # than masquerade as the SPA shell.
        if path.startswith("api/"):
            abort(404)

        # Serve the hashed asset if it actually exists on disk...
        if path and os.path.isfile(os.path.join(dist_dir, path)):
            return send_from_directory(dist_dir, path)

        # ...otherwise hand the route to the SPA (client-side routing).
        return send_from_directory(dist_dir, "index.html")

    return web

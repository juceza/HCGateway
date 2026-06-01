"""Shared pytest setup for the API test suite.

Importing ``main`` pulls in ``apiVersions.v2.routes``, which constructs a
``pymongo.MongoClient`` and reads ``MONGO_URI``/``DATA_MASTER_KEY`` at import
time. The client connects lazily, so dummy values are enough to import the app
without a running MongoDB. Provide them here before any test imports ``main``.
"""

import os
import sys

# Make the api/ package root importable (routes.py uses `from crypto import ...`
# and `from apiVersions.v2 import ...`, i.e. api/ must be on sys.path).
_API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _API_ROOT not in sys.path:
    sys.path.insert(0, _API_ROOT)

os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/test")
os.environ.setdefault(
    "DATA_MASTER_KEY",
    # A valid Fernet key (32 url-safe base64 bytes). Tests never decrypt with it.
    "zr8kF1m3aQ0sQ2dV4tYwX6bN8cM0pL2rK4jH6gF8eD0=",
)

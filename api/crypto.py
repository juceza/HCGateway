"""Envelope encryption and token hashing helpers.

Each user has a random per-user data-encryption key (DEK). Records are encrypted
with the DEK. The DEK itself is never stored in the clear: it is wrapped
(encrypted) with a server-side master key (KEK) read from the DATA_MASTER_KEY
environment variable, and only the wrapped form is persisted on the user doc.

This means a database-only compromise (exposed Mongo, leaked backup) does NOT
reveal health data — the attacker also needs DATA_MASTER_KEY, which lives in the
server environment, not the database. It does NOT defend against full server
compromise (env + DB), which is an inherent limitation of decrypting on the
server without the user's password at request time.
"""

import hashlib
import os

from cryptography.fernet import Fernet


def _kek() -> Fernet:
    key = os.environ.get("DATA_MASTER_KEY")
    if not key:
        raise RuntimeError(
            "DATA_MASTER_KEY is not set. Generate one with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode())


def new_wrapped_dek() -> str:
    """Create a fresh per-user DEK and return it wrapped with the master key."""
    dek = Fernet.generate_key()
    return _kek().encrypt(dek).decode()


def fernet_for(wrapped_dek: str) -> Fernet:
    """Unwrap a user's DEK and return a Fernet bound to it."""
    dek = _kek().decrypt(wrapped_dek.encode())
    return Fernet(dek)


def hash_token(token: str) -> str:
    """Deterministically hash an access/refresh token for storage and lookup.

    Tokens are 256-bit random values (secrets.token_urlsafe(32)), so an
    unsalted SHA-256 is sufficient: it is not brute-forceable and lets us look
    a user up by token without storing the raw secret.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

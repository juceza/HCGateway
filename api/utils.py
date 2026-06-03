import os


def env_bool(name, default=False):
    """Parse a boolean env var. Only 1/true/yes/on (any case) are truthy.

    A plain `bool(os.environ.get(...))` treats the string "False" as True, which
    silently enables flags that were meant to be off. This helper makes
    `APP_DEBUG=false` (and similar) actually disable the flag.
    """
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")

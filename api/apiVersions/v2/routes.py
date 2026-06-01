import datetime
import json
import os
import secrets

import pymongo
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from bson.errors import InvalidId
from bson.objectid import ObjectId
from dotenv import load_dotenv
from flask import Blueprint, g, jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pyfcm import FCMNotification

from crypto import fernet_for, hash_token, new_wrapped_dek

# Load environment before any module-level code that reads it (the Mongo client
# below reads MONGO_URI at construction time).
load_dotenv()

mongo = pymongo.MongoClient(os.environ["MONGO_URI"])
ph = PasswordHasher()

v2 = Blueprint("v2", __name__, url_prefix="/api/v2/")

# Rate limiter. Storage is in-memory per worker; sufficient to blunt brute force
# / credential stuffing. init_app is called from apiVersions/v2/__init__.py.
limiter = Limiter(key_func=get_remote_address, default_limits=["300 per hour"])

ACCESS_TTL = datetime.timedelta(hours=12)
REFRESH_TTL = datetime.timedelta(days=30)

# Whitelist for /fetch queries — only these fields and operators are accepted,
# so user input can never inject Mongo operators like $where (server-side JS).
ALLOWED_QUERY_FIELDS = {"_id", "id", "app", "start", "end"}
ALLOWED_QUERY_OPS = {"$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin"}


def bearer_token():
    """Return the bearer token from the Authorization header, or None."""
    header = request.headers.get("Authorization", "")
    parts = header.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        return parts[1].strip()
    return None


def _issue_session():
    """Generate a fresh (token, refresh) pair and their expiry timestamps."""
    now = datetime.datetime.now()
    return {
        "plain_token": secrets.token_urlsafe(32),
        "plain_refresh": secrets.token_urlsafe(32),
        "expiry": now + ACCESS_TTL,
        "refreshExpiry": now + REFRESH_TTL,
    }


def _sanitize_query(q):
    """Validate a user-supplied Mongo find() filter. Returns the filter on
    success or None if it contains anything outside the allowlist."""
    if not isinstance(q, dict):
        return None
    for field, value in q.items():
        if field.startswith("$") or field not in ALLOWED_QUERY_FIELDS:
            return None
        if isinstance(value, dict):
            for op in value:
                if op not in ALLOWED_QUERY_OPS:
                    return None
    return q


@v2.before_request
def before_request():
    if request.endpoint in ("v2.login", "v2.refresh"):
        return

    token = bearer_token()
    if not token:
        return jsonify({"error": "no token provided"}), 401

    db = mongo["hcgateway"]
    usrStore = db["users"]

    user = usrStore.find_one({"token": hash_token(token)})

    if not user:
        return jsonify({"error": "invalid token"}), 401

    if "expiry" not in user or datetime.datetime.now() > user["expiry"]:
        return jsonify({"error": "token expired. Use /api/v2/login to reauthenticate."}), 401

    g.user = user["_id"]

    return


@v2.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    if not request.json or "username" not in request.json or "password" not in request.json:
        return jsonify({"error": "invalid request"}), 400
    username = request.json["username"]
    password = request.json["password"]
    fcmToken = request.json["fcmToken"] if "fcmToken" in request.json else None

    db = mongo["hcgateway"]
    usrStore = db["users"]

    user = usrStore.find_one({"username": username})

    if not user:
        session = _issue_session()
        usrStore.insert_one(
            {
                "_id": str(ObjectId()),
                "username": username,
                "password": ph.hash(password),
                "encKeyWrapped": new_wrapped_dek(),
                "fcmToken": fcmToken,
                "token": hash_token(session["plain_token"]),
                "refresh": hash_token(session["plain_refresh"]),
                "expiry": session["expiry"],
                "refreshExpiry": session["refreshExpiry"],
            }
        )
        return (
            jsonify(
                {
                    "token": session["plain_token"],
                    "refresh": session["plain_refresh"],
                    "expiry": session["expiry"].isoformat(),
                }
            ),
            201,
        )

    try:
        ph.verify(user["password"], password)
    except VerifyMismatchError:
        return jsonify({"error": "invalid password"}), 403
    except Exception:
        return jsonify({"error": "invalid password"}), 403

    update = {}
    if fcmToken:
        update["fcmToken"] = fcmToken

    # Backfill a data key for any user that somehow lacks one.
    if not user.get("encKeyWrapped"):
        update["encKeyWrapped"] = new_wrapped_dek()

    # Always issue a fresh session: only token hashes are stored, so the
    # plaintext cannot be re-served from the database.
    session = _issue_session()
    update["token"] = hash_token(session["plain_token"])
    update["refresh"] = hash_token(session["plain_refresh"])
    update["expiry"] = session["expiry"]
    update["refreshExpiry"] = session["refreshExpiry"]

    usrStore.update_one({"_id": user["_id"]}, {"$set": update})

    return (
        jsonify(
            {
                "token": session["plain_token"],
                "refresh": session["plain_refresh"],
                "expiry": session["expiry"].isoformat(),
            }
        ),
        201,
    )


@v2.route("/refresh", methods=["POST"])
@limiter.limit("10 per minute")
def refresh():
    if not request.json or "refresh" not in request.json:
        return jsonify({"error": "invalid request"}), 400

    presented = request.json["refresh"]

    db = mongo["hcgateway"]
    usrStore = db["users"]

    user = usrStore.find_one({"refresh": hash_token(presented)})

    if not user:
        return jsonify({"error": "invalid refresh token"}), 403

    if "refreshExpiry" not in user or datetime.datetime.now() > user["refreshExpiry"]:
        return (
            jsonify({"error": "refresh token expired. Use /api/v2/login to reauthenticate."}),
            403,
        )

    # Rotate BOTH tokens on every refresh, so a captured refresh token cannot be
    # reused after the legitimate client refreshes.
    session = _issue_session()
    usrStore.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "token": hash_token(session["plain_token"]),
                "refresh": hash_token(session["plain_refresh"]),
                "expiry": session["expiry"],
                "refreshExpiry": session["refreshExpiry"],
            }
        },
    )

    return (
        jsonify(
            {
                "token": session["plain_token"],
                "refresh": session["plain_refresh"],
                "expiry": session["expiry"].isoformat(),
            }
        ),
        200,
    )


@v2.route("/revoke", methods=["DELETE"])
def revoke():
    # before_request has already authenticated the caller and set g.user.
    db = mongo["hcgateway"]
    usrStore = db["users"]

    usrStore.update_one(
        {"_id": g.user}, {"$unset": {"token": 1, "refresh": 1, "expiry": 1, "refreshExpiry": 1}}
    )

    return jsonify({"success": True}), 200


@v2.get("/counts")
def counts():
    userid = g.user
    db = mongo["hcgateway_" + userid]
    result = {}
    for col_name in db.list_collection_names():
        display_name = col_name[0].upper() + col_name[1:]
        result[display_name] = db[col_name].count_documents({})
    return jsonify(result), 200


@v2.post("/sync/<method>")
def sync(method):
    method = method[0].lower() + method[1:]
    if not method:
        return jsonify({"error": "no method provided"}), 400
    if not request.json or "data" not in request.json:
        return jsonify({"error": "no data provided"}), 400

    userid = g.user

    db = mongo["hcgateway"]
    usrStore = db["users"]

    try:
        user = usrStore.find_one({"_id": userid})
    except InvalidId:
        return jsonify({"error": "invalid user id"}), 400

    fernet = fernet_for(user["encKeyWrapped"])

    data = request.json["data"]
    if not isinstance(data, list):
        data = [data]
    print(f"{method}: {len(data)} records")

    db = mongo["hcgateway_" + userid]
    collection = db[method]

    operations = []
    for item in data:
        itemid = item["metadata"]["id"]
        dataObj = {}
        for k, v in item.items():
            if k != "metadata" and k != "time" and k != "startTime" and k != "endTime":
                dataObj[k] = v

        if "time" in item:
            starttime = item["time"]
            endtime = None
        else:
            starttime = item["startTime"]
            endtime = item["endTime"]

        toencrypt = json.dumps(dataObj).encode()
        encrypted = fernet.encrypt(toencrypt).decode()

        operations.append(
            pymongo.UpdateOne(
                {"_id": itemid},
                {
                    "$set": {
                        "id": itemid,
                        "data": encrypted,
                        "app": item["metadata"]["dataOrigin"],
                        "start": starttime,
                        "end": endtime,
                    }
                },
                upsert=True,
            )
        )

    if operations:
        result = collection.bulk_write(operations, ordered=False)
        print(f"  inserted={result.upserted_count} modified={result.modified_count}")

    return jsonify({"success": True}), 200


@v2.route("/fetch/<method>", methods=["POST"])
def fetch(method):
    if not method:
        return jsonify({"error": "no method provided"}), 400

    userid = g.user
    db = mongo["hcgateway"]
    usrStore = db["users"]

    try:
        user = usrStore.find_one({"_id": userid})
    except InvalidId:
        return jsonify({"error": "invalid user id"}), 400

    fernet = fernet_for(user["encKeyWrapped"])

    raw_queries = (request.json or {}).get("queries", {})
    queries = _sanitize_query(raw_queries)
    if queries is None:
        return jsonify({"error": "invalid query"}), 400

    db = mongo["hcgateway_" + userid]
    collection = db[method]

    docs = []
    for doc in collection.find(queries):
        doc["data"] = json.loads(fernet.decrypt(doc["data"].encode()).decode())
        docs.append(doc)

    return jsonify(docs), 200


@v2.route("/push/<method>", methods=["PUT"])
def pushData(method):
    if not method:
        return jsonify({"error": "no method provided"}), 400
    if not request.json or "data" not in request.json:
        return jsonify({"error": "no data provided"}), 400

    userid = g.user
    data = request.json["data"]
    if not isinstance(data, list):
        data = [data]

    fixedMethodName = method[0].upper() + method[1:]
    for r in data:
        r["recordType"] = fixedMethodName
        if "time" not in r and ("startTime" not in r or "endTime" not in r):
            return (
                jsonify(
                    {
                        "error": 'no start time or end time provided. If only one time is to be used, then use the "time" attribute instead.'
                    }
                ),
                400,
            )
        if ("startTime" in r and "endTime" not in r) or ("startTime" not in r and "endTime" in r):
            return jsonify({"error": "start time and end time must be provided together."}), 400

    db = mongo["hcgateway"]
    usrStore = db["users"]

    try:
        user = usrStore.find_one({"_id": userid})
    except InvalidId:
        return jsonify({"error": "invalid user id"}), 400

    fcmToken = user["fcmToken"] if "fcmToken" in user else None
    if not fcmToken:
        return jsonify({"error": "no fcm token found"}), 404

    fcm = FCMNotification(
        service_account_file="service-account.json", project_id=os.environ["FCM_PROJECT_ID"]
    )

    try:
        fcm.notify(
            fcm_token=fcmToken,
            data_payload={
                "op": "PUSH",
                "data": json.dumps(data),
            },
        )
    except Exception:
        return jsonify({"error": "Message delivery failed"}), 500

    return jsonify({"success": True, "message": "request has been sent to device."}), 200


@v2.route("/delete/<method>", methods=["DELETE"])
def delData(method):
    if not method:
        return jsonify({"error": "no method provided"}), 400
    if not request.json or "uuid" not in request.json:
        return jsonify({"error": "no uuid provided"}), 400

    userid = g.user
    uuids = request.json["uuid"]
    if not isinstance(uuids, list):
        uuids = [uuids]

    fixedMethodName = method[0].upper() + method[1:]

    db = mongo["hcgateway"]
    usrStore = db["users"]

    try:
        user = usrStore.find_one({"_id": userid})
    except InvalidId:
        return jsonify({"error": "invalid user id"}), 400

    fcmToken = user["fcmToken"] if "fcmToken" in user else None
    if not fcmToken:
        return jsonify({"error": "no fcm token found"}), 404

    fcm = FCMNotification(
        service_account_file="service-account.json", project_id=os.environ["FCM_PROJECT_ID"]
    )

    try:
        fcm.notify(
            fcm_token=fcmToken,
            data_payload={
                "op": "DEL",
                "data": json.dumps({"uuids": uuids, "recordType": fixedMethodName}),
            },
        )
    except Exception:
        return jsonify({"error": "Message delivery failed"}), 500

    return jsonify({"success": True, "message": "request has been sent to device."}), 200


@v2.delete("/sync/<method>")
def delFromDb(method):
    method = method[0].lower() + method[1:]
    if not method:
        return jsonify({"error": "no method provided"}), 400
    if not request.json or "uuid" not in request.json:
        return jsonify({"error": "no uuid provided"}), 400

    userid = g.user
    uuids = request.json["uuid"]

    if not isinstance(uuids, list):
        uuids = [uuids]

    db = mongo["hcgateway_" + userid]
    collection = db[method]
    for uuid in uuids:
        try:
            collection.delete_one({"_id": uuid})
        except Exception as e:
            print(e)

    return jsonify({"success": True}), 200

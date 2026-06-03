# HCGateway

HCGateway is a platform that lets developers connect to the Android [Health Connect](https://developer.android.com/health-and-fitness/guides/health-connect) API through a REST API. You can view the documentation for the REST API [here](https://hcgateway.shuchir.dev/).

> [!NOTE]
> This is my personal fork. The original [HCGateway](https://github.com/ShuchirJ/HCGateway) was created by **ShuchirJ** as a React Native app. The **Android app was rewritten** to native Kotlin + Jetpack Compose (Hilt, MVVM, WorkManager, Health Connect Client 1.1.0) in the [salmon-21 `compose-rewrite`](https://github.com/salmon-21/HCGateway/tree/compose-rewrite) fork, which this repository builds on. The **Flask + MongoDB REST API server is kept from upstream** and remains compatible.

## How it works

The platform consists of two parts:

- A **REST API/server** (`api/`) — Python Flask + MongoDB.
- A **mobile application** (`app/`) — native Android (Kotlin + Jetpack Compose) that periodically syncs Health Connect data to the server.
- An optional **web dashboard** (`api/web/`) — a read-only React SPA, served by the same Flask process, for viewing your synced data in a browser (see [Web UI](#web-ui)).

The platform supports **two-way sync**: you can read your data through the REST API and also push changes back into the device's Health Connect store remotely.

### Sync behavior

- The app syncs in the background on a configurable interval. The **default is every 15 minutes**, and presets range up to once per day (15 min / 30 min / 1 hr / 2 hr / 6 hr / daily). 15 minutes is the minimum, due to a WorkManager constraint.
- You can also trigger a **Force Sync** at any time from the app, optionally over a custom date range.
- Sync is **incremental** via the Health Connect Changes API — after the first full sync, only records added or modified since the last run are uploaded.
- Reading data older than 30 days requires the `READ_HEALTH_DATA_HISTORY` permission, which the app requests.
- The server encrypts each record before storing it in MongoDB using **envelope encryption**: every user has a random per-user data key, and that key is itself encrypted with a server master key (`DATA_MASTER_KEY`) that lives in the server environment, not the database. A database-only leak therefore does not expose health data without the master key. (It does not protect against a full server compromise — see [Self Hosting](#self-hosting).)
- The server exposes an API for developers to log in and retrieve their users' data.

### Supported data types

The app syncs the following Health Connect record types:

| | | |
|---|---|---|
| ActiveCaloriesBurned | BasalBodyTemperature | BasalMetabolicRate |
| BloodGlucose | BloodPressure | BodyFat |
| BodyTemperature | BodyWaterMass | BoneMass |
| CervicalMucus | CyclingPedalingCadence | Distance |
| ElevationGained | ExerciseSession | FloorsClimbed |
| HeartRate | HeartRateVariabilityRmssd | Height |
| Hydration | IntermenstrualBleeding | LeanBodyMass |
| MenstruationFlow | MenstruationPeriod | MindfulnessSession¹ |
| Nutrition | OvulationTest | OxygenSaturation |
| PlannedExerciseSession | Power | RespiratoryRate |
| RestingHeartRate | SexualActivity | SkinTemperature |
| SleepSession | Speed | Steps |
| StepsCadence | TotalCaloriesBurned | Vo2Max |
| Weight | WheelchairPushes | |

¹ `MindfulnessSession` is experimental and unsupported on some devices (e.g. Samsung); the app filters out types the device rejects.

## Get Started

- A live server instance maintained by the original author is hosted at `https://api.hcgateway.shuchir.dev/`. You can use it or host your own (see [Self Hosting](#self-hosting)).

  > [!IMPORTANT]
  > **Use any hosted instance at your own risk. By using a server you do not control, you acknowledge that all responsibility is waived from the server owner.** Health data is decrypted server-side, so the operator of any instance can read it — self-host if you want sole control, and always connect over HTTPS.

- Install the mobile application from the APK in this repository's Releases section, or build it yourself (see [below](#mobile-application)).
- Minimum requirement is **Android 8.0 (Oreo, API 26)**.
- Health Connect must be installed on the device.
- On first launch, sign up with a username and password and grant the requested Health Connect permissions. Once you reach the home screen, your data will sync on the configured schedule (or immediately via Force Sync).

## Database

### Users structure

```
users {
    _id: string
    username: string
    password: string         # Argon2 hash
    fcmToken: string
    expiry: datetime         # access-token expiry
    refreshExpiry: datetime  # refresh-token expiry
    token: string            # SHA-256 hash of the access token
    refresh: string          # SHA-256 hash of the refresh token
    encKeyWrapped: string    # per-user data key, encrypted with DATA_MASTER_KEY
}
```

> [!NOTE]
> The user's password is hashed using Argon2. It is never stored in plain text and cannot be retrieved through any API. Access and refresh **tokens are stored as SHA-256 hashes**, so the raw tokens cannot be recovered from a database leak. Refresh tokens are **rotated on every refresh** and expire after 30 days.

### Data structure

```
hcgateway_[user_id]: string {
    dataType: string {
        _id: string
        data: string
        id: string
        start: datetime
        end: datetime
        app: string
    }
}
```

### Parameters

- `_id` — The ID of the object.
- `data` — The object's data, encrypted with the user's per-user data key (Fernet). When requested through the API, the server unwraps that key with `DATA_MASTER_KEY` and decrypts the data for you.
- `id` — Same as `_id`; kept only for backward compatibility and may be removed in a future version.
- `start` — The start date and time of the object.
- `end` — The end date and time of the object. May be absent for some object types.
- `app` — The package name of the app the object was synced from.

## REST API

The documentation for the REST API can be found at <https://hcgateway.shuchir.dev/>.

## Mobile Application

The mobile application is a native Android app written in **Kotlin** with **Jetpack Compose** (Material 3 Expressive), using Hilt for dependency injection, MVVM architecture, and WorkManager for background sync. It does **not** use a foreground service for periodic sync — it posts a progress notification directly, which avoids Android 15's 6-hour `dataSync` foreground-service limit.

Firebase Cloud Messaging is used only to let a self-hosted server trigger a sync remotely (push), and is optional.

## Web UI

The Web UI (`api/web/`) is an **optional, read-only** browser dashboard for the data the app syncs. It is a React SPA (Vite + TypeScript, TanStack Router/Query, shadcn/ui charts) that logs in with your existing HCGateway account and visualizes your records: an overview-first home with per-type counts and sparklines for the high-value types, drilling into time-window-bound detail views with trend charts (and a readable table + JSON fallback for the rest). It consumes the **existing `/api/v2` REST API only — no backend changes** — and reads, never writes (no push/delete in V1).

**Your data, on your server — not Google's.** The dashboard is about data **ownership and control**, not zero-knowledge: record `data` is decrypted **server-side** by Flask (envelope encryption with `DATA_MASTER_KEY`; see [Self Hosting](#self-hosting)), so the server — and therefore its operator — can read it. Self-host if you want sole control, and always connect over HTTPS.

### Packaging

The UI ships **inside the same single Docker image** as the API — there is no separate web container. A Bun build stage in `api/Dockerfile` compiles the SPA to a static `dist/`, copies it into the runtime image, and sets `WEB_DIST=/app/web/dist`. Flask serves that directory via a catch-all blueprint (`api/static_web.py`) **only when `WEB_DIST` points at a real directory**, with an `index.html` fallback for client-side routes. When `WEB_DIST` is unset or missing, no blueprint is registered and the server behaves as a **pure API** — so the API-only deployment is unaffected. The published image already bundles the UI, so a standard `docker-compose up -d` (see [Self Hosting](#self-hosting)) serves it at `http://localhost:6644/` alongside the API at `/api/v2/*`.

### Building it yourself

The SPA is built automatically by the Docker image (see above). To build it standalone (requires [Bun](https://bun.sh/)):

```bash
cd api/web
bun install          # or: bun install --frozen-lockfile (matches the Dockerfile)
bun run build         # regenerates routeTree.gen.ts, type-checks, emits dist/
```

Point a pure-`uv` server at the result by exporting `WEB_DIST=$(pwd)/dist` before starting Flask (the [Manual](#manual) self-host path), or build the Docker image, which does all of this for you:

```bash
docker build -f api/Dockerfile -t hcgateway:local api/
```

> [!NOTE]
> The Docker **build context is `./api`** (preserved deliberately), which is why `api/web/` is referenced as `web/` inside the Dockerfile. `docker-compose.yml` pulls a prebuilt `image:` rather than building locally, so `docker compose up --build` does **not** rebuild it — use the `docker build` command above to build from source.

### Development

Run the SPA against a running API with the Vite dev server:

```bash
cd api/web
bun run dev           # Vite dev server on http://localhost:5173
```

The dev server **proxies `/api/*` to Flask** at `http://localhost:6644` (override with the `VITE_API_PROXY_TARGET` env var), keeping requests same-origin so the auth/Bearer flow behaves exactly as in production (no CORS). Start the API separately (see [Self Hosting → Manual](#manual)). Unit tests run with `bun run test` (Vitest).

## Self Hosting

You can self-host the server and database for full control. If you want to trigger pushes from your own server, you must also build the mobile app yourself with your own Firebase configuration (see [Firebase](#firebase)).

### Firebase

Firebase is only required if you want your server to trigger remote syncs. To set it up:

1. Create a new Firebase project at <https://console.firebase.google.com/>.
2. Add an Android app to the project (use the application ID `dev.shuchir.hcgateway`, or change it in `app/app/build.gradle.kts` and your manifest if you fork the package).
3. Download the `google-services.json` file and place it at `app/app/google-services.json`.
4. In the Firebase console, go to **Project settings → Service accounts**, generate a new private key, and save it as `service-account.json` in the `api/` folder.

### Server

> [!IMPORTANT]
> **Secure deployment checklist** — review before exposing the server:
> - **Set a strong, unique `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`** in `api/.env` (the defaults in `.env.example` are placeholders). MongoDB is **not** published to the host/LAN by `docker-compose.yml` — keep it that way.
> - **Generate a `DATA_MASTER_KEY`** (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) and keep it secret and backed up separately. It encrypts every user's data key; **lose it and all stored data is unrecoverable**, leak it together with the database and the data can be decrypted.
> - **Keep `APP_DEBUG=false`.** Flask debug mode exposes a remote code-execution debugger.
> - **Set `ALLOW_REGISTRATION=false`** if you don't want anyone with access to the app/API to create new accounts. New accounts are auto-created on first login by default; with the flag off, only existing accounts can log in.
> - **Do not expose the API directly to the internet.** Keep it on your LAN/VPN, or put a TLS-terminating reverse proxy in front and serve over **HTTPS** only (bind the API to `127.0.0.1` in that case).
> - The encryption protects against a database-only leak, **not** a full server compromise (an attacker with both the DB and the server environment can decrypt).

#### Docker (recommended)

1. **Prerequisites** — Docker and Docker Compose.
2. **Environment** — Copy `api/.env.example` to `api/.env` and configure it: set `DATA_MASTER_KEY`, the MongoDB credentials, and `MONGO_URI` (format `mongodb://<username>:<password>@db:27017/hcgateway?authSource=admin`, matching the credentials). If you want push support, place `service-account.json` in `api/` (see [Firebase](#firebase)).
3. **Run**
   ```bash
   docker-compose up -d
   ```
   The API is available at `http://localhost:6644` (served by gunicorn). Put it behind an HTTPS proxy before exposing it beyond your LAN.

#### Manual

- Prerequisites: [uv](https://docs.astral.sh/uv/) (Python 3.12+, managed by uv), MongoDB.
- `cd` into `api/`.
- `uv sync` to install the dependencies from the lockfile into a local `.venv`.
- Copy `.env.example` to `.env` and fill in the values (including `DATA_MASTER_KEY`).
- (Optional, for push) Place `service-account.json` in `api/`.
- Development: `uv run python main.py`. Production: run under a WSGI server, e.g. `uv run gunicorn --bind 0.0.0.0:6644 --workers 2 main:app`.
- (Optional, for the [Web UI](#web-ui)) Build the SPA and export `WEB_DIST` to the resulting `dist/` before starting Flask — e.g. `cd web && bun install && bun run build && cd .. && WEB_DIST=$(pwd)/web/dist uv run python main.py`. Leave `WEB_DIST` unset to run API-only.

### Mobile Application

- Prerequisites: **JDK 17**, Android SDK / Android Studio, an Android device or emulator with **Health Connect** installed.
- Toolchain (pinned in `app/gradle/libs.versions.toml`): Gradle 9.4.0, AGP 8.10.1, Kotlin 2.1.20, Compose BOM 2026.02.00, Health Connect Client 1.1.0.
- All commands are run from the `app/` directory.

Build and install a debug build on a connected device:

```bash
cd app
./gradlew installDebug
```

Build a release APK:

```bash
cd app
./gradlew assembleRelease
```

If code changes don't seem to take effect (cached artifacts), do a clean build: `./gradlew clean installDebug`.

#### Error reporting (Sentry)

Sentry is **opt-in and ships disabled**: auto-init is off in the manifest, and the SDK only starts when the in-app toggle is enabled. **The DSN is intentionally blank.** If you fork or distribute this app and want crash reports sent to your own Sentry project, set your DSN via one of:

- the `io.sentry.dsn` manifest meta-data,
- a build manifest placeholder, or
- a programmatic `SentryAndroid.init` call.

The Sentry Gradle plugin uploads mappings/source on **release builds only**; its auth token, if used, lives in the gitignored `app/sentry.properties`. If you don't want Sentry at all, simply leave the DSN blank and the toggle off.

## Credits

This is a fork maintained by [@juceza](https://github.com/juceza). The project lineage:

- **Original creator:** [ShuchirJ/HCGateway](https://github.com/ShuchirJ/HCGateway) by **ShuchirJ** — wrote the REST API server and the original React Native app, and maintains the [REST API documentation](https://hcgateway.shuchir.dev/) and the public hosted instance.
- **Compose rewrite:** [salmon-21/HCGateway `compose-rewrite`](https://github.com/salmon-21/HCGateway/tree/compose-rewrite) — rewrote the Android app from React Native to native Kotlin + Jetpack Compose. This repository is forked from that branch.

If you'd like to support the original author:

<a href="https://www.buymeacoffee.com/shuchir" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

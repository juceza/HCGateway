# HCGateway Development Guide

Android app (Jetpack Compose + Kotlin, Hilt, MVVM) under `app/` that syncs Health Connect data to a self-hosted Flask API under `api/`.

See @README.md for the user-facing overview. Dependencies are pinned in `app/gradle/libs.versions.toml`.

## Architecture

- **Android app**: `app/` — Jetpack Compose, Kotlin, Hilt DI, MVVM
- **API server**: `api/` — Python Flask + MongoDB (this branch keeps the upstream stack)

### App structure

```
app/app/src/main/java/dev/shuchir/hcgateway/
  HCGatewayApp.kt              # @HiltAndroidApp, opt-in Sentry init, theme init
  MainActivity.kt              # AppCompatActivity, single activity
  di/                          # Hilt modules (AppModule, HealthConnectModule)
  data/
    local/                     # DataStore preferences
    remote/                    # Retrofit API, auth interceptors
    repository/                # Auth, Sync, HealthConnect, NetworkMonitor
  domain/model/                # RecordTypes, SyncState
  ui/
    theme/                     # Material You + custom colors (success)
    navigation/                # NavGraph with material-motion transitions
    home/                      # Sync screen (HomeScreen, HomeViewModel)
    login/                     # Login screen
    settings/                  # Settings, Licenses screens
    onboarding/                # Permission onboarding
    components/                # FilledCard, SyncWarningDialog
  worker/                      # SyncWorker, SyncScheduler, BootReceiver, SyncNotificationManager
  fcm/                         # Firebase Cloud Messaging
```

### Key dependencies

- Compose BOM 2026.02.00, Material 3 1.5.0-alpha15 (M3 Expressive)
- Hilt 2.53.1, Retrofit + OkHttp, DataStore, WorkManager
- Health Connect Client 1.1.0 (stable), 41 record types
- Firebase Messaging, Sentry (opt-in)
- material-motion-compose-core (Shared Axis X transitions)
- aboutlibraries-core (license metadata)
- Gradle 9.4.0, AGP 8.10.1, Kotlin 2.1.20

## Build

- **Build & install**: `./gradlew installDebug` (from `app/`, auto-launches the app)
- **Clean build**: `./gradlew clean installDebug` — needed when code changes aren't reflected (`installDebug` may use cached artifacts)
- Requires a connected Android device with Health Connect installed.

## Design decisions (non-obvious)

- **Theme switching** uses `AppCompatDelegate`, not Compose state — instant, no recomposition delay.
- **OkHttp AuthInterceptor** auto-refreshes on **403** (this API returns 403, not 401).
- **Changes API** for incremental delta sync.
- **Streaming sync**: `readRecordsPaged` feeds a Channel pipeline so reads and uploads overlap and memory stays bounded.
- **Idle notification** uses `NotificationManager.notify()` directly via `SyncNotificationManager`, *not* a foreground service — avoids Android 15's 6-hour `dataSync` foreground service limit.
- **Reading data older than 30 days** requires `PERMISSION_READ_HEALTH_DATA_HISTORY`.
- **UI** targets M3 Expressive (wavy progress, spring motion, expressive shapes).
- **Sentry is opt-in**: `io.sentry.auto-init=false` in the manifest, so `HCGatewayApp.initSentry` starts the SDK only when the in-app toggle (`sentryEnabled`) is on — gating both errors and Release Health sessions. DSN and `io.sentry.environment` are manifest meta-data (the latter from the `sentryEnvironment` manifestPlaceholder per buildType) so they're set before auto session tracking begins; setting `environment` only in `options` is too late and sessions get tagged `production`. **The DSN ships blank** — forks/distributors set their own (manifest meta-data, manifestPlaceholder, or programmatic `SentryAndroid.init` options) so crash reports go to their Sentry project, not whoever built this branch. The Sentry Gradle plugin uploads mappings/source on **release only** (`ignoredBuildTypes = ["debug"]`); its auth token lives in the gitignored `app/sentry.properties`.

## Security (non-obvious)

- **Data encryption is envelope-based** (`api/crypto.py`). Each user has a random Fernet **data key (DEK)**; the DEK is stored only after being encrypted with a server master key (**`DATA_MASTER_KEY`** env var, a Fernet key). `sync`/`fetch` call `fernet_for(user['encKeyWrapped'])`. The old scheme derived the key from `argon2_hash[:32]` — effectively constant across users and stored next to the data; do **not** reintroduce it. `DATA_MASTER_KEY` is required; loss = unrecoverable data, leak-with-DB = decryptable data. Protects DB-only compromise, not full server compromise.
- **Tokens are stored hashed** (`hash_token` = SHA-256) server-side; `before_request`/`refresh` look users up by hash. Raw tokens are returned to the client once and never persisted. **Refresh tokens rotate on every `/refresh`** and expire (`refreshExpiry`, 30 days). Login always issues a fresh pair (can't re-serve a stored hash).
- **`/fetch` queries are allowlisted** (`_sanitize_query`) — only specific fields/operators, blocking `$where`-style NoSQL/JS injection.
- **Auth parsing** goes through `bearer_token()`; missing/malformed `Authorization` returns 401, never a 500.
- **Flask debug** is parsed via `_env_bool` (only `1/true/yes/on` are truthy) — `APP_DEBUG=false` actually disables it. Production runs under **gunicorn** (Dockerfile `CMD`); `app.run` is dev-only under `__main__`. **v1 API was deleted** (it accepted an unauthenticated `userid`). Rate limiting via Flask-Limiter on `/login` (5/min) and `/refresh` (10/min) — in-memory store (per-worker; fine for self-host).
- **App stores tokens encrypted at rest** (`TokenCrypto`, AES-256-GCM via Android Keystore). All token I/O goes through `PreferencesRepository.saveTokens` (encrypts) and the `settings` flow (decrypts) — don't read/write `UserPreferences.TOKEN`/`REFRESH_TOKEN` directly. Cleartext HTTP is still allowed for LAN self-hosting (`res/xml/network_security_config.xml`), but HTTPS is default and the login screen warns when HTTP is selected.

## Sync

- **fullSync**: all 41 record types in parallel via `async(Dispatchers.IO)`; each streams pages (1000 records) through a Channel — reader produces, consumer uploads. Memory bounded.
- **deltaSync**: uses a Changes API token to sync only records modified since last sync. The token is only advanced when every type's upload succeeds — partial failures hold the token so dropped records re-emit on the next run.
- **Cancel**: a `@Volatile cancelled` flag stops async coroutines from overwriting the Cancelled state; reader/consumer loops call `ensureActive()`. `CancellationException` is caught ahead of broad catches everywhere so coroutine cancel is never reported as a crash.
- **Force Sync**: date-range picker; consumes the Changes API token on completion to clear New counts.
- **Retry**: `SyncWorker` maps a sync that returned `false` to `Result.retry()` (transient `IOException`/HTTP 5xx); HTTP non-2xx is treated as a real failure, not a silent success.
- **WorkManager**: periodic sync with a 75% interval guard against duplicate runs on foreground resume. Minimum interval is **15 min** (WorkManager constraint).

## Gotchas

- **MindfulnessSession (record type 41)** is experimental and unsupported on Samsung. Including it in a `ChangesTokenRequest` throws a `SecurityException` that silently blocks token persistence — filter unsupported types via `getGrantedPermissions()`.
- **getChangesToken() may still reject a granted type.** On some Samsung devices `getGrantedPermissions()` returns `READ_HEART_RATE` but `getChangesToken()` then raises `SecurityException` demanding the same permission. `HealthConnectRepository.getChangesToken()` parses the rejected class from the message and retries with that type removed.
- **Samsung Health** writes to Health Connect in ~1-hour batches, not real-time.
- **Process recreation**: Android may kill the background process; ViewModels reset and in-memory state (e.g. `_serverCounts`) becomes null. Don't assume it persists.
- **`LinearWavyProgressIndicator` amplitude**: the M3 component runs its own internal spring on amplitude, so external dynamic values don't take effect — use fixed values.
- **logcat PID changes** after reinstall or process recreation — confirm the PID matches the current process.
- **Adding a record type** touches 4 files: `RecordTypes.kt`, `RecordSerializer.kt`, `AndroidManifest.xml` (READ/WRITE permissions), and `HealthConnectRepository.kt` (`getChangesToken` filter if experimental).

## Conventions

- Keep responses concise.

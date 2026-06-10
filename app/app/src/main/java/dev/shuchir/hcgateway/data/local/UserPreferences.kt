package dev.shuchir.hcgateway.data.local

import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey

object UserPreferences {
    val TOKEN = stringPreferencesKey("token")
    val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    val API_BASE = stringPreferencesKey("api_base")
    val USERNAME = stringPreferencesKey("username")
    val THEME_MODE = stringPreferencesKey("theme_mode") // "light", "dark", "system"
    val SYNC_INTERVAL = intPreferencesKey("sync_interval") // minutes
    val SYNC_TIME_OF_DAY = intPreferencesKey("sync_time_of_day") // minute-of-day for daily sync, -1 = interval mode
    val FULL_SYNC_MODE = booleanPreferencesKey("full_sync_mode")
    val LAST_SYNC = longPreferencesKey("last_sync") // epoch millis
    val CHANGES_TOKEN = stringPreferencesKey("changes_token")
    val SENTRY_ENABLED = booleanPreferencesKey("sentry_enabled")
    val FCM_TOKEN = stringPreferencesKey("fcm_token")
    val USE_HTTPS = booleanPreferencesKey("use_https")
    val LAST_SYNC_RESULTS = stringPreferencesKey("last_sync_results") // JSON: [{"typeName":"Steps","recordCount":38},...]
    val ONBOARDING_COMPLETE = booleanPreferencesKey("onboarding_complete")
    val START_ON_BOOT = booleanPreferencesKey("start_on_boot")
    val AUTO_SYNC_ENABLED = booleanPreferencesKey("auto_sync_enabled")
}

data class UserSettings(
    val token: String = "",
    val refreshToken: String = "",
    val apiBase: String = "",
    val username: String = "",
    val themeMode: String = "system",
    val syncInterval: Int = 15,
    val syncTimeOfDay: Int = -1, // minute-of-day for daily sync; -1 means interval mode
    val fullSyncMode: Boolean = false,
    val lastSync: Long = 0L,
    val changesToken: String = "",
    val sentryEnabled: Boolean = false,
    val fcmToken: String = "",
    val useHttps: Boolean = true,
    val lastSyncResults: String = "", // JSON
    val startOnBoot: Boolean = true,
    val autoSyncEnabled: Boolean = true,
)

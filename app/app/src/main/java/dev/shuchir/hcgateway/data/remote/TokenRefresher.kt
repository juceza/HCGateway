package dev.shuchir.hcgateway.data.remote

import dev.shuchir.hcgateway.data.local.PreferencesRepository
import dev.shuchir.hcgateway.data.local.SettingsCache
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single, serialized entry point for refreshing the access/refresh token pair.
 *
 * The server rotates the refresh token on every `/refresh` call (the old one is
 * invalidated). With multiple independent refresh paths (the OkHttp interceptor on
 * 403, the authenticator on 401, and the home reachability check) firing concurrently
 * with the same refresh token, all but the first rotation get a 403 and the client can
 * end up persisting a token the server no longer recognises — a permanent desync where
 * every subsequent refresh returns 403.
 *
 * This collapses all of those into one [Mutex]-guarded call that coalesces concurrent
 * refreshes: callers that arrive while a refresh is in flight (or just after one) reuse
 * the freshly rotated token instead of issuing a second `/refresh`.
 */
@Singleton
class TokenRefresher
@Inject
constructor(
    private val settingsCache: SettingsCache,
    private val preferencesRepository: PreferencesRepository,
    private val apiServiceProvider: dagger.Lazy<ApiService>,
) {
    private val mutex = Mutex()

    /** The refresh token already consumed by a successful rotation (guards cache-propagation lag). */
    @Volatile private var consumedRefreshToken: String? = null

    /**
     * Returns a valid access token, refreshing once if needed. Concurrent callers coalesce.
     *
     * @param triggeringToken the access token the caller saw fail (null if it had none).
     *        If the cached access token already differs, another caller refreshed first and
     *        that token is returned without hitting the network.
     * @return the current valid access token, or null if there is no refresh token or the
     *         refresh failed.
     */
    suspend fun refresh(triggeringToken: String?): String? = mutex.withLock {
        // Another caller rotated while we waited for the lock — reuse its token.
        val currentAccess = settingsCache.token
        if (!triggeringToken.isNullOrBlank() && currentAccess.isNotBlank() && currentAccess != triggeringToken) {
            return@withLock currentAccess
        }

        val refreshToken = settingsCache.refreshToken
        if (refreshToken.isBlank()) return@withLock null
        // This token was already rotated away; the cache just hasn't caught up yet.
        if (refreshToken == consumedRefreshToken) {
            return@withLock currentAccess.takeIf { it.isNotBlank() }
        }

        try {
            val result = apiServiceProvider.get().refresh(RefreshRequest(refreshToken))
            val body = result.body()
            if (result.isSuccessful && body != null) {
                consumedRefreshToken = refreshToken
                settingsCache.updateTokens(body.token, body.refresh)
                preferencesRepository.saveTokens(body.token, body.refresh)
                body.token
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Blocking variant for OkHttp interceptor/authenticator threads. */
    fun refreshBlocking(triggeringToken: String?): String? = runBlocking { refresh(triggeringToken) }
}

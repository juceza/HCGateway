package dev.shuchir.hcgateway.data.remote

import dev.shuchir.hcgateway.data.local.SettingsCache
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class AuthInterceptor
@Inject
constructor(
    private val settingsCache: SettingsCache,
    private val tokenRefresher: TokenRefresher,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        // Skip auth for login and refresh endpoints
        val path = request.url.encodedPath
        if (path.endsWith("/login") || path.endsWith("/refresh")) {
            return chain.proceed(request)
        }

        val token = settingsCache.token

        val authenticatedRequest =
            request
                .newBuilder()
                .header("Authorization", "Bearer $token")
                .build()

        val response = chain.proceed(authenticatedRequest)

        // Auto-refresh on 403 (this API returns 403 for an expired access token).
        // All refresh paths funnel through TokenRefresher so concurrent refreshes coalesce
        // instead of racing the server-side refresh-token rotation.
        if (response.code == 403 && request.header("X-Retry") == null) {
            response.close()

            val newToken = tokenRefresher.refreshBlocking(token)
            if (newToken != null) {
                val retryRequest =
                    request
                        .newBuilder()
                        .header("Authorization", "Bearer $newToken")
                        .header("X-Retry", "true")
                        .build()
                return chain.proceed(retryRequest)
            }
        }

        return response
    }
}

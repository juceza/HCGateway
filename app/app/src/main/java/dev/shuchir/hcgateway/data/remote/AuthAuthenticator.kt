package dev.shuchir.hcgateway.data.remote

import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject

class AuthAuthenticator
@Inject
constructor(
    private val tokenRefresher: TokenRefresher,
) : Authenticator {
    override fun authenticate(
        route: Route?,
        response: Response,
    ): Request? {
        // Only retry once
        if (response.request.header("X-Retry") != null) return null

        // Never try to refresh while authenticating the auth endpoints themselves.
        val path = response.request.url.encodedPath
        if (path.endsWith("/login") || path.endsWith("/refresh")) return null

        // Funnel through TokenRefresher so this 401 path can't race the 403 interceptor path
        // or the home reachability check over the rotating refresh token.
        val triggeringToken = response.request.header("Authorization")?.removePrefix("Bearer ")
        val newToken = tokenRefresher.refreshBlocking(triggeringToken) ?: return null

        return response.request
            .newBuilder()
            .header("Authorization", "Bearer $newToken")
            .header("X-Retry", "true")
            .build()
    }
}

package dev.shuchir.hcgateway.worker

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import dev.shuchir.hcgateway.data.local.UserSettings
import timber.log.Timber
import java.time.Duration
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncScheduler
@Inject
constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        const val WORK_NAME = "hcgateway_periodic_sync"
    }

    /** Schedule periodic sync from settings, picking interval or fixed daily-time mode. */
    fun scheduleFromSettings(settings: UserSettings) {
        if (settings.syncTimeOfDay in 0..1439) {
            scheduleDaily(settings.syncTimeOfDay)
        } else {
            schedule(settings.syncInterval)
        }
    }

    fun schedule(intervalMinutes: Int) {
        try {
            val request =
                PeriodicWorkRequestBuilder<SyncWorker>(
                    intervalMinutes.toLong(),
                    TimeUnit.MINUTES,
                ).setConstraints(networkConstraints())
                    .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
            Timber.i("Scheduled periodic sync: ${intervalMinutes}min")
        } catch (e: Exception) {
            Timber.e(e, "Failed to schedule")
        }
    }

    /**
     * Schedule a daily sync at a fixed time of day (minute-of-day, 0..1439).
     * Implemented as a 24h periodic job whose initial delay lands on the next occurrence of
     * that time. WorkManager timing is inexact, so the sync runs approximately at that time.
     */
    fun scheduleDaily(minuteOfDay: Int) {
        try {
            val now = LocalDateTime.now()
            val todayTarget = now.toLocalDate().atTime(minuteOfDay / 60, minuteOfDay % 60)
            val next = if (todayTarget.isAfter(now)) todayTarget else todayTarget.plusDays(1)
            val initialDelayMillis = Duration.between(now, next).toMillis()

            val request =
                PeriodicWorkRequestBuilder<SyncWorker>(24, TimeUnit.HOURS)
                    .setConstraints(networkConstraints())
                    .setInitialDelay(initialDelayMillis, TimeUnit.MILLISECONDS)
                    .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
            Timber.i("Scheduled daily sync at %02d:%02d (in %dmin)".format(minuteOfDay / 60, minuteOfDay % 60, initialDelayMillis / 60_000))
        } catch (e: Exception) {
            Timber.e(e, "Failed to schedule daily")
        }
    }

    private fun networkConstraints() =
        Constraints
            .Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

    fun cancel() {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        Timber.i("Cancelled periodic sync")
    }
}

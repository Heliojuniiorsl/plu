package com.example.semvencer

import android.webkit.JavascriptInterface

class SemVencerNotificationBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun isAvailable(): Boolean = true

    @JavascriptInterface
    fun configureNotifications(json: String) {
        activity.runOnUiThread {
            if (json.contains("\"enabled\":true")) {
                activity.requestNotificationPermissionIfNeeded()
            }
            SemVencerNotifications.configure(activity, json)
        }
    }

    @JavascriptInterface
    fun testNotification(json: String) {
        activity.runOnUiThread {
            activity.requestNotificationPermissionIfNeeded()
            SemVencerNotifications.showTest(activity, json)
        }
    }
}

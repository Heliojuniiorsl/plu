package com.example.semvencer

import android.annotation.SuppressLint
import android.Manifest
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import java.io.IOException

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_NO_CACHE
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            }

            clearCache(false)
            addJavascriptInterface(SemVencerNotificationBridge(this@MainActivity), "SemVencerAndroid")
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = localAssetResponse(request.url)

                @Deprecated("Required for older WebView callbacks")
                override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
                    localAssetResponse(Uri.parse(url))

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean = shouldBlockUnsupportedScheme(request.url)

                @Deprecated("Required for older WebView callbacks")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                    shouldBlockUnsupportedScheme(Uri.parse(url))

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    super.onReceivedError(view, request, error)

                    if (request.isForMainFrame && request.url.host != APP_HOST) {
                        view.loadUrl(LOCAL_FALLBACK_URL)
                    }
                }
            }

            loadUrl(WEB_APP_URL)
        }

        setContentView(webView)

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }
    }

    private fun localAssetResponse(uri: Uri): WebResourceResponse? {
        if (uri.scheme != "https" || uri.host != APP_HOST) {
            return null
        }

        val path = uri.path.orEmpty()
        val cleanPath = path.trimStart('/')
        val assetPath = when {
            cleanPath.isBlank() || cleanPath == "index.html" -> "$WEB_ASSET_DIR/index.html"
            cleanPath == "icone.png" -> "$WEB_ASSET_DIR/icone.png"
            cleanPath == "favicon.svg" -> "$WEB_ASSET_DIR/favicon.svg"
            cleanPath.startsWith("assets/") -> "$WEB_ASSET_DIR/$cleanPath"
            cleanPath.startsWith("$WEB_ASSET_DIR/") -> cleanPath
            else -> "$WEB_ASSET_DIR/index.html"
        }

        return try {
            val mimeType = mimeTypeFor(assetPath)
            WebResourceResponse(mimeType, encodingFor(mimeType), assets.open(assetPath))
        } catch (_: IOException) {
            null
        }
    }

    private fun mimeTypeFor(assetPath: String): String {
        return when (assetPath.substringAfterLast('.', "").lowercase()) {
            "css" -> "text/css"
            "html" -> "text/html"
            "js", "mjs" -> "application/javascript"
            "json" -> "application/json"
            "png" -> "image/png"
            "svg" -> "image/svg+xml"
            "webp" -> "image/webp"
            "jpg", "jpeg" -> "image/jpeg"
            "woff" -> "font/woff"
            "woff2" -> "font/woff2"
            else -> "application/octet-stream"
        }
    }

    private fun encodingFor(mimeType: String): String? {
        return when {
            mimeType.startsWith("text/") -> "UTF-8"
            mimeType == "application/javascript" -> "UTF-8"
            mimeType == "application/json" -> "UTF-8"
            mimeType == "image/svg+xml" -> "UTF-8"
            else -> null
        }
    }

    private fun shouldBlockUnsupportedScheme(uri: Uri): Boolean {
        return when (uri.scheme?.lowercase()) {
            "about", "blob", "data", "file", "http", "https" -> false
            else -> true
        }
    }

    fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return

        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val APP_HOST = "semvencer.local"
        private const val WEB_APP_URL = "https://heliojuniiorsl.github.io/semvencer/"
        private const val LOCAL_FALLBACK_URL = "https://$APP_HOST/#/"
        private const val WEB_ASSET_DIR = "semvencer"
        private const val NOTIFICATION_PERMISSION_REQUEST = 5041
    }
}

package com.example.semvencer

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

data class ProdutoNotificacao(
    val produto: String,
    val plu: String,
    val validade: String,
    val prazo: String,
    val dias: Int,
)

data class ConfigNotificacao(
    val enabled: Boolean,
    val days: Int,
    val frequency: String,
    val time: String,
    val products: List<ProdutoNotificacao>,
)

object SemVencerNotifications {
    private const val CHANNEL_ID = "validade_alertas"
    private const val CHANNEL_NAME = "Alertas de validade"
    private const val PREFS = "semvencer_notifications"
    private const val KEY_CONFIG = "config"
    private const val ACTION_NOTIFY = "com.example.semvencer.NOTIFY"
    private const val REQUEST_CODE_NOTIFY = 9104
    private const val NOTIFICATION_ID = 2701

    fun configure(context: Context, json: String) {
        val config = parseConfig(json)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_CONFIG, json)
            .apply()

        ensureChannel(context)
        if (config.enabled) {
            schedule(context, config)
        } else {
            cancel(context)
        }
    }

    fun showTest(context: Context, json: String) {
        val config = parseConfig(json)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_CONFIG, json)
            .apply()

        ensureChannel(context)
        if (config.enabled) {
            schedule(context, config)
        }
        show(context, config, force = true)
    }

    fun showScheduled(context: Context) {
        val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CONFIG, null) ?: return
        val config = parseConfig(json)
        if (!config.enabled) return

        show(context, config, force = false)
        schedule(context, config)
    }

    private fun schedule(context: Context, config: ConfigNotificacao) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, NotificationReceiver::class.java).setAction(ACTION_NOTIFY)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_NOTIFY,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        alarmManager.cancel(pendingIntent)
        val hourly = config.frequency == "hourly"
        alarmManager.setInexactRepeating(
            AlarmManager.RTC_WAKEUP,
            if (hourly) nextHourlyTriggerAt() else nextDailyTriggerAt(config.time),
            if (hourly) AlarmManager.INTERVAL_HOUR else AlarmManager.INTERVAL_DAY,
            pendingIntent,
        )
    }

    private fun cancel(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, NotificationReceiver::class.java).setAction(ACTION_NOTIFY)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_NOTIFY,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        alarmManager.cancel(pendingIntent)
    }

    private fun show(context: Context, config: ConfigNotificacao, force: Boolean) {
        if (!canNotify(context)) return
        if (!force && config.products.isEmpty()) return

        val total = config.products.size
        val title = if (total == 1) "1 produto precisa de atencao" else "$total produtos precisam de atencao"
        val summary = resumoAlertas(config.products).ifBlank {
            "Nenhum produto dentro do prazo configurado."
        }
        val inboxStyle = NotificationCompat.InboxStyle()
            .setBigContentTitle(title)
            .setSummaryText("Toque para abrir as validades")

        config.products.take(3).forEach { produto ->
            inboxStyle.addLine("${nomeResumido(produto.produto)} - ${produto.prazo}")
        }
        if (total > 3) {
            inboxStyle.addLine("E mais ${total - 3} produto(s)")
        }

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(summary)
            .setStyle(inboxStyle)
            .setColor(Color.rgb(26, 115, 232))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // Permission can be revoked while the app is open.
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Avisos de produtos proximos ao vencimento"
        }
        manager.createNotificationChannel(channel)
    }

    private fun canNotify(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    private fun nextDailyTriggerAt(time: String): Long {
        val parts = time.split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 8
        val minute = parts.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 0
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (calendar.timeInMillis <= System.currentTimeMillis()) {
            calendar.add(Calendar.DAY_OF_YEAR, 1)
        }

        return calendar.timeInMillis
    }

    private fun nextHourlyTriggerAt(): Long {
        val calendar = Calendar.getInstance().apply {
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            add(Calendar.HOUR_OF_DAY, 1)
        }
        return calendar.timeInMillis
    }

    private fun resumoAlertas(products: List<ProdutoNotificacao>): String {
        val vencidos = products.count { it.dias < 0 }
        val hoje = products.count { it.dias == 0 }
        val proximos = products.size - vencidos - hoje
        return listOfNotNull(
            if (vencidos > 0) "$vencidos ${if (vencidos == 1) "vencido" else "vencidos"}" else null,
            if (hoje > 0) "$hoje ${if (hoje == 1) "vence hoje" else "vencem hoje"}" else null,
            if (proximos > 0) "$proximos ${if (proximos == 1) "proximo" else "proximos"}" else null,
        ).joinToString(" - ")
    }

    private fun nomeResumido(nome: String): String {
        val limite = 34
        return if (nome.length > limite) "${nome.take(limite - 3)}..." else nome
    }

    private fun parseConfig(json: String): ConfigNotificacao {
        val obj = runCatching { JSONObject(json) }.getOrElse { JSONObject() }
        val productsArray = obj.optJSONArray("products") ?: JSONArray()
        val products = (0 until productsArray.length()).mapNotNull { index ->
            val item = productsArray.optJSONObject(index) ?: return@mapNotNull null
            ProdutoNotificacao(
                produto = item.optString("produto", "Produto"),
                plu = item.optString("plu", ""),
                validade = item.optString("validade", ""),
                prazo = item.optString("prazo", ""),
                dias = item.optInt("dias", 0),
            )
        }

        return ConfigNotificacao(
            enabled = obj.optBoolean("enabled", false),
            days = obj.optInt("days", 3),
            frequency = if (obj.optString("frequency") == "hourly") "hourly" else "daily",
            time = obj.optString("time", "08:00"),
            products = products,
        )
    }
}

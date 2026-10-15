package app.schoolos.driver

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The trip's location, with the screen off (12 §9 Done when 4). Runs as a
 * foreground service from Start trip to End trip only: no location is taken
 * at any other time. Every point is queued on the phone first and sent in
 * batches at the school's interval, so a place with no signal loses nothing;
 * the queue goes out when the phone is back online.
 */
class TripLocationService : Service(), LocationListener {
    companion object {
        const val EXTRA_TRIP = "trip"
        private const val CHANNEL = "trip"
        private const val NOTE_ID = 7

        fun start(context: Context, tripId: String) {
            val i = Intent(context, TripLocationService::class.java).putExtra(EXTRA_TRIP, tripId)
            ContextCompat.startForegroundService(context, i)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TripLocationService::class.java))
        }
    }

    private lateinit var store: Store
    private lateinit var api: Api
    private lateinit var worker: Handler
    private var tripId = ""
    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        store = Store(this)
        api = Api(store)
        worker = Handler(HandlerThread("trip-sender").apply { start() }.looper)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        tripId = intent?.getStringExtra(EXTRA_TRIP) ?: store.runningTrip
        if (tripId.isEmpty() || !store.ready) {
            stopSelf()
            return START_NOT_STICKY
        }
        store.runningTrip = tripId
        val note = notification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION) else startForeground(NOTE_ID, note)
        listen()
        worker.removeCallbacksAndMessages(null)
        worker.post(sender)
        // Restarted by Android after being stopped for memory: carry on with the same trip.
        return START_REDELIVER_INTENT
    }

    private fun listen() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        lm.removeUpdates(this)
        val everyMs = (store.intervalSec * 1000L).coerceAtLeast(10_000L)
        lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, everyMs, 10f, this, Looper.getMainLooper())
        if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, everyMs, 25f, this, Looper.getMainLooper())
    }

    override fun onLocationChanged(l: Location) {
        if (store.runningTrip.isEmpty()) return
        val p = JSONObject()
            .put("at", iso.format(Date(l.time)))
            .put("lat", l.latitude)
            .put("lng", l.longitude)
        if (l.hasSpeed()) p.put("speed", l.speed * 3.6)
        if (l.hasBearing()) p.put("heading", l.bearing.toDouble())
        if (l.hasAccuracy()) p.put("accuracy", l.accuracy.toDouble())
        store.queue(p)
    }

    /** Sends the queue every interval; on no signal, tries again next time. */
    private val sender = object : Runnable {
        override fun run() {
            flush()
            worker.postDelayed(this, store.intervalSec * 1000L)
        }
    }

    private fun flush() {
        while (store.queued() > 0) {
            val batch = store.take(200)
            val body = JSONObject().put("tripId", tripId).put("points", batch)
            val answer = runCatching { api.post("points", body) }.getOrNull() ?: return // offline: keep the queue
            if (answer.status == 429 || answer.status >= 500) return
            store.drop(batch.length())
            // The trip was ended (on the phone or by the school): stop collecting.
            if (answer.body.optBoolean("ended") || answer.status == 409 && answer.problem.contains("not running")) {
                store.runningTrip = ""
                stopSelf()
                return
            }
            if (!answer.ok) return
        }
    }

    override fun onDestroy() {
        (getSystemService(LOCATION_SERVICE) as LocationManager).removeUpdates(this)
        worker.removeCallbacksAndMessages(null)
        // Send what is left before going.
        worker.post { flush(); worker.looper.quitSafely() }
        super.onDestroy()
    }

    private fun notification(): Notification {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }
}

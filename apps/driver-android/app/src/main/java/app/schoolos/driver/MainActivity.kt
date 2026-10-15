package app.schoolos.driver

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Two screens, built in code to keep the app small:
 *  1. Set up: the school's address, the school id and the phone key, all
 *     shown once on Vehicles & Drivers > Set up a phone.
 *  2. Today's trips: Start trip (starts the location service), End trip,
 *     and the red Emergency button.
 * Stops and boarding are marked on the /driver page or by the attendant;
 * this app's job is the bus's location with the screen off.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var store: Store
    private lateinit var api: Api
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var root: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        api = Api(store)
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(32)) }
        setContentView(ScrollView(this).apply { addView(root) })
        if (store.ready) showTrips() else showSetup()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(s: String, size: Float = 15f, bold: Boolean = false, color: Int? = null) = TextView(this).apply {
        text = s
        textSize = size
        if (bold) typeface = Typeface.DEFAULT_BOLD
        color?.let { setTextColor(it) }
        setPadding(0, dp(6), 0, dp(6))
    }

    private fun button(label: String, color: Int? = null, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 17f
        minHeight = dp(56)
        color?.let { setBackgroundColor(it); setTextColor(Color.WHITE) }
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) }
    }

    /* ---------- 1. Set up ---------- */

    private fun showSetup() {
        root.removeAllViews()
        title = getString(R.string.app_name)
        root.addView(text("Set up this phone", 22f, bold = true))
        root.addView(text("Ask the Transport In-charge to open Vehicles & Drivers, choose you, and tap \"Set up a phone\". Type what it shows below. The key is shown only once."))
        val server = EditText(this).apply { hint = "School address, like https://school.example.in"; inputType = InputType.TYPE_TEXT_VARIATION_URI; setText(store.server) }
        val school = EditText(this).apply { hint = "School id"; setText(store.schoolId) }
        val key = EditText(this).apply { hint = "Phone key (starts with sosdrv_)"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        listOf(server, school, key).forEach(root::addView)
        val problem = text("", color = Color.rgb(185, 28, 28))
        root.addView(problem)
        root.addView(button("Save and check") {
            store.server = server.text.toString()
            store.schoolId = school.text.toString()
            store.key = key.text.toString()
            if (!store.ready) { problem.text = "Check the address (https://...), the school id and the key."; return@button }
            problem.text = "Checking…"
            io.execute {
                val a = runCatching { api.get("trips") }.getOrNull()
                runOnUiThread {
                    when {
                        a == null -> problem.text = "No internet. Try again when the phone has signal."
                        !a.ok -> problem.text = a.problem
                        else -> showTrips()
                    }
                }
            }
        })
    }

    /* ---------- 2. Today's trips ---------- */

    private fun askPermissions() {
        val need = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) need += Manifest.permission.POST_NOTIFICATIONS
        val missing = need.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1)
    }

    private fun showTrips() {
        askPermissions()
        root.removeAllViews()
        root.addView(text("Loading today's trips…"))
        io.execute {
            val a = runCatching { api.get("trips") }.getOrNull()
            runOnUiThread { drawTrips(a) }
        }
    }

    private fun drawTrips(a: Answer?) {
        root.removeAllViews()
        if (a == null) {
            root.addView(text("No internet. Trips you started keep sending when the phone is back online.", color = Color.rgb(180, 83, 9)))
            if (store.runningTrip.isNotEmpty()) root.addView(text("A trip is running. ${store.queued()} locations are waiting to send."))
            root.addView(button("Try again") { showTrips() })
            return
        }
        if (!a.ok) {
            root.addView(text(a.problem, color = Color.rgb(185, 28, 28)))
            if (a.status == 401) root.addView(button("Set up again") { store.forget(); showSetup() })
            else root.addView(button("Try again") { showTrips() })
            return
        }
        val driver = a.body.optJSONObject("driver")
        val settings = a.body.optJSONObject("settings")
        store.intervalSec = settings?.optInt("intervalSec", 30) ?: 30
        root.addView(text(driver?.optString("name") ?: "", 22f, bold = true))
        root.addView(text("Today's trips · location every ${store.intervalSec} seconds while a trip runs"))
        if (store.queued() > 0) root.addView(text("${store.queued()} locations are waiting to send.", color = Color.rgb(180, 83, 9)))
        val trips = a.body.optJSONArray("trips")
        if (trips == null || trips.length() == 0) root.addView(text("No trips for you today."))
        val isDriver = driver?.optString("role") == "DRIVER"
        for (i in 0 until (trips?.length() ?: 0)) {
            val t = trips!!.getJSONObject(i)
            val id = t.getString("id")
            val status = t.optString("status")
            root.addView(View(this).apply { setBackgroundColor(Color.LTGRAY); layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).apply { topMargin = dp(16) } })
            root.addView(text(t.optString("title"), 18f, bold = true))
            val vehicle = t.optJSONObject("vehicle")?.optString("number")
            root.addView(text("Starts ${t.optString("plannedStart")}${if (vehicle != null) " · $vehicle" else ""} · ${label(status)}"))
            when {
                status == "SCHEDULED" && isDriver -> root.addView(button("Start trip", Color.rgb(29, 78, 216)) { act("start", id, "Trip started.") { TripLocationService.start(this, id) } })
                status == "STARTED" -> {
                    if (isDriver && store.runningTrip != id) TripLocationService.start(this, id) // carry on after the phone restarts
                    if (isDriver) root.addView(button("End trip") { confirm("End this trip? The bus stops sending its location.") { act("end", id, "Trip ended.") { TripLocationService.stop(this); store.runningTrip = "" } } })
                    root.addView(button("Emergency", Color.rgb(185, 28, 28)) {
                        confirm("Send an emergency alert to the Transport In-charge and the Principal now?") {
                            // The school uses the bus's last location sent by the trip service.
                            act("emergency", id, "Emergency alert sent. The school will call you.") {}
                        }
                    })
                }
            }
        }
        root.addView(button("Refresh") { showTrips() })
        root.addView(text("Signed in with a phone key. To use another phone, ask the Transport In-charge to turn this key off.", 12f).apply { gravity = Gravity.CENTER })
    }

    private fun label(s: String) = when (s) { "STARTED" -> "Running"; "COMPLETED" -> "Completed"; "CANCELLED" -> "Cancelled"; else -> "Not started" }

    private fun confirm(message: String, yes: () -> Unit) {
        AlertDialog.Builder(this).setMessage(message).setPositiveButton("Yes") { _, _ -> yes() }.setNegativeButton("No", null).show()
    }

    private fun act(action: String, tripId: String, done: String, extra: JSONObject = JSONObject(), then: () -> Unit) {
        val body = JSONObject(extra.toString()).put("tripId", tripId)
        io.execute {
            val a = runCatching { api.post(action, body) }.getOrNull()
            runOnUiThread {
                val msg = when {
                    a == null -> "No internet. Try again, or call the school."
                    !a.ok -> a.problem
                    else -> { then(); done }
                }
                AlertDialog.Builder(this).setMessage(msg).setPositiveButton("OK") { _, _ -> showTrips() }.show()
            }
        }
    }
}

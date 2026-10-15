package app.schoolos.driver

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

/**
 * What the app keeps on the phone, encrypted: the school's address, the
 * school id, the phone key from Vehicles & Drivers ("Set up a phone"), the
 * running trip, and locations not yet sent (the offline queue).
 */
class Store(context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "school_os_driver",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var server: String
        get() = prefs.getString("server", "") ?: ""
        set(v) = prefs.edit().putString("server", v.trimEnd('/')).apply()

    var schoolId: String
        get() = prefs.getString("school", "") ?: ""
        set(v) = prefs.edit().putString("school", v.trim()).apply()

    var key: String
        get() = prefs.getString("key", "") ?: ""
        set(v) = prefs.edit().putString("key", v.trim()).apply()

    var runningTrip: String
        get() = prefs.getString("trip", "") ?: ""
        set(v) = prefs.edit().putString("trip", v).apply()

    var intervalSec: Int
        get() = prefs.getInt("interval", 30)
        set(v) = prefs.edit().putInt("interval", v.coerceIn(10, 300)).apply()

    val ready: Boolean get() = server.startsWith("https://") && schoolId.length == 36 && key.startsWith("sosdrv_")

    @Synchronized
    fun queue(point: JSONObject) {
        val list = JSONArray(prefs.getString("queue", "[]"))
        list.put(point)
        // Keep at most 12 hours at the 30-second interval; the oldest go first.
        while (list.length() > 1500) list.remove(0)
        prefs.edit().putString("queue", list.toString()).apply()
    }

    @Synchronized
    fun take(max: Int): JSONArray {
        val list = JSONArray(prefs.getString("queue", "[]"))
        val out = JSONArray()
        for (i in 0 until minOf(max, list.length())) out.put(list.get(i))
        return out
    }

    @Synchronized
    fun drop(count: Int) {
        val list = JSONArray(prefs.getString("queue", "[]"))
        val rest = JSONArray()
        for (i in count until list.length()) rest.put(list.get(i))
        prefs.edit().putString("queue", rest.toString()).apply()
    }

    @Synchronized
    fun queued(): Int = JSONArray(prefs.getString("queue", "[]")).length()

    fun forget() = prefs.edit().clear().apply()
}

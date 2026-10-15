package app.schoolos.driver

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** One answer from School OS: the HTTP status and the JSON body ("problem" says what went wrong in plain words). */
data class Answer(val status: Int, val body: JSONObject) {
    val ok: Boolean get() = status in 200..299
    val problem: String get() = body.optString("problem", "Something went wrong (status $status).")
}

/**
 * The driver API: /api/v1/transport/driver/<action>?s=<school>, with the
 * phone key as "Authorization: Bearer <key>". Only HTTPS. Never call from
 * the main thread.
 */
class Api(private val store: Store) {
    @Throws(IOException::class)
    fun get(action: String): Answer = send("GET", action, null)

    @Throws(IOException::class)
    fun post(action: String, body: JSONObject): Answer = send("POST", action, body)

    private fun send(method: String, action: String, body: JSONObject?): Answer {
        val url = URL("${store.server}/api/v1/transport/driver/$action?s=${store.schoolId}")
        require(url.protocol == "https") { "The school address must start with https://" }
        val c = url.openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 15_000
            c.readTimeout = 30_000
            c.setRequestProperty("Authorization", "Bearer ${store.key}")
            c.setRequestProperty("Accept", "application/json")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = c.responseCode
            val text = (if (status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
            return Answer(status, runCatching { JSONObject(text) }.getOrDefault(JSONObject()))
        } finally {
            c.disconnect()
        }
    }
}

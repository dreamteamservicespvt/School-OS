# School OS Driver (Android)

A small Android app that sends the school bus's location to School OS while a trip
runs, including with the phone's screen off (Transport Management, 12 §2 Driver app;
decision D11 of 9 October 2026). The `/driver` web page is a companion for use with
the screen on; background location needs this app.

The APK is not built in this repository. Build it with Android Studio (Koala or
newer) or `./gradlew assembleRelease` after adding the Gradle wrapper
(`gradle wrapper --gradle-version 8.7`) and a signing key of the school's own.
No key, password or address is kept in the code.

## What it does

1. **Set up.** The Transport In-charge opens **Transport Management > Vehicles &
   Drivers**, picks the driver and taps **Set up a phone**. School OS shows the
   school's address, the school id and a phone key once (only a hash of the key is
   stored). The driver types them into the app. The key is kept in encrypted storage
   on the phone. Turning the key off on the same page stops the phone at once.
2. **Today's trips.** The app lists the driver's own trips for today. **Start trip**
   starts a foreground service (with a "Trip running" notification); **End trip**
   stops it. Location is taken only between the two.
3. **Locations.** Points are queued on the phone first, then sent in batches every
   interval set in Transport Settings (default 30 seconds). With no signal, the
   queue waits (up to about 12 hours of points) and is sent when the phone is back
   online. School OS checks every point and ignores bad, old or impossible ones.
4. **Emergency.** The red button alerts the Transport In-charge and the Principal
   with the last location. No parent message goes until a person confirms it.

Stops reached and students boarded are marked on the `/driver` page, or found
automatically when the bus enters a stop's circle.

## The API it calls

All calls go to `https://<school address>/api/v1/transport/driver/<action>?s=<school id>`
with the header `Authorization: Bearer <phone key>`. Requests are rate-limited per key.

| Call | Body |
|---|---|
| `GET trips` | – (today's own trips, stops, students and the interval) |
| `POST start` | `{ "tripId": "…" }` |
| `POST points` | `{ "tripId": "…", "points": [{ "at": "2026-10-15T07:31:05Z", "lat": 12.97, "lng": 77.59, "speed": 24.5, "heading": 90, "accuracy": 8 }] }` (at most 500) |
| `POST reached` | `{ "tripId": "…", "stopId": "…", "at": "…" }` |
| `POST boarding` | `{ "tripId": "…", "studentId": "…", "status": "BOARDED" \| "NOT_BOARDED" \| "DROPPED" }` |
| `POST end` | `{ "tripId": "…" }` |
| `POST emergency` | `{ "tripId": "…", "lat": 12.97, "lng": 77.59, "note": "…" }` |
| `POST breakdown` | `{ "tripId": "…", "reason": "…", "lat": 12.97, "lng": 77.59 }` |

Answers are JSON. A refusal has `{ "problem": "plain words" }` with status 400, 401
(key not valid or turned off), 403 (driver inactive or Transport off), 409 (the rule
that stopped it, such as "This trip is not running") or 429 (too many requests).

## Files

- `app/src/main/java/app/schoolos/driver/MainActivity.kt` – set-up screen and today's trips.
- `app/src/main/java/app/schoolos/driver/TripLocationService.kt` – the foreground location service and the offline queue.
- `app/src/main/java/app/schoolos/driver/Api.kt` – HTTPS calls with the phone key.
- `app/src/main/java/app/schoolos/driver/Store.kt` – encrypted settings and the queue.

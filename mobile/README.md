# Sehatra — Android app

A Capacitor shell that opens the live web app
(`server.url` in [capacitor.config.json](capacitor.config.json)). Every web deploy updates the app
instantly. Rebuild the APK only when the shell changes: name, icon, permissions, or the site address.

## Needs
- Android Studio (it brings the Android SDK and a JDK)
- Node.js

## Build a test APK
```bash
cd mobile
npm install
npx cap sync android
cd android
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat assembleDebug
```
The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a phone and open it
to install (allow "Install unknown apps" when asked).

`android/local.properties` (ignored by git) must point at the SDK:
`sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`

## Notes
- **Site address moved** (custom domain): change `server.url` in `capacitor.config.json` and in
  `www/offline.html`, then sync and rebuild.
- **New icon**: replace `assets/logo.png` (from `client/public/icons/maskable-512.png`), then
  `npm run assets`.
- **Status bar**: Android 15+ draws edge-to-edge and the site doesn't pad for system bars, so
  `MainActivity.java` pads the WebView itself (`SystemBars.insetsHandling` is `disable`).
- **Gradle** is on 9.1 because Android Studio's bundled JDK is 25 and Gradle 8.x can't run on it.
- **Play Store**: needs a signed release build (`bundleRelease`) with an upload keystore. Keep the
  keystore out of git, because losing it means you can't ship updates.

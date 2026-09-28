# Android release

## Build

```sh
export JAVA_HOME=~/Android/jdk ANDROID_HOME=~/Android/Sdk
npm run release:android     # → release/huallet-android-<version>.apk + .sha256
```

Bump the version in `package.json` **and** `android/app/build.gradle`
(`versionName`, `versionCode = major*10000 + minor*100 + patch`); the script
refuses to build if they disagree. Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`.

Rebuilding the same commit on this machine gives the same sha256. Whether F-Droid's
build server gets the same bytes (different JDK/SDK/Node) is only known after
its first build; if it does not, F-Droid signs with its own key instead.

## Signing key

- Keystore: `~/.huallet-release/huallet-release.jks`, passwords in
  `~/.huallet-release/keystore.properties` (both mode 600, outside the repo;
  another location via `HUALLET_KEYSTORE_PROPERTIES`).
- Certificate SHA-256: `a16c15eaf77573342454c9a75b02a21a16bca917e4db44db2d57eaf2fc881a70`
- **Back both files up offline.** Losing them means no update can ever be
  installed over existing installs; leaking them lets anyone ship a fake update.

Check an APK: `apksigner verify --print-certs huallet-android-<version>.apk`.

## GitHub

Tag `v<version>-android`, create a release, attach the APK and its `.sha256`,
and paste the changelog.

## F-Droid

`store/fdroid/wtf.chihuahua.huallet.yml` is the draft metadata for
fdroiddata. F-Droid builds from the tag; if its build matches ours byte for byte it
publishes our signed APK (`Binaries` + `AllowedAPKSigningKeys`), so GitHub and
F-Droid installs can update each other. Otherwise drop those two keys and
F-Droid signs with its own key (installs from the two sources then cannot
update each other). The app has no
proprietary dependencies (the QR scanner is jsQR in the WebView; no Google
Play Services). Listing texts and screenshots are in `fastlane/metadata/`.

## Assets

`node scripts/android-assets.mjs` regenerates launcher icons, splash screens
and the listing icon from `public/favicon.svg`.

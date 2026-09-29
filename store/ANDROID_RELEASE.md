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

## Our F-Droid repository

https://chihuahua.wtf/fdroid/repo, served from the `fdroid/repo` folder of
website_v3. After each Android release:

```sh
export JAVA_HOME=~/Android/jdk ANDROID_HOME=~/Android/Sdk PATH=~/.local/fdroidserver-venv/bin:$PATH
npm run fdroid:repo -- ~/Projects/website_v3   # adds release/huallet-android-<version>.apk, re-signs the index
cd ~/Projects/website_v3 && git add fdroid && git commit -m "F-Droid repo: Huallet <version>" && git push
```

- fdroidserver: `python3 -m venv ~/.local/fdroidserver-venv && ~/.local/fdroidserver-venv/bin/pip install fdroidserver`.
- Repository signing key and `config.yml`: `~/.huallet-fdroid` (mode 700, outside the repo).
  Key fingerprint (SHA-256): `284E1A73DDA517FC7406F780B612CB5D22F2768A60FEDEB054FDD4BF243D7695`.
  **Back it up offline**: losing it means every user has to remove and re-add the repository.
- Listing texts and screenshots come from `fastlane/metadata/`, the app fields from `store/fdroid/repo-metadata.yml`.
- Obtainium reads the latest GitHub release: every release marked *latest* must include the APK.

## F-Droid (main catalogue)

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

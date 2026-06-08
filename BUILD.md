# Build Guide

## Signaling server Docker image

```bash
cd signaling-server
docker build -t filebeam-signaling .
```

## Local server executable

### Windows
```bat
cd local-server
build_server.bat
```

### Cross-platform helper
```bash
cd local-server
python build_server.py
```

## Desktop installer

```bash
cd desktop-app
npm install
npm run build:all
```

Artifacts should appear in:

- `local-server/dist/`
- `desktop-app/dist/release/`

## Android APK

```bash
cd mobile-app
npm install
gradle -p android assembleDebug
```

APK output should appear in:

- `mobile-app/android/app/build/outputs/apk/debug/app-debug.apk`

## GitHub Actions artifacts

Two CI workflows are included:

- `.github/workflows/build-windows-desktop.yml`
- `.github/workflows/build-android-apk.yml`

Run them from the **Actions** tab on GitHub.

Artifacts produced:

- `filebeam-windows-build`
- `filebeam-android-apk`

## Notes

- Electron Builder is configured with `publish: null` so CI packaging does not require release publishing.
- Android workflow installs Android SDK platform 34 and build-tools 34.0.0 automatically.
- Desktop workflow builds `filebeam-server.exe` first, then packages the Electron app.
- Test both NSIS installer and portable build on a clean Windows machine.

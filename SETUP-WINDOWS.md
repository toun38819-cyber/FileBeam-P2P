# Windows Setup

## Prerequisites

- Windows 10/11 x64
- Python 3.11+
- Node.js 20+
- npm
- Visual Studio Build Tools (for some native packages)

## Local server build

```bat
cd local-server
python -m venv .venv
.venv\Scriptsctivate
pip install -r requirements.txt
build_server.bat
```

## Desktop development

```bat
cd desktop-app
npm install
npm run dev
```

## Windows-specific checks

- Allow the FileBeam server through Defender Firewall.
- Confirm `filebeam-server.exe` is not quarantined by antivirus.
- Verify port range `8765-8775` is open on private networks.
- Test with Windows Mobile Hotspot if normal Wi‑Fi discovery fails.

## Packaging

```bat
cd desktop-app
npm run build:react
npm run build:electron
```

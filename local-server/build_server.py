from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(args: list[str]) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


if __name__ == '__main__':
    run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
    run([sys.executable, '-m', 'pip', 'install', 'pyinstaller'])
    run([sys.executable, '-m', 'PyInstaller', 'server.spec'])

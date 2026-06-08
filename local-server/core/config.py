from __future__ import annotations

import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='FILEBEAM_', extra='ignore')

    app_name: str = 'FileBeam Local Server'
    version: str = '1.0.0'
    host: str = '0.0.0.0'
    default_port: int = 8765
    max_port: int = 8775
    discovery_port: int = 8766
    room_ttl_minutes: int = 30
    cleanup_interval_seconds: int = 300
    transfer_retention_seconds: int = 3600
    transfer_stall_timeout_seconds: int = 900
    finalize_poll_interval_seconds: float = 0.25
    small_transfer_ram_limit_mb: int = 200
    max_chunk_size_mb: int = 50
    minimum_free_disk_mb: int = 512
    downloads_dir: Path = Field(default_factory=lambda: Path.home() / 'Downloads' / 'FileBeam')
    temp_dir: Path = Field(default_factory=lambda: Path(os.environ.get('TEMP', str(Path.home() / 'AppData' / 'Local' / 'Temp'))) / 'FileBeam')
    state_dir: Path = Field(default_factory=lambda: Path(os.environ.get('TEMP', str(Path.home() / 'AppData' / 'Local' / 'Temp'))) / 'FileBeam' / '_state')
    signaling_url: str = 'wss://signal.filebeam.app'
    device_name: str = os.environ.get('COMPUTERNAME') or os.environ.get('HOSTNAME') or 'FileBeam Device'
    device_type: str = 'windows'


settings = Settings()
settings.downloads_dir.mkdir(parents=True, exist_ok=True)
settings.temp_dir.mkdir(parents=True, exist_ok=True)
settings.state_dir.mkdir(parents=True, exist_ok=True)

from __future__ import annotations

try:
    import zstandard as zstd  # type: ignore
except Exception:  # pragma: no cover
    zstd = None


class CompressionService:
    def compress(self, data: bytes, mode: str = 'auto') -> tuple[bytes, str]:
        if mode == 'none' or zstd is None:
            return data, 'none'
        if mode == 'auto' and len(data) < 64 * 1024:
            return data, 'none'
        compressor = zstd.ZstdCompressor(level=3)
        return compressor.compress(data), 'zstd'

    def decompress(self, data: bytes, mode: str) -> bytes:
        if mode != 'zstd' or zstd is None:
            return data
        decompressor = zstd.ZstdDecompressor()
        return decompressor.decompress(data)


compression_service = CompressionService()

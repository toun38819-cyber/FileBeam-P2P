from __future__ import annotations

from core.network import check_internet, is_same_subnet


class P2PManager:
    def select_mode(self, local_ip: str, peer_ip: str | None) -> str:
        if peer_ip and is_same_subnet(local_ip, peer_ip):
            return 'local'
        return 'webrtc' if check_internet() else 'local'


p2p_manager = P2PManager()

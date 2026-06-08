from __future__ import annotations

import ipaddress
import socket
from contextlib import closing
from typing import Iterable

try:
    import netifaces  # type: ignore
except Exception:  # pragma: no cover
    netifaces = None


PRIVATE_PREFIXES = ('10.', '192.168.', '172.')
SKIP_WORDS = ('vmware', 'virtualbox', 'loopback', 'docker', 'wsl', 'hyper-v')
PREFER_WORDS = ('wi-fi', 'wifi', 'wireless', 'wlan', 'ethernet')


def _valid_ipv4(ip: str) -> bool:
    if ip.startswith('127.') or ip.startswith('169.254.'):
        return False
    try:
        parsed = ipaddress.ip_address(ip)
        return bool(parsed.version == 4)
    except ValueError:
        return False


def _score_name(name: str) -> int:
    low = name.lower()
    if any(word in low for word in SKIP_WORDS):
        return -100
    score = 0
    for idx, word in enumerate(PREFER_WORDS[::-1]):
        if word in low:
            score += (idx + 1) * 10
    return score


def get_all_local_ips() -> list[str]:
    ips: list[str] = []
    if netifaces:
        for iface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(iface).get(netifaces.AF_INET, [])
            for addr in addrs:
                ip = addr.get('addr', '')
                if _valid_ipv4(ip):
                    ips.append((iface, ip))
        scored = sorted(ips, key=lambda item: _score_name(item[0]), reverse=True)
        return [ip for _, ip in scored]

    hostname = socket.gethostname()
    try:
        for result in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = result[4][0]
            if _valid_ipv4(ip):
                ips.append(ip)
    except socket.gaierror:
        pass
    return list(dict.fromkeys(ips))


def get_local_ip() -> str:
    ips = get_all_local_ips()
    for ip in ips:
        if ip.startswith(PRIVATE_PREFIXES):
            return ip
    if ips:
        return ips[0]
    try:
        with closing(socket.socket(socket.AF_INET, socket.SOCK_DGRAM)) as sock:
            sock.connect(('8.8.8.8', 53))
            return sock.getsockname()[0]
    except OSError:
        return '127.0.0.1'


def find_available_port(start: int = 8765, end: int = 8775) -> int:
    for port in range(start, end + 1):
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    raise RuntimeError(f'No available port in range {start}-{end}')


def is_same_subnet(ip1: str, ip2: str) -> bool:
    a = ip1.split('.')
    b = ip2.split('.')
    return len(a) == 4 and len(b) == 4 and a[:3] == b[:3]


def check_internet() -> bool:
    try:
        with closing(socket.create_connection(('8.8.8.8', 53), timeout=2)):
            return True
    except OSError:
        return False


def is_port_open(ip: str, port: int, timeout: float = 0.5) -> bool:
    try:
        with closing(socket.create_connection((ip, port), timeout=timeout)):
            return True
    except OSError:
        return False

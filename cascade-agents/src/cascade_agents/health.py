"""Minimal asyncio HTTP health endpoint.

Responds to any request on $PORT with HTTP 200 + {"status":"ok"}.
Required by Render free web service (health check) and the keep-alive cron pinger.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

_RESPONSE = (
    b"HTTP/1.1 200 OK\r\n"
    b"Content-Type: application/json\r\n"
    b"Content-Length: 15\r\n"
    b"Connection: close\r\n"
    b"\r\n"
    b'{"status":"ok"}'
)


async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        await asyncio.wait_for(reader.read(2048), timeout=5.0)
    except Exception:
        pass
    try:
        writer.write(_RESPONSE)
        await writer.drain()
    finally:
        writer.close()


async def start_health_server(port: int) -> asyncio.Server:
    """Start the health server; returns the Server object (keep it alive)."""
    server = await asyncio.start_server(_handle, "0.0.0.0", port)
    addr = server.sockets[0].getsockname() if server.sockets else ("0.0.0.0", port)
    logger.info("Health server listening on %s:%s  (GET /healthz -> 200)", addr[0], addr[1])
    return server

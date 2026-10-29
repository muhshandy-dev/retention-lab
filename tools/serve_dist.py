"""Serve web/dist locally with the global headers from _headers (CSP included).

Used for screenshots and browser checks; Cloudflare Pages applies the same file in production.
"""

from __future__ import annotations

import functools
import http.server
import sys
from pathlib import Path


def global_headers(dist: Path) -> list[tuple[str, str]]:
    lines = (dist / "_headers").read_text().splitlines()
    out, active = [], False
    for line in lines:
        if not line.strip():
            continue
        if not line.startswith(" "):
            active = line.strip() == "/*"
            continue
        if active:
            name, value = line.strip().split(":", 1)
            out.append((name.strip(), value.strip()))
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    extra: list[tuple[str, str]] = []

    def end_headers(self):
        for name, value in self.extra:
            self.send_header(name, value)
        super().end_headers()

    def log_message(self, *args):
        pass


def main() -> None:
    dist = Path(sys.argv[1] if len(sys.argv) > 1 else "web/dist").resolve()
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 4173
    Handler.extra = global_headers(dist)
    handler = functools.partial(Handler, directory=str(dist))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


if __name__ == "__main__":
    main()

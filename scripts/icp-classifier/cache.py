"""File-backed JSON cache for website classification results.

Keyed on normalized URL. Values are arbitrary dicts (typically classifier output
plus scrape metadata).
"""

from __future__ import annotations

import json
import threading
from pathlib import Path


class ClassificationCache:
    def __init__(self, path: Path, fresh: bool = False):
        self.path = Path(path)
        self._lock = threading.Lock()
        if fresh:
            self._data: dict[str, dict] = {}
            return
        try:
            raw = self.path.read_text()
            self._data = json.loads(raw)
        except FileNotFoundError:
            self._data = {}
        except (json.JSONDecodeError, ValueError):
            # Corrupt cache — start fresh. Never lose the classification run over a bad file.
            self._data = {}

    def get(self, key: str) -> dict | None:
        with self._lock:
            return self._data.get(key)

    def set(self, key: str, value: dict) -> None:
        with self._lock:
            self._data[key] = value

    def save(self) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self._data, indent=2, sort_keys=True))

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._data)

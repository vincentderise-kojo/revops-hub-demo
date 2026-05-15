import json
from pathlib import Path

import pytest

from cache import ClassificationCache


@pytest.fixture
def tmp_cache_path(tmp_path):
    return tmp_path / "cache.json"


class TestClassificationCache:
    def test_empty_cache_on_new_path(self, tmp_cache_path):
        cache = ClassificationCache(tmp_cache_path)
        assert cache.get("https://example.com") is None

    def test_set_and_get(self, tmp_cache_path):
        cache = ClassificationCache(tmp_cache_path)
        cache.set("https://example.com", {"category": "ICP Fit", "evidence": "Test"})
        assert cache.get("https://example.com") == {"category": "ICP Fit", "evidence": "Test"}

    def test_persists_across_instances(self, tmp_cache_path):
        cache1 = ClassificationCache(tmp_cache_path)
        cache1.set("https://example.com", {"category": "Unlikely ICP"})
        cache1.save()

        cache2 = ClassificationCache(tmp_cache_path)
        assert cache2.get("https://example.com") == {"category": "Unlikely ICP"}

    def test_loads_existing_file(self, tmp_cache_path):
        tmp_cache_path.write_text(json.dumps({
            "https://example.com": {"category": "ICP Fit"}
        }))
        cache = ClassificationCache(tmp_cache_path)
        assert cache.get("https://example.com") == {"category": "ICP Fit"}

    def test_handles_corrupt_file(self, tmp_cache_path):
        tmp_cache_path.write_text("not valid json {{{")
        cache = ClassificationCache(tmp_cache_path)
        # Should not crash; should start empty
        assert cache.get("https://example.com") is None

    def test_size_reflects_entries(self, tmp_cache_path):
        cache = ClassificationCache(tmp_cache_path)
        assert cache.size == 0
        cache.set("a", {})
        cache.set("b", {})
        assert cache.size == 2

    def test_clear_fresh_mode(self, tmp_cache_path):
        cache = ClassificationCache(tmp_cache_path)
        cache.set("a", {"x": 1})
        cache.save()
        fresh = ClassificationCache(tmp_cache_path, fresh=True)
        assert fresh.get("a") is None
        assert fresh.size == 0

import json
from unittest.mock import MagicMock

import pytest

from classifier import (
    build_user_message,
    parse_response,
    ClassifierOutput,
    CATEGORIES,
)


class TestBuildUserMessage:
    def test_includes_account_fields(self):
        msg = build_user_message(
            account_name="Test Mech",
            naics="238220",
            annual_revenue=50_000_000,
            city="Phoenix",
            state="AZ",
            website_url="https://testmech.com",
            scraped_text="Commercial mechanical contractor since 1990.",
        )
        assert "Test Mech" in msg
        assert "238220" in msg
        assert "Phoenix" in msg
        assert "Commercial mechanical contractor" in msg

    def test_handles_missing_fields(self):
        msg = build_user_message(
            account_name="Test",
            naics="",
            annual_revenue=None,
            city="",
            state="",
            website_url="",
            scraped_text="",
        )
        assert "Test" in msg


class TestParseResponse:
    def test_valid_json(self):
        raw = '{"category": "ICP Fit", "evidence": "Commercial mech", "confidence": 0.92}'
        out = parse_response(raw)
        assert out.category == "ICP Fit"
        assert out.evidence == "Commercial mech"
        assert out.confidence == 0.92

    def test_valid_json_with_code_fence(self):
        raw = '```json\n{"category": "Unlikely ICP", "evidence": "Residential", "confidence": 0.8}\n```'
        out = parse_response(raw)
        assert out.category == "Unlikely ICP"

    def test_invalid_category_falls_back_to_review(self):
        raw = '{"category": "Maybe", "evidence": "Unclear", "confidence": 0.5}'
        out = parse_response(raw)
        assert out.category == "Needs Human Review"

    def test_malformed_json_raises(self):
        with pytest.raises(ValueError):
            parse_response("not json at all")

    def test_missing_fields_defaults(self):
        raw = '{"category": "ICP Fit"}'
        out = parse_response(raw)
        assert out.category == "ICP Fit"
        assert out.evidence == ""
        assert out.confidence == 0.0


class TestCategoriesConstant:
    def test_three_categories(self):
        assert set(CATEGORIES) == {"ICP Fit", "Needs Human Review", "Unlikely ICP"}

from pathlib import Path

import pandas as pd
import pytest

from io_utils import (
    parse_annual_revenue,
    read_accounts,
    write_classified,
    Account,
)


@pytest.fixture
def sample_xlsx(tmp_path):
    df = pd.DataFrame([
        {
            "Account Name": "Test Mech",
            "Account ID (18 Char)": "0013700000AaBbCc0001",
            "City": "Phoenix",
            "ZIP": "85001",
            "Address": "123 Main",
            "Annual Revenue": "$50,000,000",
            "Website": "www.testmech.com",
            "Salesforce URL": "https://sfdc.example/001",
            "NAICS Code": 238220,
            "Account Type": "Prospect",
            "Account Owner": "Jane Doe",
            "SDR Owner": "John Smith",
        },
        {
            "Account Name": "No Rev Co",
            "Account ID (18 Char)": "0013700000AaBbCc0002",
            "City": "Austin",
            "ZIP": "78701",
            "Address": "",
            "Annual Revenue": "",
            "Website": "",
            "Salesforce URL": "",
            "NAICS Code": "",
            "Account Type": "Prospect",
            "Account Owner": "",
            "SDR Owner": "",
        },
    ])
    path = tmp_path / "in.xlsx"
    df.to_excel(path, index=False)
    return path


class TestParseAnnualRevenue:
    def test_dollar_sign_and_commas(self):
        assert parse_annual_revenue("$50,000,000") == 50_000_000

    def test_bare_int_string(self):
        assert parse_annual_revenue("25000000") == 25_000_000

    def test_float_input(self):
        assert parse_annual_revenue(50000000.0) == 50_000_000

    def test_int_input(self):
        assert parse_annual_revenue(50000000) == 50_000_000

    def test_empty_string_returns_none(self):
        assert parse_annual_revenue("") is None

    def test_none_returns_none(self):
        assert parse_annual_revenue(None) is None

    def test_nan_returns_none(self):
        import math
        assert parse_annual_revenue(math.nan) is None


class TestReadAccounts:
    def test_reads_two_rows(self, sample_xlsx):
        accounts = read_accounts(sample_xlsx)
        assert len(accounts) == 2

    def test_first_row_fields(self, sample_xlsx):
        accounts = read_accounts(sample_xlsx)
        a = accounts[0]
        assert a.name == "Test Mech"
        assert a.sfdc_id == "0013700000AaBbCc0001"
        assert a.website == "www.testmech.com"
        assert a.annual_revenue == 50_000_000
        assert a.naics == "238220"
        assert a.city == "Phoenix"

    def test_empty_fields_are_none_or_empty(self, sample_xlsx):
        accounts = read_accounts(sample_xlsx)
        a = accounts[1]
        assert a.annual_revenue is None
        assert a.website == ""
        assert a.naics == ""


class TestWriteClassified:
    def test_appends_four_new_columns(self, sample_xlsx, tmp_path):
        from io_utils import ClassifiedRow
        results = [
            ClassifiedRow(
                sfdc_id="0013700000AaBbCc0001",
                category="ICP Fit",
                evidence="Commercial mech",
                verification_method="Website scrape",
                scraped_at="2026-04-22T10:00:00",
            ),
            ClassifiedRow(
                sfdc_id="0013700000AaBbCc0002",
                category="Needs Human Review",
                evidence="No website provided",
                verification_method="Website inaccessible",
                scraped_at="2026-04-22T10:00:01",
            ),
        ]
        out_path = tmp_path / "out.xlsx"
        write_classified(sample_xlsx, out_path, results)

        df = pd.read_excel(out_path)
        assert "Updated Category" in df.columns
        assert "Website Evidence" in df.columns
        assert "Verification Method" in df.columns
        assert "Scrape Timestamp" in df.columns
        assert df.iloc[0]["Updated Category"] == "ICP Fit"
        assert df.iloc[1]["Updated Category"] == "Needs Human Review"

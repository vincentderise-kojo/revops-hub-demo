import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest


SCRIPT_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture
def dry_run_xlsx(tmp_path):
    df = pd.DataFrame([
        {
            "Account Name": "Test Mech",
            "Account ID (18 Char)": "0013700000AaBbCc0001",
            "City": "Phoenix",
            "Annual Revenue": "$50,000,000",
            "Website": "www.testmech.com",
            "NAICS Code": 238220,
            "Account Type": "Prospect",
            "Account Owner": "Jane Doe",
            "SDR Owner": "John Smith",
            "ZIP": "85001",
            "Address": "123 Main",
            "Salesforce URL": "",
        },
    ])
    path = tmp_path / "dry.xlsx"
    df.to_excel(path, index=False)
    return path


def test_dry_run_reports_counts(dry_run_xlsx):
    result = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "classify.py"), "--input", str(dry_run_xlsx), "--dry-run"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "1" in result.stdout  # 1 account parsed
    assert "Test Mech" in result.stdout or "accounts" in result.stdout.lower()

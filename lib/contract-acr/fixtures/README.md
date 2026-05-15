# Contract ACR fixtures

Drop signed Order Form PDFs here as `<slug>.pdf` to enable the buffer-path unit tests in `../parse.test.ts`. Files are gitignored — they contain customer-confidential pricing.

Currently referenced fixtures:
- `all-weather.pdf` — All Weather Contractors signed contract; ACR = $28,000,000

To pull a fresh copy from SFDC:

```bash
npx tsx scripts/test-cw-spotcheck-sfdc.ts <oppId>
```

…and copy the downloaded PDF from the local cache into this directory.

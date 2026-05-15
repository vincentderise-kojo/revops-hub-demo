import pytest
from scraper import normalize_url, registered_domain


class TestNormalizeUrl:
    def test_adds_https_when_missing(self):
        assert normalize_url("example.com") == "https://example.com"

    def test_preserves_https(self):
        assert normalize_url("https://example.com") == "https://example.com"

    def test_promotes_http_to_https(self):
        assert normalize_url("http://example.com") == "https://example.com"

    def test_strips_trailing_slash(self):
        assert normalize_url("https://example.com/") == "https://example.com"

    def test_preserves_path_trailing_slash(self):
        assert normalize_url("https://example.com/about/") == "https://example.com/about"

    def test_lowercases_host(self):
        assert normalize_url("https://Example.COM") == "https://example.com"

    def test_lowercases_uppercase_https_scheme(self):
        assert normalize_url("HTTPS://example.com") == "https://example.com"

    def test_uppercase_http_promoted_to_https(self):
        assert normalize_url("HTTP://example.com") == "https://example.com"

    def test_preserves_case_of_path(self):
        assert normalize_url("https://example.com/Projects") == "https://example.com/Projects"

    def test_handles_www_prefix(self):
        # www is preserved — we don't strip it, sites differ in canonical form
        assert normalize_url("www.example.com") == "https://www.example.com"

    def test_strips_whitespace(self):
        assert normalize_url("  https://example.com  ") == "https://example.com"

    def test_empty_string_returns_none(self):
        assert normalize_url("") is None

    def test_none_returns_none(self):
        assert normalize_url(None) is None

    def test_just_whitespace_returns_none(self):
        assert normalize_url("   ") is None


class TestRegisteredDomain:
    def test_basic_domain(self):
        assert registered_domain("https://example.com") == "example.com"

    def test_www_subdomain(self):
        assert registered_domain("https://www.example.com") == "example.com"

    def test_deep_subdomain(self):
        assert registered_domain("https://sub.deep.example.com") == "example.com"

    def test_co_uk(self):
        assert registered_domain("https://example.co.uk") == "example.co.uk"


from scraper import parse_html, ScrapeResult


class TestParseHtml:
    def test_extracts_title_h1_body(self):
        html = """
        <html>
          <head><title>Test MEP</title><meta name="description" content="Commercial mechanical"></head>
          <body>
            <h1>Commercial Mechanical Contractor</h1>
            <h2>Services</h2>
            <p>We build data centers and hospitals.</p>
            <script>var x = 1;</script>
          </body>
        </html>
        """
        r = parse_html(html, base_url="https://example.com")
        assert "Test MEP" in r.title
        assert "Commercial Mechanical Contractor" in r.text
        assert "We build data centers" in r.text
        assert "var x" not in r.text  # script content stripped
        assert "Commercial mechanical" in r.meta_description

    def test_finds_subpage_links(self):
        html = """
        <html><body>
          <a href="/about">About Us</a>
          <a href="/services">Services</a>
          <a href="https://twitter.com/x">Twitter</a>
          <a href="/random">Random</a>
        </body></html>
        """
        r = parse_html(html, base_url="https://example.com")
        links = set(r.subpage_links)
        # Only returns our target subpages
        assert "https://example.com/about" in links
        assert "https://example.com/services" in links
        assert "https://twitter.com/x" not in links
        assert "https://example.com/random" not in links

    def test_detects_parked_domain_keywords(self):
        html = "<html><body>This domain is for sale. Buy now!</body></html>"
        r = parse_html(html, base_url="https://example.com")
        assert r.is_parked is True

    def test_non_parked_page(self):
        html = "<html><body>Welcome to our electrical contracting firm.</body></html>"
        r = parse_html(html, base_url="https://example.com")
        assert r.is_parked is False

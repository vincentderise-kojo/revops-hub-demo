"""Website scraping and URL utilities for the ICP classifier."""

from __future__ import annotations

import tldextract


def normalize_url(url: str | None) -> str | None:
    """Normalize a website URL.

    Rules:
    - None or whitespace-only -> None
    - Missing scheme -> prepend https://
    - http:// -> upgraded to https://
    - Trailing slash on the bare host stripped
    - Host lowercased; path case preserved
    """
    if url is None:
        return None
    url = url.strip()
    if not url:
        return None

    # Add scheme if missing
    if "://" not in url:
        url = "https://" + url
    elif url.lower().startswith("http://"):
        url = "https://" + url[len("http://"):]

    # Split scheme and rest
    scheme, rest = url.split("://", 1)
    scheme = scheme.lower()

    # Split host and path
    if "/" in rest:
        host, path = rest.split("/", 1)
        path = "/" + path
    else:
        host, path = rest, ""

    host = host.lower()

    # Strip trailing slash from path (but keep path content otherwise)
    if path.endswith("/"):
        path = path[:-1]

    return f"{scheme}://{host}{path}"


def registered_domain(url: str) -> str:
    """Return the registered domain (e.g., example.com from sub.example.com)."""
    ext = tldextract.extract(url)
    if not ext.suffix:
        return ext.domain
    return f"{ext.domain}.{ext.suffix}"


import logging
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
FETCH_TIMEOUT = 10
MAX_REDIRECTS = 3
MAX_TEXT_CHARS = 5_000
SUBPAGE_PATHS = {
    "/about", "/about-us", "/company",
    "/services", "/what-we-do", "/capabilities",
    "/projects", "/portfolio", "/work", "/case-studies",
    "/commercial", "/industrial",
}
MAX_SUBPAGES = 5
PARKED_KEYWORDS = [
    "this domain is for sale",
    "domain for sale",
    "buy this domain",
    "parked by",
    "parked free courtesy of",
]


@dataclass
class ScrapeResult:
    url: str
    status: str  # "ok" | "dns_failure" | "timeout" | "http_error" | "parked" | "thin"
    title: str = ""
    meta_description: str = ""
    text: str = ""
    subpage_links: list = field(default_factory=list)
    is_parked: bool = False
    http_status: object = None
    error_detail: str = ""


def parse_html(html: str, base_url: str) -> ScrapeResult:
    soup = BeautifulSoup(html, "html.parser")

    # Strip noise
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    title = (soup.title.string.strip() if soup.title and soup.title.string else "")

    meta_desc_tag = soup.find("meta", attrs={"name": "description"})
    meta_desc = meta_desc_tag.get("content", "").strip() if meta_desc_tag else ""

    body_text = " ".join(soup.stripped_strings)

    # Subpage links (only relative paths we care about)
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip().lower()
        # Strip query and fragment for matching
        clean = href.split("?")[0].split("#")[0].rstrip("/")
        if clean in SUBPAGE_PATHS:
            abs_url = urljoin(base_url, href)
            if abs_url not in links:
                links.append(abs_url)

    is_parked = any(k in body_text.lower() for k in PARKED_KEYWORDS)

    return ScrapeResult(
        url=base_url,
        status="ok" if not is_parked else "parked",
        title=title,
        meta_description=meta_desc,
        text=body_text,
        subpage_links=links[:MAX_SUBPAGES],
        is_parked=is_parked,
    )


def fetch_page(url: str, session=None):
    """Return (html_text, None) on success, or (None, ScrapeResult) with failure status."""
    sess = session or requests.Session()
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.8"}
    try:
        resp = sess.get(url, headers=headers, timeout=FETCH_TIMEOUT, allow_redirects=True)
    except requests.exceptions.ConnectionError as e:
        return None, ScrapeResult(url=url, status="dns_failure", error_detail=str(e))
    except requests.exceptions.Timeout:
        return None, ScrapeResult(url=url, status="timeout")
    except requests.exceptions.RequestException as e:
        return None, ScrapeResult(url=url, status="http_error", error_detail=str(e))
    except (UnicodeError, ValueError, OSError) as e:
        # Malformed hostnames (IDNA label too long, non-ASCII) and similar low-level errors
        # bubble out of urllib's proxy bypass / socket lookup before requests can wrap them.
        return None, ScrapeResult(url=url, status="http_error", error_detail=f"Bad URL: {e}")

    if resp.status_code >= 400:
        return None, ScrapeResult(url=url, status="http_error", http_status=resp.status_code)

    return resp.text, None


def scrape(url: str, per_domain_delay: float = 1.5) -> ScrapeResult:
    """Fetch homepage + up to MAX_SUBPAGES subpages. Returns combined ScrapeResult."""
    session = requests.Session()

    html, failure = fetch_page(url, session=session)
    if failure is not None:
        return failure

    result = parse_html(html, base_url=url)
    if result.is_parked:
        return result

    # Fetch subpages, respecting the per-domain delay
    combined_text = result.text
    for sub_url in result.subpage_links:
        time.sleep(per_domain_delay)
        sub_html, sub_failure = fetch_page(sub_url, session=session)
        if sub_failure is not None:
            # A failing subpage doesn't poison the homepage result
            continue
        sub_result = parse_html(sub_html, base_url=sub_url)
        combined_text += "\n\n" + sub_result.text

    # Truncate
    if len(combined_text) > MAX_TEXT_CHARS:
        combined_text = combined_text[:MAX_TEXT_CHARS]
    result.text = combined_text

    # Thin-content check after combining
    if len(combined_text) < 500:
        result.status = "thin"

    return result

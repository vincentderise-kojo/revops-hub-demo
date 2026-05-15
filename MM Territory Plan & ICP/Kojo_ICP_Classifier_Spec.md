# Kojo ICP Classifier — Web App Build Spec

**Purpose:** Ingest a CSV of prospect accounts, scrape each account's website, classify each as ICP Fit / Needs Human Review / Unlikely ICP for Kojo's sales team, and output an enriched CSV with categories and evidence.

**Context:** We've been manually doing this with Claude, and it's too slow — ~3,000+ accounts requires hundreds of back-and-forth sessions. A web app that automates the website scraping + classification would replace this workflow.

---

## What Kojo Sells & Who They Sell To

Kojo (usekojo.com) is a procurement platform sold **exclusively to MEP (mechanical, electrical, plumbing) contractors that perform construction work**.

**NOT their ICP:**
- Service, maintenance, or residential repair companies
- General contractors (GCs) — Kojo sells to MEP subs, not GCs
- Non-MEP trades (concrete, asphalt, pool, solar, pipeline, foundation, masonry)
- Product dealers / HVAC equipment distributors
- Facility maintenance / janitorial / building operations
- Telecom / fiber / utility infrastructure (not building MEP)
- Residential tract builders' MEP subs (wire 4,000 homes/yr = not ICP)

**Yes ICP:**
- Commercial MEP construction contractors doing new construction, renovations, tenant improvements on commercial, industrial, institutional, healthcare, data center, education, multifamily, or hospitality projects
- MEP subs to commercial GCs (subcontract to Clayco, Hensel Phelps, Skanska, McCarthy, Sundt, etc.)
- EMCOR affiliates and their equivalents
- Design-build / design-assist MEP contractors
- Industrial MEP (power plant, nuclear, data center, manufacturing) — adjacent to ICP, treat as fit

---

## Classification Framework

### Step 1 — Website Validation (Primary Signal)

Scrape each account's homepage + key pages (services, about, projects/portfolio, commercial). Evaluate for the following signals.

**Strong positive signals (ICP Fit):**
- Construction-focused language: "construction," "design-build," "new construction," "ground-up," "preconstruction," "BIM/VDC," "general contractor partner," "prefabrication"
- Project portfolios with commercial, industrial, healthcare, data center, education, multifamily, institutional, hospitality builds
- Imagery of active job sites, large-scale installations, rough-in work, hard hats on unfinished buildings
- Trade self-identification as "mechanical contractors," "electrical contractors," "plumbing contractors" (not "services" or "repair")
- Mentions of project delivery methods: design-build, design-assist, CM-at-risk, IPD, JOC
- Union affiliations (UA, IBEW, SMART), trade local references
- Named GC partners (Clayco, Hensel Phelps, Skanska, McCarthy, Sundt, Layton, Okland, Willmeng, HITT, etc.)
- Sheet metal fabrication shops, prefab facilities, BIM/CAD departments
- Medical gas systems, process piping, chillers, cooling towers, VRF, central plants

**Strong negative signals (Unlikely ICP):**
- Homepage led by: service calls, 24/7 emergency repair, "fix it today," tune-ups, maintenance contracts
- Residential-facing: "your home," homeowner testimonials, service area maps for residential customers
- Imagery dominated by: vans at homes, uniformed technicians ringing doorbells, finished residential interiors
- Consumer-brand tone: franchise naming ("Mister Sparky," "Roto-Rooter," "Benjamin Franklin Plumbing")
- Product-centric: HVAC equipment dealers, parts suppliers
- Facility maintenance, janitorial, building operations
- Tract home builders' subs (wiring/plumbing 4,000+ homes/yr for Pulte/Lennar/etc.)
- Water heater specials, drain cleaning offers, ceiling fan installations
- Non-MEP trade keywords: "concrete," "masonry," "pool," "asphalt," "pipeline," "solar installer," "waterproofing," "foundation"
- General contractor naming + portfolio of full building construction (not MEP sub)
- Solar installation only

**Mixed signals (Needs Human Review):**
- Website advertises both construction and service divisions without clear primary focus
- Commercial service/maintenance (not ICP) but unclear on new construction share
- Vague/thin website, no portfolio, no project examples, no clear self-description
- Website down, under construction, returns errors
- Holding company / parent page only with no detail

### Step 2 — NAICS Code Check (Secondary Signal)

NAICS is a confirming signal, not a gating one. NAICS codes are frequently miscoded in Salesforce — trust the website over NAICS.

**Core MEP construction codes (supportive):**
- 238110 — Plumbing, Heating, and Air-Conditioning Contractors
- 238210 — Electrical Contractors
- 238220 — Plumbing, Heating, and Air-Conditioning Contractors (mechanical)
- 238290 — Other Building Equipment Contractors

**MEP-adjacent construction codes (supportive):**
- 236220 — Commercial and Institutional Building Construction
- 237110 — Water and Sewer Line Construction
- 238990 — All Other Specialty Trade Contractors

**How to use NAICS:**
- Website says construction + NAICS is MEP → reinforces ICP Fit
- Website says construction + NAICS is off → trust the website, still ICP Fit, flag NAICS mismatch
- Website is ambiguous + NAICS is core MEP → lean Needs Human Review
- Website says service/residential + NAICS is MEP → trust website, Unlikely ICP

### Step 3 — Size Assessment (Tiebreaker & Prioritization)

Larger MEP construction contractors = higher priority. Sort output by:
- Annual revenue (from input CSV)
- Employee count, offices, geographic footprint
- Scale of projects in portfolio (square footage, contract values, marquee project names)
- Fabrication capabilities

Use size to break ties when deciding between ICP Fit vs Needs Human Review.

---

## Output Categories

Classify each account as **one** of:

- **ICP Fit** — Website clearly indicates MEP construction focus; NAICS and size support or don't contradict
- **Needs Human Review** — Website shows mixed signals, is thin/ambiguous, or inaccessible; NAICS alone not enough
- **Unlikely ICP** — Website indicates service, maintenance, residential repair, non-MEP trade, or non-contractor business

Include a **one-line rationale** per account citing specific website evidence. Examples:

> "Portfolio shows 10+ hospital and data center builds; design-build language throughout. 51-200 employees."

> "Homepage = '24/7 emergency repair' + residential service area map. Water heater + drain cleaning specials. Residential service model."

> "Concrete contractor — cast-in-place, tilt-up wall, brick masonry. Non-MEP trade."

> "Telecom/fiber utility infrastructure. CLEC, dark fiber, OSP design. Not building MEP."

---

## Input CSV Format

Existing column headers from the current workflow (some variation between territory files; handle both):

```
Account Name               (string, required)
Account ID (18 Char)       (string, required — for SFDC join)
City                       (string)
ZIP                        (string)
Nearby Marquee Accounts    (string, free text)
Closest Distance (miles)   (float)
Account Type               (string)
Account Owner              (string)
SDR Owner                  (string)
Address                    (string)
Annual Revenue             (string — strip $ and , before parsing as int)
Website                    (string — primary input for scraping)
Salesforce URL             (string)
NAICS Code                 (float or int, may be blank)
```

Handle header variations: `NAICS Code`, `NAICS Code ` (trailing space), `NAICS`, `Primary NAICS Code`.

Handle file encoding: try UTF-8 first, fall back to latin-1 (some territory files are latin-1).

---

## Output CSV Format

Same columns as input, plus:

```
Updated Category           (string — "ICP Fit" / "Needs Human Review" / "Unlikely ICP")
Website Evidence           (string — one-line rationale citing website evidence)
Verification Method        (string — "Website scrape" / "Pattern-matched" / "Manual override" / "Website inaccessible")
Scrape Timestamp           (ISO 8601 datetime)
```

Also produce a **Summary** output: counts per category, per territory (if territory column present), breakdown by revenue tier (>$50M, $25-50M, $10-25M, <$10M).

---

## Scraping Logic

For each account's `Website` URL:

1. **Normalize URL** — add https:// if missing, strip trailing slash, handle www. variants
2. **Fetch homepage** — timeout 10s, follow redirects (max 3)
3. **Parse HTML** — extract visible text from body, meta description, title, h1/h2 headers
4. **Fetch key subpages** if linked on homepage:
   - `/about`, `/about-us`, `/company`
   - `/services`, `/what-we-do`, `/capabilities`
   - `/projects`, `/portfolio`, `/work`, `/case-studies`
   - `/commercial`, `/industrial`
5. **Extract signals** — run keyword matching against positive/negative lists above
6. **Classify** — apply decision logic (see Classification Algorithm below)
7. **Store evidence snippet** — the text chunk that drove the classification

**Error handling:**
- DNS failure → category = "Needs Human Review", evidence = "Website unreachable (DNS)"
- 404 / 500 → "Needs Human Review", evidence = "Website returned error"
- Timeout → "Needs Human Review", evidence = "Website timeout"
- Successful fetch but no useful content → "Needs Human Review", evidence = "Thin/empty website"
- Parked domain / for-sale page → "Needs Human Review", evidence = "Parked domain"

**Rate limiting:** Scrape respectfully. Add 1-2s delay between requests to same domain. User-Agent string should identify the scraper.

**Optional enhancement:** Augment scrape with LLM call (Claude API via Anthropic, cheapest model like Haiku) to evaluate the full extracted text against the ICP criteria. Prompt should include the full framework above and ask for category + one-line rationale + evidence citation. This will dramatically improve accuracy over pure keyword matching on edge cases.

---

## Classification Algorithm (Pseudocode)

```
function classify(website_text, naics_code, account_name):
    # Level 1: Check hard negative patterns (definitive Unlikely)
    if matches_residential_brand_pattern(website_text):
        return "Unlikely ICP", evidence
    if matches_non_mep_trade(website_text):
        return "Unlikely ICP", evidence
    if matches_consumer_service_phrase(website_text):
        # e.g., "24/7 emergency repair" as homepage H1, "your home"
        return "Unlikely ICP", evidence

    # Level 2: Check hard positive patterns (definitive ICP Fit)
    if matches_commercial_mep_pattern(website_text):
        # e.g., "commercial electrical contractor," "design-build," subs to Hensel Phelps
        return "ICP Fit", evidence
    if mentioned_emcor_affiliate(website_text):
        return "ICP Fit", evidence

    # Level 3: Ambiguous — use NAICS + size as tiebreaker
    if naics_in_core_mep_codes(naics_code) and has_commercial_project_signals(website_text):
        return "ICP Fit", evidence
    if naics_in_core_mep_codes(naics_code) and no_clear_signal(website_text):
        return "Needs Human Review", evidence

    # Level 4: Default
    return "Needs Human Review", evidence
```

**Recommended:** Skip Levels 1-3 heuristics and just use an LLM call with the full framework as the prompt. More accurate and handles edge cases the pattern matcher misses. Costs ~$0.001 per account at Haiku pricing.

---

## Key Pattern Lists (Starter)

### Residential brand patterns (Unlikely ICP)
```
mister sparky, roto-rooter, benjamin franklin plumbing, one hour heating,
aire serv, mr rooter, rainbow international, morris-jenkins, croppmetcalfe,
f.h. furr, genz-ryan, jon wayne service, casteel, chas roberts,
parker and sons, goettl, howard air, cool blew, magic touch
```

### Non-MEP trade keywords (Unlikely ICP)
```
concrete contractor, masonry contractor, tilt-up, cast-in-place,
asphalt paving, pool builder, pool construction, solar installer,
solar installation, oil and gas pipeline, gas pipeline, waterproofing,
foundation contractor, fence contractor, roofing, landscape,
telecommunications infrastructure, fiber optic, dark fiber, utility grid,
power line construction, transmission line, distribution line, substation
```

### Commercial MEP positive patterns (ICP Fit)
```
commercial electrical contractor, commercial mechanical contractor,
commercial plumbing contractor, design-build electrical, design-build mechanical,
design-assist, preconstruction services, BIM coordination, VDC,
prefabrication, sheet metal fabrication, process piping, medical gas,
chilled water system, central plant, cooling tower installation,
subcontractor to, partner with [GC name], new construction,
ground-up construction, tenant improvement, mission critical, data center,
healthcare construction, multifamily construction, hospitality construction,
EMCOR, NECA member, MCA member, SMACNA
```

### Consumer HVAC / plumbing disqualifiers (Unlikely ICP)
```
24/7 emergency, emergency repair, same-day service, free estimate,
tune-up special, $XX service call, financing available for homeowners,
your home comfort, family-owned since, we treat you like family,
satisfaction guaranteed, A+ BBB rating, Nextdoor recommended,
Angie's list, HomeAdvisor, drain cleaning, water heater installation,
garbage disposal, ceiling fan installation, whole house surge protection
```

Note: a single phrase match isn't conclusive. Score the density — if 3+ consumer phrases in first 500 words of homepage = Unlikely. If 1 phrase but construction portfolio present = ICP Fit with service arm.

### GC (general contractor) patterns — NOT ICP
```
general contractor, general contracting, construction management firm,
design-build general contractor, CM at risk, ground-up general contractor,
we build, construction company (without MEP trade qualifier)
```
GCs are Kojo-adjacent but not Kojo's ICP — they buy from MEP subs.

---

## Evidence from Manual Verification (Use for Training / Validation)

Below are accounts we've manually verified. Use these as a test set — the classifier's output should agree with these verdicts.

### Confirmed ICP Fit
| Account | State | Rev | Why ICP |
|---|---|---|---|
| Nagelbush Mechanical | FL | $100M | 402 commercial permits totaling $954M, hotels/civic/corporate |
| Gootee Construction | LA | $50M | Commercial mechanical/HVAC/plumbing for Shell, Dow, Bayer, Ritz-Carlton |
| RJ Kielty Plumbing | FL | $34M | New Construction page, works with commercial GCs |
| Sunshine State Plumbing | FL | $47M | Dedicated Commercial Department, Bluebook listed |
| First Quality Plumbing | FL | $34M | 80+ employees, commercial page covering hotels/condos/office |
| HACI Mechanical | AZ | $102M | 5 largest mechanical in AZ, ESOP, hospitals/schools/ASU/casinos |
| University Mechanical (UMEC-AZ) | AZ | $40M | EMCOR subsidiary, Phoenix Children's Hospital |
| Hawkeye Electric | AZ | $70M | Employee-owned, Sprouts/Cox/NAU/Border Patrol projects |
| Canyon State Electric | AZ | $50M | Commercial/industrial/healthcare since 1978 |
| Switch Electric | AZ | $50M | Data center electrical, subs to Clayco/Hensel Phelps |
| Jenco Electric | AZ | $35.5M | Commercial/industrial electrical since 1990, Criticore Group |
| Tempe Mechanical | AZ | $25.4M | Full-service mechanical, in-house sheet metal fab |
| Midstate Mechanical | AZ | $26.1M | Top 3 mechanical in AZ, commercial/industrial/institutional |
| Kortman Electric | AZ | $28.1M | Commercial/industrial electrical since 1983, top 20 in AZ |
| A.M.E. Electrical | AZ | $30.1M | Heavy commercial/industrial, Red Bull Rauch/Ball Glendale/HelloFresh |
| Karber Corporation (K CORP) | AZ | $30M | Data centers/healthcare/manufacturing/aviation |
| RKS Plumbing & Mechanical | AZ | $48M | Hospitals/schools/casinos/high-rise condos, medical gas |
| DP Air Corp | AZ | $60M | Data center cooling, 49 of Fortune 100 |
| Hilty's Electric | AZ | $60.5M | Multi-family new construction, ESOP, 350K units |
| Esco Electric | AZ | $70M | Commercial electrical — offices/schools/casinos/medical/hotels |
| Bunney's | AZ | $30.4M | Industrial power plant MEP — APS supplier, Palo Verde Nuclear |
| EMCOR Services Arizona | AZ | $27.9M | EMCOR affiliate, commercial HVAC |
| B Frank Joy | DMV | $69M | DC-area commercial mechanical |
| Harvey Hottel | DMV | $63M | DMV commercial mechanical |
| Welch and Rushe | DMV | $30M | DMV commercial mechanical |
| Northern Arizona Refrigeration | AZ | — | Commercial refrigeration |

### Confirmed Unlikely ICP
| Account | State | Rev | Why Not |
|---|---|---|---|
| Austin Electric Services | AZ | $50.9M | Residential tract — wires 4K homes/yr, Synergos residential group |
| Brewer Companies | AZ | $26.1M | Synergos residential tract plumbing, 7K homes in 2020 |
| BPG Designs | AZ | $44.9M | Telecom/fiber/utility infrastructure, not building MEP |
| All Pro Electric | AZ | $37.3M | Small service shop, 3 employees |
| AZ State Electric | AZ | $36.4M | Small service shop, 8 employees, $249K rev |
| Degan Construction | AZ | $35.7M | Concrete, underground utilities, masonry — non-MEP trade |
| API Plumbing | AZ | $34M | Residential service plumbing, merged with Wolfgang's (home service) |
| Wespac Construction | AZ | $29.7M | Commercial GC, not MEP sub |
| Worth Electric (Global Efficient Energy) | AZ | $28.7M | Solar installer |
| Truesdell | AZ | $72.8M | Concrete repair / structural restoration |
| T&T Construction of Central FLA | FL | $74M | Concrete specialty contractor (tilt-up, cast-in-place) |
| National Powerline | AZ | $73M | Electrical utility / power grid, not building MEP |
| Superior Plumbing | GA | $67M | Residential service plumbing — looked commercial by name |
| Chas Roberts | AZ | $55.9M | Residential tract builder HVAC |
| Genz-Ryan | MN | $56M | Residential home service, 300 employees dispatch model |
| Morris-Jenkins | NC | $65M | Charlotte's largest residential HVAC home service |
| CroppMetcalfe | DMV | $72M | Major residential HVAC/plumbing service |
| F.H. Furr | DMV | $70M | Major residential home service brand |
| JON Wayne Service | TX | $48.9M | Largest San Antonio residential HVAC/plumbing service |
| Metro Waterproofing | GA | $71M | Waterproofing trade, not MEP |
| Pipeline Construction & Maintenance | LA | $39M | Oil & gas pipeline, not building MEP |
| Mister Sparky (various) | Multi | $50M+ | National residential electrical service franchise |
| Casteel | GA | $41M | Consumer-branded residential HVAC |
| Complete Property Services | FL | $40M | Property management, not construction |
| Reidhead Plumbing | AZ | — | Residential service |
| Authority HVAC | AZ | — | Residential service |
| Rainforest Plumbing | AZ | — | Residential service |
| Benchmark Builders | — | — | General contractor, not MEP |
| T&T Construction Management Group | FL | — | Concrete specialty contractor (woman-owned tilt-up) |

---

## Suggested Tech Stack

- **Backend:** Python (FastAPI) or Node (Express)
- **Scraper:** Python `requests` + `BeautifulSoup` or Node `axios` + `cheerio`. For JS-heavy sites, add Playwright/Puppeteer fallback.
- **LLM call (recommended):** Anthropic API, `claude-haiku-4-5` model. System prompt = full classification framework above. User prompt = scraped page text + account name + NAICS. Response format: JSON with `{category, evidence, confidence}`.
- **CSV I/O:** pandas (Python) or csv-parser (Node)
- **UI:** Simple Next.js or Streamlit app — upload CSV, show progress bar, download output CSV. Support resuming (if a scrape fails halfway, don't re-scrape already-done rows).
- **Storage:** Cache scrape results by normalized URL — if same website appears twice in a batch or next batch, reuse. TTL ~30 days.
- **Rate limiting:** Max 5 concurrent scrapes, 1-2s delay between requests to same domain.

---

## Validation / Testing

Before running on the full dataset, run the classifier on the "Evidence from Manual Verification" table above (both lists, ~55 accounts). Expected accuracy: **>90% agreement** with manual verdicts. If below 85%, tune the pattern lists or the LLM prompt.

Particular edge cases to test:
1. **Synergos/Austin Companies group** — residential tract wiring but "Electric" in name. Should classify Unlikely.
2. **Multi-family residential MEP subs** (e.g., Hilty's) — ICP Fit because multi-family = commercial-scale.
3. **EMCOR Services brands** — ICP Fit even when service-focused.
4. **Industrial power plant MEP** (e.g., Bunney's) — ICP Fit even though not building MEP.
5. **Telecom/fiber infrastructure** (e.g., BPG Designs) — Unlikely even though "Electric" in service offerings.
6. **GCs with "Construction" in name** — Unlikely, they're buyers of MEP subs not MEP subs.
7. **Solar-only installers** — Unlikely.
8. **Concrete/masonry/waterproofing** — Unlikely.
9. **Very small service shops** ($1-5M rev, <10 employees) — typically Unlikely even if named "Mechanical Contractors."

---

## Non-Goals / Scope Limits

- Don't scrape behind auth or paywalls
- Don't scrape LinkedIn / Facebook / Yelp — too brittle and ToS issues. Use primary website only.
- Don't try to infer project details beyond what's on the website (no BuildZoom scraping, no permit databases — those can come later as v2)
- Don't classify based on reviews/ratings — ICP fit is about what they do, not how well
- Don't auto-enrich missing revenue/employee data — use only what's in the CSV

---

## Future Enhancements (v2+)

- BuildZoom / permit database enrichment (project counts, values, types)
- LinkedIn company data pull (employee count, industries)
- Historical verification feedback loop — sales reps mark classifications as correct/incorrect, classifier retrains
- Sales/SDR assignment logic: if ICP Fit, auto-suggest which AE owns the account based on territory rules
- Bulk re-scrape on cadence (quarterly) since company focus shifts — residential service company might pivot to commercial

---

## Contact / Context

- Existing manual workflow has been done in Claude chats over many sessions
- Current territory coverage: 11 US geos (Phoenix, DFW, Houston, SA/Austin, Other TX, Atlanta, Tampa/FL, Nashville/Charlotte, Minneapolis/Louisville, NYC/NJ, DC/Baltimore)
- Current dataset: ~4,600 NAICS-qualified accounts across those territories, ~3,000 of which are ICP candidates needing website verification
- Goal: ship this app so sales team can run CSV → classified CSV in hours instead of weeks

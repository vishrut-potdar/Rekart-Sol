# Rekart — Nagpur Second-Life Decision Platform

> **Salvage Plan Decision**: **Fix-Forward Hybrid** in Node.js (ESM) + Express + Vanilla JS, stripped to the real **Scan -> Confirm -> Questions -> Decide -> Act** v1 spine with persistent storage (Firebase Firestore / disk repository), strict input validation, and honest AI & directory labeling.

---

## Core v1 Spine

1. **Scan or Upload** (`/api/v1/vision/upload-media`): Accepts JPEG, PNG, or WebP by file signature (max 10 MB), strips EXIF GPS/camera metadata on upload, and stores files behind owner-checked access.
2. **Honest Classification & Confirmation** (`/api/v1/vision/classify-single`): Validates OpenRouter / Gemini JSON output with Zod and enforces request timeouts (`AbortSignal.timeout`). When no AI key is configured or confidence is unavailable, returns `category: "unknown"`, `confidence: null`, `simulated: true` so the user confirms the item manually instead of showing fake predictions.
3. **3-Stage Decision Engine** (`POST /api/v1/decide`):
   - **Stage 1 — Hard Rules**: Safety overrides (`DO_NOT_ATTEMPT` for swollen lithium batteries, mercury bulbs, or high-voltage mains internals), E-Waste (Management) Rules 2022 enforcement (electronics never route to kabadiwalas), and NGO donation readiness gating.
   - **Stage 2 — Sourced Value & Cost Ranges**: Computes working resale range, as-is range, 60% repair threshold ceiling, Fair Price Shield percentiles (`P25`, `P50`, `P75`), and channel net yields with provenance and dates.
   - **Stage 3 — Priority Weighting & Counterfactuals**: Ranks all 5 paths (`repair`, `sell`, `donate`, `reuse`, `recycle`) by user priority (`balanced`, `max_cash`, `lowest_effort`, `fastest`, `eco_social`) and explains exact numeric conditions in `what_would_change_this`.
4. **Act Locally** (`/api/v1/routing/nearby-partners`, `/api/v1/selling/generate-listing`, `/api/v1/recycling/where-does-this-go`): Lists real sourced Nagpur NGOs (`is_verified: false`, public source URLs) alongside explicitly labeled sample repair/CPCB placeholders (`is_sample: true`).

### Feature-Flagged Non-v1 Modules (`ENABLE_V2_MODULES`)

Payouts (`/api/v1/payment/*`), Partner Terminal (`/api/v1/partner/leads`, `/api/v1/partner/terminal/*`), Circular Rewards (`/api/v1/rewards/*`), Student Technicians / Shop Broadcasts, and the Async Job Queue (`/api/v1/jobs/*`) are gated behind `ENABLE_V2_MODULES=true` (disabled by default in production; enabled in local dev and tests). All identified security flaws in those modules are fixed:
- **Payouts**: Owner check, server-side valuation cap, strict UPI VPA validation, idempotency key support, and `pending_gateway_confirmation` status until webhook confirmation.
- **Webhooks**: Raw byte HMAC-SHA256 verification using `crypto.timingSafeEqual` mounted before `express.json()`.
- **Partner Terminal**: Partner organization IDOR scoping on leads/invoices/check-ins and server HMAC-SHA256 proof signatures.
- **Rewards**: Authenticated-only routes, allowlisted server point values, per-reference deduplication, daily earn caps, and stored unpredictable voucher codes.

---

## Persistence & Privacy (DPDP Act 2023)

- **Cloud Persistence (Firebase Firestore)**: Set `FIREBASE_PROJECT_ID` (with `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` or `FIREBASE_API_KEY`) to sync users, items, decisions, triage sessions, vouchers, and point ledgers to Cloud Firestore. See [`firestore.rules`](firestore.rules) for owner-only security rules.
- **Local Disk Persistence**: When Firebase is not configured, `PersistentRepository` (`src/db/connection.js`) atomically persists all records to `DATA_FILE_PATH` (default `./.data/rekart-db.json`).
- **Privacy Controls**:
  - Automatic binary EXIF/XMP/comment stripping on JPEG, PNG, and WebP uploads (`src/utils/exif_stripper.js`).
  - `httpOnly` `SameSite=Lax` session cookies (`POST /api/v1/auth/anonymous`, `/login`, `/register`, `/logout`).
  - `GET /api/v1/auth/my-data` (export user items/decisions) and `DELETE /api/v1/auth/me` (delete account, items, decisions, and uploaded photos).

---

## Getting Started

```bash
npm install
npm test
npm run dev
```

- **Main App**: `http://localhost:4000/`
- **Partner Terminal (v2)**: `http://localhost:4000/partner.html`
- **Health Check**: `GET http://localhost:4000/health`

### Verification & Audit Commands

```bash
npm test                 # Runs full Node.js test suite (decision engine, security, regressions)
npm audit --omit=dev     # Verifies 0 production dependency vulnerabilities
```

# Rekart Backend

> Production-ready circular economy, automated diagnostic triage, fair-price shield, and reverse logistics platform backend.

---

## 🏗️ System Architecture & Implemented Modules

Rekart's backend is divided into modular subsystems with full web frontend support:

```
                                      [ Browser PWA / Client App ]
                                                   │
                                            (TLS / REST / WS)
                                                   ▼
                                         [ Express API Gateway ]
                                                   │
                        ┌──────────────────────────┴──────────────────────────┐
                        ▼                                                     ▼
              [ Core Services ]                                           [ Data Stores ]
              ├── 1. Vision & Media Ingestion                             ├── PostgreSQL 16 + PostGIS
              ├── 2. Diagnostic & Triage Rule Engine                      ├── Redis 7 (Demand & Caches)
              ├── 3. Valuation & Calculation Engines                      └── S3 / Local Object Storage
              ├── 4. Routing & Matchmaking Services
              ├── 5. Partner Terminal & Settlement
              ├── 6. JWT & RBAC Authentication
              ├── 7. Instant UPI Buy-Back Payouts & Commission Invoicing
              └── 8. Asynchronous Background Job Queue
```

### Module Breakdown

1. **Vision & Media Ingestion Services (`src/services/vision/`)**:
   - `AiVisionProvider`: Connects to Multimodal Vision API (e.g. Gemini 2.0 Flash) or local high-fidelity heuristic segmenter.
   - `PileDecompositionService`: Multi-garment bounding box segmentation with child item card generation. Supports both synchronous (`/decompose-pile`) and async background execution (`/decompose-pile-async`).
   - `SingleItemClassifierService`: Multi-label categorization, brand recognition, and visual defect extraction.
   - `MediaStorageService`: AWS S3 / Cloudflare R2 / MinIO integration (`@aws-sdk/client-s3`), pre-signed upload URL generation, and **Pre-Pickup Photo Log Manager** generating immutable SHA-256 condition signatures.

2. **Diagnostic & Triage Rule Engine (`src/services/triage/`)**:
   - `DecisionTreeEngine`: Dynamic 3-to-5 tap decision trees localized in **English, Hindi, and Hinglish**, plus pile exception closeup queries.
   - `HardwareTelemetryParser`: Ingests touchscreen response grids, battery wear %, cycle count, charging wobble, audio SNR, and storage wear.
   - `SymptomAndFaultRanker`: Correlates telemetry and tap answers, prioritizing zero-cost non-invasive remediation before hardware fixes.

3. **Valuation & Calculation Engines (`src/services/calculation/`)**:
   - `FairPriceShieldEngine`: Evaluates quotes against local percentile benchmarks ($P_{25}, P_{50}, P_{75}$) and flags price gouging.
   - `RepairOrReleaseEngine`: Enforces the $60\%$ rule:
     $$\text{Repair Ceiling} = 0.60 \times \text{Repaired Resale Value}$$
     Factors in market resale, depreciation, scrap value, and brand exchange.
   - `ChannelComparisonEngine`: Dynamic net yield comparison across Instant Buy-Back vs. P2P Resale vs. Offline Refurbisher vs. Kabadiwala weight scrap.
   - `SafetyScorerEngine`: Hazard classification matrix (*Beginner Safe*, *Needs Specialized Tools*, *Do Not Attempt* for swollen batteries / microwave capacitors).

4. **Routing & Matchmaking Services (`src/services/routing/`)**:
   - `ReadinessGatekeeperService`: Strict NGO criteria gatekeeping with automatic diversion to industrial textile recovery or scrap.
   - `HyperlocalMatcherService`: PostGIS spatial queries matching verified repair shops, CPCB recyclers, and NGOs with **active shortage demands**.
   - `SocietyDrivesService`: Neighborhood and RWA collection schedules.

5. **Partner Handoff & Administration (`src/services/partner/`)**:
   - `LeadManagerService`: Per-lead partner attribution enforcing **Neutral Pricing Isolation**.
   - `PartnerTerminalService`: Partner physical check-in, provisional grade amendments, and digital proof certificates.
   - `PriceCalibrationService`: Crowdsourced user payment logging with IQR outlier filtering and dynamic benchmark updates.

6. **Authentication & Authorization (`src/services/auth/` & `src/middleware/auth.js`)**:
   - JWT token generation & verification (`jsonwebtoken`).
   - Password hashing with `bcryptjs`.
   - Role-Based Access Control (`donor`, `partner_technician`, `ngo_coordinator`, `admin`).

7. **Payments & Instant UPI Payouts (`src/services/payment/`)**:
   - `PayoutService`: Validates UPI VPAs, initiates Instant Buy-Back payouts, tracks gateway references & UTR numbers.
   - `CommissionBillingService`: Partner monthly lead billing and Razorpay webhook HMAC SHA-256 signature verification.

8. **Async Background Job Queue (`src/services/queue/`)**:
   - Background worker queue for offloading heavy image decomposition and batch jobs (`/api/v1/jobs/:jobId`).

9. **Interactive Web Frontends (`public/`)**:
   - Donor Triage Portal (`/`): Photo upload, multi-lingual tap questions, Fair Price Shield check, channel comparison, and instant UPI payout trigger.
   - Partner Terminal UI (`/partner.html`): Technician login, physical inspection check-in, grade amendments, and signed digital proof issuance.

---

## 🚀 Getting Started

### Installation

```bash
cd d:\REKART_Final
npm install
```

### Running the Test Suite

```bash
npm test
```
*Executes all 23 unit & integration tests covering Auth, Payments, Queue, Vision, Triage, Calculation, Routing, and Partner services.*

### Running the Simulation Demo

```bash
npm run demo
```

### Starting the Server & Web Portals

```bash
npm run dev
# Server runs on http://localhost:4000
# User Portal: http://localhost:4000/
# Partner Terminal: http://localhost:4000/partner.html
```

---

## 🔑 Pre-Seeded Demo Accounts

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@rekart.in` | `Rekart@123` |
| **Partner Technician** | `tech.sitabuldi@rekart.in` | `Rekart@123` |
| **NGO Coordinator** | `coordinator@goonjnagpur.org` | `Rekart@123` |
| **Donor User** | `donor@gmail.com` | `Rekart@123` |

---

## 📡 API Reference Overview

| Domain | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/v1/auth/register` | Register new donor / partner / admin |
| **Auth** | `POST` | `/api/v1/auth/login` | Login and obtain JWT bearer token |
| **Auth** | `GET` | `/api/v1/auth/me` | Current authenticated profile |
| **Vision** | `POST` | `/api/v1/vision/decompose-pile` | Synchronous garment pile decomposition |
| **Vision** | `POST` | `/api/v1/vision/decompose-pile-async` | Asynchronous queued pile decomposition |
| **Vision** | `POST` | `/api/v1/vision/classify-single` | Single item category, brand, and defect classifier |
| **Vision** | `POST` | `/api/v1/vision/presigned-upload-url` | Generate pre-signed S3 / R2 upload URL |
| **Triage** | `GET` | `/api/v1/triage/questions` | 3-5 tap questions (`?category=electronics&language=hinglish`) |
| **Triage** | `POST` | `/api/v1/triage/session` | Complete diagnostic triage submission |
| **Calc** | `POST` | `/api/v1/calc/fair-price-shield` | Evaluate quote against Nagpur percentiles |
| **Calc** | `POST` | `/api/v1/calc/repair-or-release` | Compute 60% threshold repair-or-release matrix |
| **Calc** | `POST` | `/api/v1/calc/channel-comparison` | Net yields across P2P, Instant, Refurb, and Kabadiwala |
| **Calc** | `POST` | `/api/v1/calc/safety-score` | Hazard detection & self-repair feasibility scorer |
| **Routing** | `POST` | `/api/v1/routing/readiness-check` | NGO readiness gatekeeper and textile recovery diversion |
| **Routing** | `GET` | `/api/v1/routing/nearby-partners` | Proximity lookup of CPCB recyclers, NGOs, and repair shops |
| **Partner** | `POST` | `/api/v1/partner/terminal/check-in` | Physical item inspection & grade amendment |
| **Partner** | `POST` | `/api/v1/partner/terminal/issue-proof` | Issue digital proof of recycling or donation |
| **Payment** | `POST` | `/api/v1/payment/instant-payout` | Dispatch Instant Buy-Back UPI transfer to donor VPA |
| **Payment** | `POST` | `/api/v1/payment/partner-invoice` | Generate monthly lead commission invoice |
| **Queue** | `GET` | `/api/v1/jobs/:jobId` | Poll status of asynchronous background job |

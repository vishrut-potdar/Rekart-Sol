-- ==============================================================================
-- REKART: Complete PostgreSQL + PostGIS Schema
-- Supports Vision Decomposition, Triage Engine, Fair Price Shield,
-- Partner Lead Attribution, User Authentication & Payment Settlement
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Enums
CREATE TYPE user_role AS ENUM (
    'donor',
    'partner_technician',
    'ngo_coordinator',
    'admin'
);

CREATE TYPE item_category AS ENUM (
    'electronics', 
    'apparel', 
    'appliance', 
    'furniture', 
    'kitchenware', 
    'scrap_metal', 
    'books', 
    'other'
);

CREATE TYPE triage_status AS ENUM (
    'draft', 
    'decomposing', 
    'triaging', 
    'priced', 
    'routed', 
    'fulfilled', 
    'abandoned'
);

CREATE TYPE outcome_track AS ENUM (
    'repair', 
    'p2p_resale', 
    'instant_buyback', 
    'ngo_donation', 
    'formal_recycle', 
    'kabadiwala_scrap'
);

CREATE TYPE partner_type AS ENUM (
    'repair_shop', 
    'ngo', 
    'cpcb_recycler', 
    'kabadiwala', 
    'brand_dropbox'
);

CREATE TYPE safety_rating AS ENUM (
    'BEGINNER_SAFE', 
    'NEEDS_SPECIALIZED_TOOLS', 
    'DO_NOT_ATTEMPT'
);

-- 0. User Accounts & Roles
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    role user_role DEFAULT 'donor',
    partner_id UUID NULL, -- Linked if user is a technician or coordinator
    city VARCHAR(100) DEFAULT 'Nagpur',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- 1. Core Items Table
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_batch_id UUID NULL,
    category item_category NOT NULL,
    brand VARCHAR(100),
    model_name VARCHAR(150),
    provisional_grade VARCHAR(10),
    final_grade VARCHAR(10),
    bounding_box JSONB NULL,
    raw_media_urls JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    status triage_status DEFAULT 'draft',
    recommended_track outcome_track,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_batch_id ON items(parent_batch_id);
CREATE INDEX idx_items_category ON items(category);

-- 2. Triage & Diagnostic Sessions
CREATE TABLE triage_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID UNIQUE REFERENCES items(id) ON DELETE CASCADE,
    language VARCHAR(10) DEFAULT 'en',
    question_flow_id VARCHAR(64) NOT NULL,
    answers_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    sensor_telemetry JSONB DEFAULT '{}'::jsonb,
    detected_faults JSONB DEFAULT '[]'::jsonb,
    safety_score safety_rating DEFAULT 'BEGINNER_SAFE',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Fair Price Shield & Repair Benchmarks
CREATE TABLE price_benchmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id VARCHAR(50) DEFAULT 'nagpur',
    category item_category NOT NULL,
    brand VARCHAR(100) NOT NULL,
    model_name VARCHAR(150) NOT NULL,
    fault_type VARCHAR(100) NOT NULL,
    part_grade VARCHAR(20) CHECK (part_grade IN ('OEM', 'aftermarket', 'reconditioned')),
    p25_price NUMERIC(10, 2) NOT NULL,
    p50_median_price NUMERIC(10, 2) NOT NULL,
    p75_price NUMERIC(10, 2) NOT NULL,
    sample_count INT DEFAULT 1,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_benchmark UNIQUE (city_id, model_name, fault_type, part_grade)
);

CREATE INDEX idx_benchmarks_lookup ON price_benchmarks(city_id, model_name, fault_type);

-- 4. Hyperlocal Partner Directory (PostGIS)
CREATE TABLE partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    partner_type partner_type NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) DEFAULT 'Nagpur',
    is_verified BOOLEAN DEFAULT FALSE,
    pickup_available BOOLEAN DEFAULT FALSE,
    accepted_categories item_category[] NOT NULL,
    min_acceptance_grade VARCHAR(10) DEFAULT 'C',
    operational_hours JSONB,
    location GEOMETRY(Point, 4326) NOT NULL,
    commission_rate NUMERIC(5, 4) DEFAULT 0.0000, -- Isolated from client-facing calculations
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_partners_location ON partners USING GIST (location);
CREATE INDEX idx_partners_type ON partners (partner_type);

-- 5. Active NGO Real-Time Demands
CREATE TABLE partner_demands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
    category item_category NOT NULL,
    item_description VARCHAR(255) NOT NULL,
    quantity_demanded INT NOT NULL,
    quantity_fulfilled INT DEFAULT 0,
    urgency_level VARCHAR(20) DEFAULT 'medium',
    active_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Society Drives & Community Collection Hubs
CREATE TABLE society_drives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_name VARCHAR(255) NOT NULL,
    rwa_contact_name VARCHAR(150) NOT NULL,
    rwa_phone VARCHAR(20) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    drive_start TIMESTAMPTZ NOT NULL,
    drive_end TIMESTAMPTZ NOT NULL,
    accepted_categories item_category[] NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Partner Handoff & Lead Transactions
CREATE TABLE lead_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES items(id),
    partner_id UUID REFERENCES partners(id),
    status VARCHAR(50) DEFAULT 'referred',
    quoted_price NUMERIC(10, 2),
    actual_paid_price NUMERIC(10, 2),
    partner_fee NUMERIC(10, 2) DEFAULT 0.00,
    digital_proof_urls JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Crowdsourced Price Calibration Logs
CREATE TABLE price_calibration_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    partner_id UUID NULL,
    city_id VARCHAR(50) DEFAULT 'nagpur',
    model_name VARCHAR(150) NOT NULL,
    fault_type VARCHAR(100) NOT NULL,
    part_grade VARCHAR(20) DEFAULT 'aftermarket',
    actual_amount_paid NUMERIC(10, 2) NOT NULL,
    source VARCHAR(50) DEFAULT 'user_survey',
    receipt_proof_url TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Payout Transactions (Instant Buy-Back & Direct UPI)
CREATE TABLE payout_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    item_id UUID REFERENCES items(id),
    amount NUMERIC(10, 2) NOT NULL,
    vpa_address VARCHAR(100) NOT NULL, -- UPI ID
    payout_status VARCHAR(50) DEFAULT 'initiated', -- initiated, processing, success, failed
    gateway_reference VARCHAR(150),
    utr_number VARCHAR(100),
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

-- 10. Partner Commission Invoices
CREATE TABLE commission_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID REFERENCES partners(id),
    billing_period VARCHAR(50) NOT NULL, -- e.g. "2026-11"
    total_leads_count INT DEFAULT 0,
    total_commission_due NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid, overdue
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

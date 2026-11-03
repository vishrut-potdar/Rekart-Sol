import pg from 'pg';
import { ENV } from '../config/env.js';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

// Calculate Haversine distance in meters between two lat/lon coordinates
export function calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

class MemoryStore {
  constructor() {
    this.users = new Map();
    this.items = new Map();
    this.triageSessions = new Map();
    this.priceBenchmarks = new Map();
    this.partners = new Map();
    this.partnerDemands = new Map();
    this.societyDrives = new Map();
    this.leadTransactions = new Map();
    this.calibrationLogs = [];
    this.payoutTransactions = new Map();
    this.commissionInvoices = new Map();
  }

  // Users & Auth
  async createUser(userData) {
    const id = userData.id || uuidv4();
    const user = {
      id,
      email: userData.email.toLowerCase().trim(),
      password_hash: userData.password_hash,
      full_name: userData.full_name,
      phone: userData.phone || null,
      role: userData.role || 'donor',
      partner_id: userData.partner_id || null,
      city: userData.city || 'Nagpur',
      is_active: userData.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.users.set(id, user);
    return user;
  }

  async findUserByEmail(email) {
    const target = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email === target) return u;
    }
    return null;
  }

  async findUserById(id) {
    return this.users.get(id) || null;
  }

  // Items
  async createItem(itemData) {
    const id = itemData.id || uuidv4();
    const item = {
      id,
      user_id: itemData.user_id || uuidv4(),
      parent_batch_id: itemData.parent_batch_id || null,
      category: itemData.category,
      brand: itemData.brand || null,
      model_name: itemData.model_name || null,
      provisional_grade: itemData.provisional_grade || null,
      final_grade: itemData.final_grade || null,
      bounding_box: itemData.bounding_box || null,
      raw_media_urls: itemData.raw_media_urls || [],
      metadata: itemData.metadata || {},
      status: itemData.status || 'draft',
      recommended_track: itemData.recommended_track || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.items.set(id, item);
    return item;
  }

  async getItem(id) {
    return this.items.get(id) || null;
  }

  async updateItem(id, updates) {
    const item = this.items.get(id);
    if (!item) return null;
    const updated = {
      ...item,
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.items.set(id, updated);
    return updated;
  }

  async listItemsByBatch(batchId) {
    return Array.from(this.items.values()).filter(item => item.parent_batch_id === batchId);
  }

  async listItemsByUser(userId) {
    return Array.from(this.items.values()).filter(item => item.user_id === userId);
  }

  // Triage Sessions
  async saveTriageSession(sessionData) {
    const id = sessionData.id || uuidv4();
    const session = {
      id,
      item_id: sessionData.item_id,
      language: sessionData.language || 'en',
      question_flow_id: sessionData.question_flow_id,
      answers_payload: sessionData.answers_payload || {},
      sensor_telemetry: sessionData.sensor_telemetry || {},
      detected_faults: sessionData.detected_faults || [],
      safety_score: sessionData.safety_score || 'BEGINNER_SAFE',
      completed_at: sessionData.completed_at || new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    this.triageSessions.set(sessionData.item_id, session);
    return session;
  }

  async getTriageSessionByItemId(itemId) {
    return this.triageSessions.get(itemId) || null;
  }

  // Price Benchmarks
  async addBenchmark(benchmark) {
    const id = benchmark.id || uuidv4();
    const key = `${benchmark.city_id || 'nagpur'}_${benchmark.model_name.toLowerCase()}_${benchmark.fault_type.toLowerCase()}_${benchmark.part_grade.toLowerCase()}`;
    const entry = { id, ...benchmark, key, last_updated_at: new Date().toISOString() };
    this.priceBenchmarks.set(key, entry);
    return entry;
  }

  async findBenchmark(cityId, modelName, faultType, partGrade = 'aftermarket') {
    const key = `${(cityId || 'nagpur').toLowerCase()}_${modelName.toLowerCase()}_${faultType.toLowerCase()}_${partGrade.toLowerCase()}`;
    if (this.priceBenchmarks.has(key)) {
      return this.priceBenchmarks.get(key);
    }
    for (const b of this.priceBenchmarks.values()) {
      if (
        b.city_id.toLowerCase() === (cityId || 'nagpur').toLowerCase() &&
        b.model_name.toLowerCase() === modelName.toLowerCase() &&
        b.fault_type.toLowerCase() === faultType.toLowerCase()
      ) {
        return b;
      }
    }
    return null;
  }

  async listBenchmarks() {
    return Array.from(this.priceBenchmarks.values());
  }

  // Partners
  async addPartner(partner) {
    const id = partner.id || uuidv4();
    const p = {
      id,
      name: partner.name,
      partner_type: partner.partner_type,
      address: partner.address,
      city: partner.city || 'Nagpur',
      is_verified: partner.is_verified ?? true,
      pickup_available: partner.pickup_available ?? false,
      accepted_categories: partner.accepted_categories || [],
      min_acceptance_grade: partner.min_acceptance_grade || 'C',
      operational_hours: partner.operational_hours || { open: '09:00', close: '20:00' },
      latitude: partner.latitude,
      longitude: partner.longitude,
      commission_rate: partner.commission_rate || 0.05,
      created_at: new Date().toISOString()
    };
    this.partners.set(id, p);
    return p;
  }

  async findNearbyPartners({ latitude, longitude, category, partnerType = null, maxDistanceMeters = 25000, limit = 10 }) {
    const results = [];
    for (const partner of this.partners.values()) {
      if (category && !partner.accepted_categories.includes(category)) {
        continue;
      }
      if (partnerType && partner.partner_type !== partnerType) {
        continue;
      }
      const distance = calculateHaversineDistanceMeters(
        latitude,
        longitude,
        partner.latitude,
        partner.longitude
      );
      if (distance <= maxDistanceMeters) {
        results.push({
          ...partner,
          distance_meters: distance,
          distance_km: parseFloat((distance / 1000).toFixed(2))
        });
      }
    }
    results.sort((a, b) => a.distance_meters - b.distance_meters);
    return results.slice(0, limit);
  }

  async getPartner(id) {
    return this.partners.get(id) || null;
  }

  async listPartners() {
    return Array.from(this.partners.values());
  }

  // Demands
  async addDemand(demand) {
    const id = demand.id || uuidv4();
    const d = {
      id,
      ...demand,
      quantity_fulfilled: demand.quantity_fulfilled || 0,
      created_at: new Date().toISOString()
    };
    this.partnerDemands.set(id, d);
    return d;
  }

  async getActiveDemands(category = null) {
    const now = new Date();
    return Array.from(this.partnerDemands.values()).filter(d => {
      const active = new Date(d.active_until) > now && d.quantity_fulfilled < d.quantity_demanded;
      if (category) return active && d.category === category;
      return active;
    });
  }

  // Society Drives
  async addSocietyDrive(drive) {
    const id = drive.id || uuidv4();
    const s = {
      id,
      ...drive,
      status: drive.status || 'scheduled',
      created_at: new Date().toISOString()
    };
    this.societyDrives.set(id, s);
    return s;
  }

  async listSocietyDrives(latitude, longitude, maxDistanceMeters = 15000) {
    const drives = [];
    for (const d of this.societyDrives.values()) {
      const distance = calculateHaversineDistanceMeters(latitude, longitude, d.latitude, d.longitude);
      if (distance <= maxDistanceMeters) {
        drives.push({
          ...d,
          distance_meters: distance,
          distance_km: parseFloat((distance / 1000).toFixed(2))
        });
      }
    }
    drives.sort((a, b) => a.distance_meters - b.distance_meters);
    return drives;
  }

  // Leads
  async createLead(leadData) {
    const id = leadData.id || uuidv4();
    const lead = {
      id,
      item_id: leadData.item_id,
      partner_id: leadData.partner_id,
      status: leadData.status || 'referred',
      quoted_price: leadData.quoted_price || null,
      actual_paid_price: leadData.actual_paid_price || null,
      partner_fee: leadData.partner_fee || 0,
      digital_proof_urls: leadData.digital_proof_urls || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.leadTransactions.set(id, lead);
    return lead;
  }

  async getLead(id) {
    return this.leadTransactions.get(id) || null;
  }

  async updateLead(id, updates) {
    const lead = this.leadTransactions.get(id);
    if (!lead) return null;
    const updated = {
      ...lead,
      ...updates,
      updated_at: new Date().toISOString()
    };
    this.leadTransactions.set(id, updated);
    return updated;
  }

  async listLeadsByPartner(partnerId) {
    return Array.from(this.leadTransactions.values()).filter(l => l.partner_id === partnerId);
  }

  // Calibration Logs
  async addCalibrationLog(log) {
    const id = uuidv4();
    const entry = { id, ...log, created_at: new Date().toISOString() };
    this.calibrationLogs.push(entry);
    return entry;
  }

  async getCalibrationLogs(modelName, faultType) {
    return this.calibrationLogs.filter(
      l => l.model_name.toLowerCase() === modelName.toLowerCase() &&
           l.fault_type.toLowerCase() === faultType.toLowerCase()
    );
  }

  // Payout Transactions
  async createPayout(payoutData) {
    const id = payoutData.id || uuidv4();
    const record = {
      id,
      user_id: payoutData.user_id,
      item_id: payoutData.item_id,
      amount: payoutData.amount,
      vpa_address: payoutData.vpa_address,
      payout_status: payoutData.payout_status || 'initiated',
      gateway_reference: payoutData.gateway_reference || `UPI-TXN-${Date.now()}`,
      utr_number: payoutData.utr_number || null,
      initiated_at: new Date().toISOString(),
      settled_at: payoutData.settled_at || null
    };
    this.payoutTransactions.set(id, record);
    return record;
  }

  async getPayout(id) {
    return this.payoutTransactions.get(id) || null;
  }

  async updatePayout(id, updates) {
    const record = this.payoutTransactions.get(id);
    if (!record) return null;
    const updated = { ...record, ...updates };
    this.payoutTransactions.set(id, updated);
    return updated;
  }

  // Commission Invoices
  async createInvoice(invoiceData) {
    const id = invoiceData.id || uuidv4();
    const inv = {
      id,
      partner_id: invoiceData.partner_id,
      billing_period: invoiceData.billing_period,
      total_leads_count: invoiceData.total_leads_count || 0,
      total_commission_due: invoiceData.total_commission_due || 0,
      status: invoiceData.status || 'pending',
      paid_at: null,
      created_at: new Date().toISOString()
    };
    this.commissionInvoices.set(id, inv);
    return inv;
  }

  async getInvoice(id) {
    return this.commissionInvoices.get(id) || null;
  }

  async updateInvoice(id, updates) {
    const inv = this.commissionInvoices.get(id);
    if (!inv) return null;
    const updated = { ...inv, ...updates };
    this.commissionInvoices.set(id, updated);
    return updated;
  }
}

export const db = new MemoryStore();
export const pgPool = ENV.USE_POSTGRES ? new Pool({ connectionString: ENV.DATABASE_URL }) : null;

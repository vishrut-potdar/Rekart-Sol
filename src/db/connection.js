import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ENV } from '../config/env.js';

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

// Convert JS object to Firestore REST Value format
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) return (val.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in val) {
    const out = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

class FirebaseSyncClient {
  constructor(config) {
    this.projectId = config.projectId;
    this.apiKey = config.apiKey;
    this.clientEmail = config.clientEmail;
    this.privateKey = config.privateKey;
    this.databaseUrl = config.databaseUrl;
    this._accessToken = null;
    this._tokenExpiry = 0;
    this._idToken = null;
    this._idTokenExpiry = 0;
  }

  get enabled() {
    return Boolean(this.projectId || this.databaseUrl);
  }

  get target() {
    if (this.databaseUrl) return 'rtdb';
    if (this.projectId) return 'firestore';
    return null;
  }

  get authMode() {
    if (this.clientEmail && this.privateKey) return 'service_account';
    if (this.apiKey) return 'web_api_key';
    return 'none';
  }

  async _getAccessToken() {
    if (!this.clientEmail || !this.privateKey) return null;
    const now = Math.floor(Date.now() / 1000);
    if (this._accessToken && now < this._tokenExpiry - 60) {
      return this._accessToken;
    }
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: this.clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(this.privateKey, 'base64url');
    const assertion = `${header}.${payload}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(assertion)}`,
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`Firebase OAuth error ${res.status}`);
    const data = await res.json();
    this._accessToken = data.access_token;
    this._tokenExpiry = now + (data.expires_in || 3600);
    return this._accessToken;
  }

  async _getAnonymousIdToken() {
    if (!this.apiKey || (this.clientEmail && this.privateKey)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (this._idToken && now < this._idTokenExpiry - 60) {
      return this._idToken;
    }
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnSecureToken: true }),
          signal: AbortSignal.timeout(5000)
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.idToken) return null;
      this._idToken = data.idToken;
      this._idTokenExpiry = now + Number(data.expiresIn || 3600);
      return this._idToken;
    } catch {
      return null;
    }
  }

  async _headers() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.target === 'firestore') {
      const token = await this._getAccessToken().catch(() => null);
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async _docUrl(collection, docId) {
    const encodedId = encodeURIComponent(String(docId).replace(/\//g, '_'));
    // Prefer Firebase Realtime Database when databaseUrl is set
    if (this.databaseUrl) {
      const base = `${this.databaseUrl.replace(/\/$/, '')}/${collection}/${encodedId}.json`;
      if (this.clientEmail && this.privateKey) {
        const token = await this._getAccessToken().catch(() => null);
        return token ? `${base}?access_token=${encodeURIComponent(token)}` : base;
      }
      const idToken = await this._getAnonymousIdToken().catch(() => null);
      return idToken ? `${base}?auth=${encodeURIComponent(idToken)}` : base;
    }
    if (this.projectId) {
      const base = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${collection}/${encodedId}`;
      return this.apiKey && !this.clientEmail ? `${base}?key=${encodeURIComponent(this.apiKey)}` : base;
    }
    return null;
  }

  async upsert(collection, docId, record) {
    if (!this.enabled || process.env.NODE_TEST_CONTEXT) return;
    try {
      const url = await this._docUrl(collection, docId);
      if (!url) return;
      const headers = await this._headers();
      if (this.target === 'rtdb') {
        const res = await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(record),
          signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) {
          throw new Error(`RTDB HTTP ${res.status}`);
        }
      } else if (this.projectId) {
        const fields = {};
        for (const [k, v] of Object.entries(record)) {
          if (v !== undefined) fields[k] = toFirestoreValue(v);
        }
        const res = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ fields }),
          signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) {
          throw new Error(`Firestore HTTP ${res.status}`);
        }
      }
    } catch (err) {
      if (!process.env.NODE_TEST_CONTEXT) {
        console.warn(`[FirebaseSync] Failed upsert ${collection}/${docId}:`, err.message);
      }
    }
  }

  async remove(collection, docId) {
    if (!this.enabled || process.env.NODE_TEST_CONTEXT) return;
    try {
      const url = await this._docUrl(collection, docId);
      if (!url) return;
      const headers = await this._headers();
      const res = await fetch(url, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (!process.env.NODE_TEST_CONTEXT) {
        console.warn(`[FirebaseSync] Failed delete ${collection}/${docId}:`, err.message);
      }
    }
  }

  async fetchRoot(collections) {
    if (!this.enabled || process.env.NODE_TEST_CONTEXT) return null;
    if (this.target === 'firestore') {
      if (!this.clientEmail || !this.privateKey) return null;
      try {
        const headers = await this._headers();
        if (!headers.Authorization) return null;
        const buckets = await Promise.all(collections.map(async collection => {
          const records = {};
          const base = await this._docUrl(collection, 'placeholder');
          const url = new URL(base.slice(0, -'/placeholder'.length));
          url.searchParams.set('pageSize', '100');
          let pageToken;
          do {
            if (pageToken) url.searchParams.set('pageToken', pageToken);
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error('Firestore list HTTP ' + res.status);
            const page = await res.json();
            for (const document of page.documents || []) {
              const id = document.name.split('/').at(-1);
              records[id] = fromFirestoreValue({ mapValue: { fields: document.fields || {} } });
            }
            pageToken = page.nextPageToken;
          } while (pageToken);
          return [collection, records];
        }));
        return Object.fromEntries(buckets);
      } catch (err) {
        console.warn('[FirebaseSync] Firestore hydration failed:', err.message);
        return null;
      }
    }
    if (!this.databaseUrl) return null;
    try {
      let url = `${this.databaseUrl.replace(/\/$/, '')}/.json`;
      if (this.clientEmail && this.privateKey) {
        const token = await this._getAccessToken().catch(() => null);
        if (token) url += `?access_token=${encodeURIComponent(token)}`;
      } else {
        const idToken = await this._getAnonymousIdToken().catch(() => null);
        if (idToken) url += `?auth=${encodeURIComponent(idToken)}`;
      }
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      if (!process.env.NODE_TEST_CONTEXT) {
        console.warn('[FirebaseSync] Cold-start hydration skipped:', err.message);
      }
      return null;
    }
  }
}

export class PersistentRepository {
  constructor(storagePath = null) {
    this.storagePath = storagePath || this._resolveStoragePath();
    this.firebase = new FirebaseSyncClient({
      projectId: ENV.FIREBASE_PROJECT_ID,
      apiKey: ENV.FIREBASE_API_KEY,
      clientEmail: ENV.FIREBASE_CLIENT_EMAIL,
      privateKey: ENV.FIREBASE_PRIVATE_KEY,
      databaseUrl: ENV.FIREBASE_DATABASE_URL
    });

    this._initCollections();
    this._loadFromDisk();
  }

  _resolveStoragePath() {
    if (process.env.NODE_TEST_CONTEXT && !process.env.DATA_FILE_PATH) {
      const testPath = path.join(os.tmpdir(), `rekart-test-db-${process.pid}-${crypto.randomUUID().slice(0, 8)}.json`);
      process.once('exit', () => {
        try { fs.unlinkSync(testPath); } catch {}
      });
      return testPath;
    }
    return path.resolve(ENV.DATA_FILE_PATH);
  }

  _initCollections() {
    this.users = new Map();
    this.items = new Map();
    this.triageSessions = new Map();
    this.decisions = new Map();
    this.priceBenchmarks = new Map();
    this.partners = new Map();
    this.partnerDemands = new Map();
    this.societyDrives = new Map();
    this.leadTransactions = new Map();
    this.calibrationLogs = [];
    this.payoutTransactions = new Map();
    this.commissionInvoices = new Map();
    this.pointBalances = new Map();
    this.pointLedger = [];
    this.vouchers = new Map();
    this.revokedTokens = new Map();
    this.aiQuotas = new Map();
    this.rateLimits = new Map();
  }

  _serialize() {
    return {
      schema_version: 2,
      updated_at: new Date().toISOString(),
      users: Array.from(this.users.entries()),
      items: Array.from(this.items.entries()),
      triageSessions: Array.from(this.triageSessions.entries()),
      decisions: Array.from(this.decisions.entries()),
      priceBenchmarks: Array.from(this.priceBenchmarks.entries()),
      partners: Array.from(this.partners.entries()),
      partnerDemands: Array.from(this.partnerDemands.entries()),
      societyDrives: Array.from(this.societyDrives.entries()),
      leadTransactions: Array.from(this.leadTransactions.entries()),
      calibrationLogs: this.calibrationLogs,
      payoutTransactions: Array.from(this.payoutTransactions.entries()),
      commissionInvoices: Array.from(this.commissionInvoices.entries()),
      pointBalances: Array.from(this.pointBalances.entries()),
      pointLedger: this.pointLedger,
      vouchers: Array.from(this.vouchers.entries()),
      revokedTokens: Array.from(this.revokedTokens.entries()),
      aiQuotas: Array.from(this.aiQuotas.entries())
    };
  }

  _hydrate(data) {
    this._initCollections();
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.users)) this.users = new Map(data.users);
    if (Array.isArray(data.items)) this.items = new Map(data.items);
    if (Array.isArray(data.triageSessions)) this.triageSessions = new Map(data.triageSessions);
    if (Array.isArray(data.decisions)) this.decisions = new Map(data.decisions);
    if (Array.isArray(data.priceBenchmarks)) this.priceBenchmarks = new Map(data.priceBenchmarks);
    if (Array.isArray(data.partners)) this.partners = new Map(data.partners);
    if (Array.isArray(data.partnerDemands)) this.partnerDemands = new Map(data.partnerDemands);
    if (Array.isArray(data.societyDrives)) this.societyDrives = new Map(data.societyDrives);
    if (Array.isArray(data.leadTransactions)) this.leadTransactions = new Map(data.leadTransactions);
    if (Array.isArray(data.calibrationLogs)) this.calibrationLogs = data.calibrationLogs;
    if (Array.isArray(data.payoutTransactions)) this.payoutTransactions = new Map(data.payoutTransactions);
    if (Array.isArray(data.commissionInvoices)) this.commissionInvoices = new Map(data.commissionInvoices);
    if (Array.isArray(data.pointBalances)) this.pointBalances = new Map(data.pointBalances);
    if (Array.isArray(data.pointLedger)) this.pointLedger = data.pointLedger;
    if (Array.isArray(data.vouchers)) this.vouchers = new Map(data.vouchers);
    if (Array.isArray(data.revokedTokens)) this.revokedTokens = new Map(data.revokedTokens);
    if (Array.isArray(data.aiQuotas)) this.aiQuotas = new Map(data.aiQuotas);
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(this.storagePath)) return;
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      if (!raw.trim()) return;
      this._hydrate(JSON.parse(raw));
    } catch (err) {
      console.warn('[PersistentRepository] Could not load persisted store:', err.message);
    }
  }

  _persist() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.storagePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this._serialize(), null, 2), 'utf8');
      fs.renameSync(tmpPath, this.storagePath);
    } catch (err) {
      console.warn('[PersistentRepository] Disk persist failed:', err.message);
    }
  }

  reloadFromDisk() {
    this._loadFromDisk();
    return this.getPersistenceStatus();
  }

  async hydrateFromFirebase() {
    if (!this.firebase.enabled || this._hydratedFromFirebase || process.env.NODE_TEST_CONTEXT) {
      return false;
    }
    this._hydratedFromFirebase = true;
    const root = await this.firebase.fetchRoot([
      'users', 'items', 'decisions', 'partners', 'partner_demands', 'society_drives',
      'price_benchmarks', 'point_balances', 'vouchers'
    ]);
    if (!root || typeof root !== 'object') return false;

    const mergeMap = (collectionName, targetMap) => {
      const bucket = root[collectionName];
      if (!bucket || typeof bucket !== 'object') return;
      for (const [k, record] of Object.entries(bucket)) {
        if (record && typeof record === 'object' && !targetMap.has(k)) {
          targetMap.set(k, record);
        }
      }
    };

    mergeMap('users', this.users);
    mergeMap('items', this.items);
    for (const record of Object.values(root.decisions || {})) {
      if (!record?.item_id) continue;
      const existing = this.decisions.get(record.item_id);
      if (!existing || String(existing.updated_at || '') < String(record.updated_at || '')) {
        this.decisions.set(record.item_id, record);
      }
    }
    mergeMap('partners', this.partners);
    mergeMap('partner_demands', this.partnerDemands);
    mergeMap('society_drives', this.societyDrives);
    mergeMap('price_benchmarks', this.priceBenchmarks);
    mergeMap('point_balances', this.pointBalances);
    mergeMap('vouchers', this.vouchers);

    this._persist();
    return true;
  }

  getStoragePath() {
    return this.storagePath;
  }

  getPersistenceStatus() {
    const persistedRows =
      this.users.size +
      this.items.size +
      this.triageSessions.size +
      this.decisions.size +
      this.priceBenchmarks.size +
      this.partners.size +
      this.partnerDemands.size +
      this.societyDrives.size +
      this.leadTransactions.size +
      this.calibrationLogs.length +
      this.payoutTransactions.size +
      this.commissionInvoices.size +
      this.pointLedger.length +
      this.vouchers.size;

    const engine = this.firebase.enabled
      ? 'firebase+file'
      : ENV.USE_POSTGRES
        ? 'postgres'
        : 'file';

    return {
      engine,
      is_persistent: true,
      firebase_configured: this.firebase.enabled,
      firebase_target: this.firebase.target,
      firebase_auth_mode: this.firebase.authMode,
      persisted_rows: persistedRows
    };
  }

  _syncFirebase(collection, id, record) {
    if (this.firebase.enabled) {
      return this.firebase.upsert(collection, id, record);
    }
  }

  _deleteFirebase(collection, id) {
    if (this.firebase.enabled) {
      void this.firebase.remove(collection, id);
    }
  }

  // Circular points & Ledger
  async getPoints(userId) {
    return this.pointBalances.get(userId) || 0;
  }

  async addPoints(userId, delta) {
    const balance = (await this.getPoints(userId)) + delta;
    this.pointBalances.set(userId, balance);
    this._persist();
    this._syncFirebase('point_balances', userId, { user_id: userId, balance, updated_at: new Date().toISOString() });
    return balance;
  }

  async recordPointLedger(entry) {
    this.pointLedger.push(entry);
    this._persist();
    this._syncFirebase('point_ledger', entry.id, entry);
    return entry;
  }

  async getPointLedger(userId) {
    return this.pointLedger.filter(e => e.user_id === userId);
  }

  async findPointAward(userId, actionType, referenceId) {
    if (!referenceId) return null;
    return this.pointLedger.find(
      e => e.user_id === userId && e.type === 'earned' && e.action_type === actionType && e.reference_id === referenceId
    ) || null;
  }

  // Vouchers
  async createVoucher(voucherData) {
    this.vouchers.set(voucherData.voucher_code, voucherData);
    this._persist();
    this._syncFirebase('vouchers', voucherData.voucher_code, voucherData);
    return voucherData;
  }

  async getVoucher(code) {
    return this.vouchers.get(code) || null;
  }

  async redeemVoucher(code, partnerId) {
    const voucher = this.vouchers.get(code);
    if (!voucher) return null;
    const updated = {
      ...voucher,
      status: 'redeemed',
      redeemed_at: new Date().toISOString(),
      redeemed_by_partner_id: partnerId
    };
    this.vouchers.set(code, updated);
    this._persist();
    this._syncFirebase('vouchers', code, updated);
    return updated;
  }

  // Users & Auth
  async createUser(userData) {
    const id = userData.id || crypto.randomUUID();
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
      created_at: userData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.users.set(id, user);
    this._persist();
    // Password hashes may only be stored behind service-account-only access.
    await this._syncFirebase('users', id, {
      ...user,
      password_hash: this.firebase.target === 'firestore' && this.firebase.authMode === 'service_account'
        ? user.password_hash : undefined
    });
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

  async revokeToken(jti, expiresAtIso = null) {
    if (!jti) return;
    const exp = expiresAtIso || new Date(Date.now() + 7 * 86400000).toISOString();
    this.revokedTokens.set(jti, exp);
    this._persist();
    this._syncFirebase('revoked_tokens', jti, { jti, expires_at: exp });
  }

  async isTokenRevoked(jti) {
    if (!jti) return false;
    return this.revokedTokens.has(jti);
  }

  // Items
  async createItem(itemData) {
    const id = itemData.id || crypto.randomUUID();
    const item = {
      id,
      user_id: itemData.user_id || crypto.randomUUID(),
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
      server_valuation_inr: itemData.server_valuation_inr ?? null,
      created_at: itemData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.items.set(id, item);
    this._persist();
    await this._syncFirebase('items', id, item);
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
    this._persist();
    await this._syncFirebase('items', id, updated);
    return updated;
  }

  async listItemsByBatch(batchId) {
    return Array.from(this.items.values()).filter(item => item.parent_batch_id === batchId);
  }

  async listItemsByUser(userId) {
    return Array.from(this.items.values()).filter(item => item.user_id === userId);
  }

  // Decisions (C1 & C2)
  async saveDecision(decisionData) {
    const id = decisionData.decision_id || crypto.randomUUID();
    const record = {
      ...decisionData,
      decision_id: id,
      created_at: decisionData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.decisions.set(record.item_id || id, record);
    this._persist();
    await this._syncFirebase('decisions', id, record);
    return record;
  }

  async getDecisionByItemId(itemId) {
    return this.decisions.get(itemId) || null;
  }

  async listDecisionsByUser(userId) {
    return Array.from(this.decisions.values()).filter(d => d.user_id === userId);
  }

  // Triage Sessions
  async saveTriageSession(sessionData) {
    const id = sessionData.id || crypto.randomUUID();
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
      created_at: sessionData.created_at || new Date().toISOString()
    };
    this.triageSessions.set(sessionData.item_id, session);
    this._persist();
    this._syncFirebase('triage_sessions', id, session);
    return session;
  }

  async getTriageSessionByItemId(itemId) {
    return this.triageSessions.get(itemId) || null;
  }

  // Price Benchmarks
  async addBenchmark(benchmark) {
    const id = benchmark.id || crypto.randomUUID();
    const key = `${benchmark.city_id || 'nagpur'}_${benchmark.model_name.toLowerCase()}_${benchmark.fault_type.toLowerCase()}_${benchmark.part_grade.toLowerCase()}`;
    const entry = { id, ...benchmark, key, last_updated_at: new Date().toISOString() };
    this.priceBenchmarks.set(key, entry);
    this._persist();
    this._syncFirebase('price_benchmarks', key, entry);
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
    const id = partner.id || crypto.randomUUID();
    const p = {
      id,
      name: partner.name,
      partner_type: partner.partner_type,
      address: partner.address,
      city: partner.city || 'Nagpur',
      is_verified: partner.is_verified ?? false,
      is_sample: partner.is_sample ?? false,
      sample_notice: partner.sample_notice || null,
      verified_on: partner.verified_on || null,
      pickup_available: partner.pickup_available ?? false,
      accepted_categories: partner.accepted_categories || [],
      min_acceptance_grade: partner.min_acceptance_grade || 'C',
      // null = hours not published; only default when the field is absent
      operational_hours: partner.operational_hours !== undefined ? partner.operational_hours : { open: '09:00', close: '20:00' },
      latitude: partner.latitude,
      longitude: partner.longitude,
      coords_approx: Boolean(partner.coords_approx),
      phone: partner.phone || null,
      notes: partner.notes || null,
      source: partner.source || null,
      commission_rate: partner.commission_rate || 0.05,
      created_at: partner.created_at || new Date().toISOString()
    };
    this.partners.set(id, p);
    this._persist();
    this._syncFirebase('partners', id, p);
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
    const id = demand.id || crypto.randomUUID();
    const d = {
      id,
      ...demand,
      quantity_fulfilled: demand.quantity_fulfilled || 0,
      created_at: demand.created_at || new Date().toISOString()
    };
    this.partnerDemands.set(id, d);
    this._persist();
    this._syncFirebase('partner_demands', id, d);
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
    const id = drive.id || crypto.randomUUID();
    const s = {
      id,
      ...drive,
      status: drive.status || 'scheduled',
      created_at: drive.created_at || new Date().toISOString()
    };
    this.societyDrives.set(id, s);
    this._persist();
    this._syncFirebase('society_drives', id, s);
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
    const id = leadData.id || crypto.randomUUID();
    const lead = {
      id,
      item_id: leadData.item_id,
      partner_id: leadData.partner_id,
      status: leadData.status || 'referred',
      quoted_price: leadData.quoted_price || null,
      actual_paid_price: leadData.actual_paid_price || null,
      partner_fee: leadData.partner_fee || 0,
      digital_proof_urls: leadData.digital_proof_urls || [],
      created_at: leadData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.leadTransactions.set(id, lead);
    this._persist();
    this._syncFirebase('lead_transactions', id, lead);
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
    this._persist();
    this._syncFirebase('lead_transactions', id, updated);
    return updated;
  }

  async listLeadsByPartner(partnerId) {
    return Array.from(this.leadTransactions.values()).filter(l => l.partner_id === partnerId);
  }

  // Calibration Logs
  async addCalibrationLog(log) {
    const id = crypto.randomUUID();
    const entry = { id, ...log, created_at: new Date().toISOString() };
    this.calibrationLogs.push(entry);
    this._persist();
    this._syncFirebase('calibration_logs', id, entry);
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
    const id = payoutData.id || crypto.randomUUID();
    const record = {
      id,
      user_id: payoutData.user_id,
      item_id: payoutData.item_id,
      amount: payoutData.amount,
      vpa_address: payoutData.vpa_address,
      idempotency_key: payoutData.idempotency_key || null,
      payout_status: payoutData.payout_status || 'pending_gateway_confirmation',
      simulated: Boolean(payoutData.simulated),
      gateway_reference: payoutData.gateway_reference || `UPI-TXN-${Date.now()}`,
      utr_number: payoutData.utr_number || null,
      initiated_at: payoutData.initiated_at || new Date().toISOString(),
      settled_at: payoutData.settled_at || null
    };
    this.payoutTransactions.set(id, record);
    this._persist();
    this._syncFirebase('payout_transactions', id, record);
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
    this._persist();
    this._syncFirebase('payout_transactions', id, updated);
    return updated;
  }

  async findPayoutByIdempotencyKey(key) {
    if (!key) return null;
    for (const p of this.payoutTransactions.values()) {
      if (p.idempotency_key === key) return p;
    }
    return null;
  }

  async findCompletedPayoutByItem(itemId) {
    for (const p of this.payoutTransactions.values()) {
      if (p.item_id === itemId && p.payout_status !== 'failed') return p;
    }
    return null;
  }

  // Commission Invoices
  async createInvoice(invoiceData) {
    const id = invoiceData.id || crypto.randomUUID();
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
    this._persist();
    this._syncFirebase('commission_invoices', id, inv);
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
    this._persist();
    this._syncFirebase('commission_invoices', id, updated);
    return updated;
  }

  // Quotas & Rate Limits
  async checkAndIncrementAiQuota(userId, dailyLimit = ENV.DAILY_AI_QUOTA_PER_USER) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${userId}:${today}`;
    const current = this.aiQuotas.get(key) || 0;
    if (current >= dailyLimit) {
      return { allowed: false, used: current, limit: dailyLimit };
    }
    this.aiQuotas.set(key, current + 1);
    this._persist();
    return { allowed: true, used: current + 1, limit: dailyLimit };
  }

  checkRateLimitSync(key, windowMs, max) {
    const now = Date.now();
    if (this.rateLimits.size > 10000) {
      for (const [k, h] of this.rateLimits) {
        if (h.resetAt <= now) this.rateLimits.delete(k);
      }
    }
    let h = this.rateLimits.get(key);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + windowMs };
      this.rateLimits.set(key, h);
    }
    h.count += 1;
    if (h.count > max) {
      return { allowed: false, retryAfter: Math.ceil((h.resetAt - now) / 1000) };
    }
    return { allowed: true, retryAfter: 0 };
  }

  // DPDP Data Export & Delete
  async exportUserData(userId) {
    const user = this.users.get(userId) || null;
    const safeUser = user ? (({ password_hash, ...rest }) => rest)(user) : null;
    const items = await this.listItemsByUser(userId);
    const itemIds = new Set(items.map(i => i.id));
    const decisions = Array.from(this.decisions.values()).filter(d => d.user_id === userId || itemIds.has(d.item_id));
    const triageSessions = Array.from(this.triageSessions.values()).filter(t => itemIds.has(t.item_id));
    const pointLedger = await this.getPointLedger(userId);
    const vouchers = Array.from(this.vouchers.values()).filter(v => v.user_id === userId);
    return {
      exported_at: new Date().toISOString(),
      user: safeUser,
      items,
      decisions,
      triage_sessions: triageSessions,
      points_balance: await this.getPoints(userId),
      point_ledger: pointLedger,
      vouchers
    };
  }

  async deleteUserData(userId) {
    const mediaKeys = [];
    let deletedItems = 0;
    let deletedDecisions = 0;
    let deletedTriage = 0;
    let deletedPayouts = 0;
    let deletedVouchers = 0;

    for (const [id, item] of this.items.entries()) {
      if (item.user_id === userId) {
        for (const url of item.raw_media_urls || []) {
          if (typeof url === 'string' && url.startsWith('/uploads/')) {
            mediaKeys.push(path.basename(url));
          }
        }
        if (this.decisions.delete(id)) {
          deletedDecisions += 1;
          this._deleteFirebase('decisions', id);
        }
        if (this.triageSessions.delete(id)) {
          deletedTriage += 1;
        }
        this.items.delete(id);
        this._deleteFirebase('items', id);
        deletedItems += 1;
      }
    }

    for (const [key, dec] of this.decisions.entries()) {
      if (dec.user_id === userId) {
        this.decisions.delete(key);
        this._deleteFirebase('decisions', dec.decision_id || key);
        deletedDecisions += 1;
      }
    }

    for (const [id, payout] of this.payoutTransactions.entries()) {
      if (payout.user_id === userId) {
        this.payoutTransactions.delete(id);
        deletedPayouts += 1;
      }
    }

    for (const [code, voucher] of this.vouchers.entries()) {
      if (voucher.user_id === userId) {
        this.vouchers.delete(code);
        deletedVouchers += 1;
      }
    }

    const beforeLedger = this.pointLedger.length;
    this.pointLedger = this.pointLedger.filter(e => e.user_id !== userId);
    const deletedPointLedger = beforeLedger - this.pointLedger.length;
    this.pointBalances.delete(userId);

    const userDeleted = this.users.delete(userId);
    if (userDeleted) this._deleteFirebase('users', userId);

    this._persist();

    return {
      user_deleted: userDeleted,
      deleted_items: deletedItems,
      deleted_decisions: deletedDecisions,
      deleted_triage_sessions: deletedTriage,
      deleted_payouts: deletedPayouts,
      deleted_vouchers: deletedVouchers,
      deleted_point_ledger: deletedPointLedger,
      media_keys: mediaKeys
    };
  }
}

export const db = new PersistentRepository();
export const pgPool = ENV.USE_POSTGRES ? new Pool({ connectionString: ENV.DATABASE_URL }) : null;

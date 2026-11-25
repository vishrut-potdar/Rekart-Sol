import { db } from './connection.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NGO_DIR_PATH = path.resolve(__dirname, '../data/ngo_directory.json');

export async function seedNagpurData() {
  // 0. Seed Demo Accounts
  // The dev password is published in this repo, so production only gets demo accounts (admin included)
  // when SEED_DEMO_PASSWORD is set.
  const demoPassword = ENV.IS_PRODUCTION ? ENV.SEED_DEMO_PASSWORD : 'Rekart@123';
  const passwordHash = demoPassword ? await bcrypt.hash(demoPassword, await bcrypt.genSalt(10)) : null;

  const users = !passwordHash ? [] : [
    {
      id: 'u-admin-001',
      email: 'admin@rekart.in',
      password_hash: passwordHash,
      full_name: 'Rekart Central Admin',
      role: 'admin',
      city: 'Nagpur'
    },
    {
      id: 'u-partner-001',
      email: 'tech.sitabuldi@rekart.in',
      password_hash: passwordHash,
      full_name: 'Rakesh Verma (Senior Tech)',
      role: 'partner_technician',
      partner_id: 'p-rep-001',
      city: 'Nagpur'
    },
    {
      id: 'u-ngo-001',
      email: 'coordinator@goonjnagpur.org',
      password_hash: passwordHash,
      full_name: 'Ananya Sen (NGO Coordinator)',
      role: 'ngo_coordinator',
      partner_id: 'p-ngo-001',
      city: 'Nagpur'
    },
    {
      id: 'u-donor-001',
      email: 'donor@gmail.com',
      password_hash: passwordHash,
      full_name: 'Pooja Kulkarni',
      role: 'donor',
      city: 'Nagpur'
    }
  ];

  for (const u of users) {
    const existing = await db.findUserByEmail(u.email);
    if (!existing) {
      await db.createUser(u);
    }
  }

  const ngoDir = JSON.parse(fs.readFileSync(NGO_DIR_PATH, 'utf8'));

  // 1. Seed Partners in Nagpur from modular src/data/ngo_directory.json
  const partners = ngoDir.partners || [];
  for (const p of partners) {
    await db.addPartner(p);
  }

  // 2. Seed Real-time NGO Demands
  const demands = (ngoDir.active_demands || []).map(d => ({
    id: d.id,
    partner_id: d.partner_id,
    partner_name: d.partner_name,
    category: d.category,
    item_description: d.item_description,
    quantity_demanded: d.quantity_demanded,
    quantity_fulfilled: d.quantity_fulfilled || 0,
    urgency_level: d.urgency_level || 'medium',
    source_label: d.source_label || null,
    active_until: d.active_until || new Date(Date.now() + (d.days_valid || 30) * 24 * 60 * 60 * 1000).toISOString()
  }));

  for (const d of demands) {
    await db.addDemand(d);
  }

  // 3. Seed NGO Gatherings & Society Drives
  const drives = (ngoDir.gatherings_and_drives || []).map(dr => ({
    id: dr.id,
    title: dr.title || dr.society_name,
    society_name: dr.society_name || dr.title,
    organizer: dr.organizer || dr.society_name,
    ngo_partner_id: dr.ngo_partner_id || null,
    venue: dr.venue || dr.area || 'Nagpur',
    area: dr.area || 'Nagpur',
    rwa_contact_name: dr.rwa_contact_name || dr.contact_name || 'Coordinator',
    rwa_phone: dr.rwa_phone || dr.contact_phone || '',
    latitude: dr.latitude,
    longitude: dr.longitude,
    drive_start: dr.drive_start || new Date(Date.now() + (dr.start_offset_days || 2) * 24 * 60 * 60 * 1000).toISOString(),
    drive_end: dr.drive_end || new Date(Date.now() + (dr.end_offset_days || 5) * 24 * 60 * 60 * 1000).toISOString(),
    timings: dr.timings || '10:00 AM – 5:00 PM',
    accepted_categories: dr.accepted_categories || ['apparel'],
    notes: dr.notes || '',
    is_sample: dr.is_sample ?? true,
    status: dr.status || 'scheduled'
  }));

  for (const dr of drives) {
    await db.addSocietyDrive(dr);
  }

  // 4. Seed Nagpur Price Benchmarks
  const benchmarks = [
    {
      city_id: 'nagpur',
      category: 'electronics',
      brand: 'Apple',
      model_name: 'iPhone 13',
      fault_type: 'Screen Replacement',
      part_grade: 'aftermarket',
      p25_price: 3800,
      p50_median_price: 4500,
      p75_price: 5200,
      sample_count: 42
    },
    {
      city_id: 'nagpur',
      category: 'electronics',
      brand: 'Apple',
      model_name: 'iPhone 13',
      fault_type: 'Screen Replacement',
      part_grade: 'OEM',
      p25_price: 9000,
      p50_median_price: 11000,
      p75_price: 13500,
      sample_count: 28
    },
    {
      city_id: 'nagpur',
      category: 'electronics',
      brand: 'Apple',
      model_name: 'iPhone 13',
      fault_type: 'Battery Replacement',
      part_grade: 'aftermarket',
      p25_price: 1800,
      p50_median_price: 2200,
      p75_price: 2600,
      sample_count: 55
    },
    {
      city_id: 'nagpur',
      category: 'electronics',
      brand: 'Samsung',
      model_name: 'Galaxy S21',
      fault_type: 'Screen Replacement',
      part_grade: 'aftermarket',
      p25_price: 4200,
      p50_median_price: 4800,
      p75_price: 5600,
      sample_count: 36
    },
    {
      city_id: 'nagpur',
      category: 'electronics',
      brand: 'Samsung',
      model_name: 'Galaxy S21',
      fault_type: 'Battery Replacement',
      part_grade: 'aftermarket',
      p25_price: 1400,
      p50_median_price: 1750,
      p75_price: 2100,
      sample_count: 61
    },
    {
      city_id: 'nagpur',
      category: 'electronics',
      brand: 'Xiaomi',
      model_name: 'Xiaomi Redmi Note 10',
      fault_type: 'Screen Replacement',
      part_grade: 'aftermarket',
      p25_price: 1400,
      p50_median_price: 1950,
      p75_price: 2600,
      sample_count: 14,
      provenance: {
        is_estimate: true,
        source: 'Sample Sitabuldi aftermarket display quote band (Redmi Note 10)',
        as_of: '2026-11-03',
        resale_working_inr: 7200,
        resale_source: 'Sample Nagpur refurbished/P2P baseline'
      }
    },
    {
      city_id: 'nagpur',
      category: 'electronics',
      brand: 'Xiaomi',
      model_name: 'Redmi Note 11',
      fault_type: 'Charging Port Replacement',
      part_grade: 'aftermarket',
      p25_price: 450,
      p50_median_price: 600,
      p75_price: 800,
      sample_count: 88
    },
    {
      city_id: 'nagpur',
      category: 'electronics',
      brand: 'Dell',
      model_name: 'Inspiron 15',
      fault_type: 'Keyboard Replacement',
      part_grade: 'aftermarket',
      p25_price: 1100,
      p50_median_price: 1400,
      p75_price: 1750,
      sample_count: 32
    },
    {
      city_id: 'nagpur',
      category: 'appliance',
      brand: 'LG',
      model_name: 'Top Load 6.5kg',
      fault_type: 'Motor Capacitor / Bearing',
      part_grade: 'OEM',
      p25_price: 1200,
      p50_median_price: 1600,
      p75_price: 2100,
      sample_count: 19
    },
    // Sample items shown in the design frontend (design/rekart-final.html).
    // sample_count = number of real Nagpur quotes logged (0 until /partner/calibrate-price collects them).
    // `provenance` records where each figure came from; is_estimate=true means no public source was found.
    {
      city_id: 'nagpur', category: 'electronics', brand: 'Sony', model_name: 'Sony WH-1000XM4', fault_type: 'Battery Replacement', part_grade: 'aftermarket',
      p25_price: 650, p50_median_price: 850, p75_price: 1050, sample_count: 0,
      provenance: {
        is_estimate: true,
        source: 'Rekart estimate (no public India battery-swap quotes for WH-1000XM4)',
        as_of: '2026-11-03',
        resale_working_inr: 11489,
        resale_source: 'Amazon Renewed all-time low (30-day avg ₹15,883)',
        resale_source_url: 'https://pricehistoryapp.com/product/renewed-sony-wh-1000xm4-industry-leading-wireless-noise-cancelling-bluetooth-headphones-with-mic-for-phone-calls-30-hours-battery-life-quick-charg'
      }
    },
    {
      city_id: 'nagpur', category: 'apparel', brand: 'Generic', model_name: 'Winter denim jacket', fault_type: 'Zip & Lining Repair', part_grade: 'aftermarket',
      p25_price: 150, p50_median_price: 250, p75_price: 350, sample_count: 0,
      provenance: { is_estimate: true, source: 'Rekart estimate (no public INR tailor rate card found)', as_of: '2026-11-03' }
    },
    {
      city_id: 'nagpur', category: 'appliance', brand: 'Bajaj', model_name: 'Bajaj mixer grinder', fault_type: 'Motor Capacitor / Bearing', part_grade: 'aftermarket',
      p25_price: 300, p50_median_price: 450, p75_price: 700, sample_count: 0,
      provenance: {
        is_estimate: false,
        source: 'Urban Company mixer grinder repair, starts at ₹210 (Pune); Hyderabad vendor listings ₹300–1,000',
        source_url: 'https://urbancompany.com/pune-electricians-handewadi',
        as_of: '2026-11-03',
        new_price_inr: 3499,
        new_price_source: 'Bajaj Rex 750W on Smartprix (range ₹2,944–₹6,100)',
        new_price_source_url: 'https://www.smartprix.com/mixer_juicer_grinders/bajaj-brand'
      }
    },
    {
      city_id: 'nagpur', category: 'furniture', brand: 'Generic', model_name: 'Wooden desk chair', fault_type: 'Joint Re-gluing', part_grade: 'aftermarket',
      p25_price: 100, p50_median_price: 300, p75_price: 600, sample_count: 0,
      provenance: {
        is_estimate: false,
        source: 'Urban Company wooden chair repair, starts at ₹49–99 (Delhi/Pune/Bengaluru); user-reported ₹600–800 final bill',
        source_url: 'https://www.urbancompany.com/pune-carpenters',
        as_of: '2026-11-03'
      }
    }
  ];

  for (const b of benchmarks) {
    await db.addBenchmark(b);
  }

  return {
    users_seeded: users.length,
    partners_seeded: partners.length,
    demands_seeded: demands.length,
    drives_seeded: drives.length,
    benchmarks_seeded: benchmarks.length
  };
}

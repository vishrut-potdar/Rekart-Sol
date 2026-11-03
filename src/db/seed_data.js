import { db } from './connection.js';
import bcrypt from 'bcryptjs';

export async function seedNagpurData() {
  // 0. Seed Demo Accounts
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Rekart@123', salt);

  const users = [
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

  // 1. Seed Partners in Nagpur
  const partners = [
    {
      id: 'p-cpcb-001',
      name: 'Vidarbha Clean-Earth CPCB Recycler',
      partner_type: 'cpcb_recycler',
      address: 'Plot 42, MIDC Hingna Industrial Area, Nagpur, Maharashtra 440028',
      city: 'Nagpur',
      latitude: 21.0965,
      longitude: 78.9834,
      is_verified: true,
      pickup_available: true,
      accepted_categories: ['electronics', 'appliance', 'scrap_metal'],
      min_acceptance_grade: 'BER',
      operational_hours: { open: '09:00', close: '18:00' },
      commission_rate: 0.08
    },
    {
      id: 'p-cpcb-002',
      name: 'Nagpur Green E-Waste Solutions',
      partner_type: 'cpcb_recycler',
      address: 'Near Octroi Naka, Wadi Bypass Road, Nagpur, Maharashtra 440023',
      city: 'Nagpur',
      latitude: 21.1492,
      longitude: 79.0011,
      is_verified: true,
      pickup_available: true,
      accepted_categories: ['electronics', 'appliance'],
      min_acceptance_grade: 'C',
      operational_hours: { open: '09:30', close: '18:30' },
      commission_rate: 0.075
    },
    {
      id: 'p-rep-001',
      name: 'Sitabuldi ProTech Device Hub',
      partner_type: 'repair_shop',
      address: 'Shop 14, Modi No. 2, Sitabuldi Main Road, Nagpur, Maharashtra 440012',
      city: 'Nagpur',
      latitude: 21.1449,
      longitude: 79.0833,
      is_verified: true,
      pickup_available: false,
      accepted_categories: ['electronics'],
      min_acceptance_grade: 'C',
      operational_hours: { open: '10:30', close: '21:00' },
      commission_rate: 0.10
    },
    {
      id: 'p-rep-002',
      name: 'Dharampeth Laptop & Appliance Lab',
      partner_type: 'repair_shop',
      address: 'West High Court Road, Opposite Coffee House, Dharampeth, Nagpur, Maharashtra 440010',
      city: 'Nagpur',
      latitude: 21.1425,
      longitude: 79.0620,
      is_verified: true,
      pickup_available: true,
      accepted_categories: ['electronics', 'appliance'],
      min_acceptance_grade: 'B',
      operational_hours: { open: '10:00', close: '20:30' },
      commission_rate: 0.10
    },
    {
      id: 'p-ngo-001',
      name: 'Goonj Collection & Care Hub Nagpur',
      partner_type: 'ngo',
      address: 'Civil Lines, Near High Court Square, Nagpur, Maharashtra 440001',
      city: 'Nagpur',
      latitude: 21.1558,
      longitude: 79.0754,
      is_verified: true,
      pickup_available: true,
      accepted_categories: ['apparel', 'books', 'furniture', 'kitchenware'],
      min_acceptance_grade: 'B',
      operational_hours: { open: '10:00', close: '17:30' },
      commission_rate: 0.00
    },
    {
      id: 'p-ngo-002',
      name: 'Rotary Seva Kendra - Wardha Road',
      partner_type: 'ngo',
      address: 'Near Chhatrapati Square, Wardha Road, Nagpur, Maharashtra 440015',
      city: 'Nagpur',
      latitude: 21.1118,
      longitude: 79.0652,
      is_verified: true,
      pickup_available: false,
      accepted_categories: ['apparel', 'books', 'electronics'],
      min_acceptance_grade: 'A',
      operational_hours: { open: '09:00', close: '17:00' },
      commission_rate: 0.00
    },
    {
      id: 'p-scrap-001',
      name: 'Itwari Metal & Textile Scrap Syndicate',
      partner_type: 'kabadiwala',
      address: 'Bhandara Road, Itwari Grain Market, Nagpur, Maharashtra 440002',
      city: 'Nagpur',
      latitude: 21.1539,
      longitude: 79.1126,
      is_verified: true,
      pickup_available: true,
      accepted_categories: ['scrap_metal', 'apparel', 'appliance'],
      min_acceptance_grade: 'BER',
      operational_hours: { open: '08:00', close: '19:00' },
      commission_rate: 0.05
    },
    {
      id: 'p-drop-001',
      name: 'Reliance Digital E-Waste Drop Box',
      partner_type: 'brand_dropbox',
      address: 'Eternity Mall, Variety Square, Sitabuldi, Nagpur, Maharashtra 440012',
      city: 'Nagpur',
      latitude: 21.1443,
      longitude: 79.0818,
      is_verified: true,
      pickup_available: false,
      accepted_categories: ['electronics'],
      min_acceptance_grade: 'BER',
      operational_hours: { open: '11:00', close: '21:30' },
      commission_rate: 0.00
    }
  ];

  for (const p of partners) {
    await db.addPartner(p);
  }

  // 2. Seed Real-time NGO Demands
  const demands = [
    {
      partner_id: 'p-ngo-001',
      category: 'apparel',
      item_description: 'Winter woolens, jackets, and clean blankets for rural shelters',
      quantity_demanded: 120,
      quantity_fulfilled: 35,
      urgency_level: 'high',
      active_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      partner_id: 'p-ngo-002',
      category: 'books',
      item_description: 'Class 8-10 State Board & CBSE textbooks for community library',
      quantity_demanded: 80,
      quantity_fulfilled: 12,
      urgency_level: 'medium',
      active_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  for (const d of demands) {
    await db.addDemand(d);
  }

  // 3. Seed Society Drives
  const drives = [
    {
      society_name: 'Empress City Towers RWA',
      rwa_contact_name: 'Rajesh Sharma',
      rwa_phone: '+91-9823012345',
      latitude: 21.1501,
      longitude: 79.0921,
      drive_start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      drive_end: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_categories: ['apparel', 'electronics', 'books'],
      status: 'scheduled'
    },
    {
      society_name: 'Vrindavan City Sector 3 Dropoff',
      rwa_contact_name: 'Anjali Deshmukh',
      rwa_phone: '+91-9890198765',
      latitude: 21.0754,
      longitude: 79.0532,
      drive_start: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      drive_end: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_categories: ['electronics', 'appliance'],
      status: 'scheduled'
    }
  ];

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

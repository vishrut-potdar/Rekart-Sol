import { sanitizeErrorText } from '../../utils/errors.js';

/**
 * "Where Does This Go?" Instant Disposal Lookup
 * Enforces E-Waste (Management) Rules, 2022: e-waste, batteries, cables, and mercury
 * items are routed ONLY to CPCB/MPCB authorised collection points, never informal kabadiwalas.
 */
export class WhereDoesThisGoService {
  static catalog = [
    {
      keywords: ['tube light', 'tubelight', 'cfl', 'fluorescent', 'mercury bulb'],
      item_name: 'Fluorescent Tube Light / CFL Bulb',
      stream: 'HAZARDOUS_DOMESTIC_WASTE',
      danger_level: 'HIGH (Contains toxic mercury vapor)',
      can_put_in_regular_bin: false,
      authorised_only: true,
      regulatory_basis: 'E-Waste (Management) Rules, 2022',
      disposal_instructions: 'Do NOT break. Wrap in newspaper or cardboard. Drop off only at an authorised CPCB/MPCB municipal hazardous collection point or certified take-back bin.',
      nearest_nagpur_facility: 'Authorised E-Waste Drop Box (Reliance Digital, Eternity Mall, Sitabuldi) or NMC Hazardous Collection Point',
      source: { label: 'CPCB E-Waste Rules 2022', url: 'https://cpcb.nic.in/e-waste/', verified_on: '2026-11-03' },
      doorstep_pickup_available: false,
      scrap_payout_inr: 0
    },
    {
      keywords: ['inverter battery', 'car battery', 'lead acid', 'ups battery'],
      item_name: 'Lead-Acid Inverter / Vehicle Battery',
      stream: 'FORMAL_LEAD_RECYCLER',
      danger_level: 'EXTREME (Sulfuric acid & toxic lead)',
      can_put_in_regular_bin: false,
      authorised_only: true,
      regulatory_basis: 'Battery Waste Management Rules, 2022',
      disposal_instructions: 'Keep upright to avoid acid leakage. Return strictly to an authorised battery dealer or MPCB-authorised lead recycler under Battery Waste Management Rules, 2022.',
      nearest_nagpur_facility: 'Authorised Exide / Amaron Battery Dealer (Wardha Road) or MPCB-Authorised Recycler (MIDC Hingna — sample listing)',
      source: { label: 'CPCB Battery Waste Rules 2022', url: 'https://cpcb.nic.in/', verified_on: '2026-11-03' },
      doorstep_pickup_available: true,
      scrap_payout_inr: 1200
    },
    {
      keywords: ['tablet strip', 'medicine blister', 'expired medicine', 'syrup bottle'],
      item_name: 'Medicine Blister Packs & Expired Drugs',
      stream: 'BIOMEDICAL_OR_DRY_SPECIALTY',
      danger_level: 'MODERATE (Environmental water table contamination)',
      can_put_in_regular_bin: false,
      authorised_only: true,
      regulatory_basis: 'Bio-Medical Waste Management Rules, 2016',
      disposal_instructions: 'Never flush down sink or toilet. Hand over uncrushed blister packs to participating hospital or pharmacy take-back bins.',
      nearest_nagpur_facility: 'Government Medical College (GMC) Nagpur Collection or Jan Aushadhi Kendra',
      source: { label: 'CPCB Biomedical Waste Guidelines', url: 'https://cpcb.nic.in/', verified_on: '2026-11-03' },
      doorstep_pickup_available: false,
      scrap_payout_inr: 0
    },
    {
      keywords: ['thermocol', 'styrofoam', 'polystyrene', 'packaging foam'],
      item_name: 'Thermocol / Expanded Polystyrene Packaging',
      stream: 'SPECIALIZED_EPS_COMPACTION',
      danger_level: 'LOW (Non-biodegradable, high volume clutter)',
      can_put_in_regular_bin: false,
      authorised_only: false,
      disposal_instructions: 'Keep dry and free of dirt. Route to EPS compaction / municipal dry waste aggregation instead of burning.',
      nearest_nagpur_facility: 'NMC Dry Waste Material Recovery Facility or Itwari EPS Aggregation (sample directory entry)',
      source: { label: 'Nagpur Municipal Corporation SWM', url: 'https://www.nmcnagpur.gov.in/', verified_on: '2026-11-03' },
      doorstep_pickup_available: true,
      scrap_payout_inr: 15
    },
    {
      keywords: ['mattress', 'old sofa', 'foam mattress', 'cotton gadda'],
      item_name: 'Used Mattress / Foam Bedding',
      stream: 'TEXTILE_FIBER_RECOVERY',
      danger_level: 'LOW (Bulky waste)',
      can_put_in_regular_bin: false,
      authorised_only: false,
      disposal_instructions: 'Traditional cotton gaddas can be carded (dhunai) and restitched by local Pinjari artisans. Synthetic foam goes to bulk dry recovery.',
      nearest_nagpur_facility: 'Nagpur Cotton Carding Hub, Gandhibagh / NMC Bulk Waste Collection',
      source: { label: 'NMC Bulk Waste Guidance', url: 'https://www.nmcnagpur.gov.in/', verified_on: '2026-11-03' },
      doorstep_pickup_available: true,
      scrap_payout_inr: 100
    },
    {
      keywords: ['wire', 'cable', 'charger cord', 'hdmi', 'usb cable', 'power cord'],
      item_name: 'Copper Cables, USB Wires & Power Cords (E-Waste)',
      stream: 'AUTHORISED_E_WASTE_COLLECTOR',
      danger_level: 'MODERATE (PVC & flame retardants release dioxins if burned)',
      can_put_in_regular_bin: false,
      authorised_only: true,
      regulatory_basis: 'E-Waste (Management) Rules, 2022',
      disposal_instructions: 'Do NOT burn plastic insulation or hand to an informal kabadiwala. Drop off strictly at a CPCB/MPCB authorised e-waste collection point or brand e-waste bin.',
      nearest_nagpur_facility: 'Reliance Digital E-Waste Drop Box (Eternity Mall, Sitabuldi) or MPCB Authorised Recycler',
      source: { label: 'CPCB / MPCB E-Waste Rules 2022', url: 'https://cpcb.nic.in/e-waste/', verified_on: '2026-11-03' },
      doorstep_pickup_available: false,
      scrap_payout_inr: 0
    },
    {
      keywords: ['phone', 'laptop', 'battery', 'lithium', 'power bank', 'earphone', 'headphone', 'electronics', 'e-waste', 'charger', 'circuit'],
      item_name: 'Consumer Electronics & Lithium Batteries (E-Waste)',
      stream: 'AUTHORISED_E_WASTE_COLLECTOR',
      danger_level: 'HIGH (Lithium thermal runaway & heavy metals)',
      can_put_in_regular_bin: false,
      authorised_only: true,
      regulatory_basis: 'E-Waste (Management) Rules, 2022',
      disposal_instructions: 'Do NOT discard in household bins or give to informal kabadiwalas. Factory-wipe if working and hand over only to a CPCB/MPCB authorised e-waste recycler or brand take-back bin.',
      nearest_nagpur_facility: 'Reliance Digital E-Waste Drop Box (Eternity Mall, Sitabuldi) or CPCB Authorised Recycler',
      source: { label: 'CPCB / MPCB E-Waste Rules 2022', url: 'https://cpcb.nic.in/e-waste/', verified_on: '2026-11-03' },
      doorstep_pickup_available: false,
      scrap_payout_inr: 0
    }
  ];

  static lookup(searchQuery = '') {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return { matches: this.catalog.slice(0, 4) };
    }

    const matches = this.catalog.filter(item => {
      const nameMatch = item.item_name.toLowerCase().includes(query);
      const kwMatch = item.keywords.some(k => query.includes(k) || k.includes(query));
      return nameMatch || kwMatch;
    });

    if (matches.length > 0) {
      return { total_matches: matches.length, matches };
    }

    const safeLabel = sanitizeErrorText(searchQuery, 80);
    return {
      total_matches: 1,
      matches: [
        {
          item_name: `General Household Item (${safeLabel})`,
          stream: 'MUNICIPAL_DRY_RECYCLABLE',
          danger_level: 'LOW',
          can_put_in_regular_bin: true,
          authorised_only: false,
          disposal_instructions: 'If clean paper, metal, or rigid plastic (non-electronic), place in municipal Blue Dry Waste bin or pass to dry-waste collection.',
          nearest_nagpur_facility: 'Local NMC Dry Waste Collection Vehicle (if electronic/battery, use CPCB E-Waste Drop Box)',
          source: { label: 'NMC Solid Waste Rules', url: 'https://www.nmcnagpur.gov.in/', verified_on: '2026-11-03' },
          doorstep_pickup_available: true,
          scrap_payout_inr: 10
        }
      ]
    };
  }
}

export class WhereDoesThisGoService {
  static catalog = [
    {
      keywords: ['tube light', 'tubelight', 'cfl', 'fluorescent', 'mercury bulb'],
      item_name: 'Fluorescent Tube Light / CFL Bulb',
      stream: 'HAZARDOUS_DOMESTIC_WASTE',
      danger_level: 'HIGH (Contains toxic mercury vapor)',
      can_put_in_regular_bin: false,
      disposal_instructions: 'Do NOT break. Wrap in newspaper or cardboard. Drop off at authorized CPCB municipal hazardous collection or Reliance Digital e-waste bin.',
      nearest_nagpur_facility: 'Reliance Digital E-Waste Drop Box (Eternity Mall, Sitabuldi) or NMC Hazardous Kiosk',
      doorstep_pickup_available: false,
      scrap_payout_inr: 0
    },
    {
      keywords: ['inverter battery', 'car battery', 'lead acid', 'ups battery'],
      item_name: 'Lead-Acid Inverter / Vehicle Battery',
      stream: 'FORMAL_LEAD_RECYCLER',
      danger_level: 'EXTREME (Sulfuric acid & toxic lead)',
      can_put_in_regular_bin: false,
      disposal_instructions: 'Keep upright to avoid acid leakage. Return to battery dealer for mandatory buy-back credit under Battery Waste Management Rules 2022.',
      nearest_nagpur_facility: 'Exide / Amaron Dealerships (Wardha Road / Central Avenue) or Vidarbha Clean-Earth Recycler Hingna',
      doorstep_pickup_available: true,
      scrap_payout_inr: 1200 // High scrap trade-in value
    },
    {
      keywords: ['tablet strip', 'medicine blister', 'expired medicine', 'syrup bottle'],
      item_name: 'Medicine Blister Packs & Expired Drugs',
      stream: 'BIOMEDICAL_OR_DRY_SPECIALTY',
      danger_level: 'MODERATE (Environmental water table contamination)',
      can_put_in_regular_bin: false,
      disposal_instructions: 'Never flush down sink or toilet. Hand over uncrushed blister packs to participating local pharmacies or hospital return bins.',
      nearest_nagpur_facility: 'Government Medical College (GMC) Nagpur Collection or Jan Aushadhi Kendra',
      doorstep_pickup_available: false,
      scrap_payout_inr: 0
    },
    {
      keywords: ['thermocol', 'styrofoam', 'polystyrene', 'packaging foam'],
      item_name: 'Thermocol / Expanded Polystyrene Packaging',
      stream: 'SPECIALIZED_EPS_COMPACTION',
      danger_level: 'LOW (Non-biodegradable, high volume clutter)',
      can_put_in_regular_bin: false,
      disposal_instructions: 'Keep dry and free of dirt. Itwari Scrap Syndicate aggregates EPS for thermal densification into synthetic picture frames.',
      nearest_nagpur_facility: 'Itwari Metal & Scrap Syndicate, Bhandara Road, Nagpur',
      doorstep_pickup_available: true,
      scrap_payout_inr: 15 // Per kg compacted
    },
    {
      keywords: ['mattress', 'old sofa', 'foam mattress', 'cotton gadda'],
      item_name: 'Used Mattress / Foam Bedding',
      stream: 'TEXTILE_FIBER_RECOVERY',
      danger_level: 'LOW (Bulky waste)',
      can_put_in_regular_bin: false,
      disposal_instructions: 'Traditional cotton gaddas can be carded (dhunai) and restitched by local Pinjari artisans. Synthetic foam is shredded for industrial soundproofing.',
      nearest_nagpur_facility: 'Nagpur Cotton Carding Hub, Gandhibagh or Itwari',
      doorstep_pickup_available: true,
      scrap_payout_inr: 100
    },
    {
      keywords: ['wire', 'cable', 'charger cord', 'hdmi', 'usb cable'],
      item_name: 'Copper Cables, USB Wires & Power Cords',
      stream: 'E_WASTE_COPPER_RECOVERY',
      danger_level: 'LOW (Contains high-grade recyclable copper)',
      can_put_in_regular_bin: false,
      disposal_instructions: 'Do not burn plastic insulation (releases toxic dioxins). Sell to kabadiwala or drop in e-waste bin.',
      nearest_nagpur_facility: 'Doorstep Kabadiwala or Sitabuldi ProTech Device Hub',
      doorstep_pickup_available: true,
      scrap_payout_inr: 180 // Per kg copper scrap
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

    // Default fallback guidance
    return {
      total_matches: 1,
      matches: [
        {
          item_name: `General Household Item (${searchQuery})`,
          stream: 'MUNICIPAL_DRY_RECYCLABLE_OR_KABADIWALA',
          danger_level: 'LOW',
          can_put_in_regular_bin: true,
          disposal_instructions: 'If clean and made of paper, metal, or rigid plastic, hand to your doorstep kabadiwala. Otherwise place in municipal Blue Dry Waste bin.',
          nearest_nagpur_facility: 'Local NMC Dry Waste Collection Vehicle or Itwari Scrap Yard',
          doorstep_pickup_available: true,
          scrap_payout_inr: 10
        }
      ]
    };
  }
}

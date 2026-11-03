export const CATEGORIES = {
  ELECTRONICS: 'electronics',
  APPAREL: 'apparel',
  APPLIANCE: 'appliance',
  FURNITURE: 'furniture',
  KITCHENWARE: 'kitchenware',
  SCRAP_METAL: 'scrap_metal',
  BOOKS: 'books',
  OTHER: 'other'
};

export const OUTCOME_TRACKS = {
  REPAIR: 'repair',
  P2P_RESALE: 'p2p_resale',
  INSTANT_BUYBACK: 'instant_buyback',
  NGO_DONATION: 'ngo_donation',
  FORMAL_RECYCLE: 'formal_recycle',
  KABADIWALA_SCRAP: 'kabadiwala_scrap'
};

export const PARTNER_TYPES = {
  REPAIR_SHOP: 'repair_shop',
  NGO: 'ngo',
  CPCB_RECYCLER: 'cpcb_recycler',
  KABADIWALA: 'kabadiwala',
  BRAND_DROPBOX: 'brand_dropbox'
};

export const SAFETY_LEVELS = {
  BEGINNER_SAFE: 'BEGINNER_SAFE',
  NEEDS_SPECIALIZED_TOOLS: 'NEEDS_SPECIALIZED_TOOLS',
  DO_NOT_ATTEMPT: 'DO_NOT_ATTEMPT'
};

export const QUOTE_VERDICTS = {
  FAIR: 'Fair',
  HIGH: 'High',
  VERY_HIGH: 'Very High'
};

// Economic repair threshold ratio
export const REPAIR_THRESHOLD_RATIO = 0.60;

// Nagpur geographic anchor for default queries
export const NAGPUR_GEO_ANCHOR = {
  latitude: 21.1458,
  longitude: 79.0882,
  city: 'Nagpur',
  state: 'Maharashtra'
};

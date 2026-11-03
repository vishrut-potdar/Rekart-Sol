import { db } from '../../db/connection.js';
import { NAGPUR_GEO_ANCHOR } from '../../config/constants.js';

/**
 * Hyperlocal Partner Matchmaker & Geocoding
 * Evaluates nearest verified partners and maps to active NGO shortage demands.
 */
export class HyperlocalMatcherService {
  static async findOptimalMatches({
    latitude = NAGPUR_GEO_ANCHOR.latitude,
    longitude = NAGPUR_GEO_ANCHOR.longitude,
    category = 'electronics',
    targetTrack = 'repair',
    maxRadiusMeters = 25000
  }) {
    // 1. Map target track to partner types
    let preferredPartnerTypes = [];
    if (targetTrack === 'repair') {
      preferredPartnerTypes = ['repair_shop'];
    } else if (targetTrack === 'ngo_donation') {
      preferredPartnerTypes = ['ngo'];
    } else if (targetTrack === 'formal_recycle') {
      preferredPartnerTypes = ['cpcb_recycler', 'brand_dropbox'];
    } else if (targetTrack === 'kabadiwala_scrap') {
      preferredPartnerTypes = ['kabadiwala'];
    }

    // 2. Fetch nearby partners
    let candidates = [];
    for (const pType of preferredPartnerTypes) {
      const partners = await db.findNearbyPartners({
        latitude,
        longitude,
        category,
        partnerType: pType,
        maxDistanceMeters: maxRadiusMeters,
        limit: 10
      });
      candidates.push(...partners);
    }

    // Sort by proximity
    candidates.sort((a, b) => a.distance_meters - b.distance_meters);

    // 3. If NGO track, cross-reference against active community demand lists
    let matchingDemands = [];
    if (targetTrack === 'ngo_donation' || category === 'apparel' || category === 'books') {
      const activeDemands = await db.getActiveDemands(category);
      matchingDemands = activeDemands;

      // Prioritize partners that have an open demand
      candidates = candidates.map(partner => {
        const demand = activeDemands.find(d => d.partner_id === partner.id);
        return {
          ...partner,
          has_active_shortage: Boolean(demand),
          shortage_description: demand ? demand.item_description : null,
          shortage_urgency: demand ? demand.urgency_level : null
        };
      });

      // Boost partners with active shortage to the top
      candidates.sort((a, b) => {
        if (a.has_active_shortage && !b.has_active_shortage) return -1;
        if (!a.has_active_shortage && b.has_active_shortage) return 1;
        return a.distance_meters - b.distance_meters;
      });
    }

    return {
      query_origin: { latitude, longitude, city: 'Nagpur' },
      target_track: targetTrack,
      category,
      total_matches: candidates.length,
      active_shortages_count: matchingDemands.length,
      partners: candidates
    };
  }
}

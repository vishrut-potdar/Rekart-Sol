/**
 * Channel Comparison Engine
 * Computes net yield across Instant Buy-Back, P2P, Offline Refurbisher, and
 * Authorised E-Waste / Scrap recovery.
 * Enforces E-Waste (Management) Rules, 2022: electronics never route to kabadiwalas.
 */
export class ChannelComparisonEngine {
  static compareChannels({
    category = 'electronics',
    modelName,
    functionalMarketValue,
    estimatedRepairCost = 0,
    weightKg = 0.2, // For scrap / recovery weight
    conditionGrade = 'B'
  }) {
    const vMarket = Number(functionalMarketValue);
    const cRepair = Number(estimatedRepairCost);
    const isElectronics = String(category).toLowerCase() === 'electronics';

    // 1. Instant Buy-Back (e.g., Cashify / Rekart Instant)
    const instantDiscount = conditionGrade === 'A' ? 0.20 : conditionGrade === 'B' ? 0.30 : 0.45;
    const instantGross = Math.max(0, vMarket * (1 - instantDiscount) - cRepair * 0.5);
    const instantFee = instantGross * 0.05; // 5% handling
    const instantNet = Math.round(instantGross - instantFee);

    // 2. Peer-to-Peer (P2P Resale - e.g. OLX / Rekart Direct)
    const p2pGross = conditionGrade === 'A' ? vMarket * 0.95 : vMarket * 0.85;
    const p2pListingFee = 150;
    const p2pNet = Math.max(0, Math.round(p2pGross - cRepair - p2pListingFee));

    // 3. Offline Refurbisher / Local Shop Walk-in
    const refurbGross = Math.max(0, vMarket * 0.65 - cRepair * 0.7);
    const refurbNet = Math.round(refurbGross);

    // 4. Material Recovery / Scrap Channel
    // Hard rule (C8): Electronics & batteries MUST go only to CPCB/MPCB authorised e-waste recyclers, never kabadiwalas.
    const scrapRatePerKg = isElectronics ? 0 : category === 'apparel' ? 18 : 50;
    const scrapNet = isElectronics ? 0 : Math.round(Math.max(50, weightKg * scrapRatePerKg));

    const recoveryChannel = isElectronics
      ? {
          channel_id: 'authorized_ewaste_recycler',
          channel_name: 'Authorised E-Waste Recycler / Brand Take-Back (CPCB)',
          turnaround_time: 'Drop-off or scheduled pickup',
          effort_level: 'Low (Certified collection point)',
          gross_payout_inr: 0,
          deductions_inr: 0,
          net_yield_inr: 0,
          authorised_only: true,
          regulatory_basis: 'E-Waste (Management) Rules, 2022',
          is_recommended: instantNet < 300 && p2pNet < 300
        }
      : {
          channel_id: 'kabadiwala_scrap',
          channel_name: 'Doorstep Kabadiwala Scrap (By Weight)',
          turnaround_time: 'Scheduled slot (2-4 hours)',
          effort_level: 'Zero (Doorstep scale weighing)',
          gross_payout_inr: scrapNet,
          deductions_inr: 0,
          net_yield_inr: scrapNet,
          authorised_only: false,
          is_recommended: instantNet < 300 && p2pNet < 300
        };

    const channels = [
      {
        channel_id: 'peer_to_peer',
        channel_name: 'Peer-to-Peer Resale (Rekart Direct)',
        turnaround_time: '7-12 days',
        effort_level: 'Moderate (Meet buyer / ship)',
        gross_payout_inr: Math.round(p2pGross),
        deductions_inr: Math.round(cRepair + p2pListingFee),
        net_yield_inr: p2pNet,
        is_recommended: p2pNet > instantNet + 1500
      },
      {
        channel_id: 'instant_buyback',
        channel_name: 'Instant Buy-Back (Doorstep Pickup)',
        turnaround_time: '24 hours',
        effort_level: 'Zero (Doorstep inspection & immediate verification)',
        gross_payout_inr: Math.round(instantGross),
        deductions_inr: Math.round(instantFee),
        net_yield_inr: instantNet,
        is_recommended: instantNet >= p2pNet - 1500 && instantNet > refurbNet && instantNet >= 300
      },
      {
        channel_id: 'offline_refurbisher',
        channel_name: 'Offline Refurbisher Partner (Walk-in)',
        turnaround_time: 'Same day',
        effort_level: 'Low (Visit local store)',
        gross_payout_inr: refurbNet,
        deductions_inr: 0,
        net_yield_inr: refurbNet,
        is_recommended: false
      },
      recoveryChannel
    ];

    channels.sort((a, b) => b.net_yield_inr - a.net_yield_inr);

    return {
      model_name: modelName,
      category,
      ewaste_authorised_only: isElectronics,
      highest_yield_channel: channels[0].channel_id,
      spread_inr: channels[0].net_yield_inr - channels[channels.length - 1].net_yield_inr,
      channels
    };
  }
}

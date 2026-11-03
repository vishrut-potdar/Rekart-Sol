/**
 * Readiness Gatekeeper
 * Enforces strict NGO acceptance criteria to prevent unusable dumping on charity partners.
 * Automatically diverts failed items to industrial textile shredders / scrap recyclers.
 */
export class ReadinessGatekeeperService {
  static evaluateDonationReadiness({
    category,
    conditionAttributes = {}
  }) {
    const failures = [];

    if (category === 'apparel') {
      const {
        has_major_tears = false,
        has_permanent_stains = false,
        has_missing_buttons = false,
        is_paired_shoes = true,
        is_washed_and_hygienic = true
      } = conditionAttributes;

      if (has_major_tears) {
        failures.push('Contains large tears or non-repairable fabric wear');
      }
      if (has_permanent_stains) {
        failures.push('Noticeable non-removable ink/oil/chemical stains present');
      }
      if (!is_washed_and_hygienic) {
        failures.push('Item must be washed and unsoiled prior to NGO donation');
      }
      if (!is_paired_shoes && conditionAttributes.sub_type === 'shoes') {
        failures.push('Single shoes without matching pair are rejected by NGOs');
      }
    } else if (category === 'books') {
      const { has_intact_spine = true, has_missing_pages = false } = conditionAttributes;
      if (!has_intact_spine || has_missing_pages) {
        failures.push('Books with missing pages or broken binding cannot be distributed to libraries');
      }
    } else if (category === 'kitchenware') {
      const { is_chipped_or_cracked = false, has_rust = false } = conditionAttributes;
      if (is_chipped_or_cracked || has_rust) {
        failures.push('Utensils or ceramic with rust/deep chips pose health hazards');
      }
    }

    const isAcceptedForNgo = failures.length === 0;

    let fallbackTrack = null;
    let fallbackAction = null;

    if (!isAcceptedForNgo) {
      if (category === 'apparel') {
        fallbackTrack = 'textile_recovery_shredder';
        fallbackAction = 'Rerouted to industrial cotton rag processing & acoustic insulation recycling';
      } else {
        fallbackTrack = 'kabadiwala_scrap';
        fallbackAction = 'Rerouted to municipal scrap recycling by material weight';
      }
    }

    return {
      is_eligible_for_ngo_donation: isAcceptedForNgo,
      rejection_reasons: failures,
      fallback_track: fallbackTrack,
      fallback_action_description: fallbackAction
    };
  }
}

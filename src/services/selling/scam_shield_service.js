export class ScamShieldService {
  /**
   * Scans a buyer's chat message or transaction scenario for known fraud indicators
   */
  static analyzeScamRisk({ message = '', paymentMethod = '', deliveryRequested = false }) {
    const text = message.toLowerCase();
    const flags = [];
    let riskScore = 0; // 0 to 100

    // 1. QR Code / UPI PIN Scam
    if (
      text.includes('qr code') ||
      text.includes('scan qr') ||
      text.includes('pin enter') ||
      text.includes('enter pin to receive') ||
      text.includes('scan to receive')
    ) {
      riskScore += 95;
      flags.push({
        severity: 'CRITICAL',
        type: 'UPI_QR_RECEIVE_SCAM',
        warning: 'CRITICAL FRAUD ALERT: The buyer asks you to scan a QR code or enter a UPI PIN to receive payment.',
        explanation: 'In the Indian UPI system, you NEVER enter your UPI PIN or scan a QR code to receive money. Entering your PIN immediately deducts money from your bank account.'
      });
    }

    // 2. Military / Defence Personnel Impersonation
    if (
      text.includes('army') ||
      text.includes('defence') ||
      text.includes('cantonment') ||
      text.includes('crpf') ||
      text.includes('military officer')
    ) {
      riskScore += 75;
      flags.push({
        severity: 'HIGH',
        type: 'DEFENCE_PERSONNEL_IMPERSONATION',
        warning: 'SUSPICIOUS BUYER PATTERN: Fraudsters frequently pose as newly posted Army officers to gain immediate trust and rush online advance transactions.',
        explanation: 'Always insist on in-person physical inspection and instant UPI or cash on handover.'
      });
    }

    // 3. Fake Third-Party Courier or Advance Transport Fee
    if (
      deliveryRequested &&
      (text.includes('courier boy will come') || text.includes('transport fee') || text.includes('insurance fee advance'))
    ) {
      riskScore += 80;
      flags.push({
        severity: 'HIGH',
        type: 'COURIER_ADVANCE_FEE_SCAM',
        warning: 'ADVANCE FEE SCAM: Buyer claims a courier or transport company requires an insurance deposit before delivery.',
        explanation: 'Legitimate buyers either meet in person or use platform-escrowed shipping. Never pay any fee to sell an item.'
      });
    }

    // 4. Overpayment / Fake SMS
    if (text.includes('sent extra') || text.includes('refund difference') || text.includes('bank sms received')) {
      riskScore += 65;
      flags.push({
        severity: 'MEDIUM',
        type: 'OVERPAYMENT_OR_SPOOFED_SMS',
        warning: 'VERIFY REAL BANK BALANCE: Fraudsters send fake SMS messages imitating banks.',
        explanation: 'Always open your official banking or UPI app directly and verify that your bank ledger balance actually increased before releasing items.'
      });
    }

    const isSuspicious = riskScore >= 50;

    return {
      risk_score: Math.min(100, riskScore),
      is_suspicious: isSuspicious,
      risk_verdict: riskScore >= 80 ? 'CRITICAL_RISK' : riskScore >= 50 ? 'HIGH_RISK' : 'LOW_RISK',
      flagged_indicators: flags,
      safe_meetup_guidelines: [
        'Meet only in daylight at crowded public locations (e.g. Sitabuldi Metro Station or Eternity Mall entrance, Nagpur)',
        'Never hand over the item until you open your bank app and verify cleared funds',
        'Do not accept cheque payments or third-party courier pickup requests'
      ]
    };
  }
}

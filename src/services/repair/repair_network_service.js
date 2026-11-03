import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/connection.js';

export class RepairNetworkService {
  /**
   * Ready-made Questions to Ask Your Shop template
   */
  static getShopQuestionsTemplate({ modelName, faultType }) {
    return {
      model_name: modelName,
      fault_type: faultType,
      recommended_questions: [
        {
          category: 'Diagnosis & Root Cause',
          question: `Can you show me the exact component failure under magnification or on a multimeter before starting work?`,
          tip: 'A transparent technician will gladly demonstrate where the open circuit or short is.'
        },
        {
          category: 'Part Grade & Authenticity',
          question: `Is this replacement part OEM (original equipment manufacturer), pulled original, or third-party aftermarket?`,
          tip: 'OEM parts retain original color calibration and battery health reporting. Aftermarket is 50-70% cheaper but may trigger non-genuine display warnings.'
        },
        {
          category: 'Return of Defective Parts',
          question: `Will you return my old damaged part (screen, battery, flex cable) in a sealed bag after completion?`,
          tip: 'Always insist on getting your old part back to ensure genuine replacement and prevent stolen parts.'
        },
        {
          category: 'Warranty & Turnaround',
          question: `What is the warranty period for this repair (30, 90, or 180 days), and does it cover touch ghosting or battery swelling?`,
          tip: 'Reputable independent shops provide at least 30-90 days warranty on parts and labour.'
        },
        {
          category: 'Data Confidentiality',
          question: `Do you require my device passcode, or can you test screen and touch using emergency call dialer or hardware diagnostic mode?`,
          tip: 'Technicians do NOT need your private passcode to test digitizers, speakers, or charging.'
        }
      ]
    };
  }

  /**
   * Routes low-risk repairs to verified ITI / ECE student technicians (40% lower labour costs)
   */
  static async findStudentTechnicians({ cityId = 'nagpur', category = 'electronics', faultType = '' }) {
    // Low risk faults eligible for student technicians
    const lowRiskFaults = ['battery replacement', 'charging port cleaning', 'charging port replacement', 'screen protector', 'speaker lint clean', 'ram upgrade', 'ssd swap'];
    const isEligible = lowRiskFaults.some(f => faultType.toLowerCase().includes(f));

    const studentTechs = [
      {
        id: 'student-tech-01',
        full_name: 'Tanmay Meshram',
        institution: 'Government Polytechnic / ITI Sadar, Nagpur',
        specialization: 'Electronics & Hardware Micro-Soldering',
        rating: 4.8,
        completed_repairs_count: 47,
        verification_status: 'institution_verified',
        eligible_faults: lowRiskFaults,
        labour_discount_percentage: 40,
        hourly_rate_inr: 250,
        location: 'Sadar / Civil Lines, Nagpur'
      },
      {
        id: 'student-tech-02',
        full_name: 'Priyanka Shende',
        institution: 'VNIT Nagpur (ECE Department)',
        specialization: 'Embedded Systems & Mobile Diagnostics',
        rating: 4.9,
        completed_repairs_count: 62,
        verification_status: 'institution_verified',
        eligible_faults: lowRiskFaults,
        labour_discount_percentage: 45,
        hourly_rate_inr: 280,
        location: 'Dharampeth / VNIT Campus, Nagpur'
      }
    ];

    return {
      is_eligible_for_student_tech: isEligible,
      student_eligibility_reason: isEligible
        ? 'Fault is low-risk (modular component swap / cleaning). Eligible for verified student technician routing.'
        : 'Fault requires high-precision BGA reballing or specialized tools; commercial authorized workshop recommended.',
      available_student_technicians: isEligible ? studentTechs : []
    };
  }

  /**
   * Broadcast repair request to multiple registered local shops to compare quotes
   */
  static async broadcastRepairRequest({
    itemId,
    userLocation = { latitude: 21.1458, longitude: 79.0882 },
    modelName,
    faultDescription,
    maxShops = 3
  }) {
    const broadcastId = `bcast_${Date.now()}_${uuidv4().substring(0, 6)}`;

    // Simulated responses from registered partner shops within radius
    const simulatedBids = [
      {
        shop_id: 'p-rep-001',
        shop_name: 'Sitabuldi ProTech Device Hub',
        distance_km: 0.52,
        proposed_solution: 'Aftermarket Grade A+ Display with 90-day warranty',
        part_grade: 'aftermarket_a_plus',
        estimated_turnaround_hours: 2,
        quoted_parts_cost: 3200,
        quoted_labour_cost: 600,
        total_quoted_inr: 3800,
        provides_video_proof: true,
        returns_old_parts: true,
        warranty_days: 90
      },
      {
        shop_id: 'p-rep-002',
        shop_name: 'Dharampeth Laptop & Appliance Lab',
        distance_km: 1.84,
        proposed_solution: 'Original Service Pack Screen (Direct OEM pull)',
        part_grade: 'OEM',
        estimated_turnaround_hours: 4,
        quoted_parts_cost: 7500,
        quoted_labour_cost: 800,
        total_quoted_inr: 8300,
        provides_video_proof: true,
        returns_old_parts: true,
        warranty_days: 180
      },
      {
        shop_id: 'p-rep-003',
        shop_name: 'Sadar QuickFix Care',
        distance_km: 2.10,
        proposed_solution: 'Refurbished Original Glass Lamination (Preserving original OLED)',
        part_grade: 'reconditioned_oem',
        estimated_turnaround_hours: 5,
        quoted_parts_cost: 2400,
        quoted_labour_cost: 900,
        total_quoted_inr: 3300,
        provides_video_proof: false,
        returns_old_parts: true,
        warranty_days: 60
      }
    ];

    simulatedBids.sort((a, b) => a.total_quoted_inr - b.total_quoted_inr);

    return {
      broadcast_id: broadcastId,
      item_id: itemId,
      model_name: modelName,
      fault_description: faultDescription,
      broadcasted_at: new Date().toISOString(),
      total_bids_received: simulatedBids.length,
      lowest_quote_inr: simulatedBids[0].total_quoted_inr,
      highest_quote_inr: simulatedBids[simulatedBids.length - 1].total_quoted_inr,
      bids: simulatedBids
    };
  }
}

import express from 'express';
import { DecisionTreeEngine } from '../services/triage/decision_tree.js';
import { HardwareTelemetryParser } from '../services/triage/telemetry_parser.js';
import { SymptomAndFaultRanker } from '../services/triage/fault_ranker.js';
import { SafetyScorerEngine } from '../services/calculation/safety_scorer.js';
import { db } from '../db/connection.js';

const router = express.Router();

// 1. Dynamic Decision-Tree Questions (en, hi, hinglish)
router.get('/questions', (req, res) => {
  const { category = 'electronics', language = 'en' } = req.query;
  const tree = DecisionTreeEngine.getQuestionTree(category, language);
  return res.status(200).json({ success: true, data: tree });
});

// 2. Pile Exception Queries
router.post('/exception-query', (req, res) => {
  const { metadata = {}, language = 'en' } = req.body;
  const exceptions = DecisionTreeEngine.generatePileExceptionQueries(metadata, language);
  return res.status(200).json({ success: true, data: exceptions });
});

// 3. Hardware Telemetry Parser
router.post('/parse-telemetry', (req, res) => {
  const telemetry = req.body.telemetry || req.body;
  const analysis = HardwareTelemetryParser.parse(telemetry);
  return res.status(200).json({ success: true, data: analysis });
});

// 4. Symptom & Fault Ranker
router.post('/rank-faults', (req, res) => {
  const { category = 'electronics', answers = {}, telemetrySummary = {} } = req.body;
  const ranked = SymptomAndFaultRanker.rank({ category, answers, telemetrySummary });
  return res.status(200).json({ success: true, data: ranked });
});

// 5. Complete Triage Submission
router.post('/session', async (req, res, next) => {
  try {
    const {
      itemId,
      category = 'electronics',
      language = 'en',
      answers = {},
      telemetry = {}
    } = req.body;

    // A. Parse telemetry
    const telemetryReport = HardwareTelemetryParser.parse(telemetry);

    // B. Rank faults
    const faultReport = SymptomAndFaultRanker.rank({
      category,
      answers,
      telemetrySummary: telemetryReport
    });

    // C. Safety score
    const safetyReport = SafetyScorerEngine.evaluateRisk({
      category,
      faultType: faultReport.primary_fault?.fault || '',
      symptoms: Object.values(answers),
      isSwollenBattery: telemetryReport.is_hazard_flagged || answers.q3_battery_health === 'bat_swollen'
    });

    // D. Persist session
    const session = await db.saveTriageSession({
      item_id: itemId,
      language,
      question_flow_id: `${category}_core_v1`,
      answers_payload: answers,
      sensor_telemetry: telemetryReport,
      detected_faults: [faultReport.primary_fault, ...faultReport.secondary_faults],
      safety_score: safetyReport.safety_level
    });

    if (itemId) {
      await db.updateItem(itemId, {
        provisional_grade: telemetryReport.provisional_hardware_grade,
        status: 'priced'
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        session_id: session.id,
        item_id: itemId,
        telemetry: telemetryReport,
        fault_analysis: faultReport,
        safety_assessment: safetyReport
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;

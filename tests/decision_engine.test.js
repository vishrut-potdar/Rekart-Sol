import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DecisionEngine } from '../src/services/decision/decision_engine.js';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth/auth_service.js';

const GOLDEN_CASES = [
  {
    name: '01. iPhone 13 cracked screen with no verified sell evidence -> borderline',
    input: { category: 'electronics', brand: 'Apple', modelName: 'iPhone 13', faultType: 'Screen Replacement', working: 'partly', condition: 'good', ageYears: 2, quotedRepairCost: 4200 },
    assertFn: r => {
      assert.notEqual(r.recommended_path.path, 'repair');
      assert.equal(r.repair_or_release.verdict, 'borderline');
      assert.equal(r.regulatory_rule.kabadiwala_blocked, true);
      assert.equal(r.fair_price_shield, null);
    }
  },
  {
    name: '02. iPhone 13 predatory repair quote (₹24,000 > 60%) -> sell as-is beats repair',
    input: { category: 'electronics', brand: 'Apple', modelName: 'iPhone 13', faultType: 'Screen Replacement', working: 'partly', condition: 'good', ageYears: 2, quotedRepairCost: 24000, priority: 'max_cash' },
    assertFn: r => {
      assert.notEqual(r.recommended_path.path, 'repair');
      assert.equal(r.recommended_path.path, 'sell');
    }
  },
  {
    name: '03. Swollen phone battery -> hard-rule safety override forces recycle',
    input: { category: 'electronics', brand: 'OnePlus', modelName: 'OnePlus Nord', faultType: 'Battery Replacement', working: 'partly', condition: 'fair', ageYears: 3, isSwollenBattery: true },
    assertFn: r => {
      assert.equal(r.safety_override.active, true);
      assert.equal(r.safety_override.level, 'DO_NOT_ATTEMPT');
      assert.equal(r.recommended_path.path, 'recycle');
      assert.equal(r.recommended_path.authorised_only, true);
    }
  },
  {
    name: '04. Galaxy S21 with swollen symptom in note text -> safety override forces recycle',
    input: { category: 'electronics', brand: 'Samsung', modelName: 'Galaxy S21', working: 'partly', condition: 'fair', ageYears: 3, note: 'Back panel lifting from swollen battery' },
    assertFn: r => {
      assert.equal(r.safety_override.active, true);
      assert.equal(r.recommended_path.path, 'recycle');
    }
  },
  {
    name: '05. Dead old feature phone worth <₹300 -> authorised e-waste recycle, never kabadiwala',
    input: { category: 'electronics', brand: 'Nokia', modelName: 'Basic Phone', working: 'no', condition: 'poor', ageYears: 8, originalPrice: 1200, quotedRepairCost: 1500 },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'recycle');
      assert.equal(r.recommended_path.authorised_only, true);
      assert.ok(!r.channel_comparison.channels.some(c => c.channel_id === 'kabadiwala_scrap'));
    }
  },
  {
    name: '06. Working Sony WH-1000XM4 headphones with max_cash -> sell',
    input: { category: 'electronics', brand: 'Sony', modelName: 'Sony WH-1000XM4', working: 'yes', condition: 'like_new', ageYears: 1, priority: 'max_cash' },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'sell');
      assert.ok(r.item_summary.working_resale_median_inr > 5000);
    }
  },
  {
    name: '07. Sony WH-1000XM4 headphones battery drains quickly, quote ₹850 -> repair',
    input: { category: 'electronics', brand: 'Sony', modelName: 'Sony WH-1000XM4', faultType: 'Battery Replacement', working: 'partly', condition: 'good', ageYears: 2, quotedRepairCost: 850 },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'repair');
      assert.ok(r.what_would_change_this.length >= 1);
    }
  },
  {
    name: '08. Dell Inspiron 15 keyboard fault (₹1,400 quote) -> repair',
    input: { category: 'electronics', brand: 'Dell', modelName: 'Inspiron 15', faultType: 'Keyboard Replacement', working: 'partly', condition: 'good', ageYears: 3, quotedRepairCost: 1400 },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'repair');
    }
  },
  {
    name: '09. Working Redmi Note 11 with eco_social priority -> sell or donate eligible',
    input: { category: 'electronics', brand: 'Xiaomi', modelName: 'Redmi Note 11', working: 'yes', condition: 'good', ageYears: 2, priority: 'eco_social' },
    assertFn: r => {
      const donatePath = r.ranked_paths.find(p => p.path === 'donate');
      assert.equal(donatePath.eligible, true);
    }
  },
  {
    name: '10. Outgrown clean winter denim jacket (balanced/eco_social) -> donate',
    input: { category: 'apparel', modelName: 'Winter denim jacket', working: 'yes', condition: 'good', ageYears: 2, originalPrice: 2200, priority: 'eco_social' },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'donate');
    }
  },
  {
    name: '11. Torn poor-condition cotton T-shirt -> donate disqualified, recommends reuse or recycle',
    input: { category: 'apparel', modelName: 'Old Cotton T-Shirt', working: 'no', condition: 'poor', ageYears: 5, originalPrice: 600, quotedRepairCost: 500 },
    assertFn: r => {
      const donatePath = r.ranked_paths.find(p => p.path === 'donate');
      assert.equal(donatePath.eligible, false);
      assert.ok(['reuse', 'recycle'].includes(r.recommended_path.path));
    }
  },
  {
    name: '12. Like-new designer jacket (original ₹12,000, max_cash) -> sell',
    input: { category: 'apparel', modelName: 'Leather Biker Jacket', working: 'yes', condition: 'like_new', ageYears: 1, originalPrice: 12000, priority: 'max_cash' },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'sell');
      assert.ok(r.recommended_path.net_value_range_inr[0] > 1000);
    }
  },
  {
    name: '13. Bajaj mixer grinder bearing fault (₹380 quote) -> repair',
    input: { category: 'appliance', brand: 'Bajaj', modelName: 'Bajaj mixer grinder', faultType: 'Motor Capacitor / Bearing', working: 'partly', condition: 'good', ageYears: 4, quotedRepairCost: 380 },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'repair');
      assert.equal(r.repair_or_release.is_repair_economically_viable, true);
    }
  },
  {
    name: '14. Microwave oven magnetron spark -> high-voltage DO_NOT_ATTEMPT, blocks DIY reuse',
    input: { category: 'appliance', modelName: 'LG Microwave Oven', faultType: 'Magnetron spark', applianceType: 'microwave_oven', working: 'no', condition: 'fair', ageYears: 5, quotedRepairCost: 5500, originalPrice: 11000 },
    assertFn: r => {
      assert.equal(r.safety_override.active, true);
      assert.equal(r.safety_override.level, 'DO_NOT_ATTEMPT');
      assert.equal(r.safety_override.allow_diy_guide, false);
      assert.ok(r.safety_override.blocked_paths.includes('reuse'));
    }
  },
  {
    name: '15. Dead 9-year-old mixer grinder with ₹2,500 repair quote (> 60%) -> not repair',
    input: { category: 'appliance', modelName: 'Old Mixer Grinder', working: 'no', condition: 'poor', ageYears: 9, originalPrice: 2500, quotedRepairCost: 2500 },
    assertFn: r => {
      assert.notEqual(r.recommended_path.path, 'repair');
      assert.equal(r.repair_or_release.is_repair_economically_viable, false);
    }
  },
  {
    name: '16. LG Top Load 6.5kg washing machine with ₹1,500 capacitor fix -> repair',
    input: { category: 'appliance', brand: 'LG', modelName: 'Top Load 6.5kg', faultType: 'Motor Capacitor / Bearing', working: 'partly', condition: 'good', ageYears: 4, originalPrice: 18500, quotedRepairCost: 1500 },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'repair');
    }
  },
  {
    name: '17. Wobbly wooden desk chair (₹300 reglue quote vs ₹2,400 value) -> repair',
    input: { category: 'furniture', modelName: 'Wooden desk chair', faultType: 'Joint Re-gluing', working: 'partly', condition: 'good', ageYears: 5, quotedRepairCost: 300 },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'repair');
      assert.ok(r.ranked_paths.length === 5);
    }
  },
  {
    name: '18. Working wooden study desk (max_cash) -> sell',
    input: { category: 'furniture', modelName: 'Teak Study Desk', working: 'yes', condition: 'like_new', ageYears: 2, originalPrice: 9000, priority: 'max_cash' },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'sell');
    }
  },
  {
    name: '19. CFL mercury tube light / bulb -> severe hazard override to authorised recycle',
    input: { category: 'other', modelName: 'Old CFL Bulb', working: 'no', condition: 'poor', ageYears: 4, note: 'Broken CFL mercury tube light' },
    assertFn: r => {
      assert.equal(r.safety_override.active, true);
      assert.equal(r.recommended_path.path, 'recycle');
      assert.equal(r.recommended_path.authorised_only, true);
    }
  },
  {
    name: '20. Working generic ceramic kitchen bowl set (eco_social) -> donate eligible & recommended',
    input: { category: 'other', modelName: 'Steel Dinner Set', working: 'yes', condition: 'good', ageYears: 3, originalPrice: 800, priority: 'eco_social' },
    assertFn: r => {
      assert.equal(r.recommended_path.path, 'donate');
      assert.equal(r.provenance.as_of, null);
    }
  }
];

for (const tc of GOLDEN_CASES) {
  test(`Golden Case: ${tc.name}`, () => {
    const pricedCases = ['06.', '07.', '08.', '12.', '13.', '16.', '17.'];
    const context = pricedCases.some(prefix => tc.name.startsWith(prefix)) ? {
      now: Date.parse('2026-11-25'),
      phonePricingData: { sell: [7000, 7500, 8000, 8500, 9000].map((amountInr, index) => ({
        category: tc.input.category, model: tc.input.modelName, brand: tc.input.brand,
        amountInr, condition: tc.input.condition, fullyWorking: true, sourceType: 'direct_buyer',
        source: 'Synthetic buyer ' + index, permissionReference: 'Test fixture', asOf: '2026-11-17'
      })) }
    } : {};
    const result = DecisionEngine.evaluate(tc.input, context);
    assert.ok(result.recommended_path);
    assert.equal(result.ranked_paths.length, 5);
    assert.ok(Array.isArray(result.what_would_change_this) && result.what_would_change_this.length >= 1);
    tc.assertFn(result);
  });
}

test('POST /api/v1/decide computes decision, persists item+decision, and GET /api/v1/decide/:itemId enforces ownership', async () => {
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const tokenA = AuthService.generateToken({ id: 'user-dec-a', email: 'a@example.test', role: 'donor' });
    const tokenB = AuthService.generateToken({ id: 'user-dec-b', email: 'b@example.test', role: 'donor' });

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        category: 'electronics',
        brand: 'Apple',
        modelName: 'iPhone 13',
        working: 'partly',
        condition: 'good',
        ageBracket: '1-2',
        faultType: 'Screen Replacement',
        quotedRepairCost: 4200,
        priority: 'balanced'
      })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.repair_or_release.verdict, 'borderline');
    assert.notEqual(json.data.recommended_path.path, 'repair');
    const itemId = json.data.item_id;
    assert.ok(itemId);

    // Owner can retrieve decision
    const getOwn = await fetch(`http://127.0.0.1:${port}/api/v1/decide/${itemId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(getOwn.status, 200);
    const ownJson = await getOwn.json();
    assert.equal(ownJson.data.decision_id, json.data.decision_id);

    // Another user cannot retrieve decision
    const getOther = await fetch(`http://127.0.0.1:${port}/api/v1/decide/${itemId}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(getOther.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

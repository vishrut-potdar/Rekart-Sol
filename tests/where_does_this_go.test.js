import test from 'node:test';
import assert from 'node:assert/strict';
import { WhereDoesThisGoService } from '../src/services/recycling/where_does_this_go.js';

test('WhereDoesThisGoService locates specialized hazardous e-waste facilities for tube lights and batteries', () => {
  // Tube light
  const cflCheck = WhereDoesThisGoService.lookup('CFL bulb mercury tube light');
  assert.ok(cflCheck.matches.length > 0);
  assert.equal(cflCheck.matches[0].can_put_in_regular_bin, false);
  assert.match(cflCheck.matches[0].danger_level, /mercury/i);

  // Inverter battery
  const batteryCheck = WhereDoesThisGoService.lookup('old inverter battery');
  assert.ok(batteryCheck.matches.length > 0);
  assert.equal(batteryCheck.matches[0].stream, 'FORMAL_LEAD_RECYCLER');
  assert.ok(batteryCheck.matches[0].scrap_payout_inr > 500);

  // Thermocol
  const thermocolCheck = WhereDoesThisGoService.lookup('packaging thermocol');
  assert.ok(thermocolCheck.matches.length > 0);
  assert.match(thermocolCheck.matches[0].nearest_nagpur_facility, /Itwari/i);
});

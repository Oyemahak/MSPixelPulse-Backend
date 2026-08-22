import assert from 'node:assert/strict';
import test from 'node:test';

import { portalEventInternals } from './portalEvents.js';

test('portal event subjects and headers use deterministic Gmail categories', () => {
  assert.equal(portalEventInternals.eventSubject('billing', 'Payment received - MSP-INV-1'), '[MSP:BILLING] Payment received - MSP-INV-1');
  assert.equal(portalEventInternals.eventSubject('requirements', 'New requirement'), '[MSP:REQUIREMENT] New requirement');
});

test('notification email preferences default important categories on and honor explicit off', () => {
  const preferences = portalEventInternals.normalizeEmailPreferences({ messages: false, billing: true });
  assert.equal(preferences.messages, false);
  assert.equal(preferences.billing, true);
  assert.equal(preferences.projects, true);
  assert.equal(preferences.support, true);
});

test('role action URLs preserve deep links without leaking another role route', () => {
  assert.equal(portalEventInternals.roleActionUrl('client', '/admin/billing', { client: '/client/billing' }), '/client/billing');
  assert.equal(portalEventInternals.roleActionUrl('developer', '', {}), '/dev');
});

test('operational portal notifications have one deterministic recipient', () => {
  const previous = process.env.PORTAL_OPERATIONAL_NOTIFICATION_EMAIL;
  delete process.env.PORTAL_OPERATIONAL_NOTIFICATION_EMAIL;
  assert.equal(portalEventInternals.operationalRecipient(), 'mspixelpulse@gmail.com');
  if (previous === undefined) delete process.env.PORTAL_OPERATIONAL_NOTIFICATION_EMAIL;
  else process.env.PORTAL_OPERATIONAL_NOTIFICATION_EMAIL = previous;
});

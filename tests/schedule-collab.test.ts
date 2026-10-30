import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotFor, isDigestSlot, nextScheduledRun } from '../lib/schedule.ts';
import { parseSubmission } from '../lib/collab-schema.ts';

test('eight distinct slots per UTC day, only the first sends the digest', () => {
  const slots = new Set<string>();
  for (let h = 0; h < 24; h++) slots.add(slotFor(new Date(Date.UTC(2026, 9, 30, h, 30))));
  assert.equal(slots.size, 8);
  assert.equal(slotFor(new Date('2026-10-30T03:30:00Z')), '2026-10-30T03');
  assert.equal(slotFor(new Date('2026-10-30T05:59:00Z')), '2026-10-30T03');
  assert.equal([...slots].filter(isDigestSlot).length, 1);
});

test('next scheduled run is the next :30 on a 3-hour boundary', () => {
  assert.equal(nextScheduledRun(new Date('2026-10-30T00:10:00Z')), '2026-10-30T00:30:00.000Z');
  assert.equal(nextScheduledRun(new Date('2026-10-30T00:30:00Z')), '2026-10-30T03:30:00.000Z');
  assert.equal(nextScheduledRun(new Date('2026-10-30T22:00:00Z')), '2026-10-31T00:30:00.000Z');
});

test('collaboration form validation', () => {
  const ok = { name: 'A', email: 'A@Example.com', product: 'P', message: 'We are building a booking app and need a designer.' };
  const good = parseSubmission(ok);
  assert.ok(good.ok && good.value.email === 'a@example.com' && good.value.deal === 'Not sure yet');
  for (const bad of [{ ...ok, email: 'nope' }, { ...ok, name: '' }, { ...ok, message: 'short' }, { ...ok, link: 'javascript:alert(1)' }])
    assert.equal(parseSubmission(bad).ok, false);
});

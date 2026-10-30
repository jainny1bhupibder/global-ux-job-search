// Pure scheduling helpers (no storage access) so they can be unit tested.
// Must match the schedule in .github/workflows/discover.yml: eight runs a day,
// every three hours at minute 30 UTC (00:30, 03:30 ... 21:30).
export const CRON_SCHEDULE = '30 */3 * * *';
export const CRON_DESCRIPTION = '8 times a day, every 3 hours at :30 UTC (first run 06:00 IST)';
const SLOT_HOURS = 3;

// One slot per three-hour window, e.g. "2026-10-30T03". A retried or duplicated
// delivery inside the same window is skipped; the next window runs normally.
export function slotFor(date = new Date()): string {
  const hour = Math.floor(date.getUTCHours() / SLOT_HOURS) * SLOT_HOURS;
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}`;
}

// The first window of each UTC day is the one that sends the email digest.
export function isDigestSlot(slot: string): boolean {
  return slot.endsWith('T00');
}

export function nextScheduledRun(from = new Date()): string {
  const next = new Date(from);
  next.setUTCMinutes(30, 0, 0);
  while (next.getTime() <= from.getTime() || next.getUTCHours() % SLOT_HOURS !== 0) {
    next.setUTCHours(next.getUTCHours() + 1);
    next.setUTCMinutes(30, 0, 0);
  }
  return next.toISOString();
}

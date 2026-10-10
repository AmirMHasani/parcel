// Service-wide processing capacity. These limits are Worker vars (wrangler.jsonc
// "vars"), so they can change with a redeploy instead of a code edit. Missing or
// out-of-range values fall back to the defaults below.
//
// MAX_CONCURRENT_JOBS: exports processed at the same moment across the service.
//   Enforced by the worker lease in lib/job-worker.ts; the scheduler in
//   worker/index.ts runs enough parallel tick lanes to fill it.
// MAX_CONCURRENT_PACKING: of those, exports building their ZIP at once (1–4).
//   A packing tick keeps one streaming storage upload open while it reads
//   images, and Cloudflare allows six connections waiting for a response per
//   scheduler run (shared by every tick it starts), so this must stay well
//   below six to leave room for image downloads and avoid a stall.
// MAX_ACTIVE_EXPORTS:  exports allowed to be waiting or processing at once.
//   New exports beyond this are refused with HTTP 429 ("queue is full").
//   Never lower than MAX_CONCURRENT_JOBS.
//
// Per-client limits (five new exports per day, two active per client) are
// separate and live in lib/jobs.ts.
function setting(value: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
export function maxConcurrentJobs(value = process.env.MAX_CONCURRENT_JOBS) {
  return setting(value, 10, 1, 50);
}
export function maxConcurrentPacking(value = process.env.MAX_CONCURRENT_PACKING) {
  return Math.min(maxConcurrentJobs(), setting(value, 2, 1, 4));
}
export function maxActiveExports(value = process.env.MAX_ACTIVE_EXPORTS) {
  return Math.max(maxConcurrentJobs(), setting(value, 30, 1, 1000));
}
// Rough time for one worker tick to save one image (used only for estimates).
export const SECONDS_PER_IMAGE = 1.5;

// Queue position and time estimates shown on the export page.
// Scheduling is round-robin: each tick saves one image for the export whose turn
// is oldest, so when more exports are active than the capacity, they take turns.
//   ahead        other active exports whose turn comes before this one
//   waitingAhead exports ahead of this one that have not started yet
//   shared       images other exports will process while this one finishes
//                (sum over other exports of min(their remaining, this remaining))
export function queueEstimate(
  job: { state: string; total: number; cursor: number; bytes: number },
  queue: { active: number; ahead: number; waitingAhead: number; shared: number },
  capacity = maxConcurrentJobs(),
) {
  const processing = ['queued', 'downloading', 'packing'].includes(job.state);
  const remaining = Math.max(0, job.total - job.cursor);
  const download = SECONDS_PER_IMAGE * Math.max(remaining, (remaining + queue.shared) / capacity);
  const packing = Math.ceil(Math.max(job.bytes, remaining * 1000000) / 20000000) * 5;
  const queued = job.state === 'queued';
  return {
    capacity,
    busy: queue.active > capacity,
    queuePosition: queued ? queue.waitingAhead + 1 : null,
    startSeconds: queued ? Math.ceil(Math.floor(queue.ahead / capacity) * SECONDS_PER_IMAGE) : null,
    // +60 s covers the gap until the next scheduled worker run.
    etaSeconds: processing ? Math.ceil(download) + 60 + packing + (queued ? Math.ceil(Math.floor(queue.ahead / capacity) * SECONDS_PER_IMAGE) : 0) : null,
  };
}

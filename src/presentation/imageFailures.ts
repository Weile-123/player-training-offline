const retryDelayMs = 30_000;
const maxFailures = 64;
const retryAfter = new Map<string, number>();

/** A broken image is shared between views for a short time, then may recover. */
export function imageRecentlyFailed(src: string): boolean {
 const retryAt = retryAfter.get(src);
 if (retryAt === undefined) return false;
 if (Date.now() < retryAt) return true;
 retryAfter.delete(src);
 return false;
}

export function rememberImageFailure(src: string): void {
 retryAfter.delete(src);
 retryAfter.set(src, Date.now() + retryDelayMs);
 if (retryAfter.size > maxFailures) {
  const oldest = retryAfter.keys().next();
  if (!oldest.done) retryAfter.delete(oldest.value);
 }
}

export function clearImageFailure(src: string): void {
 retryAfter.delete(src);
}

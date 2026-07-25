import type { Check, CheckStatus } from "@/lib/types";

const STATUS_VALUE: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

/**
 * Turn a list of checks into a 0-100 score. Weights let a missing viewport meta tag
 * cost more than a missing favicon; unlisted checks default to weight 1.
 */
export function scoreFromChecks(checks: Check[], weights: Record<string, number> = {}): number {
  let earned = 0;
  let possible = 0;

  for (const check of checks) {
    const weight = weights[check.id] ?? 1;
    earned += STATUS_VALUE[check.status] * weight;
    possible += weight;
  }

  if (possible === 0) return 0;
  return Math.round((earned / possible) * 100);
}

export function countByStatus(checks: Check[]): Record<CheckStatus, number> {
  return checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 } as Record<CheckStatus, number>,
  );
}

/**
 * When a sign goes up, when it comes down, and whether the yard is free.
 *
 * Dates here are plain ISO days (YYYY-MM-DD), never Date objects carrying a
 * time. A placement starts on a day and ends on a day; introducing hours would
 * mean introducing time zones, and "does this sign come down on the 3rd or the
 * 4th" is not a question anyone should have to reason about in UTC.
 *
 * Ranges are half-open — [starts_on, ends_on) — so a placement ending on the
 * 1st and one beginning on the 1st are back to back, not overlapping. The
 * database's exclusion constraint uses the same convention (migration 0010).
 */

import type { JurisdictionRules } from "@/lib/supabase/types";

/** Missouri and Kansas general election, 2026. */
export const ELECTION_WINDOW = {
  start: "2026-09-19",
  end: "2026-11-05",
  label: "Election window",
} as const;

export type Term = { startsOn: string; endsOn: string };

const DAY_MS = 86_400_000;

export const toISO = (d: Date): string => d.toISOString().slice(0, 10);

/** Parses an ISO day into a UTC-midnight Date, so arithmetic never shifts a day. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export const addDays = (iso: string, days: number): string =>
  toISO(new Date(parseDay(iso).getTime() + days * DAY_MS));

/**
 * Adds whole months, clamping to the end of a short month: a placement
 * starting 31 January and running one month ends 28 February, not 3 March.
 */
export function addMonths(iso: string, months: number): string {
  const d = parseDay(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toISO(target);
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS);

export const today = (): string => toISO(new Date());

/** The term a booking works out to, from what the advertiser chose. */
export function termFor(input: {
  startsOn: string;
  durationMonths?: number | null;
  isElectionWindow?: boolean;
}): Term {
  if (input.isElectionWindow) {
    return { startsOn: ELECTION_WINDOW.start, endsOn: ELECTION_WINDOW.end };
  }
  const months = input.durationMonths ?? 1;
  return { startsOn: input.startsOn, endsOn: addMonths(input.startsOn, months) };
}

const fmt = (iso: string, withYear: boolean) =>
  parseDay(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

/** "Oct 1 – Jan 1, 2027" — the year appears once, on the end, unless they differ. */
export function describeTerm({ startsOn, endsOn }: Term): string {
  const sameYear = startsOn.slice(0, 4) === endsOn.slice(0, 4);
  return `${fmt(startsOn, !sameYear)} – ${fmt(endsOn, true)}`;
}

export const describeDay = (iso: string): string => fmt(iso, true);

export type Booked = { startsOn: string; endsOn: string };

export type Availability =
  | { ok: true }
  | { ok: false; reason: string; freeFrom?: string };

const overlaps = (a: Term, b: Booked) => a.startsOn < b.endsOn && b.startsOn < a.endsOn;

/**
 * Whether a proposed term can actually be honoured on this yard.
 *
 * Three separate things can rule it out, and they fail for different reasons:
 * the yard is taken, the city caps how long a sign may stand, or the city
 * requires the yard to sit empty for a while after the last one came down.
 * Each gets its own sentence — "unavailable" tells an advertiser nothing they
 * can act on.
 */
export function checkAvailability(
  proposed: Term,
  booked: Booked[],
  rules?: JurisdictionRules | null,
): Availability {
  if (proposed.startsOn < today()) {
    return { ok: false, reason: "That start date has already passed." };
  }

  const clash = booked.find((b) => overlaps(proposed, b));
  if (clash) {
    return {
      ok: false,
      reason: `This yard already has a sign booked from ${describeDay(clash.startsOn)} to ${describeDay(clash.endsOn)}.`,
      freeFrom: clash.endsOn,
    };
  }

  const length = daysBetween(proposed.startsOn, proposed.endsOn);

  if (rules?.display_period_days && length > rules.display_period_days) {
    return {
      ok: false,
      reason: `This city allows a sign to stand for ${rules.display_period_days} days at a time. That term is ${length} days.`,
    };
  }

  /*
   * The gap rule — Overland Park's 60 on, 30 off. It only bites against a
   * placement that has already ended or is ending before this one starts;
   * an overlap would have been caught above.
   */
  if (rules?.gap_days) {
    const previous = booked
      .filter((b) => b.endsOn <= proposed.startsOn)
      .sort((a, b) => (a.endsOn < b.endsOn ? 1 : -1))[0];

    if (previous) {
      const rest = daysBetween(previous.endsOn, proposed.startsOn);
      if (rest < rules.gap_days) {
        const freeFrom = addDays(previous.endsOn, rules.gap_days);
        return {
          ok: false,
          reason: `This city requires the yard to sit empty for ${rules.gap_days} days after a sign comes down. The last one ends ${describeDay(previous.endsOn)}.`,
          freeFrom,
        };
      }
    }
  }

  return { ok: true };
}

/** The soonest day a term of this length could start on this yard. */
export function earliestStart(booked: Booked[], rules?: JurisdictionRules | null): string {
  const from = today();
  const future = booked
    .filter((b) => b.endsOn > from)
    .sort((a, b) => (a.endsOn < b.endsOn ? -1 : 1));

  if (future.length === 0) return from;

  const lastEnd = future[future.length - 1].endsOn;
  return rules?.gap_days ? addDays(lastEnd, rules.gap_days) : lastEnd;
}

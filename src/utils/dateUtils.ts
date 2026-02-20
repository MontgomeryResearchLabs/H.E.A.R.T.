/**
 * Date Utilities — Anniversary & Timeline Helpers
 * =================================================
 * Pure functions for calculating the time elapsed since a start date,
 * formatting dates for display, and checking if today is the anniversary.
 *
 * All date math uses the real calendar (months with varying lengths) rather
 * than the rough 365-day / 30-day approximation, giving the anniversary
 * counter pixel-perfect accuracy.
 *
 * @module utils/dateUtils
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * The start date of the relationship (July 4, 2023 at midnight EDT).
 * Hardcoded with a timezone offset so the counter is consistent
 * regardless of the viewer's timezone.
 */
export const RELATIONSHIP_START = new Date('2023-07-04T00:00:00-04:00');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Represents a human-readable time span broken into years, months, days. */
export interface TimeDifference {
  years: number;
  months: number;
  days: number;
}

/* ------------------------------------------------------------------ */
/*  Core Functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Calculates the calendar-accurate difference between two dates in
 * years, months, and days.
 *
 * The algorithm walks from `start` forward by whole years, then whole
 * months, then counts remaining days. This avoids the inaccuracy of
 * dividing total milliseconds by fixed constants (365 days, 30 days).
 *
 * @param start - The earlier date (e.g. relationship start)
 * @param end   - The later date (typically "today")
 * @returns An object with `years`, `months`, and `days`
 *
 * @example
 * getTimeDifference(new Date('2023-07-04'), new Date('2025-02-09'));
 * // → { years: 1, months: 7, days: 5 }
 */
export function getTimeDifference(start: Date, end: Date): TimeDifference {
  // Ensure we're always subtracting the earlier date from the later one
  let earlier = new Date(Math.min(start.getTime(), end.getTime()));
  let later   = new Date(Math.max(start.getTime(), end.getTime()));

  // --- Years ---
  let years = later.getFullYear() - earlier.getFullYear();
  // If we haven't reached the anniversary month/day yet this year, subtract 1
  if (
    later.getMonth() < earlier.getMonth() ||
    (later.getMonth() === earlier.getMonth() && later.getDate() < earlier.getDate())
  ) {
    years--;
  }

  // --- Months ---
  let months = later.getMonth() - earlier.getMonth();
  if (months < 0) months += 12; // wrap around December→January
  // If the day-of-month hasn't been reached, subtract one month
  if (later.getDate() < earlier.getDate()) {
    months--;
    if (months < 0) {
      months += 12;
      years--;
    }
  }

  // --- Days ---
  // Clone the start date, advance by `years` years and `months` months,
  // then count the remaining days.
  const advancedDate = new Date(earlier);
  advancedDate.setFullYear(advancedDate.getFullYear() + years);
  advancedDate.setMonth(advancedDate.getMonth() + months);

  const diffMs = later.getTime() - advancedDate.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return { years, months, days };
}

/**
 * Returns `true` if `date` falls on the relationship anniversary
 * (July 4 — matching the month and day of RELATIONSHIP_START).
 *
 * @param date - The date to check (defaults to today)
 */
export function isAnniversary(date: Date = new Date()): boolean {
  return (
    date.getMonth() === RELATIONSHIP_START.getMonth() &&
    date.getDate() === RELATIONSHIP_START.getDate()
  );
}

/**
 * Formats a Date into a human-readable string for timeline display.
 *
 * @param date    - The date to format
 * @param format  - 'long' → "July 4, 2023", 'short' → "Jul 4, 2023"
 * @returns Formatted date string
 *
 * @example
 * formatDate(new Date('2023-07-04'), 'long');  // "July 4, 2023"
 * formatDate(new Date('2023-07-04'), 'short'); // "Jul 4, 2023"
 */
export function formatDate(
  date: Date,
  format: 'long' | 'short' = 'long',
): string {
  return date.toLocaleDateString('en-US', {
    year:  'numeric',
    month: format === 'long' ? 'long' : 'short',
    day:   'numeric',
  });
}

/**
 * Builds a human-friendly string like "1 year, 7 months, 5 days together".
 *
 * Handles pluralisation and omits zero-value segments
 * (e.g. "2 years, 3 days" when months = 0).
 *
 * @param diff - A TimeDifference object
 * @returns Formatted string
 */
export function formatTimeDifference(diff: TimeDifference): string {
  const parts: string[] = [];

  if (diff.years > 0)  parts.push(`${diff.years} year${diff.years !== 1 ? 's' : ''}`);
  if (diff.months > 0) parts.push(`${diff.months} month${diff.months !== 1 ? 's' : ''}`);
  if (diff.days > 0)   parts.push(`${diff.days} day${diff.days !== 1 ? 's' : ''}`);

  // Edge case: if all values are 0 (same day), show a special message
  if (parts.length === 0) return 'Today is the day!';

  return parts.join(', ');
}

/**
 * Returns the month/year key used to group timeline entries
 * (e.g. "2023-07"), useful for calendar navigation highlights.
 *
 * @param date - The date to extract the key from
 * @returns A "YYYY-MM" formatted string
 */
export function getMonthKey(date: Date): string {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

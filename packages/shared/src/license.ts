import type { LicenseRecord } from "@couch/contracts";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * True when `value` is a real calendar date written as `YYYY-MM-DD`: four-digit year,
 * two-digit month and day, and a day that exists in that month (so `2026-02-30` is not
 * one, and `2024-02-29` is). Plain arithmetic, so no clock and no `Date` are involved.
 */
function isCalendarDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;

  const daysInMonth = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]!;
  return day <= daysInMonth;
}

/**
 * The one definition of "authorized" for a license record. Other packages call this
 * function and never reimplement it.
 *
 * True only when all of these hold:
 *
 * - `intendedUseAllowed` is true.
 * - `verifiedAt` is a real calendar date in `YYYY-MM-DD` form. The contract schema checks
 *   this too, but a database row can be built without going through the schema, so it is
 *   checked again here.
 * - When `attributionRequired` is true, `attribution` is a string that is non-empty after
 *   trimming.
 *
 * Deliberately NOT checked: that `verifiedAt` is not in the future. That would need a
 * clock, and this function takes none. A caller that has a clock and wants that rule
 * applies it separately.
 *
 * This function checks the shape and consistency of a record. It cannot know whether the
 * values are true. They come from a person who verified the source.
 */
export function isUseAuthorized(license: LicenseRecord): boolean {
  if (license.intendedUseAllowed !== true) return false;
  if (!isCalendarDate(license.verifiedAt)) return false;
  if (license.attributionRequired) {
    return typeof license.attribution === "string" && license.attribution.trim().length > 0;
  }
  return true;
}

// Pure fixture math for the group-collapse runner: the day buckets a grouped
// date field is expected to produce, written as absolute instants.
//
// Two load-bearing properties, guarded by group-buckets.test.js rather than by
// trusting this file:
//
//   1. Every instant is local midnight in the field's own time zone. That is
//      exactly what a day-bucket key is, so the group headers the product
//      returns can be compared to the configured instants literally — if an
//      instant sat mid-day, the header would legitimately differ and the
//      fixture check would fail for a reason that has nothing to do with the
//      bug.
//   2. Every bucket holds at least one row away from local midnight. A row at
//      exactly the bucket key is excluded correctly even by the broken filter,
//      because the mis-aimed instant still formats to that row's own day; only
//      rows elsewhere in the day fall on the wrong side of it. A fixture of
//      midnight-only rows is green on both sides of the fix and proves
//      nothing.
//   3. Consecutive buckets are consecutive local days. The failure this case
//      watches mis-aims the exclusion filter at the day *before* the collapsed
//      group, so the day before bucket N must be bucket N-1. Skip a day and
//      the "rows that should have stayed visible disappeared" half of the bug
//      lands on an empty day and is never observed.
//
// `localDay` is also the bucket's human label, so a third property keeps the
// evidence honest: the declared label must be the day the instant actually
// falls on.

export interface DayBucket {
  // The local calendar day this bucket covers, as YYYY-MM-DD in the field's
  // time zone. Used to build row titles, so every line of evidence names the
  // day it belongs to.
  localDay: string;
  // Local midnight of `localDay` in the field's time zone, as an instant.
  // This is the group key the product reports for the bucket.
  instant: string;
  // Hours after local midnight, one row each. At least two, and at least one
  // of them non-zero - see property 2 above.
  localHours: number[];
}

const dayFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const clockFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export const localDayOf = (instant: string, timeZone: string): string =>
  dayFormatter(timeZone).format(new Date(instant));

export const localClockOf = (instant: string, timeZone: string): string =>
  clockFormatter(timeZone).format(new Date(instant));

// Everything wrong with a bucket list, as messages — plural so a broken
// fixture is reported in one go instead of one round trip per problem.
export const bucketProblems = (
  buckets: readonly DayBucket[],
  timeZone: string,
): string[] => {
  const problems: string[] = [];
  if (buckets.length < 2) {
    problems.push(
      `need at least 2 day buckets to observe both directions of the failure, got ${buckets.length}`,
    );
  }

  buckets.forEach((bucket, index) => {
    const time = new Date(bucket.instant).getTime();
    if (Number.isNaN(time)) {
      problems.push(`bucket ${index}: "${bucket.instant}" is not an instant`);
      return;
    }
    const clock = localClockOf(bucket.instant, timeZone);
    if (clock !== "00:00:00") {
      problems.push(
        `bucket ${index} (${bucket.instant}) is ${clock} in ${timeZone}, not local midnight`,
      );
    }
    const day = localDayOf(bucket.instant, timeZone);
    if (day !== bucket.localDay) {
      problems.push(
        `bucket ${index} is labelled ${bucket.localDay} but falls on ${day} in ${timeZone}`,
      );
    }
    if (bucket.localHours.length < 2) {
      problems.push(
        `bucket ${index} (${bucket.localDay}) seeds ${bucket.localHours.length} rows — with fewer than 2, "the whole group leaked" and "one stray row" look the same`,
      );
    }
    if (bucket.localHours.some((hour) => hour < 0 || hour >= 24)) {
      problems.push(
        `bucket ${index} (${bucket.localDay}) has an hour outside the local day: [${bucket.localHours.join(", ")}]`,
      );
    }
    if (!bucket.localHours.some((hour) => hour !== 0)) {
      problems.push(
        `bucket ${index} (${bucket.localDay}) seeds only local midnight — a midnight row is excluded correctly even by the broken filter, so this fixture cannot observe the bug`,
      );
    }

    if (index === 0) return;
    const previous = buckets[index - 1];
    if (new Date(previous.instant).getTime() >= time) {
      problems.push(
        `bucket ${index} (${bucket.localDay}) is not after bucket ${index - 1} (${previous.localDay})`,
      );
      return;
    }
    // One millisecond before local midnight is the last moment of the previous
    // local day — DST-safe, unlike subtracting 24 hours, which is off by an
    // hour (and by a whole day at the boundary) on transition days.
    const dayBefore = localDayOf(new Date(time - 1).toISOString(), timeZone);
    if (dayBefore !== previous.localDay) {
      problems.push(
        `the local day before ${bucket.localDay} is ${dayBefore}, not bucket ${index - 1} (${previous.localDay}) — the mis-aimed exclusion would land on an empty day`,
      );
    }
  });

  return problems;
};

// A row's title names its bucket and its local hour, so every line of
// evidence says which day and which time of day it belongs to.
export const rowTitle = (bucket: DayBucket, localHour: number): string =>
  `${bucket.localDay}#${String(localHour).padStart(2, "0")}h`;

export const bucketRows = (
  bucket: DayBucket,
): { title: string; instant: string }[] =>
  bucket.localHours.map((hour) => ({
    title: rowTitle(bucket, hour),
    instant: new Date(
      new Date(bucket.instant).getTime() + hour * 3_600_000,
    ).toISOString(),
  }));

export const bucketTitles = (bucket: DayBucket): string[] =>
  bucketRows(bucket).map((row) => row.title);

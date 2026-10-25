// Calendar dates on this phone's clock. `toISOString().slice(0, 10)` is the UTC date — in India that's still
// "yesterday" until 5:30 am — so anything shown or saved as "today" goes through here.
export const localDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Only an age is known: born the day before today, that many years ago (same rule as the server), so the age
// reads right all year and a baby of age 0 isn't given a birthday in the future.
export function dobFromAge(age) {
  const d = new Date(`${localDay()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCFullYear(d.getUTCFullYear() - Number(age));
  return d.toISOString().slice(0, 10);
}

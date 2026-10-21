/* eslint-disable no-undef -- process is a Node global; vitest runs in Node */

/**
 * Runs `check(zone)` once for each time zone, with the process's TZ set to it (so `new Date().toLocaleDateString()`
 * and the like read in that zone), and puts TZ back afterwards. A test that only passes in the zone of the machine
 * running it (UTC on CI, New York on the owner's laptop) is not a test of the zone handling.
 * @param {string[]} zones  IANA names, e.g. 'Asia/Tokyo'
 * @param {(zone: string) => void} check
 */
export function inTimeZones(zones, check) {
  const was = process.env.TZ;
  try {
    for (const zone of zones) {
      process.env.TZ = zone;
      check(zone);
    }
  } finally {
    if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
  }
}

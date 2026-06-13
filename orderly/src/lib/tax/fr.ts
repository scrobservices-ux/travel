/**
 * French business identifier validation (no accreditation needed).
 *
 * SIREN (9 digits) and SIRET (14 digits) both validate with the Luhn algorithm
 * — useful for "annuaire" (directory) readiness: routing under the e-invoicing
 * reform keys off a correct SIREN/SIRET.
 */

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isValidSiren(siren?: string | null): boolean {
  if (!siren) return false;
  const s = siren.replace(/\s/g, "");
  return /^\d{9}$/.test(s) && luhnValid(s);
}

export function isValidSiret(siret?: string | null): boolean {
  if (!siret) return false;
  const s = siret.replace(/\s/g, "");
  if (!/^\d{14}$/.test(s)) return false;
  // La Poste SIRET (356000000…) is a documented Luhn exception.
  if (s.startsWith("356000000")) {
    const digitSum = s.split("").reduce((acc, c) => acc + (c.charCodeAt(0) - 48), 0);
    return digitSum % 5 === 0;
  }
  return luhnValid(s);
}

/** A SIRET's first 9 digits are its SIREN. */
export function sirenFromSiret(siret: string): string {
  return siret.replace(/\s/g, "").slice(0, 9);
}

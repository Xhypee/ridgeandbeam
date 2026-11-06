/** Australian states and territories, time zones and formats used across the app. */

export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
export type AuState = (typeof AU_STATES)[number];

export const AU_STATE_NAME: Record<AuState, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

/** IANA zones (QLD has no daylight saving; NT/SA are ACST; WA is AWST). */
export const AU_STATE_TZ: Record<AuState, string> = {
  NSW: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  QLD: "Australia/Brisbane",
  WA: "Australia/Perth",
  SA: "Australia/Adelaide",
  TAS: "Australia/Hobart",
  ACT: "Australia/Sydney",
  NT: "Australia/Darwin",
};

export function asAuState(v: string | null | undefined): AuState | null {
  const s = (v ?? "").trim().toUpperCase();
  return (AU_STATES as readonly string[]).includes(s) ? (s as AuState) : null;
}

/** Postcode → state (Australia Post ranges; good enough for defaults, user can override). */
export function stateFromPostcode(pc: string | null | undefined): AuState | null {
  const n = Number((pc ?? "").trim());
  if (!Number.isInteger(n) || n < 200) return null;
  if ((n >= 200 && n <= 299) || (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return "ACT";
  if ((n >= 800 && n <= 999)) return "NT";
  if ((n >= 1000 && n <= 2599) || (n >= 2619 && n <= 2899) || (n >= 2921 && n <= 2999)) return "NSW";
  if ((n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999)) return "VIC";
  if ((n >= 4000 && n <= 4999) || (n >= 9000 && n <= 9999)) return "QLD";
  if (n >= 5000 && n <= 5999) return "SA";
  if (n >= 6000 && n <= 6999) return "WA";
  if (n >= 7000 && n <= 7999) return "TAS";
  return null;
}

/** GST is 10%. Prices are quoted GST-inclusive to consumers (ACL single-price rule). */
export const GST_RATE = 0.1;
export const gstOfInclusive = (inc: number) => Math.round((inc / 11) * 100) / 100;
export const exGst = (inc: number) => Math.round((inc / 1.1) * 100) / 100;

/** ABN: 11 digits with the ATO weighted checksum. */
export function isValidAbn(abn: string | null | undefined): boolean {
  const d = (abn ?? "").replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = d.split("").map(Number);
  digits[0] -= 1;
  return digits.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}

export const formatAbn = (abn: string) => abn.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4");

/** Australian mobile 04xx xxx xxx → +614xxxxxxxx. */
export function auPhoneE164(p: string | null | undefined): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  if (/^04\d{8}$/.test(d)) return "+61" + d.slice(1);
  if (/^614\d{8}$/.test(d)) return "+" + d;
  if (/^0[2378]\d{8}$/.test(d)) return "+61" + d.slice(1);
  if (/^61[2378]\d{8}$/.test(d)) return "+" + d;
  return null;
}

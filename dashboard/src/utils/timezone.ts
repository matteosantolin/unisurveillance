// Conversioni tra orario locale (HH:MM nel fuso del browser) e orario UTC.
// Le regole di alert sono persistite in UTC; il form mostra/accetta orari locali.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function localTimeToUtc(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function utcTimeToLocal(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Định dạng / chuyển đổi ngày giờ. Mọi tính toán nghiệp vụ dùng phút (số nguyên). */

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Cho phép > 24h ("25:00") để biểu thị giờ về của ca tràn sang ngày hôm sau. */
export function minutesToHm(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function hmToMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** "08:00" -> "08:00", null -> "—" */
export function hmOrDash(hm: string | null | undefined): string {
  return hm ? hm : '—';
}

export function formatMinutes(mins: number): string {
  const sign = mins < 0 ? '-' : '';
  const m = Math.abs(Math.round(mins));
  const h = Math.floor(m / 60);
  return h > 0 ? `${sign}${h}h${pad2(m % 60)}` : `${sign}${m}m`;
}

/** Có dấu, dùng cho cột Balance: +30m / -30m / 0 */
export function formatSigned(mins: number): string {
  if (mins === 0) return '0';
  return `${mins > 0 ? '+' : '-'}${formatMinutes(Math.abs(mins)).replace(/^-/, '')}`;
}

/** 90 -> "1 giờ 30 phút", -90 -> "1 giờ 30 phút" (mất dấu, caller tự thêm chữ thiếu/dư) */
export function formatMinutesVi(mins: number): string {
  const m = Math.abs(Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} phút`;
  return r === 0 ? `${h} giờ` : `${h} giờ ${r} phút`;
}

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function parseIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** 0 = Chủ Nhật ... 5 = Thứ Sáu, 6 = Thứ Bảy (JS chuẩn) */
export function weekday(iso: string): number {
  return parseIso(iso).getDay();
}

/** Ngày Thứ Hai của tuần chứa `iso` */
export function mondayOf(iso: string): string {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Ngày làm việc trong khoảng [from, to] inclusive, trừ các thứ theo `weekendDays` (0 = CN). */
export function workingDates(fromIso: string, toIso: string, weekendDays: number[] = [0]): string[] {
  const out: string[] = [];
  const end = parseIso(toIso).getTime();
  for (let t = parseIso(fromIso).getTime(); t <= end; t += 86_400_000) {
    const iso = isoDate(new Date(t));
    if (!weekendDays.includes(weekday(iso))) out.push(iso);
  }
  return out;
}

export function formatViDate(iso: string): string {
  const d = parseIso(iso);
  return `${WD[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** Khoảng thời gian hiển thị "05/10 - 11/10" */
export function formatRange(fromIso: string, toIso: string): string {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  return `${pad2(a.getDate())}/${pad2(a.getMonth() + 1)} - ${pad2(b.getDate())}/${pad2(b.getMonth() + 1)}`;
}

const MONTHS_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

export function formatMonthVi(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_VI[(m ?? 1) - 1]} ${y}`;
}

/** Giờ hiện tại dạng "HH:MM" */
export function nowHm(d = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

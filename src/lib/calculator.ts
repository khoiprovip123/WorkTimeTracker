/**
 * WorkTimeCalculator — toàn bộ rule nghiệp vụ giờ công, thuần túy (không I/O).
 * UI và tầng DB chỉ gọi các hàm ở đây, không tự tính.
 *
 * Quy ước: `today` = ngày hiện tại (ISO), `nowMinutes` = phút của giờ hiện tại
 * trong `today`. Truyền tường bạch để mọi hàm test được, không phụ thuộc đồng hồ máy.
 */
import { addDays, hmToMinutes, minutesToHm, mondayOf, weekDates, weekday, workingDates } from './time';
import type {
  CarryOver,
  CheckoutTarget,
  DayLayout,
  DayReport,
  LeaveRecord,
  PeriodReport,
  Settings,
  WorkLog,
} from './types';

export const DEFAULT_SETTINGS: Settings = {
  morningStart: 480, // 08:00
  morningEnd: 720, // 12:00
  afternoonStart: 810, // 13:30
  standardEnd: 1050, // 17:30
  latestNormalCheckIn: 540, // 09:00
  dailyRequiredMinutes: 480,
  weeklyRequiredMinutes: 2400,
  showTrayIcon: true,
  showTrayTitle: true,
};

/**
 * Phút làm việc trong [a, b]: sáng [morningStart, morningEnd] + chiều [afternoonStart, b].
 * Mọi cap đều là số hữu hạn — không truyền Infinity/vô hạn vào đây, các phép min/max
 * sẽ trả NaN và âm thầm làm hỏng mọi phép tính giờ.
 */
function overlap(a: number, b: number, layout: DayLayout): number {
  if (b <= a) return 0;
  const morning = Math.max(0, Math.min(b, layout.morningEnd) - Math.max(a, layout.morningStart));
  const afternoon = Math.max(0, b - Math.max(a, layout.afternoonStart));
  return morning + afternoon;
}

/**
 * Giờ làm việc đã làm, đã trừ nghỉ trưa.
 *  - Về trước standard_end: tính tới đúng giờ về, thiếu là thiếu thật.
 *  - Về sau standard_end: coi như đã ngồi trọn tới hết giờ hành chính, phần sau 17:30 tính hết.
 *    (Ai ở lại muộn thì nghỉ chiều mấy cũng đã có mặt, không trừ thêm.)
 */
export function calculateWorkedMinutes(
  checkIn: string | null,
  checkOut: string | null,
  layout: DayLayout = DEFAULT_SETTINGS,
): number | null {
  const ci = hmToMinutes(checkIn);
  const co = hmToMinutes(checkOut);
  if (ci === null || co === null) return null;
  if (co <= layout.standardEnd) return overlap(ci, co, layout);
  // Về sau giờ hành chính: coi như đã ngồi trọn tới 17:30 (nghỉ chiều mấy cũng đã
  // có mặt) + toàn bộ thời gian ở lại sau 17:30.
  return overlap(ci, layout.standardEnd, layout) + (co - layout.standardEnd);
}

export function isDailyTargetMet(workedMinutes: number, layout: DayLayout | Settings = DEFAULT_SETTINGS): boolean {
  const requiredMinutes = 'dailyRequiredMinutes' in layout
    ? layout.dailyRequiredMinutes
    : DEFAULT_SETTINGS.dailyRequiredMinutes;
  return workedMinutes >= requiredMinutes;
}

/** Phút đi trễ so với giờ bắt đầu. Đến trước 08:00 không tính. */
export function calculateLateMinutes(checkIn: string | null, layout: DayLayout = DEFAULT_SETTINGS): number {
  const ci = hmToMinutes(checkIn);
  return ci === null ? 0 : Math.max(0, ci - layout.morningStart);
}

/** Check-in sau latest_normal_check_in (09:00) -> phải dùng phép. */
export function needsLeavePermission(checkIn: string | null, layout: DayLayout = DEFAULT_SETTINGS): boolean {
  const ci = hmToMinutes(checkIn);
  return ci !== null && ci > layout.latestNormalCheckIn;
}

/**
 * Thời điểm cần về để làm đủ `remainingMinutes`.
 *
 * Lấy giờ vào làm + số phút còn thiếu + phần nghỉ trưa chắn giữa (12:00-13:30).
 * Ca chỉ làm buổi sáng phải ngồi chờ hết nghỉ nên về 13:30 chứ không phải 12:00;
 * đi trễ bao nhiêu thì giờ về lùi đúng bấy nhiêu (08:37 -> 18:07).
 */
/**
 * Thời điểm cần về để làm đủ `remainingMinutes`, tính từ lúc bắt đầu làm.
 *
 * Tìm phút T nhỏ nhất sao cho "giờ làm tích lũy từ start tới T" >= số phút cần.
 * Tìm bằng số học thay vì lặp: giờ làm = tổng thời gian trừ nghỉ trưa, và ta
 * thử hai ứng viên (không chạm nghỉ trưa / đã qua nghỉ trưa) rồi lấy ứng viên
 * hợp lệ nhỏ nhất -> 08:00+480' = 17:30, 08:37+480' = 18:07, 08:00+241' = 13:31.
 */
export function calculateRequiredCheckout(
  checkIn: string | null,
  remainingMinutes: number,
  layout: DayLayout = DEFAULT_SETTINGS,
): CheckoutTarget {
  if (remainingMinutes <= 0) return { time: null, remainingMinutes: 0, past: false, midnight: false };
  const ci = hmToMinutes(checkIn);
  if (ci === null) return { time: null, remainingMinutes, past: false, midnight: false };

  const start = Math.max(ci, layout.morningStart);
  const candidates: number[] = [];

  // 1) Chưa kịp chạm nghỉ trưa (chỉ có thể khi start đã nằm trong giờ sáng).
  if (start < layout.morningEnd) {
    const t = start + remainingMinutes;
    if (t <= layout.morningEnd) candidates.push(t);
  }
  // 2) Đã qua nghỉ trưa: trừ nghỉ (nếu nghỉ còn nằm phía sau start).
  const rest = Math.max(0, layout.afternoonStart - Math.max(start, layout.morningEnd));
  const t2 = start + remainingMinutes + rest;
  if (t2 >= layout.afternoonStart || start >= layout.afternoonStart) candidates.push(t2);

  if (candidates.length === 0) return { time: '00:00', remainingMinutes, past: false, midnight: true };
  return { time: minutesToHm(Math.min(...candidates)), remainingMinutes, past: false, midnight: false };
}

/**
 * Giờ dự kiến đủ chỉ tiêu hôm nay, kèm cảnh báo ca đã quá giờ hành chính.
 *
 * `requiredMinutes` đã gồm nợ carry-over. `workedMinutes` là giờ đã làm tới hiện
 * tại (giờ hiện tại nếu chưa chốt công). Khi đã qua giờ hành chính mà vẫn thiếu
 * thì không còn chỗ trong hôm nay -> `past`, phải tính ngày khác bù.
 */
export function projectCheckout(input: {
  checkIn: string | null;
  requiredMinutes: number;
  workedMinutes: number;
  nowMinutes: number;
  layout?: DayLayout;
}): CheckoutTarget {
  const layout = input.layout ?? DEFAULT_SETTINGS;
  const remaining = input.requiredMinutes - input.workedMinutes;
  if (remaining <= 0) return { time: null, remainingMinutes: 0, past: false, midnight: false };
  if (input.nowMinutes > layout.standardEnd) {
    return { time: null, remainingMinutes: remaining, past: true, midnight: false };
  }
  return calculateRequiredCheckout(input.checkIn, remaining, layout);
}

/** Thứ Sáu -> Thứ Hai tuần kế tiếp. */
export function nextMonday(iso: string): string {
  return addDays(mondayOf(iso), 7);
}

export interface CarryRule {
  /** Chỉ ngày này mới sinh carry-over (5 = Thứ Sáu). -1 = mọi ngày làm việc. */
  weekday: number;
  /** Ngày nhận nợ. */
  target: (sourceIso: string) => string;
}

/** Rule mặc định: chỉ Thứ Sáu được nợ sang Thứ Hai tuần kế. */
export const FRIDAY_TO_MONDAY: CarryRule = { weekday: 5, target: nextMonday };

/**
 * Số phút Thứ Sáu còn thiếu để sinh carry-over. Chỉ tính khi ngày đã kết thúc:
 * có check-out, hoặc hôm nay đúng là ngày đó và đã quá standard_end.
 */
export function calculateCarryOver(input: {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  requiredMinutes: number;
  leaveMinutes?: number;
  layout?: DayLayout;
  today: string;
  nowMinutes: number;
  rule?: CarryRule;
}): number | null {
  const layout = input.layout ?? DEFAULT_SETTINGS;
  const rule = input.rule ?? FRIDAY_TO_MONDAY;
  if (rule.weekday >= 0 && weekday(input.date) !== rule.weekday) return null;
  if (input.date > input.today) return null;
  // Ngày hôm nay chưa quá giờ hành chính thì còn đang làm, nợ chưa chốt.
  if (!input.checkOut && input.nowMinutes <= layout.standardEnd) return null;

  const balance =
    (calculateWorkedMinutes(input.checkIn, input.checkOut, layout) ?? 0) +
    (input.leaveMinutes ?? 0) -
    input.requiredMinutes;
  return balance < 0 ? -balance : null;
}

export interface DayReportInput {
  date: string;
  log?: WorkLog;
  leaveMinutes?: number;
  /** Nợ carry-over chưa trả mà ngày này phải gánh. */
  carryMinutes?: number;
  settings?: Settings;
  /** 0 = Chủ Nhật. Rỗng = mọi ngày đều làm việc. */
  weekendDays?: number[];
  today: string;
  nowMinutes: number | null;
}

function isWeekend(iso: string, weekendDays?: number[]): boolean {
  return (weekendDays ?? []).includes(weekday(iso));
}

function isWeekday(iso: string, weekendDays?: number[]): boolean {
  return !isWeekend(iso, weekendDays);
}

/** Ngày đã kết thúc: đã qua, hoặc hôm nay có check-out / đã quá giờ hành chính. */
function isDayFinished(
  date: string,
  log: WorkLog | undefined,
  today: string,
  nowMinutes: number | null,
  settings: Settings,
): boolean {
  if (date < today) return true;
  if (date > today) return false;
  return Boolean(log?.checkOut) || (nowMinutes ?? 0) > settings.standardEnd;
}

/**
 * Ngày: `requiredMinutes` = chuẩn ngày + carry-over, 0 với ngày chưa tới / chưa kết thúc.
 * `balance` = worked + phép - required. Giờ dôi (worked > chuẩn) không tự xoá thiếu
 * của chính ngày đó — nó là quỹ bù giờ cấp tuần/tháng.
 * `balance` = worked + phép - required.
 */
const WEEK_DAYS = 5;

export function buildDayReport(input: DayReportInput): DayReport {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const log = input.log;
  const leaveMinutes = input.leaveMinutes ?? 0;
  const isWorkingDay = !isWeekend(input.date, input.weekendDays);
  const worked = calculateWorkedMinutes(log?.checkIn ?? null, log?.checkOut ?? null, settings) ?? 0;
  const finished = isDayFinished(input.date, log, input.today, input.nowMinutes, settings);
  // "Nghỉ" giữa buổi chiều (17:30 -> afternoonStart + độ dài nghỉ trưa) không được
  // tính là giờ dôi. Ca sáng về sớm vì vậy vẫn đúng 8h, không phải dư 90'.
  const longLunch = settings.standardEnd + (settings.afternoonStart - settings.morningEnd);
  const overtime = Math.max(0, worked - Math.max(settings.dailyRequiredMinutes, longLunch));

  // Ngày mang nợ carry-over hoặc ghi chỉ tiêu riêng: giữ đúng chỉ tiêu đó.
  // Ngày thường đã kết thúc: làm đủ 8h, giờ dôi tính vào quỹ bù giờ chung.
  // Ngày nghỉ (T7) mà đi làm: cấn vào chỉ tiêu tuần, mặc định 480 - 2400/5 = 0.
  // Ngày phép: trả lại đúng số phút đã duyệt.
  const required = !isWorkingDay || !finished
    ? 0
    : (log?.requiredMinutes ??
       (isWeekday(input.date, input.weekendDays)
         ? settings.dailyRequiredMinutes
         : settings.dailyRequiredMinutes - Math.round(settings.weeklyRequiredMinutes / WEEK_DAYS)) +
         (input.carryMinutes ?? 0));

  return {
    date: input.date,
    checkIn: log?.checkIn ?? null,
    checkOut: log?.checkOut ?? null,
    workedMinutes: worked,
    requiredMinutes: required,
    leaveMinutes,
    overtimeMinutes: overtime,
    carryMinutes: input.carryMinutes ?? 0,
    balance: worked + leaveMinutes - required,
    lateMinutes: calculateLateMinutes(log?.checkIn ?? null, settings),
    needsLeave: needsLeavePermission(log?.checkIn ?? null, settings),
    hasLog: Boolean(log),
    isWorkingDay,
    carry: null,
    note: log?.note ?? '',
  };
}

/**
 * Tổng hợp một kỳ (tuần / tháng).
 *
 * `requiredMinutes` chỉ tính cho ngày ĐÃ KẾT THÚC (có check-out, hoặc hôm nay đã quá
 * giờ hành chính) -> balance là chênh lệch "tính đến hiện tại", ngày đang làm dở và
 * ngày chưa tới không bị tính là thiếu. `projectedBalance` nhân nhịp trung bình của
 * các ngày đã kết thúc cho cả kỳ để trả lời "cuối kỳ có đủ giờ không".
 */
export function buildPeriodReport(input: {
  from: string;
  to: string;
  logs: WorkLog[];
  leaves: LeaveRecord[];
  carryOvers?: CarryOver[];
  settings?: Settings;
  weekendDays?: number[];
  today: string;
  nowMinutes: number | null;
}): PeriodReport {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const dates = workingDates(input.from, input.to, input.weekendDays);
  const byDate = new Map(input.logs.map((l) => [l.date, l]));
  const leaveByDate = new Map<string, number>();
  for (const lv of input.leaves) leaveByDate.set(lv.date, (leaveByDate.get(lv.date) ?? 0) + lv.minutes);
  const carryByDate = new Map<string, number>();
  for (const c of input.carryOvers ?? []) {
    if (!c.resolved) carryByDate.set(c.targetDate, (carryByDate.get(c.targetDate) ?? 0) + c.minutes);
  }
  const carryBySource = new Map((input.carryOvers ?? []).map((c) => [c.sourceDate, c]));

  const days = dates.map((date) => {
    const day = buildDayReport({
      date,
      log: byDate.get(date),
      leaveMinutes: leaveByDate.get(date),
      carryMinutes: carryByDate.get(date),
      settings,
      weekendDays: input.weekendDays,
      today: input.today,
      nowMinutes: input.nowMinutes,
    });
    day.carry = carryBySource.get(date) ?? null;
    return day;
  });

  // Cộng dồn các ngày ĐÃ KẾT THÚC. Ngày dôi giờ chỉ được tính dôi bằng phần vượt
  // chuẩn ngày, phần thiếu của ngày khác vẫn phải trả -> "dư ngày này bù thiếu ngày kia".
  // Chỉ tính chỉ tiêu của ngày ĐÃ CHỐT CÔNG (có giờ về hoặc đã quá giờ hành chính).
  // Ngày chưa chấm công -> chưa kết thúc -> không bị tính thiếu: app này ghi nhận
  // công thực làm, không tự bịa ngày vắng mặt.
  let requiredMinutes = 0;
  let overtimeMinutes = 0;
  let elapsedDays = 0;
  for (const day of days) {
    overtimeMinutes += day.overtimeMinutes;
    if (day.hasLog && day.requiredMinutes > 0) {
      elapsedDays++;
      requiredMinutes += day.requiredMinutes;
    }
  }
  const workedMinutes = days.reduce((s, d) => s + d.workedMinutes, 0);
  const leaveMinutes = days.reduce((s, d) => s + d.leaveMinutes, 0);
  // Cân đối kỳ = giờ đã làm + phép - chỉ tiêu, cộng phần dôi thật (đã trừ "nghỉ chiều").
  const surplusMinutes = overtimeMinutes;
  const balance = workedMinutes + leaveMinutes - requiredMinutes;
  const debtMinutes = Math.max(0, requiredMinutes + leaveMinutes - workedMinutes);
  const daysLeft = dates.filter((d) => d > input.today).length;
  const perDay = elapsedDays > 0 ? balance / elapsedDays : 0;

  return {
    from: input.from,
    to: input.to,
    workedMinutes,
    requiredMinutes,
    leaveMinutes,
    overtimeMinutes,
    debtMinutes,
    surplusMinutes,
    balance,
    workingDays: dates.length,
    elapsedDays,
    remainingDays: daysLeft,
    daysLeft,
    projectedBalance: Math.round(perDay * dates.length),
    days,
  };
}

export function weekReport(input: {
  monday: string;
  logs: WorkLog[];
  leaves: LeaveRecord[];
  carryOvers?: CarryOver[];
  settings?: Settings;
  weekendDays?: number[];
  today: string;
  nowMinutes: number | null;
}): PeriodReport {
  const dates = weekDates(input.monday);
  return buildPeriodReport({ ...input, from: dates[0]!, to: dates[6]! });
}

export function monthReport(input: {
  monthKey: string;
  logs: WorkLog[];
  leaves: LeaveRecord[];
  carryOvers?: CarryOver[];
  settings?: Settings;
  weekendDays?: number[];
  today: string;
  nowMinutes: number | null;
}): PeriodReport {
  const [y, m] = input.monthKey.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return buildPeriodReport({
    ...input,
    from: `${input.monthKey}-${pad(1)}`,
    to: `${input.monthKey}-${pad(last)}`,
  });
}

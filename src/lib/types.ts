/** Layout một ngày làm việc, tất cả tính bằng phút kể từ 00:00. */
export interface DayLayout {
  /** Giờ tính là đi làm, đến sớm hơn cũng không tính. */
  morningStart: number;
  /** Start giờ nghỉ trưa. */
  morningEnd: number;
  /** End giờ nghỉ trưa = bắt đầu chiều. */
  afternoonStart: number;
  /** Hết giờ hành chính; làm sau giờ này là bù giờ. */
  standardEnd: number;
  /** Check-in sau giờ này phải dùng phép, không tính là giờ thường. */
  latestNormalCheckIn: number;
}

export type Settings = DayLayout & {
  /** Phút phải làm trong ngày (480 = 8h), không kể nợ carry-over. */
  dailyRequiredMinutes: number;
  /** Phút phải làm trong tuần (2400 = 40h). */
  weeklyRequiredMinutes: number;
  /** Hiện icon tray trên Linux/desktop. */
  showTrayIcon: boolean;
  /** Hiện thời gian làm trên header/title của tray. */
  showTrayTitle: boolean;
  /** Tự khởi động cùng hệ thống. */
  autoStartOnBoot: boolean;
  /** Tự bắt đầu ca làm khi ứng dụng được mở. */
  autoStartWorkSession: boolean;
};

export interface WorkLog {
  id: number;
  /** ISO yyyy-mm-dd */
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  /** Phút phải làm trong ngày, gồm cả nợ carry-over. NULL = dùng daily_required_minutes. */
  requiredMinutes: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRecord {
  id: number;
  date: string;
  minutes: number;
  type: string;
  note: string;
}

export interface CarryOver {
  id: number;
  sourceDate: string;
  targetDate: string;
  minutes: number;
  resolved: boolean;
  createdAt: string;
}

/** Kết quả tính cho một ngày, feeding dashboard + history table. */
export interface DayReport {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  /** Phút làm việc thực tế, đã trừ nghỉ trưa và clamp theo quy tắc. */
  workedMinutes: number;
  /** Phút phải làm = daily_required + carry-over nợ. */
  requiredMinutes: number;
  /** Phút có phép đã duyệt. */
  leaveMinutes: number;
  /** Phút làm ngoài chỉ tiêu ngày ( worked > daily_required ). */
  overtimeMinutes: number;
  /** workedMinutes + leaveMinutes - requiredMinutes. */
  balance: number;
  /** Phút nợ carry-over ngày này phải trả. */
  carryMinutes: number;
  /** Phút đi trễ so với morning_start (>= 0). */
  lateMinutes: number;
  /** Check-in sau latest_normal_check_in -> cần dùng phép. */
  needsLeave: boolean;
  /** Ngày có work log. */
  hasLog: boolean;
  /** Ngày làm việc theo lịch (không phải cuối tuần). */
  isWorkingDay: boolean;
  carry: CarryOver | null;
  note: string;
}

/**
 * Thời điểm cần về.
 *  - `time`:   "HH:MM" dự kiến đủ giờ; null = hôm nay không còn việc phải làm.
 *  - `past`:   ca làm đã kết thúc (đã quá standard_end, hoặc đã quá nửa đêm) mà vẫn thiếu.
 *  - `midnight`: thiếu giờ, phải làm sang ngày hôm sau.
 */
export interface CheckoutTarget {
  time: string | null;
  remainingMinutes: number;
  past: boolean;
  midnight: boolean;
}

export interface PeriodReport {
  from: string;
  to: string;
  /** Tổng phút đã làm. */
  workedMinutes: number;
  /** Tổng phút phải làm của các ngày đã qua. */
  requiredMinutes: number;
  /** Phút phép đã duyệt. */
  leaveMinutes: number;
  /** worked + leave - required. */
  balance: number;
  /** Tổng phút làm ngoài chỉ tiêu ngày trong kỳ. */
  overtimeMinutes: number;
  /** Tổng nợ của các ngày đã kết thúc, trước khi cấn giờ dôi. */
  debtMinutes: number;
  /** Giờ dôi còn lại sau khi cấn nợ -> cộng vào chỉ tiêu cuối kỳ. */
  surplusMinutes: number;
  /** Số ngày làm việc trong kỳ. */
  workingDays: number;
  /** Số ngày làm việc đã kết thúc (để nhân dự báo). */
  elapsedDays: number;
  /** Số ngày làm việc còn lại của kỳ. */
  remainingDays: number;
  /** Còn bao nhiêu ngày nữa kết thúc kỳ. */
  daysLeft: number;
  /** Balance cuối kỳ nếu giữ nguyên nhịp hiện tại. */
  projectedBalance: number;
  days: DayReport[];
}

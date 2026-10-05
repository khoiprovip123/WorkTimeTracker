import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  FRIDAY_TO_MONDAY,
  buildDayReport,
  calculateCarryOver,
  calculateLateMinutes,
  calculateRequiredCheckout,
  calculateWorkedMinutes,
  isDailyTargetMet,
  monthReport,
  needsLeavePermission,
  nextMonday,
  projectCheckout,
  weekReport,
} from '../calculator';
import type { CarryOver, LeaveRecord, WorkLog } from '../types';

const S = DEFAULT_SETTINGS;

function log(date: string, checkIn: string | null, checkOut: string | null, extra: Partial<WorkLog> = {}): WorkLog {
  return {
    id: 1,
    date,
    checkIn,
    checkOut,
    workedMinutes: 0,
    requiredMinutes: null,
    note: '',
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

function leave(date: string, minutes: number): LeaveRecord {
  return { id: 1, date, minutes, type: 'phép', note: '' };
}

describe('calculateWorkedMinutes', () => {
  it('cases from the spec', () => {
    expect(calculateWorkedMinutes('07:30', '17:00')).toBe(450); // 7h30, thiếu 30'
    expect(calculateWorkedMinutes('07:30', '17:30')).toBe(480); // đủ 8h
    expect(calculateWorkedMinutes('08:30', '18:00')).toBe(480); // đi trễ 30' + bù 30' = đủ
    expect(calculateWorkedMinutes('08:00', '12:00')).toBe(240); // 4h sáng
    expect(calculateWorkedMinutes('08:00', '13:30')).toBe(240); // nghỉ trưa không tính
    expect(calculateWorkedMinutes('12:00', '13:30')).toBe(0); // chỉ nghỉ trưa
    expect(calculateWorkedMinutes('12:30', '13:00')).toBe(0);
    expect(calculateWorkedMinutes('13:30', '17:30')).toBe(240); // 4h chiều
  });

  it('does not count arrival before 08:00', () => {
    expect(calculateWorkedMinutes('06:00', '17:30')).toBe(480);
    expect(calculateWorkedMinutes('07:00', '16:30')).toBe(420); // 08:00-12:00 + 13:30-16:30
  });

  it('does not invent time before the real check-in', () => {
    // Chiều về sớm: không được tính phần 08:00-08:30 của một ngày chưa đi làm.
    expect(calculateWorkedMinutes('13:45', '17:00')).toBe(195);
    expect(calculateWorkedMinutes('14:00', '14:30')).toBe(30);
  });

  it('counts everything after standard_end as overtime', () => {
    expect(calculateWorkedMinutes('08:00', '19:00')).toBe(570); // 8h + 1h30 OT
    expect(calculateWorkedMinutes('08:00', '18:00')).toBe(510);
    // Không trừ nghỉ chiều sau 17:30: ở lại 21:00 vẫn tính trọn.
    expect(calculateWorkedMinutes('08:00', '21:00')).toBe(480 + 210);
  });

  it('gives the same total for symmetric lunch breaks', () => {
    expect(calculateWorkedMinutes('08:00', '17:30')).toBe(480);
    expect(calculateWorkedMinutes('08:00', '17:45')).toBe(495);
    expect(calculateWorkedMinutes('08:00', '18:30')).toBe(480 + 60);
  });

  it('handles reversed or missing input', () => {
    expect(calculateWorkedMinutes('17:00', '08:00')).toBe(0);
    expect(calculateWorkedMinutes(null, '17:00')).toBeNull();
    expect(calculateWorkedMinutes('08:00', null)).toBeNull();
  });
});

describe('daily target', () => {
  it('marks a completed full day once the minimum work time is reached', () => {
    expect(isDailyTargetMet(479)).toBe(false);
    expect(isDailyTargetMet(480)).toBe(true);
    expect(isDailyTargetMet(500)).toBe(true);
  });
});

describe('late check-in', () => {
  it('late minutes become minutes to make up', () => {
    expect(calculateLateMinutes('08:30')).toBe(30);
    expect(calculateLateMinutes('08:37')).toBe(37);
    expect(calculateLateMinutes('08:00')).toBe(0);
    expect(calculateLateMinutes('07:30')).toBe(0); // đến sớm không được thưởng
    expect(calculateLateMinutes(null)).toBe(0);
  });

  it('late minutes are made up by staying past 17:30', () => {
    const late = calculateLateMinutes('08:30');
    const worked = calculateWorkedMinutes('08:30', '18:00')!;
    expect(late).toBe(30);
    expect(worked - S.dailyRequiredMinutes).toBe(0); // đủ 8h
  });

  it('after 09:00 needs leave permission', () => {
    expect(needsLeavePermission('09:01')).toBe(true);
    expect(needsLeavePermission('09:00')).toBe(false);
    expect(needsLeavePermission('10:30')).toBe(true);
  });
});

describe('calculateRequiredCheckout', () => {
  it('08:37 -> 18:07', () => {
    expect(calculateRequiredCheckout('08:37', 480)?.time).toBe('18:07');
  });

  it('skips the lunch break', () => {
    expect(calculateRequiredCheckout('08:00', 480)?.time).toBe('17:30');
    expect(calculateRequiredCheckout('08:30', 450)?.time).toBe('17:30');
    expect(calculateRequiredCheckout('08:30', 480)?.time).toBe('18:00');
    expect(calculateRequiredCheckout('07:30', 450)?.time).toBe('17:00');
  });

  it('a morning-only employee waits out the break, then leaves', () => {
    // Ca sáng 239': 11:59. Ca sáng 240': vừa đủ trước giờ nghỉ -> 12:00.
    expect(calculateRequiredCheckout('08:00', 239)?.time).toBe('11:59');
    expect(calculateRequiredCheckout('08:00', 240)?.time).toBe('12:00');
    // Ca sáng 241' mà nghỉ 12:00-13:30 thì phải chờ tới 13:30 mới được tính phút 241.
    expect(calculateRequiredCheckout('08:00', 241)?.time).toBe('13:31');
  });

  it('start of day: the full requirement lands after lunch', () => {
    expect(calculateRequiredCheckout('08:30', 30)?.time).toBe('09:00');
    expect(calculateRequiredCheckout('08:30', 480)?.time).toBe('18:00');
    expect(calculateRequiredCheckout('08:00', 480)?.time).toBe('17:30');
  });

  it('mid-day remaining minutes are plain wall clock arithmetic', () => {
    // Còn 180' lúc 13:30 -> 16:30; còn 420' -> 20:30 (bù giờ tính trọn).
    expect(calculateRequiredCheckout('13:30', 180)?.time).toBe('16:30');
    expect(calculateRequiredCheckout('13:30', 420)?.time).toBe('20:30');
    // Đầu ca 480' tính cả nghỉ trưa -> 17:30.
    expect(calculateRequiredCheckout('08:00', 480)?.time).toBe('17:30');
  });

  it('uses projectCheckout for a day already in progress', () => {
    // 08:37 -> 10:00 đã được 83', chỉ tiêu 480' + 25' nợ tuần -> còn 422'.
    const worked = calculateWorkedMinutes('08:37', '10:00')!;
    expect(worked).toBe(83);
    const t = projectCheckout({
      checkIn: '08:37',
      requiredMinutes: 480 + 25,
      workedMinutes: worked,
      nowMinutes: 600,
      layout: S,
    })!;
    expect(t.remainingMinutes).toBe(422);
    expect(t.past).toBe(false);
    expect(t.time).toBe('17:09');

    // Ca đã quá giờ hành chính mà vẫn thiếu -> không còn chỗ trong hôm nay.
    const over = projectCheckout({
      checkIn: '08:37',
      requiredMinutes: 480,
      workedMinutes: 300,
      nowMinutes: 1100, // 18:20
      layout: S,
    })!;
    expect(over.past).toBe(true);
    expect(over.time).toBeNull();
    expect(over.remainingMinutes).toBe(180);
  });

  it('nothing to do when already enough', () => {
    expect(calculateRequiredCheckout('08:00', 0)?.time).toBeNull();
    expect(calculateRequiredCheckout('08:00', -30)?.time).toBeNull();
    expect(calculateRequiredCheckout(null, 120)?.time).toBeNull();
  });
});

describe('carry-over Thứ Sáu -> Thứ Hai', () => {
  it('nextMonday', () => {
    expect(nextMonday('2026-10-09')).toBe('2026-10-12'); // Fri -> Mon
    expect(nextMonday('2026-10-05')).toBe('2026-10-12'); // Mon của tuần đó -> Mon sau
    expect(nextMonday('2026-10-11')).toBe('2026-10-12'); // CN của tuần đó -> Mon sau
    expect(nextMonday('2026-12-31')).toBe('2027-01-04'); //_cross year
  });

  it('only the missing minutes of a finished Friday', () => {
    const base = {
      date: '2026-10-09',
      checkIn: '08:00',
      requiredMinutes: 480,
      today: '2026-10-12',
      nowMinutes: 1100,
      layout: S,
    };
    expect(calculateCarryOver({ ...base, checkOut: '16:50' })).toBe(40); // thiếu 40'
    expect(calculateCarryOver({ ...base, checkOut: '17:30' })).toBeNull(); // đủ
    expect(calculateCarryOver({ ...base, checkOut: '18:10' })).toBeNull(); // dư giờ
    expect(calculateCarryOver({ ...base, checkOut: '16:50', leaveMinutes: 40 })).toBeNull(); // có phép bù
    expect(calculateCarryOver({ ...base, checkOut: null })).toBe(480); // cả ngày không chấm công -> nợ cả ngày
    expect(calculateCarryOver({ ...base, checkOut: '16:50', today: '2026-10-13' })).toBe(40); // hôm sau vẫn sinh được
  });

  it('does not fire for other weekdays', () => {
    expect(
      calculateCarryOver({
        date: '2026-10-08', // Thursday
        checkIn: '08:00',
        checkOut: '16:50',
        requiredMinutes: 480,
        today: '2026-10-12',
        nowMinutes: 1100,
        layout: S,
      }),
    ).toBeNull();
  });

  it('does not fire on a Friday that is still in progress', () => {
    expect(
      calculateCarryOver({
        date: '2026-10-09',
        checkIn: '08:00',
        checkOut: null,
        requiredMinutes: 480,
        today: '2026-10-09',
        nowMinutes: 600, // 10:00, còn đang làm
        layout: S,
      }),
    ).toBeNull();
    // ... nhưng sau 17:30 thì nợ đã chốt
    expect(
      calculateCarryOver({
        date: '2026-10-09',
        checkIn: '08:00',
        checkOut: null,
        requiredMinutes: 480,
        today: '2026-10-09',
        nowMinutes: 1051,
        layout: S,
      }),
    ).toBe(480);
  });

  it('a Friday debt raises Monday required to 8h40', () => {
    const carry: CarryOver = {
      id: 1,
      sourceDate: '2026-10-09',
      targetDate: '2026-10-12',
      minutes: 40,
      resolved: false,
      createdAt: '',
    };
    const monday = buildDayReport({
      date: '2026-10-12',
      log: log('2026-10-12', '08:00', '17:30'),
      carryMinutes: carry.minutes,
      settings: S,
      today: '2026-10-12',
      nowMinutes: 1100,
    });
    expect(monday.requiredMinutes).toBe(520); // 8h40
    expect(monday.workedMinutes).toBe(480);
    expect(monday.balance).toBe(-40); // vẫn thiếu 40' nếu chỉ làm 8h

    const paid = buildDayReport({
      date: '2026-10-12',
      log: log('2026-10-12', '08:00', '18:10'),
      carryMinutes: carry.minutes,
      settings: S,
      today: '2026-10-12',
      nowMinutes: 1100,
    });
    expect(paid.balance).toBe(0);
  });

  it('uses the rule target so other rules can be plugged in', () => {
    expect(FRIDAY_TO_MONDAY.target('2026-10-09')).toBe('2026-10-12');
    expect(FRIDAY_TO_MONDAY.weekday).toBe(5);
  });
});

describe('week balance (bù giờ trong tuần)', () => {
  const week = (logs: WorkLog[], extra = {}) =>
    weekReport({ monday: '2026-10-05', logs, leaves: [], settings: S, weekendDays: [0, 6], today: '2026-10-11', nowMinutes: null, ...extra });

  it('T2 -30, T3 +15, T4 +15 -> tuần đủ giờ', () => {
    const r = week([
      log('2026-10-05', '08:00', '17:00'), // -30
      log('2026-10-06', '08:00', '17:45'), // +15
      log('2026-10-07', '08:00', '17:45'), // +15
    ]);
    expect(r.days[0]!.balance).toBe(-30);
    expect(r.days[1]!.balance).toBe(15);
    expect(r.balance).toBe(0);
    expect(r.workedMinutes).toBe(450 + 495 + 495);
    expect(r.requiredMinutes).toBe(480 * 3); // 3 ngày đã qua
    expect(r.daysLeft).toBe(4); // T5, T6, T7, CN
  });

  it('40h target for a full week', () => {
    const r = week([
      log('2026-10-05', '08:00', '17:30'),
      log('2026-10-06', '08:00', '17:30'),
      log('2026-10-07', '08:00', '17:30'),
      log('2026-10-08', '08:00', '17:30'),
      log('2026-10-09', '08:00', '17:30'),
    ]);
    expect(r.workingDays).toBe(6); // T2..T7
    expect(r.requiredMinutes).toBe(2400);
    expect(r.balance).toBe(0);
    expect(r.projectedBalance).toBe(0);
  });

  it('future days are not counted as missing', () => {
    const r = weekReport({
      monday: '2026-10-05',
      logs: [log('2026-10-05', '08:00', '17:30')],
      leaves: [],
      settings: S,
      weekendDays: [0, 6],
      today: '2026-10-06',
      nowMinutes: 540, // 09:00 thứ Ba
    });
    expect(r.requiredMinutes).toBe(480); // chỉ T2 đã qua
    expect(r.balance).toBe(0);
    expect(r.elapsedDays).toBe(1);
    expect(r.daysLeft).toBe(5);
  });

  it('a full-day leave day does not count as missing', () => {
    const r = weekReport({
      monday: '2026-10-05',
      logs: [
        log('2026-10-05', '08:00', '17:30'),
        log('2026-10-06', '08:00', '17:30'),
        log('2026-10-07', null, null), // nghỉ phép cả ngày, không chấm công
        log('2026-10-08', '08:00', '17:30'),
        log('2026-10-09', '08:00', '17:30'),
        log('2026-10-10', '08:00', '17:30'),
      ],
      leaves: [leave('2026-10-07', 480)],
      settings: S,
      weekendDays: [0, 6],
      today: '2026-10-11',
      nowMinutes: null,
    });
    expect(r.leaveMinutes).toBe(480);
    expect(r.requiredMinutes).toBe(480 * 6); // ngày phép vẫn có chỉ tiêu
    // Ngày phép 10/07 có log nhưng không chấm công -> không có chỉ tiêu; 5 ngày làm
    // đủ giờ -> phép thành dư 480'.
    expect(r.requiredMinutes).toBe(480 * 5);
    expect(r.balance).toBe(480);
  });

  it('a day without a log is not counted as missing', () => {
    const r = week([log('2026-10-05', '08:00', '17:30'), log('2026-10-06', '08:00', '17:30')]);
    expect(r.requiredMinutes).toBe(480 * 2); // chỉ 2 ngày có chấm công
    expect(r.balance).toBe(0);
  });

  it('projects the end-of-period balance from the current pace', () => {
    const r = week([
      log('2026-10-05', '08:00', '17:30'),
      log('2026-10-06', '08:00', '18:30'), // +60
    ]);
    // Chỉ 2 ngày có chấm công -> chỉ tiêu 960', trong đó T3 dôi 60'.
    expect(r.requiredMinutes).toBe(480 * 2);
    expect(r.balance).toBe(60);
    expect(r.overtimeMinutes).toBe(60);
    expect(r.elapsedDays).toBe(2);
    expect(r.daysLeft).toBe(5); // T5, T6, T7, CN còn lại + T4 chưa chốt
  });
});

describe('month balance', () => {
  it('sums the month and compares with the required minutes', () => {
    const logs = [
      log('2026-10-01', '08:00', '17:30'),
      log('2026-10-02', '08:00', '17:00'), // -30
      log('2026-10-03', '08:00', '18:00'), // +30
      log('2026-10-20', '08:00', '17:30'),
    ];
    const r = monthReport({
      monthKey: '2026-10',
      logs,
      leaves: [],
      settings: S,
      weekendDays: [0],
      today: '2026-10-21',
      nowMinutes: null,
    });
    expect(r.workedMinutes).toBe(480 + 450 + 510 + 480);
    expect(r.requiredMinutes).toBe(480 * 4);
    expect(r.balance).toBe(-30 + 30); // -30 (02/10) bù bằng +30 (03/10)
    expect(r.workingDays).toBe(22); // 31 ngày T10/2026 trừ 4 CN + 5 T7
    expect(r.daysLeft).toBe(10);
  });

  it('does not read the machine clock', () => {
    const empty = { logs: [], leaves: [], settings: S, weekendDays: [0, 6] };
    const past = monthReport({ ...empty, monthKey: '2020-01', today: '2020-01-31', nowMinutes: null });
    const future = monthReport({ ...empty, monthKey: '2030-01', today: '2020-01-31', nowMinutes: null });
    expect(past.requiredMinutes).toBe(0); // chưa có ngày nào được ghi nhận (today chỉ là mốc)
    expect(future.requiredMinutes).toBe(0);
    expect(past.workingDays).toBe(21);
  });
});

describe('buildDayReport', () => {
  it('carries flags for the dashboard', () => {
    const d = buildDayReport({
      date: '2026-10-07',
      log: log('2026-10-07', '09:15', '18:00'),
      settings: S,
      today: '2026-10-08',
      nowMinutes: null,
    });
    expect(d.lateMinutes).toBe(75);
    expect(d.needsLeave).toBe(true);
    expect(d.workedMinutes).toBe(480 - 75 + 30);
    expect(d.balance).toBe(-75);
    expect(d.hasLog).toBe(true);
    expect(d.isWorkingDay).toBe(true);
  });

  it('excludes weekends from the target', () => {
    const sat = buildDayReport({
      date: '2026-10-10',
      log: log('2026-10-10', '08:00', '12:00'),
      settings: S,
      weekendDays: [0, 6],
      today: '2026-10-12',
      nowMinutes: null,
    });
    expect(sat.isWorkingDay).toBe(false);
    expect(sat.requiredMinutes).toBe(0);
    expect(sat.balance).toBe(240); // làm thêm ngày nghỉ = dư cả
  });

  it('a log with an explicit requiredMinutes overrides the default', () => {
    const d = buildDayReport({
      date: '2026-10-07',
      log: log('2026-10-07', '08:00', '18:10', { requiredMinutes: 520 }),
      settings: S,
      today: '2026-10-08',
      nowMinutes: null,
    });
    expect(d.requiredMinutes).toBe(520);
    expect(d.balance).toBe(0);
  });
});

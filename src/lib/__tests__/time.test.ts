import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatMinutes,
  formatSigned,
  formatViDate,
  hmToMinutes,
  minutesToHm,
  mondayOf,
  monthKey,
  weekDates,
  workingDates,
} from '../time';

describe('time utils', () => {
  it('converts HH:MM <-> minutes', () => {
    expect(hmToMinutes('08:00')).toBe(480);
    expect(hmToMinutes('13:30')).toBe(810);
    expect(hmToMinutes('17:30')).toBe(1050);
    expect(hmToMinutes('23:59')).toBe(1439);
    expect(hmToMinutes('24:00')).toBeNull();
    expect(hmToMinutes('8:5')).toBeNull();
    expect(hmToMinutes(null)).toBeNull();
    expect(minutesToHm(810)).toBe('13:30');
    expect(minutesToHm(1500)).toBe('25:00'); // ca tràn sang ngày hôm sau
  });

  it('formats minutes', () => {
    expect(formatMinutes(480)).toBe('8h00');
    expect(formatMinutes(450)).toBe('7h30');
    expect(formatMinutes(30)).toBe('30m');
    expect(formatSigned(-30)).toBe('-30m');
    expect(formatSigned(30)).toBe('+30m');
    expect(formatSigned(0)).toBe('0');
  });

  it('finds monday and week dates', () => {
    expect(mondayOf('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // Sunday -> previous Monday
    expect(mondayOf('2026-10-11')).toBe('2026-10-05'); // Chủ Nhật vẫn thuộc tuần T2 05/10
    expect(weekDates('2026-10-05')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
    expect(monthKey('2026-10-05')).toBe('2026-10');
  });

  it('lists working days excluding weekends', () => {
    expect(workingDates('2026-10-05', '2026-10-11', [0, 6])).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
    expect(workingDates('2026-10-05', '2026-10-11', [0])).toHaveLength(6);
  });

  it('formats vietnamese weekday + date', () => {
    expect(formatViDate('2026-10-05')).toBe('T2 05/10');
    expect(formatViDate('2026-10-11')).toBe('CN 11/10');
  });
});

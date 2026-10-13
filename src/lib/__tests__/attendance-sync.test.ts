import { describe, expect, it } from "vitest";
import { attendanceUpdateForDate } from "../attendance-sync";
import type { RocketChatNotificationMessage } from "../rocket-chat";
import type { WorkLog } from "../types";

const date = "2026-10-12";
const message = (id: string, time: string): RocketChatNotificationMessage => ({
  id, roomId: "tmt", sender: "bot", createdAt: "2026-10-13T00:00:00.000Z",
  text: `Bạn đã chấm công thành công vào ngày 12/10/2026 ${time}:00 tại camera cửa ngoài tầng 4`,
});
const log = (checkIn: string, checkOut: string | null, checkOutSource: WorkLog["checkOutSource"]): WorkLog => ({
  id: 1, date, checkIn, checkOut, checkInSource: "AUTO_NOTIFICATION", checkOutSource,
  workedMinutes: 0, requiredMinutes: null, note: "", createdAt: "", updatedAt: "",
});

describe("TMT attendance synchronization", () => {
  it("uses the first notice for check-in and later notices as provisional check-out", () => {
    const first = message("in", "08:05");
    const later = message("out", "18:08");
    expect(attendanceUpdateForDate([first], date)).toMatchObject({ checkIn: "08:05:00", checkOut: null });
    expect(attendanceUpdateForDate([later, first], date)).toMatchObject({
      checkIn: "08:05:00", checkOut: "18:08:00", checkOutSource: "AUTO_NOTIFICATION",
    });
  });

  it("updates only a provisional check-out when a later notice arrives", () => {
    expect(attendanceUpdateForDate([message("out", "18:08")], date, log("08:05:00", "17:30:00", "AUTO_NOTIFICATION")))
      .toMatchObject({ checkIn: "08:05:00", checkOut: "18:08:00" });
    expect(attendanceUpdateForDate([message("old", "17:30")], date, log("08:05:00", "18:08:00", "AUTO_NOTIFICATION")))
      .toBeNull();
  });

  it("keeps a manual check-out even when TMT sends a later notice", () => {
    expect(attendanceUpdateForDate([message("out", "18:08")], date, log("08:05:00", "17:45:00", "MANUAL")))
      .toBeNull();
  });

  it("keeps a manual check-in and uses only later notifications for provisional check-out", () => {
    const manual = { ...log("08:00:00", null, null), checkInSource: "MANUAL" as const };
    expect(attendanceUpdateForDate([message("early", "07:50"), message("late", "18:05")], date, manual))
      .toMatchObject({ checkIn: "08:00:00", checkInSource: "MANUAL", checkOut: "18:05:00" });
    expect(attendanceUpdateForDate([message("same", "08:00")], date, { ...manual, checkIn: "08:00" }))
      .toBeNull();
  });

  it("uses the earliest actual time when messages arrive out of order and ignores other dates", () => {
    const otherDate = { ...message("other", "07:00"), text: "Bạn đã chấm công thành công vào ngày 13/10/2026 07:00:00" };
    expect(attendanceUpdateForDate([message("late", "18:05"), otherDate, message("early", "08:00")], date))
      .toMatchObject({ checkIn: "08:00:00", checkOut: "18:05:00" });
    expect(attendanceUpdateForDate([message("earlier", "07:55")], date, log("08:00:00", "18:05:00", "AUTO_NOTIFICATION")))
      .toMatchObject({ checkIn: "07:55:00", checkOut: "18:05:00" });
  });

  it("replaces an automatic app start with the first TMT notice", () => {
    expect(attendanceUpdateForDate([message("in", "08:05")], date, {
      ...log("07:30", null, null), checkInSource: "AUTO_START",
    })).toMatchObject({ checkIn: "08:05:00", checkOut: null, checkInSource: "AUTO_NOTIFICATION" });
  });
});

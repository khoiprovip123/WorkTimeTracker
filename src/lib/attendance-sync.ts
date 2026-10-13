import type { WorkLog } from "./types";
import type { RocketChatNotificationMessage } from "./rocket-chat";
import { attendanceNotificationTime } from "./rocket-chat";
import { clockTimeSeconds } from "./time";

type AttendanceUpdate = Pick<WorkLog, "checkIn" | "checkOut" | "checkInSource" | "checkOutSource">;

export function attendanceUpdateForDate(
  messages: RocketChatNotificationMessage[],
  date: string,
  existing?: WorkLog,
): AttendanceUpdate | null {
  const events = messages
    .map(attendanceNotificationTime)
    .filter((item): item is NonNullable<typeof item> => item !== null && item.date === date)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!events.length) return null;

  const replaceAutoStart = existing?.checkInSource === "AUTO_START" && !existing.checkOut;
  if (existing?.checkOut && existing.checkOutSource !== "AUTO_NOTIFICATION") return null;

  const checkIn = !existing?.checkIn || replaceAutoStart
    ? events[0].time
    : existing.checkInSource === "AUTO_NOTIFICATION" &&
      (clockTimeSeconds(events[0].time) ?? Infinity) < (clockTimeSeconds(existing.checkIn) ?? -1)
      ? events[0].time
      : existing.checkIn;
  const checkInSeconds = clockTimeSeconds(checkIn);
  const latest = events.filter((item) => checkInSeconds !== null && (clockTimeSeconds(item.time) ?? -1) > checkInSeconds).at(-1);
  const candidate = latest?.time ?? null;
  const previousProvisional = existing?.checkOutSource === "AUTO_NOTIFICATION" ? existing.checkOut : null;
  const checkOut = previousProvisional && (!candidate || (clockTimeSeconds(previousProvisional) ?? -1) > (clockTimeSeconds(candidate) ?? -1))
    ? previousProvisional
    : candidate;
  if (existing?.checkIn === checkIn && existing?.checkOut === checkOut &&
      (!checkOut || existing.checkOutSource === "AUTO_NOTIFICATION")) return null;

  return {
    checkIn,
    checkInSource: !existing?.checkIn || replaceAutoStart ? "AUTO_NOTIFICATION" : existing.checkInSource ?? "MANUAL",
    checkOut,
    checkOutSource: checkOut ? "AUTO_NOTIFICATION" : null,
  };
}

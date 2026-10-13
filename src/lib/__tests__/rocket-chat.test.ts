import { describe, expect, it } from "vitest";
import {
  attendanceNotificationTime,
  extractRocketChatSubscriptions,
  findNotificationSubscription,
  normalizeRocketChatMessage,
} from "../rocket-chat";

describe("rocket-chat helpers", () => {
  it("requires a valid DD/MM/YYYY HH:mm:ss attendance notice", () => {
    const message = { id: "1", roomId: "room", sender: "bot", createdAt: "invalid", text: "Bạn đã chấm công thành công vào ngày 12/10/2026 08:37:42 tại camera" };
    expect(attendanceNotificationTime(message)).toMatchObject({ date: "2026-10-12", time: "08:37:42" });
    for (const text of [
      "Bạn đã chấm công thành công vào ngày 12/10/2026",
      "Bạn đã chấm công thành công vào ngày 12/10/2026 08:37",
      "Bạn đã chấm công thành công vào ngày 31/02/2026 08:37:42",
      "Bạn đã chấm công thành công vào ngày 12/10/2026 25:00:00",
      "Bạn đã chấm công thành công vào ngày 12/10/2026 08:37:60",
      "Tin khác: Bạn đã chấm công thành công vào ngày 12/10/2026 08:37:42",
    ]) expect(attendanceNotificationTime({ ...message, text })).toBeNull();
  });
  it("uses the attendance time in TMT text even when the notification arrives the next day", () => {
    const message = {
      id: "late", roomId: "room", sender: "bot",
      createdAt: new Date(2026, 9, 13, 0, 10).toISOString(),
      text: "Bạn đã chấm công thành công vào ngày 12/10/2026 18:08:55 tại camera cửa ngoài tầng 4",
    };
    expect(attendanceNotificationTime(message)).toMatchObject({ date: "2026-10-12", time: "18:08:55" });
  });
  it("finds the TMT Notification direct room by type and name", () => {
    const subscriptions = [
      { _id: "1", t: "c", fname: "General", rid: "room-1" },
      { _id: "2", t: "d", fname: "TMT Notification", rid: "room-notify" },
    ];

    expect(findNotificationSubscription(subscriptions)).toEqual(
      subscriptions[1],
    );
  });

  it("extracts subscriptions from the real Rocket.Chat payload shape", () => {
    const payload = {
      success: true,
      update: [
        {
          _id: "YGiAtgqKtyFZPz8Kd",
          rid: "AQTaazTAjatGfdbGhxNRvRbNReFBiM9Z5Q",
          fname: "TMT Notification",
          name: "tmt",
          t: "d",
        },
      ],
    };

    expect(extractRocketChatSubscriptions(payload)).toHaveLength(1);
    expect(
      findNotificationSubscription(extractRocketChatSubscriptions(payload)),
    ).toMatchObject({
      rid: "AQTaazTAjatGfdbGhxNRvRbNReFBiM9Z5Q",
      fname: "TMT Notification",
    });
  });

  it("normalizes websocket room messages into a notification payload", () => {
    const payload = {
      collection: "stream-room-messages",
      fields: {
        eventName: "stream-room-messages",
        args: [
          {
            _id: "msg-1",
            rid: "room-notify",
            msg: "New TMT alert",
            ts: { $date: "2026-10-07T09:00:00.000Z" },
            u: { _id: "user-1", username: "bot" },
          },
        ],
      },
    };

    expect(normalizeRocketChatMessage(payload)).toMatchObject({
      roomId: "room-notify",
      text: "New TMT alert",
      sender: "bot",
    });
  });
});

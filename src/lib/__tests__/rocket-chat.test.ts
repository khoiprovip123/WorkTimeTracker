import { describe, expect, it } from "vitest";
import {
  attendanceNotificationTime,
  extractRocketChatSubscriptions,
  findNotificationSubscription,
  normalizeRocketChatMessage,
} from "../rocket-chat";

describe("rocket-chat helpers", () => {
  it("accepts attendance only when the message date matches its local timestamp", () => {
    const sent = new Date(2026, 9, 12, 8, 37);
    const message = { id: "1", roomId: "room", sender: "bot", createdAt: sent.toISOString(), text: "Bạn đã chấm công thành công vào ngày 12/10/2026" };
    expect(attendanceNotificationTime(message)).toMatchObject({ date: "2026-10-12", time: "08:37" });
    expect(attendanceNotificationTime({ ...message, text: "Bạn đã chấm công thành công vào ngày 11/10/2026" })).toBeNull();
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

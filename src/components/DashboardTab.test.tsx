// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/calculator";
import DashboardTab, { type DashboardTabProps } from "./DashboardTab";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Lịch sử công", () => {
  it("opens the selected work log and saves edited hours for its original date", async () => {
    const onEditLog = vi.fn().mockResolvedValue(undefined);
    const props: DashboardTabProps = {
      today: "2026-10-07",
      currentLog: undefined,
      activeSession: null,
      form: { date: "2026-10-07", checkIn: "", checkOut: "" },
      settings: DEFAULT_SETTINGS,
      statusMessage: null,
      elapsedSeconds: 0,
      remainingSeconds: 0,
      progressPercent: 0,
      todayStatus: "idle",
      dailyRequiredMinutes: 480,
      currentWorkedMinutes: 0,
      remainingTodayMinutes: 480,
      late: 0,
      worked: 0,
      targetCheckout: { time: null },
      dashboard: { week: { workedMinutes: 0, requiredMinutes: 0, balance: 0 }, month: { workedMinutes: 0, requiredMinutes: 0, balance: 0 } },
      logs: [{ id: 1, date: "2026-10-06", checkIn: "08:00", checkOut: "17:00", workedMinutes: 480, requiredMinutes: null, note: "", createdAt: "", updatedAt: "" }],
      onPrimaryAction: vi.fn(),
      onLunchSettingChange: vi.fn(),
      onSubmit: vi.fn(),
      setForm: vi.fn(),
      onEditLog,
      deleteLog: vi.fn(),
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<DashboardTab {...props} />));
    const editButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Sửa");
    await act(async () => editButton?.click());
    const dialog = container.querySelector('[role="dialog"]') as HTMLFormElement;
    expect(dialog).not.toBeNull();
    const checkIn = dialog.querySelector('input[type="time"]') as HTMLInputElement;
    expect(checkIn.value).toBe("08:00");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(checkIn, "08:30");
      checkIn.dispatchEvent(new Event("input", { bubbles: true }));
      checkIn.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onEditLog).toHaveBeenCalledWith("2026-10-06", "08:30", "17:00");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const provisional = { ...props.logs[0], date: props.today, checkOut: "17:30", checkOutSource: "AUTO_NOTIFICATION" as const };
    await act(async () => root?.render(<DashboardTab {...props} currentLog={provisional} activeSession={provisional} />));
    const finishButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Kết thúc ca");
    expect(finishButton).toBeDefined();
    await act(async () => finishButton?.click());
    expect(props.onPrimaryAction).toHaveBeenCalledOnce();
  });
});

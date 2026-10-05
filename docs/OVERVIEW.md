# WorkTimeTracker — tài liệu tổng quan

> Viết ngày 05/10/2026, phản ánh đúng code hiện tại (kể cả chỗ chưa xong).

## 0. Lỗi wasm 404 / sai MIME — NGUYÊN NHÂN LÀ APP CŨ, KHÔNG PHẢI CODE

Triệu chứng (console Safari/WebKit): `sql-wasm-browser.wasm` 404 + `Unexpected response MIME type. Expected 'application/wasm'` → `both async and sync fetching of the wasm failed`.

- **Thủ phạm**: bundle `index-52WeVjpX.js` load wasm từ `https://sql.js.org/dist/...` (CDN trả 404/sai MIME). Bundle này đã bị thay; nó chỉ còn trong **app đang chạy / build cũ**.
- **Code hiện tại** (`src/lib/db.ts` + alias trong `vite.config.ts`): wasm là asset bundle (`?url`), fetch `/assets/sql-wasm-browser-<hash>.wasm` từ tauri://asset — offline-safe, không còn chuỗi `sql.js.org` nào trong bundle.
- **Đã kiểm chứng 05/10**: build mới + chạy lại binary debug → app lên, log sạch; serve `dist/` bằng `python http.server` → wasm 200, `application/wasm`, magic `\0asm`.
- **Nếu còn thấy lỗi này**: là đang chạy build/app cũ. Đóng app đang mở → `npm run tauri dev` (hoặc `npm run build` rồi chạy lại binary). Binary debug nhúng dist lúc build nên **đổi frontend không cần recompile Rust** — chỉ cần dist mới + chạy lại binary.
> App bàn phím đơn (Tauri v2 + React 19 + Vite 8 + TypeScript + Tailwind v4), theo dõi giờ công cá nhân: chấm công theo ngày, tính thiếu/dư theo ngày/tuần/tháng.

## 1. Stack & chạy

| | |
|---|---|
| Shell desktop | Tauri v2 (`src-tauri/`) — Rust cài `tauri-plugin-sql` (Rusqlite, `sqlite-bundled`) + đăng ký migration `migrations/001_init.sql` trong `main.rs` |
| UI | React 19 + Tailwind CSS v4, **1 màn hình duy nhất** (`src/App.tsx`, không có router) |
| Data | **SQLite native** — file `worktime.sqlite` trong appData của Tauri, JS gọi qua `@tauri-apps/plugin-sql` (invoke, placeholder `$n`). **Đã bỏ sql.js/wasm/localStorage**; db.ts còn lại đúng 1 khối `importLegacyData` one-time (đọc blob base64 cũ từ localStorage webview → INSERT vào DB mới, rồi xoá). App **chỉ chạy trong Tauri**, mở browser suông sẽ error |
| Build | `npm run tauri dev` / `npm run tauri build` · `npm test` (vitest). `npm run dev` chỉ còn là web shell — DB lỗi có chủ đích |
| Scripts phụ | `sync-migrations.mjs` giờ chỉ in danh sách `migrations/*.sql` (Rust tự chạy qua `include_str!`; không còn file generated) |

## 2. File nào làm gì

```
src/
  main.tsx                 render <App/> (StrictMode)
  App.tsx                  TOÀN BỘ UI — dashboard + form + bảng lịch sử
  index.css                Tailwind v4 @theme (font Poppins/Be Vietnam Pro) + 4 class: .card .input .button-primary .button-secondary
  lib/
    types.ts               interfaces: Settings, WorkLog, LeaveRecord, CarryOver, DayReport, PeriodReport...
    time.ts                util ngày/giờ thuần: isoDate, mondayOf, weekDates, workingDates, formatMinutes/Vi/Signed...
    calculator.ts          MỌI rule nghiệp vụ giờ công — pure function, không I/O, truyền `today`/`nowMinutes` tường bạch nên test được
    db.ts                  tầng lưu trữ: mở `sqlite:worktime.sqlite` qua plugin-sql, legacy-import one-time, seed default settings (KHÔNG còn seed sample dữ liệu), CRUD ($n placeholders)
    store.ts               zustand store: state + load/save/delete + getDashboardData() (đã dùng mondayOf)
  lib/__tests__/           vitest: calculator (33 it) + time (6 it)
migrations/001_init.sql    schema "chuẩn" — Rust chạy lúc app khởi động (tauri-plugin-sql), ĐÃ thêm required_minutes + index
scripts/sync-migrations.mjs  chỉ còn echo xác nhận migrations/ (Rust tự đọc)
src-tauri/                 shell Tauri v2 + plugin-sql; capabilities/default.json cấp quyền sql:allow-*
```

### src/lib/db.ts — từng hàm
- `createDatabase()` — init sql.js: fetch file wasm đã bundle (`?url` import, alias `sql.js` → build browser trong `vite.config.ts`) → `wasmBinary`; đọc base64 trong `localStorage['worktime-tracker.sqlite']` → mở DB (hoặc tạo mới); chạy `SCHEMA` (4 bảng, inline trong file); `seedSettingsIfMissing` + `seedSampleDataIfEmpty`; persist; trả DB.
- `persistDatabase(db)` — `db.export()` → bytes → binary string → `btoa` → localStorage. Ghi lại **toàn bộ** DB sau mỗi thao tác ghi.
- `getSettings()` / `saveSettings()` — bảng `settings` dạng key/value; giá trị = phút từ 00:00.
- `getWorkLogs()` / `upsertWorkLog()` / `deleteWorkLog()` — bảng `work_logs` (unique theo `date`).
- `getLeaveRecords()` / `getCarryOvers()` — chỉ ĐỌC; không có hàm ghi (UI cũng chưa có).
- `getDatabase()` — memo hoá bằng `dbPromise`.

### src/lib/calculator.ts — rule nghiệp vụ (phần "não")
Đơn vị tính: **phút nguyên**, thời gian "HH:MM" → phút từ 00:00. Settings mẫu: 08:00–12:00 sáng, nghỉ 12:00–13:30, chiều 13:30, hết giờ hành chính 17:30, chốt công trễ nhất 09:00, 8h/ngày, 40h/tuần.

- `calculateWorkedMinutes(ci, co)` — giờ làm = overlap với khung sáng + chiều (**tự trừ nghỉ trưa**). Về trước 17:30: tính đến giờ về. Về sau 17:30: coi như ngồi trọn tới 17:30 + cộng hết phần ở lại.
- `calculateLateMinutes(ci)` — phút trễ so với 08:00 (đến sớm = 0).
- `needsLeavePermission(ci)` — vào sau 09:00 → cần dùng phép.
- `calculateRequiredCheckout(ci, remaining)` — tìm giờ T sớm nhất để tích lũy đủ `remaining` phút, tính cả khối nghỉ trưa chắn giữa (08:37 vào + 480' → 18:07; ca sáng đủ giờ vẫn phải chờ hết nghỉ → về 13:30). Giải bằng 2 ứng viên số học, không lặp. `minutesToHm` cho phép "25:00" = sang ngày hôm sau.
- `projectCheckout(...)` — wrapper: còn thiếu + đã quá 17:30 → `past: true` (hết chỗ bù trong ngày); `time: null` = đủ rồi.
- `calculateCarryOver(...)` + `FRIDAY_TO_MONDAY` — rule: **chỉ Thứ Sáu thiếu giờ** (khi ngày đã chốt) sinh nợ sang Thứ Hai tuần sau. Đã có hàm + test — **chưa được nối vào UI/db ghi**.
- `buildDayReport(input)` — 1 ngày → `DayReport`: `required` = 0 nếu ngày nghỉ/chưa kết thúc, nếu thường = chuẩn ngày (+ nợ carry, hoặc `requiredMinutes` riêng của log); ngày T7 đi làm thì trừ `8h - 40h/5 = 0`; `balance = worked + leave − required`. Overtime chỉ tính phần vượt `max(8h, 17:30+90')` — để "về sớm vì nghỉ chiều dài" không bị tính là dư.
- `buildPeriodReport` / `weekReport` / `monthReport` — gom `DayReport` theo khoảng ngày; **chỉ tính chỉ tiêu của ngày đã kết thúc** (có check-out hoặc đã quá 17:30) nên "đang làm dở" không bị tính thiếu; `projectedBalance` = nhịp trung bình × số ngày làm việc.
- `isDayFinished` — ngày chốt khi: đã qua, hoặc hôm nay có check-out / đã quá giờ hành chính.

### src/lib/store.ts
- zustand, state phẳng: `{settings, logs, leaves, carryOvers, todayDate, isLoading}` + actions.
- `load()` — `Promise.all(getSettings/getWorkLogs/getLeaveRecords/getCarryOvers)` → set state. `App` gọi 1 lần trong `useEffect` mount, và gọi lại sau mỗi lần save.
- `saveLog(partial)` — **tự tính lại** `workedMinutes` từ checkIn/checkOut (bỏ qua giá trị truyền lên); upsert → reload logs.
- `deleteLog(date)` — xoá DB + filter state.
- `getDashboardData(date, ...)` — trả `{todayReport, week, month}` qua calculator. ⚠ xem mục 5.

## 3. Flow dữ liệu

```
mount ──► store.load() ──► db.getDatabase()
                              │ fetch wasm (asset, offline-safe)
                              │ localStorage base64 ──► mở sql.js DB ──► SCHEMA + seed
                              └► getSettings/getWorkLogs/... ──► state zustand
User bấm "Lưu chấm công"
  └► handleSubmit ─► saveLog ─► tính workedMinutes (calculator)
       ─► db.upsertWorkLog ─► persistDatabase ─► btoa(export()) ─► localStorage
       ─► set logs ─► App useEffect load() lại ─► getDashboardData (useMemo) ─► re-render dashboard
```
Toàn bộ nằm trong WebView của Tauri. **Không có network, không có backend**; dữ liệu sống chết cùng localStorage của webview.

## 4. UI hiện tại

Một màn hình, dark theme (nền `slate-950`, accent emerald, nhãn tiếng Việt), `max-w-7xl`, không router/ không modal/ không toast.

```
┌ Header: "Work Time Tracker / Dashboard thời gian làm việc"   [dot xanh · T5 05/10]
├ 3 card stats (grid md:3):
│   HÔM NAY    badge ✓ Đủ giờ | + Dư | ⚠ Thiếu;  check-in/out, đã làm, mục tiêu, còn lại, đủ giờ (giờ về đích)
│   TUẦN NÀY   đã làm / yêu cầu / thiếu-dư / carry-over (hardcode +0)
│   THÁNG NÀY  đã làm / yêu cầu / thiếu-dư
├ Grid 2 cột [1.1fr | 1.8fr]:
│   ├ card "Nhập giờ làm": input date + time + note
│   │   live preview: Đi trễ · Đã làm · Giờ dự kiến về (projectCheckout, required hardcode 480)
│   │   button "Lưu chấm công"
│   └ card "Lịch sử công": bảng mọi work_logs (Ngày | in | out | Giờ | Balance | Ghi chú | Xoá)
└ hết
```
Component nội bộ: `StatusBadge` (xanh ≥0 / vàng <0).

## 5. Trạng thái — đã xong / chưa xong / lỗi đáng chú ý

**Đã xong:** chấm công CRUD, tính giờ/thiếu-dư ngày-tuần-tháng theo rule, dự kiến giờ về, settings model + seed, 39 test vitest cho calculator & time, build Tauri ra app offline (wasm bundle qua `?url`, đã bỏ CDN sql.js.org — xem mục 0).

**Chưa làm / lỏng:**
1. **Tuần sai về bản chất**: `getDashboardData` truyền `monday: date.slice(0,8)+'01'` — đầu **tháng**, không phải đầu tuần (`mondayOf()` có sẵn, không dùng) → card "TUẦN NÀY" thực chất là tuần-tháng-dở. Dòng carry-over hiển thị hardcode `+0`.
2. **Leaves & CarryOver không có UI và không có hàm ghi** — chỉ đọc, luôn rỗng; cả `getCarryOvers` lẫn `calculateCarryOver` đang "băm" 0.
3. **Settings không có màn hình chỉnh** — seed sample rồi đóng băng (8:00/17:30/8h...); UI còn hardcode `480` ở vài chỗ thay vì `settings.dailyRequiredMinutes`.
4. **App.tsx hiển thị log của NGÀY ĐANG CHỌN trên form** (`currentLog = logs.find(form.date)`) nhưng header là "HÔM NAY" — đổi date input là card hôm nay đổi theo.
5. `requiredMinutes` luôn ghi `null`; `logs` render theo `entry.id` (tính từ `Date.now()`).
6. `saveLog` trong store tính `workedMinutes = checkIn && checkOut ? 0 : 0` (bug rõ ràng) — **được che** vì `App.handleSubmit` đã tính đúng trước khi gọi; nếu ai gọi `saveLog` trực tiếp sẽ mất giờ.

**Gợi ý việc kế tiếp** (theo thứ tự đáng làm): sửa tuần bằng `mondayOf` → màn Settings + form Leave → nối carry-over (`calculateCarryOver` + bảng đã có sẵn) → bỏ seed sample.

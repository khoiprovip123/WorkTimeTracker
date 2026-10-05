# Work Time Tracker

Ứng dụng desktop theo dõi thời gian làm việc, xây dựng bằng React + Vite + Tauri + SQLite.

## Yêu cầu

- Node.js 18+ và npm
- Rust / Cargo
- Trình biên dịch C/C++ cơ bản nếu hệ thống yêu cầu (đối với Tauri)

Kiểm tra nhanh:

```bash
node -v
npm -v
cargo --version
```

## Cài đặt dependencies

```bash
cd /run/media/hoangkhoi/DuLieu/WorkTimeTracker
npm install
```

## Chạy app ở local

### Chế độ phát triển

Chạy Tauri app ở chế độ dev:

```bash
cd /run/media/hoangkhoi/DuLieu/WorkTimeTracker
npm run tauri dev
```

Lệnh này sẽ:
- chạy script đồng bộ migration (`node scripts/sync-migrations.mjs`)
- khởi động Vite frontend
- mở app desktop Tauri

### Chỉ chạy frontend web

Nếu bạn muốn chạy giao diện web trên browser thay vì desktop:

```bash
cd /run/media/hoangkhoi/DuLieu/WorkTimeTracker
npm run dev
```

Sau đó mở URL hiển thị trong terminal (thường là http://localhost:5173).

## Build production

Build ứng dụng production:

```bash
cd /run/media/hoangkhoi/DuLieu/WorkTimeTracker
npm run tauri build
```

## Nếu gặp lỗi

- Kiểm tra Rust đã cài đặt đúng: `cargo --version`
- Cài đặt lại dependencies: `npm install`
- Xóa cache build nếu cần:

```bash
rm -rf node_modules
rm -rf src-tauri/target
npm install
```

## Cấu trúc chính

- `src/`: frontend React
- `src-tauri/`: ứng dụng Tauri / Rust
- `migrations/`: SQL migration
- `scripts/sync-migrations.mjs`: đồng bộ migration vào app

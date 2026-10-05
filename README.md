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

## Hướng dẫn tạo Release lên GitHub

### 1) Commit và push code lên GitHub

```bash
git add .
git commit -m "Prepare release v0.1.0"
git push origin main
```

> Nếu branch mặc định của bạn là `master`, thay `main` bằng `master`.

### 2) Tạo tag release

Tag phải bắt đầu bằng `v` theo chuẩn semver, ví dụ:

```bash
git tag v0.1.0
git push origin v0.1.0
```

### 3) GitHub Actions tự chạy

Khi tag được push lên GitHub, workflow trong `.github/workflows/release.yml` sẽ tự động:
- build app trên Ubuntu
- build app trên Windows
- thu thập file `.AppImage`, `.deb`, `.rpm`, `.exe`, `.msi`
- upload lên GitHub Releases

### 4) Kiểm tra release trên GitHub

- Vào tab `Releases`
- Chọn release vừa tạo
- Kiểm tra file đã upload thành công chưa

### 5) Tải file cài đặt

Các file chính được tạo ra bao gồm:

- Linux: `.AppImage`, `.deb`, `.rpm`
- Windows: `.exe`, `.msi`

### 6) Nếu cần release mới

```bash
git tag v0.1.1
git push origin v0.1.1
```

Mỗi tag mới sẽ tạo 1 release mới trên GitHub.

### 7) Nếu muốn sửa hoặc xoá release/tag cũ

Nếu bạn đã push một tag sai hoặc cần build lại cùng version, bạn có thể xoá tag cũ trước khi tạo tag mới.

Xoá tag ở local:

```bash
git tag -d v0.1.0
```

Xoá tag trên remote:

```bash
git push origin :refs/tags/v0.1.0
```

Xoá release trên GitHub UI nếu release đã được tạo trước đó, rồi tạo lại tag mới:

```bash
git tag v0.1.1
git push origin v0.1.1
```

> Khuyến nghị: nên tăng version lên thay vì reuse tag cũ, ví dụ `v0.1.0 -> v0.1.1` hoặc `v1.0.0 -> v1.0.1`. Điều này giúp người dùng dễ biết bản nào mới hơn và tránh nhầm lẫn.

### 8) Kiểm tra version trong app

Version trong app được lấy từ:

- `package.json`
- `src-tauri/tauri.conf.json`

Đảm bảo cả hai cùng version trước khi tạo release, ví dụ `0.1.0`.

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

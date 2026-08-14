# Tuần tới ăn gì? — Vui App × Yokowo

Next.js (App Router) + Supabase. Frontend là file prototype gốc
(`public/index.html`, gần như nguyên bản, chỉ nối 5 điểm `// DEV:` cũ sang
API thật) được serve tại `/` qua rewrite trong `next.config.js`. Backend là
các API route trong `app/api/*`, dùng Supabase service_role key để đọc/ghi DB.

## 1. Tạo project Supabase

1. Vào [supabase.com](https://supabase.com) → New project (chọn region gần VN, ví dụ Singapore).
2. Vào **SQL Editor**, chạy lần lượt 3 file theo đúng thứ tự:
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — tạo 6 bảng + view `vote_counts`.
   - [`supabase/seed_campaign.sql`](supabase/seed_campaign.sql) — tạo tuần demo `W1-2026` (sửa ngày giờ cho đúng tuần thật trước khi launch).
   - [`supabase/seed_foods.sql`](supabase/seed_foods.sql) — nạp 32 món hiện có (20 cơm + 12 sáng), ảnh đang là base64 tạm thời copy từ prototype. **Đổi sang URL CDN/Supabase Storage thật trước khi launch** (xem handoff doc mục "Đổi từ base64 nhúng sẵn sang URL ảnh").
     - Nếu sau này danh sách món trong prototype đổi, chạy lại `npm run seed:foods -- "<đường dẫn file html>"` để tạo lại file này.
3. Vào **Project Settings → API**, lấy 3 giá trị:
   - **Project URL**
   - **anon public** key
   - **service_role** key (⚠️ giữ bí mật, chỉ dùng ở server)

## 2. Chạy local

```bash
npm install
cp .env.local.example .env.local
```

Dán 3 giá trị ở bước 1 vào `.env.local`, rồi:

```bash
npm run dev
```

Mở `http://localhost:3000` — đây chính là màn hình bình chọn (file `public/index.html`), giờ gọi API thật thay vì mock/localStorage.

## 3. Deploy lên Vercel + nối Supabase

1. Đẩy thư mục này lên một Git repo (GitHub/GitLab).
2. Trong Vercel Dashboard → **Add New → Project** → import repo đó (Framework Preset: Next.js, tự nhận diện).
3. Trước khi Deploy, vào **Environment Variables**, thêm đúng 3 biến (copy từ `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, không thêm tiền tố `NEXT_PUBLIC_`.
   - (tuỳ chọn) `ADMIN_SECRET` — secret tự đặt để gọi `/api/admin/close-week`.
4. Deploy. Kiểm tra deployment không bị **Deployment Protection** chặn nếu muốn nhân viên Yokowo truy cập public (Project Settings → Deployment Protection → tắt cho domain production, hoặc gắn domain riêng).

Nếu muốn Vercel tự tạo project Supabase và tự sync env var: trong Vercel Dashboard vào **Storage → Browse Marketplace → Supabase**, làm theo hướng dẫn — nó tự điền 3 biến trên cho bạn, khỏi copy tay.

## 4. Chốt menu hàng tuần (thứ Sáu)

Chưa có UI admin, gọi tay (hoặc gắn Vercel Cron):

```bash
curl -X POST https://<your-app>.vercel.app/api/admin/close-week \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"weekId":"W1-2026"}'
```

Endpoint này lấy TOP 7 mỗi menu theo số phiếu (view `vote_counts`), ghi vào bảng `official_menu`. Gọi lại nhiều lần không sao (ghi đè các dòng auto, giữ nguyên dòng `is_override=true` nếu admin đã sửa tay qua SQL Editor).

## Kiến trúc & quyết định thiết kế

- **Không có đăng nhập/session** (đúng PRD). Định danh sau khi đăng ký là `voteId` (uuid) — client lưu trong `state.voteId` và gửi kèm mọi request tiếp theo, thay vì gửi `employeeId` thô (khó đoán hơn, đỡ lộ trạng thái người khác).
- **Trạng thái campaign do server tính** từ 4 mốc thời gian trong bảng `campaigns`, không dựa vào giờ máy user (`lib/campaign.ts`).
- **`vote_counts` là VIEW**, không phải bảng vật lý — luôn khớp với `vote_items` (chỉ chứa món đã *gửi*, không tính nháp), không cần trigger.
- **Khoá 1 phiếu**: `vote_items` chỉ được ghi ở `/api/vote/submit`, có unique `(vote_id, food_id)` + check status/409 — gọi lại API để sửa sau khi gửi sẽ luôn bị từ chối, kể cả gọi thẳng API bỏ qua UI.
- **BXH real-time chặn ở API**: `/api/vote/standings` trả 403 nếu `vote.status != COMPLETED`, không chỉ ẩn ở frontend.
- Toàn bộ route trong `app/api/*` được bọc bởi `lib/apiHandler.ts` (`withApiErrors`) để lỗi bất ngờ (mất kết nối Supabase, thiếu env var...) luôn trả về JSON `{error}` thay vì trang lỗi HTML mặc định của Next.js — tránh crash `res.json()` ở client.

## Còn thiếu / việc tiếp theo

- Danh sách món (`DATA.rice`/`DATA.breakfast`) vẫn hard-code trong `public/index.html` để giữ UI tải nhanh, không loading state. Nếu cần admin tự thêm/sửa món qua bảng `foods` mà không sửa code, bước tiếp theo là đổi màn chọn món sang fetch `GET /api/menu` lúc `init()`.
- Chưa có UI Admin (quản lý tuần, món, xem phiếu, export Excel — PRD mục 8). Hiện chỉ có SQL Editor + endpoint `close-week`.
- Ảnh món đang là base64 nhúng thẳng trong `foods.image_url` — cần chuyển sang Supabase Storage/CDN trước khi launch thật (giảm dung lượng DB + tải trang nhanh hơn).
- Thiếu 20/40 món cơm + sửa ảnh sai của "Bún mọc" (đã ghi trong PRD Phụ lục B) — việc của Product/nhà ăn, không phải code.
- 20 món cơm còn thiếu (tổng 40) cần được bổ sung vào `foods` bằng SQL insert thủ công hoặc chạy lại script seed sau khi cập nhật prototype.

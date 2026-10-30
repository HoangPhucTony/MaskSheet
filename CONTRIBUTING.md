# Đóng góp / Contributing

Cảm ơn bạn đã quan tâm! / Thanks for your interest!

## Nguyên tắc bắt buộc / Hard rules

1. **Không gửi dữ liệu người dùng ra khỏi trình duyệt.** Không thêm backend, API route, analytics, font hay script từ CDN. CSP (`vite.config.ts`, `vercel.json`) phải giữ `connect-src 'self'`.
   *Never send user data out of the browser. No backend, analytics, external fonts or CDN scripts. Keep `connect-src 'self'` in the CSP.*
2. Logic xử lý dữ liệu nằm trong `src/lib/`, thuần TypeScript, không phụ thuộc DOM, và phải có test.
   *Data logic lives in `src/lib/`, is DOM-free and must be tested.*
3. Việc nặng chạy trong Web Worker (`src/workers/`).
   *Heavy work runs in Web Workers.*

## Bắt đầu / Getting started

```bash
npm install
npm run dev
npm test
npm run build   # tsc + vite build, must pass
```

## Pull request

- Một PR cho một thay đổi; mô tả rõ lý do.
- Thêm/sửa test trong `tests/` cho mọi thay đổi ở `src/lib/`.
- Thêm chuỗi giao diện vào cả `src/i18n/vi.ts` và `src/i18n/en.ts`.
- Nếu đổi định dạng file mapping, tăng `MAPPING_VERSION` trong `src/lib/mapping.ts` và giữ khả năng đọc file cũ.

## Báo lỗi / Bug reports

Đừng đính kèm file chứa dữ liệu thật. Hãy tạo file nhỏ với dữ liệu giả để tái hiện lỗi.
*Do not attach files with real data — reproduce with a small fake file.*

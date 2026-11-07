# Thiết kế lại giao diện: một trang thu gọn

Ngày: 2026-11-07 · Trạng thái: chờ duyệt

## Bối cảnh

Rà soát giao diện (máy tính 1280×800, điện thoại 375px) cho thấy:

- **Ba hệ thống "bước" chồng chéo nhau:**
  - 3 thẻ "Che → Gửi AI → Khôi phục" trong phần giới thiệu,
  - 2 tab "Che dữ liệu / Khôi phục",
  - thanh "Chọn file → Chọn cột → Tải kết quả".
- **Vùng thả file nằm dưới màn hình đầu:** ở độ cao 741px trên màn hình cao 768px.
- **Trang dài:** khoảng 2.100px trên máy tính, 2.900px trên điện thoại.
- **Tab sheet nằm ở đáy bảng:** dễ bị bỏ sót, trong khi giờ mỗi sheet phải chọn riêng.
- **Thanh công cụ có 5 nút ngang hàng.** Trên điện thoại, chip cột bị cắt chữ.
- **Che xong mà nút "Che dữ liệu" vẫn nổi phía trên kết quả.**
- **Không có hướng dẫn bước tiếp theo:** sang tab Khôi phục phải tải lại file mapping.

Người dùng là nhân viên văn phòng, chủ yếu dùng máy tính. Mục tiêu: luôn biết đang ở bước nào và bước tiếp là gì, ít cuộn trang, không bao giờ mất file mapping.

**Hướng đã chọn: B, một trang thu gọn.** Giữ một trang và hai tab Che / Khôi phục. Không chuyển sang wizard, không chia đôi màn hình.

**Giữ nguyên:** logic che và khôi phục (`src/lib`, `src/workers`), cách chọn cột kiểu Excel, popup cài đặt cột (`ColumnInspector`), template, tiếng Việt và tiếng Anh, giao diện sáng/tối, bộ màu xanh lục.

**Không làm:** chạy offline (PWA), dùng bàn phím để chọn cột trên bảng, đổi bộ màu.

## Phần 1: khung trang và bước Tải file

**Phần giới thiệu** (`App.tsx`)
- Chỉ còn tiêu đề 1 dòng và 3 nhãn nhỏ: "100% trên trình duyệt", "Không upload", "Cách hoạt động".
- Nhãn "Cách hoạt động" mở tooltip/popover tóm tắt 3 bước Che → Gửi AI → Khôi phục.
- Bỏ phụ đề dài và 3 thẻ `HowStep`.
- Phần giới thiệu **ẩn hẳn khi tab Che đã có file**. `MaskPanel` báo cho `App` qua `onHasFileChange(boolean)`.
- Tab Khôi phục luôn hiện phần giới thiệu thu gọn.

**Tab Che / Khôi phục:** giữ nguyên.

**Thanh tiến trình:** `Stepper` trong `MaskPanel` là hệ thống "bước" duy nhất còn lại (Chọn file → Chọn cột → Tải về). Đổi nhãn bước 3 từ "Tải kết quả" thành "Tải về".

**Bước Tải file**
- Vùng thả file và nút "Thử với file mẫu" giữ nguyên.
- Gợi ý định dạng ghi kèm "file không rời khỏi máy bạn".
- `TemplatePicker` gọn thành nút **"Dùng template ▾"** nằm cạnh nút file mẫu. Bấm vào mở popover gồm:
  - danh sách template đã lưu (chọn / bỏ chọn, xóa),
  - nút "Tải template (.json)".
- Khi đang chọn template, nút hiện tên template kèm ✓ và nút ✕ để bỏ chọn.

**Mục tiêu đo được:** ở 1280×800, vùng thả file nằm trọn trong màn hình đầu, không cần cuộn.

## Phần 2: bước Chọn cột

**Thanh file:** giữ như hiện tại (tên file · số sheet · số dòng · dung lượng · "Đổi file").

**Thanh công cụ**
- "Chọn theo gợi ý" dạng nút nổi bật (nền xanh nhạt).
- Menu **"Chọn ▾"** gồm: Chọn tất cả, Bỏ chọn tất cả, Bỏ chọn trong sheet này.
- Nút "Lưu template".
- Nút chuyển "AI sẽ thấy / Dữ liệu gốc" nằm bên phải.

**Tab sheet** (`ColumnGrid`)
- Chuyển từ đáy lên **trên bảng**, kiểu tab của trình duyệt.
- Mỗi tab có ô tick (giữ hay bỏ sheet), tên sheet, và **nhãn số cột đã chọn**. Nhãn màu xanh khi lớn hơn 0, màu xám khi bằng 0.
- Sheet ẩn có nhãn "ẩn"; sheet bị bỏ thì gạch ngang.
- Thanh "Dòng tiêu đề" nằm ngay dưới tab.
- "Xem tiếp" và "x / y dòng" ở đáy bảng.

**Thanh hành động dính đáy**
- Gồm nút "Che dữ liệu" và dòng tóm tắt kiểu "2 cột · T11: Họ tên, Doanh thu", quá dài thì cắt và thêm "…".
- Nút **"Xem danh sách ▴"** mở danh sách cột đã chọn ngay trong thanh, gom theo sheet. Mỗi dòng: tên cột · cách che · ✕; bấm vào dòng thì mở popup cột.
- Bỏ khối chip "Cột sẽ ẩn danh" đang nằm dưới bảng.
- Khi có tiền tố sai, thanh hiện thông báo đỏ và khóa nút che (giữ cách xử lý hiện tại).
- Khi đang che, thanh hiện thanh tiến trình (như hiện tại).

## Phần 3: bước Tải về và chuyển sang Khôi phục

**Khi `stage === 'done'`**
- Thanh hành động dính đáy **ẩn đi**. Thẻ kết quả trở thành nơi thao tác chính và được cuộn tới.

**Thẻ kết quả**
- Tiêu đề "Đã che xong N ô" và nút **"Sửa lại lựa chọn"** (cuộn lên bảng; output vẫn giữ cho đến khi người dùng đổi cột).
- Hai dòng tải về gọn:
  - file đã che (viền xanh),
  - file mapping (viền đỏ, nút "Tải về" đỏ đến khi đã tải).
- Dòng nào đã tải thì hiện "✓ Đã tải".
- Cảnh báo kèm nút sửa giữ nguyên; thống kê vẫn gập trong `<details>`.
- Dòng **"Bước tiếp"** ở cuối thẻ, có nút **"Khôi phục câu trả lời →"**.

**Chuyển sang Khôi phục**
- `MaskPanel` gọi `onRestore({ json, fileName })` với mapping đang có trong bộ nhớ.
- `App` chuyển sang tab Khôi phục và truyền `handoff` cho `UnmaskPanel`.
- `UnmaskPanel` nạp mapping đó (`parseMapping`) và ghi "dùng mapping vừa tạo"; nút ✕ vẫn để đổi sang file mapping khác.
- Việc chuyển sang Khôi phục **không** tính là đã tải mapping: hộp xác nhận và cảnh báo khi đóng tab vẫn hoạt động như hiện tại.

**Tab Khôi phục**
- Công cụ quy đổi tiền/ngày (`ConvertTools`) chỉ hiện khi mapping có hệ số hoặc độ dịch ngày **và** thỏa một trong ba điều kiện:
  - đã khôi phục văn bản,
  - có cảnh báo không tìm thấy cột tiền/ngày,
  - người dùng bấm link "Công cụ quy đổi".

## Luồng dữ liệu

```
App
 ├─ tab, hasFile, handoff (state)
 ├─ MaskPanel  props: onHasFileChange(b), onRestore({json, fileName})
 └─ UnmaskPanel props: handoff (đổi khi có lần chuyển mới; nạp một lần mỗi giá trị)
```

`handoff` mang thêm một `id` tăng dần, để bấm "Khôi phục câu trả lời" lần nữa sau khi che lại vẫn nạp mapping mới.

## Hàm thuần mới (trong `src/lib`, có test)

- `selectionBySheet(sheets, configs, skipSheets)`: trả về số cột đã chọn của từng sheet, dùng cho nhãn trên tab.
- `selectionSummary(selected, maxNames)`: tạo dòng tóm tắt "2 cột · T11: Họ tên, Doanh thu".

## i18n

- **Thêm:** `howItWorks`, `howItWorksHint`, `templateMenu`, `selectMenu`, `selectNoneSheet`, `showSelected`, `hideSelected`, `editSelection`, `nextStepHint`, `restoreNow`, `mappingFromSession`, `convertToolsOpen`.
- **Bỏ:** các khóa `how1*`–`how3*`, `heroSubtitle`, `selectedColumns`, `selectedNone`, nếu không còn chỗ nào dùng.

## Kiểm tra

1. `npx vitest run`, `npx tsc -b`, `npx vite build` đều phải đạt; thêm test cho 2 hàm thuần mới.
2. Thử trên app:
   - Ở 1280×800: vùng thả file nằm trong màn hình đầu.
   - Tải file: phần giới thiệu ẩn; tab sheet nằm trên bảng và số cột cập nhật khi tick.
   - Menu "Chọn ▾" chạy đúng.
   - "Xem danh sách" mở được, bấm vào dòng thì mở popup cột.
   - Che xong: thanh dính đáy ẩn; ✓ hiện sau khi tải.
   - "Khôi phục câu trả lời" mở tab Khôi phục với mapping vừa tạo và khôi phục đúng.
   - Công cụ quy đổi chỉ hiện khi cần.
   - Kiểm tra cả trên điện thoại (375px) và giao diện tối.
3. Sau khi làm xong giao diện: **đi lại từng bước để rà lỗi tiềm ẩn** (theo yêu cầu của bạn), kể cả các kịch bản của đợt trước (đổi file khi đang che, hộp xác nhận mapping, tiền tố sai, sheet ẩn, dòng tiêu đề).

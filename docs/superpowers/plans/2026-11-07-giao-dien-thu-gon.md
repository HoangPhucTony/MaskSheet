# Giao diện một trang thu gọn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thu gọn giao diện MaskSheet thành một trang. Gồm: phần giới thiệu 1 dòng, tab sheet trên bảng, thanh chọn cột dính đáy, thẻ kết quả gọn, và nút chuyển sang Khôi phục dùng luôn mapping vừa tạo.

**Architecture:** Chỉ đổi lớp giao diện (`src/App.tsx`, `src/components/*`); `src/lib` và `src/workers` giữ nguyên, trừ 2 hàm thuần mới trong `src/lib/selection.ts`. `MaskPanel.tsx` (977 dòng) được tách thêm 2 component: `SelectionBar.tsx` (thanh dính đáy) và `ResultCard.tsx` (bước Tải về). `App` giữ trạng thái `hasFile` và `handoff` để nối tab Che với tab Khôi phục.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-11-07-giao-dien-thu-gon-design.md`

## Global Constraints

- **Không gửi dữ liệu ra ngoài trình duyệt:** không thêm CDN, font hay script ngoài. CSP giữ `connect-src 'self'`.
- **Chuỗi giao diện:** mọi chuỗi mới phải có ở cả `src/i18n/vi.ts` và `src/i18n/en.ts`. Viết hoa kiểu câu (chỉ chữ đầu câu), không dùng "!".
- **Không động vào logic che/khôi phục.** Mọi thay đổi trong `src/lib` chỉ là thêm `selection.ts`.
- **Giao diện sáng/tối:** mọi màu phải có cả lớp `dark:`.
- **Không tự commit:** người dùng tự commit sau khi duyệt. Bước "Kiểm tra" ở cuối mỗi task thay cho bước commit.
- **Lệnh kiểm tra mỗi task:** `npx vitest run`, `npx tsc -b` (không lỗi), và `npx vite build` (in ra `✓ built`).

## Review Focus

1. **Chuyển sang Khôi phục khi chưa tải mapping:** việc chuyển không được tính là đã tải. Cảnh báo khi đóng tab vẫn còn; quay lại tab Che thì kết quả vẫn còn. *(Task 7: kiểm tra trên app.)*
2. **Che lại rồi bấm "Khôi phục câu trả lời" lần nữa:** tab Khôi phục phải nạp mapping mới, kể cả khi `json` giống hệt lần trước. *(Task 8: dùng `id` tăng dần.)*
3. **"Bỏ chọn trong sheet này" khi còn mapping chưa tải:** phải hiện hộp xác nhận như mọi thay đổi cột khác. *(Task 5.)*
4. **Workbook nhiều sheet, tên sheet dài:** tab trên bảng cuộn ngang, không vỡ bố cục. Số cột cập nhật ngay khi tick hoặc bỏ sheet. *(Task 4.)*
5. **Phần giới thiệu sau khi reset hoặc worker bị dừng:** `hasFile` về `false`, phần giới thiệu hiện lại. *(Task 2.)*

---

### Task 1: Hàm thuần đếm và tóm tắt cột đã chọn

**Files:**
- Create: `src/lib/selection.ts`
- Test: `tests/selection.test.ts`

**Interfaces:**
- Produces:
  - `selectionBySheet(sheets: { name: string; keys: string[] }[], configs: Record<string, { enabled: boolean }>): Record<string, number>`: số cột đang bật của mỗi sheet; sheet không có cột nào bật thì là 0.
  - `selectionSummary(selected: { sheet: string; header: string; key: string }[], opts: { withSheet: boolean; max?: number }): string`
    - Gom các cột theo sheet, theo thứ tự xuất hiện.
    - Tên cột là `header`; nếu `header` rỗng thì lấy chữ cái cột (phần trước `@` của `key`).
    - Các sheet nối nhau bằng ` · `, các cột trong một sheet nối bằng `, `.
    - `max` mặc định là 3. Nếu số cột vượt `max`, chỉ hiện `max` cột đầu rồi thêm ` +N`.

- [ ] **Step 1: Viết test**

```ts
const s = (sheet: string, header: string, key: string) => ({ sheet, header, key })
it('counts enabled columns per sheet', () => {
  expect(selectionBySheet([{ name: 'X', keys: ['A@X', 'B@X'] }, { name: 'Y', keys: ['A@Y'] }],
    { 'A@X': { enabled: true }, 'B@X': { enabled: true }, 'A@Y': { enabled: false } })).toEqual({ X: 2, Y: 0 })
})
it('summarises by sheet', () => {
  expect(selectionSummary([s('T11', 'Họ tên', 'A@T11'), s('T11', 'Doanh thu', 'C@T11')], { withSheet: true })).toBe('T11: Họ tên, Doanh thu')
  expect(selectionSummary([s('T11', 'Họ tên', 'A@T11'), s('T12', 'SĐT', 'B@T12')], { withSheet: true })).toBe('T11: Họ tên · T12: SĐT')
  expect(selectionSummary([s('S', 'A', 'A@S'), s('S', 'B', 'B@S'), s('S', 'C', 'C@S'), s('S', 'D', 'D@S')], { withSheet: true })).toBe('S: A, B, C +1')
  expect(selectionSummary([s('S', 'Họ tên', 'A@S'), s('S', '', 'B@S')], { withSheet: false })).toBe('Họ tên, B')
  expect(selectionSummary([], { withSheet: true })).toBe('')
})
```

- [ ] **Step 2:** Chạy `npx vitest run tests/selection.test.ts`. Kỳ vọng FAIL (module chưa có).
- [ ] **Step 3:** Viết 2 hàm trong `src/lib/selection.ts`. Không import từ `src/workers` (lib phải độc lập).
- [ ] **Step 4:** Chạy lại test. Kỳ vọng PASS; sau đó chạy bộ lệnh kiểm tra chung.

### Task 2: Khung trang — phần giới thiệu 1 dòng, tự ẩn khi đã có file

**Files:**
- Modify: `src/App.tsx` (khối `<section>` giới thiệu ở dòng 101–123, các component `HowStep` và `Badge`), `src/components/MaskPanel.tsx` (props)
- Modify: `src/i18n/vi.ts`, `src/i18n/en.ts`

**Interfaces:**
- Produces: `MaskPanel` nhận prop `onHasFileChange?: (hasFile: boolean) => void`, gọi trong `useEffect` theo `!!info && stage !== 'empty' && stage !== 'loading'`.

- [ ] **Step 1: Sửa `App.tsx`**
  - State `hasFile`, truyền `onHasFileChange={setHasFile}` vào `MaskPanel`.
  - Khối giới thiệu chỉ hiện khi `tab === 'unmask' || !hasFile`. Gồm `<h1>` `heroTitle` cỡ `text-2xl sm:text-3xl`, padding trên `pt-6`, và một hàng 3 `Badge`:
    - `badgeLocal`,
    - `badgeNoUpload`,
    - `howItWorks`: icon `SparkIcon`, tooltip `howItWorksHint` gom nội dung `how1Desc`, `how2Desc`, `how3Desc`.
  - Xóa `HowStep`, `heroSubtitle` và hàng 3 thẻ.
- [ ] **Step 2: i18n**
  - Thêm `howItWorks` ("Cách hoạt động" / "How it works") và `howItWorksHint`: 3 câu đánh số 1. Che… 2. Gửi AI… 3. Khôi phục…, ghép từ `how*Desc`.
  - Đổi `step3` thành "Tải về" / "Download".
  - Xóa `heroSubtitle`, `how1*`, `how2*`, `how3*`, `badgeOpen*` nếu không còn chỗ dùng (kiểm tra bằng `grep -rn` trong `src`).
- [ ] **Step 3: Kiểm tra**
  - Bộ lệnh chung đạt.
  - Thử trên app ở 1280×800: vùng thả file nằm trọn trong màn hình đầu (`getBoundingClientRect().bottom < 800`).
  - Tải file mẫu: phần giới thiệu biến mất. Bấm "Đổi file": phần giới thiệu hiện lại.

### Task 3: Nút "Dùng template ▾" thay khối TemplatePicker

**Files:**
- Modify: `src/components/Templates.tsx` (`TemplatePicker`), `src/components/Popover.tsx`, `src/components/MaskPanel.tsx` (khối bước 1, dòng ~476–494), i18n

**Interfaces:**
- Produces:
  - `Popover` nhận thêm prop `width?: number`, mặc định là giá trị hằng `WIDTH` (460).
  - `TemplatePicker` giữ nguyên props, chỉ đổi cách hiển thị.

- [ ] **Step 1: `Popover`**
  - Dùng `width ?? WIDTH` cả khi tính vị trí (`place`) lẫn trong style. Truyền `width` vào `place(anchor, width)`.
- [ ] **Step 2: `TemplatePicker` thành một nút pill `data-template-menu`**
  - Chưa chọn template: nhãn "Dùng template ▾" (`templateMenu`).
  - Đã chọn: hiện "✓ {tên}" kèm nút ✕ để bỏ chọn (`onPick(null)`).
  - Bấm nút mở `Popover` `width={300}` gồm:
    - danh sách template (bấm để chọn; ✕ để xóa),
    - label "Tải template (.json)" chứa input file như hiện tại,
    - dòng gợi ý `templateHint`.
  - Bỏ viền khung cũ và dòng `templateActive`.
- [ ] **Step 3: `MaskPanel` bước 1**
  - Đặt nút file mẫu và `TemplatePicker` trên cùng một hàng (`flex flex-wrap justify-center gap-2`).
- [ ] **Step 4: Kiểm tra**
  - Bộ lệnh chung đạt.
  - Thử trên app: lưu một template, đổi file, mở menu, chọn template, tải file. Thông báo "Đã áp dụng template" phải hiện; bấm ✕ thì bỏ chọn.

### Task 4: Tab sheet lên trên bảng, kèm số cột đã chọn

**Files:**
- Modify: `src/components/ColumnGrid.tsx` (khối tab sheet ở đáy, dòng ~285–330; thanh dòng tiêu đề)

**Interfaces:**
- Consumes: `selectionBySheet` (Task 1).
- Produces: không đổi props của `ColumnGrid`.

- [ ] **Step 1: Chuyển khối tab sheet lên trên**
  - Đặt lên đầu `data-column-grid`, phía trên thanh "Dòng tiêu đề", kiểu tab: tab đang chọn có nền trắng và viền 3 cạnh trên.
  - Mỗi tab gồm: ô tick (chỉ khi có hơn 1 sheet), tên sheet, nhãn số cột từ `selectionBySheet(sheets, configs)`, và nhãn "ẩn" như hiện tại.
  - Nhãn số cột: nền xanh khi lớn hơn 0, nền xám khi bằng 0. Sheet bị bỏ thì vẫn gạch ngang.
- [ ] **Step 2: Hàng tab cuộn ngang**
  - `overflow-x-auto`, mỗi tab `shrink-0`, tên tối đa `max-w-[12rem] truncate`, `title` là tên đầy đủ.
- [ ] **Step 3: Đáy bảng chỉ còn một dòng**
  - Nút "Xem tiếp" bên trái, `rowsShown` bên phải. Bỏ thanh tab cũ ở đáy.
- [ ] **Step 4: Kiểm tra**
  - Bộ lệnh chung đạt.
  - Thử trên app với workbook 3 sheet, trong đó 1 sheet tên dài 60 ký tự: tab cuộn ngang được.
  - Tick một cột: số trên tab tăng ngay. Bỏ tick sheet: tab gạch ngang.

### Task 5: Thanh công cụ gọn và menu "Chọn ▾"

**Files:**
- Modify: `src/components/MaskPanel.tsx` (thanh công cụ dòng ~556–615), i18n

**Interfaces:**
- Consumes: `Popover` có `width` (Task 3); `setEnabled`, `invalidateOutput` đã có trong `MaskPanel`.

- [ ] **Step 1: Sắp lại thanh công cụ**
  - "Chọn theo gợi ý" dùng nền `bg-emerald-50 text-emerald-700` (bản tối `dark:bg-emerald-950/50 dark:text-emerald-300`).
  - Nút "Chọn ▾" (`selectMenu`, `data-select-menu`) mở `Popover` `width={220}` gồm 3 mục:
    - `selectAll`,
    - `selectNone`,
    - `selectNoneSheet` ("Bỏ chọn trong sheet này" / "Clear this sheet"): `setEnabled((k) => configs[k].enabled && configs[k].sheet !== info.sheets[activeSheet].name)`.
  - Chọn một mục thì đóng menu.
  - "Lưu template" giữ nguyên. Nút chuyển "AI sẽ thấy / Dữ liệu gốc" đặt bên phải (`ml-auto`).
- [ ] **Step 2: Kiểm tra**
  - Bộ lệnh chung đạt.
  - Thử trên app: "Bỏ chọn trong sheet này" chỉ bỏ cột của sheet đang xem.
  - Che xong, chưa tải mapping, bấm "Bỏ chọn trong sheet này": phải hiện hộp xác nhận; bấm Hủy thì không đổi gì.

### Task 6: Thanh chọn cột dính đáy (`SelectionBar`)

**Files:**
- Create: `src/components/SelectionBar.tsx`
- Modify: `src/components/MaskPanel.tsx` (bỏ khối chip dòng ~700–750 và thanh dính đáy dòng ~752–790), i18n

**Interfaces:**
- Consumes: `selectionSummary` (Task 1).
- Produces:

```ts
export function SelectionBar(props: {
  selected: ColumnInfo[]
  configs: Record<string, ColumnConfig>
  multiSheet: boolean
  badPrefix: ColumnInfo[]
  masking: boolean
  disabled: boolean            // describing
  progress: { pct: number; label: string; pulse: boolean }
  error: string | null
  onMask: () => void
  onOpenColumn: (c: ColumnInfo) => void   // chuyển sheet + mở popup
  onRemove: (c: ColumnInfo) => void
}): JSX.Element
```

- [ ] **Step 1: Hàng chính** (`sticky bottom-3 z-30`, giữ style hiện tại)
  - Nút "Che dữ liệu"; khóa khi `selected.length === 0 || disabled || badPrefix.length > 0`.
  - Dòng tóm tắt: `selectedCount` + " · " + `selectionSummary(selected, { withSheet: multiSheet })`, hoặc `noneSelected` khi chưa chọn gì.
  - Có tiền tố sai thì thay dòng tóm tắt bằng thông báo đỏ `badPrefixBlock` (như hiện tại).
  - Nút "Xem danh sách ▴" / "Ẩn danh sách ▾" (`showSelected` / `hideSelected`), chỉ hiện khi có cột được chọn.
  - Khi `masking` thì chỉ hiện `ProgressBar`.
- [ ] **Step 2: Danh sách mở rộng** (`max-h-64 overflow-y-auto`)
  - Gom theo sheet: tiêu đề sheet chỉ hiện khi `multiSheet`.
  - Mỗi dòng: icon loại (`TYPE_ICON`) · tên cột · cách che · nút ✕.
  - Dòng có tiền tố sai có viền đỏ (`ring-red-500`).
  - Thêm thuộc tính `data-column-chip` vào mỗi dòng, để `Popover` không tự đóng khi bấm vào dòng.
- [ ] **Step 3: Gắn vào `MaskPanel`**
  - Đặt `SelectionBar` ở vị trí thanh cũ.
  - `onOpenColumn` gọi `setActiveSheet` + `setActiveKey`; `onRemove` gọi `update(key, { enabled: false })`.
  - `error` lấy từ state `error`.
  - **Không render khi `stage === 'done'`.**
  - Xóa các khóa i18n `selectedColumns` và `selectedNone`.
- [ ] **Step 4: Kiểm tra**
  - Bộ lệnh chung đạt.
  - Thử trên app: chọn 4 cột ở 2 sheet, dòng tóm tắt có dạng "4 cột · T11: … · T12: …".
  - Mở danh sách và bấm một dòng: chuyển đúng sheet và mở popup. Bấm ✕: cột bị bỏ.
  - Nhập tiền tố sai: thông báo đỏ hiện và nút che bị khóa.
  - Ở 375px: danh sách không tràn màn hình.

### Task 7: Thẻ kết quả gọn (`ResultCard`)

**Files:**
- Create: `src/components/ResultCard.tsx` (chuyển `DownloadCard` và khối bước 3 từ `MaskPanel.tsx`, dòng ~810–977)
- Modify: `src/components/MaskPanel.tsx`, i18n

**Interfaces:**
- Produces:

```ts
export interface MaskOutput { masked: ArrayBuffer; format: 'xlsx' | 'csv'; mapping: ArrayBuffer; stats: DictionaryStats[]; warnings: MaskWarning[]; maskedCells: number }
export function ResultCard(props: {
  output: MaskOutput
  base: string
  originalSize: number          // 0 = unknown
  downloaded: { masked: boolean; mapping: boolean }
  onDownloadMasked: () => void
  onDownloadMapping: () => void
  warningText: (w: MaskWarning) => string
  onFixWarning: (w: MaskWarning) => void
  onEdit: () => void            // cuộn lên bảng
  onRestore: () => void
  onMaskAgain: () => void
}): JSX.Element
```

- **Produces cho Task 8:** `MaskPanel` nhận prop `onRestore?: (h: { json: string; fileName: string }) => void`. `json` là `new TextDecoder().decode(output.mapping)`, `fileName` là `${base}_mapping_PRIVATE.json`.

- [ ] **Step 1: Đầu thẻ**
  - Icon ✓, tiêu đề `doneTitle`, dòng phụ `doneSubtitle`.
  - Bên phải là nút `editSelection` ("Sửa lại lựa chọn" / "Edit selection"). Nút này cuộn tới `[data-column-grid]` và **không** xóa output.
- [ ] **Step 2: Hai dòng tải về** (lưới 2 cột trên `sm`)
  - File đã che: viền xanh.
  - File mapping: viền đỏ, nút "Tải về" màu đỏ (`bg-rose-600`) cho đến khi `downloaded.mapping`.
  - Dòng nào đã tải: hiện "✓ Đã tải" (`downloadedLabel`) thay cho nút; vẫn bấm được để tải lại.
- [ ] **Step 3: Giữ phần còn lại**
  - Giữ `Alert` cảnh báo mapping, danh sách cảnh báo (có nút sửa) và `<details>` thống kê như hiện tại.
- [ ] **Step 4: Dòng "Bước tiếp" ở cuối thẻ**
  - Văn bản `nextStepHint` ("Gửi file đã che cho ChatGPT, Claude hoặc Gemini. Có câu trả lời rồi thì:").
  - Nút chính `restoreNow` ("Khôi phục câu trả lời →" / "Restore the answer →").
  - Nút phụ `maskAgain`.
- [ ] **Step 5: `MaskPanel`**
  - Render `ResultCard` khi `stage === 'done' && output`.
  - `onRestore` gọi prop `onRestore` với mapping đang có. **Không** đổi `downloaded`.
- [ ] **Step 6: Kiểm tra**
  - Bộ lệnh chung đạt.
  - Thử trên app: che xong thì thanh dính đáy biến mất.
  - Tải file che: dòng đó hiện "✓ Đã tải". Bấm "Sửa lại lựa chọn": cuộn lên bảng, kết quả vẫn còn.
  - Review Focus 1: chưa tải mapping, bấm "Khôi phục câu trả lời", rồi quay lại tab Che: kết quả vẫn còn, và `beforeunload` vẫn được gắn (kiểm tra bằng cách gọi `dispatchEvent(new Event('beforeunload', { cancelable: true }))`, kết quả trả về `defaultPrevented === true`).

### Task 8: Nối sang tab Khôi phục và công cụ quy đổi chỉ hiện khi cần

**Files:**
- Modify: `src/App.tsx`, `src/components/UnmaskPanel.tsx`, i18n

**Interfaces:**
- Consumes: `MaskPanel` prop `onRestore` (Task 7).
- Produces:
  - `export interface RestoreHandoff { id: number; json: string; fileName: string }` trong `UnmaskPanel.tsx`.
  - `UnmaskPanel` nhận prop `handoff?: RestoreHandoff | null`.

- [ ] **Step 1: `App`**
  - State `handoff`; ref đếm `id`.
  - `onRestore={(h) => { setHandoff({ ...h, id: ++idRef.current }); setTab('unmask'); window.scrollTo({ top: 0 }) }}`.
- [ ] **Step 2: `UnmaskPanel`**
  - `useEffect` theo `handoff?.id`: `setMapping({ fileName, json, data: parseMapping(json) })`, `setFromSession(true)`, rồi xóa `result` và `error`.
  - Khi `fromSession`, dòng mapping hiện thêm nhãn `mappingFromSession` ("dùng mapping vừa tạo" / "using the mapping you just made").
  - Nạp mapping bằng file, hoặc bấm ✕, thì đặt `fromSession = false`.
- [ ] **Step 3: Công cụ quy đổi**
  - `ConvertTools` chỉ render khi `(factor !== null || offsetDays !== null)` **và** thỏa một trong ba điều kiện:
    - `toolsOpen`,
    - `result?.kind === 'text'`,
    - đang hiện cảnh báo `restoreNoMoney` hoặc `restoreNoDates`.
  - Khi không render mà mapping có hệ số hoặc độ dịch ngày, hiện link nhỏ `convertToolsOpen` ("Công cụ quy đổi số tiền/ngày" / "Amount and date converter"); bấm vào thì `setToolsOpen(true)`.
- [ ] **Step 4: Kiểm tra**
  - Bộ lệnh chung đạt.
  - Thử trên app: che, bấm "Khôi phục câu trả lời" → tab Khôi phục có sẵn mapping kèm nhãn. Dán văn bản có `NAME_0001` rồi khôi phục: được tên thật.
  - Review Focus 2: quay lại tab Che, đổi một cột, che lại, bấm "Khôi phục câu trả lời": mapping mới được nạp, thấy qua số giá trị và giờ tạo đổi.
  - Công cụ quy đổi ẩn lúc đầu và hiện sau khi khôi phục văn bản.

### Task 9: Rà soát cuối và rà lỗi từng bước

**Files:**
- Modify: chỉ khi phát hiện lỗi; mỗi lỗi kèm test hoặc bước tái hiện.
- Modify: `README.md` (mục "Cách dùng": đổi câu nói về chip, tab sheet và nút khôi phục cho khớp giao diện mới).

- [ ] **Step 1:** Chạy `grep -rn` tìm khóa i18n còn trong `vi.ts`/`en.ts` mà không còn chỗ nào trong `src` dùng; xóa ở cả hai file.
- [ ] **Step 2:** Bộ lệnh chung đạt.
- [ ] **Step 3: Thử lại toàn bộ trên app, ở 1280×800, 375px và giao diện tối, theo thứ tự**
  - Tải file thường, CSV, file có dòng tiêu đề không ở dòng 1, file có sheet ẩn.
  - Chọn cột bằng tick, popup, gợi ý và menu "Chọn".
  - Đổi dòng tiêu đề; tiền tố sai.
  - Che; đổi file trong lúc đang che.
  - Hộp xác nhận mapping (Hủy / Đồng ý).
  - "Che cột này".
  - Tải về; khôi phục bằng nút chuyển sang và bằng tải file mapping lên.
  - Khôi phục file mà AI đã đổi tên cột tiền.
  - Lưu và áp dụng template.
- [ ] **Step 4:** Ghi các lỗi tìm được, sửa từng lỗi kèm test, chạy lại bộ lệnh chung.

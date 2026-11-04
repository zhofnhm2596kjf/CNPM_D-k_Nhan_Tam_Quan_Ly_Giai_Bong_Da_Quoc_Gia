# Hệ thống Quản lý Giải Vô địch Bóng đá Quốc gia

Nhóm Đảk Nhân Tâm · Đề 1.10 · TDTU.
Ứng dụng bám Lab 3–4 (SRS, actor A01–A05, UC01 / UC03 / UC05 / UC06 / UC09 / UC16)
và thiết kế tuần 5 (lớp, sequence UC09, lược đồ CSDL). Không chỉ là sơ đồ lớp.

Ngoài phạm vi MVP, đúng backlog ưu tiên thấp của báo cáo: trọng tài, thẻ vàng/đỏ, live score, vé, VAR.

## Mã nguồn nằm ở đâu

| Việc | File |
|---|---|
| Trang khách (A05) | `src/routes/index.tsx`, `src/components/vdqg/board.tsx` |
| Đăng nhập | `src/routes/dang-nhap.tsx` |
| Cổng nghiệp vụ A01–A04 | `src/routes/van-hanh.tsx`, `src/components/vdqg/ops.tsx` |
| API, phiên, seed, giao dịch | `src/lib/league/api.ts` |
| BR01–BR14, xếp hạng | `src/lib/league/rules.ts` |
| Kiểu dữ liệu | `src/lib/league/types.ts` |
| Tài khoản mẫu | `src/lib/league/demo.ts` |
| Lược đồ Postgres | `migrations/0002_vdqg.sql`, `migrations/0003_qd6_lichsu.sql` |
| Giao diện, màu, font | `src/styles.css`, `src/components/vdqg/ui.tsx` |
| Docker | `Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh` |

Ba màn hình:

- `/` bảng tin công khai
- `/dang-nhap` đăng nhập
- `/van-hanh` hồ sơ, lịch, kết quả, BM5, QĐ6, tài khoản, nhật ký

## Chạy bằng Docker

Cần Docker và Docker Compose. Ở thư mục gốc dự án:

```bash
docker compose up --build
```

Mở `http://localhost:8080`.

- `db`: Postgres 16, user / mật khẩu / database đều là `vdqg`. Dữ liệu nằm volume `vdqg_pg`.
- `web`: Node 22, cổng `8080`. `DATABASE_URL=postgres://vdqg:vdqg@db:5432/vdqg`.
- Lần đầu container chờ Postgres sẵn sàng, rồi tự chạy migration `migrations/*.sql` và seed mùa giải nếu bảng mùa còn trống.
- Tắt và giữ dữ liệu: `docker compose down`. Xóa luôn dữ liệu: `docker compose down -v`.

Không đặt `DATABASE_URL` thì app dùng Postgres nhúng trong tiến trình (chỉ để xem thử, mất khi tắt máy). Docker thì luôn trỏ Postgres thật.

## Chạy không Docker

Node 22.

```bash
npm ci
npm run dev
```

App nghe `http://localhost:8080`. Schema tự áp khi khởi động.

## Tài khoản mẫu

Mật khẩu chung, cố ý công khai để giảng viên demo: `Vdqg@2026`.

| Tên đăng nhập | Vai | Dùng để |
|---|---|---|
| `bantochuc` | A01 Ban tổ chức | Duyệt hồ sơ, công bố lịch, xác nhận tỷ số, ban hành QĐ6, đổi giờ trận đã công bố |
| `nhanvien` | A02 Nhân viên | Lập trận nháp, ghi nhận kết quả chờ xác nhận |
| `phutrach.tl` | A03 Thăng Long | Hồ sơ đã duyệt, chỉ xem |
| `phutrach.tdo` | A03 Tây Đô | Hồ sơ còn nháp, nộp BM1 |
| `admin` | A04 Quản trị | Tạo / khóa tài khoản, gửi phiên bản QĐ6 chờ ban tổ chức |

Sai mật khẩu 5 lần thì khóa. Thông báo lỗi không nói tài khoản có tồn tại hay không. Đăng xuất hủy phiên. Khách không đăng nhập vẫn xem dữ liệu đã công bố.

## Dữ liệu mùa mẫu

Mùa `MUA-2026`, ngày chốt tuổi hồ sơ `2026-02-15`.
Quy định đang chạy `PB-2026-01` (hiệu lực 2026-01-01): tuổi 16–40, sĩ số 15–22, tối đa 3 ngoại binh, điểm 3-1-0, phút 0–90.

Sáu đội đã duyệt và có trong lịch: Thăng Long, Sài Gòn, Cảng Hải Phòng, Sông Hàn, Phú Xuân, Cửu Long.
Tây Đô còn nháp, chưa vào lịch.

Lịch hai vòng, chủ nhà là đội 1, sân là sân nhà đội 1.
Một vòng đấu đã xác nhận và công bố (mỗi đội 1 trận). Một trận lượt đi khác đang chờ xác nhận, khách không thấy tỷ số và bảng chưa cộng điểm.

Bản `PB-2026-02` có thể đang chờ ban tổ chức. Luật chưa xác nhận không được dùng. Luật mới không viết lại điểm các trận đã khóa.

## Luồng đúng đề

1. **UC01** Đăng nhập / đăng xuất, đúng một vai A01–A04, nhật ký.
2. **UC03 + UC04 + UC05** Nộp BM1. Lưu nháp được. Nộp thì kiểm BR01 tuổi, BR02 sĩ số, BR03 ngoại binh, BR04 một loại trong/ngoài, BR05 số áo và không đá hai đội. Sai thì giữ nháp và nêu mã BR. A01 duyệt hoặc từ chối (bắt buộc lý do, hồ sơ về nháp).
3. **UC06** A02 thêm trận nháp. BR06 đúng hai vòng, lượt về đổi chủ nhà. BR07 sân là sân nhà đội 1. Trùng đội hoặc sân trong 2 giờ thì không lưu. A01 công bố thì khách mới thấy. Đổi giờ trận đã công bố thì A03 hai đội và nhân viên nhận thông báo trong app (UC15).
4. **UC09 + UC10** A02 nhập tỷ số và từng bàn loại A, B hoặc C, phút trong `[0, Tmax]`. Tổng bàn phải khớp tỷ số. Cầu thủ phải thuộc đúng một trong hai đội. Lưu ở trạng thái chờ xác nhận, bảng chưa đổi (BR10). A01 xác nhận thì khóa kết quả và tính lại bảng trong cùng một giao dịch. Từ chối cần lý do. Mở khóa thì hoàn bảng. Hai người sửa cùng lúc thì báo xung đột phiên bản.
5. **UC11 / BM5** Hạng theo điểm, hiệu số, bàn sân khách, rồi đối đầu. BM5.1 bảng, BM5.2 vua phá lưới tách A/B/C/tổng. Ô điểm không sửa tay. A01 bấm công bố thì khách mới thấy bảng và tỷ số đã khóa.
6. **BM4** Tra cứu cầu thủ theo tên, đội, loại trong nước / ngoài nước, người đã ghi bàn.
7. **UC16 / QĐ6 / BR13** A04 gửi phiên bản mới, không sửa đè bản cũ. A01 xác nhận thì mới hiệu lực từ ngày đã chọn. Điểm phải thỏa thắng > hòa > thua (BR11). Trận đã xác nhận giữ bộ điểm lúc khóa, không tính lại lịch sử.
8. **NFR05** Nhật ký actor, thời điểm, giá trị cũ / mới. A01 và A04 xem được.

Loại bàn A/B/C chỉ lưu mã. Nghĩa từng loại chưa được BTC chốt (RQ07), cả ba đều được tính vào tổng bàn.

## Lược đồ chính

`app_user`, `app_session`, `season`, `regulation_version`, `stadium`, `team`, `team_dossier`, `player`, `match`, `match_result`, `goal_event`, `standing`, `audit_log`, `notification`.

`match_result.ma_phien_ban` gắn luật lúc xác nhận.
`regulation_version.trang_thai` là `ChoXacNhan` hoặc `HieuLuc`.

Không sửa file migration đã chạy. Đổi schema thì thêm file `migrations/0004_....sql`.

## Ghi chú nộp bài

- Frontend và backend nằm cùng một app. Không có service thứ ba.
- Mật khẩu lưu dạng băm scrypt, không lưu plain text.
- In BM5 bằng nút in trên tab BM5 (trình duyệt, ẩn thanh điều hướng).

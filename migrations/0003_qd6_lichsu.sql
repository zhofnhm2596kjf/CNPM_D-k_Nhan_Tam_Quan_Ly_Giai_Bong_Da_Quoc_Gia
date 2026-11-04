-- QĐ6: bản chờ xác nhận không thành luật đang chạy.
-- Kết quả đã khóa giữ đúng phiên bản điểm tại lúc xác nhận (BR13).

alter table regulation_version
  add column if not exists trang_thai text not null default 'HieuLuc';

alter table regulation_version
  drop constraint if exists regulation_trang_thai_chk;

alter table regulation_version
  add constraint regulation_trang_thai_chk
  check (trang_thai in ('ChoXacNhan', 'HieuLuc'));

alter table match_result
  add column if not exists ma_phien_ban text references regulation_version (ma_phien_ban);

update match_result
   set ma_phien_ban = 'PB-2026-01'
 where ma_phien_ban is null;

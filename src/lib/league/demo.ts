/** Tài khoản mẫu môn học. Mật khẩu cố ý công khai để giảng viên demo. */
export const DEMO_PASSWORD = "Vdqg@2026";

export const DEMO_ACCOUNTS = [
  {
    username: "bantochuc",
    vai: "A01",
    moTa: "Ban tổ chức — duyệt hồ sơ, công bố, xác nhận tỷ số",
  },
  {
    username: "nhanvien",
    vai: "A02",
    moTa: "Nhân viên quản lý — lập lịch, ghi nhận kết quả",
  },
  {
    username: "phutrach.tl",
    vai: "A03",
    moTa: "Phụ trách Thăng Long — hồ sơ đã duyệt, chỉ xem",
  },
  {
    username: "phutrach.tdo",
    vai: "A03",
    moTa: "Phụ trách Tây Đô — hồ sơ nháp, nộp BM1",
  },
  {
    username: "admin",
    vai: "A04",
    moTa: "Quản trị — tài khoản và phiên bản QĐ6",
  },
] as const;

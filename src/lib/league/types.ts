export type Role = "A01" | "A02" | "A03" | "A04";

export type Issue = { code: string; message: string };

export type ApiFail = { ok: false; code: string; message: string; issues?: Issue[] };
export type ApiOk = { ok: true; message: string };

export type SessionUser = {
  userId: string;
  username: string;
  hoTen: string;
  vaiTro: Role;
  maDoi: string | null;
  tenDoi: string | null;
};

export type PlayerInput = {
  hoTen: string;
  ngaySinh: string;
  loai: string;
  soAo: number;
  viTri: string;
};

export type StandingRow = {
  hang: number;
  maDoi: string;
  ten: string;
  tenNgan: string;
  tran: number;
  thang: number;
  hoa: number;
  thua: number;
  banThang: number;
  banThua: number;
  hieuSo: number;
  diem: number;
  banSanKhach: number;
};

export type GoalView = {
  maBan: string;
  maCt: string;
  hoTen: string;
  soAo: number;
  loai: string;
  phut: number;
  doi: "1" | "2";
};

export type MatchRow = {
  maTran: string;
  vong: number;
  kickoff: string;
  maDoi1: string;
  maDoi2: string;
  ten1: string;
  ten2: string;
  ngan1: string;
  ngan2: string;
  san: string;
  maSan: string;
  trangThaiLich: string;
  ban1: number | null;
  ban2: number | null;
  trangThaiKq: string | null;
  congBoKq: boolean;
  version: number | null;
  ghiChu: string;
};

export type Scorer = {
  hoTen: string;
  tenDoi: string;
  tenNgan: string;
  soAo: number;
  a: number;
  b: number;
  c: number;
  tong: number;
};

export type PublicPlayer = {
  maCt: string;
  hoTen: string;
  soAo: number;
  loai: string;
  viTri: string;
  ngaySinh: string;
  tenDoi: string;
  tenNgan: string;
  ban: number;
};

export type SeasonView = {
  maMua: string;
  ten: string;
  trangThai: string;
  ngayChot: string;
  lichCongBo: boolean;
  bxhCongBo: boolean;
};

export type ClubCard = {
  maDoi: string;
  ten: string;
  tenNgan: string;
  san: string;
  thanhPho: string;
  siSo: number;
  ngoai: number;
};

export type Board = {
  season: SeasonView | null;
  standings: StandingRow[];
  matches: MatchRow[];
  scorers: Scorer[];
  players: PublicPlayer[];
  goals: Record<string, GoalView[]>;
  clubs: ClubCard[];
};

export type SquadPlayer = PlayerInput & { maCt: string };

export type DossierView = {
  maDoi: string;
  ten: string;
  tenNgan: string;
  san: string;
  maHoSo: string | null;
  trangThai: string | null;
  lyDo: string;
  maPhienBan: string | null;
  players: SquadPlayer[];
};

export type RegView = {
  maPhienBan: string;
  tuoiMin: number;
  tuoiMax: number;
  siSoMin: number;
  siSoMax: number;
  ngoaiBinhMax: number;
  diemThang: number;
  diemHoa: number;
  diemThua: number;
  tMax: number;
  ngayHieuLuc: string;
  ghiChu: string;
  trangThai: string;
  active: boolean;
};

export type UserView = {
  userId: string;
  username: string;
  hoTen: string;
  email: string;
  vaiTro: Role;
  khoa: boolean;
  maDoi: string | null;
  tenDoi: string | null;
};

export type AuditView = {
  maLog: string;
  hoTen: string | null;
  vaiTro: string | null;
  hanhDong: string;
  doiTuong: string;
  giaTriCu: string;
  giaTriMoi: string;
  createdAt: string;
};

export type NoteView = {
  maTb: string;
  noiDung: string;
  daDoc: boolean;
  createdAt: string;
};

export type TeamOpt = {
  maDoi: string;
  ten: string;
  tenNgan: string;
  maSanNha: string;
  san: string;
  thanhPho: string;
};

export type OpsData = {
  user: SessionUser | null;
  season: SeasonView | null;
  standings: StandingRow[];
  matches: MatchRow[];
  scorers: Scorer[];
  goals: Record<string, GoalView[]>;
  dossiers: DossierView[];
  regs: RegView[];
  activeReg: RegView | null;
  users: UserView[];
  audit: AuditView[];
  notes: NoteView[];
  teams: TeamOpt[];
};

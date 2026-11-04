-- VĐQG: Giải vô địch bóng đá quốc gia (đề 1.10). Khóa và quan hệ bám chương 5.

create table if not exists app_user (
  user_id text primary key,
  username text not null unique,
  ho_ten text not null,
  email text not null,
  password_hash text not null,
  vai_tro text not null check (vai_tro in ('A01', 'A02', 'A03', 'A04')),
  khoa boolean not null default false,
  ma_doi text,
  fail_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists app_session (
  token_hash text primary key,
  user_id text not null references app_user (user_id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists season (
  ma_mua text primary key,
  ten text not null,
  trang_thai text not null,
  ngay_chot_ho_so date not null,
  lich_cong_bo boolean not null default false,
  bxh_cong_bo boolean not null default false
);

create table if not exists regulation_version (
  ma_phien_ban text primary key,
  ma_mua text not null references season (ma_mua),
  tuoi_min integer not null,
  tuoi_max integer not null,
  si_so_min integer not null,
  si_so_max integer not null,
  ngoai_binh_max integer not null,
  diem_thang integer not null,
  diem_hoa integer not null,
  diem_thua integer not null,
  t_max integer not null,
  ngay_hieu_luc date not null,
  ghi_chu text not null default '',
  nguoi_tao text,
  created_at timestamptz not null default now(),
  check (tuoi_min < tuoi_max),
  check (si_so_min <= si_so_max),
  check (diem_thang > diem_hoa and diem_hoa > diem_thua),
  check (t_max between 1 and 150),
  check (ngoai_binh_max >= 0)
);

create table if not exists stadium (
  ma_san text primary key,
  ten text not null,
  thanh_pho text not null,
  suc_chua integer not null
);

create table if not exists team (
  ma_doi text primary key,
  ma_mua text not null references season (ma_mua),
  ten text not null,
  ten_ngan text not null,
  ma_san_nha text not null references stadium (ma_san),
  unique (ma_mua, ten)
);

create table if not exists team_dossier (
  ma_ho_so text primary key,
  ma_doi text not null unique references team (ma_doi) on delete cascade,
  ma_phien_ban text not null references regulation_version (ma_phien_ban),
  trang_thai text not null check (trang_thai in ('Nhap', 'ChoDuyet', 'DaDuyet', 'TuChoi')),
  ly_do text not null default '',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id text
);

create table if not exists player (
  ma_ct text primary key,
  ma_ho_so text not null references team_dossier (ma_ho_so) on delete cascade,
  ho_ten text not null,
  ngay_sinh date not null,
  loai text not null check (loai in ('TRONG', 'NGOAI')),
  so_ao integer not null check (so_ao between 1 and 99),
  vi_tri text not null,
  unique (ma_ho_so, so_ao)
);

create table if not exists match (
  ma_tran text primary key,
  ma_mua text not null references season (ma_mua),
  vong integer not null check (vong in (1, 2)),
  ma_doi_1 text not null references team (ma_doi),
  ma_doi_2 text not null references team (ma_doi),
  ma_san text not null references stadium (ma_san),
  kickoff timestamptz not null,
  trang_thai_lich text not null default 'Nhap' check (trang_thai_lich in ('Nhap', 'CongBo', 'Huy')),
  check (ma_doi_1 <> ma_doi_2)
);

create table if not exists match_result (
  ma_kq text primary key,
  ma_tran text not null unique references match (ma_tran) on delete cascade,
  ban_doi_1 integer not null check (ban_doi_1 >= 0),
  ban_doi_2 integer not null check (ban_doi_2 >= 0),
  trang_thai text not null check (trang_thai in ('Nhap', 'ChoXacNhan', 'DaXacNhan', 'TuChoi')),
  cong_bo boolean not null default false,
  version integer not null default 1,
  ghi_chu text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists goal_event (
  ma_ban text primary key,
  ma_kq text not null references match_result (ma_kq) on delete cascade,
  ma_ct text not null references player (ma_ct),
  loai text not null check (loai in ('A', 'B', 'C')),
  phut integer not null check (phut >= 0),
  doi text not null check (doi in ('1', '2'))
);

create table if not exists standing (
  ma_bxh text primary key,
  ma_mua text not null references season (ma_mua),
  ma_doi text not null references team (ma_doi),
  tran integer not null default 0,
  thang integer not null default 0,
  hoa integer not null default 0,
  thua integer not null default 0,
  ban_thang integer not null default 0,
  ban_thua integer not null default 0,
  hieu_so integer not null default 0,
  diem integer not null default 0,
  ban_san_khach integer not null default 0,
  hang integer not null default 0,
  unique (ma_mua, ma_doi)
);

create table if not exists audit_log (
  ma_log text primary key,
  user_id text references app_user (user_id),
  hanh_dong text not null,
  doi_tuong text not null,
  gia_tri_cu text not null default '',
  gia_tri_moi text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists notification (
  ma_tb text primary key,
  user_id text references app_user (user_id) on delete cascade,
  noi_dung text not null,
  da_doc boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists match_mua_idx on match (ma_mua, vong, kickoff);
create index if not exists goal_kq_idx on goal_event (ma_kq);
create index if not exists audit_time_idx on audit_log (created_at desc);

import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { dbSource, getPglite, getSql, type Sql } from "@/lib/db";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { DEMO_PASSWORD } from "@/lib/league/demo";
import {
  computeStandings,
  roundRobin,
  samePair,
  validateRegulation,
  validateResult,
  validateSquad,
  type GoalIn,
  type Points,
} from "@/lib/league/rules";
import type {
  ApiFail,
  ApiOk,
  AuditView,
  Board,
  ClubCard,
  DossierView,
  GoalView,
  MatchRow,
  OpsData,
  PlayerInput,
  PublicPlayer,
  RegView,
  Role,
  Scorer,
  SeasonView,
  SessionUser,
  SquadPlayer,
  StandingRow,
  TeamOpt,
  UserView,
} from "@/lib/league/types";

type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

const COOKIE = "vdqg_session";
const MA_MUA = "MUA-2026";

type UserRow = {
  user_id: string;
  username: string;
  ho_ten: string;
  vai_tro: Role;
  ma_doi: string | null;
  ten_doi: string | null;
  khoa: boolean;
  password_hash: string;
};

function fail(code: string, message: string, issues?: ApiFail["issues"]): ApiFail {
  return { ok: false, code, message, issues };
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function dateOnly(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function iso(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function nid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function sha(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const { scryptSync, randomBytes } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const { scryptSync, timingSafeEqual } = await import("node:crypto");
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const got = scryptSync(password, salt, 32);
  const exp = Buffer.from(hash, "hex");
  if (got.length !== exp.length) return false;
  return timingSafeEqual(got, exp);
}

const globalPools = globalThis as typeof globalThis & {
  __vdqgPgPool?: import("pg").Pool;
  __vdqgBoot?: Promise<void>;
};

async function db(): Promise<Query> {
  const sql: Sql = await getSql();
  return (text, params = []) => sql.query(text, params);
}

async function ensureMigrations(): Promise<void> {
  if (dbSource === "pglite") {
    await getSql();
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const applied = (await client.query<{ name: string }>("select name from _migrations")).rows.map(
      (r) => r.name,
    );
    const files = import.meta.glob("/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    for (const item of pendingMigrations(Object.keys(files), applied)) {
      await client.query("BEGIN");
      try {
        await client.query(files[item.path] ?? "");
        await client.query("insert into _migrations (name) values ($1)", [item.name]);
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* keep original */
        }
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function withTx<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  await ensureMigrations();
  if (dbSource === "pglite") {
    const pg = await getPglite();
    return pg.transaction(async (tx) => {
      const q: Query = async (text, params = []) => {
        const res = await tx.query(text, params);
        return res.rows as never;
      };
      return fn(q);
    });
  }
  const pg = await import("pg");
  globalPools.__vdqgPgPool ??= new pg.default.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
  });
  const client = await globalPools.__vdqgPgPool.connect();
  const q: Query = async (text, params = []) => {
    const res = await client.query(text, params);
    return res.rows as never;
  };
  try {
    await client.query("BEGIN");
    const out = await fn(q);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương"];
const DEM = ["Văn", "Minh", "Đức", "Quốc", "Hữu", "Anh", "Gia", "Thanh"];
const TEN = ["Nam", "Huy", "Dũng", "Khoa", "Long", "Kiên", "Bình", "Tú", "Đạt", "Sơn", "Khôi", "Phúc"];
const VI_TRI = ["TM", "HV", "HV", "HV", "TV", "TV", "TV", "TV", "TĐ", "TĐ", "TĐ", "HV", "TV", "TĐ", "TĐ", "TV"];
const FOREIGN = [
  "Marcus Okoye",
  "Diego Alvarez",
  "Kenji Sato",
  "Samuel Boateng",
  "Ivan Petrov",
  "Luis Fernandez",
  "Omar Haddad",
  "Adam Novak",
  "Chris Berger",
  "Youssef Amri",
  "Daniel Costa",
  "Peter Novak",
  "Hiroshi Tanaka",
  "Mateo Ruiz",
];

const CLUBS: {
  ma: string;
  ten: string;
  ngan: string;
  san: string;
  tp: string;
  suc: number;
  draft?: boolean;
}[] = [
  { ma: "TL", ten: "Thăng Long", ngan: "TLO", san: "Sân Hữu Nghị", tp: "Hà Nội", suc: 22500 },
  { ma: "SG", ten: "Sài Gòn", ngan: "SGN", san: "Sân Bến Thành", tp: "TP. Hồ Chí Minh", suc: 18000 },
  { ma: "HP", ten: "Cảng Hải Phòng", ngan: "HPH", san: "Sân Cảng", tp: "Hải Phòng", suc: 14000 },
  { ma: "DN", ten: "Sông Hàn", ngan: "SHN", san: "Sân Sông Hàn", tp: "Đà Nẵng", suc: 16000 },
  { ma: "HUE", ten: "Phú Xuân", ngan: "PXU", san: "Sân Phú Xuân", tp: "Huế", suc: 12000 },
  { ma: "CLO", ten: "Cửu Long", ngan: "CLO", san: "Sân Ninh Kiều", tp: "Cần Thơ", suc: 15000 },
  { ma: "TDO", ten: "Tây Đô", ngan: "TDO", san: "Sân Bình Thủy", tp: "Cần Thơ", suc: 10000, draft: true },
];

function playerName(teamIndex: number, i: number): { hoTen: string; loai: "TRONG" | "NGOAI" } {
  if (i >= 14) {
    return { hoTen: FOREIGN[(teamIndex * 2 + (i - 14)) % FOREIGN.length]!, loai: "NGOAI" };
  }
  const n = teamIndex * 20 + i;
  return {
    hoTen: `${HO[n % HO.length]} ${DEM[(n * 3) % DEM.length]} ${TEN[(n * 5) % TEN.length]}`,
    loai: "TRONG",
  };
}

async function audit(
  q: Query,
  userId: string | null,
  hanhDong: string,
  doiTuong: string,
  cu: string,
  moi: string,
) {
  await q(
    `insert into audit_log (ma_log, user_id, hanh_dong, doi_tuong, gia_tri_cu, gia_tri_moi)
     values ($1, $2, $3, $4, $5, $6)`,
    [nid("LOG"), userId, hanhDong, doiTuong, cu.slice(0, 1800), moi.slice(0, 1800)],
  );
}

async function notifyRoles(q: Query, roles: string[], teams: string[], noiDung: string) {
  const rows = await q<{ user_id: string; vai_tro: string; ma_doi: string | null }>(
    "select user_id, vai_tro, ma_doi from app_user where khoa = false",
  );
  const roleSet = new Set(roles);
  const teamSet = new Set(teams);
  for (const u of rows) {
    if (!roleSet.has(u.vai_tro) && !(u.ma_doi && teamSet.has(u.ma_doi))) continue;
    await q("insert into notification (ma_tb, user_id, noi_dung) values ($1, $2, $3)", [
      nid("TB"),
      u.user_id,
      noiDung,
    ]);
  }
}

async function notifyAll(q: Query, noiDung: string) {
  const users = await q<{ user_id: string }>("select user_id from app_user");
  for (const u of users) {
    await q(
      "insert into notification (ma_tb, user_id, noi_dung) values ($1, $2, $3)",
      [nid("TB"), u.user_id, noiDung],
    );
  }
}

type RegRow = {
  ma_phien_ban: string;
  tuoi_min: number;
  tuoi_max: number;
  si_so_min: number;
  si_so_max: number;
  ngoai_binh_max: number;
  diem_thang: number;
  diem_hoa: number;
  diem_thua: number;
  t_max: number;
  ngay_hieu_luc: unknown;
  ghi_chu: string;
  trang_thai?: string;
};

async function activeReg(q: Query): Promise<RegRow | null> {
  const rows = await q<RegRow>(
    `select * from regulation_version
     where ma_mua = $1 and trang_thai = 'HieuLuc' and ngay_hieu_luc <= current_date
     order by ngay_hieu_luc desc, created_at desc
     limit 1`,
    [MA_MUA],
  );
  return rows[0] ?? null;
}

function pointsOf(reg: RegRow | null): Points {
  return {
    win: num(reg?.diem_thang ?? 3),
    draw: num(reg?.diem_hoa ?? 1),
    loss: num(reg?.diem_thua ?? 0),
  };
}

async function recalc(q: Query) {
  const reg = await activeReg(q);
  const pts = pointsOf(reg);
  const teams = await q<{ ma_doi: string }>(
    `select t.ma_doi from team t
     join team_dossier d on d.ma_doi = t.ma_doi
     where t.ma_mua = $1 and d.trang_thai = 'DaDuyet'
     order by t.ma_doi`,
    [MA_MUA],
  );
  const facts = await q<{
    ma_doi_1: string;
    ma_doi_2: string;
    ban_doi_1: number;
    ban_doi_2: number;
    diem_thang: number | null;
    diem_hoa: number | null;
    diem_thua: number | null;
  }>(
    `select m.ma_doi_1, m.ma_doi_2, r.ban_doi_1, r.ban_doi_2,
            v.diem_thang, v.diem_hoa, v.diem_thua
     from match m
     join match_result r on r.ma_tran = m.ma_tran
     left join regulation_version v on v.ma_phien_ban = r.ma_phien_ban
     where m.ma_mua = $1 and r.trang_thai = 'DaXacNhan'`,
    [MA_MUA],
  );
  const ranked = computeStandings(
    teams.map((t) => t.ma_doi),
    facts.map((f) => ({
      home: f.ma_doi_1,
      away: f.ma_doi_2,
      hg: num(f.ban_doi_1),
      ag: num(f.ban_doi_2),
      pts:
        f.diem_thang == null
          ? pts
          : { win: num(f.diem_thang), draw: num(f.diem_hoa), loss: num(f.diem_thua) },
    })),
    pts,
  );
  await q("delete from standing where ma_mua = $1", [MA_MUA]);
  for (const s of ranked) {
    await q(
      `insert into standing
        (ma_bxh, ma_mua, ma_doi, tran, thang, hoa, thua, ban_thang, ban_thua, hieu_so, diem, ban_san_khach, hang)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        `BXH-${MA_MUA}-${s.maDoi}`,
        MA_MUA,
        s.maDoi,
        s.tran,
        s.thang,
        s.hoa,
        s.thua,
        s.banThang,
        s.banThua,
        s.hieuSo,
        s.diem,
        s.banSanKhach,
        s.hang,
      ],
    );
  }
}

async function seedAll(q: Query) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await q(
    `insert into season (ma_mua, ten, trang_thai, ngay_chot_ho_so, lich_cong_bo, bxh_cong_bo)
     values ($1, $2, 'DangDienRa', '2026-02-15', true, true)`,
    [MA_MUA, "Giải Vô địch Bóng đá Quốc gia 2026"],
  );
  await q(
    `insert into regulation_version
      (ma_phien_ban, ma_mua, tuoi_min, tuoi_max, si_so_min, si_so_max, ngoai_binh_max,
       diem_thang, diem_hoa, diem_thua, t_max, ngay_hieu_luc, ghi_chu)
     values ('PB-2026-01', $1, 16, 40, 15, 22, 3, 3, 1, 0, 90, '2026-01-01',
             'QĐ6 gốc: tuổi 16–40, sĩ số 15–22, tối đa 3 ngoại binh, điểm 3-1-0, Tmax 90.')`,
    [MA_MUA],
  );
  for (const club of CLUBS) {
    await q(
      "insert into stadium (ma_san, ten, thanh_pho, suc_chua) values ($1, $2, $3, $4)",
      [`SAN-${club.ma}`, club.san, club.tp, club.suc],
    );
    await q(
      "insert into team (ma_doi, ma_mua, ten, ten_ngan, ma_san_nha) values ($1, $2, $3, $4, $5)",
      [club.ma, MA_MUA, club.ten, club.ngan, `SAN-${club.ma}`],
    );
  }
  const users: [string, string, string, string, Role, string | null][] = [
    ["U-A01", "bantochuc", "Ban tổ chức giải", "bantochuc@vdqg.local", "A01", null],
    ["U-A02", "nhanvien", "Nhân viên quản lý giải", "nhanvien@vdqg.local", "A02", null],
    ["U-A03-TL", "phutrach.tl", "Phụ trách Thăng Long", "phutrach.tl@vdqg.local", "A03", "TL"],
    ["U-A03-TDO", "phutrach.tdo", "Phụ trách Tây Đô", "phutrach.tdo@vdqg.local", "A03", "TDO"],
    ["U-A04", "admin", "Quản trị hệ thống", "admin@vdqg.local", "A04", null],
  ];
  for (const u of users) {
    await q(
      `insert into app_user (user_id, username, ho_ten, email, password_hash, vai_tro, ma_doi)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [u[0], u[1], u[2], u[3], passwordHash, u[4], u[5]],
    );
  }

  for (let t = 0; t < CLUBS.length; t += 1) {
    const club = CLUBS[t]!;
    const maHoSo = `HS-${club.ma}`;
    await q(
      `insert into team_dossier (ma_ho_so, ma_doi, ma_phien_ban, trang_thai, ly_do)
       values ($1, $2, 'PB-2026-01', $3, '')`,
      [maHoSo, club.ma, club.draft ? "Nhap" : "DaDuyet"],
    );
    for (let i = 0; i < 16; i += 1) {
      const p = playerName(t, i);
      const soAo = i + 1;
      const month = String((i % 12) + 1).padStart(2, "0");
      const year = 1994 + ((t + i) % 10);
      await q(
        `insert into player (ma_ct, ma_ho_so, ho_ten, ngay_sinh, loai, so_ao, vi_tri)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `CT-${club.ma}-${String(soAo).padStart(2, "0")}`,
          maHoSo,
          p.hoTen,
          `${year}-${month}-12`,
          p.loai,
          soAo,
          VI_TRI[i] ?? "TV",
        ],
      );
    }
  }

  const approved = CLUBS.filter((c) => !c.draft).map((c) => c.ma);
  const games = roundRobin(approved);
  const r1 = games.filter((g) => g.vong === 1);
  const r2 = games.filter((g) => g.vong === 2);
  const base = new Date("2026-03-07T10:00:00.000Z");
  const planned: { ma: string; vong: 1 | 2; home: string; away: string; kickoff: string }[] = [];
  const push = (list: typeof r1, offsetDays: number) => {
    list.forEach((g, i) => {
      const when = new Date(base.getTime() + (offsetDays + i) * 86_400_000);
      const ma = `TD-${String(planned.length + 1).padStart(2, "0")}`;
      planned.push({ ma, vong: g.vong, home: g.home, away: g.away, kickoff: when.toISOString() });
    });
  };
  push(r1, 0);
  push(r2, 28);
  for (const m of planned) {
    await q(
      `insert into match (ma_tran, ma_mua, vong, ma_doi_1, ma_doi_2, ma_san, kickoff, trang_thai_lich)
       values ($1, $2, $3, $4, $5, $6, $7, 'CongBo')`,
      [m.ma, MA_MUA, m.vong, m.home, m.away, `SAN-${m.home}`, m.kickoff],
    );
  }

  const scripts: { hg: number; ag: number; status: string; congBo: boolean }[] = [
    { hg: 2, ag: 1, status: "DaXacNhan", congBo: true },
    { hg: 0, ag: 0, status: "DaXacNhan", congBo: true },
    { hg: 1, ag: 3, status: "DaXacNhan", congBo: true },
    { hg: 1, ag: 0, status: "ChoXacNhan", congBo: false },
  ];
  const r1planned = planned.filter((m) => m.vong === 1);
  const played: typeof r1planned = [];
  const usedTeams = new Set<string>();
  for (const m of r1planned) {
    if (usedTeams.has(m.home) || usedTeams.has(m.away)) continue;
    played.push(m);
    usedTeams.add(m.home);
    usedTeams.add(m.away);
  }
  const pending = r1planned.find((m) => !played.includes(m));
  const scripted = pending ? [...played, pending] : played;
  for (let i = 0; i < scripted.length && i < scripts.length; i += 1) {
    const m = scripted[i]!;
    const s = scripts[i]!;
    const maKq = `KQ-${m.ma}`;
    await q(
      `insert into match_result (ma_kq, ma_tran, ban_doi_1, ban_doi_2, trang_thai, cong_bo, version, ghi_chu, ma_phien_ban)
       values ($1, $2, $3, $4, $5, $6, 1, '', 'PB-2026-01')`,
      [maKq, m.ma, s.hg, s.ag, s.status, s.congBo],
    );
    const mins = [18, 44, 71, 27, 63, 84];
    const types = ["A", "B", "C", "A", "B", "C"];
    let n = 0;
    const goals: { side: "1" | "2"; team: string }[] = [];
    for (let g = 0; g < s.hg; g += 1) goals.push({ side: "1", team: m.home });
    for (let g = 0; g < s.ag; g += 1) goals.push({ side: "2", team: m.away });
    for (const g of goals) {
      n += 1;
      const shirt = 8 + n;
      await q(
        `insert into goal_event (ma_ban, ma_kq, ma_ct, loai, phut, doi) values ($1,$2,$3,$4,$5,$6)`,
        [
          `BAN-${m.ma}-${n}`,
          maKq,
          `CT-${g.team}-${String(shirt).padStart(2, "0")}`,
          types[n - 1] ?? "A",
          mins[n - 1] ?? 10 + n,
          g.side,
        ],
      );
    }
  }

  await recalc(q);
  await audit(q, null, "KhoiTao", MA_MUA, "", "Du lieu mau mua 2026, lich da cong bo, 4 tran da xac nhan");
  await notifyAll(q, "Lịch mùa 2026 đã được công bố. Bảng xếp hạng tính trên kết quả đã xác nhận.");
}

async function seedIfEmpty() {
  const q = await db();
  const rows = await q<{ n: number }>("select count(*)::int as n from season");
  if (num(rows[0]?.n) > 0) return;
  await withTx(seedAll);
}

function ready(): Promise<void> {
  globalPools.__vdqgBoot ??= ensureMigrations()
    .then(seedIfEmpty)
    .catch((err) => {
      globalPools.__vdqgBoot = undefined;
      throw err;
    });
  return globalPools.__vdqgBoot;
}

async function sessionUser(q: Query): Promise<SessionUser | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const tokenHash = await sha(token);
  const rows = await q<UserRow>(
    `select u.user_id, u.username, u.ho_ten, u.vai_tro, u.ma_doi, u.khoa, u.password_hash, t.ten as ten_doi
     from app_session s
     join app_user u on u.user_id = s.user_id
     left join team t on t.ma_doi = u.ma_doi
     where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row || row.khoa) return null;
  return {
    userId: row.user_id,
    username: row.username,
    hoTen: row.ho_ten,
    vaiTro: row.vai_tro,
    maDoi: row.ma_doi,
    tenDoi: row.ten_doi,
  };
}

async function requireUser(q: Query, roles?: Role[]): Promise<SessionUser | ApiFail> {
  const user = await sessionUser(q);
  if (!user) return fail("UC01", "Phiên đã hết hoặc chưa đăng nhập.");
  if (roles && !roles.includes(user.vaiTro)) {
    return fail("NFR04", "Vai trò này không được làm thao tác đó.");
  }
  return user;
}

function isFail(v: SessionUser | ApiFail): v is ApiFail {
  return "ok" in v && v.ok === false;
}

async function loadSeason(q: Query): Promise<SeasonView | null> {
  const rows = await q<{
    ma_mua: string;
    ten: string;
    trang_thai: string;
    ngay_chot_ho_so: unknown;
    lich_cong_bo: boolean;
    bxh_cong_bo: boolean;
  }>("select * from season where ma_mua = $1", [MA_MUA]);
  const s = rows[0];
  if (!s) return null;
  return {
    maMua: s.ma_mua,
    ten: s.ten,
    trangThai: s.trang_thai,
    ngayChot: dateOnly(s.ngay_chot_ho_so),
    lichCongBo: Boolean(s.lich_cong_bo),
    bxhCongBo: Boolean(s.bxh_cong_bo),
  };
}

async function loadMatches(q: Query, onlyPublic: boolean): Promise<MatchRow[]> {
  const rows = await q<{
    ma_tran: string;
    vong: number;
    kickoff: unknown;
    ma_doi_1: string;
    ma_doi_2: string;
    ten1: string;
    ten2: string;
    ngan1: string;
    ngan2: string;
    san: string;
    ma_san: string;
    trang_thai_lich: string;
    ban_doi_1: number | null;
    ban_doi_2: number | null;
    trang_thai: string | null;
    cong_bo: boolean | null;
    version: number | null;
    ghi_chu: string | null;
  }>(
    `select m.ma_tran, m.vong, m.kickoff, m.ma_doi_1, m.ma_doi_2, m.ma_san, m.trang_thai_lich,
            t1.ten as ten1, t2.ten as ten2, t1.ten_ngan as ngan1, t2.ten_ngan as ngan2,
            s.ten as san,
            r.ban_doi_1, r.ban_doi_2, r.trang_thai, r.cong_bo, r.version, r.ghi_chu
     from match m
     join team t1 on t1.ma_doi = m.ma_doi_1
     join team t2 on t2.ma_doi = m.ma_doi_2
     join stadium s on s.ma_san = m.ma_san
     left join match_result r on r.ma_tran = m.ma_tran
     where m.ma_mua = $1
       and ($2::boolean = false or m.trang_thai_lich = 'CongBo')
     order by m.kickoff, m.ma_tran`,
    [MA_MUA, onlyPublic],
  );
  return rows.map((r) => {
    const showScore = !onlyPublic || (r.trang_thai === "DaXacNhan" && Boolean(r.cong_bo));
    return {
      maTran: r.ma_tran,
      vong: num(r.vong),
      kickoff: iso(r.kickoff),
      maDoi1: r.ma_doi_1,
      maDoi2: r.ma_doi_2,
      ten1: r.ten1,
      ten2: r.ten2,
      ngan1: r.ngan1,
      ngan2: r.ngan2,
      san: r.san,
      maSan: r.ma_san,
      trangThaiLich: r.trang_thai_lich,
      ban1: showScore && r.ban_doi_1 != null ? num(r.ban_doi_1) : null,
      ban2: showScore && r.ban_doi_2 != null ? num(r.ban_doi_2) : null,
      trangThaiKq: onlyPublic ? (showScore ? r.trang_thai : null) : r.trang_thai,
      congBoKq: Boolean(r.cong_bo),
      version: r.version == null ? null : num(r.version),
      ghiChu: r.ghi_chu ?? "",
    };
  });
}

async function loadStandings(q: Query): Promise<StandingRow[]> {
  const rows = await q<{
    hang: number;
    ma_doi: string;
    ten: string;
    ten_ngan: string;
    tran: number;
    thang: number;
    hoa: number;
    thua: number;
    ban_thang: number;
    ban_thua: number;
    hieu_so: number;
    diem: number;
    ban_san_khach: number;
  }>(
    `select s.hang, s.ma_doi, t.ten, t.ten_ngan, s.tran, s.thang, s.hoa, s.thua,
            s.ban_thang, s.ban_thua, s.hieu_so, s.diem, s.ban_san_khach
     from standing s join team t on t.ma_doi = s.ma_doi
     where s.ma_mua = $1
     order by s.hang, t.ten`,
    [MA_MUA],
  );
  return rows.map((r) => ({
    hang: num(r.hang),
    maDoi: r.ma_doi,
    ten: r.ten,
    tenNgan: r.ten_ngan,
    tran: num(r.tran),
    thang: num(r.thang),
    hoa: num(r.hoa),
    thua: num(r.thua),
    banThang: num(r.ban_thang),
    banThua: num(r.ban_thua),
    hieuSo: num(r.hieu_so),
    diem: num(r.diem),
    banSanKhach: num(r.ban_san_khach),
  }));
}

async function loadGoals(q: Query, onlyPublic: boolean): Promise<Record<string, GoalView[]>> {
  const rows = await q<{
    ma_tran: string;
    ma_ban: string;
    ma_ct: string;
    ho_ten: string;
    so_ao: number;
    loai: string;
    phut: number;
    doi: "1" | "2";
    trang_thai: string;
    cong_bo: boolean;
  }>(
    `select m.ma_tran, g.ma_ban, g.ma_ct, p.ho_ten, p.so_ao, g.loai, g.phut, g.doi,
            r.trang_thai, r.cong_bo
     from goal_event g
     join match_result r on r.ma_kq = g.ma_kq
     join match m on m.ma_tran = r.ma_tran
     join player p on p.ma_ct = g.ma_ct
     where m.ma_mua = $1
     order by g.phut, g.ma_ban`,
    [MA_MUA],
  );
  const out: Record<string, GoalView[]> = {};
  for (const r of rows) {
    if (onlyPublic && !(r.trang_thai === "DaXacNhan" && r.cong_bo)) continue;
    const list = out[r.ma_tran] ?? [];
    list.push({
      maBan: r.ma_ban,
      maCt: r.ma_ct,
      hoTen: r.ho_ten,
      soAo: num(r.so_ao),
      loai: r.loai,
      phut: num(r.phut),
      doi: r.doi,
    });
    out[r.ma_tran] = list;
  }
  return out;
}

async function loadScorers(q: Query, onlyPublic: boolean): Promise<Scorer[]> {
  const rows = await q<{
    ho_ten: string;
    ten: string;
    ten_ngan: string;
    so_ao: number;
    a: number;
    b: number;
    c: number;
    tong: number;
  }>(
    `select p.ho_ten, t.ten, t.ten_ngan, p.so_ao,
            count(*) filter (where g.loai = 'A')::int as a,
            count(*) filter (where g.loai = 'B')::int as b,
            count(*) filter (where g.loai = 'C')::int as c,
            count(*)::int as tong
     from goal_event g
     join match_result r on r.ma_kq = g.ma_kq
     join player p on p.ma_ct = g.ma_ct
     join team_dossier d on d.ma_ho_so = p.ma_ho_so
     join team t on t.ma_doi = d.ma_doi
     where ($1::boolean = false or (r.trang_thai = 'DaXacNhan' and r.cong_bo))
       and ($1::boolean = true or r.trang_thai = 'DaXacNhan')
     group by p.ma_ct, p.ho_ten, t.ten, t.ten_ngan, p.so_ao
     order by tong desc, p.ho_ten
     limit 20`,
    [onlyPublic],
  );
  return rows.map((r) => ({
    hoTen: r.ho_ten,
    tenDoi: r.ten,
    tenNgan: r.ten_ngan,
    soAo: num(r.so_ao),
    a: num(r.a),
    b: num(r.b),
    c: num(r.c),
    tong: num(r.tong),
  }));
}

async function loadPlayers(q: Query): Promise<PublicPlayer[]> {
  const rows = await q<{
    ma_ct: string;
    ho_ten: string;
    so_ao: number;
    loai: string;
    vi_tri: string;
    ngay_sinh: unknown;
    ten: string;
    ten_ngan: string;
    ban: number;
  }>(
    `select p.ma_ct, p.ho_ten, p.so_ao, p.loai, p.vi_tri, p.ngay_sinh, t.ten, t.ten_ngan,
            (select count(*)::int from goal_event g
              join match_result r on r.ma_kq = g.ma_kq
              where g.ma_ct = p.ma_ct and r.trang_thai = 'DaXacNhan' and r.cong_bo) as ban
     from player p
     join team_dossier d on d.ma_ho_so = p.ma_ho_so
     join team t on t.ma_doi = d.ma_doi
     where d.trang_thai = 'DaDuyet'
     order by t.ten, p.so_ao`,
  );
  return rows.map((r) => ({
    maCt: r.ma_ct,
    hoTen: r.ho_ten,
    soAo: num(r.so_ao),
    loai: r.loai,
    viTri: r.vi_tri,
    ngaySinh: dateOnly(r.ngay_sinh),
    tenDoi: r.ten,
    tenNgan: r.ten_ngan,
    ban: num(r.ban),
  }));
}

async function loadDossiers(q: Query): Promise<DossierView[]> {
  const teams = await q<{
    ma_doi: string;
    ten: string;
    ten_ngan: string;
    san: string;
    ma_ho_so: string | null;
    trang_thai: string | null;
    ly_do: string | null;
    ma_phien_ban: string | null;
  }>(
    `select t.ma_doi, t.ten, t.ten_ngan, s.ten as san,
            d.ma_ho_so, d.trang_thai, d.ly_do, d.ma_phien_ban
     from team t
     join stadium s on s.ma_san = t.ma_san_nha
     left join team_dossier d on d.ma_doi = t.ma_doi
     where t.ma_mua = $1
     order by t.ten`,
    [MA_MUA],
  );
  const players = await q<{
    ma_ho_so: string;
    ma_ct: string;
    ho_ten: string;
    ngay_sinh: unknown;
    loai: string;
    so_ao: number;
    vi_tri: string;
  }>(
    `select p.ma_ho_so, p.ma_ct, p.ho_ten, p.ngay_sinh, p.loai, p.so_ao, p.vi_tri
     from player p
     join team_dossier d on d.ma_ho_so = p.ma_ho_so
     join team t on t.ma_doi = d.ma_doi
     where t.ma_mua = $1
     order by p.so_ao`,
    [MA_MUA],
  );
  const byHoSo = new Map<string, SquadPlayer[]>();
  for (const p of players) {
    const list = byHoSo.get(p.ma_ho_so) ?? [];
    list.push({
      maCt: p.ma_ct,
      hoTen: p.ho_ten,
      ngaySinh: dateOnly(p.ngay_sinh),
      loai: p.loai,
      soAo: num(p.so_ao),
      viTri: p.vi_tri,
    });
    byHoSo.set(p.ma_ho_so, list);
  }
  return teams.map((t) => ({
    maDoi: t.ma_doi,
    ten: t.ten,
    tenNgan: t.ten_ngan,
    san: t.san,
    maHoSo: t.ma_ho_so,
    trangThai: t.trang_thai,
    lyDo: t.ly_do ?? "",
    maPhienBan: t.ma_phien_ban,
    players: t.ma_ho_so ? (byHoSo.get(t.ma_ho_so) ?? []) : [],
  }));
}

function mapReg(r: RegRow, activeId: string | null): RegView {
  return {
    maPhienBan: r.ma_phien_ban,
    tuoiMin: num(r.tuoi_min),
    tuoiMax: num(r.tuoi_max),
    siSoMin: num(r.si_so_min),
    siSoMax: num(r.si_so_max),
    ngoaiBinhMax: num(r.ngoai_binh_max),
    diemThang: num(r.diem_thang),
    diemHoa: num(r.diem_hoa),
    diemThua: num(r.diem_thua),
    tMax: num(r.t_max),
    ngayHieuLuc: dateOnly(r.ngay_hieu_luc),
    ghiChu: r.ghi_chu,
    trangThai: r.trang_thai ?? "HieuLuc",
    active: r.ma_phien_ban === activeId,
  };
}

async function sideSets(q: Query, maDoi1: string, maDoi2: string) {
  const rows = await q<{ ma_ct: string; ma_doi: string }>(
    `select p.ma_ct, d.ma_doi from player p
     join team_dossier d on d.ma_ho_so = p.ma_ho_so
     where d.trang_thai = 'DaDuyet' and d.ma_doi in ($1, $2)`,
    [maDoi1, maDoi2],
  );
  return {
    side1: new Set(rows.filter((r) => r.ma_doi === maDoi1).map((r) => r.ma_ct)),
    side2: new Set(rows.filter((r) => r.ma_doi === maDoi2).map((r) => r.ma_ct)),
  };
}

async function loadClubs(q: Query): Promise<ClubCard[]> {
  const rows = await q<{
    ma_doi: string;
    ten: string;
    ten_ngan: string;
    san: string;
    thanh_pho: string;
    si_so: number;
    ngoai: number;
  }>(
    `select t.ma_doi, t.ten, t.ten_ngan, s.ten as san, s.thanh_pho,
            count(p.ma_ct)::int as si_so,
            count(p.ma_ct) filter (where p.loai = 'NGOAI')::int as ngoai
     from team t
     join stadium s on s.ma_san = t.ma_san_nha
     join team_dossier d on d.ma_doi = t.ma_doi
     left join player p on p.ma_ho_so = d.ma_ho_so
     where t.ma_mua = $1 and d.trang_thai = 'DaDuyet'
     group by t.ma_doi, t.ten, t.ten_ngan, s.ten, s.thanh_pho
     order by t.ten`,
    [MA_MUA],
  );
  return rows.map((r) => ({
    maDoi: r.ma_doi,
    ten: r.ten,
    tenNgan: r.ten_ngan,
    san: r.san,
    thanhPho: r.thanh_pho,
    siSo: num(r.si_so),
    ngoai: num(r.ngoai),
  }));
}

export const getBoard = createServerFn({ method: "GET" }).handler(async (): Promise<Board> => {
  await ready();
  const q = await db();
  const season = await loadSeason(q);
  const published = Boolean(season?.bxhCongBo);
  return {
    season,
    standings: published ? await loadStandings(q) : [],
    matches: await loadMatches(q, true),
    scorers: published ? await loadScorers(q, true) : [],
    players: await loadPlayers(q),
    goals: await loadGoals(q, true),
    clubs: await loadClubs(q),
  };
});

export const getOps = createServerFn({ method: "GET" }).handler(async (): Promise<OpsData> => {
  await ready();
  const q = await db();
  const user = await sessionUser(q);
  const empty: OpsData = {
    user: null,
    season: await loadSeason(q),
    standings: [],
    matches: [],
    scorers: [],
    goals: {},
    dossiers: [],
    regs: [],
    activeReg: null,
    users: [],
    audit: [],
    notes: [],
    teams: [],
  };
  if (!user) return empty;
  const season = empty.season;
  const regRows = await q<RegRow>(
    "select * from regulation_version where ma_mua = $1 order by ngay_hieu_luc, created_at",
    [MA_MUA],
  );
  const active = await activeReg(q);
  const regs = regRows.map((r) => mapReg(r, active?.ma_phien_ban ?? null));
  const teams = await q<{
    ma_doi: string;
    ten: string;
    ten_ngan: string;
    ma_san_nha: string;
    san: string;
    thanh_pho: string;
  }>(
    `select t.ma_doi, t.ten, t.ten_ngan, t.ma_san_nha, s.ten as san, s.thanh_pho
     from team t join stadium s on s.ma_san = t.ma_san_nha
     where t.ma_mua = $1 order by t.ten`,
    [MA_MUA],
  );
  const notes = await q<{ ma_tb: string; noi_dung: string; da_doc: boolean; created_at: unknown }>(
    `select ma_tb, noi_dung, da_doc, created_at from notification
     where user_id = $1 order by created_at desc limit 8`,
    [user.userId],
  );
  let users: UserView[] = [];
  let audit: AuditView[] = [];
  if (user.vaiTro === "A04" || user.vaiTro === "A01") {
    if (user.vaiTro === "A04") {
      const urows = await q<{
        user_id: string;
        username: string;
        ho_ten: string;
        email: string;
        vai_tro: Role;
        khoa: boolean;
        ma_doi: string | null;
        ten_doi: string | null;
      }>(
        `select u.user_id, u.username, u.ho_ten, u.email, u.vai_tro, u.khoa, u.ma_doi, t.ten as ten_doi
         from app_user u left join team t on t.ma_doi = u.ma_doi
         order by u.vai_tro, u.username`,
      );
      users = urows.map((u) => ({
        userId: u.user_id,
        username: u.username,
        hoTen: u.ho_ten,
        email: u.email,
        vaiTro: u.vai_tro,
        khoa: Boolean(u.khoa),
        maDoi: u.ma_doi,
        tenDoi: u.ten_doi,
      }));
    }
    const arows = await q<{
      ma_log: string;
      ho_ten: string | null;
      vai_tro: string | null;
      hanh_dong: string;
      doi_tuong: string;
      gia_tri_cu: string;
      gia_tri_moi: string;
      created_at: unknown;
    }>(
      `select a.ma_log, u.ho_ten, u.vai_tro, a.hanh_dong, a.doi_tuong, a.gia_tri_cu, a.gia_tri_moi, a.created_at
       from audit_log a left join app_user u on u.user_id = a.user_id
       order by a.created_at desc limit 40`,
    );
    audit = arows.map((a) => ({
      maLog: a.ma_log,
      hoTen: a.ho_ten,
      vaiTro: a.vai_tro,
      hanhDong: a.hanh_dong,
      doiTuong: a.doi_tuong,
      giaTriCu: a.gia_tri_cu,
      giaTriMoi: a.gia_tri_moi,
      createdAt: iso(a.created_at),
    }));
  }
  return {
    user,
    season,
    standings: await loadStandings(q),
    matches: await loadMatches(q, false),
    scorers: await loadScorers(q, false),
    goals: await loadGoals(q, false),
    dossiers: (await loadDossiers(q)).filter((d) =>
      user.vaiTro === "A03" ? d.maDoi === user.maDoi : true,
    ),
    regs,
    activeReg: regs.find((r) => r.active) ?? null,
    users,
    audit,
    notes: notes.map((n) => ({
      maTb: n.ma_tb,
      noiDung: n.noi_dung,
      daDoc: Boolean(n.da_doc),
      createdAt: iso(n.created_at),
    })),
    teams: teams.map(
      (t): TeamOpt => ({
        maDoi: t.ma_doi,
        ten: t.ten,
        tenNgan: t.ten_ngan,
        maSanNha: t.ma_san_nha,
        san: t.san,
        thanhPho: t.thanh_pho,
      }),
    ),
  };
});

export const login = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { username?: string; password?: string };
    return {
      username: String(data?.username ?? "").trim().toLowerCase(),
      password: String(data?.password ?? ""),
    };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    if (!data.username || !data.password) {
      return fail("NFR07", "Nhập đủ tên đăng nhập và mật khẩu.");
    }
    return withTx(async (q) => {
      const rows = await q<UserRow>(
        `select u.user_id, u.username, u.ho_ten, u.vai_tro, u.ma_doi, u.khoa, u.password_hash,
                u.fail_count, t.ten as ten_doi
         from app_user u left join team t on t.ma_doi = u.ma_doi
         where u.username = $1`,
        [data.username],
      );
      const row = rows[0] as (UserRow & { fail_count: number }) | undefined;
      if (!row) {
        await audit(q, null, "DangNhapSai", data.username, "", "Khong ton tai hoac sai mat khau");
        return fail("A2", "Tên đăng nhập hoặc mật khẩu không đúng.");
      }
      if (row.khoa || num(row.fail_count) >= 5) {
        return fail("A3", "Tài khoản đang khóa. Liên hệ quản trị viên.");
      }
      const ok = await verifyPassword(data.password, row.password_hash);
      if (!ok) {
        const fails = num(row.fail_count) + 1;
        await q("update app_user set fail_count = $2 where user_id = $1", [row.user_id, fails]);
        await audit(q, row.user_id, "DangNhapSai", row.username, "", `Lan ${fails}`);
        if (fails >= 5) {
          await q("update app_user set khoa = true where user_id = $1", [row.user_id]);
          return fail("A3", "Sai mật khẩu quá số lần cho phép. Tài khoản đã khóa.");
        }
        return fail("A2", "Tên đăng nhập hoặc mật khẩu không đúng.");
      }
      await q("update app_user set fail_count = 0 where user_id = $1", [row.user_id]);
      const token = crypto.randomUUID() + crypto.randomUUID();
      const tokenHash = await sha(token);
      await q("delete from app_session where user_id = $1", [row.user_id]);
      await q(
        "insert into app_session (token_hash, user_id, expires_at) values ($1, $2, now() + interval '12 hours')",
        [tokenHash, row.user_id],
      );
      await audit(q, row.user_id, "DangNhap", row.username, "", row.vai_tro);
      setCookie(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
      return { ok: true, message: "Đã vào hệ thống." };
    });
  });

export const logout = createServerFn({ method: "POST" }).handler(async (): Promise<ApiOk> => {
  await ready();
  const token = getCookie(COOKIE);
  if (token) {
    const q = await db();
    const tokenHash = await sha(token);
    const rows = await q<{ user_id: string }>(
      "delete from app_session where token_hash = $1 returning user_id",
      [tokenHash],
    );
    if (rows[0]) await audit(q, rows[0].user_id, "DangXuat", rows[0].user_id, "", "");
  }
  deleteCookie(COOKIE, { path: "/" });
  return { ok: true, message: "Đã đăng xuất." };
});

function cleanPlayers(input: unknown): PlayerInput[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw) => {
    const p = raw as Partial<PlayerInput>;
    return {
      hoTen: String(p.hoTen ?? "").trim(),
      ngaySinh: String(p.ngaySinh ?? "").slice(0, 10),
      loai: String(p.loai ?? ""),
      soAo: num(p.soAo),
      viTri: String(p.viTri ?? "").trim(),
    };
  });
}

async function takenElsewhere(q: Query, maDoi: string) {
  const rows = await q<{ ho_ten: string; ngay_sinh: unknown; ten: string }>(
    `select p.ho_ten, p.ngay_sinh, t.ten
     from player p
     join team_dossier d on d.ma_ho_so = p.ma_ho_so
     join team t on t.ma_doi = d.ma_doi
     where d.trang_thai = 'DaDuyet' and d.ma_doi <> $1 and t.ma_mua = $2`,
    [maDoi, MA_MUA],
  );
  return rows.map((r) => ({ hoTen: r.ho_ten, ngaySinh: dateOnly(r.ngay_sinh), tenDoi: r.ten }));
}

export const saveDossier = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { maDoi?: string; players?: unknown };
    return { maDoi: String(data?.maDoi ?? ""), players: cleanPlayers(data?.players) };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A02", "A03"]);
      if (isFail(user)) return user;
      if (user.vaiTro === "A03" && user.maDoi !== data.maDoi) {
        return fail("NFR04", "Người phụ trách chỉ sửa hồ sơ đội của mình.");
      }
      const reg = await activeReg(q);
      const season = await loadSeason(q);
      if (!reg || !season) return fail("E", "Chưa có mùa giải hoặc quy định hiệu lực.");
      const existing = await q<{ trang_thai: string; ma_ho_so: string }>(
        "select trang_thai, ma_ho_so from team_dossier where ma_doi = $1",
        [data.maDoi],
      );
      const status = existing[0]?.trang_thai;
      if (status === "DaDuyet" || status === "ChoDuyet") {
        return fail("A3", "Hồ sơ đang chờ duyệt hoặc đã duyệt, không sửa được.");
      }
      const issues = validateSquad({
        players: data.players,
        reg: {
          tuoiMin: num(reg.tuoi_min),
          tuoiMax: num(reg.tuoi_max),
          siSoMin: num(reg.si_so_min),
          siSoMax: num(reg.si_so_max),
          ngoaiBinhMax: num(reg.ngoai_binh_max),
          tMax: num(reg.t_max),
          diemThang: num(reg.diem_thang),
          diemHoa: num(reg.diem_hoa),
          diemThua: num(reg.diem_thua),
        },
        chot: season.ngayChot,
        taken: await takenElsewhere(q, data.maDoi),
        mode: "draft",
      });
      if (issues.length) {
        return fail(issues[0]!.code, issues.map((i) => `${i.code}: ${i.message}`).join(" "), issues);
      }
      const maHoSo = existing[0]?.ma_ho_so ?? `HS-${data.maDoi}`;
      if (!existing[0]) {
        const team = await q("select ma_doi from team where ma_doi = $1 and ma_mua = $2", [
          data.maDoi,
          MA_MUA,
        ]);
        if (!team[0]) return fail("E", "Không thấy đội trong mùa.");
        await q(
          `insert into team_dossier (ma_ho_so, ma_doi, ma_phien_ban, trang_thai)
           values ($1, $2, $3, 'Nhap')`,
          [maHoSo, data.maDoi, reg.ma_phien_ban],
        );
      } else {
        await q("update team_dossier set trang_thai = 'Nhap', ly_do = '' where ma_ho_so = $1", [maHoSo]);
        await q("delete from player where ma_ho_so = $1", [maHoSo]);
      }
      for (const [i, p] of data.players.entries()) {
        await q(
          `insert into player (ma_ct, ma_ho_so, ho_ten, ngay_sinh, loai, so_ao, vi_tri)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [nid(`CT${i}`), maHoSo, p.hoTen, p.ngaySinh, p.loai, p.soAo, p.viTri],
        );
      }
      await audit(q, user.userId, "LuuNhapHoSo", data.maDoi, status ?? "", `Nhap ${data.players.length} cau thu`);
      return { ok: true, message: "Đã lưu nháp. Chưa gửi chờ duyệt." };
    });
  });

export const submitDossier = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { maDoi?: string; players?: unknown };
    return { maDoi: String(data?.maDoi ?? ""), players: cleanPlayers(data?.players) };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A02", "A03"]);
      if (isFail(user)) return user;
      if (user.vaiTro === "A03" && user.maDoi !== data.maDoi) {
        return fail("NFR04", "Người phụ trách chỉ nộp hồ sơ đội của mình.");
      }
      const saved = await saveInside(q, user, data.maDoi, data.players);
      if (!saved.ok) return saved;
      const reg = await activeReg(q);
      const season = await loadSeason(q);
      if (!reg || !season) return fail("E", "Thiếu quy định hiệu lực.");
      const issues = validateSquad({
        players: data.players,
        reg: {
          tuoiMin: num(reg.tuoi_min),
          tuoiMax: num(reg.tuoi_max),
          siSoMin: num(reg.si_so_min),
          siSoMax: num(reg.si_so_max),
          ngoaiBinhMax: num(reg.ngoai_binh_max),
          tMax: num(reg.t_max),
          diemThang: num(reg.diem_thang),
          diemHoa: num(reg.diem_hoa),
          diemThua: num(reg.diem_thua),
        },
        chot: season.ngayChot,
        taken: await takenElsewhere(q, data.maDoi),
        mode: "submit",
      });
      if (issues.length) {
        return fail(
          issues[0]!.code,
          `Không tạo Chờ duyệt. ${issues.map((i) => `${i.code}: ${i.message}`).join(" ")}`,
          issues,
        );
      }
      await q(
        `update team_dossier
         set trang_thai = 'ChoDuyet', ma_phien_ban = $2, submitted_at = now(), ly_do = ''
         where ma_doi = $1`,
        [data.maDoi, reg.ma_phien_ban],
      );
      await audit(q, user.userId, "NopHoSo", data.maDoi, "Nhap", `ChoDuyet ${reg.ma_phien_ban}`);
      return { ok: true, message: "Hồ sơ hợp lệ, đã chuyển Chờ duyệt. Bảng xếp hạng chưa đổi." };
    });
  });

async function saveInside(
  q: Query,
  user: SessionUser,
  maDoi: string,
  players: PlayerInput[],
): Promise<ApiOk | ApiFail> {
  const reg = await activeReg(q);
  const season = await loadSeason(q);
  if (!reg || !season) return fail("E", "Chưa có mùa giải.");
  const existing = await q<{ trang_thai: string; ma_ho_so: string }>(
    "select trang_thai, ma_ho_so from team_dossier where ma_doi = $1",
    [maDoi],
  );
  const status = existing[0]?.trang_thai;
  if (status === "DaDuyet" || status === "ChoDuyet") {
    return fail("A3", "Hồ sơ đang chờ duyệt hoặc đã duyệt.");
  }
  const issues = validateSquad({
    players,
    reg: {
      tuoiMin: num(reg.tuoi_min),
      tuoiMax: num(reg.tuoi_max),
      siSoMin: num(reg.si_so_min),
      siSoMax: num(reg.si_so_max),
      ngoaiBinhMax: num(reg.ngoai_binh_max),
      tMax: num(reg.t_max),
      diemThang: num(reg.diem_thang),
      diemHoa: num(reg.diem_hoa),
      diemThua: num(reg.diem_thua),
    },
    chot: season.ngayChot,
    taken: await takenElsewhere(q, maDoi),
    mode: "draft",
  });
  if (issues.length) {
    return fail(issues[0]!.code, issues.map((i) => `${i.code}: ${i.message}`).join(" "), issues);
  }
  const maHoSo = existing[0]?.ma_ho_so ?? `HS-${maDoi}`;
  if (!existing[0]) {
    await q(
      `insert into team_dossier (ma_ho_so, ma_doi, ma_phien_ban, trang_thai) values ($1,$2,$3,'Nhap')`,
      [maHoSo, maDoi, reg.ma_phien_ban],
    );
  } else {
    await q("delete from player where ma_ho_so = $1", [maHoSo]);
  }
  for (const [i, p] of players.entries()) {
    await q(
      `insert into player (ma_ct, ma_ho_so, ho_ten, ngay_sinh, loai, so_ao, vi_tri)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [nid(`CT${i}`), maHoSo, p.hoTen, p.ngaySinh, p.loai, p.soAo, p.viTri],
    );
  }
  await audit(q, user.userId, "LuuNhapHoSo", maDoi, status ?? "", `${players.length}`);
  return { ok: true, message: "Đã lưu." };
}

export const reviewDossier = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { maDoi?: string; duyet?: boolean; lyDo?: string };
    return {
      maDoi: String(data?.maDoi ?? ""),
      duyet: Boolean(data?.duyet),
      lyDo: String(data?.lyDo ?? "").trim(),
    };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A01"]);
      if (isFail(user)) return user;
      const rows = await q<{ trang_thai: string }>(
        "select trang_thai from team_dossier where ma_doi = $1",
        [data.maDoi],
      );
      if (rows[0]?.trang_thai !== "ChoDuyet") {
        return fail("A3", "Chỉ duyệt hồ sơ đang Chờ duyệt.");
      }
      if (!data.duyet && !data.lyDo) return fail("NFR07", "Từ chối cần ghi lý do.");
      await q(
        `update team_dossier
         set trang_thai = $2, ly_do = $3, reviewed_at = now(), reviewer_id = $4
         where ma_doi = $1`,
        [data.maDoi, data.duyet ? "DaDuyet" : "Nhap", data.lyDo, user.userId],
      );
      if (data.duyet) await recalc(q);
      await audit(
        q,
        user.userId,
        data.duyet ? "DuyetHoSo" : "TuChoiHoSo",
        data.maDoi,
        "ChoDuyet",
        data.duyet ? "DaDuyet" : data.lyDo,
      );
      return {
        ok: true,
        message: data.duyet ? "Đã duyệt hồ sơ. Đội được đưa vào lịch." : "Đã từ chối. Hồ sơ về Nháp, đội chưa vào lịch.",
      };
    });
  });

export const createMatch = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { vong?: number; maDoi1?: string; maDoi2?: string; kickoff?: string };
    return {
      vong: num(data?.vong),
      maDoi1: String(data?.maDoi1 ?? ""),
      maDoi2: String(data?.maDoi2 ?? ""),
      kickoff: String(data?.kickoff ?? ""),
    };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A02"]);
      if (isFail(user)) return user;
      if (data.vong !== 1 && data.vong !== 2) return fail("BR06", "Vòng chỉ là lượt đi (1) hoặc lượt về (2).");
      if (data.maDoi1 === data.maDoi2) return fail("BR06", "Một trận cần đúng hai đội.");
      const when = new Date(data.kickoff);
      if (Number.isNaN(when.getTime())) return fail("NFR07", "Thiếu ngày giờ hợp lệ.");
      const homes = await q<{ ma_san_nha: string; trang_thai: string }>(
        `select t.ma_san_nha, d.trang_thai from team t
         left join team_dossier d on d.ma_doi = t.ma_doi
         where t.ma_doi = $1`,
        [data.maDoi1],
      );
      const away = await q<{ trang_thai: string }>(
        `select d.trang_thai from team_dossier d where d.ma_doi = $1`,
        [data.maDoi2],
      );
      if (homes[0]?.trang_thai !== "DaDuyet" || away[0]?.trang_thai !== "DaDuyet") {
        return fail("UC06", "Chỉ xếp lịch cho đội đã duyệt hồ sơ.");
      }
      const maSan = homes[0]!.ma_san_nha;
      const existing = await q<{ vong: number; ma_doi_1: string; ma_doi_2: string }>(
        `select vong, ma_doi_1, ma_doi_2 from match
         where ma_mua = $1 and trang_thai_lich <> 'Huy'`,
        [MA_MUA],
      );
      const pair = existing.filter((m) => samePair(m.ma_doi_1, m.ma_doi_2, data.maDoi1, data.maDoi2));
      if (pair.length >= 2) return fail("BR06", "Hai đội đã có đủ lượt đi và lượt về.");
      if (pair.some((m) => num(m.vong) === data.vong)) {
        return fail("BR06", "Cùng vòng đã có trận của hai đội này.");
      }
      const other = pair[0];
      if (other && other.ma_doi_1 === data.maDoi1) {
        return fail("BR06", "Lượt còn lại phải đổi sân: đội 1 của lượt này đang là chủ nhà ở lượt kia.");
      }
      const clash = await q(
        `select ma_tran from match
         where ma_mua = $1 and trang_thai_lich <> 'Huy'
           and kickoff between $2::timestamptz - interval '2 hours' and $2::timestamptz + interval '2 hours'
           and (ma_doi_1 in ($3, $4) or ma_doi_2 in ($3, $4) or ma_san = $5)`,
        [MA_MUA, when.toISOString(), data.maDoi1, data.maDoi2, maSan],
      );
      if (clash.length) return fail("UC06", "Trùng sân hoặc trùng đội trong cửa sổ 2 giờ.");
      const ma = nid("TD");
      await q(
        `insert into match (ma_tran, ma_mua, vong, ma_doi_1, ma_doi_2, ma_san, kickoff, trang_thai_lich)
         values ($1,$2,$3,$4,$5,$6,$7,'Nhap')`,
        [ma, MA_MUA, data.vong, data.maDoi1, data.maDoi2, maSan, when.toISOString()],
      );
      await audit(q, user.userId, "TaoTran", ma, "", `${data.maDoi1}-${data.maDoi2} vong ${data.vong}`);
      return { ok: true, message: "Đã lưu trận nháp. Khách chưa thấy cho đến khi công bố." };
    });
  });

export const publishSchedule = createServerFn({ method: "POST" }).handler(
  async (): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A01"]);
      if (isFail(user)) return user;
      const before = await q<{ n: number }>(
        "select count(*)::int as n from match where ma_mua = $1 and trang_thai_lich = 'Nhap'",
        [MA_MUA],
      );
      await q(
        "update match set trang_thai_lich = 'CongBo' where ma_mua = $1 and trang_thai_lich = 'Nhap'",
        [MA_MUA],
      );
      await q("update season set lich_cong_bo = true where ma_mua = $1", [MA_MUA]);
      await notifyAll(q, "Lịch đã công bố vừa được cập nhật. Vào bảng tin để xem giờ thi đấu mới.");
      await audit(q, user.userId, "CongBoLich", MA_MUA, "", `Cong bo ${num(before[0]?.n)} tran nhap`);
      return { ok: true, message: "Đã công bố lịch. Người xem thấy các trận này." };
    });
  },
);

export const shiftKickoff = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { maTran?: string; kickoff?: string; lyDo?: string };
    return {
      maTran: String(data?.maTran ?? ""),
      kickoff: String(data?.kickoff ?? ""),
      lyDo: String(data?.lyDo ?? "").trim(),
    };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A01"]);
      if (isFail(user)) return user;
      if (!data.lyDo) return fail("NFR07", "Đổi lịch đã công bố cần ghi lý do.");
      const when = new Date(data.kickoff);
      if (Number.isNaN(when.getTime())) return fail("NFR07", "Thiếu ngày giờ hợp lệ.");
      const rows = await q<{
        trang_thai_lich: string;
        ma_doi_1: string;
        ma_doi_2: string;
        ma_san: string;
        kickoff: string;
        ten1: string;
        ten2: string;
        kq: string | null;
      }>(
        `select m.trang_thai_lich, m.ma_doi_1, m.ma_doi_2, m.ma_san, m.kickoff::text,
                a.ten as ten1, b.ten as ten2, r.trang_thai as kq
         from match m
         join team a on a.ma_doi = m.ma_doi_1
         join team b on b.ma_doi = m.ma_doi_2
         left join match_result r on r.ma_tran = m.ma_tran
         where m.ma_tran = $1`,
        [data.maTran],
      );
      const match = rows[0];
      if (!match || match.trang_thai_lich !== "CongBo") {
        return fail("UC06", "Chỉ đổi trận đã công bố. Trận nháp sửa bằng cách lập lại.");
      }
      if (match.kq === "DaXacNhan") return fail("UC06", "Trận đã khóa kết quả, không đổi giờ.");
      const clash = await q(
        `select ma_tran from match
         where ma_mua = $1 and trang_thai_lich <> 'Huy' and ma_tran <> $2
           and kickoff between $3::timestamptz - interval '2 hours' and $3::timestamptz + interval '2 hours'
           and (ma_doi_1 in ($4, $5) or ma_doi_2 in ($4, $5) or ma_san = $6)`,
        [MA_MUA, data.maTran, when.toISOString(), match.ma_doi_1, match.ma_doi_2, match.ma_san],
      );
      if (clash.length) return fail("UC06", "Trùng sân hoặc trùng đội trong cửa sổ 2 giờ.");
      await q("update match set kickoff = $2 where ma_tran = $1", [data.maTran, when.toISOString()]);
      await notifyRoles(
        q,
        ["A02"],
        [match.ma_doi_1, match.ma_doi_2],
        `Lịch đã công bố đổi giờ: ${match.ten1} – ${match.ten2}. Lý do: ${data.lyDo}`,
      );
      await audit(q, user.userId, "DoiLichCongBo", data.maTran, String(match.kickoff), `${when.toISOString()} ${data.lyDo}`);
      return { ok: true, message: "Đã đổi giờ trận công bố và gửi thông báo cho phụ trách hai đội." };
    });
  });

type ResultBody = { maTran: string; ban1: number; ban2: number; version: number | null; goals: GoalIn[]; ghiChu: string };

function cleanResult(input: unknown): ResultBody {
  const data = input as Partial<ResultBody> & { goals?: unknown };
  const goals = Array.isArray(data.goals)
    ? data.goals.map((raw) => {
        const g = raw as Partial<GoalIn>;
        return {
          maCt: String(g.maCt ?? ""),
          loai: String(g.loai ?? ""),
          phut: num(g.phut),
          doi: String(g.doi ?? ""),
        };
      })
    : [];
  return {
    maTran: String(data.maTran ?? ""),
    ban1: num(data.ban1),
    ban2: num(data.ban2),
    version: data.version == null || data.version === ("" as never) ? null : num(data.version),
    goals,
    ghiChu: String(data.ghiChu ?? "").slice(0, 300),
  };
}

export const saveResult = createServerFn({ method: "POST" })
  .validator((input: unknown) => cleanResult(input))
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A02"]);
      if (isFail(user)) return user;
      const matches = await q<{
        ma_tran: string;
        ma_doi_1: string;
        ma_doi_2: string;
        trang_thai_lich: string;
      }>("select ma_tran, ma_doi_1, ma_doi_2, trang_thai_lich from match where ma_tran = $1", [
        data.maTran,
      ]);
      const match = matches[0];
      if (!match || match.trang_thai_lich === "Huy") return fail("UC09", "Không thấy trận để ghi.");
      const reg = await activeReg(q);
      const sides = await sideSets(q, match.ma_doi_1, match.ma_doi_2);
      const issues = validateResult({
        ban1: data.ban1,
        ban2: data.ban2,
        tmax: num(reg?.t_max ?? 90),
        goals: data.goals,
        side1: sides.side1,
        side2: sides.side2,
      });
      if (issues.length) {
        return fail(
          issues[0]!.code,
          `Không tạo Chờ xác nhận. ${issues.map((i) => `${i.code}: ${i.message}`).join(" ")}`,
          issues,
        );
      }
      const existing = await q<{ ma_kq: string; trang_thai: string; version: number; ban_doi_1: number; ban_doi_2: number }>(
        "select ma_kq, trang_thai, version, ban_doi_1, ban_doi_2 from match_result where ma_tran = $1",
        [data.maTran],
      );
      const cur = existing[0];
      if (cur?.trang_thai === "DaXacNhan") {
        return fail("A6", "Kết quả đã khóa. Chỉ ban tổ chức mở khóa rồi mới sửa.");
      }
      if (cur && data.version != null && num(cur.version) !== data.version) {
        return fail("E2", "Có người vừa sửa kết quả này. Tải lại rồi nhập tiếp.");
      }
      const maKq = cur?.ma_kq ?? nid("KQ");
      const version = cur ? num(cur.version) + 1 : 1;
      if (!cur) {
        await q(
          `insert into match_result (ma_kq, ma_tran, ban_doi_1, ban_doi_2, trang_thai, cong_bo, version, ghi_chu)
           values ($1,$2,$3,$4,'ChoXacNhan', false, $5, $6)`,
          [maKq, data.maTran, data.ban1, data.ban2, version, data.ghiChu],
        );
      } else {
        await q("delete from goal_event where ma_kq = $1", [maKq]);
        await q(
          `update match_result
           set ban_doi_1 = $2, ban_doi_2 = $3, trang_thai = 'ChoXacNhan', cong_bo = false,
               version = $4, ghi_chu = $5, updated_at = now()
           where ma_kq = $1`,
          [maKq, data.ban1, data.ban2, version, data.ghiChu],
        );
      }
      for (const [i, g] of data.goals.entries()) {
        await q(
          `insert into goal_event (ma_ban, ma_kq, ma_ct, loai, phut, doi) values ($1,$2,$3,$4,$5,$6)`,
          [nid(`B${i}`), maKq, g.maCt, g.loai, g.phut, g.doi],
        );
      }
      await notifyRoles(
        q,
        ["A01"],
        [],
        `Có tỷ số chờ xác nhận ${data.ban1}–${data.ban2}. Bảng xếp hạng chưa đổi.`,
      );
      await audit(
        q,
        user.userId,
        "GhiNhanKetQua",
        data.maTran,
        cur ? `${cur.ban_doi_1}-${cur.ban_doi_2}` : "",
        `ChoXacNhan ${data.ban1}-${data.ban2}`,
      );
      return {
        ok: true,
        message: "Đã lưu Chờ xác nhận. Bảng xếp hạng chưa đổi — đúng BR10.",
      };
    });
  });

export const confirmResult = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { maTran?: string; version?: number };
    return { maTran: String(data?.maTran ?? ""), version: num(data?.version) };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A01"]);
      if (isFail(user)) return user;
      const rows = await q<{ trang_thai: string; version: number; ban_doi_1: number; ban_doi_2: number }>(
        "select trang_thai, version, ban_doi_1, ban_doi_2 from match_result where ma_tran = $1",
        [data.maTran],
      );
      const row = rows[0];
      if (!row || row.trang_thai !== "ChoXacNhan") {
        return fail("UC09", "Chỉ xác nhận kết quả đang Chờ xác nhận.");
      }
      if (num(row.version) !== data.version) return fail("E2", "Phiên bản kết quả đã đổi. Tải lại.");
      const reg = await activeReg(q);
      if (!reg) return fail("E1", "Chưa có quy định hiệu lực để khóa kết quả.");
      await q(
        `update match_result
         set trang_thai = 'DaXacNhan', ma_phien_ban = $2, version = version + 1, updated_at = now()
         where ma_tran = $1`,
        [data.maTran, reg.ma_phien_ban],
      );
      await recalc(q);
      await audit(
        q,
        user.userId,
        "XacNhanKetQua",
        data.maTran,
        "ChoXacNhan",
        `DaXacNhan ${row.ban_doi_1}-${row.ban_doi_2}; BXH da tinh lai`,
      );
      return { ok: true, message: "Đã khóa kết quả và cập nhật bảng xếp hạng trong cùng một giao dịch." };
    });
  });

export const rejectResult = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { maTran?: string; version?: number; lyDo?: string };
    return {
      maTran: String(data?.maTran ?? ""),
      version: num(data?.version),
      lyDo: String(data?.lyDo ?? "").trim(),
    };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A01"]);
      if (isFail(user)) return user;
      if (!data.lyDo) return fail("NFR07", "Từ chối cần ghi lý do để nhân viên sửa.");
      const rows = await q<{ trang_thai: string; version: number }>(
        "select trang_thai, version from match_result where ma_tran = $1",
        [data.maTran],
      );
      if (rows[0]?.trang_thai !== "ChoXacNhan") return fail("UC09", "Không có kết quả đang chờ.");
      if (num(rows[0].version) !== data.version) return fail("E2", "Phiên bản đã đổi. Tải lại.");
      await q(
        `update match_result
         set trang_thai = 'TuChoi', ghi_chu = $2, version = version + 1, updated_at = now()
         where ma_tran = $1`,
        [data.maTran, data.lyDo],
      );
      await audit(q, user.userId, "TuChoiKetQua", data.maTran, "ChoXacNhan", data.lyDo);
      return { ok: true, message: "Đã từ chối. Bảng xếp hạng giữ nguyên." };
    });
  });

export const unlockResult = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { maTran?: string; version?: number };
    return { maTran: String(data?.maTran ?? ""), version: num(data?.version) };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A01"]);
      if (isFail(user)) return user;
      const rows = await q<{ trang_thai: string; version: number; ban_doi_1: number; ban_doi_2: number }>(
        "select trang_thai, version, ban_doi_1, ban_doi_2 from match_result where ma_tran = $1",
        [data.maTran],
      );
      const row = rows[0];
      if (row?.trang_thai !== "DaXacNhan") return fail("A6", "Chỉ mở khóa kết quả đã xác nhận.");
      if (num(row.version) !== data.version) return fail("E2", "Phiên bản đã đổi. Tải lại.");
      await q(
        `update match_result
         set trang_thai = 'Nhap', cong_bo = false, version = version + 1, updated_at = now()
         where ma_tran = $1`,
        [data.maTran],
      );
      await recalc(q);
      await audit(
        q,
        user.userId,
        "MoKhoaKetQua",
        data.maTran,
        `${row.ban_doi_1}-${row.ban_doi_2}`,
        "Nhap; BXH tinh lai khong con tran nay",
      );
      return { ok: true, message: "Đã mở khóa và hoàn nguyên bảng xếp hạng." };
    });
  });

export const publishBoard = createServerFn({ method: "POST" }).handler(async (): Promise<ApiOk | ApiFail> => {
  await ready();
  return withTx(async (q) => {
    const user = await requireUser(q, ["A01"]);
    if (isFail(user)) return user;
    await q(
      `update match_result set cong_bo = true
       where trang_thai = 'DaXacNhan'
         and ma_tran in (select ma_tran from match where ma_mua = $1)`,
      [MA_MUA],
    );
    await q("update season set bxh_cong_bo = true where ma_mua = $1", [MA_MUA]);
    await notifyAll(q, "Bảng xếp hạng và kết quả đã xác nhận vừa được công bố.");
    await audit(q, user.userId, "CongBoBXH", MA_MUA, "", "bxh_cong_bo");
    return { ok: true, message: "Người tra cứu đã thấy bảng xếp hạng và tỷ số đã khóa." };
  });
});

export const createRegulation = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = input as Record<string, unknown>;
    return {
      tuoiMin: num(d.tuoiMin),
      tuoiMax: num(d.tuoiMax),
      siSoMin: num(d.siSoMin),
      siSoMax: num(d.siSoMax),
      ngoaiBinhMax: num(d.ngoaiBinhMax),
      diemThang: num(d.diemThang),
      diemHoa: num(d.diemHoa),
      diemThua: num(d.diemThua),
      tMax: num(d.tMax),
      ngayHieuLuc: String(d.ngayHieuLuc ?? "").slice(0, 10),
      ghiChu: String(d.ghiChu ?? "").slice(0, 400),
    };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    const issues = validateRegulation(data);
    if (issues.length) return fail(issues[0]!.code, issues.map((i) => i.message).join(" "), issues);
    return withTx(async (q) => {
      const user = await requireUser(q, ["A01", "A04"]);
      if (isFail(user)) return user;
      const prev = await activeReg(q);
      const count = await q<{ n: number }>(
        "select count(*)::int as n from regulation_version where ma_mua = $1",
        [MA_MUA],
      );
      const ma = `PB-2026-${String(num(count[0]?.n) + 1).padStart(2, "0")}`;
      const trangThai = user.vaiTro === "A01" ? "HieuLuc" : "ChoXacNhan";
      await q(
        `insert into regulation_version
          (ma_phien_ban, ma_mua, tuoi_min, tuoi_max, si_so_min, si_so_max, ngoai_binh_max,
           diem_thang, diem_hoa, diem_thua, t_max, ngay_hieu_luc, ghi_chu, nguoi_tao, trang_thai)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          ma,
          MA_MUA,
          data.tuoiMin,
          data.tuoiMax,
          data.siSoMin,
          data.siSoMax,
          data.ngoaiBinhMax,
          data.diemThang,
          data.diemHoa,
          data.diemThua,
          data.tMax,
          data.ngayHieuLuc,
          data.ghiChu,
          user.userId,
          trangThai,
        ],
      );
      await audit(
        q,
        user.userId,
        "ThemPhienBanQD6",
        ma,
        prev ? `${prev.ma_phien_ban} diem ${prev.diem_thang}-${prev.diem_hoa}-${prev.diem_thua}` : "",
        `${trangThai} ${data.ngayHieuLuc} diem ${data.diemThang}-${data.diemHoa}-${data.diemThua}`,
      );
      return {
        ok: true,
        message:
          trangThai === "HieuLuc"
            ? `Đã ban hành ${ma}. Bản cũ không bị sửa. Bảng đã khóa giữ điểm cũ.`
            : `Đã gửi ${ma} chờ ban tổ chức xác nhận. Luật đang chạy chưa đổi.`,
      };
    });
  });

export const confirmRegulation = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { maPhienBan?: string };
    return { maPhienBan: String(data?.maPhienBan ?? "") };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A01"]);
      if (isFail(user)) return user;
      const rows = await q<{ trang_thai: string; ngay_hieu_luc: unknown }>(
        "select trang_thai, ngay_hieu_luc from regulation_version where ma_phien_ban = $1",
        [data.maPhienBan],
      );
      if (rows[0]?.trang_thai !== "ChoXacNhan") {
        return fail("UC16", "Chỉ xác nhận phiên bản đang chờ.");
      }
      await q("update regulation_version set trang_thai = 'HieuLuc' where ma_phien_ban = $1", [
        data.maPhienBan,
      ]);
      await audit(q, user.userId, "XacNhanQD6", data.maPhienBan, "ChoXacNhan", "HieuLuc");
      return {
        ok: true,
        message: "Đã cho hiệu lực. Không tính lại bảng của các trận đã khóa trước đó.",
      };
    });
  });

export const createUser = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = input as Record<string, unknown>;
    return {
      username: String(d.username ?? "").trim().toLowerCase(),
      hoTen: String(d.hoTen ?? "").trim(),
      email: String(d.email ?? "").trim(),
      password: String(d.password ?? ""),
      vaiTro: String(d.vaiTro ?? "") as Role,
      maDoi: String(d.maDoi ?? ""),
    };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    if (!/^[a-z0-9.]{3,32}$/.test(data.username)) {
      return fail("NFR07", "Tên đăng nhập 3–32 ký tự, chữ thường, số hoặc dấu chấm.");
    }
    if (!data.hoTen || !data.email || data.password.length < 6) {
      return fail("NFR07", "Cần họ tên, email và mật khẩu từ 6 ký tự.");
    }
    if (!["A01", "A02", "A03", "A04"].includes(data.vaiTro)) {
      return fail("FR02", "Mỗi tài khoản gán đúng một vai A01–A04.");
    }
    if (data.vaiTro === "A03" && !data.maDoi) return fail("NFR07", "Phụ trách đội phải gắn một đội.");
    return withTx(async (q) => {
      const user = await requireUser(q, ["A04"]);
      if (isFail(user)) return user;
      const hash = await hashPassword(data.password);
      try {
        await q(
          `insert into app_user (user_id, username, ho_ten, email, password_hash, vai_tro, ma_doi)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [nid("U"), data.username, data.hoTen, data.email, hash, data.vaiTro, data.vaiTro === "A03" ? data.maDoi : null],
        );
      } catch {
        return fail("FR02", "Tên đăng nhập đã có.");
      }
      await audit(q, user.userId, "TaoTaiKhoan", data.username, "", data.vaiTro);
      return { ok: true, message: "Đã tạo tài khoản. Mật khẩu chỉ lưu dạng băm." };
    });
  });

export const setLock = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = input as { userId?: string; khoa?: boolean };
    return { userId: String(d.userId ?? ""), khoa: Boolean(d.khoa) };
  })
  .handler(async ({ data }): Promise<ApiOk | ApiFail> => {
    await ready();
    return withTx(async (q) => {
      const user = await requireUser(q, ["A04"]);
      if (isFail(user)) return user;
      if (user.userId === data.userId) return fail("FR02", "Không tự khóa tài khoản đang dùng.");
      await q("update app_user set khoa = $2, fail_count = 0 where user_id = $1", [
        data.userId,
        data.khoa,
      ]);
      if (data.khoa) await q("delete from app_session where user_id = $1", [data.userId]);
      await audit(q, user.userId, data.khoa ? "KhoaTaiKhoan" : "MoKhoaTaiKhoan", data.userId, "", String(data.khoa));
      return { ok: true, message: data.khoa ? "Đã khóa." : "Đã mở khóa." };
    });
  });

export const markNotesRead = createServerFn({ method: "POST" }).handler(async (): Promise<ApiOk | ApiFail> => {
  await ready();
  const q = await db();
  const user = await requireUser(q);
  if (isFail(user)) return user;
  await q("update notification set da_doc = true where user_id = $1", [user.userId]);
  return { ok: true, message: "Đã đọc." };
});

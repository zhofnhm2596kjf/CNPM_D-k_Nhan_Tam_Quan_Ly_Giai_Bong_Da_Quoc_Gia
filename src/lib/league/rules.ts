import type { Issue, PlayerInput } from "@/lib/league/types";

export type Points = { win: number; draw: number; loss: number };

export type Fact = { home: string; away: string; hg: number; ag: number; pts?: Points };

export type StandingCalc = {
  maDoi: string;
  tran: number;
  thang: number;
  hoa: number;
  thua: number;
  banThang: number;
  banThua: number;
  hieuSo: number;
  diem: number;
  banSanKhach: number;
  hang: number;
};

export type RegBounds = {
  tuoiMin: number;
  tuoiMax: number;
  siSoMin: number;
  siSoMax: number;
  ngoaiBinhMax: number;
  tMax: number;
  diemThang: number;
  diemHoa: number;
  diemThua: number;
};

export function ageOn(chot: string, dob: string): number {
  const c = new Date(`${chot.slice(0, 10)}T00:00:00Z`);
  const d = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(c.getTime()) || Number.isNaN(d.getTime())) return -1;
  let age = c.getUTCFullYear() - d.getUTCFullYear();
  const m = c.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && c.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateSquad(opts: {
  players: PlayerInput[];
  reg: RegBounds;
  chot: string;
  taken: { hoTen: string; ngaySinh: string; tenDoi: string }[];
  mode: "draft" | "submit";
}): Issue[] {
  const issues: Issue[] = [];
  const shirts = new Set<number>();
  const seen = new Set<string>();
  const taken = new Map(
    opts.taken.map((t) => [`${normName(t.hoTen)}|${t.ngaySinh.slice(0, 10)}`, t.tenDoi]),
  );

  opts.players.forEach((p, index) => {
    const line = index + 1;
    if (!p.hoTen.trim() || !p.ngaySinh || !p.viTri.trim()) {
      issues.push({
        code: "NFR07",
        message: `Dòng ${line} thiếu họ tên, ngày sinh hoặc vị trí.`,
      });
      return;
    }
    if (p.loai !== "TRONG" && p.loai !== "NGOAI") {
      issues.push({
        code: "BR04",
        message: `${p.hoTen}: phải đúng một loại trong nước hoặc ngoài nước.`,
      });
    }
    if (!Number.isInteger(p.soAo) || p.soAo < 1 || p.soAo > 99) {
      issues.push({ code: "BR05", message: `${p.hoTen}: số áo phải từ 1 đến 99.` });
    } else if (shirts.has(p.soAo)) {
      issues.push({ code: "BR05", message: `Số áo ${p.soAo} bị trùng trong hồ sơ.` });
    } else {
      shirts.add(p.soAo);
    }
    const key = `${normName(p.hoTen)}|${p.ngaySinh.slice(0, 10)}`;
    if (seen.has(key)) {
      issues.push({ code: "BR05", message: `${p.hoTen} bị nhập hai lần trong cùng hồ sơ.` });
    }
    seen.add(key);
    const other = taken.get(key);
    if (other) {
      issues.push({
        code: "BR05",
        message: `${p.hoTen} đã thuộc ${other} trong mùa này.`,
      });
    }
    if (opts.mode === "submit" && (p.loai === "TRONG" || p.loai === "NGOAI")) {
      const age = ageOn(opts.chot, p.ngaySinh);
      if (age < opts.reg.tuoiMin || age > opts.reg.tuoiMax) {
        issues.push({
          code: "BR01",
          message: `${p.hoTen} tuổi ${age} ngoài khoảng ${opts.reg.tuoiMin}–${opts.reg.tuoiMax} tại ngày chốt hồ sơ.`,
        });
      }
    }
  });

  if (opts.mode === "submit") {
    const n = opts.players.length;
    if (n < opts.reg.siSoMin || n > opts.reg.siSoMax) {
      issues.push({
        code: "BR02",
        message: `Sĩ số ${n} ngoài khoảng ${opts.reg.siSoMin}–${opts.reg.siSoMax}.`,
      });
    }
    const ngoai = opts.players.filter((p) => p.loai === "NGOAI").length;
    if (ngoai > opts.reg.ngoaiBinhMax) {
      issues.push({
        code: "BR03",
        message: `Ngoại binh ${ngoai} vượt trần ${opts.reg.ngoaiBinhMax}.`,
      });
    }
  }

  return issues;
}

export type GoalIn = { maCt: string; loai: string; phut: number; doi: string };

export function validateResult(opts: {
  ban1: number;
  ban2: number;
  tmax: number;
  goals: GoalIn[];
  side1: Set<string>;
  side2: Set<string>;
}): Issue[] {
  const issues: Issue[] = [];
  if (!Number.isInteger(opts.ban1) || !Number.isInteger(opts.ban2) || opts.ban1 < 0 || opts.ban2 < 0) {
    issues.push({ code: "TYSO", message: "Tỷ số phải là số nguyên không âm." });
    return issues;
  }
  let c1 = 0;
  let c2 = 0;
  opts.goals.forEach((g, index) => {
    const line = index + 1;
    if (g.loai !== "A" && g.loai !== "B" && g.loai !== "C") {
      issues.push({ code: "BR08", message: `Bàn ${line} phải thuộc đúng một loại A, B hoặc C.` });
    }
    if (!Number.isInteger(g.phut) || g.phut < 0 || g.phut > opts.tmax) {
      issues.push({
        code: "BR09",
        message: `Bàn ${line} có phút ${g.phut} ngoài [0, ${opts.tmax}].`,
      });
    }
    const side = g.doi === "1" ? opts.side1 : g.doi === "2" ? opts.side2 : null;
    if (!side) {
      issues.push({ code: "BR14", message: `Bàn ${line} chưa gắn đội 1 hoặc đội 2.` });
    } else if (!side.has(g.maCt)) {
      issues.push({
        code: "BR14",
        message: `Bàn ${line}: cầu thủ không thuộc đúng đội trong trận.`,
      });
    }
    if (g.doi === "1") c1 += 1;
    if (g.doi === "2") c2 += 1;
  });
  if (c1 !== opts.ban1 || c2 !== opts.ban2) {
    issues.push({
      code: "TYSO",
      message: `Tổng bàn (${c1}–${c2}) không khớp tỷ số ${opts.ban1}–${opts.ban2}.`,
    });
  }
  return issues;
}

export function validateRegulation(input: RegBounds & { ngayHieuLuc: string }): Issue[] {
  const issues: Issue[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.ngayHieuLuc)) {
    issues.push({ code: "BR13", message: "Ngày hiệu lực không đúng định dạng." });
  }
  if (!(input.tuoiMin < input.tuoiMax)) {
    issues.push({ code: "BR01", message: "Tuổi tối thiểu phải nhỏ hơn tuổi tối đa." });
  }
  if (!(input.siSoMin <= input.siSoMax) || input.siSoMin < 1) {
    issues.push({ code: "BR02", message: "Sĩ số tối thiểu / tối đa không hợp lệ." });
  }
  if (input.ngoaiBinhMax < 0) {
    issues.push({ code: "BR03", message: "Trần ngoại binh không được âm." });
  }
  if (!(input.diemThang > input.diemHoa && input.diemHoa > input.diemThua)) {
    issues.push({ code: "BR11", message: "Điểm phải thỏa thắng > hòa > thua." });
  }
  if (input.tMax < 1 || input.tMax > 150) {
    issues.push({ code: "BR09", message: "Tmax phải từ 1 đến 150 phút." });
  }
  return issues;
}

/** Lượt đi và lượt về, đội chủ nhà đổi sân. */
export function roundRobin(ids: string[]): { vong: 1 | 2; home: string; away: string }[] {
  const games: { vong: 1 | 2; home: string; away: string }[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const swap = (i + j) % 2 === 1;
      const home = swap ? ids[j]! : ids[i]!;
      const away = swap ? ids[i]! : ids[j]!;
      games.push({ vong: 1, home, away });
      games.push({ vong: 2, home: away, away: home });
    }
  }
  return games;
}

export function computeStandings(teamIds: string[], facts: Fact[], pts: Points): StandingCalc[] {
  const map = new Map<string, StandingCalc>();
  for (const id of teamIds) {
    map.set(id, {
      maDoi: id,
      tran: 0,
      thang: 0,
      hoa: 0,
      thua: 0,
      banThang: 0,
      banThua: 0,
      hieuSo: 0,
      diem: 0,
      banSanKhach: 0,
      hang: 0,
    });
  }
  for (const f of facts) {
    const h = map.get(f.home);
    const a = map.get(f.away);
    if (!h || !a) continue;
    const p = f.pts ?? pts;
    h.tran += 1;
    a.tran += 1;
    h.banThang += f.hg;
    h.banThua += f.ag;
    a.banThang += f.ag;
    a.banThua += f.hg;
    a.banSanKhach += f.ag;
    if (f.hg > f.ag) {
      h.thang += 1;
      h.diem += p.win;
      a.thua += 1;
      a.diem += p.loss;
    } else if (f.hg < f.ag) {
      a.thang += 1;
      a.diem += p.win;
      h.thua += 1;
      h.diem += p.loss;
    } else {
      h.hoa += 1;
      a.hoa += 1;
      h.diem += p.draw;
      a.diem += p.draw;
    }
  }
  for (const s of map.values()) s.hieuSo = s.banThang - s.banThua;

  const key = (id: string) => {
    const s = map.get(id)!;
    return [s.diem, s.hieuSo, s.banSanKhach, s.banThang] as const;
  };
  const ids = [...teamIds].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return b[i]! - a[i]!;
    return x.localeCompare(y);
  });

  const ordered: string[] = [];
  let i = 0;
  while (i < ids.length) {
    let j = i + 1;
    const base = key(ids[i]!);
    while (j < ids.length && key(ids[j]!).every((v, k) => v === base[k])) j += 1;
    const group = ids.slice(i, j);
    if (group.length > 1) {
      const set = new Set(group);
      const h2h = (id: string) => {
        let points = 0;
        let gd = 0;
        for (const f of facts) {
          if (!set.has(f.home) || !set.has(f.away)) continue;
          if (f.home !== id && f.away !== id) continue;
          const gf = f.home === id ? f.hg : f.ag;
          const ga = f.home === id ? f.ag : f.hg;
          const rule = f.pts ?? pts;
          gd += gf - ga;
          if (gf > ga) points += rule.win;
          else if (gf === ga) points += rule.draw;
          else points += rule.loss;
        }
        return { p: points, gd };
      };
      group.sort((x, y) => {
        const hx = h2h(x);
        const hy = h2h(y);
        return hy.p - hx.p || hy.gd - hx.gd || x.localeCompare(y);
      });
    }
    ordered.push(...group);
    i = j;
  }

  return ordered.map((id, idx) => ({ ...map.get(id)!, hang: idx + 1 }));
}

export function samePair(a1: string, a2: string, b1: string, b2: string): boolean {
  return (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1);
}

import { useMemo, useState } from "react";
import type { Board, GoalView } from "@/lib/league/types";
import { Badge, when } from "@/components/vdqg/ui";

export function PublicBoard({ board }: { board: Board }) {
  const [vong, setVong] = useState<1 | 2>(1);
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const [loai, setLoai] = useState("");
  const [onlyGoals, setOnlyGoals] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [club, setClub] = useState<string | null>(null);
  const matches = board.matches.filter((m) => m.vong === vong);
  const players = useMemo(() => {
    const n = q.trim().toLowerCase();
    const filtered = board.players.filter((p) => {
      if (team && p.tenDoi !== team) return false;
      if (loai && p.loai !== loai) return false;
      if (onlyGoals && p.ban < 1) return false;
      if (!n) return true;
      return p.hoTen.toLowerCase().includes(n) || p.tenDoi.toLowerCase().includes(n) || String(p.soAo) === n;
    });
    if (!n && !team && !loai && !onlyGoals) return filtered.slice(0, 12);
    return filtered;
  }, [q, team, loai, onlyGoals, board.players]);
  const squad = board.players.filter((p) => p.tenDoi === club);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6">
      <section>
        <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">
          Đề 1.10 · Bản người tra cứu
        </p>
        <h1 className="mt-2 max-w-3xl text-4xl text-ink sm:text-5xl">
          {board.season?.ten ?? "Giải vô địch bóng đá quốc gia"}
        </h1>
        <div className="mast-rule mt-4" />
        <p className="mt-4 max-w-2xl text-sm text-muted">
          Khách không cần tài khoản. Trang này chỉ hiện hồ sơ đã duyệt, lịch đã công bố và tỷ số đã khóa.
          Trận chờ xác nhận không làm đổi điểm. Quy định mới không viết lại bảng của trận đã chốt.
        </p>
      </section>

      {!board.season?.bxhCongBo ? (
        <p className="rounded-md bg-seal-soft px-4 py-3 text-sm text-seal">
          Ban tổ chức chưa công bố bảng xếp hạng.
        </p>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div className="overflow-hidden rounded-lg border border-line bg-sheet">
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-2xl">Bảng xếp hạng</h2>
              <span className="text-xs text-muted">Điểm · hiệu số · bàn sân khách</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-pitch text-left text-ivory">
                  <tr>
                    {["#", "Đội", "Tr", "T", "H", "B", "BT", "BB", "HS", "SK", "Đ"].map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.standings.map((s) => (
                    <tr key={s.maDoi} className="border-t border-line">
                      <td className="px-3 py-2 font-display text-lg">{s.hang}</td>
                      <td className="px-3 py-2 font-semibold">
                        {s.ten}
                        <span className="ml-2 text-xs font-normal text-muted">{s.tenNgan}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{s.tran}</td>
                      <td className="px-3 py-2 tabular-nums">{s.thang}</td>
                      <td className="px-3 py-2 tabular-nums">{s.hoa}</td>
                      <td className="px-3 py-2 tabular-nums">{s.thua}</td>
                      <td className="px-3 py-2 tabular-nums">{s.banThang}</td>
                      <td className="px-3 py-2 tabular-nums">{s.banThua}</td>
                      <td className="px-3 py-2 tabular-nums">{s.hieuSo}</td>
                      <td className="px-3 py-2 tabular-nums">{s.banSanKhach}</td>
                      <td className="px-3 py-2 font-display text-lg tabular-nums">{s.diem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ScorerCard scorers={board.scorers} />
        </section>
      )}

      <section className="rounded-lg border border-line bg-sheet">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-2xl">Lịch thi đấu</h2>
          <div className="no-print flex gap-2">
            {[1, 2].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVong(v as 1 | 2)}
                className={`min-h-11 rounded-md px-4 text-sm font-semibold ${vong === v ? "bg-pitch text-ivory" : "bg-paper text-ink"}`}
              >
                {v === 1 ? "Lượt đi" : "Lượt về"}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-line">
          {matches.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted">Chưa có trận công bố ở vòng này.</li>
          ) : (
            matches.map((m) => (
              <li key={m.maTran}>
                <button
                  type="button"
                  onClick={() => setOpen(open === m.maTran ? null : m.maTran)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="w-28 text-xs text-muted">{when(m.kickoff)}</span>
                  <span className="min-w-0 flex-1 font-semibold">
                    {m.ten1}
                    <span className="mx-2 text-muted">–</span>
                    {m.ten2}
                  </span>
                  <span className="font-display text-2xl tabular-nums">
                    {m.ban1 == null ? "–" : `${m.ban1}–${m.ban2}`}
                  </span>
                </button>
                {open === m.maTran ? (
                  <GoalList goals={board.goals[m.maTran] ?? []} san={m.san} />
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-sheet p-4">
        <h2 className="text-2xl">Hồ sơ đội đã duyệt</h2>
        <p className="mt-1 text-sm text-muted">BM1 công khai: sân nhà, sĩ số, ngoại binh. Đội chưa duyệt không hiện.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {board.clubs.map((c) => (
            <li key={c.maDoi}>
              <button
                type="button"
                onClick={() => setClub(club === c.ten ? null : c.ten)}
                className={`min-h-11 w-full rounded-md border px-3 py-3 text-left ${club === c.ten ? "border-pitch bg-pitch-soft" : "border-line bg-paper"}`}
              >
                <span className="block font-semibold">{c.ten}</span>
                <span className="mt-1 block text-xs text-muted">
                  {c.san} · {c.thanhPho} · {c.siSo} cầu thủ · {c.ngoai} ngoại binh
                </span>
              </button>
            </li>
          ))}
        </ul>
        {club ? (
          <ul className="mt-4 divide-y divide-line">
            {squad.map((p) => (
              <li key={p.maCt} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-semibold">{p.hoTen}</span>
                  <span className="ml-2 text-muted">
                    áo {p.soAo} · {p.viTri} · {p.loai === "NGOAI" ? "Ngoài nước" : "Trong nước"}
                  </span>
                </span>
                <span className="tabular-nums">{p.ban} bàn</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-sheet p-4">
        <h2 className="text-2xl">Tra cứu cầu thủ</h2>
        <p className="mt-1 text-sm text-muted">BM4. Lọc theo đội, loại trong nước hoặc ngoài nước, và cầu thủ đã ghi bàn.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tên, đội hoặc số áo"
            className="min-h-11 w-full max-w-xs rounded-md border border-line bg-paper px-3"
          />
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="min-h-11 rounded-md border border-line bg-paper px-3 text-sm"
          >
            <option value="">Mọi đội</option>
            {board.clubs.map((c) => (
              <option key={c.maDoi} value={c.ten}>{c.ten}</option>
            ))}
          </select>
          <select
            value={loai}
            onChange={(e) => setLoai(e.target.value)}
            className="min-h-11 rounded-md border border-line bg-paper px-3 text-sm"
          >
            <option value="">Mọi loại</option>
            <option value="TRONG">Trong nước</option>
            <option value="NGOAI">Ngoài nước</option>
          </select>
          <button
            type="button"
            onClick={() => setOnlyGoals((v) => !v)}
            className={`min-h-11 rounded-md px-3 text-sm font-semibold ${onlyGoals ? "bg-pitch text-ivory" : "bg-paper text-ink"}`}
          >
            Chỉ người có bàn
          </button>
        </div>
        <ul className="mt-4 divide-y divide-line">
          {players.map((p) => (
            <li key={p.maCt} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-semibold">{p.hoTen}</span>
                <span className="ml-2 text-muted">
                  {p.tenNgan} · áo {p.soAo} · {p.viTri} · {p.loai === "NGOAI" ? "Ngoại binh" : "Trong nước"}
                </span>
              </span>
              <span className="tabular-nums">{p.ban} bàn</span>
            </li>
          ))}
          {players.length === 0 ? <li className="py-3 text-sm text-muted">Không thấy cầu thủ khớp.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function ScorerCard({ scorers }: { scorers: Board["scorers"] }) {
  return (
    <div className="rounded-lg border border-line bg-sheet">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-2xl">Vua phá lưới</h2>
        <p className="text-xs text-muted">Tách loại A / B / C. Tất cả đều được tính khi đã công bố.</p>
      </div>
      <ol className="divide-y divide-line">
        {scorers.slice(0, 8).map((s, i) => (
          <li key={`${s.hoTen}-${s.tenNgan}`} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="font-display text-lg text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{s.hoTen}</span>
              <span className="text-xs text-muted">
                {s.tenNgan} · áo {s.soAo} · A{s.a} B{s.b} C{s.c}
              </span>
            </span>
            <span className="font-display text-2xl tabular-nums">{s.tong}</span>
          </li>
        ))}
        {scorers.length === 0 ? <li className="px-4 py-4 text-sm text-muted">Chưa có bàn được công bố.</li> : null}
      </ol>
    </div>
  );
}

function GoalList({ goals, san }: { goals: GoalView[]; san: string }) {
  return (
    <div className="bg-paper px-4 py-3 text-sm">
      <p className="text-muted">{san}</p>
      {goals.length === 0 ? (
        <p className="mt-1">Chưa có bàn trong bản công bố.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {goals.map((g) => (
            <li key={g.maBan}>
              {g.phut}' {g.hoTen}{" "}
              <Badge tone="muted">loại {g.loai}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

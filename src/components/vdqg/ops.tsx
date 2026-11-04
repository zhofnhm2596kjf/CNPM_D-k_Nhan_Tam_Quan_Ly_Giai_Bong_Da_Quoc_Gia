import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  confirmRegulation,
  confirmResult,
  createMatch,
  createRegulation,
  createUser,
  logout,
  markNotesRead,
  publishBoard,
  publishSchedule,
  rejectResult,
  reviewDossier,
  saveDossier,
  saveResult,
  setLock,
  shiftKickoff,
  submitDossier,
  unlockResult,
} from "@/lib/league/api";
import { validateResult, validateSquad, type GoalIn } from "@/lib/league/rules";
import type { ApiFail, ApiOk, DossierView, OpsData, PlayerInput, Role } from "@/lib/league/types";
import { Badge, Btn, Field, Notice, inputClass, roleName, statusLabel, statusTone, when } from "@/components/vdqg/ui";

const TABS: { id: string; label: string; roles: Role[] }[] = [
  { id: "tong", label: "Tổng quan", roles: ["A01", "A02", "A03", "A04"] },
  { id: "hoso", label: "Hồ sơ", roles: ["A01", "A02", "A03"] },
  { id: "lich", label: "Lịch", roles: ["A01", "A02"] },
  { id: "kq", label: "Kết quả", roles: ["A01", "A02"] },
  { id: "bm5", label: "BM5", roles: ["A01", "A02"] },
  { id: "qd6", label: "QĐ6", roles: ["A01", "A04"] },
  { id: "user", label: "Tài khoản", roles: ["A04"] },
  { id: "log", label: "Nhật ký", roles: ["A01", "A04"] },
];

function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(task: Promise<ApiOk | ApiFail>) {
    setPending(true);
    try {
      const res = await task;
      setMsg({ ok: res.ok, text: res.message });
      await router.invalidate();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Không lưu được." });
    } finally {
      setPending(false);
    }
  }
  return { pending, msg, run };
}

export function OpsApp({ data }: { data: OpsData }) {
  const router = useRouter();
  const user = data.user;
  const [tab, setTab] = useState("tong");
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-3xl">Cổng nghiệp vụ</h1>
        <p className="mt-2 text-sm text-muted">A01 đến A04 đăng nhập. Khách xem bảng tin, không vào đây.</p>
        <a href="/dang-nhap" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-pitch px-4 font-semibold text-ivory">
          Đến trang đăng nhập
        </a>
      </div>
    );
  }
  const tabs = TABS.filter((t) => t.roles.includes(user.vaiTro));
  const current = tabs.some((t) => t.id === tab) ? tab : "tong";
  const unread = data.notes.filter((n) => !n.daDoc).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{roleName(user.vaiTro)}</p>
          <h1 className="text-3xl">{user.hoTen}</h1>
          {user.tenDoi ? <p className="text-sm text-muted">Gắn đội {user.tenDoi}</p> : null}
        </div>
        <Btn
          kind="line"
          onClick={async () => {
            await logout();
            await router.invalidate();
            window.location.href = "/";
          }}
        >
          Đăng xuất
        </Btn>
      </div>
      {unread > 0 ? <Notes notes={data.notes} /> : null}
      <div className="no-print flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-11 shrink-0 rounded-md px-3 text-sm font-semibold ${current === t.id ? "bg-ink text-ivory" : "bg-sheet text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current === "tong" ? <Overview data={data} /> : null}
      {current === "hoso" ? <DossierPanel data={data} /> : null}
      {current === "lich" ? <SchedulePanel data={data} /> : null}
      {current === "kq" ? <ResultPanel data={data} /> : null}
      {current === "bm5" ? <Report data={data} /> : null}
      {current === "qd6" ? <RegPanel data={data} /> : null}
      {current === "user" ? <UserPanel data={data} /> : null}
      {current === "log" ? <LogPanel data={data} /> : null}
    </div>
  );
}

function Notes({ notes }: { notes: OpsData["notes"] }) {
  const { pending, run } = useAction();
  return (
    <div className="no-print rounded-md border border-line bg-sheet px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Thông báo trong ứng dụng</p>
        <Btn kind="ghost" disabled={pending} onClick={() => run(markNotesRead())}>
          Đánh dấu đã đọc
        </Btn>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-muted">
        {notes.slice(0, 3).map((n) => (
          <li key={n.maTb}>{n.noiDung}</li>
        ))}
      </ul>
    </div>
  );
}

function Overview({ data }: { data: OpsData }) {
  const choKq = data.matches.filter((m) => m.trangThaiKq === "ChoXacNhan").length;
  const choHs = data.dossiers.filter((d) => d.trangThai === "ChoDuyet").length;
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <article className="rounded-lg border border-line bg-sheet p-4">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Chờ duyệt hồ sơ</p>
        <p className="font-display text-4xl">{choHs}</p>
      </article>
      <article className="rounded-lg border border-line bg-sheet p-4">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Chờ xác nhận tỷ số</p>
        <p className="font-display text-4xl">{choKq}</p>
        <p className="text-sm text-muted">Những trận này chưa vào bảng xếp hạng.</p>
      </article>
      <article className="rounded-lg border border-line bg-pitch p-4 text-ivory">
        <p className="text-xs font-semibold tracking-wide uppercase opacity-80">Mùa</p>
        <p className="font-display text-2xl">{data.season?.ten}</p>
        <p className="mt-2 text-sm opacity-80">
          Lịch {data.season?.lichCongBo ? "đã công bố" : "chưa công bố"} · BXH{" "}
          {data.season?.bxhCongBo ? "đã công bố" : "nội bộ"}
        </p>
      </article>
    </section>
  );
}

function DossierPanel({ data }: { data: OpsData }) {
  const list = data.dossiers;
  const [ma, setMa] = useState(list[0]?.maDoi ?? "");
  const dossier = list.find((d) => d.maDoi === ma) ?? list[0];
  if (!dossier) return <p className="text-sm text-muted">Chưa có đội.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="no-print flex flex-col gap-1">
        {list.map((d) => (
          <button
            key={d.maDoi}
            type="button"
            onClick={() => setMa(d.maDoi)}
            className={`min-h-11 rounded-md px-3 text-left text-sm ${d.maDoi === dossier.maDoi ? "bg-ink text-ivory" : "bg-sheet"}`}
          >
            <span className="block font-semibold">{d.ten}</span>
            <span className="text-xs opacity-80">{statusLabel(d.trangThai)}</span>
          </button>
        ))}
      </div>
      <DossierEditor key={`${dossier.maDoi}-${dossier.trangThai}-${dossier.players.map((p) => p.maCt).join()}`} data={data} dossier={dossier} />
    </div>
  );
}

function DossierEditor({ data, dossier }: { data: OpsData; dossier: DossierView }) {
  const user = data.user!;
  const canEdit =
    (user.vaiTro === "A02" || (user.vaiTro === "A03" && user.maDoi === dossier.maDoi)) &&
    dossier.trangThai !== "DaDuyet" &&
    dossier.trangThai !== "ChoDuyet";
  const [rows, setRows] = useState<PlayerInput[]>(
    dossier.players.map((p) => ({
      hoTen: p.hoTen,
      ngaySinh: p.ngaySinh,
      loai: p.loai,
      soAo: p.soAo,
      viTri: p.viTri,
    })),
  );
  const [lyDo, setLyDo] = useState("");
  const act = useAction();
  const reg = data.activeReg;
  const issues = useMemo(() => {
    if (!reg || !data.season) return [];
    const taken = data.dossiers
      .filter((d) => d.trangThai === "DaDuyet" && d.maDoi !== dossier.maDoi)
      .flatMap((d) => d.players.map((p) => ({ hoTen: p.hoTen, ngaySinh: p.ngaySinh, tenDoi: d.ten })));
    return validateSquad({
      players: rows,
      reg,
      chot: data.season.ngayChot,
      taken,
      mode: "submit",
    });
  }, [rows, reg, data.season, data.dossiers, dossier.maDoi]);

  return (
    <section className="rounded-lg border border-line bg-sheet p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl">{dossier.ten}</h2>
        <Badge tone={statusTone(dossier.trangThai)}>{statusLabel(dossier.trangThai)}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        Sân nhà {dossier.san}. Ngày chốt hồ sơ {data.season?.ngayChot}. Quy định{" "}
        {reg ? `${reg.maPhienBan}: sĩ số ${reg.siSoMin}–${reg.siSoMax}, tuổi ${reg.tuoiMin}–${reg.tuoiMax}, ngoại binh ≤ ${reg.ngoaiBinhMax}` : "chưa có"}.
      </p>
      {dossier.lyDo ? <p className="mt-2 text-sm text-seal">Lý do: {dossier.lyDo}</p> : null}
      {act.msg ? <div className="mt-3"><Notice ok={act.msg.ok} text={act.msg.text} /></div> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-2">Họ tên</th>
              <th className="py-2 pr-2">Ngày sinh</th>
              <th className="py-2 pr-2">Loại</th>
              <th className="py-2 pr-2">Số áo</th>
              <th className="py-2 pr-2">Vị trí</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1 pr-2">
                  <input className={inputClass} disabled={!canEdit} value={p.hoTen} onChange={(e) => setRows(editRow(rows, i, { hoTen: e.target.value }))} />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" className={inputClass} disabled={!canEdit} value={p.ngaySinh} onChange={(e) => setRows(editRow(rows, i, { ngaySinh: e.target.value }))} />
                </td>
                <td className="py-1 pr-2">
                  <select className={inputClass} disabled={!canEdit} value={p.loai} onChange={(e) => setRows(editRow(rows, i, { loai: e.target.value }))}>
                    <option value="TRONG">Trong nước</option>
                    <option value="NGOAI">Ngoài nước</option>
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input type="number" className={inputClass} disabled={!canEdit} value={p.soAo} onChange={(e) => setRows(editRow(rows, i, { soAo: Number(e.target.value) }))} />
                </td>
                <td className="py-1 pr-2">
                  <input className={inputClass} disabled={!canEdit} value={p.viTri} onChange={(e) => setRows(editRow(rows, i, { viTri: e.target.value }))} />
                </td>
                <td className="py-1">
                  {canEdit ? (
                    <button type="button" className="min-h-11 px-2 text-sm text-seal" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      Xóa
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="no-print mt-3 flex flex-wrap gap-2">
          <Btn
            kind="line"
            onClick={() =>
              setRows([...rows, { hoTen: "", ngaySinh: "2000-01-15", loai: "TRONG", soAo: rows.length + 1, viTri: "TV" }])
            }
          >
            Thêm cầu thủ
          </Btn>
          <Btn kind="line" disabled={act.pending} onClick={() => act.run(saveDossier({ data: { maDoi: dossier.maDoi, players: rows } }))}>
            Lưu nháp
          </Btn>
          <Btn disabled={act.pending} onClick={() => act.run(submitDossier({ data: { maDoi: dossier.maDoi, players: rows } }))}>
            Nộp chờ duyệt
          </Btn>
        </div>
      ) : null}
      {canEdit && issues.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-sm text-seal">
          {issues.map((i, n) => (
            <li key={n}>
              {i.code}: {i.message}
            </li>
          ))}
        </ul>
      ) : canEdit ? (
        <p className="mt-3 text-sm text-pitch">Đủ điều kiện BR01–BR05 để nộp.</p>
      ) : null}
      {user.vaiTro === "A01" && dossier.trangThai === "ChoDuyet" ? (
        <div className="no-print mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <Field label="Lý do nếu từ chối">
            <input className={inputClass} value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Btn disabled={act.pending} onClick={() => act.run(reviewDossier({ data: { maDoi: dossier.maDoi, duyet: true, lyDo } }))}>
              Duyệt
            </Btn>
            <Btn kind="seal" disabled={act.pending} onClick={() => act.run(reviewDossier({ data: { maDoi: dossier.maDoi, duyet: false, lyDo } }))}>
              Từ chối
            </Btn>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function editRow(rows: PlayerInput[], index: number, patch: Partial<PlayerInput>): PlayerInput[] {
  return rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
}

function SchedulePanel({ data }: { data: OpsData }) {
  const act = useAction();
  const [vong, setVong] = useState(1);
  const [home, setHome] = useState(data.teams[0]?.maDoi ?? "");
  const [away, setAway] = useState(data.teams[1]?.maDoi ?? "");
  const [kick, setKick] = useState("2026-05-02T17:00");
  const published = data.matches.filter((m) => m.trangThaiLich === "CongBo" && m.trangThaiKq !== "DaXacNhan");
  const [moveId, setMoveId] = useState(published[0]?.maTran ?? "");
  const [moveAt, setMoveAt] = useState("2026-05-16T19:00");
  const [lyDo, setLyDo] = useState("");
  const approved = data.dossiers.filter((d) => d.trangThai === "DaDuyet");
  return (
    <section className="flex flex-col gap-4">
      {act.msg ? <Notice ok={act.msg.ok} text={act.msg.text} /> : null}
      {data.user?.vaiTro === "A02" ? (
        <form
          className="no-print grid gap-3 rounded-lg border border-line bg-sheet p-4 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const iso = new Date(`${kick}:00+07:00`).toISOString();
            void act.run(createMatch({ data: { vong, maDoi1: home, maDoi2: away, kickoff: iso } }));
          }}
        >
          <Field label="Vòng">
            <select className={inputClass} value={vong} onChange={(e) => setVong(Number(e.target.value))}>
              <option value={1}>Lượt đi</option>
              <option value={2}>Lượt về</option>
            </select>
          </Field>
          <Field label="Đội 1 — chủ nhà">
            <select className={inputClass} value={home} onChange={(e) => setHome(e.target.value)}>
              {approved.map((t) => (
                <option key={t.maDoi} value={t.maDoi}>{t.ten}</option>
              ))}
            </select>
          </Field>
          <Field label="Đội 2">
            <select className={inputClass} value={away} onChange={(e) => setAway(e.target.value)}>
              {approved.map((t) => (
                <option key={t.maDoi} value={t.maDoi}>{t.ten}</option>
              ))}
            </select>
          </Field>
          <Field label="Giờ (ICT)">
            <input type="datetime-local" className={inputClass} value={kick} onChange={(e) => setKick(e.target.value)} />
          </Field>
          <div className="md:col-span-4">
            <Btn type="submit" disabled={act.pending}>Thêm trận nháp</Btn>
            <p className="mt-2 text-xs text-muted">Sân lấy đúng sân nhà của đội 1. Lượt về phải đổi chủ nhà. Không trùng đội hoặc sân trong 2 giờ. Khách chưa thấy trận nháp.</p>
          </div>
        </form>
      ) : null}
      {data.user?.vaiTro === "A01" ? (
        <div className="no-print flex flex-col gap-3">
          <div>
            <Btn kind="line" disabled={act.pending} onClick={() => act.run(publishSchedule())}>
              Công bố các trận nháp
            </Btn>
          </div>
          <form
            className="grid gap-3 rounded-lg border border-line bg-sheet p-4 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              const iso = new Date(`${moveAt}:00+07:00`).toISOString();
              void act.run(shiftKickoff({ data: { maTran: moveId, kickoff: iso, lyDo } }));
            }}
          >
            <Field label="Trận đã công bố">
              <select className={inputClass} value={moveId} onChange={(e) => setMoveId(e.target.value)}>
                {published.map((m) => (
                  <option key={m.maTran} value={m.maTran}>{m.ngan1} – {m.ngan2}</option>
                ))}
              </select>
            </Field>
            <Field label="Giờ mới (ICT)">
              <input type="datetime-local" className={inputClass} value={moveAt} onChange={(e) => setMoveAt(e.target.value)} />
            </Field>
            <Field label="Lý do">
              <input className={inputClass} value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
            </Field>
            <div className="md:col-span-3">
              <Btn type="submit" kind="line" disabled={act.pending || !moveId}>Đổi giờ và báo đội</Btn>
              <p className="mt-2 text-xs text-muted">Chỉ ban tổ chức đổi trận đã công bố. Phụ trách hai đội nhận thông báo. Trận đã khóa tỷ số không đổi giờ.</p>
            </div>
          </form>
        </div>
      ) : null}
      <MatchTable matches={data.matches} />
    </section>
  );
}

function MatchTable({ matches }: { matches: OpsData["matches"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-sheet">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-paper text-left">
          <tr>
            {["Giờ", "Vòng", "Trận", "Sân", "Tỷ số", "Lịch", "Kết quả"].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.maTran} className="border-t border-line">
              <td className="px-3 py-2 whitespace-nowrap">{when(m.kickoff)}</td>
              <td className="px-3 py-2">{m.vong === 1 ? "Đi" : "Về"}</td>
              <td className="px-3 py-2">{m.ngan1} – {m.ngan2}</td>
              <td className="px-3 py-2">{m.san}</td>
              <td className="px-3 py-2 tabular-nums">{m.ban1 == null ? "—" : `${m.ban1}–${m.ban2}`}</td>
              <td className="px-3 py-2"><Badge tone={statusTone(m.trangThaiLich)}>{statusLabel(m.trangThaiLich)}</Badge></td>
              <td className="px-3 py-2"><Badge tone={statusTone(m.trangThaiKq)}>{statusLabel(m.trangThaiKq)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultPanel({ data }: { data: OpsData }) {
  const playable = data.matches.filter((m) => m.trangThaiLich !== "Huy");
  const [ma, setMa] = useState(playable.find((m) => m.trangThaiKq === "ChoXacNhan")?.maTran ?? playable[0]?.maTran ?? "");
  const match = playable.find((m) => m.maTran === ma) ?? playable[0];
  if (!match) return <p>Chưa có trận.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="no-print flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
        {playable.map((m) => (
          <button
            key={m.maTran}
            type="button"
            onClick={() => setMa(m.maTran)}
            className={`min-h-11 rounded-md px-3 py-2 text-left text-sm ${m.maTran === match.maTran ? "bg-ink text-ivory" : "bg-sheet"}`}
          >
            <span className="block font-semibold">{m.ngan1} – {m.ngan2}</span>
            <span className="text-xs opacity-80">{statusLabel(m.trangThaiKq)} · vòng {m.vong}</span>
          </button>
        ))}
      </div>
      <ResultForm key={`${match.maTran}-${match.version}`} data={data} maTran={match.maTran} />
    </div>
  );
}

function ResultForm({ data, maTran }: { data: OpsData; maTran: string }) {
  const match = data.matches.find((m) => m.maTran === maTran)!;
  const act = useAction();
  const d1 = data.dossiers.find((d) => d.maDoi === match.maDoi1);
  const d2 = data.dossiers.find((d) => d.maDoi === match.maDoi2);
  const p1 = d1?.trangThai === "DaDuyet" ? d1.players : [];
  const p2 = d2?.trangThai === "DaDuyet" ? d2.players : [];
  const existing = data.goals[maTran] ?? [];
  const [ban1, setBan1] = useState(match.ban1 ?? 0);
  const [ban2, setBan2] = useState(match.ban2 ?? 0);
  const [lyDo, setLyDo] = useState("");
  const [goals, setGoals] = useState<GoalIn[]>(
    existing.map((g) => ({ maCt: g.maCt, loai: g.loai, phut: g.phut, doi: g.doi })),
  );
  const tmax = data.activeReg?.tMax ?? 90;
  const issues = validateResult({
    ban1,
    ban2,
    tmax,
    goals,
    side1: new Set(p1.map((p) => p.maCt)),
    side2: new Set(p2.map((p) => p.maCt)),
  });
  const locked = match.trangThaiKq === "DaXacNhan";
  const isA02 = data.user?.vaiTro === "A02";
  const isA01 = data.user?.vaiTro === "A01";

  return (
    <section className="rounded-lg border border-line bg-sheet p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">UC09 · hai bước</p>
      <h2 className="text-2xl">{match.ten1} — {match.ten2}</h2>
      <p className="text-sm text-muted">{when(match.kickoff)} · {match.san} · vòng {match.vong}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone={statusTone(match.trangThaiKq)}>{statusLabel(match.trangThaiKq)}</Badge>
        {match.trangThaiKq === "ChoXacNhan" ? <Badge tone="seal">BXH chưa tính trận này</Badge> : null}
        {match.trangThaiKq === "DaXacNhan" ? <Badge tone="pitch">Đã vào bảng xếp hạng</Badge> : null}
      </div>
      {match.ghiChu ? <p className="mt-2 text-sm text-seal">Ghi chú: {match.ghiChu}</p> : null}
      {act.msg ? <div className="mt-3"><Notice ok={act.msg.ok} text={act.msg.text} /></div> : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label={`Bàn ${match.ngan1}`}>
          <input type="number" min={0} className={inputClass} disabled={!isA02 || locked} value={ban1} onChange={(e) => setBan1(Number(e.target.value))} />
        </Field>
        <Field label={`Bàn ${match.ngan2}`}>
          <input type="number" min={0} className={inputClass} disabled={!isA02 || locked} value={ban2} onChange={(e) => setBan2(Number(e.target.value))} />
        </Field>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">Đội</th>
              <th>Cầu thủ</th>
              <th>Phút</th>
              <th>Loại</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {goals.map((g, i) => {
              const pool = g.doi === "2" ? p2 : p1;
              return (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-2">
                    <select className={inputClass} disabled={!isA02 || locked} value={g.doi} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, doi: e.target.value, maCt: "" } : x)))}>
                      <option value="1">{match.ngan1}</option>
                      <option value="2">{match.ngan2}</option>
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <select className={inputClass} disabled={!isA02 || locked} value={g.maCt} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, maCt: e.target.value } : x)))}>
                      <option value="">Chọn</option>
                      {pool.map((p) => (
                        <option key={p.maCt} value={p.maCt}>{p.soAo} · {p.hoTen}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" className={inputClass} disabled={!isA02 || locked} value={g.phut} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, phut: Number(e.target.value) } : x)))} />
                  </td>
                  <td className="py-1 pr-2">
                    <select className={inputClass} disabled={!isA02 || locked} value={g.loai} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, loai: e.target.value } : x)))}>
                      {["A", "B", "C"].map((loai) => (
                        <option key={loai} value={loai}>{loai}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {isA02 && !locked ? (
                      <button type="button" className="min-h-11 text-seal" onClick={() => setGoals(goals.filter((_, j) => j !== i))}>Xóa</button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Loại A, B, C giữ đúng một mã. Nghĩa từng loại chưa chốt (RQ07). Phút từ 0 đến {tmax}, chưa có bù giờ.</p>
      {isA02 && !locked && issues.length > 0 ? (
        <ul className="mt-2 text-sm text-seal">
          {issues.map((i, n) => (
            <li key={n}>{i.code}: {i.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="no-print mt-4 flex flex-wrap gap-2">
        {isA02 && !locked ? (
          <>
            <Btn kind="line" onClick={() => setGoals([...goals, { maCt: "", loai: "A", phut: 1, doi: "1" }])}>Thêm bàn</Btn>
            <Btn
              disabled={act.pending}
              onClick={() =>
                act.run(saveResult({ data: { maTran, ban1, ban2, version: match.version, goals, ghiChu: "" } }))
              }
            >
              Ghi nhận — chờ xác nhận
            </Btn>
          </>
        ) : null}
        {isA01 && match.trangThaiKq === "ChoXacNhan" ? (
          <>
            <Btn disabled={act.pending} onClick={() => act.run(confirmResult({ data: { maTran, version: match.version ?? 0 } }))}>
              Xác nhận và cập nhật BXH
            </Btn>
            <input className={`${inputClass} max-w-xs`} placeholder="Lý do từ chối" value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
            <Btn kind="seal" disabled={act.pending} onClick={() => act.run(rejectResult({ data: { maTran, version: match.version ?? 0, lyDo } }))}>
              Từ chối
            </Btn>
          </>
        ) : null}
        {isA01 && locked ? (
          <Btn kind="line" disabled={act.pending} onClick={() => act.run(unlockResult({ data: { maTran, version: match.version ?? 0 } }))}>
            Mở khóa, hoàn nguyên BXH
          </Btn>
        ) : null}
      </div>
    </section>
  );
}

function Report({ data }: { data: OpsData }) {
  const act = useAction();
  return (
    <section className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap gap-2">
        <Btn kind="line" onClick={() => window.print()}>In BM5</Btn>
        {data.user?.vaiTro === "A01" ? (
          <Btn disabled={act.pending} onClick={() => act.run(publishBoard())}>Công bố BXH và tỷ số đã khóa</Btn>
        ) : null}
      </div>
      {act.msg ? <Notice ok={act.msg.ok} text={act.msg.text} /> : null}
      <div className="rounded-lg border border-line bg-sheet p-4">
        <p className="text-xs tracking-wide text-muted uppercase">BM5.1</p>
        <h2 className="text-3xl">Bảng xếp hạng</h2>
        <p className="text-sm text-muted">Nguồn là kết quả đã xác nhận. Ô điểm không sửa tay.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink text-left">
                {["Hạng", "Đội", "Trận", "Thắng", "Hòa", "Thua", "Hiệu số", "Sân khách", "Điểm"].map((h) => (
                  <th key={h} className="py-2 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.standings.map((s) => (
                <tr key={s.maDoi} className="border-b border-line">
                  <td className="py-2 pr-3">{s.hang}</td>
                  <td className="py-2 pr-3 font-semibold">{s.ten}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.tran}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.thang}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.hoa}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.thua}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.hieuSo}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.banSanKhach}</td>
                  <td className="py-2 pr-3 font-semibold tabular-nums">{s.diem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-lg border border-line bg-sheet p-4">
        <p className="text-xs tracking-wide text-muted uppercase">BM5.2</p>
        <h2 className="text-3xl">Danh sách ghi bàn</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-ink text-left">
                {["Cầu thủ", "Đội", "Áo", "A", "B", "C", "Tổng"].map((h) => (
                  <th key={h} className="py-2 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.scorers.map((s) => (
                <tr key={`${s.hoTen}${s.tenNgan}`} className="border-b border-line">
                  <td className="py-2 pr-3">{s.hoTen}</td>
                  <td className="py-2 pr-3">{s.tenDoi}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.soAo}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.a}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.b}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.c}</td>
                  <td className="py-2 pr-3 font-semibold tabular-nums">{s.tong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RegPanel({ data }: { data: OpsData }) {
  const act = useAction();
  const base = data.activeReg;
  const [form, setForm] = useState({
    tuoiMin: base?.tuoiMin ?? 16,
    tuoiMax: base?.tuoiMax ?? 40,
    siSoMin: base?.siSoMin ?? 15,
    siSoMax: base?.siSoMax ?? 22,
    ngoaiBinhMax: base?.ngoaiBinhMax ?? 3,
    diemThang: base?.diemThang ?? 3,
    diemHoa: base?.diemHoa ?? 1,
    diemThua: base?.diemThua ?? 0,
    tMax: base?.tMax ?? 90,
    ngayHieuLuc: "2026-06-01",
    ghiChu: "",
  });
  const set = (k: string, v: string) => setForm({ ...form, [k]: k === "ngayHieuLuc" || k === "ghiChu" ? v : Number(v) });
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <form
        className="flex flex-col gap-3 rounded-lg border border-line bg-sheet p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(createRegulation({ data: form }));
        }}
      >
        <h2 className="text-2xl">Thêm phiên bản</h2>
        <p className="text-sm text-muted">
          Không sửa đè bản cũ. Quản trị gửi chờ xác nhận. Ban tổ chức ban hành thì luật mới có hiệu lực từ ngày đã chọn, và không tính lại điểm các trận đã khóa.
        </p>
        {act.msg ? <Notice ok={act.msg.ok} text={act.msg.text} /> : null}
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["tuoiMin", "Tuổi min"],
              ["tuoiMax", "Tuổi max"],
              ["siSoMin", "Sĩ số min"],
              ["siSoMax", "Sĩ số max"],
              ["ngoaiBinhMax", "Ngoại binh"],
              ["diemThang", "Điểm thắng"],
              ["diemHoa", "Điểm hòa"],
              ["diemThua", "Điểm thua"],
              ["tMax", "Tmax"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input type="number" className={inputClass} value={form[key]} onChange={(e) => set(key, e.target.value)} />
            </Field>
          ))}
          <Field label="Ngày hiệu lực">
            <input type="date" className={inputClass} value={form.ngayHieuLuc} onChange={(e) => set("ngayHieuLuc", e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú">
          <input className={inputClass} value={form.ghiChu} onChange={(e) => set("ghiChu", e.target.value)} />
        </Field>
        <Btn type="submit" disabled={act.pending}>
          {data.user?.vaiTro === "A01" ? "Ban hành phiên bản" : "Gửi chờ ban tổ chức"}
        </Btn>
      </form>
      <div className="rounded-lg border border-line bg-sheet p-4">
        <h2 className="text-2xl">Các bản đã lưu</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {data.regs.map((r) => (
            <li key={r.maPhienBan} className="border-b border-line pb-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.maPhienBan}</span>
                {r.active ? <Badge tone="pitch">Đang dùng</Badge> : null}
                <Badge tone={statusTone(r.trangThai)}>{statusLabel(r.trangThai)}</Badge>
              </div>
              <p className="text-muted">
                Từ {r.ngayHieuLuc} · tuổi {r.tuoiMin}–{r.tuoiMax} · sĩ số {r.siSoMin}–{r.siSoMax} · ngoại {r.ngoaiBinhMax} · điểm {r.diemThang}-{r.diemHoa}-{r.diemThua} · Tmax {r.tMax}
              </p>
              {r.ghiChu ? <p>{r.ghiChu}</p> : null}
              {data.user?.vaiTro === "A01" && r.trangThai === "ChoXacNhan" ? (
                <Btn
                  kind="line"
                  disabled={act.pending}
                  onClick={() => act.run(confirmRegulation({ data: { maPhienBan: r.maPhienBan } }))}
                >
                  Xác nhận hiệu lực
                </Btn>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function UserPanel({ data }: { data: OpsData }) {
  const act = useAction();
  const [form, setForm] = useState({
    username: "",
    hoTen: "",
    email: "",
    password: "",
    vaiTro: "A02",
    maDoi: data.teams[0]?.maDoi ?? "",
  });
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-x-auto rounded-lg border border-line bg-sheet">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-paper text-left">
            <tr>
              {["Tài khoản", "Tên", "Vai", "Đội", ""].map((h) => (
                <th key={h} className="px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.userId} className="border-t border-line">
                <td className="px-3 py-2">{u.username}</td>
                <td className="px-3 py-2">{u.hoTen}</td>
                <td className="px-3 py-2">{u.vaiTro}</td>
                <td className="px-3 py-2">{u.tenDoi ?? "—"}</td>
                <td className="px-3 py-2">
                  <Btn
                    kind={u.khoa ? "pitch" : "line"}
                    disabled={act.pending || u.userId === data.user?.userId}
                    onClick={() => act.run(setLock({ data: { userId: u.userId, khoa: !u.khoa } }))}
                  >
                    {u.khoa ? "Mở khóa" : "Khóa"}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="flex flex-col gap-3 rounded-lg border border-line bg-sheet p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(createUser({ data: form }));
        }}
      >
        <h2 className="text-2xl">Tạo tài khoản</h2>
        {act.msg ? <Notice ok={act.msg.ok} text={act.msg.text} /> : null}
        <Field label="Tên đăng nhập">
          <input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="Họ tên">
          <input className={inputClass} value={form.hoTen} onChange={(e) => setForm({ ...form, hoTen: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Mật khẩu">
          <input type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label="Vai trò">
          <select className={inputClass} value={form.vaiTro} onChange={(e) => setForm({ ...form, vaiTro: e.target.value })}>
            <option value="A01">A01 Ban tổ chức</option>
            <option value="A02">A02 Nhân viên</option>
            <option value="A03">A03 Phụ trách đội</option>
            <option value="A04">A04 Quản trị</option>
          </select>
        </Field>
        {form.vaiTro === "A03" ? (
          <Field label="Đội">
            <select className={inputClass} value={form.maDoi} onChange={(e) => setForm({ ...form, maDoi: e.target.value })}>
              {data.teams.map((t) => (
                <option key={t.maDoi} value={t.maDoi}>{t.ten}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Btn type="submit" disabled={act.pending}>Tạo</Btn>
      </form>
    </section>
  );
}

function LogPanel({ data }: { data: OpsData }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-sheet">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-paper text-left">
          <tr>
            {["Thời điểm", "Người", "Việc", "Đối tượng", "Cũ", "Mới"].map((h) => (
              <th key={h} className="px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.audit.map((a) => (
            <tr key={a.maLog} className="border-t border-line align-top">
              <td className="px-3 py-2 whitespace-nowrap">{when(a.createdAt)}</td>
              <td className="px-3 py-2">{a.hoTen ?? "Hệ thống"}</td>
              <td className="px-3 py-2">{a.hanhDong}</td>
              <td className="px-3 py-2">{a.doiTuong}</td>
              <td className="px-3 py-2 text-muted">{a.giaTriCu}</td>
              <td className="px-3 py-2">{a.giaTriMoi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

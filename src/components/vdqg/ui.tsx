import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { SessionUser } from "@/lib/league/types";

export function Crest({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M24 3 42 9.2v14.3c0 11.2-7.4 17.4-18 21.5C13.4 40.9 6 34.7 6 23.5V9.2L24 3Z"
      />
      <circle cx="24" cy="23" r="7.2" className="fill-ivory" />
      <path
        d="M24 17.2 26.6 22.2 24 28.8 21.4 22.2 24 17.2Z"
        className="fill-pitch"
      />
    </svg>
  );
}

export function TopBar({
  user,
  unread = 0,
}: {
  user?: SessionUser | null;
  unread?: number;
}) {
  return (
    <header className="no-print border-b border-line bg-sheet">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-pitch">
          <Crest />
          <span>
            <span className="block font-display text-xl leading-none">VĐQG</span>
            <span className="text-xs text-muted">Giải vô địch quốc gia</span>
          </span>
        </Link>
        <nav className="ml-auto flex flex-wrap items-center gap-1">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-ink"
          >
            Bảng tin
          </Link>
          {user ? (
            <Link
              to="/van-hanh"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-pitch"
            >
              Nghiệp vụ
              {unread > 0 ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-md bg-seal px-1 text-xs text-ivory">
                  {unread}
                </span>
              ) : null}
            </Link>
          ) : (
            <Link
              to="/dang-nhap"
              className="inline-flex min-h-11 items-center rounded-md bg-pitch px-3 text-sm font-semibold text-ivory"
            >
              Đăng nhập
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Btn({
  kind = "pitch",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "pitch" | "line" | "seal" | "ghost";
}) {
  const tone = {
    pitch: "bg-pitch text-ivory hover:opacity-90",
    line: "border border-line bg-sheet text-ink hover:bg-paper",
    seal: "bg-seal text-ivory hover:opacity-90",
    ghost: "bg-transparent text-ink hover:bg-line",
  }[kind];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-opacity duration-200 disabled:opacity-50 ${tone} ${className}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-md border border-line bg-sheet px-3 text-ink";

export function Notice({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p
      role="status"
      className={`rounded-md px-3 py-2 text-sm ${ok ? "bg-pitch-soft text-pitch" : "bg-seal-soft text-seal"}`}
    >
      {text}
    </p>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "pitch" | "seal" | "ink" | "muted";
  children: ReactNode;
}) {
  const cls = {
    pitch: "bg-pitch-soft text-pitch",
    seal: "bg-seal-soft text-seal",
    ink: "bg-ink text-ivory",
    muted: "bg-line text-ink",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function statusLabel(s: string | null | undefined): string {
  switch (s) {
    case "Nhap":
      return "Nháp";
    case "ChoDuyet":
      return "Chờ duyệt";
    case "DaDuyet":
      return "Đã duyệt";
    case "TuChoi":
      return "Từ chối";
    case "ChoXacNhan":
      return "Chờ xác nhận";
    case "DaXacNhan":
      return "Đã xác nhận";
    case "CongBo":
      return "Đã công bố";
    case "HieuLuc":
      return "Hiệu lực";
    case "DangDienRa":
      return "Đang diễn ra";
    default:
      return s ? s : "Chưa lập";
  }
}

export function statusTone(s: string | null | undefined): "pitch" | "seal" | "ink" | "muted" {
  if (s === "DaDuyet" || s === "DaXacNhan" || s === "CongBo" || s === "HieuLuc") return "pitch";
  if (s === "ChoDuyet" || s === "ChoXacNhan" || s === "TuChoi") return "seal";
  if (s === "Nhap") return "ink";
  return "muted";
}

export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function roleName(role: string): string {
  switch (role) {
    case "A01":
      return "Ban tổ chức";
    case "A02":
      return "Nhân viên quản lý";
    case "A03":
      return "Phụ trách đội";
    case "A04":
      return "Quản trị";
    default:
      return role;
  }
}

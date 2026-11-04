import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { login } from "@/lib/league/api";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/league/demo";
import { Btn, Field, Notice, TopBar, inputClass } from "@/components/vdqg/ui";

export const Route = createFileRoute("/dang-nhap")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("bantochuc");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(user = username, pass = password) {
    setPending(true);
    try {
      const res = await login({ data: { username: user, password: pass } });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        await router.invalidate();
        await router.navigate({ to: "/van-hanh" });
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Không đăng nhập được." });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          className="rounded-lg border border-line bg-sheet p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">UC01</p>
          <h1 className="mt-1 text-4xl">Vào bàn điều hành</h1>
          <p className="mt-2 text-sm text-muted">
            Mỗi tài khoản một vai. Sai mật khẩu không nói tài khoản có tồn tại hay không. Khóa sau năm lần sai.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <Field label="Tên đăng nhập">
              <input className={inputClass} value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Mật khẩu">
              <input
                type="password"
                className={inputClass}
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {msg ? <Notice ok={msg.ok} text={msg.text} /> : null}
            <Btn type="submit" disabled={pending}>
              Đăng nhập
            </Btn>
          </div>
        </form>
        <aside className="rounded-lg border border-line bg-paper p-4">
          <h2 className="text-xl">Tài khoản mẫu</h2>
          <p className="mt-1 text-sm text-muted">Mật khẩu chung: {DEMO_PASSWORD}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.username}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setUsername(a.username);
                    setPassword(DEMO_PASSWORD);
                    void submit(a.username, DEMO_PASSWORD);
                  }}
                  className="min-h-11 w-full rounded-md border border-line bg-sheet px-3 py-2 text-left"
                >
                  <span className="block text-sm font-semibold">
                    {a.vai} · {a.username}
                  </span>
                  <span className="block text-xs text-muted">{a.moTa}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </>
  );
}

import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { SignIn, SoccerBall } from "@phosphor-icons/react";

const ARD_LOGO = "https://customer-assets.emergentagent.com/job_inventory-bar-app/artifacts/4pd029nv_image.png";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@ard.pt");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div
      data-testid="login-page"
      className="min-h-screen w-full flex bg-slate-950 text-slate-100 grain-bg"
    >
      {/* Left: image */}
      <div
        className="hidden lg:flex w-1/2 relative bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(2,6,23,0.75), rgba(2,6,23,0.92)), url('" + ARD_LOGO + "')",
        }}
      >
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-green-600/90 border-2 border-amber-400 flex items-center justify-center">
              <SoccerBall size={28} weight="duotone" className="text-amber-400" />
            </div>
            <div>
              <div className="font-outfit text-2xl font-bold tracking-tight leading-tight">
                ARD<span className="text-amber-400">.</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400 -mt-0.5">
                Nespereira · Bar
              </div>
            </div>
          </div>
          <h2 className="font-outfit text-5xl font-bold leading-tight max-w-md">
            <span className="text-amber-400">Associação</span><br />
            Recreativa e Desportiva
          </h2>
          <p className="text-slate-400 mt-4 max-w-md text-base">
            Gestão de stock, vendas, sócios e pontos do bar do clube.
          </p>
          <div className="mt-6 text-[10px] uppercase tracking-[0.3em] text-slate-500">
            Fundado a 1 de Maio de 1982
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm space-y-6 animate-in"
          data-testid="login-form"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-green-600 border-2 border-amber-400 flex items-center justify-center">
              <SoccerBall size={22} weight="duotone" className="text-amber-400" />
            </div>
            <div>
              <div className="font-outfit text-xl font-bold tracking-tight leading-tight">
                ARD<span className="text-amber-400">.</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 -mt-0.5">
                Nespereira
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">
              Bem-vindo de volta
            </div>
            <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight">
              Iniciar sessão
            </h1>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Email
              </label>
              <input
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                placeholder="voce@bar.pt"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Password
              </label>
              <input
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div
              data-testid="login-error"
              className="px-4 py-3 rounded-lg bg-rose-500/10 text-rose-400 text-sm border border-rose-500/20"
            >
              {error}
            </div>
          )}

          <button
            data-testid="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold px-5 py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <SignIn size={20} weight="bold" />
            {loading ? "A entrar..." : "Entrar"}
          </button>

          <p className="text-xs text-slate-500 text-center">
            Demo: admin@ard.pt / admin123 · tesoureiro@ard.pt / tesoureiro123 · func1@ard.pt / func123
          </p>
        </form>
      </div>
    </div>
  );
}

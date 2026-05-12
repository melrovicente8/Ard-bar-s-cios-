import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Wine, SignIn } from "@phosphor-icons/react";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@bar.pt");
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
            "linear-gradient(rgba(2,6,23,0.55), rgba(2,6,23,0.85)), url('https://images.unsplash.com/photo-1776774984185-91c34b326420?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400')",
        }}
      >
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <div className="flex items-center gap-3 mb-6">
            <Wine size={36} weight="duotone" className="text-amber-500" />
            <span className="font-outfit text-2xl font-bold tracking-tight">
              Cellar<span className="text-amber-500">.</span>
            </span>
          </div>
          <h2 className="font-outfit text-5xl font-bold leading-tight max-w-md">
            O teu bar.<br />
            <span className="text-amber-500">Sob controlo.</span>
          </h2>
          <p className="text-slate-400 mt-4 max-w-md text-base">
            Gestão de stock, vendas e contas correntes — feito para quem está
            atrás do balcão.
          </p>
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
            <Wine size={32} weight="duotone" className="text-amber-500" />
            <span className="font-outfit text-xl font-bold tracking-tight">
              Cellar<span className="text-amber-500">.</span>
            </span>
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
            Credenciais de demonstração: admin@bar.pt / admin123
          </p>
        </form>
      </div>
    </div>
  );
}

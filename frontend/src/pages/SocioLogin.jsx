import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSocio } from "../context/SocioContext";
import api from "../lib/api";
import { SoccerBall, IdentificationCard, SignIn, ArrowLeft } from "@phosphor-icons/react";

export default function SocioLogin() {
  const { data, login } = useSocio();
  const navigate = useNavigate();
  const [memberNumber, setMemberNumber] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [club, setClub] = useState({});

  useEffect(() => {
    api.get("/club/info").then((r) => setClub(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (data && data.client) navigate("/socio", { replace: true });
  }, [data, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await login(memberNumber, pin);
    setLoading(false);
    if (!res.ok) setError(res.error);
    else navigate("/socio");
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-950 text-slate-100 grain-bg" data-testid="socio-login-page">
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-900">
        <Link to="/login" className="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-2">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
          Portal de Sócios
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6 animate-in" data-testid="socio-login-form">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-600 to-green-700 border-2 border-amber-400 flex items-center justify-center">
              <SoccerBall size={26} weight="duotone" className="text-amber-400" />
            </div>
            <div>
              <div className="font-outfit text-xl font-bold tracking-tight leading-tight">
                ARD<span className="text-amber-400">.</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 -mt-0.5">
                {club.name || "Nespereira"}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">
              Conta corrente do sócio
            </div>
            <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight">
              Entrar com nº de sócio
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Pede o teu PIN à direção. Consulta a tua conta, atualiza dados e paga por MBWay.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Nº de sócio
              </label>
              <div className="mt-2 flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-lg px-3 focus-within:ring-2 focus-within:ring-amber-500/50 focus-within:border-amber-500">
                <IdentificationCard size={18} className="text-slate-500" />
                <input
                  data-testid="socio-login-number-input"
                  inputMode="numeric"
                  required
                  value={memberNumber}
                  onChange={(e) => setMemberNumber(e.target.value)}
                  className="flex-1 bg-transparent py-3 text-white placeholder-slate-500 focus:outline-none"
                  placeholder="Ex: 1982"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                PIN
              </label>
              <input
                data-testid="socio-login-pin-input"
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="mt-2 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 tracking-widest"
                placeholder="••••"
              />
            </div>
          </div>

          {error && (
            <div data-testid="socio-login-error" className="px-4 py-3 rounded-lg bg-rose-500/10 text-rose-400 text-sm border border-rose-500/20">
              {error}
            </div>
          )}

          <button
            data-testid="socio-login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold px-5 py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <SignIn size={20} weight="bold" /> {loading ? "A entrar..." : "Entrar"}
          </button>

          <p className="text-xs text-slate-500 text-center">
            Não tens PIN? Pede na receção do clube ou ao tesoureiro.
          </p>
        </form>
      </div>
    </div>
  );
}

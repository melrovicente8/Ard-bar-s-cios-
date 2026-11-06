import React, { useState } from "react";
import { ClockCounterClockwise, Trophy, Users, SoccerBall, MapPin, Buildings } from "@phosphor-icons/react";

/**
 * 🏆 Arquivo histórico oficial da ARDN (identidade, cronologia, plantéis,
 * resultados, tradições e fontes). Conteúdo estático vindo de
 * `legacy` (backend/club_archive_history.py) — só de leitura.
 */

const RESULT_STYLE = {
  V: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
  E: "bg-amber-500/15 border-amber-500/40 text-amber-300",
  D: "bg-rose-500/15 border-rose-500/40 text-rose-300",
};
const RESULT_LABEL = { V: "Vitória", E: "Empate", D: "Derrota" };

function SectionTitle({ icon: Icon, children, hint }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} weight="duotone" className="text-amber-300" />
      <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase tracking-[0.12em]">{children}</h3>
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </div>
  );
}

function SeasonPills({ seasons, value, onChange, testid }) {
  return (
    <div className="flex gap-1.5 flex-wrap mb-3">
      {seasons.map((s, i) => (
        <button
          key={s.season}
          type="button"
          data-testid={`${testid}-${i}`}
          onClick={() => onChange(i)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            i === value
              ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
              : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          {s.season}
        </button>
      ))}
    </div>
  );
}

function Identidade({ legacy }) {
  const { identity, institutional = [], heritage = [] } = legacy;
  return (
    <div data-testid="legacy-identidade" className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(identity?.facts || []).map((f) => (
          <div key={f.label} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">{f.label}</div>
            <div className="text-sm text-slate-200">{f.value}</div>
          </div>
        ))}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 flex items-center gap-1">
            <MapPin size={11} weight="fill" /> Sede social / bar
          </div>
          <div className="text-sm text-slate-200">{identity?.address}</div>
        </div>
      </div>

      {identity?.purpose && (
        <p className="text-[13px] text-slate-300 leading-relaxed border-l-2 border-amber-500/40 pl-3">
          {identity.purpose}
        </p>
      )}

      <div>
        <SectionTitle icon={Buildings}>Apoios institucionais · Município de Gouveia</SectionTitle>
        <div className="space-y-2">
          {institutional.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-bold text-amber-200">{item.title}</span>
                <span className="text-[11px] text-slate-500">{item.date}</span>
              </div>
              <p className="text-[12px] text-slate-400 leading-relaxed mt-1">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle icon={MapPin}>Património e infraestruturas</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {heritage.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-sm font-bold text-slate-200">
                <span className="mr-1.5">{item.emoji}</span>
                {item.title}
              </div>
              <p className="text-[12px] text-slate-400 leading-relaxed mt-1">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cronologia({ legacy }) {
  return (
    <div data-testid="legacy-cronologia" className="space-y-0">
      <SectionTitle icon={ClockCounterClockwise} hint="datas oficiais">
        Cronologia histórica
      </SectionTitle>
      <ol className="relative border-l border-slate-800 ml-2 space-y-4 pl-4">
        {(legacy.timeline || []).map((item) => (
          <li key={item.date + item.event} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-4 ring-slate-900" />
            <div className="text-[11px] font-bold text-amber-300 uppercase tracking-[0.1em]">{item.date}</div>
            <div className="text-[13px] text-slate-300 leading-relaxed">{item.event}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Planteis({ legacy }) {
  const seasons = legacy.squads || [];
  const [idx, setIdx] = useState(Math.max(seasons.length - 1, 0));
  if (!seasons.length) return <div className="text-sm text-slate-500">Ainda sem plantéis registados.</div>;
  const season = seasons[idx];
  return (
    <div data-testid="legacy-planteis">
      <SectionTitle icon={Users} hint={`${seasons.length} épocas`}>
        Plantéis por época
      </SectionTitle>
      <SeasonPills seasons={seasons} value={idx} onChange={setIdx} testid="legacy-planteis-season" />

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="font-outfit text-base font-bold text-amber-200">Época {season.season}</div>
          <div className="text-[11px] text-slate-400">
            {season.president && <span>Presidente: <span className="text-slate-300">{season.president}</span></span>}
          </div>
        </div>
        {(season.coach || (season.staff || []).length > 0) && (
          <div className="text-[11px] text-slate-400 mt-0.5">
            {season.coach && <span>Treinador: <span className="text-slate-300">{season.coach}</span></span>}
            {season.coach && (season.staff || []).length > 0 && <span className="mx-1">·</span>}
            {(season.staff || []).join(" · ")}
          </div>
        )}

        <div className="mt-3 space-y-2.5">
          {(season.groups || []).map((g) => (
            <div key={g.role}>
              <div className="text-[10px] uppercase tracking-[0.15em] text-amber-300/80 mb-1">
                {g.role} <span className="text-slate-600">· {g.players.length}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {g.players.map((p) => (
                  <span
                    key={p}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/70 border border-slate-700 text-slate-300"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {(season.groups || []).length === 0 && (
            <div className="text-[12px] text-slate-500">
              Plantel não registado — apenas equipa técnica/direção nesta época.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Resultados({ legacy }) {
  const seasons = legacy.results || [];
  const [idx, setIdx] = useState(Math.max(seasons.length - 1, 0));
  if (!seasons.length) return <div className="text-sm text-slate-500">Ainda sem resultados registados.</div>;
  const season = seasons[idx];
  const matches = season.matches || [];
  const count = (r) => matches.filter((m) => m.result === r).length;

  return (
    <div data-testid="legacy-resultados">
      <SectionTitle icon={SoccerBall} hint="AF Guarda">
        Registo de resultados
      </SectionTitle>
      <SeasonPills seasons={seasons} value={idx} onChange={setIdx} testid="legacy-resultados-season" />

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[12px] text-slate-300">
          {season.season} <span className="text-slate-500">· {season.summary}</span>
        </span>
        <span className="flex items-center gap-1 text-[11px]">
          <span className="px-1.5 py-0.5 rounded border bg-emerald-500/15 border-emerald-500/40 text-emerald-300">
            V {count("V")}
          </span>
          <span className="px-1.5 py-0.5 rounded border bg-amber-500/15 border-amber-500/40 text-amber-300">
            E {count("E")}
          </span>
          <span className="px-1.5 py-0.5 rounded border bg-rose-500/15 border-rose-500/40 text-rose-300">
            D {count("D")}
          </span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-slate-950/70">
            <tr className="text-[10px] uppercase tracking-[0.15em] text-slate-500">
              <th className="py-2 px-2 font-medium">Jornada</th>
              <th className="py-2 px-2 font-medium">Casa/Fora</th>
              <th className="py-2 px-2 font-medium">Adversário</th>
              <th className="py-2 px-2 font-medium">Resultado</th>
              <th className="py-2 px-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {matches.map((m, i) => (
              <tr key={`${m.round}-${m.opponent}-${i}`} className="hover:bg-slate-800/30">
                <td className="py-1.5 px-2 text-slate-400 whitespace-nowrap">{m.round}</td>
                <td className="py-1.5 px-2 text-slate-500">{m.venue === "C" ? "Casa" : "Fora"}</td>
                <td className="py-1.5 px-2 text-slate-200">{m.opponent}</td>
                <td className="py-1.5 px-2 font-bold text-slate-100 whitespace-nowrap">{m.score}</td>
                <td className="py-1.5 px-2">
                  <span
                    title={RESULT_LABEL[m.result]}
                    className={`inline-flex items-center justify-center h-5 w-5 rounded border text-[10px] font-bold ${RESULT_STYLE[m.result]}`}
                  >
                    {m.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tradicoes({ legacy }) {
  return (
    <div data-testid="legacy-tradicoes">
      <SectionTitle icon={Trophy} hint="vida comunitária">
        Tradições, eventos e vida comunitária
      </SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(legacy.traditions || []).map((t) => (
          <div key={t.title} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="text-sm font-bold text-slate-200">
              <span className="mr-1.5">{t.emoji}</span>
              {t.title}
            </div>
            <p className="text-[12px] text-slate-400 leading-relaxed mt-1">{t.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClubArchiveLegacy({ legacy, section }) {
  if (!legacy) {
    return (
      <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
        Arquivo histórico ainda não disponível.
      </div>
    );
  }
  if (section === "identidade") return <Identidade legacy={legacy} />;
  if (section === "cronologia") return <Cronologia legacy={legacy} />;
  if (section === "planteis") return <Planteis legacy={legacy} />;
  if (section === "resultados") return <Resultados legacy={legacy} />;
  if (section === "tradicoes") return <Tradicoes legacy={legacy} />;
  return null;
}

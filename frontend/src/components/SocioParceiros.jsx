import React, { useEffect, useRef, useState } from "react";
import api, { euro, formatApiErrorDetail } from "../lib/api";
import { Storefront, X, Camera, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_STYLE = {
  pending: { label: "Pendente de validação", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  validated: { label: "Validado", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  rejected: { label: "Rejeitado", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  invalidated: { label: "Anulado", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Reduz a fotografia do talão antes de enviar (data URL em base64). */
const readImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Parceiros locais na app do sócio: enviar a fotografia do talão e acompanhar o estado.
 */
export default function SocioParceiros() {
  const [partners, setPartners] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ partner_id: "", amount: "", purchase_date: todayISO(), doc_number: "", note: "" });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef(null);

  const load = () => {
    api.get("/socio/partners").then(({ data }) => setPartners(data || [])).catch(() => setPartners([]));
    api.get("/socio/partner-tickets").then(({ data }) => setTickets(data || [])).catch(() => setTickets([]));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (partners.length && !form.partner_id) {
      setForm((f) => ({ ...f, partner_id: partners[0].id }));
    }
    // eslint-disable-next-line
  }, [partners]);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";  // permite escolher outra vez o mesmo ficheiro
    if (!file) return;
    try {
      setPhoto(await readImage(file));
    } catch {
      toast.error("Não foi possível ler esta fotografia. Tira outra ou escolhe uma imagem JPG/PNG.");
    }
  };

  const clearPhoto = () => {
    setPhoto(null);
    if (photoInput.current) photoInput.current.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.partner_id) return toast.error("Escolhe o parceiro");
    setBusy(true);
    try {
      const { data } = await api.post("/socio/partner-tickets", {
        partner_id: form.partner_id,
        amount: Number(String(form.amount).replace(",", ".")),
        purchase_date: form.purchase_date,
        doc_number: form.doc_number || null,
        note: form.note || null,
        photo_data: photo,
      });
      toast.success("Talão enviado · a direção confirma a validade antes de creditar os pontos");
      setForm({ partner_id: form.partner_id, amount: "", purchase_date: todayISO(), doc_number: "", note: "" });
      setPhoto(null);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const pending = tickets.filter((t) => t.status === "pending").length;

  return (
    <>
      <div
        onClick={() => { setOpen(true); load(); }}
        data-testid="socio-parceiros-card"
        title="Enviar o talão de um parceiro local e consultar o estado"
        className="bg-slate-950/60 border border-sky-500/30 hover:border-sky-500/60 rounded-xl p-5 transition-colors cursor-pointer"
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400/80 flex items-center gap-1.5">
          <Storefront size={11} weight="duotone" /> Parceiros Locais
          <span className="text-sky-300/70 normal-case ml-auto">Enviar talão ›</span>
        </div>
        <div className="mt-2 font-outfit text-2xl font-bold text-sky-200">
          {partners.length} parceiro{partners.length === 1 ? "" : "s"}
        </div>
        <div className="text-[10px] text-slate-500 mt-1">
          {pending > 0 ? `${pending} talão(ões) pendente(s) de validação` : "Cada 5,01 € valem 0,5 pontos (quotas 🟢)"}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
          data-testid="socio-parceiros-modal"
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl p-5 my-6">
            <div className="flex items-center gap-2 mb-3">
              <Storefront size={20} weight="duotone" className="text-sky-400" />
              <h3 className="font-outfit text-xl font-semibold flex-1">Parceiros Locais</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded bg-slate-800"><X size={14} weight="bold" /></button>
            </div>

            {partners.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-xl">
                Ainda não há parcerias ativas.
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-2.5" data-testid="socio-parceiro-form">
                <div className="flex flex-wrap gap-1.5">
                  {partners.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      data-testid={`socio-parceiro-${p.id}`}
                      onClick={() => setForm({ ...form, partner_id: p.id })}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium ${
                        form.partner_id === p.id
                          ? "bg-sky-500 text-slate-950 border-sky-500"
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:border-sky-500/50"
                      }`}
                    >
                      {p.emoji} {p.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                    Valor do talão
                    <input
                      data-testid="socio-parceiro-amount"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                    Data da compra
                    <input
                      data-testid="socio-parceiro-date"
                      type="date"
                      value={form.purchase_date}
                      onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                      className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    />
                  </label>
                </div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Nº do documento / fatura
                  <input
                    data-testid="socio-parceiro-doc"
                    value={form.doc_number}
                    onChange={(e) => setForm({ ...form, doc_number: e.target.value })}
                    placeholder="Ex.: FT 2026/1234"
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                </label>

                <div className="rounded-lg border border-dashed border-slate-700 p-2 text-center">
                  <input
                    ref={photoInput}
                    id="socio-ticket-photo"
                    data-testid="socio-parceiro-photo"
                    type="file"
                    accept="image/*"
                    onChange={pickPhoto}
                    className="hidden"
                  />
                  <label
                    htmlFor="socio-ticket-photo"
                    className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded px-3 py-4 hover:bg-slate-900/60"
                  >
                    {photo ? <UploadSimple size={22} /> : <Camera size={22} />}
                    <span className="text-xs font-bold text-sky-300">
                      {photo ? "Fotografia anexada · trocar" : "Anexar a fotografia do talão"}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {photo ? "Toca para escolher outra imagem" : "Tira uma fotografia ou escolhe da galeria"}
                    </span>
                  </label>
                  {photo && (
                    <div className="relative mt-1 inline-block">
                      <img src={photo} alt="talão" className="max-h-32 rounded" />
                      <button
                        type="button"
                        data-testid="socio-parceiro-photo-clear"
                        onClick={clearPhoto}
                        title="Remover fotografia"
                        className="absolute -right-2 -top-2 rounded-full bg-slate-900 border border-slate-700 p-1 text-rose-300"
                      >
                        <X size={11} weight="bold" />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  data-testid="socio-parceiro-submit"
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold disabled:opacity-40"
                >
                  {busy ? "A enviar..." : "Enviar talão"}
                </button>
                <p className="text-[10px] text-slate-500">
                  Máximo de 3 talões por dia e submissão nas 48h seguintes à compra. O mesmo talão não pode ser carregado duas vezes. Cada talão é validado pela direção (a fotografia é lida automaticamente para confirmar o parceiro, a data e o valor).
                </p>
              </form>
            )}

            <div className="mt-4 pt-3 border-t border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">Os meus talões</div>
              {tickets.length === 0 ? (
                <div className="text-xs text-slate-500">Ainda não enviaste talões.</div>
              ) : (
                <ul className="space-y-1.5" data-testid="socio-parceiro-tickets">
                  {tickets.map((t) => {
                    const st = STATUS_STYLE[t.status] || STATUS_STYLE.pending;
                    return (
                      <li key={t.id} className="flex items-center gap-2 text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-2">
                        <span>{t.partner_emoji}</span>
                        <span className="flex-1 truncate text-slate-300">{t.partner_name}</span>
                        <span className="text-slate-500">{new Date(`${t.purchase_date}T12:00:00`).toLocaleDateString("pt-PT")}</span>
                        <strong className="text-amber-300">{euro(t.amount)}</strong>
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${st.cls}`}>
                          {st.label}{t.points_awarded ? ` · +${t.points_awarded} pts` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

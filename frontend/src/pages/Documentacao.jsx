import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DownloadSimple, Code, Book, ArrowLeft } from "@phosphor-icons/react";
import { toast } from "sonner";

const APP_DOCUMENTATION = `# ARD Nespereira — Bar Manager
**Documentação técnica de construção da aplicação**

> Gerada em: ${new Date().toLocaleString("pt-PT")}

---

## 1. Visão geral

App de gestão integrada de bar/clube ARD Nespereira em **PT-PT**. Combina:

- **POS / Vendas** com carrinho, pontos, rollover de cêntimos para sócios
- **Stock** agrupado por categoria, com flags (cota, comida, indisponível, conta da casa)
- **Sócios** com portal de auto-serviço (login via nº sócio + PIN)
- **Pagamentos** (caixa do bar) com gratificação, troco, selecção de vendas
- **Cotas mensais** (12/ano) com pagamento em lote
- **Fornecedores** com código F01… e encomendas/despesas
- **Audit log** completo, **transações numeradas** universalmente (\`tx_number\`)
- **PWA**: instalável em mobile, manifest + service worker
- **Notificações**: deep links WhatsApp/SMS + email via Resend (opcional)

---

## 2. Stack técnica

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React 19 · TailwindCSS · Shadcn UI · Phosphor Icons · Recharts · Sonner · React Router v6 |
| **Backend**  | FastAPI · Motor (async MongoDB) · Pydantic v2 · JWT (httponly cookie) · bcrypt |
| **DB**       | MongoDB (collections detalhadas abaixo) |
| **Comms**    | Resend SDK (email lazy) · MBWay flow interno |
| **Deploy**   | Kubernetes (cluster Emergent) · supervisor · ingress \`/api\` → 8001, restante → 3000 |

---

## 3. Estrutura de pastas

\`\`\`
/app
├── backend/
│   ├── server.py                  ← FastAPI app (rotas, modelos, auth, lógica)
│   ├── .env                       ← MONGO_URL, DB_NAME, JWT_SECRET, RESEND_API_KEY, CLUB_MBWAY_PHONE
│   ├── requirements.txt
│   └── tests/                     ← pytest (iter6..iter10)
├── frontend/
│   ├── public/
│   │   ├── manifest.json          ← PWA manifest
│   │   ├── sw.js                  ← Service worker (cache-first)
│   │   └── manual.html            ← Manual do sócio imprimível
│   ├── src/
│   │   ├── App.js                 ← Routes
│   │   ├── lib/api.js             ← Axios instance + helpers
│   │   ├── context/               ← AuthContext, SocioContext
│   │   ├── components/ui/         ← Shadcn UI primitives
│   │   └── pages/
│   │       ├── AppLayout.jsx, Dashboard.jsx, Login.jsx
│   │       ├── Vender.jsx, Stock.jsx
│   │       ├── Clientes.jsx, ClienteFicha.jsx, Socios.jsx
│   │       ├── Fornecedores.jsx, MBWay.jsx, Pedidos.jsx
│   │       ├── DividasHoje.jsx, Equipa.jsx, Contas.jsx
│   │       ├── Mensagens.jsx, Historico.jsx
│   │       ├── Transacao.jsx       ← consulta universal por #tx
│   │       ├── Documentacao.jsx    ← este documento
│   │       ├── SocioLogin.jsx, SocioPortal.jsx
└── memory/
    ├── PRD.md
    └── test_credentials.md
\`\`\`

---

## 4. Modelos de dados (MongoDB)

### users
\`{ id, email (unique), name, role: admin|tesoureiro|funcionario, password_hash, created_at }\`

### clients
\`{ id, name, contact, email, morada, note, member_number, is_member, pin_hash, balance, points, points_pending_value, total_spent, birthday, photo_data, profile_bonus_given, created_at }\`

### products
\`{ id, name, price, quantity, low_stock_threshold, category, is_quota, is_food, unavailable, is_house_account, image_url }\`

### sales
\`{ id, tx_number, client_id, client_name, items[], total, house_total, points_earned, points_pending_before, points_pending_after, is_member_at_sale, user_email, created_at, source?: 'quota' }\`

### payments
\`{ id, tx_number, client_id, client_name, amount, tendered, points_used, points_value, total_credited, change_returned, keep_change_as_credit, tip, sale_ids[], note, user_email, created_at, source }\`

### suppliers
\`{ id, code (F01…), name, contact, email, nif, note, created_at }\`

### supplier_orders / supplier_expenses
\`{ id, tx_number, supplier_id, supplier_name, items[]?, description?, amount, paid, paid_at, invoice_data?, sale_id?, house_items[]?, user_email, created_at }\`

### quotas
\`{ id, client_id, year, month, amount, status: paid|open, paid_at, sale_id, payment_id, user_email }\`

### points_history
\`{ id, client_id, delta, source, ref_id, note, user_email, created_at }\`

### audit_log
\`{ id, type, entity, entity_id, before, after, changes, summary, by, at }\`

### counters
\`{ _id: 'tx' | 'supplier_code', seq }\`

### outras
\`mbway_payments\`, \`socio_messages\`, \`consumption_requests\`, \`stock_replenishments\`

---

## 5. Regras de negócio principais

### Pontos
- Sócio com cotas pagas (\`is_member: true\`): **1 pt cada 5€**
- Outros: **1 pt cada 10€**
- Resgate: **5 pts = 1€** (em pagamentos)
- **Rollover** (só sócios): cêntimos não convertidos acumulam para a próxima compra

### Caixa do bar (pagamentos)
- \`amount\` = numerário entregue
- \`tip\` = gratificação (receita extra; **não abate** à dívida)
- \`sale_ids\` opcional → paga apenas vendas específicas (caixa selectiva)
- \`keep_change_as_credit\` = troco fica em conta (saldo negativo)
- \`change_returned\` = troco devolvido em dinheiro
- **Estorno**: \`POST /api/payments/{id}/reverse\`
  - admin/tesoureiro → sempre
  - quem lançou → ≤ 5 min após criação

### Conta da casa
- Produto com \`is_house_account: true\`
- Vendido com valor 0€ para o cliente (não conta na dívida)
- Stock decrementa na mesma
- Gera automaticamente uma despesa em \`supplier_expenses\` com \`supplier_id: '_house'\` (F00)
- Linha do recibo guarda \`house_value\` original para auditoria

### Comida (\`is_food\`)
- Funcionários só podem vender entre **16h e 20h** (Europa/Lisboa)
- Admin/tesoureiro pode vender a qualquer hora
- Portal do sócio respeita o horário

### Indisponível (\`unavailable\`)
- Esconde da venda + portal do sócio mesmo havendo stock
- Toggle rápido na lista de Stock

### Cotas mensais
- 12 cotas/ano, **1€/mês** (configurável via \`QUOTA_MONTHLY_VALUE\`)
- Pagamento em lote por staff via \`POST /api/quotas/pay\`
- Sócio pode pagar via MBWay (\`POST /api/socio/quotas/pay\`)
- Sócio fica \`quotas_up_to_date\` quando paga 12/12 (campo derivado em \`/api/admin/clients\`)

### Numeração universal (\`tx_number\`)
- Counter atómico em \`db.counters\`
- Cobre: \`sales\`, \`payments\`, \`supplier_orders\`, \`supplier_expenses\`
- Backfill no startup garante zero buracos
- Consulta universal: \`GET /api/transactions/{tx_number}\` resolve em todas as 4 collections

### Fornecedores (\`F01\`...)
- Counter atómico em \`db.counters._id = 'supplier_code'\`
- Conta da Casa = \`F00\` (virtual)
- Backfill atribui códigos a fornecedores antigos no startup

### Foto + Data de nascimento
- Sócio preenche **uma vez** via \`PUT /api/socio/profile-extra\`
- Após preenchido, sócio recebe **+2 pontos** (uma vez só)
- A partir daí, **só admin/tesoureiro** pode alterar via \`PUT /api/clients/{id}/profile-extra\`

### Saudação & alertas no Dashboard
- "Bom dia / Boa tarde / Boa noite" conforme hora local
- Mensagem rotativa do presidente (7 mensagens, indexada pelo dia da semana)
- Aviso de fecho do bar a partir das **2h**
- Badges intermitentes (animate-pulse) para Pedidos / MBWay / Mensagens pendentes (polling 15s)

### Mascaramento no Dashboard
Por defeito mostrados: **Vendas hoje · A receber clientes · Pessoas em dívida**.
Restantes (Vendas semana/mês, A pagar fornecedores, Valor stock, Clientes) mascarados; clica no olho para revelar (auto-remask 8s).

---

## 6. Endpoints principais (REST)

### Auth (staff)
- \`POST /api/auth/login\` · \`POST /api/auth/logout\` · \`GET /api/auth/me\` · \`POST /api/auth/register\`

### Auth (sócio)
- \`POST /api/socio/login\` · \`POST /api/socio/logout\` · \`GET /api/socio/me\`

### Clientes
- \`GET/POST /api/clients\` · \`GET/PUT/DELETE /api/clients/{id}\`
- \`GET /api/admin/clients\` (com \`quotas_paid\`, \`quotas_up_to_date\`)
- \`PUT /api/clients/{id}/profile-extra\` (foto + data, admin/tesoureiro)
- \`GET /api/clients-with-debt\`

### Produtos / Stock
- \`GET/POST /api/products\` · \`PUT/DELETE /api/products/{id}\`
- \`POST /api/products/replenish\`

### Vendas
- \`GET/POST /api/sales\` · \`PUT/DELETE /api/sales/{id}\` (funcionário <24h)

### Pagamentos
- \`POST /api/payments\` (com \`sale_ids\`, \`tip\`, \`keep_change_as_credit\`)
- \`PUT/DELETE /api/payments/{id}\` (admin/tesoureiro)
- \`POST /api/payments/{id}/reverse\` (≤5min para creator, sempre admin/tesoureiro)

### Transações
- \`GET /api/transactions/{tx_number}\` (universal)

### Cotas
- \`GET /api/clients/{id}/quotas?year=\`
- \`POST /api/quotas/pay\` (staff)
- \`GET /api/socio/quotas\` · \`POST /api/socio/quotas/pay\` (MBWay)

### Fornecedores
- \`GET/POST /api/suppliers\` (código F auto)
- \`PUT/DELETE /api/suppliers/{id}\`
- \`GET/POST /api/supplier-orders\` · \`POST /api/supplier-orders/{id}/pay\`
- \`GET/POST/PUT/DELETE /api/supplier-expenses\`

### Portal Sócio
- \`PUT /api/socio/me\` · \`POST /api/socio/mbway-request\` · \`POST /api/socio/pay-with-points\`
- \`PUT /api/socio/profile-extra\` (one-shot)
- \`GET /api/socio/products\` (não-cota, com stock)
- \`POST /api/socio/consumption-request\` · \`GET /api/socio/consumption-requests\`
- \`GET /api/socio/points-history\` · \`GET /api/socio/messages\` · \`POST /api/socio/messages\`

### Mensagens (staff)
- \`GET /api/socio-messages\` · \`POST /api/socio-messages/send-to-socio\` · \`POST /api/socio-messages/{id}/reply\`

### Audit / Reports / Dashboard
- \`GET /api/audit-log?date_from=&date_to=&user=&type=\`
- \`GET /api/reports/client/{id}\` · \`GET /api/reports/supplier/{id}\` · \`GET /api/reports/sales\` · \`GET /api/reports/finance\`
- \`GET /api/dashboard\` (KPIs + gráfico 7d)

### MBWay (staff)
- \`GET /api/mbway-payments\` · \`POST /api/mbway-payments/{id}/confirm\` · \`POST /api/mbway-payments/{id}/reject\`

---

## 7. Papéis & permissões

| Papel | Permissões |
|-------|------------|
| **admin** | TUDO. CRUD produtos+clientes, eliminar, diretório sócios, PIN, MBWay, audit log, equipa |
| **tesoureiro** | Stock + vendas + pagamentos + MBWay + PIN. **Não elimina** clientes/produtos |
| **funcionario** | Vende, regista pagamentos, edita contactos/email/morada. Edita/cancela vendas **só suas** até **24h**. Estorna pagamentos **seus** até **5 min** |
| **sócio** | Login com nº+PIN. Vê conta-corrente, pede MBWay, paga cotas, paga com pontos, pede consumo, envia mensagens, foto+data **uma vez** |

---

## 8. Setup local rápido

\`\`\`bash
# Backend
cd /app/backend
pip install -r requirements.txt
# .env deve ter: MONGO_URL, DB_NAME, JWT_SECRET, CLUB_MBWAY_PHONE
sudo supervisorctl restart backend

# Frontend
cd /app/frontend
yarn install
# .env: REACT_APP_BACKEND_URL=https://...
sudo supervisorctl restart frontend
\`\`\`

Credenciais por defeito (\`/app/memory/test_credentials.md\`):
- Admin: \`admin@ard.pt\` / \`admin123\`
- Tesoureiro: \`tesoureiro@ard.pt\` / \`tesoureiro123\`
- Funcionários: \`func1@ard.pt\` / \`func123\` (×3)
- Sócios: \`nº sócio\` (login) · PIN = \`nº sócio com zero-pad a 5 dígitos\` (ex: 88 → \`00088\`)

---

## 9. PWA

- \`/public/manifest.json\` declara app standalone com ícones
- \`/public/sw.js\` faz cache-first para assets estáticos
- Manual público: \`/manual.html\` (imprimível, PDF-friendly)

---

## 10. Numeração & relatórios

Todas as transações têm \`tx_number\` único na app. A página \`/transacoes/:tx_number\` resolve automaticamente para venda ou recibo, mostrando 2ª via imprimível e link ao cliente.

Relatórios PDF/print disponíveis em:
- Ficha do cliente (\`/clientes/:id\`) → "Imprimir relatório A4"
- Ficha do fornecedor (\`/fornecedores/:id\`) → "Imprimir extrato"
- Histórico (\`/historico\`) → Vendas + Audit log com filtros e impressão A4
- Contas (\`/contas\`) → relatório financeiro filtrado

---

## 11. Histórico de iterações

- **Iter 1-5**: Foundation (auth, RBAC, CRUD, pontos, MBWay)
- **Iter 6**: Receipt printing, time-filter consumo, dívidas hoje, despesas mensais
- **Iter 7**: Edição/eliminação pagamentos, cotas excluídas do stock, hiperligações ficha
- **Iter 8 (Fase A)**: Editar/transferir vendas, credit indicator, audit log
- **Iter 9 (Fase B+C)**: Cotas 12/ano, keep_change toggle, points history, página /pedidos, mobile sidebar
- **Iter 10**: Backfill tx_number + endpoint /socio/products + carrinho com +/- no portal
- **Iter 11**: Foto+data na ficha, cotas mensais na ficha, aba "Cotas em dia", \`tip\`, \`sale_ids\`, estorno 5min, conta da casa, horário comida, indisponível, dashboard mascarado, saudação, alertas

---

*Documento gerado automaticamente pela aplicação. Para alterações ao código consulta \`/app/backend/server.py\` e \`/app/frontend/src/\`.*
`;

export default function Documentacao() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (user?.role !== "admin") {
    return (
      <div className="p-12 text-center">
        <div className="text-rose-300">Acesso restrito ao administrador.</div>
      </div>
    );
  }

  const download = (filename, content, mime = "text/markdown") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Descarregado: ${filename}`);
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(APP_DOCUMENTATION);
      setCopied(true);
      toast.success("Documentação copiada");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="p-6 md:p-10 animate-in" data-testid="documentacao-page">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 mb-6">
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Administrador</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold tracking-tight mt-1 flex items-center gap-2">
            <Book size={28} weight="duotone" className="text-amber-400" /> Documentação técnica
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manual completo da construção da app (stack, modelos, regras, endpoints, papéis).</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            data-testid="doc-copy"
            onClick={copyAll}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm flex items-center gap-2"
          >
            <Code size={14} weight="bold" /> {copied ? "Copiado ✓" : "Copiar tudo"}
          </button>
          <button
            data-testid="doc-download-md"
            onClick={() => download("ard-nespereira-construcao.md", APP_DOCUMENTATION)}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2"
          >
            <DownloadSimple size={14} weight="bold" /> Descarregar .md
          </button>
          <button
            data-testid="doc-download-txt"
            onClick={() => download("ard-nespereira-construcao.txt", APP_DOCUMENTATION, "text/plain")}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm flex items-center gap-2"
          >
            <DownloadSimple size={14} weight="bold" /> .txt
          </button>
        </div>
      </div>

      <pre className="bg-slate-950 border border-slate-800 rounded-xl p-6 overflow-x-auto text-xs leading-relaxed text-slate-300 whitespace-pre-wrap font-mono max-h-[80vh]">
        {APP_DOCUMENTATION}
      </pre>
    </div>
  );
}

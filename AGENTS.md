# AGENTS.md — ARD Nespereira · Bar Manager (Base44 dev environment)

## Como arrancar
```bash
docker compose -f docker-compose.base44.yml up -d
```
- **frontend**: Vite dev server (React 18) na porta 5173, mapeada para o host :3000. Live reload ativo. `frontend/` está bind-mounted.
- **backend**: FastAPI/uvicorn com `--reload` na porta 8000. Dependências vindas de `backend/requirements.base44.txt` (subconjunto leve de `requirements.txt` — NÃO usar o requirements.txt completo, tem pacotes pesados desnecessários ao runtime).
- **mongo**: mongo:7 com credenciais locais (ard/ardpass) definidas inline no compose.

## Arquitetura / wirings não óbvios
- **Origem única**: o Vite dev server faz proxy de `/api` → `http://backend:8000` (ver `frontend/vite.config.js`). Auth por cookies funciona same-origin — não ativar CORS nem expor URLs absolutas.
- `frontend/src/lib/api.js` lê `VITE_BACKEND_URL` (vazio em dev = caminho relativo `/api`).
- Backend faz seed automático de utilizadores no startup (`admin@ard.pt/admin123`, `tesoureiro@ard.pt/tesoureiro123`, `func1@ard.pt/func123`, …) e backfills de `tx_number`, códigos de fornecedor (F01…) e PINs automáticos de sócios.
- PIN de sócio = nº de sócio com zero-pad a 5 dígitos (ex.: 88 → 00088).
- Mongo não tem porta exposta ao host — só acessível dentro do compose network.

## Convenções do repo que partem builds
- **JSX só em ficheiros `.jsx`** (Vite): `src/index.jsx`, `src/App.jsx` e páginas. Não criar JSX em `.js`.
- `postcss.config.js`/`tailwind.config.js`/`craco.config.js` são CommonJS — o `package.json` NÃO pode ter `"type": "module"`.
- `craco.config.js` é legado do CRA e não é usado pelo Vite (mas requer `dotenv` se carregado — não importar).

## Verificar que funciona
1. `curl -sf -H "Host: external.example" http://localhost:3000/` → HTML (200).
2. `curl -s http://localhost:8000/api/club/info` → JSON com nome do clube.
3. No preview: login `admin@ard.pt` / `admin123` → Dashboard com KPIs.
4. Sócio: `/socio/login` nº `88` PIN `00088` (se os dados existirem).

## Fichas temporárias · Cartão "Não Cliente"
- Doc em `db.clients` com `is_temp: true` + `temp_slot` (1..3) e `archived`. Máximo **3 ativas** (`OCCASIONAL_MAX_ACTIVE`).
- Endpoints: `GET/POST /api/occasional-clients`, `DELETE /api/occasional-clients/{id}`, `POST /api/occasional-clients/{id}/transfer`. O `POST /api/clients` antigo com `is_walkin` continua a existir, mas o botão "Não cliente" usa o endpoint novo (limite + arquivo automático).
- Os cartões aparecem **só na aba Vender** (`OccasionalCards`), não no Dashboard.
- Cada cartão tem um lápis (`OccasionalCardEditor`): renomear a ficha (`PUT /api/clients/{id}`), editar os produtos dos consumos em aberto (`PUT /api/sales/{id}` com a lista de items) e **transferir para um sócio** (`POST /occasional-clients/{id}/transfer` — move as vendas, ajusta saldo/pontos do sócio, apaga a ficha e liberta a vaga).
- `_sync_temp_client_state()` corre após pagamentos, estornos, cancelamento e edição de vendas: a 0,00 € a ficha é arquivada (vaga libertada) e reaberta se voltar a ter dívida. Fichas arquivadas saem de `/api/clients` e das contagens do dashboard.
- Vendas destas fichas ficam com `source: "temp_client"` (mostrado como **Venda Não Cliente** em Transações) e não acumulam pontos.

## Textos do portal editáveis (cadeado do cabeçalho)
- `db.site_content` guarda `{key, value}`. `GET /api/site-content` devolve o mapa de overrides; `PUT /api/site-content` (só **admin**) grava um texto ou repõe o original quando `value` vem vazio.
- No frontend: `ContentProvider` (`src/context/ContentContext.jsx`, em `App.jsx`) + `src/components/EditableText.jsx`. Uso: `<EditableText k="page.vender.title" as="h1" className="...">Vender</EditableText>` — sem override mostra o texto original; com o cadeado aberto fica editável (Enter guarda, Esc cancela, reescrever o texto original repõe).
- O cadeado (`content-lock-btn`) fica no cabeçalho da sidebar, junto ao símbolo ARDN, e só aparece para `admin`. Enquanto está aberto mostra a barra `content-edit-banner`.
- Já marcados: títulos de todas as páginas de staff, etiquetas/grupos da navegação e os textos do cartão de Consumo Ocasional. Basta envolver mais textos em `EditableText` para os tornar editáveis.

## Cabeçalho em telemóvel
- O topbar (`AppLayout`) e as notificações (`HeaderAlerts`) usam `flex-wrap`: os avisos passam para a linha seguinte em ecrãs estreitos em vez de serem cortados. O relógio está escondido abaixo de `sm`.


## Secrets
- `RESEND_API_KEY` (opcional) via dashboard Base44 → `/run/base44/app.env`, ligado ao serviço backend como último `env_file`. Sem ela, `send_email` falha graciosamente.
- `GEMINI_API_KEY` (necessária ao Lagarto Amarelo e à leitura de talões) no mesmo `env_file`. Modelo por omissão: `gemini-3.5-flash-lite` (`GEMINI_MODEL` sobrescreve), usado por `_gemini_generate` e pela visão dos talões. O `gemini-3.5-flash` esgota a quota free-tier (`429 generate_content_free_tier_requests` → widget com 502 "Algo correu mal"), por isso o lite é o default. A Gemini descontinua modelos antigos: `gemini-2.5-flash`/`gemini-2.0-flash` já devolvem 404 "no longer available to new users", e `gemini-3.8-flash`/`gemini-flash-latest` dão timeout no `generateContent`. Se o widget responder 502, ler o log (`Lagarto Amarelo (Gemini) falhou`) e testar `GET https://generativelanguage.googleapis.com/v1beta/models`.

## Portal do sócio
- Cabeçalho: saudação por hora do dia (`Bom dia/Boa tarde/Boa noite`) + mensagem fixa por estado de quotas (`QUOTA_GREETING` em `SocioPortal.jsx`, testid `socio-dynamic-greeting`).
- "Movimento do clube · Despesas trimestre ›" abre o modal com as despesas do trimestre (`GET /api/socio/expenses-quarterly`, descrições já anonimizadas com nº de sócio).
- "Insistir" num pedido pendente só ativa após 5 min (`POST /api/socio/consumption-requests/{id}/insist`); o staff recebe um pop-up em `HeaderAlerts` (`insist-popup`) alimentado por `insisted_at` dos pedidos pendentes.

## Pagamentos na app do sócio (MBWay · balcão)
- **Cotas**: `POST /api/socio/quotas/pay` com `pay_at_counter: true` cria o pedido (`db.mbway_payments`, `kind: "quota"`); a confirmação do staff lança a venda na conta corrente. Sem a flag é pedido MBWay.
- **Consumo**: `POST /api/socio/mbway-request` aceita `pay_at_counter` (`kind: "consumption"`, `mbway_phone` opcional). A confirmação regista o pagamento com `source: "counter"` e nota "Balcão". Em `/mbway` a coluna MBWay mostra "Balcão" quando não há telefone.
- **Sócio Honorário na app**: ativação **desativada por defeito** — `db.club_settings {id: "honorary_self_activation"}` (default `false`), exposta em `/api/club/info` e `/api/socio/quota-settings` e ligada pelo admin em `/clientes` (`honorary-app-toggle` → `PUT /api/club/honorary-settings`). Desligada, `POST /api/socio/honorary/activate` responde **403** e o portal mostra `socio-honorary-disabled` em vez do botão.

## Bola de quotas junto ao nome
- `src/components/QuotaBall.jsx` (🟢 paid / 🟡 pending / 🔴 debt; não-sócios sem bola). Usada na lista de clientes, na ficha (`ficha-client-name`) e no POS (`Vender`).

## Rodada Mista (POS)
- Botão "Rodada Mista" em `Vender` → `src/components/RodadaMista.jsx` (modal). Backend em `db.group_tables`:
  `POST /api/group-tables` (2+ sócios, notifica cada um e marca presença), `POST /{id}/rounds` (valida stock e desconta), `POST /{id}/rounds/{n}/settle` (rotação: um sócio assume a rodada), `POST /{id}/split` (partes iguais ou por consumo; cria uma venda por sócio), `POST /{id}/close`.
- As vendas ficam com `source: "group_round"` e uma única linha-resumo: "Rodada Mista (Oferecida à Mesa)" ou "Rodada Mista (Partilha i/n)"; o detalhe dos produtos vai em `group_items`. O stock é abatido no lançamento da rodada, por isso estas vendas não voltam a mexer no stock.
- Presenças do dia em `db.presences` (`client_id` + `date`), `GET /api/socio/presences/me`.

## Rodada Mista na app do sócio
- `GET /api/socio/group-tables` devolve as mesas abertas e as 5 últimas fechadas em que o sócio é membro (calcula `open_total`, `share_if_split`, `my_paid`).
- `POST /api/socio/group-tables` (`member_ids`) abre a mesa com o sócio autenticado incluído (mín. 2 elementos). Toda a criação passa por `_open_group_table()` — staff (`POST /api/group-tables`) e sócio usam o mesmo caminho (notificação + presença).
- Renomear mesa: `PUT /api/group-tables/{id}` com `{label}`. Na aba Vender há um lápis em cada cartão de mesa (`RodadaMistaCard`) e no cabeçalho da mesa dentro do modal `RodadaMista`.
- Ordem da aba Vender: Cliente/Sócio → avisos → Venda rápida → cartões de Mesa de grupo / Cliente Ocasional → produtos.

## Medalhas de conquistas (badges)
- `BADGE_DEFS` em `backend/server.py` (15 medalhas) + `_badges_for(client_id)`, calculadas a partir de vendas, presenças, rodadas e cotas.
- `GET /api/socio/badges` (app do sócio) e `GET /api/clients/{id}/badges` (consulta do staff — botão "Conquistas · medalhas de perfil" na ficha).
- Medalhas de eventos usam `db.events` (`kind`: `sueca`/`torneio`, `futebol`/`classico`) com `participants`/`participant_ids`; sem eventos registados ficam bloqueadas. "Sócio Honorário de Ouro" usa `is_honorary` + `honorary_annual_value`. "Padrinho" conta `db.clients.referred_by`.

## Arquivo histórico oficial (Historial e Palmarés)
- Conteúdo estático em `backend/club_archive_history.py`: identidade/estatutos, apoios municipais, património (Campo Dias Gonçalves), cronologia, 16 plantéis (1996/97–2023/24), palmarés, resultados oficiais da AF Guarda (6 épocas) e tradições. As linhas de resultado são escritas como `"J1: (C) Manteiga | 0–1 (D)"` e convertidas por `_matches()` — uma linha mal formatada rebenta o import (propositado).
- `GET /api/club-archive` e `GET /api/socio/club-archive` devolvem o documento de `db.club_archive` **mais** `legacy` (o arquivo estático) e `legacy` também vem na resposta do `PUT` — sem isso o separador Plantéis/Resultados ficava vazio depois de gravar.
- `_seed_club_archive_history()` (arranque) preenche história, palmarés e documentos (fontes) **só quando estão vazios**. Para repor o texto oficial: apagar o doc `db.club_archive {_id:"ardn"}` e reiniciar o backend.
- Frontend: `ClubArchive.jsx` tem os separadores e `ClubArchiveLegacy.jsx` renderiza as secções só de leitura (identidade, cronologia, plantéis, resultados, tradições). O botão "Editar" fica `disabled` enquanto o GET não chega — um clique antes do load gravava o arquivo vazio.

## Recibos (talão A6)
- `frontend/src/lib/receipt.js` (`printReceipt`) desenha vendas e recibos de pagamento: itens com quantidade/preço unitário, valor entregue, abatido na dívida e troco.
- Recibo de pagamento detalha as vendas abatidas em `covered_docs` (`{tx_number, applied, items[]}`). `POST /api/payments` já devolve `covered_docs` — sem isso o talão emitido logo após a cobrança (modal "Enviar recibo?" da ficha) saía sem itens. `GET /transactions/{n}` e `GET /clients/{id}` calculam-no por FIFO (`_allocate_payment_coverages`) quando não vem no documento.
- Pagamentos com `item_targets` mostram as linhas "N× pago · N× OFERTA DA CASA" com o valor da linha.

## Adesão de novos sócios
- Formulário público em `/aderir` (`Adesao.jsx`) → `POST /api/public/membership-application`; o pedido fica pendente para a direção aprovar em `/pedidos` (`ApprovalsPanel` → `/api/membership-applications/{id}/accept|reject`) ou no painel da própria página (`AdesaoApprovals`).
- **Aviso ao staff**: cada nova adesão conta em `GET /api/membership-applications/pending-count`; `HeaderAlerts` mostra a pill teal `N adesões` (`header-alert-memberships`, polling 15 s) que abre `/aderir?filter=pending`.
- `AdesaoApprovals` (só admin/tesoureiro/presidente) lista os pedidos pendentes com aprovar/rejeitar e os 10 últimos sócios aprovados (nº de sócio + data de decisão).
- Manual de regras: `frontend/public/manual.html` tem "Como te tornares sócio (adesão)" e "Regras que valem para todos os sócios"; `/aderir` mostra um resumo expansível (`adesao-regras`) com link para o manual.
- Lagarto Amarelo: `ARDN_SYSTEM_PROMPT` descreve o fluxo de adesão (pendente → aprovação em `/aderir?filter=pending` ou `/pedidos` → nº de sócio + PIN, padrinho +1 ponto, menores tutelados, honorário anual) e onde está o arquivo. `_lagarto_archive_context()` injeta em cada pergunta a história, a cronologia, as épocas com plantel, o palmarés e os documentos de `db.club_archive`/`CLUB_LEGACY`.
- Entradas (antes não existia nenhuma): cartão `dashboard-adesao-cta` no Dashboard (só admin/tesoureiro/presidente, com o nº de pendentes), link em `/login`, link em `/socio/login` e item de menu `Clientes → Adesão de sócios` (`nav-adesao`).

## Parceiros locais · upload de talão
- `db.partners` `{name, emoji, active, points_per_5eur}` — CRUD em `/api/partners` (admin). A checkbox "Parceria ativa" tira/coloca o parceiro na app do sócio. O antigo `auto_validate` foi removido (docs antigos podem ainda tê-lo; é ignorado).
- Sócio: `GET /api/socio/partners`, `GET/POST /api/socio/partner-tickets` (fotografia em `photo_data`, data URL base64).
- Regras: máx. **3 talões/dia**, submissão até **48 h** após a compra, `doc_number` repetido gera entrada `partner_ticket_duplicate` no Audit Log e impede o aceite automático.
- Validação: o talão entra **sempre** `pending` e é a direção que valida na página **Parceiros locais** (`/parceiros`) — `GET /api/partner-tickets`, `POST /{id}/validate`, `POST /{id}/reject`.
- Exceção: `_ai_check_partner_ticket()` (Gemini com visão, `PARTNER_TICKET_AI_PROMPT`) lê a fotografia e só aceita o talão sozinho quando identifica **parceiro, data e valor** e os três coincidem com a submissão (e não há duplicado). Corre em background na submissão; o resultado fica em `ai_check` (`confident`, `match`, `error`) e na página há o botão "Ler o talão" → `POST /{id}/ai-check` (só relê, não valida). O modelo gasta tokens a "pensar": com `maxOutputTokens` baixo o JSON sai truncado.
- Anulação: `POST /{id}/invalidate` sobre um talão validado — retira `points_awarded`, devolve a fração de `partner_points_carry` (`points_carry_delta`), apaga a presença (`presence_id`) e deixa `status: "invalidated"`. Só talões `pending` podem ser validados, por isso um talão anulado não volta a creditar pontos.
- Benefício: `floor(valor / 5.01) × points_per_5eur` pontos **só com quotas 🟢** (as frações ficam em `clients.partner_points_carry` até fechar 1 ponto) e presença do dia com `partner_id`/`partner_emoji` — o calendário mostra o selo do parceiro (`partner_days` em `_presence_overview`).
- Notificações: o staff vê o aviso `N talões` em `HeaderAlerts` (pill violeta, `header-alert-tickets`) alimentado por `GET /api/partner-tickets/pending-count` e abre `/parceiros?filter=pending` (a página deriva o filtro do `?filter=`). O sócio recebe no sino do portal uma mensagem `socio_messages` (`from_staff: true`, `partner_ticket_id`) criada em `_notify_partner_ticket()` — no aceite (dentro de `_award_partner_ticket`, cobre validação manual e automática) e na rejeição. A anulação não notifica.

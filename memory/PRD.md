# PRD — ARD Nespereira · Bar Manager

## Problema original
App de gestão completa de bar/clube ARD Nespereira (POS + stock + sócios + tesouraria) com filosofia de **programa contabilístico de empresa**. Suporte multi-papel (admin, tesoureiro, funcionário), conta-corrente por cliente, sistema de pontos, fornecedores, despesas mensais e portal de auto-serviço para sócios.

## Personas
- **Administrador** — controlo total. Renomeia equipa, elimina clientes/produtos/pagamentos sem restrição.
- **Tesoureiro** — gestão financeira completa exceto eliminar clientes/produtos.
- **Funcionário** — operacional. Vende, edita contactos, mas só pode editar/cancelar vendas até 24h após o registo.
- **Sócio** — auto-serviço via `/socio/login` com nº de sócio e PIN (5 dígitos).

## Requisitos principais

### Identidade
- Tema escuro (slate + amber + green) com branding ARD Nespereira.
- PT-PT exclusivamente.

### POS / Vendas
- Vender com carrinho intuitivo, validação de stock.
- "Vender" também disponível na ficha do cliente.
- Sócios com cotas pagas: 1 pt cada 5€. Outros: 1 pt cada 10€.
- 5 pontos = 1€ de desconto.
- Vendas têm registo de quem vendeu (`user_email`), data e estado pago/parcial/em dívida.
- Vendas editáveis/transferíveis para outro cliente (24h para funcionários, sempre para admin/tesoureiro).
- Audit log de eliminações e edições.

### Stock
- Produtos com `is_quota` (cotas) que **não** contam para valor de stock nem alertas.
- Reposição com preço de custo.
- Valor de stock só visível para admin/tesoureiro.

### Clientes / Sócios
- Filtros Todos/Sócios/Clientes no diretório.
- Conta-corrente com hiperligações a Telemóvel/Email/Maps/WhatsApp.
- Saldo negativo → indicador de **Crédito a favor**.
- PIN automático = nº sócio com zero-pad a 5 dígitos (88 → 00088).
- Portal de sócio: ver conta, pedir MBWay, pagar com pontos.

### Pagamentos / Caixa
- Modal estilo caixa registadora com Total recebido + Abate na dívida + Troco.
- Campo "A pagar" começa vazio (utilizador insere o valor entregue).
- Descontar pontos no momento do pagamento (múltiplos de 5).
- Section "O que está em dívida" mostra apenas vendas não pagas, com editar/eliminar/transferir.
- Editar pagamento (amount + note) com ajuste automático ao saldo.
- Recibo imprimível A6 discriminando os itens consumidos cobertos.
- Notificações por WhatsApp/SMS/Email/Imprimir.

### Fornecedores
- Encomendas com pagamento total ou parcial.
- Despesas mensais recorrentes (renda, luz, internet…).
- Conta-corrente imprimível com filtros de data.

### Dashboard
- 8 KPIs com hiperligação para a respetiva tab (today/week/month sales → /vender, debtors → /dividas, stock → /stock, etc.).
- Gráfico últimos 7 dias.
- Alertas de stock baixo.

### Administração
- Página `/equipa` (admin only) para renomear funcionários e tesoureiros.

### Relatórios
- Conta-corrente de cliente e fornecedor com filtros de datas (formato A4 para impressão).
- Presets: este mês, este ano, sempre.

## Tech Stack
- **Backend**: FastAPI + Motor (MongoDB async) + JWT + bcrypt + Resend.
- **Frontend**: React 19 + Vite-equivalente (CRACO) + Tailwind + Shadcn + Phosphor icons + Recharts + Sonner + Framer Motion.
- **DB**: MongoDB. Collections: users, clients, products, sales, payments, mbway_payments, suppliers, supplier_orders, supplier_expenses, stock_replenishments, audit_log.

## Implementado (CHANGELOG)

### Iter 1-5 — Foundation
- JWT auth, RBAC 3 papéis, CRUD produtos/clientes/vendas, branding, sistema de pontos, portal sócio, MBWay, fornecedores.

### Iter 6 (Fev 2026)
- "Vender" e "Eliminar" no cartão do cliente.
- Repartição de consumo diário/semanal/mensal/anual.
- Tab "Dívidas Hoje" dedicada.
- Modal de pagamento estilo caixa registadora com troco.
- Dashboard com KPIs de dívida a fornecedores.
- Despesas mensais de fornecedores.

### Iter 7 — Acabamentos contabilísticos
- Produtos `is_quota` (cotas) excluídos do stock value.
- PUT/DELETE `/api/payments/{id}` — editar/eliminar pagamentos com ajuste de saldo.
- Endpoints `/api/reports/client/{id}` e `/api/reports/supplier/{id}` com filtros de datas.
- Hiperligações na ficha (telemóvel/email/maps/WhatsApp).
- Modal de pagamento mostra "O que está em dívida".
- Botão "Imprimir Recibo" (A6) e "Imprimir Relatório" (A4).
- "Dívidas hoje" reposicionada junto ao Dashboard no sidebar.

### Iter 8 — Fase A (Maio 2026)
- PUT `/api/sales/{id}` — editar itens e transferir para outro cliente. Funcionário limitado a 24h.
- DELETE `/api/sales/{id}` — funcionário pode cancelar até 24h. Audit log.
- Ícone Pago/Parcial/Em dívida em cada venda.
- Indicador de Crédito (saldo negativo).
- Campo "A pagar" começa vazio.
- Recibo discrimina itens consumidos.
- Diretório Clientes com filtros Todos/Sócios/Clientes.
- KPIs Dashboard com hiperligações.
- Valor de stock escondido para funcionário.
- PIN automático para sócios = nº sócio padded a 5 dígitos.
- Página `/equipa` para admin renomear funcionários.
- Page audit log: `audit_log` collection regista `sale_cancel` e `sale_edit`.

### Iter 9 — Fase B + C (Maio 2026)
- **Pagamentos**: novo `keep_change_as_credit` (default False). Troco é devolvido em dinheiro, **nunca** transita para crédito sem decisão explícita.
- **Cotas mensais (12 anuais)**: produtos virtuais por mês/ano. Endpoints `/api/quotas/pay` (staff) e `/api/socio/quotas/pay` (sócio via MBWay). Confirmação MBWay cria sale + payment de receita.
- **MBWay nº do clube fixado**: `968265272` (configurável via `CLUB_MBWAY_PHONE`).
- **Histórico de pontos** (`points_history` collection): cada atribuição/desconto é registado com origem, ref e utilizador.
- **Rollover de pontos**: sócios acumulam o resto (cêntimos) de vendas que não cobrem 5€ para a próxima.
- **Relatório global de vendas** (`/api/reports/sales`): filtros por data, vendedor, cliente e estado pago/aberto.
- **Audit log queryable** (`/api/audit-log`): filtros por data, utilizador e tipo. Detalhes estruturados `changes: {field: {before, after}}`.
- **Página `/historico`**: dois separadores (Vendas + Audit log) com filtros + impressão A4. Filtro por cliente.
- **Página `/pedidos`**: staff valida pedidos de consumo dos sócios.
- **Portal Sócio**:
  - Histórico com filtros Hoje/Semana/Mês/Ano/Sempre.
  - Botão "Recibo" por pagamento (abre talão imprimível).
  - Modal "Extrato de pontos" com saldo, ganhos e gastos.
  - Modal "Pagar cotas" com grid de 12 meses.
  - Botão "Pedir consumo" (consumption-request).
  - Link "Manual" para `/manual.html`.
- **Mobile**: sidebar drawer com hamburger em <768px. App agora responsiva.
- **Manual do sócio**: HTML imprimível em `/manual.html` (público, com botão imprimir/PDF).
- **Renomear staff**: página `/equipa` (admin) — implementada na iter 8.

## Backlog (P2+)

### Backlog
- **Twilio/WhatsApp/SMS automatizados**: requer chaves do utilizador. Já há deep links (wa.me/sms:) funcionais.
- **Refatoração**: `server.py` em routes/, `ClienteFicha.jsx` em sub-componentes.

## API Endpoints (atualizado)

### Auth
- POST `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`
- GET `/api/auth/me`

### Users
- GET `/api/users` (admin)
- PUT `/api/users/{id}` (admin, renomear funcionário/tesoureiro)

### Products
- GET/POST `/api/products`
- PUT/DELETE `/api/products/{id}`
- POST `/api/products/replenish`

### Clients
- GET `/api/clients`, POST `/api/clients`
- GET `/api/clients/{id}` (com consumption breakdown)
- PUT `/api/clients/{id}` (auto-PIN se member_number novo)
- DELETE `/api/clients/{id}` (admin)
- GET `/api/clients-with-debt`
- GET `/api/admin/clients` (sócios directory)

### Sales
- GET `/api/sales`, POST `/api/sales`
- PUT `/api/sales/{id}` (editar items / transferir cliente; funcionário <24h)
- DELETE `/api/sales/{id}` (cancelar; funcionário <24h; audit log)

### Payments
- POST `/api/payments`
- PUT `/api/payments/{id}` (admin/tesoureiro)
- DELETE `/api/payments/{id}` (admin/tesoureiro)

### Reports
- GET `/api/reports/client/{id}?date_from=&date_to=`
- GET `/api/reports/supplier/{id}?date_from=&date_to=`

### Dashboard
- GET `/api/dashboard` (8 KPIs, gráfico 7 dias, low_stock)

### Notify
- POST `/api/notify/payment` (canais email/whatsapp/sms)

### Sócio portal
- POST `/api/socio/login`, `/api/socio/logout`
- GET/PUT `/api/socio/me`
- POST `/api/socio/mbway-request`
- POST `/api/socio/pay-with-points`

### MBWay (staff)
- GET `/api/mbway-payments`
- POST `/api/mbway-payments/{id}/confirm`
- POST `/api/mbway-payments/{id}/reject`

### Suppliers
- GET/POST `/api/suppliers`
- PUT/DELETE/GET `/api/suppliers/{id}`
- GET/POST `/api/supplier-orders`
- POST `/api/supplier-orders/{id}/pay`
- GET/POST/PUT/DELETE `/api/supplier-expenses[/{id}]`

### Club info
- GET `/api/club/info`

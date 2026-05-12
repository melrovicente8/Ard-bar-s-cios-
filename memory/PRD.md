# Cellar — Gestão de Stock & Vendas do Bar

## Problema original
"Quer uma app para gerir o stock do bar — tenho x stock, que posso carregar quando chegam novas encomendas de stock, com definição de quantidade e preço. Quero que ao vender ao cliente A, B, C, D, E, G, H… seja descontado no stock. Que na ficha do cliente me diga o consumo e o preço a pagar."

## Decisões (do utilizador)
- Auth: login simples email/password
- Clientes: CRUD livre (nome, contacto, email, nota)
- Pagamentos: conta corrente acumulativa + registo de pagamentos
- Funcionalidades extra: stock baixo, histórico por cliente, relatórios
- Moeda: EUR (pt-PT)

## Arquitetura
- **Backend**: FastAPI + Motor (MongoDB), JWT em httpOnly cookie, bcrypt
- **Frontend**: React 19 + React Router 7 + Tailwind, Phosphor icons, Recharts, Sonner toasts
- **Tema**: dark Jewel & Luxury (slate-950 + amber-500), fontes Outfit + Manrope

## Implementado (12/Fev/2026)
- Login/Registo/Logout + auth context + protected/public routes
- Produtos: listar / criar / editar / eliminar + carregar stock (replenish)
- Clientes: listar / criar / editar / eliminar + procura
- Vendas: POS 70/30, decremento de stock automático, soma à conta corrente
- Pagamentos: registar pagamento na ficha do cliente, decremento de balance
- Ficha do Cliente: dívida, total consumido, histórico de vendas com line items, timeline de eventos
- Dashboard: KPIs (vendas hoje, a receber, valor stock, clientes), gráfico 7 dias, alertas stock baixo, últimas vendas
- Dados de demonstração: admin@bar.pt / admin123 + 8 produtos + 5 clientes + 1 venda
- Testes: 8/8 pytest backend, fluxo end-to-end frontend validado

## Backlog (P1)
- Filtros de data nos relatórios + exportar CSV
- Edição inline de stock direto na tabela
- Multi-utilizador com permissões (admin / staff)
- Categorias geridas com cores
- Notas/observações por venda
- Recibo / talão imprimível por venda
- Modo "happy hour" com preços alternativos

## Backlog (P2)
- PWA / offline
- Integração com leitor de código de barras
- Exportar conta corrente em PDF para cliente
- Estatísticas por produto (mais vendidos)

## Credenciais
- Admin: `admin@bar.pt` / `admin123` (seed automático)

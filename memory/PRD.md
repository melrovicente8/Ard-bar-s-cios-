# ARD Nespereira — App de Gestão do Bar do Clube

## Problema original
"App para gerir o stock do bar — quantidades + preço, carregar quando chegam encomendas, descontar no stock ao vender, ficha do cliente com consumo e total a pagar."

## Decisões do utilizador (consolidadas)
- Auth: login simples com 5 perfis (admin, tesoureiro, 3 funcionários)
- Clientes: CRUD livre + estatuto de sócio (`is_member`) + nº de sócio
- Pontos: 1 pt por cada 5€ se sócio com cotas pagas, senão 1 pt por cada 10€
- Pagamentos: conta corrente acumulativa + registo de pagamentos + recibo enviado por WhatsApp/SMS/Email
- Moeda: EUR (pt-PT)
- Identidade visual: ARD Nespereira (verde + amarelo, escudo)
- Notificações: WhatsApp/SMS via deep links (sem chave); Email via Resend (preparado, mas inativo enquanto não houver `RESEND_API_KEY`)

## Permissões
| Ação | Admin | Tesoureiro | Funcionário |
|---|:-:|:-:|:-:|
| Criar/editar produtos | ✅ | ✅ | ❌ |
| Carregar stock | ✅ | ✅ | ❌ |
| Eliminar produtos | ✅ | ❌ | ❌ |
| Criar clientes | ✅ | ✅ | ✅ |
| Editar clientes | tudo | tudo | só `contact` + `email` |
| Eliminar clientes | ✅ | ❌ | ❌ |
| Vender / Pagamentos | ✅ | ✅ | ✅ |
| Notificar cliente | ✅ | ✅ | ✅ |
| Diretório de Sócios (`/socios`) | ✅ | ❌ | ❌ |

## Implementado (12/Fev/2026) — Iteração 2
- Rebrand ARD Nespereira (logo escudo verde+amarelo, copy, cores)
- 5 contas seedadas com permissões role-based no backend e no frontend
- Cliente: campos `member_number`, `is_member`, `points`
- Vendas: `points_earned` e `is_member_at_sale` calculados e gravados
- Endpoint `/api/notify/payment` (email via Resend lazy + WhatsApp/SMS deep links)
- Endpoint `/api/admin/clients` (diretório completo restrito a admin)
- Nova página `/socios` (filtros, stats, modal de mensagem)
- Modal de notificação automática após pagamento na ficha do cliente
- Testes: backend 18/18 pytest, frontend 100% nos fluxos testados

## Credenciais
- `admin@ard.pt` / `admin123`
- `tesoureiro@ard.pt` / `tesoureiro123`
- `func1@ard.pt` / `func123`, `func2@ard.pt` / `func123`, `func3@ard.pt` / `func123`

## Backlog (P1)
- Ativar emails reais: criar conta Resend, verificar domínio do clube, adicionar `RESEND_API_KEY` em `/app/backend/.env`, reiniciar backend
- Filtros de data nos relatórios + exportar CSV
- Catálogo de benefícios/recompensas (trocar pontos por brindes)
- Atualização de cotas: marcar/desmarcar `is_member` em massa no início do ano
- Recibo PDF imprimível por venda

## Backlog (P2)
- Notificação push para alerta stock baixo
- Estatísticas por produto (top vendidos)
- Painel "Caixa" para tesoureiro com fecho de dia
- Integração leitor de código de barras

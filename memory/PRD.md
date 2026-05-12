# ARD Nespereira — App de Gestão do Bar do Clube

## Decisões consolidadas
- 3 perfis staff + 1 perfil sócio (login separado)
- Pontos: 1pt/5€ sócios c/ cotas pagas · 1pt/10€ não-sócios
- Notificação após pagamento via WhatsApp/SMS (deep link) e Email (Resend, inativo até chave)
- Pagamento MBWay manual: sócio pede, staff confirma
- Moeda EUR (pt-PT)

## Permissões (resumo)
| Ação | Admin | Tesoureiro | Funcionário | Sócio (portal) |
|---|:-:|:-:|:-:|:-:|
| Criar/editar produtos | ✅ | ✅ | ❌ | ❌ |
| Carregar stock | ✅ | ✅ | ❌ | ❌ |
| Eliminar produtos | ✅ | ❌ | ❌ | ❌ |
| Criar cliente | ✅ | ✅ | ✅ | ❌ |
| Editar cliente | tudo (+PIN) | tudo (+PIN) | `contact`/`email`/`morada` | só os seus |
| Eliminar cliente | ✅ | ❌ | ❌ | ❌ |
| Vender / Pagamentos | ✅ | ✅ | ✅ | ❌ |
| Confirmar MBWay | ✅ | ✅ | ✅ | ❌ |
| Diretório Sócios | ✅ | ❌ | ❌ | ❌ |
| Portal próprio | — | — | — | ✅ |

## Implementado (12/Fev/2026) — Iterações 1+2+3
- ARD branding (verde+amarelo, escudo, copy)
- Stock, Vendas com decremento, Clientes
- Pontos automáticos por venda
- 5 contas staff + role guards (frontend e backend)
- Diretório de Sócios (admin)
- Modal de notificação WhatsApp/SMS/Email após pagamento
- **Iter 3**: Lápis para editar ficha do cliente, top-bar com Voltar/Início, campo Morada
- **Iter 3**: Portal do sócio `/socio/login` por Nº+PIN → ficha própria, edição de telemóvel/email/morada, pedido MBWay
- **Iter 3**: Página `/mbway` para staff confirmar ou rejeitar (qualquer dos 3 perfis pode validar)
- **Iter 3**: PIN gerido por admin/tesoureiro (no formulário do cliente ou via lápis); `pin_hash` nunca devolvido nas APIs

## Credenciais
| Perfil | Acesso |
|---|---|
| Admin | `admin@ard.pt` / `admin123` em `/login` |
| Tesoureiro | `tesoureiro@ard.pt` / `tesoureiro123` em `/login` |
| Funcionários | `func1@ard.pt`, `func2@ard.pt`, `func3@ard.pt` / `func123` em `/login` |
| Sócio (exemplo) | Nº `1982` · PIN `1234` em `/socio/login` (Ana Ferreira) |

## Testes
- Iter 1: 8 pytest passou + smoke frontend
- Iter 2: +12 pytest (roles, pontos, notify)
- Iter 3: +18 pytest (sócio, MBWay, PIN, morada)
- **Total: 44/44 backend; frontend 100% nos fluxos testados**

## Backlog (P1)
- Ativar emails reais via Resend (adicionar `RESEND_API_KEY`)
- Catálogo de benefícios — trocar pontos por brindes
- Marcação em massa de "cotas pagas" no início de cada ano
- Recibo PDF imprimível por venda

## Backlog (P2)
- MBWay automático via IfThenPay/Eupago (quando volume justificar)
- Notificação push para alertas de stock baixo
- Estatísticas por produto (top vendidos)
- Painel "Caixa" com fecho de dia para tesoureiro
- Modo offline (PWA)

# ARD Nespereira — App de Gestão do Bar do Clube

## Decisões consolidadas
- 3 perfis staff + 1 perfil sócio (login separado)
- **Pontos**: 1pt/5€ sócios c/ cotas pagas · 1pt/10€ não-sócios
- **Pagar com pontos**: 5 pts = 1€ (sócio decide no portal)
- **Pagamento MBWay manual**: sócio pede, staff confirma
- **Fornecedores + Encomendas**: encomenda adiciona ao stock automaticamente, suporta valor em dívida ao fornecedor
- Notificação após pagamento via WhatsApp/SMS (deep link) e Email (Resend, inativo até chave)
- Moeda EUR (pt-PT)

## Permissões
| Ação | Admin | Tesoureiro | Funcionário | Sócio |
|---|:-:|:-:|:-:|:-:|
| Editar produtos / carregar stock | ✅ | ✅ | ❌ | ❌ |
| Eliminar produtos | ✅ | ❌ | ❌ | ❌ |
| Criar cliente | ✅ | ✅ | ✅ (sem nº sócio/cotas/PIN) | ❌ |
| Editar cliente | tudo (+ PIN) | tudo (+ PIN) | só `contact`/`email`/`morada` | só os seus |
| Eliminar cliente | ✅ | ❌ | ❌ | ❌ |
| Definir/alterar `is_member`/`member_number`/`pin` | ✅ | ✅ | ❌ | ❌ |
| Vender / Pagamentos | ✅ | ✅ | ✅ | ❌ |
| Confirmar MBWay | ✅ | ✅ | ✅ | ❌ |
| Fornecedores (CRUD) | ✅ | ✅ | ❌ | ❌ |
| Eliminar fornecedor | ✅ | ❌ | ❌ | ❌ |
| Encomendas / Pagar fornecedor | ✅ | ✅ | ❌ | ❌ |
| Diretório Sócios | ✅ | ❌ | ❌ | ❌ |
| Portal próprio (saldo + pagar c/ pontos + MBWay) | — | — | — | ✅ |

## Implementado — Iteração 4
- Restrição completa: funcionário **não** pode alterar `is_member`, `member_number` ou `pin`
- Ficha do cliente: badge claro **Sócio nº X · Cotas pagas** (verde) / **Por regularizar** (âmbar) / **Não-sócio** (cinza)
- Diretório de Sócios filtra apenas `is_member=true` (não inclui clientes regulares)
- Nova página **Fornecedores** (admin+tesoureiro): CRUD + tab Encomendas
- Encomenda incrementa stock automaticamente; balance_due tracked; pagamentos parciais ao fornecedor
- **Sócio pode pagar com pontos**: 5 pts = 1€, múltiplos de 5, decrementa pontos e dívida

## Credenciais
| Perfil | Acesso |
|---|---|
| Admin | `admin@ard.pt` / `admin123` em `/login` |
| Tesoureiro | `tesoureiro@ard.pt` / `tesoureiro123` em `/login` |
| Funcionários | `func1@ard.pt`, `func2@ard.pt`, `func3@ard.pt` / `func123` em `/login` |
| Sócio (exemplo) | Nº `1982` · PIN `1234` em `/socio/login` (Ana Ferreira) |

## Testes
- **Iter 4**: +23 pytest backend (100%), +16 verificações frontend (100%)
- **Total: 66/67** (1 asserção iter2 desatualizada por design)

## Backlog
- P1: ativar emails reais via Resend; catálogo de recompensas (trocar pontos por brindes); marcação em massa de cotas anuais; recibo PDF
- P2: MBWay automático (IfThenPay/Eupago); push de stock baixo; relatórios por produto; modo offline (PWA)

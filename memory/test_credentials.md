# Test Credentials

## Staff Accounts (login em `/login`)

| Email | Password | Role | Permissões |
|-------|----------|------|------------|
| `admin@ard.pt` | `admin123` | admin | TUDO (CRUD produtos+clientes, eliminar, diretório de Sócios, PIN, MBWay) |
| `tesoureiro@ard.pt` | `tesoureiro123` | tesoureiro | Stock + vendas + pagamentos + MBWay + PIN. **Não elimina**. |
| `func1@ard.pt` | `func123` | funcionario | Vender, registar pagamentos, criar clientes, editar `contact`/`email`/`morada`, confirmar MBWay. **Não edita produtos**. |
| `func2@ard.pt` | `func123` | funcionario | idem |
| `func3@ard.pt` | `func123` | funcionario | idem |

## Sócio Portal (login em `/socio/login`)

PIN automático = nº de sócio com zeros à esquerda até 5 dígitos.

| Nº Sócio | PIN | Cliente |
|----------|-----|---------|
| `88` | `00088` | David Vicente |
| `99` | `00099` | Rui Amaral |
| `1` | `00001` | Antero |

Outros sócios podem ter o PIN definido manualmente. Para criar uma conta de teste rapidamente, o admin pode usar o lápis "Editar ficha" e definir um PIN.

## Endpoints principais
- Staff auth: `POST /api/auth/login` (cookie `access_token`)
- Sócio auth: `POST /api/socio/login` (cookie `socio_token`)
- Public: `GET /api/club/info` (nome + nº MBWay do clube)
- MBWay: `POST /api/socio/mbway-request`, `GET /api/mbway-payments`, `POST /api/mbway-payments/{id}/confirm|reject`

## Pontos
- Sócio com cotas pagas (`is_member: true`): 1 ponto por cada 5€
- Não-sócio: 1 ponto por cada 10€

## Notificações
- WhatsApp/SMS: deep links (já funcionais, sem chave)
- Email: Resend lazy — adicionar `RESEND_API_KEY` em `/app/backend/.env` para ativar

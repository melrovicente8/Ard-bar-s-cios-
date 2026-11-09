import {
  ChartLineUp,
  Wallet,
  Storefront,
  Package,
  Users,
  Book,
  DeviceMobile,
  UsersThree,
  Bank,
  Vault,
  ListDashes,
} from "@phosphor-icons/react";

export const STAFF_ROLES = ["admin", "tesoureiro", "presidente"];

export const navGroups = [
  {
    section: null,
    items: [
      { to: "/", label: "Dashboard", icon: ChartLineUp, testid: "nav-dashboard", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/dividas", label: "Dívidas em aberto", icon: Wallet, testid: "nav-dividas", roles: [...STAFF_ROLES, "funcionario"] },
      {
        to: "/vender", label: "Vender", icon: Storefront, testid: "nav-sell",
        also: ["/bilhetes"], roles: [...STAFF_ROLES, "funcionario"],
      },
    ],
  },
  {
    section: "Stock",
    items: [
      {
        to: "/stock", label: "Stock", icon: Package, testid: "nav-stock",
        also: ["/fornecedores"], roles: [...STAFF_ROLES, "funcionario"],
      },
    ],
  },
  {
    section: "Clientes",
    items: [
      {
        to: "/clientes", label: "Clientes e Sócios", icon: Users, testid: "nav-clients",
        also: ["/rankings"], roles: [...STAFF_ROLES, "funcionario"],
      },
      { to: "/arquivo", label: "Historial e Palmarés", icon: Book, testid: "nav-arquivo", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/parceiros", label: "Parceiros locais", icon: Storefront, testid: "nav-parceiros", roles: [...STAFF_ROLES, "funcionario"] },
      {
        to: "/mbway", label: "MBWay e Pedidos", icon: DeviceMobile, testid: "nav-mbway",
        also: ["/pedidos", "/mensagens"], roles: [...STAFF_ROLES, "funcionario"],
      },
    ],
  },
  {
    section: "Administração",
    items: [
      { to: "/equipa", label: "Equipa", icon: UsersThree, testid: "nav-equipa", roles: ["admin"] },
      { to: "/contas", label: "Contas", icon: Bank, testid: "nav-contas", roles: [...STAFF_ROLES, "funcionario"] },
      { to: "/banco", label: "Caixa e Banco", icon: Vault, testid: "nav-banco", roles: ["admin", "tesoureiro"] },
      {
        to: "/transacoes", label: "Transações", icon: ListDashes, testid: "nav-transacoes",
        also: ["/historico", "/ofertas"], roles: [...STAFF_ROLES, "funcionario"],
      },
      { to: "/documentacao", label: "Documentação", icon: Book, testid: "nav-documentacao", roles: ["admin"] },
    ],
  },
];

/** Abas do menu a que um utilizador tem acesso (para "mover bloco para…"). */
export const layoutPagesFor = (role) =>
  navGroups
    .flatMap((g) => g.items)
    .filter((item) => !role || item.roles.includes(role))
    .map((item) => ({ to: item.to, label: item.label }));

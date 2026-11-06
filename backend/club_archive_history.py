"""ARD Nespereira — arquivo histórico oficial fornecido pela direção.

Dados institucionais, cronologia, plantéis por época, palmarés, resultados
oficiais da AF Guarda, tradições e fontes documentais.

Este módulo é estático de propósito: é a memória do clube, servida tal e qual
em `GET /api/club-archive` (chave `legacy`). O palmarés e o arquivo documental
são também semeados em `db.club_archive` para poderem ser editados pela direção.
"""

import re

_MATCH_RE = re.compile(
    r"^(?P<round>[^:]+):\s*\((?P<venue>[CF])\)\s*(?P<opponent>.+?)\s*\|\s*"
    r"(?P<score>.+?)\s*\((?P<result>[VED])\)\s*$"
)


def _matches(*raw):
    """Converte linhas «J1: (C) Manteigas | 0–1 (D)» em registos estruturados."""
    out = []
    for line in raw:
        m = _MATCH_RE.match(line.strip())
        if not m:
            raise ValueError(f"Linha de resultado inválida: {line!r}")
        out.append({
            "round": m.group("round").strip(),
            "venue": m.group("venue"),
            "opponent": m.group("opponent").strip(),
            "score": m.group("score").strip(),
            "result": m.group("result"),
        })
    return out


def _squad(season, president, groups, coach=None, staff=None):
    """Plantel de uma época: grupos por posição + equipa técnica + direção."""
    return {
        "season": season,
        "president": president,
        "coach": coach,
        "staff": [s for s in (staff or []) if s],
        # remove nomes repetidos dentro do mesmo grupo, mantendo a ordem
        "groups": [{"role": role, "players": list(dict.fromkeys(players))} for role, players in groups],
    }


CLUB_IDENTITY = {
    "name": "Associação Recreativa e Desportiva de Nespereira",
    "short_name": "ARD Nespereira",
    "former_name": "Nespereira Futebol Clube",
    "nif": "503 018 112",
    "founded": "1 de maio de 1982",
    "address": "Beco da República, n.º 2 · Travessa do Olho, n.º 1 · 6290-201 Nespereira, Gouveia, Guarda",
    "purpose": (
        "Estatutos aprovados na escritura de constituição de 28 de setembro de 1982, publicada no "
        "Diário da República, III Série, n.º 242, de 19 de outubro de 1982, definindo como objetivos o "
        "desenvolvimento físico, intelectual, cultural e desportivo dos associados."
    ),
    "facts": [
        {"label": "Denominação atual", "value": "Associação Recreativa e Desportiva de Nespereira (ARDN)"},
        {"label": "Denominação anterior", "value": "Nespereira Futebol Clube"},
        {"label": "NIF", "value": "503 018 112"},
        {"label": "Data de fundação", "value": "1 de maio de 1982"},
        {"label": "Escritura de constituição", "value": "28 de setembro de 1982"},
        {
            "label": "Publicação oficial",
            "value": "Diário da República, III Série, n.º 242, de 19 de outubro de 1982",
        },
    ],
}

CLUB_HERITAGE = [
    {
        "title": "Campo Dias Gonçalves",
        "emoji": "🏟️",
        "detail": (
            "Campo de jogos da ARDN, com lotação para 500 espectadores e dimensões de 90 × 50 metros. "
            "O recinto é propriedade da Casa do Povo de Nespereira, a quem a ARDN agradece o empréstimo e "
            "a cedência sempre que existe equipa de futebol inscrita e federada."
        ),
    },
    {
        "title": "Sede social e bar",
        "emoji": "🏠",
        "detail": "Beco da República, n.º 2, Travessa do Olho, n.º 1 · 6290-201 Nespereira, Gouveia.",
    },
]

CLUB_INSTITUTIONAL = [
    {
        "title": "Subsídios e orçamentos municipais",
        "date": "Anual",
        "detail": (
            "A ARDN beneficia historicamente de protocolos de cooperação, comparticipações financeiras e "
            "subsídios correntes e de investimento atribuídos anualmente pelo Município de Gouveia, no "
            "âmbito dos apoios ao associativismo desportivo, recreativo e cultural inscritos nos "
            "Orçamentos Municipais e nas Grandes Opções do Plano (GOP)."
        ),
    },
    {
        "title": "Contrato-programa n.º 349/2002",
        "date": "21 de janeiro de 2002",
        "detail": (
            "Contrato-programa celebrado com o Instituto Nacional do Desporto (IND), publicado no Diário "
            "da República, II Série, n.º 17, de 21 de janeiro de 2002, sob a presidência da direção de "
            "Aníbal José Cardoso Magina."
        ),
    },
    {
        "title": "Requalificação municipal do campo",
        "date": "22 de novembro de 2018",
        "detail": (
            "Subsídio extraordinário aprovado por unanimidade pela Câmara Municipal de Gouveia, no valor de "
            "1.800 €, para as obras urgentes de recuperação dos balneários e nivelamento do terreno do "
            "Campo Dias Gonçalves."
        ),
    },
]

CLUB_TIMELINE = [
    {"date": "1 de maio de 1982", "event": "Fundação do clube, originalmente sob a designação de Nespereira Futebol Clube."},
    {"date": "28 de setembro de 1982", "event": "Celebração da escritura de constituição e aprovação dos estatutos iniciais."},
    {"date": "19 de outubro de 1982", "event": "Publicação oficial da constituição no Diário da República, III Série, n.º 242."},
    {
        "date": "Outubro / novembro de 1993",
        "event": (
            "Processo arquivístico registado no antigo Governo Civil da Guarda "
            "(PT/SGMAI/GCGRD/H-B/001/00214), atestando a transição administrativa para a atual ARDN."
        ),
    },
    {"date": "21 de janeiro de 2002", "event": "Publicação do contrato-programa com o IND em Diário da República (II Série, n.º 17)."},
    {"date": "22 de novembro de 2018", "event": "Aprovação do subsídio municipal de 1.800 € para o Campo Dias Gonçalves."},
    {
        "date": "Épocas 1996 a 2024",
        "event": "Registo de participações oficiais nas competições distritais da Associação de Futebol da Guarda (AFG).",
    },
]

_MAGINA = "Aníbal José Cardoso Magina"
_LUCIANO_JESUS = "Luciano Jesus"
_MARCIO = "Marcio Almeida"

CLUB_SQUADS = [
    _squad("1996/1997", _MAGINA, [("Atletas", ["Pedro Cabral", "Sergio Garcia", "Pedro Pinto"])]),
    _squad("2000/2001", _MAGINA, [], coach="Luciano Garcia"),
    _squad("2001/2002", _MAGINA, [], coach="Luciano Garcia"),
    _squad(
        "2003/2004", _MAGINA,
        [
            ("Defesa", ["Rodrigo Fonseca"]),
            ("Fixo / Ala", ["João Alexandre"]),
            ("Médios", [
                "Paulo Real", "Francisco Rebelo", "Antonio Amaral", "Ricardo Araujo", "Marcio Almeida",
                "Fernando Rodrigues", "Artur Cabral", "Antonio Ferreira", "Pedro Nunes", "Nuno Magina",
                "Sandro Graca", "Nuno Ramos", "Antonio Santos", "Jose Mendonca", "Pepe", "Pedro Pinto",
                "Rui Costa", "Paulo Gomes", "Roberto Reis",
            ]),
            ("Universal", ["Joao Cabral", "Antonio Nascimento"]),
            ("Avançado", ["Ricardo Oeiras"]),
            ("Ala", ["Bruno Magina"]),
        ],
        coach="Luís Tomás",
    ),
    _squad(
        "2004/2005", _MAGINA,
        [
            ("Guarda-Redes", ["Sergio Bento"]),
            ("Defesa", ["Rodrigo Fonseca"]),
            ("Fixo / Ala", ["João Alexandre"]),
            ("Médios", [
                "João Melo", "Mauro Cruz", "Nuno Magina", "Andre Frade", "Daniel Bento", "Luis Gonçalves",
                "Paulo Moura", "Antonio Santos", "Marco Santos", "Jose Mendonca", "Pepe", "Pedro Pinto",
                "Gonçalo Oliveira", "Bruno Tavares", "Jose Costa", "Paulo Gomes", "Pedro Nunes",
                "Davide Santos", "Bruno Pessoa",
            ]),
            ("Ala", ["Bruno Magina"]),
        ],
        coach="Luís Tomás",
    ),
    _squad(
        "2005/2006", _MAGINA,
        [
            ("Guarda-Redes", ["Sergio Bento"]),
            ("Médios / Plantel", [
                "Luis Goncalves", "Bruno Pessoa", "Nuno Lopes", "Pepe", "Pedro Pinto", "Jose Costa",
                "Jose Morais", "Francisco Rebelo", "Rui Frade", "Andre Frade", "Daniel Bento",
                "Valter Ferreira", "Sergio Branquinho", "Jose Andrade", "Jorge Lageo", "Antonio Santos",
                "Tiago Costa", "Marco Santos", "Jose Mendonca",
            ]),
            ("Ala", ["Bruno Magina"]),
        ],
        coach="Luís Tomás",
    ),
    _squad(
        "2006/2007", _MAGINA,
        [
            ("Guarda-Redes", ["Sergio Bento"]),
            ("Médios / Plantel", [
                "Bruno Pinto", "Jorge Lageo", "Antonio Santos", "Tiago Costa", "Marco Santos",
                "Jose Mendonca", "Pepe", "Pedro Pinto", "Bruno Duarte", "Bruno Tavares", "José Costa",
                "Rui Frade", "Luis Osorio", "Fabio Santos", "Francisco Rebelo", "André Frade",
                "Daniel Bento", "Sergio Branquinho", "José Andrade", "Hugo Garcia",
            ]),
            ("Ala", ["Bruno Magina"]),
        ],
    ),
    _squad(
        "2007/2008", _MAGINA,
        [
            ("Guarda-Redes", ["Sergio Bento"]),
            ("Médios / Plantel", [
                "Emanuel Jesus", "Daniel Bento", "Tiago Costa", "António Santos", "Francisco Rebelo",
                "Fábio Santos", "Luís Osório", "António Ramos", "André Frade", "Pedro Norte",
                "Sergio Branquinho", "José Mendonça", "Pepe", "Pedro Pinto", "Bruno Duarte",
                "Bruno Tavares", "José Costa",
            ]),
            ("Avançado", ["Marcos Carvalho"]),
            ("Ala", ["Bruno Magina"]),
        ],
        coach="Luís Tomás",
        staff=["Beta (massagista)"],
    ),
    _squad(
        "2008/2009", _MAGINA,
        [
            ("Guarda-Redes", ["Sergio Bento", "Amarelo"]),
            ("Médios", [
                "António Branco", "Ricardo Rojão", "Avelino Morais", "Pepe", "Pedro Pinto", "Celso Jesus",
                "Bruno Tavares", "António Ramos", "Nelson Costa", "André Frade", "Diogo Boaventura",
                "Sergio Branquinho",
            ]),
            ("Avançado", ["Ricardo Pinto"]),
            ("Ala", ["Bruno Magina"]),
        ],
    ),
    _squad(
        "2009/2010", _MAGINA,
        [
            ("Guarda-Redes", ["Sérgio Bento", "Amarelo"]),
            ("Universal", ["João Lopes"]),
            ("Médios", [
                "Filipe Santos", "António Ramos", "Nelson Costa", "Roberto Silva", "Pedro Pinto",
                "Bruno Duarte", "Celso Jesus", "Bruno Tavares", "José Costa", "André Frade",
                "Sergio Branquinho", "Pepe",
            ]),
            ("Avançado", ["Ricardo Pinto"]),
            ("Ala", ["Bruno Magina"]),
        ],
    ),
    _squad(
        "2010/2011", _MAGINA,
        [
            ("Guarda-Redes", ["Sérgio Bento"]),
            ("Universal", ["João Lopes"]),
            ("Defesa", ["Isaac"]),
            ("Médios", [
                "Luis Rodrigues", "Sergio Branquinho", "Pedro Norte", "Roberto Silva", "Pedro Pinto",
                "Celso Jesus", "Bruno Tavares", "José Costa", "Luís Osório", "Andre Frade", "Pepe",
                "Brazete", "André Boino", "Bruno Pacheco",
            ]),
            ("Avançado", ["Ricardo Pinto"]),
            ("Ala", ["Bruno Magina"]),
        ],
    ),
    _squad(
        "2018/2019", _LUCIANO_JESUS,
        [
            ("Guarda-Redes", ["João Coelho"]),
            ("Defesa", ["André Morais", "Rodrigo Frade", "Pedro Henriques", "João Almeida", "Rui Filipe"]),
            ("Médios", [
                "Ricardo Cunha", "Ricardo Gaspar", "Gustavo", "Bruno Duarte", "Michael Eusebio",
                "Gabriel Soares", "Ivo Santos", "Carlos Garcia", "João Almeida", "Luis Correia",
                "António Nogueira", "Leandro Nascimento", "José Gaspar",
            ]),
            ("Fixo / Pivot", ["André Boino"]),
            ("Avançados", ["Ricardo Pinto", "Vasco Cantarinha"]),
        ],
    ),
    _squad(
        "2019/2020", _LUCIANO_JESUS,
        [
            ("Guarda-Redes", ["João Coelho"]),
            ("Defesa", ["Rodrigo Frade", "Pedro Henriques"]),
            ("Médios", [
                "Kennedy Silva", "Jose Gaspar", "Ângelo Barros", "Ricardo Magalhaes", "Bruno Sequeira",
                "Carlos Garcia", "Henrique Roliz", "Luis Correia", "Leandro Nascimento", "Pedro Ferreira",
                "Ricardo Almeida", "Ivo Santos", "João Fernandes", "Tiago Borges",
            ]),
            ("Avançado", ["Vasco Cantarinha"]),
        ],
    ),
    _squad(
        "2021/2022", _MARCIO,
        [
            ("Guarda-Redes", ["Luis Vianez"]),
            ("Defesa", ["Diogo Teodoro"]),
            ("Médios", [
                "Pedro Marques", "Hugo Martins", "Ricardo Almeida", "Leandro Nascimento", "Ivo Santos",
                "Vasco Borges", "João Fernandes", "Carlos Garcia", "Henrique Roliz", "Tiago Amaro",
                "Luis Correia", "Luis Aguiar", "António Nogueira", "Pedro Ferreira",
            ]),
            ("Avançados", ["Paulo Sérgio", "Ricardo Pinto", "Vasco Cantarinha"]),
        ],
    ),
    _squad(
        "2022/2023", _MARCIO,
        [
            ("Guarda-Redes", ["Hélder Pinto"]),
            ("Defesa", ["Stephan Ferreira", "Miguel Cabral", "João Fidalgo"]),
            ("Médios", [
                "Tiago Amaro", "Tiago Borges", "Simão Abreu", "João Madeira", "João Almeida",
                "Pedro Santiago", "Henrique Roliz", "João Fernandes", "Luis Correia", "Ivo Santos",
                "Luis Vianez", "Dinis Fidalgo", "Paulo Fernandes", "Sandro Andrade", "Diogo Saraiva",
            ]),
            ("Avançados", ["Roberto Silva", "Carlos Garcia", "Rui Lopes"]),
        ],
    ),
    _squad(
        "2023/2024", _MARCIO,
        [
            ("Guarda-Redes", ["Pedro Pinto", "Hélder Pinto"]),
            ("Defesa", ["Yannick Barai", "Bruno Almeida", "André Leitão", "Pedro Santiago", "Marco Mesquita"]),
            ("Médios", [
                "Edilson Tavares", "Luis Aguiar", "José", "Henrique Roliz", "Luis Correia", "Ivo Santos",
                "Luis Vianez", "Diogo Saraiva",
            ]),
            ("Avançados", ["Carlos Garcia", "Vasco Cantarinha", "Roberto Silva", "Bruno Lopes", "Edilson"]),
        ],
    ),
]

CLUB_PALMARES = [
    {"season": "2009/2010", "competition": "AF Guarda — 2.ª Divisão, Série B", "result": "3.º lugar"},
    {"season": "2010/2011", "competition": "AF Guarda — 2.ª Divisão, Série B", "result": "2.º lugar"},
    {"season": "2018/2019", "competition": "2.ª Divisão Distrital", "result": "5.º lugar"},
    {
        "season": "2019/2020",
        "competition": "Campeonato distrital · Taça da 2.ª Divisão (Série A) · Taça de Honra",
        "result": "4.º lugar · Vice-campeão · Oitavos de final",
    },
    {"season": "2021/2022", "competition": "2.ª Divisão Distrital", "result": "8.º lugar"},
    {"season": "2022/2023", "competition": "2.ª Divisão — Liga COPIALTA", "result": "7.º lugar"},
    {"season": "2023/2024", "competition": "2.ª Divisão Distrital", "result": "8.º lugar"},
]

CLUB_RESULTS = [
    {
        "season": "2009/2010",
        "summary": "3.º lugar — AF Guarda, 2.ª Divisão, Série B",
        "matches": _matches(
            "J1: (C) Manteigas | 0–1 (D)",
            "J2: (F) Teixeirense | 2–0 (V)",
            "J3: (F) Seia FC | 0–1 (D)",
            "J4: (C) ADRC Fornotelheiro | 4–1 (V)",
            "J5: (F) ARI Santa Comba | 1–2 (D)",
            "J6: (C) Abadense | 3–0 (V)",
            "J7: (F) Paços da Serra | 1–1 (E)",
            "J8: (F) Manteigas | 1–0 (V)",
            "J9: (C) Teixeirense | 1–2 (D)",
            "J10: (C) Seia FC | 2–0 (V)",
            "J11: (F) ADRC Fornotelheiro | 3–0 (V)",
            "J12: (C) ARI Santa Comba | 3–1 (V)",
            "J13: (F) Abadense | 3–3 (E)",
            "J14: (C) Paços da Serra | 2–2 (E)",
        ),
    },
    {
        "season": "2010/2011",
        "summary": "2.º lugar — AF Guarda, 2.ª Divisão, Série B",
        "matches": _matches(
            "J1: (F) AD São Romão | 2–1 (D)",
            "J2: (C) Teixeirense | 5–2 (V)",
            "J3: (F) Paços da Serra | 4–0 (D)",
            "J4: (C) SC Celoricense | 2–1 (V)",
            "J5: (F) ARI Santa Comba | 1–0 (D)",
            "J6: (C) Seia FC | 2–0 (V)",
            "J7: (F) Figueiró da Granja | 0–7 (V)",
            "J8: (C) Abadense | 3–0 (V)",
            "J10: (C) AD São Romão | 1–1 (E)",
            "J11: (F) Teixeirense | 0–1 (D)",
            "J12: (C) Paços da Serra | 2–1 (V)",
            "J13: (F) SC Celoricense | 0–1 (V)",
            "J14: (C) ARI Santa Comba | 1–0 (V)",
            "J15: (F) Seia FC | 1–1 (E)",
            "J16: (C) Figueiró da Granja | 3–1 (V)",
            "J17: (F) Abadense | 1–2 (V)",
        ),
    },
    {
        "season": "2018/2019",
        "summary": "5.º lugar — 2.ª Divisão Distrital (campeonato e taças)",
        "matches": _matches(
            "J1: (F) Freixo de Numão | 2–2 (E)",
            "J2: (C) FC Pala | 2–1 (V)",
            "J4: (F) Casal Cinza | 0–4 (V)",
            "J5: (C) ADC Castelos | 2–1 (V)",
            "J6: (F) GD Foz Côa | 2–0 (D)",
            "J7: (C) Paços da Serra | 0–0 (E)",
            "J8: (F) Guarda Desportiva | 2–0 (D)",
            "J9: (F) VF Naves | 1–3 (D)",
            "1/8 Taça Distrital: (C) ADC Castelos | 4–1 (V)",
            "J10: (C) Freixo de Numão | 1–2 (D)",
            "QF Taça 2.ª Divisão: (F) VF Naves | 1–0 (D)",
            "J11: (F) FC Pala | 0–2 (V)",
            "J13: (C) Casal Cinza | 1–0 (V)",
            "QF Taça Distrital: (C) Vila Cortez | 1–5 (D)",
            "J14: (F) ADC Castelos | 1–3 (V)",
            "J15: (C) GD Foz Côa | 0–1 (D)",
            "J16: (F) Paços da Serra | 1–3 (V)",
            "J17: (C) Guarda Desportiva | 1–3 (D)",
            "J18: (F) VF Naves | 3–0 (D)",
        ),
    },
    {
        "season": "2021/2022",
        "summary": "8.º lugar — 2.ª Divisão Distrital (campeonato e taças)",
        "matches": _matches(
            "J1 Taça: (C) Sp. Mêda | 2–0 (V)",
            "J2 Taça: (F) Ginásio Figueirense | 3–3 (E)",
            "J3 Taça: (C) Vilar Formoso | DA (D)",
            "J1: (F) Vilar Formoso | 0–0 (E)",
            "J2: (C) Ginásio Figueirense | 2–0 (V)",
            "J3: (F) Sp. Mêda | 4–0 (D)",
            "J4: (C) Paços da Serra | 3–2 (V)",
            "J5: (F) AD São Romão | DA (D)",
            "J6: (F) Manteigas | 4–2 (D)",
            "J7: (C) Os Vilanovenses | 0–2 (D)",
            "J8: (C) Vilar Formoso | 0–1 (D)",
            "J9: (F) Ginásio Figueirense | 4–1 (D)",
            "J10: (C) Sp. Mêda | 0–4 (D)",
            "J11: (F) Paços da Serra | 1–0 (D)",
            "J12: (C) AD São Romão | 2–3 (D)",
            "J13: (C) Manteigas | 3–1 (V)",
            "1/8 Taça Honra: (C) Pinhelenses | 3–3 (3-4 g.p.) (E)",
            "J14: (F) Os Vilanovenses | 7–0 (D)",
            "J4 Taça: (F) Sp. Mêda | DA (D)",
            "J5 Taça: (C) Ginásio Figueirense | 2–2 (E)",
            "J6 Taça: (F) Vilar Formoso | 3–0 (D)",
        ),
    },
    {
        "season": "2022/2023",
        "summary": "7.º lugar — 2.ª Divisão, Liga COPIALTA (campeonato e taças)",
        "matches": _matches(
            "J1: (F) Sp. Mêda | 3–0 (D)",
            "J11: (F) Desportiva do Soito | 6–4 (D)",
            "J3: (C) Casal Cinza | 1–0 (V)",
            "J4: (F) Paços da Serra | 0–2 (D)",
            "J6: (C) Manteigas | 1–2 (D)",
            "1PE Taça Honra: (F) Manteigas | 4–0 (D)",
            "J7: (C) Ginásio Figueirense | 2–1 (V)",
            "J8: (C) Vilar Formoso | 0–4 (D)",
            "J2: (C) Desportiva do Soito | 3–2 (V)",
            "J12: (C) Casal Cinza | 1–0 (V)",
            "J10: (F) Sp. Mêda | 0–1 (D)",
            "J13: (F) Paços da Serra | 6–0 (D)",
            "J15: (C) Manteigas | 1–1 (E)",
            "J16: (F) Ginásio Figueirense | 2–1 (V)",
            "J17: (C) Vilar Formoso | 5–0 (D)",
            "QF Taça: (C) Sp. Mêda | 0–2 (D)",
        ),
    },
    {
        "season": "2023/2024",
        "summary": "8.º lugar — 2.ª Divisão Distrital (campeonato e taças)",
        "matches": _matches(
            "J1: (F) Paços da Serra | 4–2 (D)",
            "J2: (C) Vilar Formoso | 3–4 (D)",
            "J3: (F) Desportiva do Soito | 1–1 (E)",
            "J4: (C) Guarda Unida | 1–2 (D)",
            "1PE Taça Honra: (F) Ginásio Figueirense | 6–1 (D)",
            "J6: (C) Gonçalense | 1–3 (D)",
            "J7: (F) Casal Cinza | 1–2 (V)",
            "J5: (F) CD Gouveia B | 2–0 (D)",
            "J8: (C) Ginásio Figueirense | 1–2 (D)",
            "J10: (C) Paços da Serra | 0–2 (D)",
            "J11: (F) Vilar Formoso | 6–0 (D)",
            "J12: (C) Desportiva do Soito | 2–1 (V)",
            "QF Taça: (C) Ginásio Figueirense | 1–1 (4-5 g.p.) (E)",
            "J13: (F) Guarda Unida | 1–2 (V)",
            "J14: (C) CD Gouveia B | 1–2 (D)",
            "J15: (F) Gonçalense | 4–0 (D)",
            "J16: (C) Casal Cinza | 0–0 (E)",
            "J17: (F) Ginásio Figueirense | 1–0 (D)",
        ),
    },
]

CLUB_TRADITIONS = [
    {
        "emoji": "⚽",
        "title": "Jogos amigáveis internacionais e aniversário",
        "detail": "Partidas comemorativas de prestígio, como o jogo amigável contra a equipa de Genebra (Suíça), inserido nos festejos do aniversário do clube.",
    },
    {
        "emoji": "🤝",
        "title": "Clássico «Casados vs. Solteiros»",
        "detail": "Tradicional encontro de futebol lúdico entre casados e solteiros da terra, seguido do habitual almoço comunitário.",
    },
    {
        "emoji": "☀️",
        "title": "Festa de Verão",
        "detail": "Celebração festiva tradicional de verão no Largo do Senhor dos Aflitos.",
    },
    {
        "emoji": "🏍️",
        "title": "Passeios de motas",
        "detail": "Encontros e passeios motorizados na região.",
    },
    {
        "emoji": "🎆",
        "title": "Passagem de Ano e Halloween",
        "detail": "Festas temáticas e convívios na sede da associação.",
    },
    {
        "emoji": "🎭",
        "title": "Desfile de Carnaval",
        "detail": "Representação institucional ativa nos desfiles organizados pelo Município de Gouveia.",
    },
    {
        "emoji": "🏰",
        "title": "Feira Medieval",
        "detail": "Registo de participação histórica no Largo do Pipo (Nespereira).",
    },
    {
        "emoji": "🃏",
        "title": "Torneios de jogos tradicionais e de salão",
        "detail": "Competições de sueca, matrecos e campeonato de damas.",
    },
    {
        "emoji": "🚴",
        "title": "Passeio de BTT de Nespereira",
        "detail": "Prova anual de ciclismo de montanha pelas encostas da Serra da Estrela, com apoio no Campo Dias Gonçalves.",
    },
    {
        "emoji": "🥪",
        "title": "Festa da Bifana",
        "detail": "Convívio gastronómico regular na sede.",
    },
]

CLUB_SOURCES = [
    {
        "title": "Diário da República Eletrónico",
        "year": "1982 · 2002",
        "url": "https://dre.pt",
        "note": "Estatutos fundacionais (III Série, n.º 242, de 19/10/1982) e contrato-programa com o Estado (II Série, n.º 17, de 21/01/2002).",
    },
    {
        "title": "Portal do Município de Gouveia",
        "year": "Anual",
        "url": "https://www.cm-gouveia.pt",
        "note": "Orçamentos, atas de Câmara, Grandes Opções do Plano (GOP) e Assembleia Municipal: subsídios anuais, apoios ao associativismo e requalificação urbana.",
    },
    {
        "title": "Zerozero — base de dados desportiva",
        "year": "1996–2024",
        "url": "https://www.zerozero.pt",
        "note": "Arquivo histórico de plantéis, treinadores, calendários e resultados oficiais da ARD Nespereira nas competições da AF Guarda.",
    },
    {
        "title": "Associação de Futebol da Guarda (AFG)",
        "year": "Época a época",
        "url": None,
        "note": "Comunicados oficiais, mapas de castigos, calendários e homologação de quadros competitivos.",
    },
    {
        "title": "Arquivo da Secretaria-Geral do Ministério da Administração Interna (Archeevo)",
        "year": "1993",
        "url": None,
        "note": "Consulta do processo do antigo Governo Civil da Guarda (referência PT/SGMAI/GCGRD/H-B/001/00214).",
    },
]

CLUB_HISTORY_TEXT = (
    "A Associação Recreativa e Desportiva de Nespereira (ARDN), NIF 503 018 112, nasceu a 1 de maio de "
    "1982 sob a designação de Nespereira Futebol Clube. A escritura de constituição foi celebrada a 28 de "
    "setembro de 1982 e os estatutos publicados no Diário da República, III Série, n.º 242, de 19 de "
    "outubro de 1982, definindo como objetivos o desenvolvimento físico, intelectual, cultural e "
    "desportivo dos associados.\n\n"
    "Com sede no Beco da República, n.º 2 (Travessa do Olho, n.º 1), em Nespereira, Gouveia, o clube "
    "cresceu a partir do futebol e hoje é também sala de convívio, bar e ponto de encontro de todas as "
    "gerações. Nos anos 90 a associação transitou administrativamente para a atual ARDN — processo "
    "registado no antigo Governo Civil da Guarda (PT/SGMAI/GCGRD/H-B/001/00214) em 1993.\n\n"
    "O clube tem disputado as competições distritais da Associação de Futebol da Guarda, com destaque "
    "para o 2.º lugar na 2.ª Divisão, Série B, em 2010/2011, o vice-campeonato da Taça da 2.ª Divisão "
    "(Série A) em 2019/2020 e a presença nos oitavos de final da Taça de Honra.\n\n"
    "A história recente escreve-se com o apoio do Município de Gouveia — protocolos de cooperação e "
    "subsídios anuais, o contrato-programa n.º 349/2002 com o Instituto Nacional do Desporto e o "
    "subsídio extraordinário de 1.800 € aprovado em 2018 para requalificar os balneários e nivelar o "
    "terreno do Campo Dias Gonçalves, cedido pela Casa do Povo de Nespereira.\n\n"
    "Das direções de Aníbal José Cardoso Magina às presidências de Luciano Jesus e Marcio Almeida, o "
    "que nunca mudou foi a alma comunitária: o clássico «Casados vs. Solteiros», a Festa de Verão no "
    "Largo do Senhor dos Aflitos, o Carnaval, a Feira Medieval, os passeios de motas e de BTT, os "
    "torneios de sueca e a Festa da Bifana."
)

CLUB_LEGACY = {
    "identity": CLUB_IDENTITY,
    "heritage": CLUB_HERITAGE,
    "institutional": CLUB_INSTITUTIONAL,
    "timeline": CLUB_TIMELINE,
    "squads": CLUB_SQUADS,
    "palmares": CLUB_PALMARES,
    "results": CLUB_RESULTS,
    "traditions": CLUB_TRADITIONS,
    "sources": CLUB_SOURCES,
    "history": CLUB_HISTORY_TEXT,
}

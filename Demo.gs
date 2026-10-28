/**
 * ==========================================================================
 * DEMONSTRAÇÃO — gera dados fictícios para testar o painel
 * ==========================================================================
 * Só funciona com MODO_DEMO = true (Config.exemplo.gs). Em produção a
 * constante não existe ou é false, e as funções abaixo se recusam a rodar.
 *
 * Os dados imitam a operação real, inclusive os problemas que a
 * consolidação precisa resolver:
 *   • dois formatos de planilha: o "antigo" (1º ano, só testes, cabeçalho
 *     com "Responsável" e "Responsável p/ Limpeza") e o "novo" (blocos de
 *     Testes, Manutenções e Suportes lado a lado, com títulos);
 *   • um ano sem receita preenchida (completada pela TABELA_PRECOS);
 *   • grafias diferentes para o mesmo modelo ("ONU X100" x "ONU-X100");
 *   • equipamentos que voltam: manutenção seguida de novo teste, e reusos;
 *   • equipamentos "(NOVO)", ferramentas, modelo vazio, testes de unidade
 *     externa, "Defeito" na coluna Responsável, datas com ano errado e uma
 *     tabela de resumo no fim do bloco de testes.
 *
 * FUNÇÕES:
 *   gerarDadosDemo()            → monta as abas em memória, roda a
 *                                 consolidação real e grava a aba Dados.
 *                                 Rápido; suficiente para ver o painel.
 *   gerarPlanilhasOrigemDemo()  → cria uma planilha por ano no Drive, com
 *                                 as abas JAN a DEZ, e preenche a aba
 *                                 Config. Depois rode
 *                                 executarConsolidacaoDiaria() para ver o
 *                                 fluxo completo, com Logs e e-mail.
 * ==========================================================================
 */

const DEMO_SEMENTE = 20240101;

const DEMO_PESSOAS = ["Ana S.", "Bruno Lima", "Carla", "Diego Rocha", "Elisa Prado", "Fábio Nunes"];

// Nome correto, grafias que aparecem nas planilhas e peso no sorteio.
const DEMO_EQUIPAMENTOS = [
  { nome: "ONU-X100", grafias: ["ONU-X100", "ONU-X100", "ONU X100"], peso: 30 },
  { nome: "ONU-X200 WIFI", grafias: ["ONU-X200 WIFI", "ONU-X200"], peso: 22 },
  { nome: "ROTEADOR-R1", grafias: ["ROTEADOR-R1", "ROTEADOR R1"], peso: 15 },
  { nome: "ROTEADOR-R2 AX", grafias: ["ROTEADOR-R2 AX", "RT-R2 AX"], peso: 12 },
  { nome: "BRIDGE-B10", grafias: ["BRIDGE-B10"], peso: 10 },
  { nome: "MESH-M5", grafias: ["MESH-M5", "MESH M5"], peso: 8 }
];

const DEMO_FERRAMENTAS = ["Clivador CX-1", "Power Meter PM-2", "Caneta VFL V3"];
const DEMO_DEFEITOS = [
  ["Não liga", "Troca da fonte"],
  ["Wi-Fi intermitente", "Troca da antena"],
  ["Carcaça quebrada", "Troca da carcaça"],
  ["Porta LAN sem link", "Ressolda do conector"],
  ["Firmware corrompido", "Regravação do firmware"]
];
const DEMO_SETORES = ["Campo", "NOC", "Comercial", "Estoque"];
const DEMO_SUPORTES = ["Homologação de modelo", "Dúvida de configuração", "Apoio em visita técnica", "Treinamento rápido"];

const DEMO_MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

// ---------------------------------------------------------------------
// Funções principais
// ---------------------------------------------------------------------
function gerarDadosDemo() {
  exigirModoDemo_();

  const inicio = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const linhas = [];
  const avisos = [];

  gerarAbasDemo_().forEach(({ ano, mes, grade }) => {
    const resultado = processarAbaMes(abaEmMemoria_(mes, grade), ano, mes);
    linhas.push(...resultado.linhas);
    avisos.push(...resultado.avisos);
  });

  escreverNaBancoDados(ss, linhas);

  Logger.log(`Demo: ${linhas.length} registros gravados na aba Dados em ${((new Date() - inicio) / 1000).toFixed(1)}s.`);
  Logger.log(`Demo: ${avisos.length} aviso(s) da consolidação (datas erradas, linhas descartadas etc.).`);
  avisos.slice(0, 30).forEach(a => Logger.log(a));
}

function gerarPlanilhasOrigemDemo() {
  exigirModoDemo_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const porAno = {};

  gerarAbasDemo_().forEach(item => {
    if (!porAno[item.ano]) porAno[item.ano] = [];
    porAno[item.ano].push(item);
  });

  const linhasConfig = [["Ano", "ID da planilha", "Ativa"]];

  Object.keys(porAno).sort().forEach(ano => {
    const planilha = SpreadsheetApp.create(`Bancada (demo) ${ano}`);
    const primeira = planilha.getSheets()[0];

    porAno[ano].forEach(({ mes, grade }, i) => {
      const aba = i === 0 ? primeira.setName(mes) : planilha.insertSheet(mes);
      aba.getRange(1, 1, grade.length, grade[0].length).setValues(grade);
    });

    linhasConfig.push([ano, planilha.getId(), "Sim"]);
    Logger.log(`Planilha de ${ano} criada: ${planilha.getUrl()}`);
  });

  let config = ss.getSheetByName("Config");
  if (!config) config = ss.insertSheet("Config");
  config.clear();
  config.getRange(1, 1, linhasConfig.length, 3).setValues(linhasConfig);
  config.getRange(1, 1, 1, 3).setFontWeight("bold");

  Logger.log("Aba Config preenchida. Agora rode executarConsolidacaoDiaria().");
}

function exigirModoDemo_() {
  if (typeof MODO_DEMO === "undefined" || MODO_DEMO !== true) {
    throw new Error(
      "As funções de demonstração apagam a aba Dados e só rodam com MODO_DEMO = true " +
      "(Config.exemplo.gs). Em produção, não use o Demo.gs."
    );
  }
}

// ---------------------------------------------------------------------
// Geração das abas (pura: não toca em planilha nenhuma)
// ---------------------------------------------------------------------
// Devolve [{ano, mes, grade}] em ordem cronológica. Os anos são os dois
// anteriores ao atual e o atual, até o mês corrente.
function gerarAbasDemo_(hojeParametro) {
  const hoje = hojeParametro || new Date();
  const anoAtual = hoje.getFullYear();
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual];
  const sorteio = criarSorteio_(DEMO_SEMENTE);

  const estado = {
    seriaisTestados: [],    // {serial, nome} na ordem em que foram testados
    retornosAgendados: [],  // {serial, nome, data} — volta para teste
    sorteio
  };

  const abas = [];

  anos.forEach((ano, indiceAno) => {
    const formatoAntigo = indiceAno === 0;
    const semReceita = indiceAno === 1;
    const ultimoMes = ano === anoAtual ? hoje.getMonth() : 11;

    for (let m = 0; m <= ultimoMes; m++) {
      const ultimoDia = ano === anoAtual && m === hoje.getMonth()
        ? Math.max(1, hoje.getDate() - 1)
        : diasNoMes_(ano, m);

      const registros = gerarRegistrosDoMes_(estado, ano, m, ultimoDia, indiceAno, formatoAntigo);

      const grade = formatoAntigo
        ? montarGradeAntiga_(registros, sorteio)
        : montarGradeNova_(registros, DEMO_MESES[m], semReceita, indiceAno === 2);

      abas.push({ ano: String(ano), mes: DEMO_MESES[m], grade });
    }
  });

  return abas;
}

function gerarRegistrosDoMes_(estado, ano, m, ultimoDia, indiceAno, formatoAntigo) {
  const s = estado.sorteio;
  const sazonal = 1 + 0.12 * Math.sin((m / 12) * 2 * Math.PI - 1);
  const base = [760, 880, 980][indiceAno];
  const qtdTestes = Math.round(base * sazonal * (0.85 + s.num() * 0.3) * (ultimoDia / diasNoMes_(ano, m)));
  const qtdManut = formatoAntigo ? 0 : Math.round(qtdTestes * (0.06 + s.num() * 0.05));
  const qtdSuporte = formatoAntigo ? 0 : Math.round((ultimoDia / diasNoMes_(ano, m)) * (12 + s.num() * 30));

  const fimDoMes = new Date(ano, m, ultimoDia);
  const testes = [];
  const manutencoes = [];
  const suportes = [];

  // 1) Equipamentos que voltam da manutenção neste mês.
  estado.retornosAgendados = estado.retornosAgendados.filter(r => {
    if (r.data > fimDoMes) return true;
    if (r.data.getFullYear() === ano && r.data.getMonth() === m) {
      testes.push(novoTeste_(s, r.data, r.nome, r.serial));
    }
    return false;
  });

  // 2) Testes do mês: novos, reusos vindos de campo e casos especiais.
  while (testes.length < qtdTestes) {
    const data = new Date(ano, m, 1 + s.int(ultimoDia));
    const x = s.num();

    if (x < 0.06 && estado.seriaisTestados.length > 200) {
      const antigo = s.item(estado.seriaisTestados);
      testes.push(novoTeste_(s, data, antigo.nome, antigo.serial));
    } else if (x < 0.08 && !formatoAntigo) {
      testes.push(novoTeste_(s, data, "ONU-X200 WIFI (NOVO)", serialDemo_(s)));
    } else if (x < 0.092) {
      testes.push(novoTeste_(s, data, s.item(DEMO_FERRAMENTAS), serialDemo_(s)));
    } else if (x < 0.098) {
      testes.push(novoTeste_(s, data, "", serialDemo_(s)));
    } else {
      const eq = sortearEquipamento_(s);
      const serial = serialDemo_(s);
      testes.push(novoTeste_(s, data, eq.nome, serial, s.item(eq.grafias)));
      estado.seriaisTestados.push({ serial, nome: eq.nome });
    }
  }

  // Testes de unidade externa: ignorados nos totais, aparecem no ranking.
  if (!formatoAntigo) {
    for (let i = 0; i < 8 + s.int(10); i++) {
      testes.push({
        data: new Date(ano, m, 1 + s.int(ultimoDia)),
        responsavel: "Bruno Lima (EXT)",
        modelo: "Testes UNIDADE EXTERNA",
        serial: serialDemo_(s),
        situacao: "Pronto para uso",
        nome: ""
      });
    }

    // Erros de digitação: ano trocado e "Defeito" na coluna Responsável.
    if (testes.length > 3) {
      testes[s.int(testes.length)].data = new Date(ano + 30, m, 5);
      if (s.num() < 0.4) testes[s.int(testes.length)].responsavel = "Defeito";
    }
  }

  // 3) Manutenções em equipamentos já testados; parte volta para teste.
  const recentes = estado.seriaisTestados.slice(-3000);
  for (let i = 0; i < qtdManut && recentes.length; i++) {
    const alvo = s.item(recentes);
    const data = new Date(ano, m, 1 + s.int(ultimoDia));
    const defeito = s.item(DEMO_DEFEITOS);

    manutencoes.push({
      data,
      responsavel: s.item(DEMO_PESSOAS),
      modelo: alvo.nome,
      serial: alvo.serial,
      defeito: defeito[0],
      conserto: defeito[1],
      situacao: "Pronto para uso",
      nome: alvo.nome
    });

    if (s.num() < 0.55) {
      const dias = 2 + Math.round(Math.pow(s.num(), 2) * 150);
      estado.retornosAgendados.push({
        serial: alvo.serial,
        nome: alvo.nome,
        data: new Date(data.getTime() + dias * 86400000)
      });
    }
  }

  // 4) Suportes: apoio a outros setores, sem modelo.
  for (let i = 0; i < qtdSuporte; i++) {
    suportes.push({
      data: new Date(ano, m, 1 + s.int(ultimoDia)),
      responsavel: s.item(DEMO_PESSOAS),
      descricao: s.item(DEMO_SUPORTES),
      setor: s.item(DEMO_SETORES)
    });
  }

  const porData = (a, b) => a.data - b.data;
  return {
    testes: testes.sort(porData),
    manutencoes: manutencoes.sort(porData),
    suportes: suportes.sort(porData)
  };
}

function novoTeste_(s, data, nome, serial, grafia) {
  return {
    data,
    responsavel: s.num() < 0.004 ? "" : s.item(DEMO_PESSOAS),
    modelo: grafia || nome,
    serial,
    situacao: "Pronto para uso",
    nome
  };
}

// ---------------------------------------------------------------------
// Formatos de aba
// ---------------------------------------------------------------------
// Formato antigo: só testes, cabeçalho na linha 1, com colunas parecidas
// ("Responsável" x "Responsável p/ Limpeza", "Data do Teste" x "Data da
// entrega") — o caso que a consolidação resolve dando prioridade ao nome
// exato.
function montarGradeAntiga_(registros, s) {
  const cab = [
    "Quem entregou", "Destino", "Modelo", "Mac", "Serial", "Firmware",
    "Data do Teste", "Responsável", "Situação do Equipamento", "Triagem",
    "Data da limpeza", "Responsável p/ Limpeza", "Responsável p/ Embalagem",
    "Data da entrega", "Receita gerada"
  ];

  const linhas = registros.testes.map(t => {
    const limpeza = new Date(t.data.getTime() + 86400000);
    return [
      "Estoque", s.item(["Cliente A", "Cliente B"]), t.modelo,
      t.serial.replace("SN", "MAC"), t.serial, "1." + s.int(9),
      t.data, t.responsavel, t.situacao, s.item(DEMO_PESSOAS),
      limpeza, s.item(DEMO_PESSOAS), s.item(DEMO_PESSOAS),
      "", precoDemo_(t.nome)
    ];
  });

  return [cab].concat(linhas);
}

// Formato novo: três blocos lado a lado (A–G testes, I–Q manutenções,
// S–X suportes), com títulos na linha 1 e cabeçalho na linha 2.
function montarGradeNova_(registros, mes, semReceita, comResumo) {
  const largura = 24;
  const vazia = () => new Array(largura).fill("");

  const titulos = vazia();
  titulos[0] = `TESTES DE EQUIPAMENTOS — ${mes}`;
  titulos[8] = `MANUTENÇÕES DE EQUIPAMENTOS — ${mes}`;
  titulos[18] = `RELATÓRIOS TÉCNICOS E SUPORTE — ${mes}`;

  const cab = [
    "Data", "Responsável", "Tipo", "Modelo/Ferramenta", "Serial/SN", "Situação/Status", "Receita (R$)", "",
    "Data", "Responsável", "Tipo", "Modelo/Ferramenta", "Serial/SN", "Defeito", "Conserto", "Situação/Status", "Receita (R$)", "",
    "Data", "Responsável", "Tipo", "Descrição", "Setor", "Observações"
  ];

  const blocoTestes = registros.testes.map(t => [
    t.data, t.responsavel, "Equipamento", t.modelo, t.serial, t.situacao,
    semReceita ? "" : precoDemo_(t.nome)
  ]);

  // Tabela de resumo no fim do bloco de testes (não é registro: a
  // consolidação descarta).
  if (comResumo) {
    const contagem = {};
    registros.testes.forEach(t => {
      if (t.responsavel) contagem[t.responsavel] = (contagem[t.responsavel] || 0) + 1;
    });
    blocoTestes.push(["", "", "", "", "", "", ""]);
    blocoTestes.push(["", "", "", "Responsável (Testes)", "Qtd", "", ""]);
    Object.keys(contagem).forEach(nome => blocoTestes.push(["", "", "", nome, contagem[nome], "", ""]));
  }

  const blocoManut = registros.manutencoes.map(r => [
    r.data, r.responsavel, "Equipamento", r.modelo, r.serial, r.defeito, r.conserto, r.situacao,
    semReceita ? "" : precoDemo_(r.nome)
  ]);

  const blocoSuporte = registros.suportes.map(r => [
    r.data, r.responsavel, "Suporte", r.descricao, r.setor, ""
  ]);

  const altura = Math.max(blocoTestes.length, blocoManut.length, blocoSuporte.length);
  const grade = [titulos, cab];

  for (let i = 0; i < altura; i++) {
    const linha = vazia();
    (blocoTestes[i] || []).forEach((v, j) => { linha[j] = v; });
    (blocoManut[i] || []).forEach((v, j) => { linha[8 + j] = v; });
    (blocoSuporte[i] || []).forEach((v, j) => { linha[18 + j] = v; });
    grade.push(linha);
  }

  return grade;
}

// ---------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------
// Sorteio reproduzível (mesma semente = mesmos dados).
function criarSorteio_(semente) {
  let a = semente >>> 0;
  const num = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    num,
    int: n => Math.floor(num() * n),
    item: lista => lista[Math.floor(num() * lista.length)]
  };
}

function sortearEquipamento_(s) {
  const total = DEMO_EQUIPAMENTOS.reduce((soma, e) => soma + e.peso, 0);
  let x = s.num() * total;
  for (const e of DEMO_EQUIPAMENTOS) {
    x -= e.peso;
    if (x < 0) return e;
  }
  return DEMO_EQUIPAMENTOS[0];
}

function serialDemo_(s) {
  let texto = "SN";
  for (let i = 0; i < 8; i++) texto += "0123456789ABCDEF".charAt(s.int(16));
  return texto;
}

function precoDemo_(nome) {
  const preco = TABELA_PRECOS[nome];
  return preco === undefined ? "" : preco;
}

function diasNoMes_(ano, m) {
  return new Date(ano, m + 1, 0).getDate();
}

// Aba "de mentira" com a mesma interface que processarAbaMes usa, para
// rodar a consolidação real sem criar planilhas.
function abaEmMemoria_(nome, grade) {
  const largura = Math.max(...grade.map(l => l.length));
  const celula = (r, c) => {
    const linha = grade[r];
    if (!linha || c >= linha.length) return "";
    const v = linha[c];
    return v === undefined || v === null ? "" : v;
  };
  const letraParaIndice = letras => {
    let n = 0;
    for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  const faixa = (r0, c0, nr, nc) => ({
    getValues: () => Array.from({ length: nr }, (_, i) =>
      Array.from({ length: nc }, (_, j) => celula(r0 + i, c0 + j)))
  });

  return {
    getName: () => nome,
    getLastRow: () => grade.length,
    getLastColumn: () => largura,
    getRange: (a, b, c, d) => {
      if (typeof a === "string") {
        const m = a.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
        const c0 = letraParaIndice(m[1]);
        const r0 = Number(m[2]) - 1;
        return faixa(r0, c0, Number(m[4]) - r0, letraParaIndice(m[3]) - c0 + 1);
      }
      return faixa(a - 1, b - 1, c || 1, d || 1);
    }
  };
}

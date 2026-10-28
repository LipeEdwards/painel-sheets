/**
 * ==========================================================================
 * PAINEL DA BANCADA — backend do web app (doGet)
 * ==========================================================================
 * Lê a aba Dados, aplica as regras de contagem e devolve os agregados que o
 * Index.html desenha.
 *
 * REGRAS DE CONTAGEM (as listas e nomes ficam no Config.gs):
 * • Testes de EQUIPAMENTO contam (totais, metas, ranking).
 *   - Equipamentos novos (MARCA_NOVO no nome) também contam, mas NÃO
 *     aparecem nas tabelas por modelo.
 *   - REUSO: a 1ª vez que um serial é testado é um teste novo; a partir da
 *     2ª vez (o equipamento voltou), o teste é um REUSO. Reuso continua
 *     contando na meta de testes; ele só aparece separado como informação.
 * • Testes com a coluna Modelo VAZIA não contam.
 * • Testes de FERRAMENTAS só contam com CONTAR_FERRAMENTAS = true.
 * • Testes de uma UNIDADE EXTERNA (responsável com "unidade" em
 *   RESPONSAVEIS_RENOMEAR) não contam nos totais; aparecem só no ranking.
 * • Suportes (apoio a outros setores) sempre contam e não dependem de
 *   modelo.
 * • Datas fora do período (ano a mais de 1 ano do ano da planilha, ou no
 *   futuro) ficam de fora dos cálculos de tempo; o registro continua
 *   contando no mês.
 * ==========================================================================
 */

const MESES = [
  { codigo: "JAN", ordem: 0, nome: "Janeiro" },
  { codigo: "FEV", ordem: 1, nome: "Fevereiro" },
  { codigo: "MAR", ordem: 2, nome: "Março" },
  { codigo: "ABR", ordem: 3, nome: "Abril" },
  { codigo: "MAI", ordem: 4, nome: "Maio" },
  { codigo: "JUN", ordem: 5, nome: "Junho" },
  { codigo: "JUL", ordem: 6, nome: "Julho" },
  { codigo: "AGO", ordem: 7, nome: "Agosto" },
  { codigo: "SET", ordem: 8, nome: "Setembro" },
  { codigo: "OUT", ordem: 9, nome: "Outubro" },
  { codigo: "NOV", ordem: 10, nome: "Novembro" },
  { codigo: "DEZ", ordem: 11, nome: "Dezembro" }
];

function doGet() {
  const template = HtmlService.createTemplateFromFile("Index");
  const dados = construirDadosDashboard();
  dados.config = configPainel_();
  template.dataJson = serializarDadosParaHtml_(dados);

  return template.evaluate()
    .setTitle("Dashboard — Bancada de Testes")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Só o que a tela precisa do Config.gs: metas e rótulos. Listas de
// modelos, preços e e-mail nunca vão para a página.
function configPainel_() {
  return {
    metasTestesMes: METAS_TESTES_MES,
    metasManutencaoMes: METAS_MANUTENCAO_MES,
    nomeUnidadeExterna: NOME_UNIDADE_EXTERNA,
    exemploBuscaModelo: EXEMPLO_BUSCA_MODELO,
    contarFerramentas: CONTAR_FERRAMENTAS
  };
}

function serializarDadosParaHtml_(dados) {
  return JSON.stringify(dados)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function texto_(valor) {
  return valor === null || valor === undefined
    ? ""
    : String(valor).trim();
}

function numero_(valor) {
  if (typeof valor === "number") return isFinite(valor) ? valor : 0;

  const texto = texto_(valor)
    .replace(/R\$|\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(texto) || 0;
}

function data_(valor) {
  if (
    Object.prototype.toString.call(valor) === "[object Date]" &&
    !isNaN(valor)
  ) {
    return new Date(valor.getTime());
  }

  const texto = texto_(valor);
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);

  const data = new Date(texto);
  return isNaN(data) ? null : data;
}

// Datas digitadas erradas na origem (ex.: ano 275760 ou 2052) geravam
// intervalos de milhares de dias nos cálculos de tempo. Uma data só é
// aceita se o ano dela estiver a no máximo 1 ano do ano da planilha
// (Origem) e se ela não estiver no futuro. Fora disso, a data é tratada
// como vazia: o registro continua contando no mês/ano, só não entra nos
// cálculos de tempo (retorno, tempo até nova manutenção, entre reusos).
function dataValida_(data, anoOrigem) {
  if (!data) return null;

  const anoData = data.getFullYear();
  const ano = Number(anoOrigem);

  if (ano && (anoData < ano - 1 || anoData > ano + 1)) return null;
  if (data.getTime() > Date.now() + 86400000) return null;

  return data;
}

// Diz se um nome de modelo é de equipamento novo ("(NOVO)").
function ehModeloNovo_(modelo) {
  return texto_(modelo).toUpperCase().indexOf(MARCA_NOVO) !== -1;
}

function ehFerramenta_(chave) {
  return (
    FERRAMENTAS.some(item => texto_(item).toUpperCase() === chave) ||
    FERRAMENTAS_CONTEM.some(termo => chave.indexOf(texto_(termo).toUpperCase()) !== -1)
  );
}

// Devolve o nome padronizado do modelo, ou null se o registro não deve
// contar no painel (modelo vazio, ignorado, ou ferramenta com
// CONTAR_FERRAMENTAS = false).
function normalizarModelo_(modeloBruto) {
  const textoOriginal = texto_(modeloBruto);
  const chave = textoOriginal.toUpperCase();

  if (!chave) return null;

  if (
    MODELOS_IGNORAR.some(
      item => texto_(item).toUpperCase() === chave
    )
  ) {
    return null;
  }

  if (
    MODELOS_IGNORAR_CONTEM.some(
      termo => chave.indexOf(texto_(termo).toUpperCase()) !== -1
    )
  ) {
    return null;
  }

  if (ehFerramenta_(chave)) {
    return CONTAR_FERRAMENTAS ? textoOriginal : null;
  }

  // Equipamento novo: conta, com o nome como veio (as tabelas por modelo
  // escondem esses nomes depois).
  if (ehModeloNovo_(chave)) return textoOriginal;

  const renomeioChave = Object.keys(MODELOS_RENOMEAR).find(
    origem => texto_(origem).toUpperCase() === chave
  );

  if (renomeioChave) return MODELOS_RENOMEAR[renomeioChave];

  for (let i = 0; i < MODELOS_SUFIXO_RENOMEAR.length; i++) {
    const regra = MODELOS_SUFIXO_RENOMEAR[i];
    const sufixo = texto_(regra.sufixo).toUpperCase();

    if (
      sufixo &&
      chave.indexOf(sufixo, chave.length - sufixo.length) !== -1
    ) {
      return regra.nomeFinal;
    }
  }

  for (let i = 0; i < MODELOS_CONTEM_RENOMEAR.length; i++) {
    const regra = MODELOS_CONTEM_RENOMEAR[i];
    const trecho = texto_(regra.contem).toUpperCase();

    if (trecho && chave.indexOf(trecho) !== -1) {
      return regra.nomeFinal;
    }
  }

  return textoOriginal;
}

// Chave de comparação: maiúsculas, sem acento, espaços únicos.
function chaveTexto_(valor) {
  return texto_(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

let responsaveisNormalizados_ = null;

function normalizarResponsavel_(responsavelBruto) {
  if (!responsaveisNormalizados_) {
    responsaveisNormalizados_ = {};
    Object.keys(RESPONSAVEIS_RENOMEAR).forEach(chave => {
      responsaveisNormalizados_[chaveTexto_(chave)] = RESPONSAVEIS_RENOMEAR[chave];
    });
  }

  const original = texto_(responsavelBruto) || "Não informado";
  const encontrado = responsaveisNormalizados_[chaveTexto_(original)];

  return encontrado
    ? { nome: encontrado.nome, unidade: encontrado.unidade || "" }
    : { nome: original, unidade: "" };
}

function normalizarTipo_(valor) {
  const tipo = texto_(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (tipo.indexOf("teste") !== -1) return "Teste";
  if (tipo.indexOf("manutenc") !== -1) return "Manutenção";
  if (tipo.indexOf("suporte") !== -1) return "Suporte";
  return texto_(valor);
}

// Normaliza o texto bruto da coluna "Mês" (ex.: "JAN", "Jan.", "janeiro")
// para um dos 12 códigos fixos de MESES, usando os 3 primeiros caracteres
// alfabéticos. Retorna null se não reconhecer o mês.
function normalizarMes_(mesBruto) {
  const limpo = texto_(mesBruto)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");

  if (!limpo) return null;

  const prefixo = limpo.slice(0, 3);
  return MESES.find(item => item.codigo === prefixo) || null;
}

function novoAno_(ano) {
  return {
    ano,
    testeQtd: 0,
    testeReusoQtd: 0,
    testeReceita: 0,
    manutencaoQtd: 0,
    manutencaoReceita: 0,
    suporteQtd: 0,
    outrosQtd: 0,
    modelos: {}
  };
}

function acumularAno_(ano, tipo, receita, modelo, reuso) {
  if (tipo === "Teste") {
    ano.testeQtd++;
    ano.testeReceita += receita;
    if (reuso) ano.testeReusoQtd++;
  } else if (tipo === "Manutenção") {
    ano.manutencaoQtd++;
    ano.manutencaoReceita += receita;
  } else if (tipo === "Suporte") {
    ano.suporteQtd++;
  } else {
    ano.outrosQtd++;
  }

  // Só Teste e Manutenção de equipamento entram na tabela de modelos
  // (equipamentos "(NOVO)" contam nos totais, mas não aparecem nela).
  if (tipo !== "Teste" && tipo !== "Manutenção") return;
  if (ehModeloNovo_(modelo)) return;

  if (!ano.modelos[modelo]) {
    ano.modelos[modelo] = {
      modelo,
      testes: 0,
      manutencoes: 0,
      receitaTestes: 0,
      receitaManutencoes: 0
    };
  }

  const item = ano.modelos[modelo];

  if (tipo === "Teste") {
    item.testes++;
    item.receitaTestes += receita;
  }

  if (tipo === "Manutenção") {
    item.manutencoes++;
    item.receitaManutencoes += receita;
  }
}

function novoMes_(ano, mesInfo) {
  return {
    ano,
    mes: mesInfo.codigo,
    mesOrdem: mesInfo.ordem,
    mesLabel: mesInfo.nome,
    testeQtd: 0,
    testeReusoQtd: 0,
    testeReceita: 0,
    manutencaoQtd: 0,
    manutencaoReceita: 0,
    suporteQtd: 0,
    outrosQtd: 0
  };
}

function acumularMes_(mes, tipo, receita, reuso) {
  if (tipo === "Teste") {
    mes.testeQtd++;
    mes.testeReceita += receita;
    if (reuso) mes.testeReusoQtd++;
  } else if (tipo === "Manutenção") {
    mes.manutencaoQtd++;
    mes.manutencaoReceita += receita;
  } else if (tipo === "Suporte") {
    mes.suporteQtd++;
  } else {
    mes.outrosQtd++;
  }
}

function finalizarMes_(mes) {
  return {
    ano: mes.ano,
    mes: mes.mes,
    mesOrdem: mes.mesOrdem,
    mesLabel: mes.mesLabel,
    testeQtd: mes.testeQtd,
    testeNovoQtd: mes.testeQtd - mes.testeReusoQtd,
    testeReusoQtd: mes.testeReusoQtd,
    testeReceita: mes.testeReceita,
    manutencaoQtd: mes.manutencaoQtd,
    manutencaoReceita: mes.manutencaoReceita,
    suporteQtd: mes.suporteQtd,
    total: mes.testeQtd + mes.manutencaoQtd + mes.suporteQtd,
    receitaTotal: mes.testeReceita + mes.manutencaoReceita,
    mediaTeste: mes.testeQtd ? mes.testeReceita / mes.testeQtd : 0,
    mediaManutencao: mes.manutencaoQtd
      ? mes.manutencaoReceita / mes.manutencaoQtd
      : 0
  };
}

function acumularRankingResponsavel_(
  ranking,
  responsavel,
  tipo,
  receita,
  unidade,
  reuso
) {
  if (!ranking[responsavel]) {
    ranking[responsavel] = {
      responsavel,
      testes: 0,
      testesReuso: 0,
      receitaTestes: 0,
      testesUnidade: 0,
      receitaTestesUnidade: 0,
      manutencoes: 0,
      receitaManutencoes: 0,
      suportes: 0,
      total: 0,
      receitaTotal: 0
    };
  }

  const item = ranking[responsavel];

  item.total++;
  item.receitaTotal += receita;

  if (tipo === "Teste") {
    item.testes++;
    item.receitaTestes += receita;
    if (reuso) item.testesReuso++;

    if (unidade) {
      item.testesUnidade++;
      item.receitaTestesUnidade += receita;
    }
  } else if (tipo === "Manutenção") {
    item.manutencoes++;
    item.receitaManutencoes += receita;
  } else if (tipo === "Suporte") {
    item.suportes++;
  }
}

function finalizarRankingResponsaveis_(ranking) {
  return Object.values(ranking).sort((a, b) => {
    if (b.testes !== a.testes) return b.testes - a.testes;
    return b.receitaTestes - a.receitaTestes;
  });
}

function pegarMapaRankingAno_(mapaGeral, ano) {
  if (!mapaGeral[ano]) mapaGeral[ano] = {};
  return mapaGeral[ano];
}

function construirDadosDashboard() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados");
  const atualizadoEm = new Date().toISOString();

  if (!aba) {
    return {
      resumo: [],
      anual: [],
      mensal: {},
      retornoResumo: {},
      porModeloManutencao: [],
      porModeloTeste: [],
      porModeloPorAno: {},
      porTecnico: [],
      rankingResponsaveis: [],
      rankingResponsaveisPorAno: {},
      atualizadoEm,
      erro: 'Aba "Dados" não encontrada.'
    };
  }

  const valores = aba.getDataRange().getValues();

  if (valores.length < 2) {
    return {
      resumo: [],
      anual: [],
      mensal: {},
      retornoResumo: {},
      porModeloManutencao: [],
      porModeloTeste: [],
      porModeloPorAno: {},
      porTecnico: [],
      rankingResponsaveis: [],
      rankingResponsaveisPorAno: {},
      atualizadoEm
    };
  }

  const indice = {};

  valores[0].forEach((nome, i) => {
    indice[String(nome).trim()] = i;
  });

  const obrigatorios = [
    "Origem (Ano)",
    "Tipo de Registro",
    "Mês",
    "Data",
    "Serial",
    "Responsável",
    "Modelo",
    "Receita (R$)"
  ];

  const faltando = obrigatorios.filter(c => indice[c] === undefined);

  if (faltando.length) {
    return {
      resumo: [],
      anual: [],
      mensal: {},
      retornoResumo: {},
      porModeloManutencao: [],
      porModeloTeste: [],
      porModeloPorAno: {},
      porTecnico: [],
      rankingResponsaveis: [],
      rankingResponsaveisPorAno: {},
      atualizadoEm,
      erro: "Colunas ausentes em Dados: " + faltando.join(", ")
    };
  }

  const resumoMapa = {};
  const anualMapa = {};
  const mensalMapa = {};
  const porSerial = {};
  const rankingResponsaveis = {};
  const rankingResponsaveisPorAnoMapa = {};

  // -------------------------------------------------------------------
  // ETAPA 1 — lê e padroniza cada linha da aba Dados.
  // -------------------------------------------------------------------
  const registros = [];
  let datasInvalidas = 0;

  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];
    const tipo = normalizarTipo_(linha[indice["Tipo de Registro"]]);

    if (!tipo) continue;

    const ano = texto_(linha[indice["Origem (Ano)"]]);
    const mes = texto_(linha[indice["Mês"]]).toUpperCase();
    const mesInfo = normalizarMes_(linha[indice["Mês"]]);

    const responsavelInfo = normalizarResponsavel_(
      linha[indice["Responsável"]]
    );

    const responsavel = responsavelInfo.nome;
    const unidade = responsavelInfo.unidade || "";

    // Suporte não tem modelo de equipamento (colunas S a X da aba do mês:
    // Data, Responsável, Tipo, Descrição, Setor, Observações). Por isso ele
    // NUNCA passa pelo filtro de modelos.
    const modelo = tipo === "Suporte"
      ? "Suporte"
      : normalizarModelo_(linha[indice["Modelo"]]);

    // Serial padronizado (maiúsculas, sem espaços) para "abc123" e
    // "ABC 123" serem reconhecidos como o mesmo equipamento.
    const serial = texto_(linha[indice["Serial"]]).toUpperCase().replace(/\s+/g, "");
    const receita = numero_(linha[indice["Receita (R$)"]]);
    const dataBruta = data_(linha[indice["Data"]]);
    const data = dataValida_(dataBruta, ano);

    if (dataBruta && !data && modelo !== null) datasInvalidas++;

    if (modelo === null) {
      // Testes de uma unidade externa (responsável com "unidade" no
      // Config.gs): não contam nos totais, só no ranking (colunas próprias).
      const ehTesteUnidadeExterna = Boolean(unidade) && tipo === "Teste";

      if (ehTesteUnidadeExterna) {
        acumularRankingResponsavel_(
          rankingResponsaveis, responsavel, tipo, receita, unidade, false
        );
        acumularRankingResponsavel_(
          pegarMapaRankingAno_(rankingResponsaveisPorAnoMapa, ano),
          responsavel, tipo, receita, unidade, false
        );
      }

      continue;
    }

    // Ordem no tempo, usada para saber qual teste veio primeiro. Sem data,
    // usa o 1º dia do mês da aba de origem.
    const ordemTempo = data
      ? data.getTime()
      : new Date(Number(ano) || 1970, mesInfo ? mesInfo.ordem : 0, 1).getTime();

    registros.push({
      linhaOrigem: i,
      ano, mes, mesInfo, tipo, responsavel, unidade,
      modelo, serial, receita, data, ordemTempo,
      reuso: false
    });
  }

  // -------------------------------------------------------------------
  // ETAPA 2 — marca os REUSOS: para cada serial, o 1º teste (no tempo) é
  // novo; os testes seguintes do mesmo serial são reuso.
  // -------------------------------------------------------------------
  const testesPorSerial = {};

  registros.forEach(r => {
    if (r.tipo !== "Teste" || !r.serial) return;
    if (!testesPorSerial[r.serial]) testesPorSerial[r.serial] = [];
    testesPorSerial[r.serial].push(r);
  });

  Object.keys(testesPorSerial).forEach(serial => {
    const testes = testesPorSerial[serial]
      .sort((a, b) => a.ordemTempo - b.ordemTempo || a.linhaOrigem - b.linhaOrigem);

    testes.forEach((r, posicao) => {
      r.reuso = posicao > 0;
      r.diasDesdeTesteAnterior = null;

      // Tempo até o reuso: dias entre este teste e o teste anterior do
      // mesmo serial. Só calcula quando as duas datas são válidas.
      if (r.reuso) {
        const anterior = testes[posicao - 1];
        if (r.data && anterior.data) {
          const dias = Math.round((r.data - anterior.data) / 86400000);
          if (dias >= 0) r.diasDesdeTesteAnterior = dias;
        }
      }
    });
  });

  // Resumo do reuso em todo o histórico (aba Retorno à bancada).
  const reusoResumo = { testes: 0, reusos: 0, dias: [] };

  // -------------------------------------------------------------------
  // ETAPA 3 — soma tudo.
  // -------------------------------------------------------------------
  registros.forEach(r => {
    const { ano, mes, mesInfo, tipo, responsavel, unidade, modelo, serial, receita, data, reuso } = r;

    const chave = [ano, mes, tipo, responsavel].join("|");

    if (!resumoMapa[chave]) {
      resumoMapa[chave] = {
        ano,
        mes,
        tipo,
        responsavel,
        quantidade: 0,
        receita: 0
      };
    }

    resumoMapa[chave].quantidade++;
    resumoMapa[chave].receita += receita;

    if (!anualMapa[ano]) {
      anualMapa[ano] = novoAno_(ano);
    }

    acumularAno_(anualMapa[ano], tipo, receita, modelo, reuso);

    if (tipo === "Teste") {
      reusoResumo.testes++;
      if (reuso) reusoResumo.reusos++;

      if (r.diasDesdeTesteAnterior !== null && r.diasDesdeTesteAnterior !== undefined) {
        reusoResumo.dias.push(r.diasDesdeTesteAnterior);
        if (!anualMapa[ano].diasReuso) anualMapa[ano].diasReuso = [];
        anualMapa[ano].diasReuso.push(r.diasDesdeTesteAnterior);
      }
    }

    if (mesInfo) {
      const chaveMensal = ano + "|" + mesInfo.codigo;

      if (!mensalMapa[chaveMensal]) {
        mensalMapa[chaveMensal] = novoMes_(ano, mesInfo);
      }

      acumularMes_(mensalMapa[chaveMensal], tipo, receita, reuso);
    }

    acumularRankingResponsavel_(
      rankingResponsaveis, responsavel, tipo, receita, unidade, reuso
    );

    acumularRankingResponsavel_(
      pegarMapaRankingAno_(rankingResponsaveisPorAnoMapa, ano),
      responsavel, tipo, receita, unidade, reuso
    );

    if (serial && data) {
      if (!porSerial[serial]) porSerial[serial] = [];

      porSerial[serial].push({
        ano,
        tipo,
        data,
        serial,
        modelo,
        responsavel
      });
    }
  });

  const analiseRetorno = calcularRetornos_(porSerial, anualMapa);

  // Equipamentos "(NOVO)" contam nos totais, mas não aparecem nas tabelas
  // por modelo.
  const semNovos = lista => (lista || []).filter(item => !ehModeloNovo_(item.modelo));

  analiseRetorno.porModeloManutencao = semNovos(analiseRetorno.porModeloManutencao);
  analiseRetorno.porModeloTeste = semNovos(analiseRetorno.porModeloTeste);
  Object.keys(analiseRetorno.porModeloPorAno).forEach(anoChave => {
    analiseRetorno.porModeloPorAno[anoChave] = semNovos(analiseRetorno.porModeloPorAno[anoChave]);
  });

  const anual = Object.keys(anualMapa)
    .sort()
    .map(ano => finalizarAno_(anualMapa[ano]));

  // Para cada ano com dados, monta os 12 meses em ordem fixa (Jan a Dez),
  // preenchendo com zero os meses sem nenhum registro, para o gráfico
  // de sazonalidade ficar contínuo.
  const mensal = {};

  Object.keys(anualMapa).forEach(ano => {
    mensal[ano] = MESES.map(info => {
      const chave = ano + "|" + info.codigo;
      const item = mensalMapa[chave] || novoMes_(ano, info);
      return finalizarMes_(item);
    });
  });

  const rankingResponsaveisPorAno = {};

  Object.keys(rankingResponsaveisPorAnoMapa).forEach(anoChave => {
    rankingResponsaveisPorAno[anoChave] = finalizarRankingResponsaveis_(
      rankingResponsaveisPorAnoMapa[anoChave]
    );
  });

  return {
    resumo: Object.keys(resumoMapa).map(chave => resumoMapa[chave]),
    anual,
    mensal,
    retornoResumo: analiseRetorno.resumo,
    reusoResumo: {
      testes: reusoResumo.testes,
      reusos: reusoResumo.reusos,
      taxaReuso: reusoResumo.testes ? reusoResumo.reusos / reusoResumo.testes : 0,
      mediaDias: mediaLista_(reusoResumo.dias),
      medianaDias: medianaLista_(reusoResumo.dias)
    },
    porModeloManutencao: analiseRetorno.porModeloManutencao,
    porModeloTeste: analiseRetorno.porModeloTeste,
    porModeloPorAno: analiseRetorno.porModeloPorAno,
    porTecnico: analiseRetorno.porTecnico,
    rankingResponsaveis: finalizarRankingResponsaveis_(rankingResponsaveis),
    rankingResponsaveisPorAno,
    datasInvalidas,
    atualizadoEm
  };
}

function calcularRetornos_(porSerial, anualMapa) {
  const resumo = {
    manutencoesAnalisadas: 0,
    retornaram: 0,
    naoRetornaram: 0,
    dias: []
  };

  // Pipeline de Manutenção e pipeline de Teste são mapas totalmente
  // independentes — cada um só existe (e só ganha uma entrada para um
  // modelo) quando aquele tipo de evento realmente ocorre. Nenhum dos
  // dois herda contagem do outro.
  const porModeloManutencaoMapa = {};
  const porModeloTesteMapa = {};
  const porTecnicoMapa = {};
  const porModeloAnoMapa = {};

  function pegarModeloManutencao_(modelo) {
    if (!porModeloManutencaoMapa[modelo]) {
      porModeloManutencaoMapa[modelo] = {
        modelo,
        equipamentos: 0,
        manutencoes: 0,
        retornaram: 0,
        naoRetornaram: 0,
        diasRetorno: []
      };
    }

    return porModeloManutencaoMapa[modelo];
  }

  function pegarModeloTeste_(modelo) {
    if (!porModeloTesteMapa[modelo]) {
      porModeloTesteMapa[modelo] = {
        modelo,
        equipamentos: 0,
        testes: 0,
        testesIniciais: 0,
        testesRetorno: 0,
        equipamentosComRetorno: 0,
        diasEntreRetornos: [],
        diasAteManutencao: []
      };
    }

    return porModeloTesteMapa[modelo];
  }

  function pegarTecnico_(responsavel) {
    if (!porTecnicoMapa[responsavel]) {
      porTecnicoMapa[responsavel] = {
        responsavel,
        testes: 0,
        manutencoes: 0,
        retornaram: 0,
        naoRetornaram: 0
      };
    }

    return porTecnicoMapa[responsavel];
  }

  function pegarModeloAno_(ano, modelo) {
    const chave = ano + "|" + modelo;

    if (!porModeloAnoMapa[chave]) {
      porModeloAnoMapa[chave] = {
        ano,
        modelo,
        seriais: new Set(),
        manutencoes: 0,
        retornaram: 0,
        naoRetornaram: 0,
        diasRetorno: [],
        testes: 0,
        diasAteManutencao: []
      };
    }

    return porModeloAnoMapa[chave];
  }

  // PASSO 1 — comum: resumo geral, ranking por técnico e detalhe por
  // modelo/ano. Precisa olhar Teste e Manutenção juntos porque "retorno"
  // é justamente a relação entre os dois eventos no tempo.
  Object.keys(porSerial).forEach(serial => {
    const eventos = porSerial[serial].sort((a, b) => a.data - b.data);
    const modelo = eventos[eventos.length - 1].modelo;

    eventos.forEach((evento, i) => {
      const tecnicoInfo = pegarTecnico_(evento.responsavel);
      const modeloAnoInfo = pegarModeloAno_(evento.ano, modelo);

      modeloAnoInfo.seriais.add(serial);

      if (evento.tipo === "Manutenção") {
        resumo.manutencoesAnalisadas++;
        tecnicoInfo.manutencoes++;
        modeloAnoInfo.manutencoes++;

        let encontrouTeste = false;

        for (let j = i + 1; j < eventos.length; j++) {
          if (eventos[j].tipo !== "Teste") continue;

          const dias = Math.round(
            (eventos[j].data - evento.data) / 86400000
          );

          if (dias < 0) break;

          encontrouTeste = true;
          resumo.retornaram++;
          resumo.dias.push(dias);
          tecnicoInfo.retornaram++;
          modeloAnoInfo.retornaram++;
          modeloAnoInfo.diasRetorno.push(dias);

          const ano = anualMapa[evento.ano];

          if (ano) {
            if (!ano.diasRetorno) ano.diasRetorno = [];
            ano.diasRetorno.push(dias);
          }

          break;
        }

        if (!encontrouTeste) {
          resumo.naoRetornaram++;
          tecnicoInfo.naoRetornaram++;
          modeloAnoInfo.naoRetornaram++;
        }
      }

      if (evento.tipo === "Teste") {
        tecnicoInfo.testes++;
        modeloAnoInfo.testes++;

        for (let j = i + 1; j < eventos.length; j++) {
          if (eventos[j].tipo !== "Manutenção") continue;

          const dias = Math.round(
            (eventos[j].data - evento.data) / 86400000
          );

          if (dias < 0) break;

          modeloAnoInfo.diasAteManutencao.push(dias);
          break;
        }
      }
    });
  });

  // PASSO 2 — pipeline independente de MANUTENÇÃO por modelo. Só entra
  // aqui quem tem pelo menos uma Manutenção; "equipamentos" conta só os
  // seriais que passaram por manutenção, não o total geral do modelo.
  Object.keys(porSerial).forEach(serial => {
    const eventos = porSerial[serial].sort((a, b) => a.data - b.data);
    const manutencoesDoSerial = eventos.filter(
      evento => evento.tipo === "Manutenção"
    );

    if (!manutencoesDoSerial.length) return;

    const modelo = eventos[eventos.length - 1].modelo;
    const modeloInfo = pegarModeloManutencao_(modelo);

    modeloInfo.equipamentos++;

    manutencoesDoSerial.forEach(evento => {
      modeloInfo.manutencoes++;

      const indice = eventos.indexOf(evento);
      let encontrouTeste = false;

      for (let j = indice + 1; j < eventos.length; j++) {
        if (eventos[j].tipo !== "Teste") continue;

        const dias = Math.round(
          (eventos[j].data - evento.data) / 86400000
        );

        if (dias < 0) break;

        encontrouTeste = true;
        modeloInfo.retornaram++;
        modeloInfo.diasRetorno.push(dias);
        break;
      }

      if (!encontrouTeste) modeloInfo.naoRetornaram++;
    });
  });

  // PASSO 3 — pipeline independente de TESTE por modelo. Só entra aqui
  // quem tem pelo menos um Teste; "equipamentos" conta só os seriais
  // testados, e o primeiro teste do histórico do serial é sempre
  // "inicial", os demais são "retorno".
  Object.keys(porSerial).forEach(serial => {
    const eventos = porSerial[serial].sort((a, b) => a.data - b.data);
    const testesDoSerial = eventos.filter(evento => evento.tipo === "Teste");

    if (!testesDoSerial.length) return;

    const modelo = eventos[eventos.length - 1].modelo;
    const modeloInfo = pegarModeloTeste_(modelo);

    modeloInfo.equipamentos++;

    if (testesDoSerial.length > 1) {
      modeloInfo.equipamentosComRetorno++;
    }

    testesDoSerial.forEach((teste, indiceTeste) => {
      modeloInfo.testes++;

      if (indiceTeste === 0) {
        modeloInfo.testesIniciais++;
      } else {
        modeloInfo.testesRetorno++;

        const dias = Math.round(
          (teste.data - testesDoSerial[indiceTeste - 1].data) / 86400000
        );

        if (dias >= 0) modeloInfo.diasEntreRetornos.push(dias);
      }

      const indiceGeral = eventos.indexOf(teste);

      for (let j = indiceGeral + 1; j < eventos.length; j++) {
        if (eventos[j].tipo !== "Manutenção") continue;

        const dias = Math.round(
          (eventos[j].data - teste.data) / 86400000
        );

        if (dias < 0) break;

        modeloInfo.diasAteManutencao.push(dias);
        break;
      }
    });
  });

  resumo.mediaDias = resumo.dias.length
    ? resumo.dias.reduce((soma, dias) => soma + dias, 0) /
      resumo.dias.length
    : null;

  resumo.taxaRetorno = resumo.manutencoesAnalisadas
    ? resumo.retornaram / resumo.manutencoesAnalisadas
    : 0;

  const media_ = lista =>
    lista.length
      ? lista.reduce((soma, dias) => soma + dias, 0) / lista.length
      : null;

  // Tabela de Manutenção por modelo — vem 100% da pipeline própria de
  // Manutenção (porModeloManutencaoMapa); não passa por porModeloTesteMapa
  // em nenhum momento, então já só contém modelos com manutenção real.
  const porModeloManutencao = Object.keys(porModeloManutencaoMapa)
    .map(modelo => {
      const item = porModeloManutencaoMapa[modelo];

      return {
        modelo: item.modelo,
        equipamentos: item.equipamentos,
        manutencoes: item.manutencoes,
        retornaram: item.retornaram,
        naoRetornaram: item.naoRetornaram,
        mediaDiasRetorno: media_(item.diasRetorno)
      };
    })
    .sort((a, b) => b.manutencoes - a.manutencoes);

  // Tabela de Teste por modelo — vem 100% da pipeline própria de Teste
  // (porModeloTesteMapa); já só contém modelos com teste real.
  const porModeloTeste = Object.keys(porModeloTesteMapa)
    .map(modelo => {
      const item = porModeloTesteMapa[modelo];

      return {
        modelo: item.modelo,
        equipamentos: item.equipamentos,
        testes: item.testes,
        testesIniciais: item.testesIniciais,
        testesRetorno: item.testesRetorno,
        equipamentosComRetorno: item.equipamentosComRetorno,
        mediaDiasEntreRetornos: media_(item.diasEntreRetornos),
        mediaDiasAteManutencao: media_(item.diasAteManutencao)
      };
    })
    .sort((a, b) => b.testes - a.testes);

  const porTecnico = Object.keys(porTecnicoMapa)
    .map(responsavel => {
      const item = porTecnicoMapa[responsavel];

      return {
        responsavel: item.responsavel,
        testes: item.testes,
        manutencoes: item.manutencoes,
        retornaram: item.retornaram,
        naoRetornaram: item.naoRetornaram,
        taxaRetorno: item.manutencoes
          ? item.retornaram / item.manutencoes
          : 0
      };
    })
    .sort(
      (a, b) =>
        (b.testes + b.manutencoes) -
        (a.testes + a.manutencoes)
    );

  const porModeloPorAno = {};

  Object.keys(porModeloAnoMapa).forEach(chave => {
    const item = porModeloAnoMapa[chave];

    if (!porModeloPorAno[item.ano]) porModeloPorAno[item.ano] = [];

    porModeloPorAno[item.ano].push({
      modelo: item.modelo,
      equipamentos: item.seriais.size,
      manutencoes: item.manutencoes,
      retornaram: item.retornaram,
      naoRetornaram: item.naoRetornaram,
      mediaDiasRetorno: media_(item.diasRetorno),
      testes: item.testes,
      mediaDiasAteManutencao: media_(item.diasAteManutencao)
    });
  });

  Object.keys(porModeloPorAno).forEach(ano => {
    porModeloPorAno[ano].sort((a, b) => b.manutencoes - a.manutencoes);
  });

  return {
    resumo,
    porModeloManutencao,
    porModeloTeste,
    porTecnico,
    porModeloPorAno
  };
}

function mediaLista_(lista) {
  return lista && lista.length
    ? lista.reduce((soma, v) => soma + v, 0) / lista.length
    : null;
}

function medianaLista_(lista) {
  if (!lista || !lista.length) return null;
  const ordenada = lista.slice().sort((a, b) => a - b);
  const meio = Math.floor(ordenada.length / 2);
  return ordenada.length % 2
    ? ordenada[meio]
    : (ordenada[meio - 1] + ordenada[meio]) / 2;
}

function finalizarAno_(ano) {
  const dias = (ano.diasRetorno || []).sort((a, b) => a - b);
  const meio = Math.floor(dias.length / 2);

  const mediana = !dias.length
    ? null
    : dias.length % 2
      ? dias[meio]
      : (dias[meio - 1] + dias[meio]) / 2;

  return {
    ano: ano.ano,
    testeQtd: ano.testeQtd,
    testeNovoQtd: ano.testeQtd - ano.testeReusoQtd,
    testeReusoQtd: ano.testeReusoQtd,
    testeReceita: ano.testeReceita,
    manutencaoQtd: ano.manutencaoQtd,
    manutencaoReceita: ano.manutencaoReceita,
    suporteQtd: ano.suporteQtd,
    total: ano.testeQtd + ano.manutencaoQtd + ano.suporteQtd,
    mediaTeste: ano.testeQtd
      ? ano.testeReceita / ano.testeQtd
      : 0,
    mediaManutencao: ano.manutencaoQtd
      ? ano.manutencaoReceita / ano.manutencaoQtd
      : 0,
    receitaTotal: ano.testeReceita + ano.manutencaoReceita,
    retornos: dias.length,
    mediaDiasRetorno: dias.length
      ? dias.reduce((soma, dias) => soma + dias, 0) / dias.length
      : null,
    medianaDiasRetorno: mediana,
    taxaRetorno: ano.manutencaoQtd
      ? dias.length / ano.manutencaoQtd
      : 0,
    // Reuso (lado do teste): testes de seriais que já tinham sido testados.
    taxaReuso: ano.testeQtd ? ano.testeReusoQtd / ano.testeQtd : 0,
    mediaDiasReuso: mediaLista_(ano.diasReuso),
    medianaDiasReuso: medianaLista_(ano.diasReuso),
    // Todos os modelos do ano (sem corte). O Index.html é quem limita a
    // quantidade exibida, depois de somar os anos e aplicar a busca.
    modelos: Object.keys(ano.modelos)
      .map(chave => ano.modelos[chave])
      .sort(
        (a, b) =>
          (b.testes + b.manutencoes) -
          (a.testes + a.manutencoes)
      )
  };
}
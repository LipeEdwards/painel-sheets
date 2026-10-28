/**
 * ==========================================================================
 * CONSOLIDAÇÃO DE PLANILHAS — Bancada de Testes
 * ==========================================================================
 * Lê as abas de mês (JAN a DEZ) de cada planilha de origem listada na aba
 * Config (Ano | ID da planilha | Ativa = Sim) e grava tudo, padronizado, na
 * aba Dados da planilha BancoDados.
 *
 * O QUE ELE FAZ EM CADA ABA DE MÊS:
 *   1. Acha a linha de cabeçalho (até a 4ª linha) pelos nomes das colunas.
 *   2. Separa os blocos Teste / Manutenção / Suporte pelos títulos acima do
 *      cabeçalho ou, sem títulos, por palavras-chave das colunas.
 *   3. Mapeia cada coluna para um campo (data, responsável, modelo…). Em
 *      cabeçalhos parecidos ("Responsável" x "Responsável p/ Limpeza"), o
 *      nome EXATO tem prioridade e, entre parecidos, vale o primeiro.
 *   4. Descarta linhas que não são registros (tabelas de resumo dentro da
 *      aba, linhas sem data e sem responsável, Responsável = "Defeito").
 *   5. Padroniza o nome do modelo (MAPA_MODELOS, no Config.gs) e preenche a
 *      receita vazia pelo preço do modelo (TABELA_PRECOS, no Config.gs).
 *   6. Avisa no log: modelo sem preço, data fora do período, aba ignorada.
 *
 * Toda a configuração específica da operação (modelos, preços, nomes,
 * metas, e-mail) fica no Config.gs. Este arquivo não tem dados internos.
 * ==========================================================================
 */

// ---------------------------------------------------------------------
// 1) APELIDOS DE CADA CAMPO — como o texto do cabeçalho pode aparecer
// ---------------------------------------------------------------------
const ALIASES_CAMPO = {
  data: ["data", "data do teste", "man / data", "man/data"],
  responsavel: ["responsavel", "man / responsavel", "man/responsavel"],
  modelo: ["modelo", "modelo do equipamento", "modelo/ferramenta"],
  serial: ["serial", "serial number", "manutencoes/sn", "serial/sn", "sn"],
  situacao: [
    "situacao", "situacao do equipamento", "situacao/status",
    "liberado para estoque"
  ],
  defeito: ["defeito"],
  conserto: ["conserto", "conserto realizado"],
  descricao: ["descricao"],
  setor: ["setor"],
  receita: ["receita", "receita gerada", "receita (r$)", "receita(r$)"]
};

const CABECALHOS_IGNORADOS = ["tipo", "observacoes"];

const GATILHOS_BLOCO = [
  { contem: ["man /", "man/"], bloco: "Manutenção" },
  { contem: ["defeito", "conserto", "liberado para estoque"], bloco: "Manutenção" },
  { contem: ["setor", "descricao", "observa"], bloco: "Suporte" }
];

const PALAVRAS_TITULO_BLOCO = [
  { contem: ["manuten"], bloco: "Manutenção" },
  { contem: ["suporte", "relat"], bloco: "Suporte" },
  { contem: ["teste"], bloco: "Teste" }
];

const ORDEM_BLOCOS = ["Teste", "Manutenção", "Suporte"];

const ABAS_IGNORADAS = [
  "dados", "config", "controle", "página6", "pagina6", "resumo",
  "consolidado", "graf.", "graf", "_log_backup"
];

const MESES_VALIDOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez"
];

const CABECALHO_BANCODADOS = [
  "Origem (Ano)", "Tipo de Registro", "Mês", "Data", "Responsável",
  "Modelo", "Serial", "Situação/Status", "Defeito", "Conserto",
  "Descrição", "Setor", "Receita (R$)"
];

// ---------------------------------------------------------------------
// 1.1) NORMALIZAÇÃO DE MODELO E TABELA DE PREÇOS
// ---------------------------------------------------------------------
// MAPA_MODELOS e TABELA_PRECOS ficam no Config.gs. Os índices normalizados
// (minúsculo, sem acento) são montados na PRIMEIRA vez que são usados, e não
// no carregamento do arquivo: no Apps Script a ordem em que os arquivos
// carregam segue a lista do editor, e este arquivo pode carregar antes do
// Config.gs.
let indicesConsolidacao_ = null;

function indicesConsolidacao() {
  if (!indicesConsolidacao_) {
    indicesConsolidacao_ = {
      modelos: construirIndiceNormalizado(MAPA_MODELOS),
      precos: construirIndiceNormalizado(TABELA_PRECOS)
    };
  }
  return indicesConsolidacao_;
}

function construirIndiceNormalizado(objetoOriginal) {
  const indice = {};
  for (const chave in objetoOriginal) {
    indice[normalizarTexto(chave)] = objetoOriginal[chave];
  }
  return indice;
}

// Recebe o texto de modelo como veio da planilha de origem e devolve o
// nome corrigido/padronizado (ou o próprio texto original, se não houver
// correção cadastrada em MAPA_MODELOS).
function normalizarModelo(valorOriginal) {
  const normalizado = normalizarTexto(valorOriginal);
  if (!normalizado) return "";
  const mapa = indicesConsolidacao().modelos;
  if (mapa[normalizado] !== undefined) {
    return mapa[normalizado];
  }
  return String(valorOriginal).trim();
}

// Recebe o modelo já corrigido (saída de normalizarModelo) e devolve o
// preço cadastrado em TABELA_PRECOS, ou null se não houver preço.
function buscarPrecoPorModelo(modeloCorrigido) {
  if (!modeloCorrigido) return null;
  const normalizado = normalizarTexto(modeloCorrigido);
  const preco = indicesConsolidacao().precos[normalizado];
  return preco !== undefined ? preco : null;
}

// ---------------------------------------------------------------------
// 2) FUNÇÃO PRINCIPAL
// ---------------------------------------------------------------------
function consolidarDados() {
  const inicioExecucao = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("Config");
  if (!configSheet) {
    throw new Error('Aba "Config" não encontrada na planilha BancoDados.');
  }

  const configRows = configSheet.getDataRange().getValues();
  const linhasConsolidadas = [];
  const avisos = [];
  const anosLidos = [];

  for (let i = 1; i < configRows.length; i++) {
    const [ano, idPlanilha, ativa] = configRows[i];
    if (!ano || !idPlanilha) continue;
    if (String(ativa).trim().toLowerCase() !== "sim") continue;

    const anoStr = String(ano).trim();

    let planilhaOrigem;
    try {
      planilhaOrigem = SpreadsheetApp.openById(String(idPlanilha).trim());
    } catch (e) {
      avisos.push(`Erro ao abrir planilha do ano ${anoStr}: ${e}`);
      continue;
    }

    anosLidos.push(anoStr);

    planilhaOrigem.getSheets().forEach((aba) => {
      const nomeAba = aba.getName().trim().toLowerCase();
      const ehMes = MESES_VALIDOS.some((m) => nomeAba.startsWith(m));
      const ignorada = ABAS_IGNORADAS.some((ig) => nomeAba === ig || nomeAba.startsWith(ig));
      if (!ehMes || ignorada) return;

      try {
        const resultado = processarAbaMes(aba, anoStr, aba.getName());
        linhasConsolidadas.push(...resultado.linhas);
        avisos.push(...resultado.avisos);
      } catch (e) {
        avisos.push(`Erro ao processar ${anoStr}/${aba.getName()}: ${e}`);
      }
    });
  }

  // Proteção: se nada foi lido (ex.: sem acesso às planilhas de origem),
  // NÃO apaga a aba Dados. Mantém os dados do dia anterior e acusa erro.
  if (linhasConsolidadas.length === 0) {
    throw new Error(
      "Nenhum registro foi lido das planilhas de origem. A aba Dados NÃO foi alterada. " +
      (avisos.length ? "Primeiro aviso: " + avisos[0] : "Confira a aba Config (coluna Ativa = Sim).")
    );
  }

  escreverNaBancoDados(ss, linhasConsolidadas);

  const duracaoSegundos = (new Date() - inicioExecucao) / 1000;
  Logger.log(
    `Concluído: ${linhasConsolidadas.length} registros em ${duracaoSegundos.toFixed(1)}s.`
  );
  if (avisos.length > 0) {
    Logger.log(`--- ${avisos.length} aviso(s) durante a execução ---`);
    avisos.forEach((a) => Logger.log(a));
  }

  // Resultado usado pelo Logs.gs (registro na aba Logs e e-mail).
  return {
    registros: linhasConsolidadas.length,
    avisos,
    anosLidos,
    duracaoSegundos
  };
}

// ---------------------------------------------------------------------
// 3) Processa uma aba de mês inteira: detecta cabeçalho, blocos e campos
// ---------------------------------------------------------------------
function processarAbaMes(aba, anoStr, nomeMes) {
  const avisos = [];
  const cabecalhoInfo = encontrarLinhaCabecalho(aba);
  if (!cabecalhoInfo) {
    avisos.push(`${anoStr}/${nomeMes}: não encontrei uma linha de cabeçalho reconhecível — aba ignorada.`);
    return { linhas: [], avisos };
  }

  const { linha: headerRow, valores: textosCabecalho } = cabecalhoInfo;

  const titulos = detectarTitulosDeBloco(aba, headerRow);
  const colBlockMap = titulos
    ? atribuirBlocosPorTitulo(textosCabecalho.length, titulos)
    : atribuirBlocosPorPalavraChave(textosCabecalho);

  const camposPorBloco = mapearCamposPorBloco(textosCabecalho, colBlockMap);

  const linhas = [];
  const semPreco = {};
  const primeiraLinhaDados = headerRow + 1;
  const ultimaLinhaAparente = aba.getLastRow();
  let descartadasAuxiliares = 0;

  ORDEM_BLOCOS.forEach((bloco) => {
    const campos = camposPorBloco[bloco];
    if (!campos) return;

    const colChave = campos.serial !== undefined ? campos.serial : campos.descricao;
    if (colChave === undefined) {
      avisos.push(`${anoStr}/${nomeMes} [${bloco}]: sem coluna Serial nem Descrição — bloco ignorado.`);
      return;
    }

    const indicesUsados = Object.values(campos);
    const minCol = Math.min(...indicesUsados);
    const maxCol = Math.max(...indicesUsados);
    const letraMin = indiceParaLetra(minCol);
    const letraMax = indiceParaLetra(maxCol);
    const letraChave = indiceParaLetra(colChave);

    const ultimaLinhaReal = encontrarUltimaLinhaReal(
      aba, letraChave, primeiraLinhaDados, ultimaLinhaAparente
    );
    if (ultimaLinhaReal < primeiraLinhaDados) return;

    const valoresBloco = aba
      .getRange(`${letraMin}${primeiraLinhaDados}:${letraMax}${ultimaLinhaReal}`)
      .getValues();

    valoresBloco.forEach((linhaValores) => {
      const pega = (nomeCampo) => {
        const colIdx = campos[nomeCampo];
        if (colIdx === undefined) return "";
        const valor = linhaValores[colIdx - minCol];
        return ehErroDeFormula(valor) ? "" : valor;
      };

      const data = pega("data");
      const responsavel = pega("responsavel");
      const modeloOriginal = pega("modelo");
      const modelo = normalizarModelo(modeloOriginal);
      const serial = pega("serial");
      const situacao = pega("situacao");
      const defeito = pega("defeito");
      const conserto = pega("conserto");
      const descricao = pega("descricao");
      const setor = pega("setor");
      let receita = pega("receita");

      const temAlgumDado = [data, responsavel, modelo, serial, situacao, descricao]
        .some((v) => v !== "" && v !== null);
      if (!temAlgumDado) return;

      // Tabelas auxiliares dentro da aba (ex.: resumo "Responsável (Testes)"
      // com nomes e quantidades) não são registros. Em Teste e Manutenção,
      // um registro de verdade sempre tem data ou responsável.
      if (bloco !== "Suporte") {
        const semData = data === "" || data === null;
        const semResponsavel = responsavel === "" || responsavel === null;
        const modeloEhCabecalho = normalizarTexto(modeloOriginal).indexOf("responsavel") === 0;

        if ((semData && semResponsavel) || modeloEhCabecalho) {
          descartadasAuxiliares++;
          return;
        }
      }

      // "Defeito" digitado na coluna Responsável no lugar de um nome: é um
      // equipamento com defeito registrado na coluna errada, não um
      // responsável. Esses registros são descartados.
      if (normalizarTexto(responsavel) === "defeito") {
        avisos.push(`${anoStr}/${nomeMes} [${bloco}]: linha descartada (Responsável="Defeito", serial ${serial || "?"}).`);
        return;
      }

      // Data digitada errada na origem (ano muito longe do ano da planilha
      // ou data no futuro). A linha é mantida, mas fica o aviso para
      // corrigir na planilha original — o painel ignora essa data nos
      // cálculos de tempo.
      if (dataForaDoPeriodo(data, anoStr)) {
        avisos.push(
          `${anoStr}/${nomeMes} [${bloco}]: data fora do período (${formatarData(data)}), ` +
          `serial ${serial || "?"}, responsável ${responsavel || "?"} — corrija na planilha de origem.`
        );
      }

      // Se a planilha de origem não trazia receita preenchida, completa
      // automaticamente com o preço cadastrado para o modelo.
      // Se já existir um valor vindo da origem, ele é mantido como está.
      if ((receita === "" || receita === null || receita === 0) && modelo) {
        const precoEncontrado = buscarPrecoPorModelo(modelo);
        if (precoEncontrado !== null) {
          receita = precoEncontrado;
        } else if (!modeloSemPrecoEsperado(modelo)) {
          // Um aviso por modelo e por bloco, com a quantidade de linhas,
          // em vez de um aviso por linha.
          const chave = bloco + "|" + modelo;
          semPreco[chave] = (semPreco[chave] || 0) + 1;
        }
      }

      linhas.push([
        anoStr, bloco, nomeMes, formatarData(data),
        responsavel || "", modelo || "", serial || "", situacao || "",
        defeito || "", conserto || "", descricao || "", setor || "",
        receita || ""
      ]);
    });
  });

  Object.keys(semPreco).forEach(chave => {
    const [bloco, modelo] = chave.split("|");
    avisos.push(
      `${anoStr}/${nomeMes} [${bloco}]: modelo "${modelo}" sem preço em TABELA_PRECOS — ` +
      `receita ficou vazia em ${semPreco[chave]} linha(s).`
    );
  });

  if (descartadasAuxiliares > 0) {
    avisos.push(`${anoStr}/${nomeMes}: ${descartadasAuxiliares} linha(s) sem data e sem responsável descartadas (tabela auxiliar ou linha incompleta).`);
  }

  return { linhas, avisos };
}

// ---------------------------------------------------------------------
// 4) Detecção de cabeçalho, blocos e campos
// ---------------------------------------------------------------------
function encontrarLinhaCabecalho(aba) {
  const ultimaColuna = Math.max(aba.getLastColumn(), 1);
  const linhasParaChecar = Math.min(4, aba.getLastRow());
  if (linhasParaChecar < 1) return null;

  const bloco = aba.getRange(1, 1, linhasParaChecar, ultimaColuna).getValues();

  let melhorLinha = -1;
  let melhorPontuacao = 0;

  bloco.forEach((valoresLinha, i) => {
    let pontuacao = 0;
    valoresLinha.forEach((texto) => {
      const normalizado = normalizarTexto(texto);
      if (normalizado && identificarCampo(normalizado)) pontuacao++;
    });
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhorLinha = i;
    }
  });

  if (melhorLinha === -1 || melhorPontuacao < 3) return null;

  return {
    linha: melhorLinha + 1,
    valores: bloco[melhorLinha]
  };
}

function detectarTitulosDeBloco(aba, headerRow) {
  if (headerRow <= 1) return null;

  const linhaTitulo = aba.getRange(headerRow - 1, 1, 1, aba.getLastColumn()).getValues()[0];
  const titulos = [];

  linhaTitulo.forEach((texto, colIdx) => {
    const normalizado = normalizarTexto(texto);
    if (!normalizado) return;

    for (const regra of PALAVRAS_TITULO_BLOCO) {
      if (regra.contem.some((palavra) => normalizado.indexOf(palavra) !== -1)) {
        titulos.push({ bloco: regra.bloco, colIdx });
        return;
      }
    }
  });

  if (titulos.length < 2) return null;

  titulos.sort((a, b) => a.colIdx - b.colIdx);
  return titulos;
}

function atribuirBlocosPorTitulo(totalColunas, titulos) {
  const mapa = new Array(totalColunas).fill(null);
  titulos.forEach((titulo, i) => {
    const inicio = titulo.colIdx;
    const fim = i + 1 < titulos.length ? titulos[i + 1].colIdx - 1 : totalColunas - 1;
    for (let c = inicio; c <= fim; c++) mapa[c] = titulo.bloco;
  });
  return mapa;
}

function atribuirBlocosPorPalavraChave(textosCabecalho) {
  const mapa = new Array(textosCabecalho.length).fill(null);
  let blocoAtual = "Teste";
  let indiceBlocoAtual = 0;

  textosCabecalho.forEach((texto, colIdx) => {
    const normalizado = normalizarTexto(texto);
    if (normalizado) {
      for (const gatilho of GATILHOS_BLOCO) {
        if (gatilho.contem.some((palavra) => normalizado.indexOf(palavra) !== -1)) {
          const indiceNovo = ORDEM_BLOCOS.indexOf(gatilho.bloco);
          if (indiceNovo > indiceBlocoAtual) {
            indiceBlocoAtual = indiceNovo;
            blocoAtual = gatilho.bloco;
          }
          break;
        }
      }
    }
    mapa[colIdx] = blocoAtual;
  });

  return mapa;
}

// Mapeia cada coluna do cabeçalho para um campo, separado por bloco.
// Regra para cabeçalhos parecidos ("Responsável", "Responsável p/ Limpeza",
// "Responsável p/ Embalagem"): o nome EXATO tem prioridade; entre nomes só
// parecidos, vale o primeiro da esquerda para a direita. Nunca sobrescreve
// um campo exato com um parecido.
function mapearCamposPorBloco(textosCabecalho, colBlockMap) {
  const camposPorBloco = {};
  const exatoPorBloco = {};

  textosCabecalho.forEach((texto, colIdx) => {
    const normalizado = normalizarTexto(texto);
    if (!normalizado) return;
    if (CABECALHOS_IGNORADOS.some((c) => normalizado === c)) return;

    const resultado = identificarCampoDetalhado(normalizado);
    if (!resultado) return;

    const { campo, exato } = resultado;
    const bloco = colBlockMap[colIdx] || "Teste";

    if (!camposPorBloco[bloco]) camposPorBloco[bloco] = {};
    if (!exatoPorBloco[bloco]) exatoPorBloco[bloco] = {};

    const jaTem = camposPorBloco[bloco][campo] !== undefined;
    const jaTemExato = exatoPorBloco[bloco][campo] === true;

    if (!jaTem || (exato && !jaTemExato)) {
      camposPorBloco[bloco][campo] = colIdx;
      exatoPorBloco[bloco][campo] = exato;
    }
  });

  return camposPorBloco;
}

// Como identificarCampo, mas diz também se o cabeçalho bateu EXATAMENTE
// com um apelido (exato: true) ou só contém um apelido (exato: false).
function identificarCampoDetalhado(textoNormalizado) {
  for (const campo in ALIASES_CAMPO) {
    if (ALIASES_CAMPO[campo].indexOf(textoNormalizado) !== -1) {
      return { campo, exato: true };
    }
  }
  for (const campo in ALIASES_CAMPO) {
    if (ALIASES_CAMPO[campo].some((apelido) => textoNormalizado.indexOf(apelido) !== -1)) {
      return { campo, exato: false };
    }
  }
  return null;
}

function identificarCampo(textoNormalizado) {
  for (const campo in ALIASES_CAMPO) {
    if (ALIASES_CAMPO[campo].indexOf(textoNormalizado) !== -1) return campo;
  }
  for (const campo in ALIASES_CAMPO) {
    if (ALIASES_CAMPO[campo].some((apelido) => textoNormalizado.indexOf(apelido) !== -1)) {
      return campo;
    }
  }
  return null;
}

function normalizarTexto(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------
// 5) Utilitários (letra de coluna, última linha real, erro de fórmula)
// ---------------------------------------------------------------------
function indiceParaLetra(indice0based) {
  let n = indice0based + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

function encontrarUltimaLinhaReal(aba, colChaveLetra, primeiraLinhaDados, ultimaLinhaAparente) {
  if (ultimaLinhaAparente < primeiraLinhaDados) return primeiraLinhaDados - 1;

  const coluna = aba
    .getRange(`${colChaveLetra}${primeiraLinhaDados}:${colChaveLetra}${ultimaLinhaAparente}`)
    .getValues();

  for (let i = coluna.length - 1; i >= 0; i--) {
    const valor = coluna[i][0];
    if (valor !== "" && valor !== null && !ehErroDeFormula(valor)) {
      return primeiraLinhaDados + i;
    }
  }
  return primeiraLinhaDados - 1;
}

function ehErroDeFormula(valor) {
  if (typeof valor !== "string") return false;
  return /^#(VALUE|N\/A|REF|DIV\/0|NAME\?|NULL|NUM)!?$/i.test(valor.trim());
}

// Modelos que não têm preço de propósito e não geram aviso: equipamentos
// novos (MARCA_NOVO) e os que o painel ignora (MODELOS_IGNORAR e
// MODELOS_IGNORAR_CONTEM, no Config.gs).
function modeloSemPrecoEsperado(modelo) {
  const texto = normalizarTexto(modelo);
  if (texto.indexOf(normalizarTexto(MARCA_NOVO)) !== -1) return true;
  if (MODELOS_IGNORAR.some(m => normalizarTexto(m) === texto)) return true;
  return MODELOS_IGNORAR_CONTEM.some(t => texto.indexOf(normalizarTexto(t)) !== -1);
}

// true se a data é válida como Date, mas o ano está a mais de 1 ano do
// ano da planilha de origem, ou se a data está no futuro.
function dataForaDoPeriodo(valor, anoStr) {
  if (Object.prototype.toString.call(valor) !== "[object Date]" || isNaN(valor)) {
    return false;
  }

  const anoData = valor.getFullYear();
  const ano = Number(anoStr);

  if (ano && (anoData < ano - 1 || anoData > ano + 1)) return true;
  return valor.getTime() > Date.now() + 86400000;
}

function formatarData(valor) {
  if (!valor) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return valor;
}

// ---------------------------------------------------------------------
// 6) Escreve o resultado consolidado na aba "Dados"
// ---------------------------------------------------------------------
function escreverNaBancoDados(ss, linhas) {
  let abaDados = ss.getSheetByName("Dados");
  if (!abaDados) {
    abaDados = ss.insertSheet("Dados");
  }

  abaDados.clear();

  abaDados.getRange(1, 1, 1, CABECALHO_BANCODADOS.length).setValues([CABECALHO_BANCODADOS]);
  abaDados.getRange(1, 1, 1, CABECALHO_BANCODADOS.length).setFontWeight("bold");

  if (linhas.length > 0) {
    abaDados.getRange(2, 1, linhas.length, CABECALHO_BANCODADOS.length).setValues(linhas);
  }
  abaDados.setFrozenRows(1);

  const ultimaLinhaNecessaria = linhas.length + 1;
  const ultimaLinhaAtual = abaDados.getMaxRows();
  if (ultimaLinhaAtual > ultimaLinhaNecessaria) {
    abaDados.deleteRows(ultimaLinhaNecessaria + 1, ultimaLinhaAtual - ultimaLinhaNecessaria);
  }
}

// ---------------------------------------------------------------------
// 7) (Opcional) Trigger diário — execute uma vez manualmente pra instalar
// ---------------------------------------------------------------------
// O gatilho chama executarConsolidacaoDiaria (no Logs.gs), que roda a
// consolidação, grava o resultado na aba Logs e envia o e-mail.
// Rodar esta função de novo é seguro: ela apaga os gatilhos antigos
// (inclusive o que chamava consolidarDados direto) antes de criar o novo.
function instalarTriggerDiario() {
  const funcoesAntigas = ["consolidarDados", "executarConsolidacaoDiaria"];

  ScriptApp.getProjectTriggers().forEach((t) => {
    if (funcoesAntigas.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("executarConsolidacaoDiaria")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log("Trigger diário instalado: executarConsolidacaoDiaria às 6h.");
}

/**
 * ==========================================================================
 * LISTAR MODELOS ÚNICOS DE UM ANO — auxiliar para montar TABELA_PRECOS
 * ==========================================================================
 * Cole esta função no MESMO arquivo do script de consolidação (ela
 * reaproveita encontrarLinhaCabecalho, detectarTitulosDeBloco, etc, que
 * já existem lá — não precisa duplicar nada).
 *
 * COMO USAR:
 * 1. No editor do Apps Script, selecione a função "listarModelosDoAno"
 *    no menu de funções (ao lado do botão "Executar").
 * 2. Execute.
 * 3. Veja o resultado em Ver > Registros de execução (Ctrl+Enter).
 *    Vai aparecer uma lista de modelos únicos encontrados, com a
 *    quantidade de registros de cada um.
 * 4. Ajuste o ANO_A_LISTAR abaixo (ou chame listarModelosDoAno("2025"))
 *    para rodar para outro ano.
 * ==========================================================================
 */

const ANO_A_LISTAR = "2024";

function listarModelosDoAno(anoParametro) {
  const anoAlvo = typeof anoParametro === "string" && anoParametro ? anoParametro : ANO_A_LISTAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("Config");
  if (!configSheet) {
    throw new Error('Aba "Config" não encontrada na planilha BancoDados.');
  }

  const configRows = configSheet.getDataRange().getValues();
  let idPlanilhaAlvo = null;

  for (let i = 1; i < configRows.length; i++) {
    const [ano, idPlanilha] = configRows[i];
    if (String(ano).trim() === anoAlvo) {
      idPlanilhaAlvo = String(idPlanilha).trim();
      break;
    }
  }

  if (!idPlanilhaAlvo) {
    throw new Error(`Ano ${anoAlvo} não encontrado na aba Config.`);
  }

  const planilhaOrigem = SpreadsheetApp.openById(idPlanilhaAlvo);
  const contagemModelos = {}; // { "modelo": quantidade }

  planilhaOrigem.getSheets().forEach((aba) => {
    const nomeAba = aba.getName().trim().toLowerCase();
    const ehMes = MESES_VALIDOS.some((m) => nomeAba.startsWith(m));
    const ignorada = ABAS_IGNORADAS.some((ig) => nomeAba === ig || nomeAba.startsWith(ig));
    if (!ehMes || ignorada) return;

    const cabecalhoInfo = encontrarLinhaCabecalho(aba);
    if (!cabecalhoInfo) {
      Logger.log(`${aba.getName()}: sem cabeçalho reconhecível, pulando.`);
      return;
    }

    const { linha: headerRow, valores: textosCabecalho } = cabecalhoInfo;
    const titulos = detectarTitulosDeBloco(aba, headerRow);
    const colBlockMap = titulos
      ? atribuirBlocosPorTitulo(textosCabecalho.length, titulos)
      : atribuirBlocosPorPalavraChave(textosCabecalho);

    const camposPorBloco = mapearCamposPorBloco(textosCabecalho, colBlockMap);

    const primeiraLinhaDados = headerRow + 1;
    const ultimaLinhaAparente = aba.getLastRow();

    ORDEM_BLOCOS.forEach((bloco) => {
      const campos = camposPorBloco[bloco];
      if (!campos || campos.modelo === undefined) return;

      const colModeloLetra = indiceParaLetra(campos.modelo);
      const colChave = campos.serial !== undefined ? campos.serial : campos.descricao;
      if (colChave === undefined) return;
      const colChaveLetra = indiceParaLetra(colChave);

      const ultimaLinhaReal = encontrarUltimaLinhaReal(
        aba, colChaveLetra, primeiraLinhaDados, ultimaLinhaAparente
      );
      if (ultimaLinhaReal < primeiraLinhaDados) return;

      const valoresModelo = aba
        .getRange(`${colModeloLetra}${primeiraLinhaDados}:${colModeloLetra}${ultimaLinhaReal}`)
        .getValues();

      valoresModelo.forEach((linha) => {
        const modelo = String(linha[0] || "").trim();
        if (!modelo || ehErroDeFormula(modelo)) return;
        contagemModelos[modelo] = (contagemModelos[modelo] || 0) + 1;
      });
    });
  });

  const listaOrdenada = Object.entries(contagemModelos)
    .sort((a, b) => b[1] - a[1]); // mais frequente primeiro

  Logger.log(`--- Modelos únicos encontrados em ${anoAlvo}: ${listaOrdenada.length} ---`);
  listaOrdenada.forEach(([modelo, qtd]) => {
    Logger.log(`${qtd}\t${modelo}`);
  });

  // Também deixa pronto no formato que vamos usar na TABELA_PRECOS,
  // pra você só copiar, colar e preencher os valores.
  Logger.log(`--- Modelo pronto para colar em TABELA_PRECOS (preencha os valores) ---`);
  const linhasTabela = listaOrdenada.map(([modelo]) => `  "${modelo}": 0, // ${contagemModelos[modelo]} registros`);
  Logger.log(`const TABELA_PRECOS = {\n${linhasTabela.join("\n")}\n};`);
}

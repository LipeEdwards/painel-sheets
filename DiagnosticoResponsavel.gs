/**
 * ==========================================================================
 * DIAGNÓSTICO — registros sem Responsável ("Não informado" no painel)
 * ==========================================================================
 * Cole este arquivo como um arquivo NOVO no Apps Script da planilha
 * BancoDados (Arquivo > + > Script). Ele não altera nada: só lê e mostra
 * o resultado no registro de execução.
 *
 * COMO USAR:
 * 1. Selecione a função "diagnosticarResponsavelVazio" e clique em Executar.
 * 2. Abra o Registro de execução para ver o resultado.
 *
 * O QUE ELE MOSTRA:
 * - PARTE 1: quantos registros sem responsável existem em cada Ano / Mês /
 *   Tipo, e quanto isso representa do total daquele mês.
 *     • Se um mês aparece com 100% vazio → a coluna tem outro nome naquela
 *       aba (problema de cabeçalho, resolve com uma linha no script).
 *     • Se aparece com poucos % → são linhas que realmente ficaram sem
 *       nome na planilha de origem (precisa preencher na origem).
 * - PARTE 2: para cada aba com 100% vazio, mostra as primeiras linhas do
 *   cabeçalho da planilha de origem, para descobrir como a coluna do
 *   responsável está escrita lá.
 * ==========================================================================
 */

const DIAG_LIMITE_TOTAL_VAZIO = 0.9; // a partir de 90% vazio, trata como problema de cabeçalho

function diagnosticarResponsavelVazio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaDados = ss.getSheetByName("Dados");
  if (!abaDados) throw new Error('Aba "Dados" não encontrada.');

  const valores = abaDados.getDataRange().getValues();
  const cabecalho = valores[0].map(c => String(c).trim());

  const col = nome => {
    const i = cabecalho.indexOf(nome);
    if (i === -1) throw new Error(`Coluna "${nome}" não encontrada em Dados.`);
    return i;
  };

  const cAno = col("Origem (Ano)");
  const cTipo = col("Tipo de Registro");
  const cMes = col("Mês");
  const cResp = col("Responsável");
  const cModelo = col("Modelo");

  // ---------------- PARTE 1: contagem por Ano / Mês / Tipo ----------------
  const grupos = {}; // chave "ano|mes|tipo" -> { total, vazios, modelos }

  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];
    const ano = String(linha[cAno]).trim();
    const mes = String(linha[cMes]).trim();
    const tipo = String(linha[cTipo]).trim();
    const resp = String(linha[cResp] ?? "").trim();
    const chave = [ano, mes, tipo].join("|");

    if (!grupos[chave]) grupos[chave] = { ano, mes, tipo, total: 0, vazios: 0, modelos: {} };

    const g = grupos[chave];
    g.total++;

    if (!resp) {
      g.vazios++;
      const modelo = String(linha[cModelo] ?? "").trim() || "(sem modelo)";
      g.modelos[modelo] = (g.modelos[modelo] || 0) + 1;
    }
  }

  const comVazio = Object.values(grupos)
    .filter(g => g.vazios > 0)
    .sort((a, b) => b.vazios - a.vazios);

  const totalVazios = comVazio.reduce((s, g) => s + g.vazios, 0);

  Logger.log(`=== PARTE 1 — ${totalVazios} registros sem Responsável ===`);
  Logger.log("Ano\tMês\tTipo\tVazios\tDo total\tPrincipais modelos");

  comVazio.forEach(g => {
    const pct = Math.round((g.vazios / g.total) * 100);
    const modelos = Object.entries(g.modelos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m, q]) => `${m} (${q})`)
      .join(", ");
    Logger.log(`${g.ano}\t${g.mes}\t${g.tipo}\t${g.vazios}\t${g.total} (${pct}%)\t${modelos}`);
  });

  // ---------------- PARTE 2: cabeçalho das abas 100% vazias ----------------
  const suspeitas = comVazio.filter(g => g.vazios / g.total >= DIAG_LIMITE_TOTAL_VAZIO);

  if (!suspeitas.length) {
    Logger.log("=== PARTE 2 — nenhuma aba inteira sem responsável. ===");
    Logger.log("Os vazios são linhas soltas: precisam ser preenchidos na planilha de origem.");
    return;
  }

  const idsPorAno = lerConfigDiagnostico_(ss);
  const abasJaMostradas = {};

  Logger.log(`=== PARTE 2 — cabeçalho das abas com ${Math.round(DIAG_LIMITE_TOTAL_VAZIO * 100)}%+ sem responsável ===`);

  suspeitas.forEach(g => {
    const chaveAba = g.ano + "|" + g.mes;
    if (abasJaMostradas[chaveAba]) return;
    abasJaMostradas[chaveAba] = true;

    const id = idsPorAno[g.ano];
    if (!id) {
      Logger.log(`${g.ano}/${g.mes}: ano não encontrado na aba Config.`);
      return;
    }

    let aba;
    try {
      aba = SpreadsheetApp.openById(id).getSheetByName(g.mes);
    } catch (e) {
      Logger.log(`${g.ano}/${g.mes}: erro ao abrir a planilha de origem (${e}).`);
      return;
    }

    if (!aba) {
      Logger.log(`${g.ano}/${g.mes}: aba "${g.mes}" não encontrada na planilha de origem.`);
      return;
    }

    const ultimaColuna = Math.max(aba.getLastColumn(), 1);
    const linhas = aba.getRange(1, 1, Math.min(4, aba.getLastRow()), ultimaColuna).getValues();

    Logger.log(`--- ${g.ano} / ${g.mes} ---`);
    linhas.forEach((linha, i) => {
      const textos = linha
        .map((v, c) => (String(v).trim() ? `${colunaParaLetraDiag_(c)}="${String(v).trim()}"` : ""))
        .filter(Boolean);
      if (textos.length) Logger.log(`Linha ${i + 1}: ${textos.join(" | ")}`);
    });
  });

  Logger.log("Procure nas linhas acima o título da coluna onde fica o nome de quem fez o teste.");
}

function lerConfigDiagnostico_(ss) {
  const config = ss.getSheetByName("Config");
  if (!config) throw new Error('Aba "Config" não encontrada.');

  const ids = {};
  config.getDataRange().getValues().slice(1).forEach(([ano, id]) => {
    if (ano && id) ids[String(ano).trim()] = String(id).trim();
  });
  return ids;
}

function colunaParaLetraDiag_(indice) {
  let n = indice + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

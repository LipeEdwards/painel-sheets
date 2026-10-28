/**
 * ==========================================================================
 * LOGS DA CONSOLIDAÇÃO — aba "Logs" + e-mail
 * ==========================================================================
 * O gatilho diário chama executarConsolidacaoDiaria(), que:
 *   1. roda consolidarDados() (do Consolidacao.gs);
 *   2. grava uma linha na aba "Logs" (a mais recente fica no topo);
 *   3. envia um e-mail com o resultado.
 *
 * STATUS POSSÍVEIS:
 *   • Sucesso  — rodou e não houve nada fora do normal.
 *   • Atenção  — rodou, mas alguma planilha/aba deu erro ao abrir/ler,
 *                ou o número de registros caiu muito em relação à
 *                execução anterior (pode indicar planilha de origem
 *                quebrada ou sem acesso).
 *   • Erro     — a consolidação parou. A aba Dados NÃO foi apagada.
 *
 * PRIMEIRA VEZ (obrigatório):
 *   1. Ajuste EMAIL_LOGS no Config.gs (ou deixe vazio para usar o e-mail
 *      da conta dona do script).
 *   2. Rode executarConsolidacaoDiaria manualmente uma vez e autorize o
 *      envio de e-mail quando o Google pedir.
 *   3. Rode instalarTriggerDiario (no Consolidacao.gs) para o gatilho das
 *      6h passar a chamar esta função.
 * ==========================================================================
 */

// EMAIL_LOGS, ENVIAR_EMAIL_SUCESSO e QUEDA_REGISTROS_ALERTA ficam no
// Config.gs.

// Nome da aba de logs na planilha BancoDados (maiúsculas não importam).
const NOME_ABA_LOGS = "Logs";

// Quantos avisos listar no corpo do e-mail (a lista completa fica na aba Logs).
const MAX_AVISOS_EMAIL = 40;

const CABECALHO_LOGS = [
  "Data/Hora", "Status", "Duração (s)", "Registros", "Diferença",
  "Anos lidos", "Avisos", "Mensagem", "Detalhes"
];

// ---------------------------------------------------------------------
// Função chamada pelo gatilho diário
// ---------------------------------------------------------------------
function executarConsolidacaoDiaria() {
  const inicio = new Date();
  const registrosAnteriores = lerRegistrosUltimaExecucao_();

  const log = {
    dataHora: inicio,
    status: "Sucesso",
    duracao: 0,
    registros: "",
    diferenca: "",
    anosLidos: "",
    avisos: [],
    mensagem: "",
    detalhes: ""
  };

  let erroOriginal = null;

  try {
    const resultado = consolidarDados();

    log.registros = resultado.registros;
    log.avisos = resultado.avisos || [];
    log.anosLidos = (resultado.anosLidos || []).join(", ");

    const motivosAtencao = [];

    const errosDeLeitura = log.avisos.filter(a => /^erro/i.test(a.trim()));
    if (errosDeLeitura.length) {
      motivosAtencao.push(`${errosDeLeitura.length} planilha(s)/aba(s) com erro de leitura`);
    }

    if (registrosAnteriores !== null) {
      log.diferenca = resultado.registros - registrosAnteriores;

      const queda = registrosAnteriores > 0
        ? (registrosAnteriores - resultado.registros) / registrosAnteriores
        : 0;

      if (queda >= QUEDA_REGISTROS_ALERTA) {
        motivosAtencao.push(
          `registros caíram ${Math.round(queda * 100)}% ` +
          `(de ${formatarNumeroLog_(registrosAnteriores)} para ${formatarNumeroLog_(resultado.registros)})`
        );
      }
    }

    if (motivosAtencao.length) {
      log.status = "Atenção";
      log.mensagem = "Consolidação concluída, mas: " + motivosAtencao.join("; ") + ".";
    } else {
      log.mensagem = `Consolidação concluída: ${formatarNumeroLog_(resultado.registros)} registros.`;
    }

    log.detalhes = log.avisos.join("\n");
  } catch (e) {
    erroOriginal = e;
    log.status = "Erro";
    log.mensagem = String(e && e.message ? e.message : e);
    log.detalhes = String(e && e.stack ? e.stack : e);
  }

  log.duracao = Math.round(((new Date() - inicio) / 1000) * 10) / 10;

  // Gravar e enviar nunca podem esconder o resultado: cada um tem seu try.
  try {
    registrarLog_(log);
  } catch (e) {
    Logger.log("Falha ao gravar na aba Logs: " + e);
  }

  try {
    if (log.status !== "Sucesso" || ENVIAR_EMAIL_SUCESSO) {
      enviarEmailLog_(log);
    }
  } catch (e) {
    Logger.log("Falha ao enviar e-mail de log: " + e);
  }

  // Repassa o erro para a execução aparecer como "Falha" no painel
  // Execuções do Apps Script.
  if (erroOriginal) throw erroOriginal;
}

// ---------------------------------------------------------------------
// Aba Logs
// ---------------------------------------------------------------------
function pegarAbaLogs_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const alvo = NOME_ABA_LOGS.trim().toLowerCase();

  let aba = ss.getSheets().find(s => s.getName().trim().toLowerCase() === alvo);
  if (!aba) aba = ss.insertSheet(NOME_ABA_LOGS);

  // Cabeçalho se a aba estiver vazia (ou se a linha 1 não for o cabeçalho).
  const primeiraCelula = aba.getLastRow() >= 1 ? String(aba.getRange(1, 1).getValue()).trim() : "";
  if (primeiraCelula !== CABECALHO_LOGS[0]) {
    if (aba.getLastRow() >= 1) aba.insertRowBefore(1);
    aba.getRange(1, 1, 1, CABECALHO_LOGS.length)
      .setValues([CABECALHO_LOGS])
      .setFontWeight("bold");
    aba.setFrozenRows(1);
  }

  return aba;
}

// Grava o log na linha 2 (mais recente no topo).
function registrarLog_(log) {
  const aba = pegarAbaLogs_();

  aba.insertRowAfter(1);

  // Uma célula do Sheets aceita até 50.000 caracteres.
  const detalhes = log.detalhes.length > 45000
    ? log.detalhes.slice(0, 45000) + "\n… (cortado)"
    : log.detalhes;

  aba.getRange(2, 1, 1, CABECALHO_LOGS.length).setValues([[
    log.dataHora,
    log.status,
    log.duracao,
    log.registros,
    log.diferenca,
    log.anosLidos,
    log.avisos.length,
    log.mensagem,
    detalhes
  ]]);

  aba.getRange(2, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  aba.getRange(2, 1, 1, CABECALHO_LOGS.length).setFontWeight("normal").setWrap(false);

  const cores = { "Sucesso": "#D9F2E6", "Atenção": "#FFF1C2", "Erro": "#F8D3D0" };
  aba.getRange(2, 2).setBackground(cores[log.status] || null).setFontWeight("bold");
}

// Nº de registros da última execução que NÃO deu erro, ou null.
function lerRegistrosUltimaExecucao_() {
  try {
    const aba = pegarAbaLogs_();
    if (aba.getLastRow() < 2) return null;

    const qtd = Math.min(aba.getLastRow() - 1, 60);
    const linhas = aba.getRange(2, 1, qtd, 4).getValues();

    for (let i = 0; i < linhas.length; i++) {
      const status = String(linhas[i][1]).trim();
      const registros = linhas[i][3];
      if (status !== "Erro" && typeof registros === "number" && registros > 0) {
        return registros;
      }
    }
  } catch (e) {
    Logger.log("Não foi possível ler a execução anterior: " + e);
  }
  return null;
}

// ---------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------
function enviarEmailLog_(log) {
  const destino = (EMAIL_LOGS || "").trim() || Session.getEffectiveUser().getEmail();
  if (!destino) {
    Logger.log("Sem e-mail de destino: preencha EMAIL_LOGS.");
    return;
  }

  const fuso = Session.getScriptTimeZone();
  const quando = Utilities.formatDate(log.dataHora, fuso, "dd/MM/yyyy 'às' HH:mm");
  const url = SpreadsheetApp.getActiveSpreadsheet().getUrl();

  const assunto = `[Painel da Bancada] ${log.status} — consolidação de ${quando}`;

  const cores = { "Sucesso": "#0E7C6B", "Atenção": "#B7791F", "Erro": "#B42318" };
  const cor = cores[log.status] || "#333333";

  const grupos = agruparAvisos_(log.avisos);
  const avisosPrioritarios = ordenarAvisosPorImportancia_(log.avisos).slice(0, MAX_AVISOS_EMAIL);
  const restantes = log.avisos.length - avisosPrioritarios.length;

  const linhaTabela = (rotulo, valor) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5B6863">${escaparHtml_(rotulo)}</td>` +
    `<td style="padding:4px 0"><b>${escaparHtml_(valor)}</b></td></tr>`;

  let html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#18211E;max-width:640px">
      <p style="font-size:18px;margin:0 0 4px"><b style="color:${cor}">${escaparHtml_(log.status)}</b> — consolidação da bancada</p>
      <p style="margin:0 0 16px;color:#5B6863">${escaparHtml_(quando)}</p>
      <p style="margin:0 0 16px">${escaparHtml_(log.mensagem)}</p>
      <table style="border-collapse:collapse;margin-bottom:16px">
        ${linhaTabela("Registros", log.registros === "" ? "—" : formatarNumeroLog_(log.registros))}
        ${linhaTabela("Diferença p/ execução anterior", log.diferenca === "" ? "—" : formatarDiferencaLog_(log.diferenca))}
        ${linhaTabela("Anos lidos", log.anosLidos || "—")}
        ${linhaTabela("Duração", log.duracao + " s")}
        ${linhaTabela("Avisos", formatarNumeroLog_(log.avisos.length))}
      </table>`;

  if (grupos.length) {
    html += `<p style="margin:0 0 6px"><b>Avisos por tipo</b></p><ul style="margin:0 0 16px;padding-left:20px">` +
      grupos.map(g => `<li>${escaparHtml_(g.tipo)}: ${formatarNumeroLog_(g.qtd)}</li>`).join("") +
      `</ul>`;
  }

  if (avisosPrioritarios.length) {
    html += `<p style="margin:0 0 6px"><b>Avisos</b> (erros, datas erradas e modelos sem preço primeiro)</p>
      <ul style="margin:0 0 8px;padding-left:20px;font-size:13px">` +
      avisosPrioritarios.map(a => `<li>${escaparHtml_(a)}</li>`).join("") +
      `</ul>`;
    if (restantes > 0) {
      html += `<p style="margin:0 0 16px;color:#5B6863;font-size:13px">… e mais ${formatarNumeroLog_(restantes)} aviso(s). A lista completa está na aba Logs.</p>`;
    }
  }

  if (log.status === "Erro") {
    html += `<p style="margin:16px 0 6px"><b>Detalhe do erro</b></p>
      <pre style="background:#F5F7F6;padding:10px;font-size:12px;white-space:pre-wrap">${escaparHtml_(log.detalhes)}</pre>
      <p style="color:#5B6863">A aba Dados não foi apagada: o painel continua mostrando os dados da última execução que deu certo.</p>`;
  }

  html += `<p style="margin-top:20px"><a href="${url}">Abrir a planilha BancoDados</a></p></div>`;

  const textoSimples =
    `${log.status} — consolidação de ${quando}\n\n${log.mensagem}\n\n` +
    `Registros: ${log.registros || "—"}\nAvisos: ${log.avisos.length}\n\n` +
    (log.status === "Erro" ? `Erro:\n${log.detalhes}\n\n` : "") +
    `Planilha: ${url}`;

  MailApp.sendEmail({
    to: destino,
    subject: assunto,
    body: textoSimples,
    htmlBody: html
  });
}

// Conta os avisos por tipo para o resumo do e-mail.
function agruparAvisos_(avisos) {
  const regras = [
    { tipo: "Erro ao abrir/ler planilha ou aba", teste: a => /^erro/i.test(a) },
    { tipo: "Modelo sem preço na tabela", teste: a => a.indexOf("sem preço") !== -1 },
    { tipo: "Data fora do período (corrigir na origem)", teste: a => a.indexOf("data fora do período") !== -1 },
    { tipo: "Linhas descartadas (sem data e sem responsável)", teste: a => a.indexOf("descartadas") !== -1 },
    { tipo: 'Linhas com Responsável = "Defeito"', teste: a => a.indexOf('Responsável="Defeito"') !== -1 },
    { tipo: "Aba ou bloco ignorado (cabeçalho não reconhecido)", teste: a => a.indexOf("ignorad") !== -1 }
  ];

  const contagem = {};
  avisos.forEach(a => {
    const regra = regras.find(r => r.teste(a));
    const tipo = regra ? regra.tipo : "Outros";
    contagem[tipo] = (contagem[tipo] || 0) + 1;
  });

  return Object.keys(contagem)
    .map(tipo => ({ tipo, qtd: contagem[tipo] }))
    .sort((a, b) => b.qtd - a.qtd);
}

// Erros primeiro, depois datas erradas e modelos sem preço, depois o resto.
function ordenarAvisosPorImportancia_(avisos) {
  const peso = a => {
    if (/^erro/i.test(a)) return 0;
    if (a.indexOf("data fora do período") !== -1) return 1;
    if (a.indexOf("sem preço") !== -1) return 2;
    return 3;
  };
  return avisos.slice().sort((a, b) => peso(a) - peso(b));
}

function formatarNumeroLog_(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

function formatarDiferencaLog_(n) {
  const v = Number(n || 0);
  return (v > 0 ? "+" : "") + v.toLocaleString("pt-BR");
}

function escaparHtml_(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

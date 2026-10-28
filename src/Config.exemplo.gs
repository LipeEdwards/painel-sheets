/**
 * ==========================================================================
 * CONFIGURAÇÃO DE EXEMPLO — Painel da Bancada (dados fictícios)
 * ==========================================================================
 * Mesmos campos do Config.gs usado em produção, com valores INVENTADOS:
 * modelos, preços, pessoas e metas não correspondem a nenhuma operação real.
 *
 * Para rodar a demonstração:
 *   1. Use este arquivo no lugar do Config.gs (o projeto deve ter só um
 *      dos dois, senão as constantes ficam declaradas duas vezes).
 *   2. Rode gerarDadosDemo() (Demo.gs) para criar a aba Dados fictícia,
 *      ou gerarPlanilhasOrigemDemo() para criar planilhas de origem e
 *      testar a consolidação completa.
 *   3. Implante como app da Web e abra o link.
 * ==========================================================================
 */

// Liga as funções do Demo.gs, que APAGAM e recriam a aba Dados. Fica
// false (ou ausente) no Config.gs de produção.
const MODO_DEMO = true;

// ---------------------------------------------------------------------
// METAS MENSAIS DA EQUIPE (soma de todos os responsáveis)
// ---------------------------------------------------------------------
const METAS_TESTES_MES = [800, 1000, 1200];
const METAS_MANUTENCAO_MES = [60, 90, 120];

// ---------------------------------------------------------------------
// LOGS E E-MAIL
// ---------------------------------------------------------------------
// Vazio = e-mail da conta dona do script.
const EMAIL_LOGS = "";
const ENVIAR_EMAIL_SUCESSO = true;
const QUEDA_REGISTROS_ALERTA = 0.2;

// ---------------------------------------------------------------------
// CONSOLIDAÇÃO: grafias de modelo e preços
// ---------------------------------------------------------------------
// Grafia variante (como aparece na planilha de origem) → nome correto.
const MAPA_MODELOS = {
  "ONU X100": "ONU-X100",
  "ONU-X200": "ONU-X200 WIFI",
  "ROTEADOR R1": "ROTEADOR-R1",
  "RT-R2 AX": "ROTEADOR-R2 AX",
  "MESH M5": "MESH-M5"
};

// Preço em R$ por modelo (nome já corrigido). Usado só quando a receita
// vem vazia da planilha de origem.
const TABELA_PRECOS = {
  "ONU-X100": 180.0,
  "ONU-X200 WIFI": 240.0,
  "ROTEADOR-R1": 150.0,
  "ROTEADOR-R2 AX": 320.0,
  "BRIDGE-B10": 210.0,
  "MESH-M5": 280.0,

  // Ferramentas (não contam no painel, mas evitam aviso no log)
  "Clivador CX-1": 90.0,
  "Power Meter PM-2": 300.0,
  "Caneta VFL V3": 50.0
};

// ---------------------------------------------------------------------
// PAINEL: o que conta e como os nomes aparecem
// ---------------------------------------------------------------------
const CONTAR_FERRAMENTAS = false;

// "Não informado" = coluna Modelo vazia.
const MODELOS_IGNORAR = ["Não informado", "Transferência de técnico"];

const MODELOS_IGNORAR_CONTEM = ["UNIDADE EXTERNA"];

const FERRAMENTAS = [];

const FERRAMENTAS_CONTEM = ["CLIVADOR", "POWER METER", "CANETA"];

const MARCA_NOVO = "NOVO";

// Nome padronizado exibido no painel (nome exato → nome final).
const MODELOS_RENOMEAR = {
  "BRIDGE-B10": "BRIDGE B10"
};

// Nome que TERMINA com o sufixo → nome final.
const MODELOS_SUFIXO_RENOMEAR = [
  { sufixo: "MESH M5", nomeFinal: "MESH-M5" }
];

// Nome que CONTÉM o trecho → nome final.
const MODELOS_CONTEM_RENOMEAR = [];

// Responsável como aparece na planilha → nome no painel.
const RESPONSAVEIS_RENOMEAR = {
  "ANA S.": { nome: "Ana Souza" },
  "CARLA": { nome: "Carla Dias" },
  "BRUNO LIMA (EXT)": { nome: "Bruno Lima", unidade: "EXT" }
};

const NOME_UNIDADE_EXTERNA = "Externa";

const EXEMPLO_BUSCA_MODELO = "ONU";

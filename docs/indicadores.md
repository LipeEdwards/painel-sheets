# Guia dos indicadores

Como cada número do painel é calculado. As metas, listas de modelos e nomes citados vêm do arquivo de configuração (`Config.gs` em produção, `Config.exemplo.gs` nesta demonstração).

## De onde vêm os dados

Uma planilha por ano, listada na aba Config (Ano, ID da planilha, Ativa = Sim). Cada aba de mês (JAN a DEZ) tem blocos de Testes, Manutenções e Suportes. Todo dia, às 6h, a consolidação lê essas abas e grava a aba Dados; o painel lê a aba Dados quando a página é aberta.

O mês e o ano de cada registro vêm da aba e da planilha de origem, não da data digitada.

## Glossário

| Termo | Significado |
| --- | --- |
| Teste | Registro no bloco de Testes da aba do mês |
| Teste novo | Primeiro teste registrado de um serial em todo o histórico |
| Reuso | Teste de um serial que já tinha sido testado antes; conta na meta |
| Manutenção | Registro no bloco de Manutenções |
| Retorno de manutenção | Manutenção seguida de um novo teste do mesmo serial, no mesmo dia ou depois |
| Suporte | Apoio a outros setores (homologações, dúvidas etc.) |
| Equipamentos | Quantidade de seriais diferentes |
| Receita | Valor da coluna Receita; quando vazio, o preço do modelo na tabela de preços. Suporte não gera receita |
| Mediano | Valor do meio: metade dos casos levou menos que isso, metade levou mais |

## Visão geral

| Indicador | Cálculo |
| --- | --- |
| Testes | Testes que contam pelas regras de negócio; entre parênteses, quantos foram reuso |
| Manutenções, Suportes | Quantidade no período do filtro |
| Receita total | Receita de testes + receita de manutenções |
| Manutenções que voltaram ao teste | Com um ano escolhido: retornos do ano ÷ manutenções do ano. Em todos os anos: retornos ÷ manutenções com serial e data |
| Tempo médio até voltar | Média de dias entre a manutenção e o próximo teste do mesmo serial |
| Média por teste | Receita de testes ÷ testes |
| Média por manutenção | Receita de manutenções ÷ manutenções |
| Total | Testes + manutenções + suportes |

## Mês a mês e metas

As metas são mensais e valem para a equipe inteira (soma de todos os responsáveis). Há três níveis para testes (`METAS_TESTES_MES`) e três para manutenções (`METAS_MANUTENCAO_MES`). Na demonstração: testes 800 / 1.000 / 1.200 e manutenções 60 / 90 / 120.

Para a meta de testes vale o total do mês, com os reusos incluídos.

| Texto na coluna de meta | Significado |
| --- | --- |
| ✓ 1.000, faltam 171 p/ 1.200 | Bateu a meta de 1.000 e ficou a 171 da próxima |
| Faltam 89 p/ 800 | Não bateu nenhuma meta; faltaram 89 para a primeira |
| ✓ todas | Bateu as três metas |
| — | Mês sem registro |

No gráfico de testes, cada barra soma testes novos (tom escuro) e reusos (tom claro). As linhas tracejadas são as metas.

## Comparar

- **Diferença** = Ano B − Ano A.
- **Variação** = (B − A) ÷ A × 100; "Novo" quando A é zero.
- ▲ verde e ▼ vermelho mostram a direção da mudança, não se ela é boa ou ruim.
- Quando um dos anos está em andamento, a opção "Comparar só de janeiro a ‹mês›" soma os mesmos meses nos dois anos.

## Modelos

| Tabela | Colunas |
| --- | --- |
| Modelos com mais movimento (segue o filtro) | Testes, manutenções, total e receita por modelo; 15 maiores, ou todos com a busca |
| Manutenção por modelo (todo o histórico) | Equipamentos com manutenção, manutenções, quantas retornaram, quantas não, tempo médio de retorno |
| Teste por modelo (todo o histórico) | Equipamentos testados, testes, novos, reusos, equipamentos com reuso, tempo médio entre reusos, tempo médio até nova manutenção |

Equipamentos "(NOVO)" contam nos totais, mas não aparecem nessas tabelas.

## Retorno à bancada

| Indicador | Cálculo |
| --- | --- |
| Manutenções analisadas | Manutenções com serial e data válida |
| Taxa de retorno | Manutenções que voltaram ao teste ÷ analisadas |
| Taxa de reuso | Reusos ÷ testes |
| Tempo médio até o reuso | Média de dias entre um reuso e o teste anterior do mesmo serial |

As tabelas por ano trazem também o tempo mediano, menos afetado por poucos casos longos: com retornos de 10, 12, 15, 20 e 300 dias, a média é 71 dias e a mediana, 15.

## Equipe

O ranking ordena por quantidade de testes (desempate pela receita de testes) e segue o filtro de ano. Nomes escritos de formas diferentes são unificados pela configuração; "Não informado" reúne registros com o responsável vazio. Testes de outra unidade aparecem em colunas próprias.

O retorno por técnico usa todo o histórico: manutenções do técnico que voltaram ao teste ÷ manutenções do técnico.

## Qualidade dos dados

- **Datas fora do período** (ano a mais de 1 ano do ano da planilha, ou no futuro): o registro conta no mês e na meta, mas fica fora dos cálculos de tempo. O rodapé do painel mostra quantos são; o log lista cada um.
- **Receita vazia:** preenchida pelo preço do modelo; modelo sem preço gera aviso.
- **Histórico do reuso:** começa no primeiro ano da base; antes disso, todo equipamento conta como novo.

| Status do log | Significado |
| --- | --- |
| Sucesso | Rodou sem nada fora do normal |
| Atenção | Rodou, mas houve erro de leitura em alguma planilha ou o volume caiu 20% ou mais |
| Erro | Parou; a aba Dados não é apagada |

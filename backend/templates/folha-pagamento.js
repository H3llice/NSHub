import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// HTML do PDF da Folha de pagamento (A4 deitado). Recebe a folha já com os itens
// que devem sair — o filtro por grupo/função é aplicado na rota, e `filtro` é só
// o texto que aparece no cabeçalho dizendo o que foi impresso.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'Logo-NS.png')

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Mesmos tópicos e ordem da tela (js/modules/folha-pagamento.js)
export const GRUPOS_FOLHA = [
  { id: 'base', titulo: 'Funcionários da base' },
  { id: 'tecnicos', titulo: 'Técnicos' },
  { id: 'estagiarios', titulo: 'Estagiários' }
]

// Mesmos rótulos de js/modules/funcoes-colaborador.js — inclui as funções
// antigas porque itens de folhas geradas antes guardam a função da época
const LABEL_FUNCAO = {
  gerente_operacional: 'Gerente Operacional',
  gerente_comercial: 'Gerente Comercial',
  gerente_administrativo: 'Gerente Administrativo',
  gerente_financeiro: 'Gerente Financeiro',
  auxiliar_manutencao: 'Auxiliar de Manutenção',
  assistente_administrativo: 'Assistente Administrativo',
  assistente_comercial: 'Assistente Comercial',
  tecnico_n1: 'Técnico de Manutenção N1',
  tecnico_n2: 'Técnico de Manutenção N2',
  tecnico_n3: 'Técnico de Manutenção N3',
  engenheiro: 'Engenheiro',
  estagiario: 'Estagiário',
  gerente: 'Gerente',
  tecnico: 'Técnico',
  vendedor: 'Vendedor',
  auxiliar: 'Auxiliar'
}

const TIPOS_CONTRATO = { mensalista: 'Mensalista', intermitente: 'Intermitente' }

// "Dias trab." só é preenchido pra intermitente (salário por dia no cadastro).
// Colunas de valor (R$), na ordem da tela
const CAMPOS_VALOR = [
  { campo: 'descontoPlanoSaude', titulo: 'Desc. plano de saúde' },
  { campo: 'auxilioMoradia', titulo: 'Auxílio moradia' },
  { campo: 'coparticipacaoPlanoSaude', titulo: 'Coparticip. plano' },
  { campo: 'ajudaCusto', titulo: 'Ajuda de custo' },
  { campo: 'provisaoAjudaCusto', titulo: 'Prov. adiant. ajuda de custo' },
  { campo: 'premio', titulo: 'Prêmio' },
  { campo: 'comissao', titulo: 'Comissão' }
]

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const moeda = valor => (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const soma = (itens, campo) => itens.reduce((acc, i) => acc + (i[campo] || 0), 0)

export const nomeMesFolha = folha => `${MESES[folha.mes - 1]}/${folha.ano}`

function linhaTotal(rotulo, itens, classe) {
  return `
    <tr class="${classe}">
      <td>${rotulo}</td>
      <td></td>
      <td class="centro">${soma(itens, 'diasDobra')}</td>
      <td class="centro">${itens.some(i => i.diasTrabalhados != null) ? soma(itens, 'diasTrabalhados') : '-'}</td>
      <td class="centro">${soma(itens, 'atestados')}</td>
      <td class="centro">${soma(itens, 'faltasNaoJustificadas')}</td>
      <td class="centro">${itens.filter(i => i.valeTransporte).length}</td>
      ${CAMPOS_VALOR.map(c => `<td class="num">${moeda(soma(itens, c.campo))}</td>`).join('')}
      <td></td>
    </tr>
  `
}

function secaoGrupo(grupo, itens) {
  return `
    <h2>${grupo.titulo} <span>(${itens.length})</span></h2>
    <table>
      <thead>
        <tr>
          <th style="width:15%;">Colaborador</th>
          <th style="width:12%;">Embarcado</th>
          <th style="width:4.5%;">Dobras</th>
          <th style="width:4.5%;">Dias trab.</th>
          <th style="width:4.5%;">Atest.</th>
          <th style="width:4.5%;">Faltas não just.</th>
          <th style="width:4.5%;">Vale-transp.</th>
          ${CAMPOS_VALOR.map(c => `<th style="width:6%;">${c.titulo}</th>`).join('')}
          <th>Observações</th>
        </tr>
      </thead>
      <tbody>
        ${itens.map(i => `
          <tr>
            <td>
              <strong>${escapeHtml(i.nome)}</strong><br>
              <small>${escapeHtml(LABEL_FUNCAO[i.funcao] || i.funcao)}${i.tipoContrato ? ' · ' + escapeHtml(TIPOS_CONTRATO[i.tipoContrato] || i.tipoContrato) : ''}</small>
            </td>
            <td>${i.diasEmbarcados > 0
              ? `${escapeHtml(i.embarques)}<br><small>${i.diasEmbarcados} ${i.diasEmbarcados === 1 ? 'dia' : 'dias'}</small>`
              : '-'}</td>
            <td class="centro">${i.diasDobra}</td>
            <td class="centro">${i.diasTrabalhados ?? '-'}</td>
            <td class="centro">${i.atestados ?? '-'}</td>
            <td class="centro">${i.faltasNaoJustificadas ?? '-'}</td>
            <td class="centro">${i.valeTransporte ? 'Sim' : 'Não'}</td>
            ${CAMPOS_VALOR.map(c => `<td class="num">${i[c.campo] != null ? moeda(i[c.campo]) : '-'}</td>`).join('')}
            <td>${escapeHtml(i.observacoes)}</td>
          </tr>
        `).join('')}
        ${linhaTotal('Total', itens, 'total')}
      </tbody>
    </table>
  `
}

// folha: FolhaPagamento com `itens` (já filtrados). filtro: texto do que foi
// impresso ("Técnicos"...) ou null quando é a folha inteira.
export function htmlFolhaPagamento(folha, filtro) {
  const logoBase64 = fs.existsSync(LOGO_PATH)
    ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
    : ''

  const secoes = GRUPOS_FOLHA
    .map(g => ({ grupo: g, itens: folha.itens.filter(i => i.grupo === g.id) }))
    .filter(s => s.itens.length > 0)

  const situacao = folha.status === 'fechada'
    ? `Fechada em ${new Date(folha.fechadaEm).toLocaleDateString('pt-BR')}`
    : 'Aberta (valores ainda podem mudar)'

  return `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; }

        .cabecalho { display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid #000; padding-bottom: 6pt; margin-bottom: 4pt; }
        .cabecalho img { height: 30pt; }
        .cabecalho h1 { font-size: 14pt; }
        .cabecalho .info { text-align: right; font-size: 8pt; line-height: 1.4; }

        h2 { font-size: 10pt; margin: 12pt 0 4pt; }
        h2 span { font-weight: normal; color: #555; }

        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #000; padding: 3pt 4pt; vertical-align: top; word-wrap: break-word; }
        th { background: #e9e9e9; font-size: 7.5pt; text-align: center; vertical-align: middle; }
        small { color: #444; font-size: 7pt; }
        .centro { text-align: center; }
        .num { text-align: right; white-space: nowrap; }
        tr { page-break-inside: avoid; }
        tr.total td { font-weight: bold; background: #f3f3f3; }
        tr.geral td { font-weight: bold; background: #dcdcdc; }

        .vazio { margin-top: 20pt; text-align: center; color: #555; font-size: 10pt; }
      </style>
    </head>
    <body>

      <div class="cabecalho">
        ${logoBase64 ? `<img src="${logoBase64}">` : '<span></span>'}
        <h1>Folha de pagamento — ${nomeMesFolha(folha)}</h1>
        <div class="info">
          ${filtro ? `<strong>Somente: ${escapeHtml(filtro)}</strong>` : '<strong>Folha completa</strong>'}<br>
          ${situacao}<br>
          Gerado em ${new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>

      ${secoes.length === 0
        ? '<div class="vazio">Nenhum colaborador nesta seleção.</div>'
        : secoes.map(s => secaoGrupo(s.grupo, s.itens)).join('')}

      ${secoes.length > 1 ? `
        <h2>Total geral <span>(${folha.itens.length})</span></h2>
        <table>
          <colgroup>
            <col style="width:15%;"><col style="width:12%;">${'<col style="width:4.5%;">'.repeat(5)}
            ${CAMPOS_VALOR.map(() => '<col style="width:6%;">').join('')}
            <col>
          </colgroup>
          <tbody>${linhaTotal('Total geral', folha.itens, 'geral')}</tbody>
        </table>
      ` : ''}

    </body>
    </html>
  `
}

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// HTML do PDF do estoque de balsas (locação ou venda). Recebe as balsas já
// filtradas e ordenadas pela rota; `filtros` é só a lista de textos que aparece
// no cabeçalho dizendo o que foi impresso.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'Logo-NS.png')

const STATUS_LABEL = { disponivel: 'Disponível', locado: 'Locado', vendido: 'Vendido' }

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Quantas balsas de cada capacidade — é a pergunta mais comum sobre o estoque
function resumoPorCapacidade(balsas) {
  const contagem = new Map()
  balsas.forEach(b => contagem.set(b.capacidade, (contagem.get(b.capacidade) || 0) + 1))
  return [...contagem.entries()].sort((a, b) => a[0] - b[0])
}

// finalidade: 'locacao' | 'venda'. todas: se inclui locadas/vendidas (aí sai a
// coluna de status). filtros: textos tipo "Armazém: Manaus" (vazio = sem filtro)
export function htmlEstoqueBalsas(balsas, { finalidade, todas, filtros }) {
  const logoBase64 = fs.existsSync(LOGO_PATH)
    ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
    : ''

  const titulo = finalidade === 'locacao' ? 'Estoque de Locação' : 'Estoque de Vendas'
  const resumo = resumoPorCapacidade(balsas)

  return `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; }

        .cabecalho { display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid #000; padding-bottom: 6pt; margin-bottom: 4pt; }
        .cabecalho img { height: 30pt; }
        .cabecalho h1 { font-size: 14pt; }
        .cabecalho .info { text-align: right; font-size: 8pt; line-height: 1.4; }

        .filtros { margin: 6pt 0 8pt; font-size: 8pt; }

        h2 { font-size: 10pt; margin: 12pt 0 4pt; }
        h2 span { font-weight: normal; color: #555; }

        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 3pt 4pt; vertical-align: top; word-wrap: break-word; }
        th { background: #e9e9e9; font-size: 7.5pt; text-align: center; vertical-align: middle; }
        thead { display: table-header-group; }
        .centro { text-align: center; }
        tr { page-break-inside: avoid; }
        tr.total td { font-weight: bold; background: #f3f3f3; }
        table.resumo { width: auto; min-width: 40%; }

        .vazio { margin-top: 20pt; text-align: center; color: #555; font-size: 10pt; }
      </style>
    </head>
    <body>

      <div class="cabecalho">
        ${logoBase64 ? `<img src="${logoBase64}">` : '<span></span>'}
        <h1>${titulo}</h1>
        <div class="info">
          <strong>${todas ? 'Todas as balsas (inclui locadas/vendidas)' : 'Somente disponíveis'}</strong><br>
          ${balsas.length} balsa(s)<br>
          Gerado em ${new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>

      <div class="filtros">
        <strong>Filtros:</strong> ${filtros.length > 0 ? filtros.map(escapeHtml).join(' · ') : 'nenhum'}
      </div>

      ${balsas.length === 0
        ? '<div class="vazio">Nenhuma balsa nesta seleção.</div>'
        : `
          <table>
            <thead>
              <tr>
                <th>Capacidade</th>
                <th>Patrimônio</th>
                <th>Fabricante</th>
                <th>Nº Série</th>
                <th>Modelo</th>
                <th>Ano</th>
                <th>Tipo</th>
                <th>Armazém</th>
                ${todas ? '<th>Status</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${balsas.map(b => `
                <tr>
                  <td class="centro"><strong>${escapeHtml(b.capacidade)}</strong></td>
                  <td>${escapeHtml(b.patrimonio) || '-'}</td>
                  <td>${escapeHtml(b.fabricante)}</td>
                  <td>${escapeHtml(b.numeroSerie)}</td>
                  <td>${escapeHtml(b.modelo)}</td>
                  <td class="centro">${escapeHtml(b.anoFabricacao)}</td>
                  <td>${escapeHtml(b.tipo)}</td>
                  <td>${escapeHtml(b.armazem) || '-'}</td>
                  ${todas ? `<td class="centro">${escapeHtml(STATUS_LABEL[b.status] || b.status)}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>Resumo por capacidade</h2>
          <table class="resumo">
            <thead><tr><th>Capacidade</th><th>Quantidade</th></tr></thead>
            <tbody>
              ${resumo.map(([capacidade, qtd]) => `
                <tr><td class="centro">${escapeHtml(capacidade)}</td><td class="centro">${qtd}</td></tr>
              `).join('')}
              <tr class="total"><td class="centro">Total</td><td class="centro">${balsas.length}</td></tr>
            </tbody>
          </table>
        `}

    </body>
    </html>
  `
}

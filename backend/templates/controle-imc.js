// PDF do Controle de IMC (documento de auditoria do PCMSO), no mesmo papel
// timbrado do relatório técnico — a rota passa o resultado por aplicarTimbrado().
// Margens iguais às do relatório técnico, pra não escrever em cima da faixa azul
// do topo nem dos endereços do rodapé.
//
// Anônimo de propósito: o colaborador aparece só como número (ver numerarColaboradoresImc).

import { svgGraficoImc, legendaImcHtml, numerarColaboradoresImc, FAIXAS_IMC, faixaImc, formatarImc } from '../../js/modules/grafico-imc.mjs'

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// "OUT/26", como no documento em Word que este PDF substitui
const periodoCurto = c => `${MESES[c.mes - 1].slice(0, 3)}/${String(c.ano).slice(-2)}`

export const nomeArquivoControleImc = c => `Controle de IMC ${String(c.mes).padStart(2, '0')}-${c.ano}.pdf`

// controle: ControleImc com `medicoes` e `empresa`
export function htmlControleImc(controle) {
  const numeros = numerarColaboradoresImc(controle.medicoes)
  const barras = [...numeros.values()].sort((a, b) => a.numero - b.numero)
  const titulo = `CONTROLE DE ÍNDICES DE IMC - ${MESES[controle.mes - 1]}/${controle.ano}`

  const media = barras.length ? barras.reduce((s, b) => s + b.imc, 0) / barras.length : 0
  const porFaixa = FAIXAS_IMC.map(f => ({ ...f, quantidade: barras.filter(b => faixaImc(b.imc) === f).length }))

  return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 52mm 20mm 34mm 20mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; margin: 0; }

  .cabecalho { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; margin-bottom: 6mm; }
  .cabecalho table { border-collapse: collapse; }
  .cabecalho td { padding: 0.6mm 0; vertical-align: top; }
  .cabecalho td:first-child { font-weight: bold; padding-right: 8mm; white-space: nowrap; }
  .legenda { font-size: 9.5pt; white-space: nowrap; }

  .grafico { border: 1px solid #bfbfbf; padding: 2mm; }

  .resumo { width: 100%; border-collapse: collapse; margin-top: 6mm; font-size: 9.5pt; }
  .resumo th, .resumo td { border: 1px solid #000; padding: 1.5mm 2mm; text-align: center; }
  .resumo th { background: #e9e9e9; }
  .cor { display: inline-block; width: 10pt; height: 8pt; vertical-align: middle; margin-right: 4pt; }
  .nota { margin-top: 4mm; font-size: 8.5pt; color: #444; }
</style>
</head>
<body>
  <div class="cabecalho">
    <table>
      <tr><td>EMPRESA</td><td>${escapeHtml((controle.empresa?.nome || '').toUpperCase())}</td></tr>
      <tr><td>PERÍODO</td><td>${periodoCurto(controle)}</td></tr>
      <tr><td>PCMSO</td><td>${escapeHtml(controle.pcmso)}</td></tr>
    </table>
    <div class="legenda">${legendaImcHtml()}</div>
  </div>

  <div class="grafico">${svgGraficoImc(barras, titulo)}</div>

  <table class="resumo">
    <thead>
      <tr>
        <th>Colaboradores avaliados</th>
        ${porFaixa.map(f => `<th><span class="cor" style="background:${f.cor};"></span>${f.nome}<br><small>${f.intervalo}</small></th>`).join('')}
        <th>IMC médio</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${barras.length}</td>
        ${porFaixa.map(f => `<td>${f.quantidade}</td>`).join('')}
        <td>${barras.length ? formatarImc(Math.round(media * 10) / 10) : '-'}</td>
      </tr>
    </tbody>
  </table>

  <p class="nota">IMC = peso (kg) ÷ altura² (m). Uma pesagem por colaborador no mês. Colaboradores identificados apenas por número, para preservar o anonimato.</p>
</body>
</html>
  `
}

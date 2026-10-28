// Gráfico de barras do Controle de IMC — usado pela tela (js/modules/controle-imc.js)
// e pelo PDF (backend/templates/controle-imc.js, que importa este arquivo), pra
// que os dois saiam iguais. Só gera texto (SVG), sem DOM nem nada de Node.
//
// Cada barra é um técnico, identificado só pelo número (anonimato do documento).

// Faixas do PCMSO (legenda do documento de auditoria). O IMC é classificado já
// arredondado a 1 casa, igual ao que aparece no rótulo — senão 34,996 sairia
// escrito "35,0" e pintado de azul.
export const FAIXAS_IMC = [
  { ate: 34.9, cor: '#2b5797', texto: 'Até 34,9' },
  { ate: 37.4, cor: '#f5d800', texto: '35,0 a 37,4' },
  { ate: 39.9, cor: '#ffa500', texto: '37,5 a 39,9' },
  { ate: Infinity, cor: '#e00000', texto: '40,0 ou mais' }
]

export const calcularImc = (peso, altura) => (peso > 0 && altura > 0 ? Math.round((peso / (altura * altura)) * 10) / 10 : null)

export const faixaImc = imc => FAIXAS_IMC.find(f => imc <= f.ate)

export const formatarImc = imc => imc.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// Número de cada técnico no gráfico: ordem de cadastro (colaboradorId) entre os
// que foram pesados no mês — não a ordem alfabética, que entregaria quem é quem
// pra quem conhece a equipe. Recebe [{ colaboradorId, peso, altura }] e devolve
// Map colaboradorId → { numero, imc }.
export function numerarTecnicosImc(medicoes) {
  const numeros = new Map()
  medicoes
    .filter(m => calcularImc(m.peso, m.altura) !== null)
    .sort((a, b) => a.colaboradorId - b.colaboradorId)
    .forEach((m, i) => numeros.set(m.colaboradorId, { numero: i + 1, imc: calcularImc(m.peso, m.altura) }))
  return numeros
}

// barras: [{ numero, imc }] na ordem em que devem aparecer
export function svgGraficoImc(barras, titulo) {
  const largura = 900
  const altura = 400
  const esq = 48, dir = 16, topo = 52, base = 36
  const areaL = largura - esq - dir
  const areaA = altura - topo - base

  // Eixo Y de 0 a 50 (como no documento original), esticando de 5 em 5 se alguém passar
  const maximo = Math.max(50, Math.ceil(Math.max(0, ...barras.map(b => b.imc)) / 5) * 5)
  const y = v => topo + areaA - (v / maximo) * areaA

  const grade = []
  for (let v = 0; v <= maximo; v += 5) {
    grade.push(`
      <line x1="${esq}" x2="${largura - dir}" y1="${y(v)}" y2="${y(v)}" stroke="#d9d9d9" stroke-width="1"/>
      <text x="${esq - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#595959">${formatarImc(v)}</text>
    `)
  }

  // Uma posição a mais no fim, como no original (respiro à direita)
  const passo = areaL / Math.max(barras.length + 1, 2)
  const larguraBarra = Math.min(passo * 0.45, 28)
  const colunas = barras.map((b, i) => {
    const cx = esq + passo * (i + 0.5)
    return `
      <rect x="${cx - larguraBarra / 2}" y="${y(b.imc)}" width="${larguraBarra}" height="${y(0) - y(b.imc)}" fill="${faixaImc(b.imc).cor}"/>
      <text x="${cx}" y="${y(b.imc) - 6}" text-anchor="middle" font-size="11" fill="#404040">${formatarImc(b.imc)}</text>
      <text x="${cx}" y="${y(0) + 18}" text-anchor="middle" font-size="11" fill="#595959">${b.numero}</text>
    `
  })

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="100%" style="display:block; font-family:Arial, Helvetica, sans-serif;">
      <rect x="0" y="0" width="${largura}" height="${altura}" fill="#fff"/>
      <text x="${largura / 2}" y="26" text-anchor="middle" font-size="16" fill="#595959">${titulo}</text>
      ${grade.join('')}
      ${colunas.join('')}
      ${barras.length === 0 ? `<text x="${largura / 2}" y="${topo + areaA / 2}" text-anchor="middle" font-size="14" fill="#999">Nenhuma pesagem lançada no mês</text>` : ''}
    </svg>
  `
}

// Legenda das faixas (HTML), igual na tela e no PDF
export function legendaImcHtml() {
  return FAIXAS_IMC.map(f => `
    <div style="display:flex; align-items:center; gap:6px; margin:2px 0;">
      <span style="display:inline-block; width:22px; height:14px; background:${f.cor};"></span>
      <span>${f.texto}</span>
    </div>
  `).join('')
}

// Gráfico de barras do Controle de IMC — usado pela tela (js/modules/controle-imc.js)
// e pelo PDF (backend/templates/controle-imc.js, que importa este arquivo), pra
// que os dois saiam iguais, e pelo gráfico pessoal na ficha do colaborador
// (js/modules/colaboradores.js). Gera só texto (SVG) — a única função que usa
// DOM é baixarGraficoPng, que o backend nunca chama.
//
// No gráfico do mês cada barra é um técnico, identificado só pelo número
// (anonimato do documento); no pessoal, cada barra é um mês.

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
// Map colaboradorId → { numero, rotulo, imc } (rotulo = número, pro svgGraficoImc).
export function numerarTecnicosImc(medicoes) {
  const numeros = new Map()
  medicoes
    .filter(m => calcularImc(m.peso, m.altura) !== null)
    .sort((a, b) => a.colaboradorId - b.colaboradorId)
    .forEach((m, i) => numeros.set(m.colaboradorId, { numero: i + 1, rotulo: i + 1, imc: calcularImc(m.peso, m.altura) }))
  return numeros
}

const escaparSvg = texto => String(texto).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

// barras: [{ rotulo, imc }] na ordem em que devem aparecer (rotulo = texto
// embaixo da barra). opcoes.legenda: desenha a legenda das faixas dentro do
// SVG (pra imagem baixada, que sai sem a legenda da página).
// opcoes.vazio: texto quando não há barras.
export function svgGraficoImc(barras, titulo, opcoes = {}) {
  const { legenda = false, vazio = 'Nenhuma pesagem lançada no mês' } = opcoes
  const largura = 900
  const altura = legenda ? 430 : 400
  const esq = 48, dir = 16, base = 36
  const topo = legenda ? 82 : 52
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
      <text x="${cx}" y="${y(0) + 18}" text-anchor="middle" font-size="11" fill="#595959">${escaparSvg(b.rotulo)}</text>
    `
  })

  // Legenda numa linha, centralizada embaixo do título
  const larguraItem = 130
  const inicioLegenda = (largura - FAIXAS_IMC.length * larguraItem) / 2
  const itensLegenda = legenda
    ? FAIXAS_IMC.map((f, i) => `
        <rect x="${inicioLegenda + i * larguraItem}" y="42" width="20" height="12" fill="${f.cor}"/>
        <text x="${inicioLegenda + i * larguraItem + 26}" y="52" font-size="12" fill="#404040">${f.texto}</text>
      `).join('')
    : ''

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="100%" style="display:block; font-family:Arial, Helvetica, sans-serif;">
      <rect x="0" y="0" width="${largura}" height="${altura}" fill="#fff"/>
      <text x="${largura / 2}" y="26" text-anchor="middle" font-size="16" fill="#595959">${escaparSvg(titulo)}</text>
      ${itensLegenda}
      ${grade.join('')}
      ${colunas.join('')}
      ${barras.length === 0 ? `<text x="${largura / 2}" y="${topo + areaA / 2}" text-anchor="middle" font-size="14" fill="#999">${escaparSvg(vazio)}</text>` : ''}
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

// Baixa o gráfico como PNG (só no navegador). O SVG vira imagem num canvas em
// 2x pra não sair borrado quando colado num documento do Word.
export function baixarGraficoPng(svg, nomeArquivo) {
  // Com width="100%" a imagem não tem tamanho próprio — usa o do viewBox
  const [, , largura, altura] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number)
  const svgFixo = svg.replace('width="100%"', `width="${largura}" height="${altura}"`)
  const url = URL.createObjectURL(new Blob([svgFixo], { type: 'image/svg+xml;charset=utf-8' }))

  const img = new Image()
  img.onload = () => {
    const escala = 2
    const canvas = document.createElement('canvas')
    canvas.width = largura * escala
    canvas.height = altura * escala
    const ctx = canvas.getContext('2d')
    ctx.scale(escala, escala)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob(blob => {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = nomeArquivo
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    }, 'image/png')
  }
  img.onerror = () => { URL.revokeObjectURL(url); alert('Não foi possível gerar a imagem do gráfico') }
  img.src = url
}

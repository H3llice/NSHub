import { esc } from './html.js'
import { API, apiDados } from './api.js'

// ═══════════════════════════════ INDICADORES ═══════════════════════════════
// Tela de KPIs mês a mês. Quem decide QUAIS indicadores existem, a fórmula e
// quem pode ver é o catálogo em backend/routes/indicadores.js — esta tela só
// desenha o que vier de lá (agrupado por área). Indicador novo não mexe aqui.

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// 'YYYY-MM' → 'jan/26'
function rotuloMes(chave) {
  const [ano, mes] = chave.split('-')
  return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`
}

function formatar(valor, unidade) {
  if (valor === null || valor === undefined) return '—'
  if (unidade === 'moeda') return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  if (unidade === 'percentual') return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

// Variação do último mês em relação ao anterior. Percentual compara em pontos
// percentuais (p.p.) — "inadimplência subiu 2 p.p." é o que se fala na reunião;
// moeda/número comparam em % do valor anterior.
function variacao(ind) {
  const v = ind.valores
  const atual = v[v.length - 1], anterior = v[v.length - 2]
  if (atual === null || anterior === null || anterior === undefined) return ''
  let delta, texto
  if (ind.unidade === 'percentual') {
    delta = atual - anterior
    texto = `${delta >= 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`
  } else {
    if (anterior === 0) return ''
    delta = ((atual - anterior) / Math.abs(anterior)) * 100
    texto = `${delta >= 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
  }
  if (Math.abs(delta) < 0.05) return `<span style="color:#999;">= mês anterior</span>`
  const bom = (delta > 0) === (ind.melhor === 'maior')
  return `<span style="color:${bom ? '#198754' : '#dc3545'};">${delta > 0 ? '▲' : '▼'} ${texto}</span> <span style="color:#999;">vs mês anterior</span>`
}

// Gráfico de barras em SVG puro (mesma linha do grafico-imc.mjs: sem biblioteca,
// dá pra reaproveitar num PDF depois). Mês corrente/último em cor cheia.
function svgBarras(meses, valores, unidade) {
  const L = 320, A = 130, base = A - 18, topo = 8
  const numeros = valores.filter(v => v !== null)
  const max = Math.max(...numeros, unidade === 'percentual' ? 100 : 0, 1)
  const passo = L / meses.length
  const larg = Math.max(passo * 0.65, 2)
  // Rótulo de mês só de tanto em tanto pra não encavalar
  const cadaQuantos = Math.ceil(meses.length / 6)

  const barras = valores.map((v, i) => {
    const x = i * passo + (passo - larg) / 2
    const titulo = `<title>${rotuloMes(meses[i])}: ${formatar(v, unidade)}</title>`
    if (v === null) {
      return `<g>${titulo}<rect x="${x}" y="${base - 2}" width="${larg}" height="2" fill="#ddd"/></g>`
    }
    const h = Math.max((Math.max(v, 0) / max) * (base - topo), v > 0 ? 1 : 0)
    const ultimo = i === valores.length - 1
    return `<g>${titulo}<rect x="${x}" y="${base - h}" width="${larg}" height="${h}" rx="2"
      fill="var(--acento)" opacity="${ultimo ? 1 : 0.45}"/></g>`
  }).join('')

  const rotulos = meses.map((m, i) => (i % cadaQuantos === 0 || i === meses.length - 1)
    ? `<text x="${i * passo + passo / 2}" y="${A - 4}" font-size="9" text-anchor="middle" fill="#888">${rotuloMes(m)}</text>`
    : '').join('')

  return `<svg viewBox="0 0 ${L} ${A}" style="width:100%; height:auto; display:block;" role="img">
    <line x1="0" y1="${base}" x2="${L}" y2="${base}" stroke="#e5e5e5"/>
    ${barras}${rotulos}
  </svg>`
}

function cardIndicador(ind, meses) {
  const atual = ind.valores[ind.valores.length - 1]
  return `
    <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:6px;">
      <div style="color:#777; font-size:13px; font-weight:600;">${esc(ind.titulo)}</div>
      ${ind.erro
      ? `<div style="color:#dc3545; font-size:13px;">${esc(ind.erro)}</div>`
      : `<div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
            <span style="font-size:24px; font-weight:700;">${formatar(atual, ind.unidade)}</span>
            <span style="font-size:12px;">${variacao(ind)}</span>
          </div>
          <div style="font-size:11px; color:#999;">${rotuloMes(meses[meses.length - 1])}</div>
          ${svgBarras(meses, ind.valores, ind.unidade)}`}
      <details style="font-size:12px; color:#666;">
        <summary style="cursor:pointer; color:var(--acento);">Como é calculado</summary>
        <div style="margin-top:4px;">${esc(ind.formula)}</div>
      </details>
    </div>
  `
}

// 'YYYY-MM' do mês atual deslocado em `delta` meses
function mesRelativo(delta) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ===== RENDERIZA A PÁGINA ====================================================
export function inicializarIndicadores() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  const container = document.getElementById('indicadores')
  container.classList.add('active')

  container.innerHTML = `
    <div class="tab">Indicadores</div>
    <p style="font-size:13px; color:#999;">Indicadores mês a mês calculados direto dos dados do sistema. O valor em destaque é o do último mês do período.</p>

    <div class="filtros-grid" style="margin-bottom:16px;">
      <div>
        <label style="font-size:12px;">De</label>
        <input type="month" id="filtro-indicadores-de" class="form-control form-control-sm" value="${mesRelativo(-11)}" onchange="carregarIndicadores()">
      </div>
      <div>
        <label style="font-size:12px;">Até</label>
        <input type="month" id="filtro-indicadores-ate" class="form-control form-control-sm" value="${mesRelativo(0)}" onchange="carregarIndicadores()">
      </div>
    </div>

    <div id="conteudo-indicadores"><div style="color:#999; padding:12px;">Carregando...</div></div>
  `

  carregarIndicadores()
}

window.carregarIndicadores = async function () {
  const de = document.getElementById('filtro-indicadores-de')?.value
  const ate = document.getElementById('filtro-indicadores-ate')?.value
  const destino = document.getElementById('conteudo-indicadores')
  if (!destino) return

  const params = new URLSearchParams()
  if (de) params.append('de', de)
  if (ate) params.append('ate', ate)

  destino.innerHTML = `<div style="color:#999; padding:12px;">Carregando...</div>`

  let dados
  try {
    dados = await apiDados(`${API}/indicadores?${params}`)
  } catch {
    destino.innerHTML = `<div style="color:#dc3545; padding:12px;">Erro ao carregar os indicadores</div>`
    return
  }

  if (dados.indicadores.length === 0) {
    destino.innerHTML = `<div style="color:#999; padding:12px;">Nenhum indicador disponível para o seu perfil.</div>`
    return
  }

  // Agrupa por área, na ordem em que aparecem no catálogo
  const areas = new Map()
  for (const ind of dados.indicadores) {
    if (!areas.has(ind.area)) areas.set(ind.area, [])
    areas.get(ind.area).push(ind)
  }

  destino.innerHTML = [...areas].map(([area, lista]) => `
    <h5 style="margin:20px 0 12px;">${esc(area)}</h5>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
      ${lista.map(ind => cardIndicador(ind, dados.meses)).join('')}
    </div>
  `).join('')
}

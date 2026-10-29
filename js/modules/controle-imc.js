import { labelFuncao, FUNCOES_TECNICO } from './funcoes-colaborador.js'
import { esc } from './html.js'
import { svgGraficoImc, legendaImcHtml, numerarColaboradoresImc, calcularImc, faixaImc, formatarImc, baixarGraficoPng } from './grafico-imc.mjs'

const API = 'https://override-steerable-professed.ngrok-free.dev'

// ─── Auth helper (mesmo padrão dos outros módulos) ────────────────────────────
function tratarSessaoExpirada(res) {
  if (res.status === 401) {
    localStorage.removeItem('ns_token')
    localStorage.removeItem('ns_usuario')
    alert('Sua sessão expirou. Faça login novamente.')
    window.location.href = './login.html'
    throw new Error('Sessão expirada')
  }
  return res
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('ns_token')
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {})
    }
  })
  return tratarSessaoExpirada(res)
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// ══════════════════════════════════════════════════════════════════════════
// CONTROLE DE IMC (Conformidade → Controle de IMC) — admin/gerente
// Uma pesagem por colaborador ativo por mês, todos na mesma tela. O relatório
// (gráfico, PNG e PDF pra auditoria) sai só com quem estiver marcado e mostra
// cada um só pelo número — ver js/modules/grafico-imc.mjs
// ══════════════════════════════════════════════════════════════════════════

let imcAtual = null // { mes, ano, colaboradores, ... } como veio do GET /controle-imc
let empresasImc = []

// Quem foi DESMARCADO pro relatório (ids). Guardado no navegador pra escolha
// valer de um mês pro outro; colaborador novo entra marcado. É só conveniência
// de quem usa a tela — o PDF recebe a lista explícita na URL.
const CHAVE_FORA_RELATORIO = 'imc_fora_relatorio'
function lerForaRelatorio() {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_FORA_RELATORIO) || '[]')) } catch { return new Set() }
}
function gravarForaRelatorio(ids) {
  try { localStorage.setItem(CHAVE_FORA_RELATORIO, JSON.stringify([...ids])) } catch { }
}
let foraRelatorio = lerForaRelatorio()

export async function inicializarControleImc() {
  const hoje = new Date()
  await abrirMesImc(hoje.getMonth() + 1, hoje.getFullYear())
}
window.inicializarControleImc = inicializarControleImc

async function abrirMesImc(mes, ano) {
  const pagina = document.getElementById('controleImc')
  pagina.innerHTML = `<div class="tab">Controle de IMC</div><p style="color:#999;">Carregando...</p>`

  try {
    const [res, empresas] = await Promise.all([
      apiFetch(`${API}/controle-imc?mes=${mes}&ano=${ano}`),
      empresasImc.length ? empresasImc : apiFetch(`${API}/empresas`).then(r => r.json())
    ])
    const dados = await res.json()
    if (!res.ok) { pagina.innerHTML = `<div class="tab">Controle de IMC</div><p style="color:red;">${esc(dados.erro || 'Erro ao carregar')}</p>`; return }
    empresasImc = empresas
    imcAtual = dados
    renderizarControleImc()
  } catch {
    pagina.innerHTML = `<div class="tab">Controle de IMC</div><p style="color:red;">Erro ao conectar com o servidor</p>`
  }
}

window.trocarMesImc = function (valor) {
  if (!valor) return
  const [ano, mes] = valor.split('-').map(Number)
  abrirMesImc(mes, ano)
}

function renderizarControleImc() {
  const d = imcAtual
  const valorMes = `${d.ano}-${String(d.mes).padStart(2, '0')}`

  // Quem ainda não tem pesagem no mês vem com a altura da última pesagem
  const alturaInicial = c => c.altura ?? c.anterior?.altura ?? ''

  document.getElementById('controleImc').innerHTML = `
    <div class="tab">Controle de IMC</div>

    <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
      <div>
        <label style="font-size:12px;">Mês</label>
        <input type="month" class="form-control" value="${valorMes}" onchange="trocarMesImc(this.value)">
      </div>
      <div>
        <label style="font-size:12px;">Empresa</label>
        <select id="imc-empresa" class="form-control" style="min-width:220px;">
          <option value="">Selecione...</option>
          ${empresasImc.map(e => `<option value="${e.id}" ${e.id === d.empresaId ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;">PCMSO</label>
        <input type="text" id="imc-pcmso" class="form-control" placeholder="Ex.: 2026 – REV09" value="${esc(d.pcmso)}">
      </div>
      <button class="btn btn-success" onclick="salvarControleImc()">Salvar</button>
      <button class="btn btn-secondary" onclick="abrirPdfControleImc()">📄 PDF para auditoria</button>
    </div>
    <p style="font-size:12px; color:#999; margin:8px 0;">
      ${MESES[d.mes - 1]}/${d.ano}${d.salvo ? '' : ' — ainda não salvo'}. Uma pesagem por colaborador no mês; a altura vem da última pesagem dele.
      A caixa da 1ª coluna escolhe quem sai no relatório (gráfico, PNG e PDF) — quem fica sem peso não sai de qualquer jeito.
      O Nº é o que aparece no relatório, que não mostra nomes.
    </p>
    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:8px; font-size:13px;">
      <span style="color:#666;">Marcar no relatório:</span>
      <button class="btn btn-sm btn-outline-secondary" onclick="marcarRelatorioImc('todos')">Todos</button>
      <button class="btn btn-sm btn-outline-secondary" onclick="marcarRelatorioImc('tecnicos')">Só técnicos</button>
      <button class="btn btn-sm btn-outline-secondary" onclick="marcarRelatorioImc('nenhum')">Nenhum</button>
      <span id="imc-contagem-relatorio" style="color:#666; margin-left:6px;"></span>
    </div>

    <div class="table-scroll">
      <table class="table-certificados" style="font-size:13px;">
        <thead>
          <tr>
            <th title="Sai no relatório (gráfico, PNG e PDF)">Relatório</th>
            <th title="Número do colaborador no relatório">Nº</th>
            <th>Colaborador</th>
            <th>Altura (m)</th>
            <th>Peso (kg)</th>
            <th>IMC</th>
            <th title="Diferença para a última pesagem do colaborador">Variação</th>
            <th>Observações</th>
          </tr>
        </thead>
        <tbody>
          ${d.colaboradores.length === 0
            ? '<tr><td colspan="8" style="text-align:center; color:#999; padding:30px;">Nenhum colaborador ativo cadastrado</td></tr>'
            : d.colaboradores.map(c => `
              <tr class="imc-linha" data-colaborador="${c.colaboradorId}" data-funcao="${esc(c.funcao)}">
                <td style="text-align:center;"><input type="checkbox" class="imc-relatorio" ${foraRelatorio.has(c.colaboradorId) ? '' : 'checked'} onchange="alterarRelatorioImc(this)"></td>
                <td class="imc-numero" style="text-align:center; font-weight:600;"></td>
                <td style="white-space:nowrap;">
                  <strong>${esc(c.nome)}</strong><br>
                  <small style="color:#999;">${esc(labelFuncao(c.funcao))}${c.ativo ? '' : ' · inativo'}</small>
                </td>
                <td><input type="number" class="form-control form-control-sm imc-altura" min="1" max="2.5" step="0.01" value="${alturaInicial(c)}" style="width:90px;" oninput="atualizarTelaImc()"></td>
                <td><input type="number" class="form-control form-control-sm imc-peso" min="30" max="300" step="0.1" value="${c.peso ?? ''}" style="width:90px;" oninput="atualizarTelaImc()"></td>
                <td class="imc-valor" style="text-align:center;"></td>
                <td class="imc-variacao" style="text-align:center; white-space:nowrap;"></td>
                <td><input type="text" class="form-control form-control-sm imc-obs" value="${esc(c.observacoes)}" style="min-width:160px;"></td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>

    <div style="display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; margin-top:20px;">
      <div id="imc-grafico" style="flex:1; min-width:300px; background:white; border:1px solid #ddd; border-radius:6px; padding:8px;"></div>
      <div style="font-size:13px;">
        ${legendaImcHtml()}
        <button class="btn btn-sm btn-secondary" style="margin-top:12px;" onclick="baixarGraficoImcMes()">⬇️ Baixar gráfico (PNG)</button>
      </div>
    </div>
  `
  window.atualizarTelaImc()
}

function lerLinhasImc() {
  return [...document.querySelectorAll('.imc-linha')].map(tr => ({
    tr,
    colaboradorId: Number(tr.dataset.colaborador),
    noRelatorio: tr.querySelector('.imc-relatorio').checked,
    altura: parseFloat(tr.querySelector('.imc-altura').value),
    peso: parseFloat(tr.querySelector('.imc-peso').value),
    observacoes: tr.querySelector('.imc-obs').value
  }))
}

window.alterarRelatorioImc = function (check) {
  const id = Number(check.closest('.imc-linha').dataset.colaborador)
  if (check.checked) foraRelatorio.delete(id)
  else foraRelatorio.add(id)
  gravarForaRelatorio(foraRelatorio)
  window.atualizarTelaImc()
}

// Atalhos: todos | tecnicos (só técnicos N1/N2/N3) | nenhum
window.marcarRelatorioImc = function (quais) {
  document.querySelectorAll('.imc-linha').forEach(tr => {
    const marcar = quais === 'todos' || (quais === 'tecnicos' && FUNCOES_TECNICO.includes(tr.dataset.funcao))
    tr.querySelector('.imc-relatorio').checked = marcar
    const id = Number(tr.dataset.colaborador)
    if (marcar) foraRelatorio.delete(id)
    else foraRelatorio.add(id)
  })
  gravarForaRelatorio(foraRelatorio)
  window.atualizarTelaImc()
}

// Números do relatório: só entre os marcados (com peso)
const numerosDoRelatorio = (linhas = lerLinhasImc()) => numerarColaboradoresImc(linhas.filter(l => l.noRelatorio))

// IMC, variação, Nº e gráfico recalculados a cada digitação
window.atualizarTelaImc = function () {
  const linhas = lerLinhasImc()
  const numeros = numerosDoRelatorio(linhas)
  const anteriorDe = new Map(imcAtual.colaboradores.map(c => [c.colaboradorId, c.anterior]))

  for (const l of linhas) {
    const n = numeros.get(l.colaboradorId)
    l.tr.querySelector('.imc-numero').textContent = n ? n.numero : '-'
    l.tr.style.opacity = l.noRelatorio ? '' : '0.6'

    const imc = calcularImc(l.peso, l.altura)
    const celulaImc = l.tr.querySelector('.imc-valor')
    if (imc !== null) {
      const faixa = faixaImc(imc)
      celulaImc.innerHTML = `<span style="display:inline-block; min-width:44px; padding:2px 6px; border-radius:10px; background:${faixa.cor}; color:${faixa.corTexto}; font-weight:600;" title="${faixa.texto}">${formatarImc(imc)}</span>`
    } else {
      celulaImc.innerHTML = '<span style="color:#999;">-</span>'
    }

    const ant = anteriorDe.get(l.colaboradorId)
    const celulaVar = l.tr.querySelector('.imc-variacao')
    if (ant && l.peso > 0) {
      const dif = Math.round((l.peso - ant.peso) * 10) / 10
      const texto = `${dif > 0 ? '+' : ''}${dif.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg`
      celulaVar.innerHTML = `${texto}<br><small style="color:#999;">desde ${MESES_CURTOS[ant.mes - 1]}/${String(ant.ano).slice(-2)}</small>`
    } else {
      celulaVar.innerHTML = '<span style="color:#999;">-</span>'
    }
  }

  const pesados = linhas.filter(l => calcularImc(l.peso, l.altura) !== null).length
  document.getElementById('imc-contagem-relatorio').textContent = `${numeros.size} de ${pesados} pesados no relatório`
  document.getElementById('imc-grafico').innerHTML = svgGraficoImc(barrasDoRelatorio(numeros), tituloGraficoImc(), { vazio: 'Ninguém marcado com pesagem no mês' })
}

const tituloGraficoImc = () => `CONTROLE DE ÍNDICES DE IMC - ${MESES[imcAtual.mes - 1].toUpperCase()}/${imcAtual.ano}`
const barrasDoRelatorio = (numeros = numerosDoRelatorio()) => [...numeros.values()].sort((a, b) => a.numero - b.numero)

// Só o gráfico, como imagem (pra colar num documento) — com a legenda dentro.
// Sai do que está digitado e marcado na tela, mesmo antes de salvar.
window.baixarGraficoImcMes = function () {
  const barras = barrasDoRelatorio()
  if (barras.length === 0) { alert('Marque ao menos um colaborador com pesagem!'); return }
  baixarGraficoPng(svgGraficoImc(barras, tituloGraficoImc(), { legenda: true }), `Grafico IMC ${String(imcAtual.mes).padStart(2, '0')}-${imcAtual.ano}.png`)
}

// Salva a tela inteira (todas as pesagens, marcadas ou não); retorna true/false (já avisando o erro)
async function salvarImc() {
  const nomeDe = new Map(imcAtual.colaboradores.map(c => [c.colaboradorId, c.nome]))
  const medicoes = lerLinhasImc().map(l => ({
    colaboradorId: l.colaboradorId,
    nome: nomeDe.get(l.colaboradorId),
    altura: Number.isNaN(l.altura) ? null : l.altura,
    peso: Number.isNaN(l.peso) ? null : l.peso,
    observacoes: l.observacoes
  }))

  const res = await apiFetch(`${API}/controle-imc`, {
    method: 'PUT',
    body: JSON.stringify({
      mes: imcAtual.mes,
      ano: imcAtual.ano,
      empresaId: document.getElementById('imc-empresa').value || null,
      pcmso: document.getElementById('imc-pcmso').value,
      medicoes
    })
  })
  if (res.ok) return true
  alert('Erro ao salvar: ' + ((await res.json()).erro || ''))
  return false
}

window.salvarControleImc = async function () {
  if (!(await salvarImc())) return
  await abrirMesImc(imcAtual.mes, imcAtual.ano)
  alert('Controle de IMC salvo!')
}

// O PDF sai do que está gravado — salva antes pra não perder o que foi digitado
// agora. Vai só quem está marcado (lista de ids na URL).
window.abrirPdfControleImc = async function () {
  if (!document.getElementById('imc-empresa').value) { alert('Escolha a empresa (sai no cabeçalho do PDF)!'); return }
  const marcados = [...numerosDoRelatorio().keys()]
  if (marcados.length === 0) { alert('Marque ao menos um colaborador com pesagem!'); return }

  // A aba é aberta já no clique: aberta depois do await, o navegador bloquearia como pop-up
  const aba = window.open('', '_blank')
  if (!(await salvarImc())) { aba?.close(); return }
  imcAtual.salvo = true

  const params = new URLSearchParams({ mes: imcAtual.mes, ano: imcAtual.ano, colaboradores: marcados.join(','), token: localStorage.getItem('ns_token') || '' })
  const url = `${API}/controle-imc/pdf?${params}`
  if (aba) aba.location = url
  else window.location.href = url
}

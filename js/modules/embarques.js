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
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true'
    }
  })
  return tratarSessaoExpirada(res)
}

async function apiJson(url, options = {}) {
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

const FUNCOES = {
  gerente: 'Gerente',
  tecnico: 'Técnico',
  vendedor: 'Vendedor',
  auxiliar: 'Auxiliar',
  estagiario: 'Estagiário',
}

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Datas de embarque são datas puras gravadas à meia-noite UTC — formatar em
// UTC, senão no horário de Brasília aparecem um dia antes.
function formatarDataEmb(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'
}

// "AAAA-MM-DD" (chave de dia do /embarques/resumo) → "DD/MM"
function formatarChaveDia(chave) {
  const [, m, d] = chave.split('-')
  return `${d}/${m}`
}

const DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function diasEntre(inicio, fim) {
  if (!inicio || !fim || fim < inicio) return 0
  return Math.round((new Date(fim + 'T00:00:00Z') - new Date(inicio + 'T00:00:00Z')) / 86400000) + 1
}

// ══════════════════════════════════════════════════════════════════════════
// EMBARQUES (Serviços → Embarques) — só admin/gerente (backend também bloqueia)
// Duas abas: a lista de embarques e o resumo de folgas/dobras por colaborador
// (base da futura folha de pagamento). Regra de folga/dobra: ver
// calcularDiasColaborador em backend/routes/embarques.js.
// ══════════════════════════════════════════════════════════════════════════

let colaboradoresEmbCache = []
let paginaAtualEmbarques = 1

async function carregarColaboradoresEmb() {
  colaboradoresEmbCache = await apiFetch(`${API}/colaboradores/simples`).then(r => r.json()).catch(() => [])
}

function opcoesColaboradoresEmb() {
  return colaboradoresEmbCache.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')
}

function cabecalhoEmbarques(abaAtiva) {
  const botao = (aba, texto) => `
    <button class="btn ${abaAtiva === aba ? 'btn-primary' : 'btn-secondary'}" onclick="inicializarEmbarques('${aba}')">${texto}</button>
  `
  return `
    <div class="tab">Embarques</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
      ${botao('lista', 'Embarques')}
      ${botao('folgas', 'Folgas e dobras')}
      <button class="btn btn-success" onclick="abrirFormularioEmbarque()" style="margin-left:auto;">+ Novo Embarque</button>
    </div>
  `
}

export async function inicializarEmbarques(aba = 'lista') {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('embarques').classList.add('active')

  await carregarColaboradoresEmb()
  if (aba === 'folgas') renderizarAbaFolgas()
  else renderizarAbaLista()
}
window.inicializarEmbarques = inicializarEmbarques

// ─── Aba: lista de embarques ──────────────────────────────────────────────────
function renderizarAbaLista() {
  document.getElementById('embarques').innerHTML = `
    ${cabecalhoEmbarques('lista')}

    <div class="filtros-grid">
      <div>
        <label style="font-size:12px;">Colaborador</label>
        <select id="filtro-embarque-colaborador" class="form-control form-control-sm" onchange="carregarEmbarques(1)">
          <option value="">Todos</option>
          ${opcoesColaboradoresEmb()}
        </select>
      </div>
      <div>
        <label style="font-size:12px;">De</label>
        <input type="date" id="filtro-embarque-de" class="form-control form-control-sm" onchange="carregarEmbarques(1)">
      </div>
      <div>
        <label style="font-size:12px;">Até</label>
        <input type="date" id="filtro-embarque-ate" class="form-control form-control-sm" onchange="carregarEmbarques(1)">
      </div>
    </div>

    <div class="table-scroll">
      <table class="table-certificados">
        <thead>
          <tr>
            <th>Embarcação</th>
            <th>Armador</th>
            <th>Início</th>
            <th>Fim</th>
            <th>Dias</th>
            <th>Colaboradores</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody id="tabela-embarques">
          <tr><td colspan="7" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
    <div id="contador-embarques" style="margin-top:12px;"></div>
  `
  carregarEmbarques()
}

window.carregarEmbarques = async function (pagina = 1) {
  paginaAtualEmbarques = pagina
  const params = new URLSearchParams()
  const colaboradorId = document.getElementById('filtro-embarque-colaborador')?.value
  const de = document.getElementById('filtro-embarque-de')?.value
  const ate = document.getElementById('filtro-embarque-ate')?.value
  if (colaboradorId) params.append('colaboradorId', colaboradorId)
  if (de) params.append('de', de)
  if (ate) params.append('ate', ate)
  params.append('pagina', pagina)

  const tabela = document.getElementById('tabela-embarques')
  try {
    const dados = await apiFetch(`${API}/embarques?${params}`).then(r => r.json())
    const embarques = dados.embarques || []

    tabela.innerHTML = embarques.length === 0
      ? `<tr><td colspan="7" style="text-align:center; color:#999; padding:30px;">Nenhum embarque encontrado</td></tr>`
      : embarques.map(e => `
        <tr>
          <td>${esc(e.embarcacao.nome)}</td>
          <td>${esc(e.armador.nome)}</td>
          <td>${formatarDataEmb(e.dataInicio)}</td>
          <td>${formatarDataEmb(e.dataFim)}</td>
          <td>${diasEntre(e.dataInicio.slice(0, 10), e.dataFim.slice(0, 10))}</td>
          <td>${e.colaboradores.map(c => esc(c.colaborador.nome)).join(', ')}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-info" onclick="editarEmbarque(${e.id})">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="excluirEmbarque(${e.id})">Excluir</button>
          </td>
        </tr>
      `).join('')

    document.getElementById('contador-embarques').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span>${dados.total || 0} embarques encontrados</span>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn btn-sm btn-secondary" onclick="carregarEmbarques(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
          <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
          <button class="btn btn-sm btn-secondary" onclick="carregarEmbarques(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
        </div>
      </div>
    `
  } catch {
    tabela.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>`
  }
}

window.excluirEmbarque = async function (id) {
  if (!confirm('Excluir este embarque? As folgas e dobras dos colaboradores serão recalculadas sem ele.')) return
  const res = await apiFetch(`${API}/embarques/${id}`, { method: 'DELETE' })
  if (res.ok) carregarEmbarques(paginaAtualEmbarques)
  else alert('Erro ao excluir embarque: ' + ((await res.json()).erro || ''))
}

// ─── Aba: folgas e dobras ─────────────────────────────────────────────────────
function renderizarAbaFolgas() {
  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  document.getElementById('embarques').innerHTML = `
    ${cabecalhoEmbarques('folgas')}

    <div class="filtros-grid">
      <div>
        <label style="font-size:12px;">Mês</label>
        <input type="month" id="filtro-folgas-mes" class="form-control form-control-sm" value="${mesAtual}" onchange="carregarResumoFolgas()">
      </div>
      <div>
        <label style="font-size:12px;">Colaborador</label>
        <select id="filtro-folgas-colaborador" class="form-control form-control-sm" onchange="carregarResumoFolgas()">
          <option value="">Todos</option>
          ${opcoesColaboradoresEmb()}
        </select>
      </div>
    </div>

    <p style="font-size:12px; color:#999; margin: 0 0 12px;">
      Cada dia embarcado gera 1 dia de folga, logo após o desembarque. Embarcar num dia de folga vira dobra, que substitui aquela folga.
    </p>

    <div class="table-scroll">
      <table class="table-certificados">
        <thead>
          <tr><th>Colaborador</th><th>Função</th><th>Dias embarcados</th><th>Dobras</th><th>Folgas</th><th></th></tr>
        </thead>
        <tbody id="tabela-folgas">
          <tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `
  carregarResumoFolgas()
}

window.carregarResumoFolgas = async function () {
  const mes = document.getElementById('filtro-folgas-mes').value
  const tabela = document.getElementById('tabela-folgas')
  if (!mes) { tabela.innerHTML = ''; return }

  const [ano, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  const params = new URLSearchParams({ de: `${mes}-01`, ate: `${mes}-${String(ultimoDia).padStart(2, '0')}` })
  const colaboradorId = document.getElementById('filtro-folgas-colaborador').value
  if (colaboradorId) params.append('colaboradorId', colaboradorId)

  try {
    const resumo = await apiFetch(`${API}/embarques/resumo?${params}`).then(r => r.json())
    if (!Array.isArray(resumo)) throw new Error(resumo.erro)

    tabela.innerHTML = resumo.length === 0
      ? `<tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Nenhum embarque ou folga neste mês</td></tr>`
      : resumo.map(r => `
        <tr>
          <td>${esc(r.colaborador.nome)}</td>
          <td>${FUNCOES[r.colaborador.funcao] || esc(r.colaborador.funcao)}</td>
          <td>${r.diasEmbarcados}</td>
          <td>${r.dobras > 0 ? `<strong style="color:#dc3545;">${r.dobras}</strong>` : '0'}</td>
          <td>${r.folgas}</td>
          <td><button class="btn btn-sm btn-secondary" onclick="alternarDiasFolgas(${r.colaborador.id})">Ver dias</button></td>
        </tr>
        <tr id="folgas-dias-${r.colaborador.id}" style="display:none;">
          <td colspan="6">${tabelaDiasColaborador(r.dias)}</td>
        </tr>
      `).join('')
  } catch {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red; padding:30px;">Erro ao carregar folgas e dobras</td></tr>`
  }
}

function tabelaDiasColaborador(dias) {
  const badge = d => d.tipo === 'folga'
    ? `<span style="background:#d1e7dd; color:#0f5132; padding:2px 8px; border-radius:12px; font-size:12px;">Folga</span>`
    : d.dobra
      ? `<span style="background:#dc3545; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">Embarcado — dobra</span>`
      : `<span style="background:#0d6efd; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">Embarcado</span>`

  return `
    <table class="table-certificados" style="margin:0; font-size:13px;">
      <thead><tr><th>Dia</th><th>Situação</th><th>Embarcação</th></tr></thead>
      <tbody>
        ${dias.map(d => `
          <tr>
            <td>${DIA_SEMANA[new Date(d.data + 'T00:00:00Z').getUTCDay()]} ${formatarChaveDia(d.data)}</td>
            <td>${badge(d)}</td>
            <td>${d.tipo === 'folga' ? `<span style="color:#999;">folga do embarque em ${esc(d.embarcacao)}</span>` : esc(d.embarcacao)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

window.alternarDiasFolgas = function (colaboradorId) {
  const linha = document.getElementById(`folgas-dias-${colaboradorId}`)
  linha.style.display = linha.style.display === 'none' ? '' : 'none'
}

// ─── Formulário (novo / editar) ───────────────────────────────────────────────
let embarqueEmEdicaoId = null

async function abrirFormularioEmbarqueBase(e = null) {
  embarqueEmEdicaoId = e?.id || null
  if (colaboradoresEmbCache.length === 0) await carregarColaboradoresEmb()

  // Colaborador que já estava no embarque mas hoje está inativo não vem em
  // /colaboradores/simples — mantém ele na lista pra não sumir ao salvar
  const selecionados = new Set((e?.colaboradores || []).map(c => c.colaboradorId))
  const lista = [...colaboradoresEmbCache]
  for (const c of e?.colaboradores || []) {
    if (!lista.some(x => x.id === c.colaboradorId)) lista.push({ ...c.colaborador, id: c.colaboradorId })
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('embarques').classList.add('active')

  document.getElementById('embarques').innerHTML = `
    <div style="margin-top:20px; max-width:800px;">
      <button class="btn btn-secondary" onclick="inicializarEmbarques()">← Voltar</button>
      <h3 style="margin:20px 0;">${e ? 'Editar Embarque' : 'Novo Embarque'}</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div style="position:relative;">
          <label>Embarcação *</label>
          <input type="text" id="emb-embarcacao-busca" class="form-control" placeholder="Digite o nome do navio..."
            value="${esc(e?.embarcacao?.nome)}" oninput="buscarEmbarcacaoEmbarque(this.value)" autocomplete="off">
          <input type="hidden" id="emb-embarcacaoId" value="${e?.embarcacaoId || ''}">
          <div id="emb-sugestoes-embarcacao" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
        </div>
        <div style="position:relative;">
          <label>Armador * <small style="color:#999;">(preenchido pela embarcação)</small></label>
          <input type="text" id="emb-armador-busca" class="form-control" placeholder="Digite o nome do armador..."
            value="${esc(e?.armador?.nome)}" oninput="buscarArmadorEmbarque(this.value)" autocomplete="off">
          <input type="hidden" id="emb-armadorId" value="${e?.armadorId || ''}">
          <div id="emb-sugestoes-armador" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
        </div>
        <div><label>Data de embarque *</label><input type="date" id="emb-dataInicio" class="form-control" value="${e ? e.dataInicio.slice(0, 10) : ''}" oninput="atualizarDiasEmbarque()"></div>
        <div><label>Data de desembarque *</label><input type="date" id="emb-dataFim" class="form-control" value="${e ? e.dataFim.slice(0, 10) : ''}" oninput="atualizarDiasEmbarque()"></div>
      </div>
      <div id="emb-dias" style="margin-top:8px; font-size:13px; color:#666;"></div>

      <h5 style="margin: 24px 0 10px;">Colaboradores * <small id="emb-contador-colaboradores" style="color:#999; font-weight:400;"></small></h5>
      <input type="text" class="form-control form-control-sm" placeholder="Filtrar por nome..." oninput="filtrarColaboradoresEmbarque(this.value)" style="max-width:300px; margin-bottom:8px;">
      <div id="emb-lista-colaboradores" style="background:white; border:1px solid #ddd; border-radius:6px; max-height:280px; overflow-y:auto; padding:8px 12px;">
        ${lista.length === 0
          ? '<div style="color:#999; padding:8px 0;">Nenhum colaborador ativo — cadastre em Cadastros → Colaboradores</div>'
          : lista.map(c => `
            <label class="emb-colaborador-item" data-nome="${esc(c.nome.toLowerCase())}" style="display:flex; align-items:center; gap:8px; padding:4px 0; font-weight:400; cursor:pointer;">
              <input type="checkbox" class="emb-colaborador-check" value="${c.id}" ${selecionados.has(c.id) ? 'checked' : ''} onchange="atualizarContadorColaboradoresEmbarque()">
              ${esc(c.nome)} <span style="color:#999; font-size:12px;">${FUNCOES[c.funcao] || esc(c.funcao)}</span>
            </label>
          `).join('')}
      </div>

      <div style="margin-top:16px;">
        <label>Observações</label>
        <textarea id="emb-observacoes" class="form-control" rows="3">${esc(e?.observacoes)}</textarea>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarEmbarque()">${e ? 'Salvar Alterações' : 'Salvar Embarque'}</button>
    </div>
  `

  window.atualizarDiasEmbarque()
  window.atualizarContadorColaboradoresEmbarque()
}

window.abrirFormularioEmbarque = function () {
  abrirFormularioEmbarqueBase(null)
}

window.editarEmbarque = async function (id) {
  const e = await apiFetch(`${API}/embarques/${id}`).then(r => r.json())
  abrirFormularioEmbarqueBase(e)
}

window.atualizarDiasEmbarque = function () {
  const inicio = document.getElementById('emb-dataInicio').value
  const fim = document.getElementById('emb-dataFim').value
  const div = document.getElementById('emb-dias')
  if (!inicio || !fim) { div.textContent = ''; return }
  if (fim < inicio) { div.innerHTML = '<span style="color:#dc3545;">A data de desembarque não pode ser antes da de embarque</span>'; return }
  const dias = diasEntre(inicio, fim)
  div.textContent = `${dias} ${dias === 1 ? 'dia embarcado' : 'dias embarcados'} — gera até ${dias} ${dias === 1 ? 'dia' : 'dias'} de folga pra cada colaborador (dia que cair em folga vira dobra e não gera folga)`
}

window.atualizarContadorColaboradoresEmbarque = function () {
  const n = document.querySelectorAll('.emb-colaborador-check:checked').length
  document.getElementById('emb-contador-colaboradores').textContent = n ? `(${n} selecionado${n > 1 ? 's' : ''})` : ''
}

window.filtrarColaboradoresEmbarque = function (q) {
  const termo = q.trim().toLowerCase()
  document.querySelectorAll('.emb-colaborador-item').forEach(el => {
    el.style.display = el.dataset.nome.includes(termo) ? 'flex' : 'none'
  })
}

// ─── Autocomplete de Embarcação (preenche o armador) e de Armador ─────────────
let embEmbarcacoesBusca = []
let embArmadoresBusca = []

function sugestaoHtml(onclick, titulo, subtitulo = '') {
  return `
    <div onclick="${onclick}" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">
      <strong>${esc(titulo)}</strong>
      ${subtitulo ? `<span style="color:#999; font-size:12px; margin-left:8px;">${esc(subtitulo)}</span>` : ''}
    </div>
  `
}

window.buscarEmbarcacaoEmbarque = async function (q) {
  const div = document.getElementById('emb-sugestoes-embarcacao')
  document.getElementById('emb-embarcacaoId').value = ''
  if (q.length < 2) { div.style.display = 'none'; return }

  embEmbarcacoesBusca = await apiFetch(`${API}/embarcacoes/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())
  div.style.display = 'block'
  div.innerHTML = embEmbarcacoesBusca.length === 0
    ? `<div style="padding:8px 12px; color:#999;">Nenhuma embarcação encontrada — cadastre em Cadastros → Embarcações</div>`
    : embEmbarcacoesBusca.map(e => sugestaoHtml(`selecionarEmbarcacaoEmbarque(${e.id})`, e.nome, e.armador?.nome)).join('')
}

window.selecionarEmbarcacaoEmbarque = function (id) {
  const e = embEmbarcacoesBusca.find(x => x.id === id)
  if (!e) return
  document.getElementById('emb-embarcacao-busca').value = e.nome
  document.getElementById('emb-embarcacaoId').value = e.id
  // Armador vem da embarcação, mas continua trocável
  if (e.armador) {
    document.getElementById('emb-armador-busca').value = e.armador.nome
    document.getElementById('emb-armadorId').value = e.armador.id
  }
  document.getElementById('emb-sugestoes-embarcacao').style.display = 'none'
}

window.buscarArmadorEmbarque = async function (q) {
  const div = document.getElementById('emb-sugestoes-armador')
  document.getElementById('emb-armadorId').value = ''
  if (q.length < 2) { div.style.display = 'none'; return }

  embArmadoresBusca = await apiFetch(`${API}/clientes/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())
  div.style.display = 'block'
  div.innerHTML = embArmadoresBusca.length === 0
    ? `<div style="padding:8px 12px; color:#999;">Nenhum cliente encontrado</div>`
    : embArmadoresBusca.map(c => sugestaoHtml(`selecionarArmadorEmbarque(${c.id})`, c.nome)).join('')
}

window.selecionarArmadorEmbarque = function (id) {
  const c = embArmadoresBusca.find(x => x.id === id)
  if (!c) return
  document.getElementById('emb-armador-busca').value = c.nome
  document.getElementById('emb-armadorId').value = c.id
  document.getElementById('emb-sugestoes-armador').style.display = 'none'
}

document.addEventListener('click', (ev) => {
  for (const [divId, inputId] of [['emb-sugestoes-embarcacao', 'emb-embarcacao-busca'], ['emb-sugestoes-armador', 'emb-armador-busca']]) {
    const div = document.getElementById(divId)
    if (div && !div.contains(ev.target) && ev.target.id !== inputId) div.style.display = 'none'
  }
})

// ─── Salvar ───────────────────────────────────────────────────────────────────
window.salvarEmbarque = async function () {
  const body = {
    embarcacaoId: document.getElementById('emb-embarcacaoId').value,
    armadorId: document.getElementById('emb-armadorId').value,
    dataInicio: document.getElementById('emb-dataInicio').value,
    dataFim: document.getElementById('emb-dataFim').value,
    colaboradorIds: [...document.querySelectorAll('.emb-colaborador-check:checked')].map(el => Number(el.value)),
    observacoes: document.getElementById('emb-observacoes').value.trim(),
  }

  if (!body.embarcacaoId) { alert('Selecione a embarcação na lista de sugestões!'); return }
  if (!body.armadorId) { alert('Selecione o armador na lista de sugestões!'); return }
  if (!body.dataInicio || !body.dataFim) { alert('Informe as datas de embarque e desembarque!'); return }
  if (body.dataFim < body.dataInicio) { alert('A data de desembarque não pode ser antes da de embarque!'); return }
  if (body.colaboradorIds.length === 0) { alert('Selecione ao menos um colaborador!'); return }

  const url = embarqueEmEdicaoId ? `${API}/embarques/${embarqueEmEdicaoId}` : `${API}/embarques`
  const res = await apiJson(url, { method: embarqueEmEdicaoId ? 'PUT' : 'POST', body: JSON.stringify(body) })
  const dados = await res.json()

  if (!res.ok) {
    alert('Erro ao salvar embarque: ' + (dados.erro || ''))
    return
  }

  let msg = `Embarque ${embarqueEmEdicaoId ? 'atualizado' : 'criado'} com sucesso!`
  if (dados.dobras?.length > 0) {
    msg += '\n\nDobras (embarque em dia de folga):\n' + dados.dobras
      .map(d => `• ${d.colaborador.nome}: ${d.datas.map(formatarChaveDia).join(', ')}`)
      .join('\n')
  }
  alert(msg)
  inicializarEmbarques()
}

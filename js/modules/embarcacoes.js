import { esc } from './html.js'
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

// ══════════════════════════════════════════════════════════════════════════
// EMBARCAÇÕES (aba Cadastros → Embarcações)
// ══════════════════════════════════════════════════════════════════════════

const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
const podeExcluirEmbarcacao = ['gerente', 'admin'].includes(usuarioAtual?.perfil || 'usuario')

// Certificados do navio com data de vencimento (campos venc* da Embarcacao)
const CERTIFICADOS_EMBARCACAO = [
  { campo: 'vencLsaBaleeiras', rotulo: 'LSA - Baleeiras' },
  { campo: 'vencBalsa', rotulo: 'Balsa' },
  { campo: 'vencFfe', rotulo: 'FFE' },
  { campo: 'vencIloCrane', rotulo: 'ILO / Crane' },
]
const DIAS_ALERTA_VENCIMENTO = 30

// Vencimentos são datas puras (meia-noite UTC) — formatar em UTC, senão no
// horário de Brasília aparecem um dia antes
function formatarDataEmbarcacao(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'
}

function diasAteVencer(data) {
  const agora = new Date()
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((new Date(data).getTime() - hoje) / 86400000)
}

// Certificado que vence primeiro (inclui os já vencidos), pra coluna da lista
function proximoVencimentoHtml(e) {
  const proximo = CERTIFICADOS_EMBARCACAO
    .filter(c => e[c.campo])
    .sort((a, b) => new Date(e[a.campo]) - new Date(e[b.campo]))[0]
  if (!proximo) return '<span style="color:#999;">-</span>'

  const dias = diasAteVencer(e[proximo.campo])
  const texto = `${proximo.rotulo}: ${formatarDataEmbarcacao(e[proximo.campo])}`
  if (dias < 0) return `<span style="color:#dc3545; font-weight:600;">${texto} (vencido)</span>`
  if (dias <= DIAS_ALERTA_VENCIMENTO) return `<span style="color:#fd7e14; font-weight:600;">${texto} (${dias} dia(s))</span>`
  return texto
}

// Abre a página do navio no MarineTraffic (site público, na aba do usuário) —
// a API deles é paga, então a consulta de porto/ETA fica por conta de quem clica
function botaoMarineTrafficHtml(e, classeTamanho = '') {
  if (!e.imo) return ''
  const url = `https://www.marinetraffic.com/en/ais/details/ships/imo:${encodeURIComponent(e.imo)}`
  return `<a class="btn ${classeTamanho} btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">MarineTraffic</a>`
}

export function inicializarEmbarcacoes() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('embarcacoes').classList.add('active')

  const container = document.getElementById('embarcacoes')
  container.innerHTML = `
    <div class="tab">Embarcações</div>
    <button class="btn btn-success" onclick="abrirFormularioEmbarcacao()">+ Nova Embarcação</button>

    <div class="filtros-grid">
      <input type="text" id="filtro-embarcacao-nome" class="form-control" placeholder="Buscar por nome do navio..." oninput="carregarEmbarcacoes(1)">
      <input type="text" id="filtro-embarcacao-armador" class="form-control" placeholder="Buscar por armador..." oninput="carregarEmbarcacoes(1)">
    </div>

    <div class="table-scroll">
      <table class="table-certificados">
        <thead>
          <tr>
            <th>Navio</th>
            <th>IMO</th>
            <th>Tipo</th>
            <th>Armador</th>
            <th>Porto de Registro</th>
            <th>Próximo vencimento</th>
            <th class="col-acoes">Ações</th>
          </tr>
        </thead>
        <tbody id="tabela-embarcacoes">
          <tr><td colspan="7" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
    <div id="contador-embarcacoes" style="margin-top:12px;"></div>
  `

  carregarEmbarcacoes()
}

let embarcacoesCache = []
let paginaAtualEmbarcacoes = 1

window.carregarEmbarcacoes = async function (pagina = 1) {
  paginaAtualEmbarcacoes = pagina
  const nome = document.getElementById('filtro-embarcacao-nome')?.value || ''
  const armador = document.getElementById('filtro-embarcacao-armador')?.value || ''

  const params = new URLSearchParams()
  if (nome) params.append('nome', nome)
  if (armador) params.append('armador', armador)
  params.append('pagina', pagina)

  try {
    const dados = await apiFetch(`${API}/embarcacoes?${params}`).then(r => r.json())
    embarcacoesCache = dados.embarcacoes || []
    renderizarTabelaEmbarcacoes(embarcacoesCache)

    const contador = document.getElementById('contador-embarcacoes')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${dados.total || 0} embarcações encontradas</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarEmbarcacoes(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarEmbarcacoes(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }
  } catch {
    document.getElementById('tabela-embarcacoes').innerHTML = `
      <tr><td colspan="7" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

function renderizarTabelaEmbarcacoes(embarcacoes) {
  const tabela = document.getElementById('tabela-embarcacoes')

  if (embarcacoes.length === 0) {
    tabela.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#999; padding:30px;">Nenhuma embarcação cadastrada ainda</td></tr>`
    return
  }

  tabela.innerHTML = embarcacoes.map(e => `
    <tr>
      <td style="cursor:pointer;" onclick="editarEmbarcacao(${e.id})">${esc(e.nome)}</td>
      <td>${esc(e.imo || '-')}</td>
      <td>${esc(e.tipo || '-')}</td>
      <td>${esc(e.armador?.nome || '-')}</td>
      <td>${esc(e.portoRegistro || '-')}</td>
      <td style="white-space:nowrap;">${proximoVencimentoHtml(e)}</td>
      <td class="col-acoes">
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          <button class="btn btn-sm btn-info" onclick="editarEmbarcacao(${e.id})">Editar</button>
          ${botaoMarineTrafficHtml(e, 'btn-sm')}
          ${podeExcluirEmbarcacao ? `<button class="btn btn-sm btn-danger" onclick="excluirEmbarcacao(${e.id})">Excluir</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('')
}

window.abrirFormularioEmbarcacao = function () {
  document.getElementById('embarcacoes').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarEmbarcacoes()">← Voltar</button>
      <h3 style="margin:20px 0;">Nova Embarcação</h3>
      ${campoArmadorHtml()}
      <div id="blocos-embarcacao"></div>
      <button type="button" class="btn btn-secondary" style="margin-top:16px;" onclick="adicionarBlocoEmbarcacao()">+ Adicionar outra embarcação</button>
      <div><button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarEmbarcacao()">Salvar</button></div>
    </div>
  `
  adicionarBlocoEmbarcacao()
}

// Cadastro em lote: o armador é um só (campo no topo) e cada embarcação é um
// bloco com os próprios campos. Com um bloco só, a tela fica igual ao cadastro simples.
window.adicionarBlocoEmbarcacao = function () {
  const container = document.getElementById('blocos-embarcacao')
  const bloco = document.createElement('div')
  bloco.className = 'bloco-embarcacao'
  bloco.style = 'background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-top:16px;'
  bloco.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div class="titulo-bloco-embarcacao" style="font-weight:700; color:var(--acento);"></div>
      <button type="button" class="btn btn-sm btn-danger botao-remover-bloco" onclick="removerBlocoEmbarcacao(this)">✕ Remover</button>
    </div>
    ${camposEmbarcacaoHtml()}
  `
  container.appendChild(bloco)
  numerarBlocosEmbarcacao()
  bloco.querySelector('[data-campo="nome"]').focus()
}

window.removerBlocoEmbarcacao = function (btn) {
  btn.closest('.bloco-embarcacao').remove()
  numerarBlocosEmbarcacao()
}

// Numeração bate com a do erro que o backend devolve ("Embarcação 2: ...");
// com um bloco só, nem título nem botão de remover aparecem
function numerarBlocosEmbarcacao() {
  const blocos = document.querySelectorAll('#blocos-embarcacao .bloco-embarcacao')
  blocos.forEach((b, i) => {
    b.querySelector('.titulo-bloco-embarcacao').textContent = blocos.length > 1 ? `Embarcação ${i + 1}` : ''
    b.querySelector('.botao-remover-bloco').style.display = blocos.length > 1 ? '' : 'none'
  })
}

function campoArmadorHtml(e = {}) {
  return `
    <div style="position:relative; margin-bottom:16px;">
      <label>Armador * <small style="color:#999;">(busca por nome ou CPF/CNPJ do cliente já cadastrado)</small></label>
      <input type="text" id="embarcacao-armador-busca" class="form-control"
        placeholder="Digite nome ou CPF/CNPJ..."
        value="${esc(e.armador?.nome || '')}"
        oninput="buscarArmadorEmbarcacao(this.value)" autocomplete="off">
      <div id="sugestoes-armador" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
      <input type="hidden" id="embarcacao-armadorId" value="${e.armadorId || ''}">
    </div>
  `
}

// Campos de uma embarcação, identificados por data-campo (e não id) porque o
// cadastro em lote repete o bloco na mesma tela
function camposEmbarcacaoHtml(e = {}) {
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="grid-column: span 2;"><label>Navio *</label><input type="text" data-campo="nome" class="form-control" value="${esc(e.nome || '')}"></div>
      <div><label>IMO</label><input type="text" data-campo="imo" class="form-control" inputmode="numeric" maxlength="11" placeholder="7 dígitos" value="${esc(e.imo || '')}"></div>
      <div><label>Tipo</label><input type="text" data-campo="tipo" class="form-control" placeholder="Ex: Rebocador, PSV, Graneleiro" value="${esc(e.tipo || '')}"></div>
      <div><label>Porto de Registro</label><input type="text" data-campo="portoRegistro" class="form-control" value="${esc(e.portoRegistro || '')}"></div>
      <div><label>Classe</label><input type="text" data-campo="classe" class="form-control" placeholder="Ex: BV, DNV, ABS" value="${esc(e.classe || '')}"></div>
      <div style="grid-column: span 2;"><label>Supervisor</label><input type="text" data-campo="supervisor" class="form-control" value="${esc(e.supervisor || '')}"></div>
      <div><label>Telefone</label><input type="text" data-campo="telefone" class="form-control" value="${esc(e.telefone || '')}"></div>
      <div><label>Email</label><input type="email" data-campo="email" class="form-control" value="${esc(e.email || '')}"></div>
    </div>

    <h5 style="margin:24px 0 12px;">Vencimento dos certificados</h5>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      ${CERTIFICADOS_EMBARCACAO.map(c => `
        <div><label>${c.rotulo}</label><input type="date" data-campo="${c.campo}" class="form-control" value="${e[c.campo] ? e[c.campo].slice(0, 10) : ''}"></div>
      `).join('')}
    </div>
  `
}

window.buscarArmadorEmbarcacao = async function (q) {
  const div = document.getElementById('sugestoes-armador')
  document.getElementById('embarcacao-armadorId').value = ''

  if (q.length < 2) {
    div.style.display = 'none'
    return
  }

  const results = await apiFetch(`${API}/clientes/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())

  if (results.length === 0) {
    div.innerHTML = `<div style="padding:8px 12px; color:#999;">Nenhum cliente encontrado — cadastre em Cadastros → Clientes primeiro</div>`
    div.style.display = 'block'
    return
  }

  div.style.display = 'block'
  div.innerHTML = results.map(c => `
    <div onclick="selecionarArmadorEmbarcacao(${esc(JSON.stringify(c))})"
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${esc(c.nome)}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${esc(c.cpfCnpj)}</span>
    </div>
  `).join('')
}

window.selecionarArmadorEmbarcacao = function (c) {
  document.getElementById('embarcacao-armador-busca').value = c.nome
  document.getElementById('embarcacao-armadorId').value = c.id
  document.getElementById('sugestoes-armador').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('sugestoes-armador')
  if (div && !div.contains(e.target) && e.target.id !== 'embarcacao-armador-busca') {
    div.style.display = 'none'
  }
})

function lerCamposEmbarcacao(bloco) {
  const body = {}
  bloco.querySelectorAll('[data-campo]').forEach(el => { body[el.dataset.campo] = el.value.trim() })
  return body
}

function armadorSelecionado() {
  return document.getElementById('embarcacao-armadorId').value.trim()
}

window.salvarEmbarcacao = async function () {
  const armadorId = armadorSelecionado()
  const embarcacoes = [...document.querySelectorAll('#blocos-embarcacao .bloco-embarcacao')].map(lerCamposEmbarcacao)
  if (!armadorId) { alert('Selecione o armador na lista de sugestões!'); return }
  const semNome = embarcacoes.findIndex(e => !e.nome)
  if (semNome !== -1) {
    alert(embarcacoes.length > 1 ? `Embarcação ${semNome + 1}: informe o nome do navio!` : 'Informe o nome do navio!')
    return
  }

  const res = await apiJson(`${API}/embarcacoes/lote`, { method: 'POST', body: JSON.stringify({ armadorId, embarcacoes }) })
  if (res.ok) {
    alert(embarcacoes.length > 1 ? `${embarcacoes.length} embarcações cadastradas com sucesso!` : 'Embarcação cadastrada com sucesso!')
    inicializarEmbarcacoes()
  } else {
    const err = await res.json().catch(() => ({}))
    alert('Erro: ' + (err.erro || 'Falha ao cadastrar') + (embarcacoes.length > 1 ? '\n\nNenhuma embarcação foi gravada.' : ''))
  }
}

window.editarEmbarcacao = async function (id) {
  const e = await apiFetch(`${API}/embarcacoes/${id}`).then(r => r.json())

  document.getElementById('embarcacoes').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarEmbarcacoes()">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Embarcação</h3>
      ${campoArmadorHtml(e)}
      <div id="form-embarcacao-edicao">${camposEmbarcacaoHtml(e)}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:20px;">
        <button type="button" class="btn btn-success" onclick="atualizarEmbarcacao(${e.id})">Salvar Alterações</button>
        ${botaoMarineTrafficHtml(e)}
        ${podeExcluirEmbarcacao ? `<button type="button" class="btn btn-danger" onclick="excluirEmbarcacao(${e.id})">Excluir</button>` : ''}
      </div>
    </div>
  `
}

window.atualizarEmbarcacao = async function (id) {
  const body = { armadorId: armadorSelecionado(), ...lerCamposEmbarcacao(document.getElementById('form-embarcacao-edicao')) }
  if (!body.armadorId || !body.nome) {
    alert('Armador e nome do navio são obrigatórios! Selecione o armador na lista de sugestões.')
    return
  }

  const res = await apiJson(`${API}/embarcacoes/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Embarcação atualizada com sucesso!')
    inicializarEmbarcacoes()
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao atualizar'))
  }
}

window.excluirEmbarcacao = async function (id) {
  if (!confirm('Excluir esta embarcação? Essa ação não pode ser desfeita.')) return

  const res = await apiJson(`${API}/embarcacoes/${id}`, { method: 'DELETE' })
  if (res.ok) {
    alert('Embarcação excluída.')
    inicializarEmbarcacoes()
  } else {
    const err = await res.json()
    alert('Erro ao excluir: ' + (err.erro || 'falha'))
  }
}

// Exposta em window para funcionar em onclick inline (ex: botão "← Voltar")
window.inicializarEmbarcacoes = inicializarEmbarcacoes

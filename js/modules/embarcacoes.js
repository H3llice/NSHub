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

export function inicializarEmbarcacoes() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('embarcacoes').classList.add('active')

  const container = document.getElementById('embarcacoes')
  container.innerHTML = `
    <div class="tab">Embarcações</div>
    <button class="btn btn-success" onclick="abrirFormularioEmbarcacao()">+ Nova Embarcação</button>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin: 16px 0;">
      <input type="text" id="filtro-embarcacao-nome" class="form-control" placeholder="Buscar por nome do navio..." oninput="filtrarEmbarcacoes()">
      <select id="filtro-embarcacao-armador" class="form-control" onchange="filtrarEmbarcacoes()">
        <option value="">Todos os armadores</option>
      </select>
    </div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Navio</th>
          <th>Armador</th>
          <th>Porto de Registro</th>
          <th>Telefone</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-embarcacoes">
        <tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarEmbarcacoes()
}

let embarcacoesCache = []

async function carregarEmbarcacoes() {
  try {
    embarcacoesCache = await apiFetch(`${API}/embarcacoes`).then(r => r.json())
    popularFiltroArmadores()
    renderizarTabelaEmbarcacoes(embarcacoesCache)
  } catch {
    document.getElementById('tabela-embarcacoes').innerHTML = `
      <tr><td colspan="5" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

function popularFiltroArmadores() {
  const select = document.getElementById('filtro-embarcacao-armador')
  if (!select) return

  const armadores = [...new Map(embarcacoesCache.map(e => [e.armador.id, e.armador])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome))

  select.innerHTML = '<option value="">Todos os armadores</option>' +
    armadores.map(a => `<option value="${a.id}">${a.nome}</option>`).join('')
}

window.filtrarEmbarcacoes = function () {
  const nome = (document.getElementById('filtro-embarcacao-nome')?.value || '').trim().toLowerCase()
  const armadorId = document.getElementById('filtro-embarcacao-armador')?.value || ''

  const filtradas = embarcacoesCache.filter(e =>
    (!nome || e.nome.toLowerCase().includes(nome)) &&
    (!armadorId || e.armadorId === parseInt(armadorId))
  )
  renderizarTabelaEmbarcacoes(filtradas)
}

function renderizarTabelaEmbarcacoes(embarcacoes) {
  const tabela = document.getElementById('tabela-embarcacoes')

  if (embarcacoes.length === 0) {
    tabela.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">Nenhuma embarcação cadastrada ainda</td></tr>`
    return
  }

  tabela.innerHTML = embarcacoes.map(e => `
    <tr>
      <td>${e.nome}</td>
      <td>${e.armador?.nome || '-'}</td>
      <td>${e.portoRegistro || '-'}</td>
      <td>${e.telefone || '-'}</td>
      <td><button class="btn btn-sm btn-info" onclick="editarEmbarcacao(${e.id})">Editar</button></td>
    </tr>
  `).join('')
}

window.abrirFormularioEmbarcacao = function () {
  document.getElementById('embarcacoes').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarEmbarcacoes()">← Voltar</button>
      <h3 style="margin:20px 0;">Nova Embarcação</h3>
      ${formularioEmbarcacaoHtml()}
      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarEmbarcacao()">Salvar</button>
    </div>
  `
}

function formularioEmbarcacaoHtml(e = {}) {
  return `
    <div style="position:relative; margin-bottom:16px;">
      <label>Armador * <small style="color:#999;">(busca por nome ou CPF/CNPJ do cliente já cadastrado)</small></label>
      <input type="text" id="embarcacao-armador-busca" class="form-control"
        placeholder="Digite nome ou CPF/CNPJ..."
        value="${e.armador?.nome || ''}"
        oninput="buscarArmadorEmbarcacao(this.value)" autocomplete="off">
      <div id="sugestoes-armador" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
      <input type="hidden" id="embarcacao-armadorId" value="${e.armadorId || ''}">
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="grid-column: span 2;"><label>Navio *</label><input type="text" id="embarcacao-nome" class="form-control" value="${e.nome || ''}"></div>
      <div><label>Porto de Registro</label><input type="text" id="embarcacao-portoRegistro" class="form-control" value="${e.portoRegistro || ''}"></div>
      <div><label>Telefone</label><input type="text" id="embarcacao-telefone" class="form-control" value="${e.telefone || ''}"></div>
      <div style="grid-column: span 2;"><label>Email</label><input type="email" id="embarcacao-email" class="form-control" value="${e.email || ''}"></div>
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
    <div onclick='selecionarArmadorEmbarcacao(${JSON.stringify(c)})'
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${c.nome}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${c.cpfCnpj}</span>
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

function lerFormularioEmbarcacao() {
  return {
    armadorId: document.getElementById('embarcacao-armadorId').value,
    nome: document.getElementById('embarcacao-nome').value.trim(),
    portoRegistro: document.getElementById('embarcacao-portoRegistro').value.trim(),
    telefone: document.getElementById('embarcacao-telefone').value.trim(),
    email: document.getElementById('embarcacao-email').value.trim(),
  }
}

window.salvarEmbarcacao = async function () {
  const body = lerFormularioEmbarcacao()
  if (!body.armadorId || !body.nome) {
    alert('Armador e nome do navio são obrigatórios! Selecione o armador na lista de sugestões.')
    return
  }

  const res = await apiJson(`${API}/embarcacoes`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Embarcação cadastrada com sucesso!')
    inicializarEmbarcacoes()
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao cadastrar'))
  }
}

window.editarEmbarcacao = async function (id) {
  const e = await apiFetch(`${API}/embarcacoes/${id}`).then(r => r.json())

  document.getElementById('embarcacoes').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarEmbarcacoes()">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Embarcação</h3>
      ${formularioEmbarcacaoHtml(e)}
      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="atualizarEmbarcacao(${e.id})">Salvar Alterações</button>
    </div>
  `
}

window.atualizarEmbarcacao = async function (id) {
  const body = lerFormularioEmbarcacao()
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

// Exposta em window para funcionar em onclick inline (ex: botão "← Voltar")
window.inicializarEmbarcacoes = inicializarEmbarcacoes

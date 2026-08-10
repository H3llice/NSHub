const API = 'https://override-steerable-professed.ngrok-free.dev'

// ─── Auth helper (mesmo padrão do ocs.js) ─────────────────────────────────────
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

const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
const perfil = usuarioAtual?.perfil || 'usuario'
const podeGerenciar = perfil === 'admin' || perfil === 'gerente'

// ─── Labels de status ─────────────────────────────────────────────────────────
const STATUS_LABEL = {
  disponivel: { texto: 'Disponível', cor: '#198754' },
  locado: { texto: 'Locado', cor: '#0d6efd' },
  vendido: { texto: 'Vendido', cor: '#6c757d' },
}

function badgeStatus(status) {
  const s = STATUS_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

// Guarda a lista completa (sem filtro) recebida do backend, por finalidade
const balsasCache = {}

// ===== RENDERIZA A PÁGINA DE ESTOQUE (locação ou venda) ======================
// finalidade: 'locacao' | 'venda'
export function inicializarEstoque(finalidade) {
  const containerId = finalidade === 'locacao' ? 'estoqueLocacao' : 'estoqueVendas'
  const titulo = finalidade === 'locacao' ? 'Estoque de Locação' : 'Estoque de Vendas'

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById(containerId).classList.add('active')

  const container = document.getElementById(containerId)
  container.innerHTML = `
    <div class="tab">${titulo}</div>
    ${podeGerenciar ? `<button class="btn btn-success" onclick="abrirFormularioBalsa('${finalidade}')">+ Nova Balsa</button>` : ''}

    <div style="margin: 16px 0 8px;">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; width:fit-content;">
        <input type="checkbox" id="toggle-todas-${finalidade}" onchange="carregarBalsasWrapper('${finalidade}')">
        Mostrar todas (inclui locadas/vendidas)
      </label>
    </div>

    <!-- Filtros -->
    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; align-items:end;">
      <div>
        <label style="font-size:12px;">Nº Série</label>
        <input type="text" id="filtro-numeroSerie-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Fabricante</label>
        <input type="text" id="filtro-fabricante-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Modelo</label>
        <input type="text" id="filtro-modelo-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Tipo</label>
        <input type="text" id="filtro-tipo-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Armazém</label>
        <input type="text" id="filtro-armazem-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Ano mín.</label>
        <input type="number" id="filtro-anoMin-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Ano máx.</label>
        <input type="number" id="filtro-anoMax-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Capacidade</label>
        <input type="number" id="filtro-capacidade-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <button class="btn btn-sm btn-outline-secondary" onclick="limparFiltrosBalsa('${finalidade}')">Limpar filtros</button>
      </div>
    </div>

    <div id="contador-balsas-${finalidade}" style="color:#999; font-size:12px; margin-bottom: 8px;"></div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Capacidade</th>
          <th>Fabricante</th>
          <th>Nº Série</th>
          <th>Modelo</th>
          <th>Ano</th>
          <th>Tipo</th>
          <th>Armazém</th>
          <th>Status</th>
          ${podeGerenciar ? '<th>Ações</th>' : ''}
        </tr>
      </thead>
      <tbody id="tabela-balsas-${finalidade}">
        <tr><td colspan="9" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarBalsas(finalidade)
}

// Ordenação fixa: sempre por capacidade, menor para maior
const CAMPO_ORDEM = 'capacidade'
const DIRECAO_ORDEM = 'asc'

const CAMPOS_FILTRO = ['numeroSerie', 'fabricante', 'modelo', 'tipo', 'armazem', 'anoMin', 'anoMax', 'capacidade']

// ===== CARREGA BALSAS DO BACKEND ==============================================
async function carregarBalsas(finalidade) {
  const mostrarTodas = document.getElementById(`toggle-todas-${finalidade}`)?.checked

  try {
    const params = new URLSearchParams({ finalidade })
    if (mostrarTodas) params.append('todas', '1')

    const res = await apiFetch(`${API}/estoque?${params}`)
    const balsas = await res.json()
    balsasCache[finalidade] = balsas

    aplicarFiltros(finalidade, mostrarTodas)
  } catch (err) {
    document.getElementById(`tabela-balsas-${finalidade}`).innerHTML = `
      <tr><td colspan="9" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

// Wrapper acessível globalmente (usado pelo onchange do checkbox)
window.carregarBalsasWrapper = function (finalidade) {
  carregarBalsas(finalidade)
}

// ===== APLICA FILTROS + ORDENAÇÃO (client-side, sobre o cache) ===============
window.aplicarFiltrosBalsa = function (finalidade) {
  const mostrarTodas = document.getElementById(`toggle-todas-${finalidade}`)?.checked
  aplicarFiltros(finalidade, mostrarTodas)
}

window.limparFiltrosBalsa = function (finalidade) {
  CAMPOS_FILTRO.forEach(campo => {
    const el = document.getElementById(`filtro-${campo}-${finalidade}`)
    if (el) el.value = ''
  })
  aplicarFiltrosBalsa(finalidade)
}

function aplicarFiltros(finalidade, mostrarTodas) {
  let balsas = [...(balsasCache[finalidade] || [])]

  const texto = campo => (document.getElementById(`filtro-${campo}-${finalidade}`)?.value || '').trim().toLowerCase()
  const numero = campo => {
    const v = document.getElementById(`filtro-${campo}-${finalidade}`)?.value
    return v ? Number(v) : null
  }

  const fNumeroSerie = texto('numeroSerie')
  const fFabricante = texto('fabricante')
  const fModelo = texto('modelo')
  const fTipo = texto('tipo')
  const fArmazem = texto('armazem')
  const anoMin = numero('anoMin')
  const anoMax = numero('anoMax')
  const capacidade = numero('capacidade')

  if (fNumeroSerie) balsas = balsas.filter(b => b.numeroSerie.toLowerCase().includes(fNumeroSerie))
  if (fFabricante) balsas = balsas.filter(b => b.fabricante.toLowerCase().includes(fFabricante))
  if (fModelo) balsas = balsas.filter(b => b.modelo.toLowerCase().includes(fModelo))
  if (fTipo) balsas = balsas.filter(b => b.tipo.toLowerCase().includes(fTipo))
  if (fArmazem) balsas = balsas.filter(b => (b.armazem || '').toLowerCase().includes(fArmazem))
  if (anoMin !== null) balsas = balsas.filter(b => b.anoFabricacao >= anoMin)
  if (anoMax !== null) balsas = balsas.filter(b => b.anoFabricacao <= anoMax)
  if (capacidade !== null) balsas = balsas.filter(b => b.capacidade === capacidade)

  balsas.sort((a, b) => {
    let valA = a[CAMPO_ORDEM]
    let valB = b[CAMPO_ORDEM]
    if (typeof valA === 'string') {
      valA = valA.toLowerCase()
      valB = (valB || '').toLowerCase()
    }
    if (valA < valB) return DIRECAO_ORDEM === 'asc' ? -1 : 1
    if (valA > valB) return DIRECAO_ORDEM === 'asc' ? 1 : -1
    return 0
  })

  renderizarTabela(finalidade, balsas)

  const contador = document.getElementById(`contador-balsas-${finalidade}`)
  if (contador) {
    const totalCache = (balsasCache[finalidade] || []).length
    contador.textContent = balsas.length === totalCache
      ? `${balsas.length} balsa(s) ${mostrarTodas ? 'no total' : 'disponível(is)'}`
      : `${balsas.length} de ${totalCache} balsa(s) (filtro aplicado)`
  }
}

// ===== RENDERIZA A TABELA =====================================================
function renderizarTabela(finalidade, balsas) {
  const tabela = document.getElementById(`tabela-balsas-${finalidade}`)
  const colspan = podeGerenciar ? 9 : 8

  if (balsas.length === 0) {
    tabela.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999; padding:30px;">Nenhuma balsa encontrada</td></tr>`
    return
  }

  tabela.innerHTML = balsas.map(b => `
    <tr>
      <td><strong>${b.capacidade}</strong></td>
      <td>${b.fabricante}</td>
      <td>${b.numeroSerie}</td>
      <td>${b.modelo}</td>
      <td>${b.anoFabricacao}</td>
      <td>${b.tipo}</td>
      <td>${b.armazem || '-'}</td>
      <td>${badgeStatus(b.status)}</td>
      ${podeGerenciar ? `
        <td style="white-space:nowrap;">
          <button class="btn btn-sm btn-info" onclick="editarBalsa(${b.id}, '${finalidade}')">Editar</button>
          ${b.status === 'disponivel' && finalidade === 'locacao'
        ? `<button class="btn btn-sm btn-warning" onclick="marcarStatusBalsa(${b.id}, 'locado', '${finalidade}')">Marcar locado</button>`
        : ''}
          ${b.status === 'disponivel'
        ? `<button class="btn btn-sm btn-secondary" onclick="marcarStatusBalsa(${b.id}, 'vendido', '${finalidade}')">Marcar vendido</button>`
        : ''}
          ${b.status !== 'disponivel'
        ? `<button class="btn btn-sm btn-success" onclick="marcarStatusBalsa(${b.id}, 'disponivel', '${finalidade}')">Reativar</button>`
        : ''}
        </td>
      ` : ''}
    </tr>
  `).join('')
}

// ===== MARCA STATUS (locado / vendido / disponível novamente) ================
window.marcarStatusBalsa = async function (id, status, finalidade) {
  const confirmacoes = {
    locado: 'Marcar esta balsa como locada? Ela sairá da lista de disponíveis.',
    vendido: 'Marcar esta balsa como vendida? Ela sairá da lista de disponíveis.',
    disponivel: 'Marcar esta balsa como disponível novamente?',
  }
  if (!confirm(confirmacoes[status] || 'Confirmar alteração de status?')) return

  const res = await apiJson(`${API}/estoque/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  })

  if (res.ok) {
    carregarBalsas(finalidade)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao atualizar status'))
  }
}

// ===== FORMULÁRIO — NOVA BALSA =================================================
window.abrirFormularioBalsa = function (finalidade) {
  const containerId = finalidade === 'locacao' ? 'estoqueLocacao' : 'estoqueVendas'

  document.getElementById(containerId).innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarEstoqueWrapper('${finalidade}')">← Voltar</button>
      <h3 style="margin:20px 0;">Nova Balsa</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Fabricante *</label><input type="text" id="balsa-fabricante" class="form-control"></div>
        <div><label>Nº de Série *</label><input type="text" id="balsa-numeroSerie" class="form-control"></div>
        <div><label>Modelo *</label><input type="text" id="balsa-modelo" class="form-control"></div>
        <div><label>Ano de Fabricação *</label><input type="number" id="balsa-anoFabricacao" class="form-control"></div>
        <div><label>Capacidade *</label><input type="number" id="balsa-capacidade" class="form-control"></div>
        <div><label>Tipo *</label><input type="text" id="balsa-tipo" class="form-control" placeholder="Ex: balsa, baleeira..."></div>
        <div><label>Armazém</label><input type="text" id="balsa-armazem" class="form-control"></div>
      </div>

      <input type="hidden" id="balsa-finalidade" value="${finalidade}">

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarBalsa('${finalidade}')">Salvar Balsa</button>
    </div>
  `
}

window.salvarBalsa = async function (finalidade) {
  const body = {
    fabricante: document.getElementById('balsa-fabricante').value.trim(),
    numeroSerie: document.getElementById('balsa-numeroSerie').value.trim(),
    modelo: document.getElementById('balsa-modelo').value.trim(),
    anoFabricacao: parseInt(document.getElementById('balsa-anoFabricacao').value) || null,
    capacidade: parseInt(document.getElementById('balsa-capacidade').value) || null,
    tipo: document.getElementById('balsa-tipo').value.trim(),
    armazem: document.getElementById('balsa-armazem').value.trim(),
    finalidade,
  }

  if (!body.fabricante || !body.numeroSerie || !body.modelo || !body.anoFabricacao || !body.capacidade || !body.tipo) {
    alert('Preencha todos os campos obrigatórios!')
    return
  }

  const res = await apiJson(`${API}/estoque`, {
    method: 'POST',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    alert('Balsa cadastrada com sucesso!')
    inicializarEstoqueWrapper(finalidade)
  } else {
    const err = await res.json()
    alert('Erro ao cadastrar balsa: ' + (err.erro || ''))
  }
}

// ===== FORMULÁRIO — EDITAR BALSA ===============================================
window.editarBalsa = async function (id, finalidade) {
  const containerId = finalidade === 'locacao' ? 'estoqueLocacao' : 'estoqueVendas'
  const b = await apiFetch(`${API}/estoque/${id}`).then(r => r.json())

  document.getElementById(containerId).innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarEstoqueWrapper('${finalidade}')">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Balsa ${badgeStatus(b.status)}</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Fabricante *</label><input type="text" id="balsa-fabricante" class="form-control" value="${b.fabricante}"></div>
        <div><label>Nº de Série *</label><input type="text" id="balsa-numeroSerie" class="form-control" value="${b.numeroSerie}"></div>
        <div><label>Modelo *</label><input type="text" id="balsa-modelo" class="form-control" value="${b.modelo}"></div>
        <div><label>Ano de Fabricação *</label><input type="number" id="balsa-anoFabricacao" class="form-control" value="${b.anoFabricacao}"></div>
        <div><label>Capacidade *</label><input type="number" id="balsa-capacidade" class="form-control" value="${b.capacidade}"></div>
        <div><label>Tipo *</label><input type="text" id="balsa-tipo" class="form-control" value="${b.tipo}"></div>
        <div><label>Armazém</label><input type="text" id="balsa-armazem" class="form-control" value="${b.armazem || ''}"></div>
        <div>
          <label>Finalidade</label>
          <select id="balsa-finalidade" class="form-control">
            <option value="locacao" ${b.finalidade === 'locacao' ? 'selected' : ''}>Locação</option>
            <option value="venda" ${b.finalidade === 'venda' ? 'selected' : ''}>Venda</option>
          </select>
        </div>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="atualizarBalsa(${b.id}, '${finalidade}')">Salvar Alterações</button>
    </div>
  `
}

window.atualizarBalsa = async function (id, finalidadeOrigem) {
  const body = {
    fabricante: document.getElementById('balsa-fabricante').value.trim(),
    numeroSerie: document.getElementById('balsa-numeroSerie').value.trim(),
    modelo: document.getElementById('balsa-modelo').value.trim(),
    anoFabricacao: parseInt(document.getElementById('balsa-anoFabricacao').value) || null,
    capacidade: parseInt(document.getElementById('balsa-capacidade').value) || null,
    tipo: document.getElementById('balsa-tipo').value.trim(),
    armazem: document.getElementById('balsa-armazem').value.trim(),
    finalidade: document.getElementById('balsa-finalidade').value,
  }

  const res = await apiJson(`${API}/estoque/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    alert('Balsa atualizada com sucesso!')
    inicializarEstoqueWrapper(finalidadeOrigem)
  } else {
    const err = await res.json()
    alert('Erro ao atualizar balsa: ' + (err.erro || ''))
  }
}

// Wrapper acessível globalmente (usado pelos onclick inline do HTML)
window.inicializarEstoqueWrapper = function (finalidade) {
  inicializarEstoque(finalidade)
}
const API = 'https://override-steerable-professed.ngrok-free.dev'

// ─── Auth helper (mesmo padrão do ocs.js) ─────────────────────────────────────
function apiFetch(url, options = {}) {
  const token = localStorage.getItem('ns_token')
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true'
    }
  })
}

function apiJson(url, options = {}) {
  const token = localStorage.getItem('ns_token')
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {})
    }
  })
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

    <div id="contador-balsas-${finalidade}" style="color:#999; font-size:12px; margin: 16px 0 8px;"></div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Nº Série</th>
          <th>Fabricante</th>
          <th>Modelo</th>
          <th>Ano</th>
          <th>Capacidade</th>
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

// ===== CARREGA BALSAS DO BACKEND ==============================================
async function carregarBalsas(finalidade) {
  try {
    const res = await apiFetch(`${API}/estoque?finalidade=${finalidade}`)
    const balsas = await res.json()
    renderizarTabela(finalidade, balsas)

    const contador = document.getElementById(`contador-balsas-${finalidade}`)
    if (contador) {
      contador.textContent = `${balsas.length} balsa(s) disponível(is)`
    }
  } catch (err) {
    document.getElementById(`tabela-balsas-${finalidade}`).innerHTML = `
      <tr><td colspan="9" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

// ===== RENDERIZA A TABELA =====================================================
function renderizarTabela(finalidade, balsas) {
  const tabela = document.getElementById(`tabela-balsas-${finalidade}`)
  const colspan = podeGerenciar ? 9 : 8

  if (balsas.length === 0) {
    tabela.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999; padding:30px;">Nenhuma balsa disponível no momento</td></tr>`
    return
  }

  tabela.innerHTML = balsas.map(b => `
    <tr>
      <td>${b.numeroSerie}</td>
      <td>${b.fabricante}</td>
      <td>${b.modelo}</td>
      <td>${b.anoFabricacao}</td>
      <td>${b.capacidade}</td>
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
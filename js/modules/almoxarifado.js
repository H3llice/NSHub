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

const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
const perfil = usuarioAtual?.perfil || 'usuario'
const podeGerenciar = perfil === 'admin' || perfil === 'gerente'

function formatarMoedaAlmox(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// 'inventario' | 'pedidos'
let modoAlmox = 'inventario'
let produtosCacheAlmox = []

// ===== RENDERIZA A PÁGINA DE ALMOXARIFADO =====================================
export function inicializarAlmoxarifado() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('almoxarifado').classList.add('active')

  const container = document.getElementById('almoxarifado')
  container.innerHTML = `
    <div class="tab">Almoxarifado</div>

    <div style="display:flex; gap:8px; margin-bottom:16px;">
      ${podeGerenciar ? `<button class="btn btn-success" onclick="abrirFormularioProdutoAlmox()">+ Novo Produto</button>` : ''}
      <button class="btn btn-warning" onclick="abrirFormularioPedidoAlmox()">+ Novo Pedido</button>
    </div>

    <div style="margin: 0 0 16px;">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; width:fit-content;">
        <input type="checkbox" id="toggle-modo-almox" ${modoAlmox === 'pedidos' ? 'checked' : ''} onchange="alternarModoAlmox()">
        Mostrar pedidos
      </label>
    </div>

    <div id="conteudo-almox">
      <p style="text-align:center; color:#999; padding:30px;">Carregando...</p>
    </div>
  `

  if (modoAlmox === 'pedidos') {
    carregarPedidosAlmox()
  } else {
    carregarProdutosAlmox()
  }
}

window.alternarModoAlmox = function () {
  modoAlmox = document.getElementById('toggle-modo-almox').checked ? 'pedidos' : 'inventario'
  inicializarAlmoxarifado()
}

// Wrapper acessível globalmente (usado pelos onclick inline do HTML)
window.inicializarAlmoxarifadoWrapper = function () {
  inicializarAlmoxarifado()
}

// ===== INVENTÁRIO DE PRODUTOS ==================================================
async function carregarProdutosAlmox() {
  const container = document.getElementById('conteudo-almox')
  try {
    const produtos = await apiFetch(`${API}/almoxarifado/produtos`).then(r => r.json())
    produtosCacheAlmox = produtos
    renderizarTabelaProdutosAlmox(produtos)
  } catch (err) {
    container.innerHTML = '<p style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</p>'
  }
}

function renderizarTabelaProdutosAlmox(produtos) {
  const container = document.getElementById('conteudo-almox')
  const colspan = podeGerenciar ? 6 : 5

  if (produtos.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#999; padding:30px;">Nenhum produto cadastrado ainda</p>`
    return
  }

  container.innerHTML = `
    <table class="table-certificados">
      <thead>
        <tr>
          <th>Código</th>
          <th>Material</th>
          <th>Unidade</th>
          <th>Valor</th>
          <th>Qtd. disponível</th>
          ${podeGerenciar ? '<th>Ações</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${produtos.map(p => `
          <tr>
            <td>${p.codigo}</td>
            <td>${p.nome}</td>
            <td>${p.unidade}</td>
            <td>${formatarMoedaAlmox(p.valor)}</td>
            <td><strong>${p.quantidade}</strong></td>
            ${podeGerenciar ? `<td><button class="btn btn-sm btn-info" onclick="editarProdutoAlmox(${p.id})">Editar</button></td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

// ===== FORMULÁRIO — NOVO PRODUTO ===============================================
window.abrirFormularioProdutoAlmox = function () {
  document.getElementById('almoxarifado').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarAlmoxarifadoWrapper()">← Voltar</button>
      <h3 style="margin:20px 0;">Novo Produto</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Código *</label><input type="text" id="prod-codigo" class="form-control"></div>
        <div><label>Material *</label><input type="text" id="prod-nome" class="form-control"></div>
        <div><label>Unidade de medida *</label><input type="text" id="prod-unidade" class="form-control" placeholder="Ex: unidade, kit, kg..."></div>
        <div><label>Valor (R$)</label><input type="number" step="0.01" id="prod-valor" class="form-control"></div>
        <div><label>Quantidade inicial</label><input type="number" step="0.01" id="prod-quantidade" class="form-control" value="0"></div>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarProdutoAlmox()">Salvar Produto</button>
    </div>
  `
}

window.salvarProdutoAlmox = async function () {
  const body = {
    codigo: document.getElementById('prod-codigo').value.trim(),
    nome: document.getElementById('prod-nome').value.trim(),
    unidade: document.getElementById('prod-unidade').value.trim(),
    valor: document.getElementById('prod-valor').value,
    quantidade: document.getElementById('prod-quantidade').value,
  }

  if (!body.codigo || !body.nome || !body.unidade) {
    alert('Preencha código, material e unidade!')
    return
  }

  const res = await apiJson(`${API}/almoxarifado/produtos`, {
    method: 'POST',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    alert('Produto cadastrado com sucesso!')
    inicializarAlmoxarifadoWrapper()
  } else {
    const err = await res.json()
    alert('Erro ao cadastrar produto: ' + (err.erro || ''))
  }
}

// ===== FORMULÁRIO — EDITAR PRODUTO =============================================
window.editarProdutoAlmox = async function (id) {
  const p = await apiFetch(`${API}/almoxarifado/produtos/${id}`).then(r => r.json())

  document.getElementById('almoxarifado').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarAlmoxarifadoWrapper()">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Produto</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Código *</label><input type="text" id="prod-codigo" class="form-control" value="${p.codigo}"></div>
        <div><label>Material *</label><input type="text" id="prod-nome" class="form-control" value="${p.nome}"></div>
        <div><label>Unidade de medida *</label><input type="text" id="prod-unidade" class="form-control" value="${p.unidade}"></div>
        <div><label>Valor (R$)</label><input type="number" step="0.01" id="prod-valor" class="form-control" value="${p.valor ?? ''}"></div>
        <div><label>Quantidade em estoque</label><input type="number" step="0.01" id="prod-quantidade" class="form-control" value="${p.quantidade}"></div>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="atualizarProdutoAlmox(${p.id})">Salvar Alterações</button>
    </div>
  `
}

window.atualizarProdutoAlmox = async function (id) {
  const body = {
    codigo: document.getElementById('prod-codigo').value.trim(),
    nome: document.getElementById('prod-nome').value.trim(),
    unidade: document.getElementById('prod-unidade').value.trim(),
    valor: document.getElementById('prod-valor').value,
    quantidade: document.getElementById('prod-quantidade').value,
  }

  const res = await apiJson(`${API}/almoxarifado/produtos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    alert('Produto atualizado com sucesso!')
    inicializarAlmoxarifadoWrapper()
  } else {
    const err = await res.json()
    alert('Erro ao atualizar produto: ' + (err.erro || ''))
  }
}

// ===== HISTÓRICO DE PEDIDOS =====================================================
async function carregarPedidosAlmox() {
  const container = document.getElementById('conteudo-almox')
  try {
    const pedidos = await apiFetch(`${API}/almoxarifado/pedidos`).then(r => r.json())
    renderizarTabelaPedidosAlmox(pedidos)
  } catch (err) {
    container.innerHTML = '<p style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</p>'
  }
}

function renderizarTabelaPedidosAlmox(pedidos) {
  const container = document.getElementById('conteudo-almox')

  if (pedidos.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#999; padding:30px;">Nenhum pedido registrado ainda</p>`
    return
  }

  container.innerHTML = `
    <table class="table-certificados">
      <thead>
        <tr>
          <th>Número</th>
          <th>Data</th>
          <th>Solicitante</th>
          <th>Itens</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${pedidos.map(p => `
          <tr>
            <td>${p.numero}.${p.ano}</td>
            <td>${new Date(p.criadoEm).toLocaleDateString('pt-BR')}</td>
            <td>${p.solicitante?.nome || '-'}</td>
            <td>${p.itens.length}</td>
            <td><button class="btn btn-sm btn-info" onclick="verPedidoAlmox(${p.id})">Ver detalhes</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

// ===== FORMULÁRIO — NOVO PEDIDO =================================================
window.almoxPedidoEstado = { itens: [] }

function novoItemPedidoAlmox() {
  window.almoxPedidoEstado.itens.push({ produtoId: '', quantidade: '' })
}

function renderizarItensPedidoAlmox() {
  const container = document.getElementById('lista-itens-pedido-almox')
  if (!container) return

  container.innerHTML = window.almoxPedidoEstado.itens.map((item, i) => `
    <div style="display:grid; grid-template-columns: 1fr 100px 40px; gap:8px; margin-bottom:8px;">
      <select class="form-control" onchange="almoxPedidoEstado.itens[${i}].produtoId = this.value">
        <option value="">Selecione um produto...</option>
        ${produtosCacheAlmox.map(p => `
          <option value="${p.id}" ${String(item.produtoId) === String(p.id) ? 'selected' : ''}>
            ${p.codigo} — ${p.nome} (disp: ${p.quantidade} ${p.unidade})
          </option>
        `).join('')}
      </select>
      <input type="number" step="0.01" class="form-control" placeholder="Qtd" value="${item.quantidade}" oninput="almoxPedidoEstado.itens[${i}].quantidade = this.value">
      <button class="btn btn-sm btn-danger" onclick="removerItemPedidoAlmox(${i})">✕</button>
    </div>
  `).join('')
}

window.adicionarItemPedidoAlmox = function () {
  novoItemPedidoAlmox()
  renderizarItensPedidoAlmox()
}

window.removerItemPedidoAlmox = function (i) {
  window.almoxPedidoEstado.itens.splice(i, 1)
  renderizarItensPedidoAlmox()
}

window.abrirFormularioPedidoAlmox = async function () {
  produtosCacheAlmox = await apiFetch(`${API}/almoxarifado/produtos`).then(r => r.json())

  window.almoxPedidoEstado = { itens: [] }
  novoItemPedidoAlmox()

  document.getElementById('almoxarifado').innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarAlmoxarifadoWrapper()">← Voltar</button>
      <h3 style="margin:20px 0;">Novo Pedido de Almoxarifado</h3>

      <div style="margin-bottom:16px;">
        <label>Observações</label>
        <textarea id="pedido-almox-observacoes" class="form-control" rows="2"></textarea>
      </div>

      <h5 style="margin: 20px 0 10px;">Itens</h5>
      <div id="lista-itens-pedido-almox"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="adicionarItemPedidoAlmox()">+ Item</button>

      <button type="button" class="btn btn-success" style="margin-top:24px; display:block;" onclick="salvarPedidoAlmox()">Salvar Pedido</button>
    </div>
  `

  renderizarItensPedidoAlmox()
}

window.salvarPedidoAlmox = async function () {
  const itens = window.almoxPedidoEstado.itens.filter(i => i.produtoId && i.quantidade)

  if (itens.length === 0) {
    alert('Adicione ao menos um item com produto e quantidade!')
    return
  }

  const body = {
    observacoes: document.getElementById('pedido-almox-observacoes').value,
    itens
  }

  const res = await apiJson(`${API}/almoxarifado/pedidos`, {
    method: 'POST',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    alert('Pedido registrado com sucesso!')
    modoAlmox = 'inventario'
    inicializarAlmoxarifadoWrapper()
  } else {
    const err = await res.json()
    if (err.itens?.length) {
      alert('Estoque insuficiente para:\n' + err.itens.join('\n'))
    } else {
      alert('Erro ao registrar pedido: ' + (err.erro || ''))
    }
  }
}

// ===== VER DETALHES DE UM PEDIDO ================================================
window.verPedidoAlmox = async function (id) {
  const p = await apiFetch(`${API}/almoxarifado/pedidos/${id}`).then(r => r.json())

  const total = p.itens.reduce((acc, i) => acc + (i.valorUni || 0) * i.quantidade, 0)

  document.getElementById('almoxarifado').innerHTML = `
    <div style="margin-top:20px; max-width:800px;">
      <button class="btn btn-secondary" onclick="inicializarAlmoxarifadoWrapper()">← Voltar</button>

      <div style="display:flex; align-items:center; gap:12px; margin:20px 0;">
        <h3 style="margin:0;">Pedido de Almoxarifado ${p.numero}.${p.ano}</h3>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:13px;">
          <div><span style="color:#999;">Data</span><br><strong>${new Date(p.criadoEm).toLocaleDateString('pt-BR')}</strong></div>
          <div><span style="color:#999;">Solicitante</span><br><strong>${p.solicitante?.nome || '-'}</strong></div>
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Itens</div>
        <table class="table-certificados">
          <thead>
            <tr><th>Código</th><th>Material</th><th>Qtd.</th><th>Valor Uni.</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            ${p.itens.map(i => `
              <tr>
                <td>${i.produto.codigo}</td>
                <td>${i.produto.nome}</td>
                <td>${i.quantidade} ${i.produto.unidade}</td>
                <td>${formatarMoedaAlmox(i.valorUni)}</td>
                <td>${formatarMoedaAlmox((i.valorUni || 0) * i.quantidade)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align:right; margin-top:10px; font-weight:700;">Total: ${formatarMoedaAlmox(total)}</div>
      </div>

      ${p.observacoes ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:#158815; margin-bottom:8px;">Observações</div>
          <div style="font-size:13px; color:#444;">${p.observacoes}</div>
        </div>
      ` : ''}
    </div>
  `
}

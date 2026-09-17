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
const isAdminProdServ = perfil === 'admin'

function formatarMoedaProdServ(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ══════════════════════════════════════════════════════════════════════════
// PRODUTOS E SERVIÇOS (aba Cadastros → Produtos e Serviços)
//
// Catálogo de precificação: reúne os produtos já cadastrados no Almoxarifado
// (estoque é gerenciado lá — aqui é só consulta de preço) com os Serviços
// (sem estoque, cadastro/edição fica nesta tela).
// ══════════════════════════════════════════════════════════════════════════

export function inicializarProdutosServicos() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('produtosServicos').classList.add('active')

  const container = document.getElementById('produtosServicos')
  container.innerHTML = `
    <div class="tab">Produtos e Serviços</div>

    <h5 style="margin: 20px 0 10px;">Produtos</h5>
    <p style="color:#999; font-size:13px; margin-bottom:10px;">
      Estoque de produtos fica em Estoque → Almoxarifado. Aqui também é possível cadastrar novos produtos.
    </p>
    ${podeGerenciar ? `<button class="btn btn-success" onclick="abrirFormularioProdutoCatalogo()">+ Novo Produto</button>` : ''}
    <table class="table-certificados" style="margin-top:16px;">
      <thead>
        <tr>
          <th>Código</th><th>Material</th><th>Unidade</th><th>Valor</th>
          ${isAdminProdServ ? '<th>Ações</th>' : ''}
        </tr>
      </thead>
      <tbody id="tabela-produtos-catalogo">
        <tr><td colspan="${isAdminProdServ ? 5 : 4}" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
    <div id="contador-produtos-catalogo" style="margin-top:12px;"></div>

    <h5 style="margin: 32px 0 10px;">Serviços</h5>
    ${podeGerenciar ? `<button class="btn btn-success" onclick="abrirFormularioServico()">+ Novo Serviço</button>` : ''}
    <table class="table-certificados" style="margin-top:16px;">
      <thead>
        <tr>
          <th>Nome</th>
          <th>Descrição</th>
          <th>Valor</th>
          ${podeGerenciar ? '<th>Ações</th>' : ''}
        </tr>
      </thead>
      <tbody id="tabela-servicos-catalogo">
        <tr><td colspan="${podeGerenciar ? 4 : 3}" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
    <div id="contador-servicos-catalogo" style="margin-top:12px;"></div>
  `

  carregarProdutosCatalogo()
  carregarServicosCatalogo()
}

// Exposta em window para funcionar em onclick inline (ex: botão "← Voltar")
window.inicializarProdutosServicos = inicializarProdutosServicos

// ===== PRODUTOS ==================================================================
let paginaAtualProdutosCatalogo = 1

window.carregarProdutosCatalogo = async function (pagina = 1) {
  paginaAtualProdutosCatalogo = pagina
  const tabela = document.getElementById('tabela-produtos-catalogo')
  const colspan = isAdminProdServ ? 5 : 4
  try {
    const dados = await apiFetch(`${API}/almoxarifado/produtos?pagina=${pagina}`).then(r => r.json())
    const produtos = dados.produtos || []

    const contador = document.getElementById('contador-produtos-catalogo')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${dados.total || 0} produtos encontrados</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarProdutosCatalogo(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarProdutosCatalogo(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }

    if (produtos.length === 0) {
      tabela.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999; padding:30px;">Nenhum produto cadastrado ainda</td></tr>`
      return
    }

    tabela.innerHTML = produtos.map(p => `
      <tr>
        <td>${p.codigo}</td>
        <td>${p.nome}</td>
        <td>${p.unidade}</td>
        <td>${formatarMoedaProdServ(p.valor)}</td>
        ${isAdminProdServ ? `<td><button class="btn btn-sm btn-danger" onclick="excluirProdutoCatalogo(${p.id})">Excluir</button></td>` : ''}
      </tr>
    `).join('')
  } catch {
    tabela.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>`
  }
}

window.abrirFormularioProdutoCatalogo = function () {
  document.getElementById('produtosServicos').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarProdutosServicos()">← Voltar</button>
      <h3 style="margin:20px 0;">Novo Produto</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Código *</label><input type="text" id="prod-codigo" class="form-control"></div>
        <div><label>Material *</label><input type="text" id="prod-nome" class="form-control"></div>
        <div><label>Unidade de medida *</label><input type="text" id="prod-unidade" class="form-control" placeholder="Ex: unidade, kit, kg..."></div>
        <div><label>Valor (R$)</label><input type="number" step="0.01" id="prod-valor" class="form-control"></div>
        <div><label>Quantidade inicial</label><input type="number" step="0.01" id="prod-quantidade" class="form-control" value="0"></div>
        <div>
          <label>Quantidade crítica</label>
          <input type="number" step="0.01" id="prod-quantidade-critica" class="form-control" value="0">
          <small style="color:#999;">Gera alerta quando a qtd. disponível ficar igual ou menor que esse número</small>
        </div>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarProdutoCatalogo()">Salvar Produto</button>
    </div>
  `
}

window.salvarProdutoCatalogo = async function () {
  const body = {
    codigo: document.getElementById('prod-codigo').value.trim(),
    nome: document.getElementById('prod-nome').value.trim(),
    unidade: document.getElementById('prod-unidade').value.trim(),
    valor: document.getElementById('prod-valor').value,
    quantidade: document.getElementById('prod-quantidade').value,
    quantidadeCritica: document.getElementById('prod-quantidade-critica').value,
  }

  if (!body.codigo || !body.nome || !body.unidade) {
    alert('Preencha código, material e unidade!')
    return
  }

  const res = await apiJson(`${API}/almoxarifado/produtos`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Produto cadastrado com sucesso!')
    inicializarProdutosServicos()
  } else {
    const err = await res.json()
    alert('Erro ao cadastrar produto: ' + (err.erro || ''))
  }
}

window.excluirProdutoCatalogo = async function (id) {
  if (!confirm('Excluir este produto? Essa ação não pode ser desfeita.')) return

  const res = await apiJson(`${API}/almoxarifado/produtos/${id}`, { method: 'DELETE' })
  if (res.ok) {
    inicializarProdutosServicos()
  } else {
    const err = await res.json()
    alert('Erro ao excluir produto: ' + (err.erro || ''))
  }
}

// ===== SERVIÇOS ==================================================================
let servicosCache = []
let paginaAtualServicosCatalogo = 1

window.carregarServicosCatalogo = async function (pagina = 1) {
  paginaAtualServicosCatalogo = pagina
  const tabela = document.getElementById('tabela-servicos-catalogo')
  try {
    const dados = await apiFetch(`${API}/servicos?pagina=${pagina}`).then(r => r.json())
    servicosCache = dados.servicos || []
    renderizarTabelaServicos(servicosCache, dados)
  } catch {
    tabela.innerHTML = `<tr><td colspan="${podeGerenciar ? 4 : 3}" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>`
  }
}

function renderizarTabelaServicos(servicos, dados) {
  const tabela = document.getElementById('tabela-servicos-catalogo')
  const colspan = podeGerenciar ? 4 : 3
  const pagina = dados.pagina || 1

  const contador = document.getElementById('contador-servicos-catalogo')
  if (contador) {
    contador.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span>${dados.total || 0} serviços encontrados</span>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn btn-sm btn-secondary" onclick="carregarServicosCatalogo(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
          <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
          <button class="btn btn-sm btn-secondary" onclick="carregarServicosCatalogo(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
        </div>
      </div>
    `
  }

  if (servicos.length === 0) {
    tabela.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999; padding:30px;">Nenhum serviço cadastrado ainda</td></tr>`
    return
  }

  tabela.innerHTML = servicos.map(s => `
    <tr>
      <td>${s.nome}</td>
      <td>${s.descricao || '-'}</td>
      <td>${formatarMoedaProdServ(s.valor)}</td>
      ${podeGerenciar ? `<td>
        <button class="btn btn-sm btn-info" onclick="editarServico(${s.id})">Editar</button>
        ${isAdminProdServ ? `<button class="btn btn-sm btn-danger" style="margin-left:6px;" onclick="excluirServico(${s.id})">Excluir</button>` : ''}
      </td>` : ''}
    </tr>
  `).join('')
}

window.abrirFormularioServico = function () {
  document.getElementById('produtosServicos').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarProdutosServicos()">← Voltar</button>
      <h3 style="margin:20px 0;">Novo Serviço</h3>

      <div><label>Nome *</label><input type="text" id="servico-nome" class="form-control"></div>
      <div style="margin-top:16px;"><label>Descrição</label><textarea id="servico-descricao" class="form-control" rows="2"></textarea></div>
      <div style="margin-top:16px;"><label>Valor (R$)</label><input type="number" step="0.01" id="servico-valor" class="form-control"></div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarServico()">Salvar Serviço</button>
    </div>
  `
}

function lerFormularioServico() {
  return {
    nome: document.getElementById('servico-nome').value.trim(),
    descricao: document.getElementById('servico-descricao').value.trim(),
    valor: document.getElementById('servico-valor').value,
  }
}

window.salvarServico = async function () {
  const body = lerFormularioServico()
  if (!body.nome) {
    alert('Nome é obrigatório!')
    return
  }

  const res = await apiJson(`${API}/servicos`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Serviço cadastrado com sucesso!')
    inicializarProdutosServicos()
  } else {
    const err = await res.json()
    alert('Erro ao cadastrar serviço: ' + (err.erro || ''))
  }
}

window.editarServico = async function (id) {
  const s = await apiFetch(`${API}/servicos/${id}`).then(r => r.json())

  document.getElementById('produtosServicos').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarProdutosServicos()">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Serviço</h3>

      <div><label>Nome *</label><input type="text" id="servico-nome" class="form-control" value="${s.nome}"></div>
      <div style="margin-top:16px;"><label>Descrição</label><textarea id="servico-descricao" class="form-control" rows="2">${s.descricao || ''}</textarea></div>
      <div style="margin-top:16px;"><label>Valor (R$)</label><input type="number" step="0.01" id="servico-valor" class="form-control" value="${s.valor ?? ''}"></div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="atualizarServico(${s.id})">Salvar Alterações</button>
    </div>
  `
}

window.atualizarServico = async function (id) {
  const body = lerFormularioServico()
  const res = await apiJson(`${API}/servicos/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Serviço atualizado com sucesso!')
    inicializarProdutosServicos()
  } else {
    const err = await res.json()
    alert('Erro ao atualizar serviço: ' + (err.erro || ''))
  }
}

window.excluirServico = async function (id) {
  if (!confirm('Excluir este serviço? Essa ação não pode ser desfeita.')) return

  const res = await apiJson(`${API}/servicos/${id}`, { method: 'DELETE' })
  if (res.ok) {
    inicializarProdutosServicos()
  } else {
    const err = await res.json()
    alert('Erro ao excluir serviço: ' + (err.erro || ''))
  }
}

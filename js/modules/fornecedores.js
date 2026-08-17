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

function formatarDocumento(doc) {
  if (!doc) return '-'
  const limpo = doc.replace(/\D/g, '')
  if (limpo.length === 11) return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (limpo.length === 14) return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

// ══════════════════════════════════════════════════════════════════════════
// FORNECEDORES (aba Cadastros → Fornecedores)
// ══════════════════════════════════════════════════════════════════════════

let fornecedoresCache = []

export function inicializarFornecedores() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('fornecedores').classList.add('active')

  const container = document.getElementById('fornecedores')
  container.innerHTML = `
    <div class="tab">Fornecedores</div>
    <button class="btn btn-success" onclick="abrirFormularioFornecedor()">+ Novo Fornecedor</button>

    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 16px 0;">
      <div>
        <label style="font-size:12px;">Nome</label>
        <input type="text" id="filtro-fornecedor-nome" class="form-control form-control-sm" oninput="filtrarFornecedores()">
      </div>
      <div>
        <label style="font-size:12px;">CNPJ/CPF</label>
        <input type="text" id="filtro-fornecedor-doc" class="form-control form-control-sm" oninput="filtrarFornecedores()">
      </div>
      <div>
        <label style="font-size:12px;">Cidade</label>
        <input type="text" id="filtro-fornecedor-cidade" class="form-control form-control-sm" oninput="filtrarFornecedores()">
      </div>
    </div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Nome</th>
          <th>CNPJ/CPF</th>
          <th>Cidade</th>
          <th>Telefone</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-fornecedores">
        <tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarFornecedores()
}

async function carregarFornecedores() {
  try {
    fornecedoresCache = await apiFetch(`${API}/fornecedores`).then(r => r.json())
    filtrarFornecedores()
  } catch {
    document.getElementById('tabela-fornecedores').innerHTML = `
      <tr><td colspan="5" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

window.filtrarFornecedores = function () {
  const nome = (document.getElementById('filtro-fornecedor-nome')?.value || '').trim().toLowerCase()
  const doc = (document.getElementById('filtro-fornecedor-doc')?.value || '').replace(/\D/g, '')
  const cidade = (document.getElementById('filtro-fornecedor-cidade')?.value || '').trim().toLowerCase()

  let filtrados = [...fornecedoresCache]
  if (nome) filtrados = filtrados.filter(f => f.nome.toLowerCase().includes(nome))
  if (doc) filtrados = filtrados.filter(f => (f.documento || '').replace(/\D/g, '').includes(doc))
  if (cidade) filtrados = filtrados.filter(f => (f.cidade || '').toLowerCase().includes(cidade))

  renderizarTabelaFornecedores(filtrados)
}

function renderizarTabelaFornecedores(fornecedores) {
  const tabela = document.getElementById('tabela-fornecedores')

  if (fornecedores.length === 0) {
    tabela.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">Nenhum fornecedor encontrado</td></tr>`
    return
  }

  tabela.innerHTML = fornecedores.map(f => `
    <tr>
      <td>${f.nome}</td>
      <td>${formatarDocumento(f.documento)}</td>
      <td>${f.cidade || '-'}</td>
      <td>${f.telefone || '-'}</td>
      <td><button class="btn btn-sm btn-info" onclick="editarFornecedor(${f.id})">Editar</button></td>
    </tr>
  `).join('')
}

function formularioFornecedorHtml(f = {}) {
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="grid-column:span 2;"><label>Nome *</label><input type="text" id="fornecedor-nome" class="form-control" value="${f.nome || ''}"></div>
      <div><label>CNPJ/CPF</label><input type="text" id="fornecedor-documento" class="form-control" value="${f.documento || ''}" placeholder="Somente números"></div>
      <div><label>Inscrição Estadual</label><input type="text" id="fornecedor-inscEstadual" class="form-control" value="${f.inscEstadual || ''}"></div>
      <div style="grid-column:span 2;"><label>Endereço</label><input type="text" id="fornecedor-endereco" class="form-control" value="${f.endereco || ''}"></div>
      <div><label>Cidade</label><input type="text" id="fornecedor-cidade" class="form-control" value="${f.cidade || ''}"></div>
      <div><label>CEP</label><input type="text" id="fornecedor-cep" class="form-control" value="${f.cep || ''}"></div>
      <div><label>Telefone</label><input type="text" id="fornecedor-telefone" class="form-control" value="${f.telefone || ''}"></div>
    </div>
  `
}

function lerFormularioFornecedor() {
  return {
    nome: document.getElementById('fornecedor-nome').value.trim(),
    documento: document.getElementById('fornecedor-documento').value.trim(),
    inscEstadual: document.getElementById('fornecedor-inscEstadual').value.trim(),
    endereco: document.getElementById('fornecedor-endereco').value.trim(),
    cidade: document.getElementById('fornecedor-cidade').value.trim(),
    cep: document.getElementById('fornecedor-cep').value.trim(),
    telefone: document.getElementById('fornecedor-telefone').value.trim(),
  }
}

window.abrirFormularioFornecedor = function () {
  document.getElementById('fornecedores').innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarFornecedores()">← Voltar</button>
      <h3 style="margin:20px 0;">Novo Fornecedor</h3>
      ${formularioFornecedorHtml()}
      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarFornecedor()">Salvar</button>
    </div>
  `
}

window.salvarFornecedor = async function () {
  const body = lerFormularioFornecedor()
  if (!body.nome) {
    alert('Nome é obrigatório!')
    return
  }

  const res = await apiJson(`${API}/fornecedores`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Fornecedor cadastrado com sucesso!')
    inicializarFornecedores()
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao cadastrar'))
  }
}

window.editarFornecedor = async function (id) {
  const f = await apiFetch(`${API}/fornecedores/${id}`).then(r => r.json()).catch(() => fornecedoresCache.find(x => x.id === id))

  document.getElementById('fornecedores').innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarFornecedores()">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Fornecedor</h3>
      ${formularioFornecedorHtml(f)}
      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="atualizarFornecedor(${id})">Salvar Alterações</button>
    </div>
  `
}

window.atualizarFornecedor = async function (id) {
  const body = lerFormularioFornecedor()
  const res = await apiJson(`${API}/fornecedores/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Fornecedor atualizado com sucesso!')
    inicializarFornecedores()
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao atualizar'))
  }
}

// Exposta em window para funcionar em onclick inline (ex: botão "Voltar")
window.inicializarFornecedores = inicializarFornecedores
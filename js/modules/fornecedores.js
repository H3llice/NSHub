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
let paginaAtualFornecedores = 1

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
        <input type="text" id="filtro-fornecedor-nome" class="form-control form-control-sm" oninput="carregarFornecedores(1)">
      </div>
      <div>
        <label style="font-size:12px;">CNPJ/CPF</label>
        <input type="text" id="filtro-fornecedor-doc" class="form-control form-control-sm" oninput="carregarFornecedores(1)">
      </div>
      <div>
        <label style="font-size:12px;">Cidade</label>
        <input type="text" id="filtro-fornecedor-cidade" class="form-control form-control-sm" oninput="carregarFornecedores(1)">
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
    <div id="contador-fornecedores" style="margin-top:12px;"></div>
  `

  carregarFornecedores()
}

window.carregarFornecedores = async function (pagina = 1) {
  paginaAtualFornecedores = pagina
  const nome = document.getElementById('filtro-fornecedor-nome')?.value || ''
  const documento = document.getElementById('filtro-fornecedor-doc')?.value || ''
  const cidade = document.getElementById('filtro-fornecedor-cidade')?.value || ''

  const params = new URLSearchParams()
  if (nome) params.append('nome', nome)
  if (documento) params.append('documento', documento)
  if (cidade) params.append('cidade', cidade)
  params.append('pagina', pagina)

  try {
    const dados = await apiFetch(`${API}/fornecedores?${params}`).then(r => r.json())
    fornecedoresCache = dados.fornecedores || []
    renderizarTabelaFornecedores(fornecedoresCache)

    const contador = document.getElementById('contador-fornecedores')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${dados.total || 0} fornecedores encontrados</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarFornecedores(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarFornecedores(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }
  } catch {
    document.getElementById('tabela-fornecedores').innerHTML = `
      <tr><td colspan="5" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
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

const TIPOS_CONTA_FORNECEDOR = { corrente: 'Conta Corrente', poupanca: 'Poupança' }

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
      <div><label>Chave PIX</label><input type="text" id="fornecedor-chavePix" class="form-control" value="${f.chavePix || ''}"></div>
      <div>
        <label>Tipo de Conta</label>
        <select id="fornecedor-tipoConta" class="form-control">
          <option value="">Selecione...</option>
          ${Object.entries(TIPOS_CONTA_FORNECEDOR).map(([valor, label]) => `<option value="${valor}" ${f.tipoConta === valor ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div><label>Agência</label><input type="text" id="fornecedor-agencia" class="form-control" value="${f.agencia || ''}"></div>
      <div><label>Número da Conta</label><input type="text" id="fornecedor-contaNumero" class="form-control" value="${f.contaNumero || ''}"></div>
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
    chavePix: document.getElementById('fornecedor-chavePix').value.trim(),
    tipoConta: document.getElementById('fornecedor-tipoConta').value,
    agencia: document.getElementById('fornecedor-agencia').value.trim(),
    contaNumero: document.getElementById('fornecedor-contaNumero').value.trim(),
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
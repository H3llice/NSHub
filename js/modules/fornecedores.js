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
const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
const podeExcluirFornecedor = ['gerente', 'admin'].includes(usuarioAtual?.perfil || 'usuario')
let paginaAtualFornecedores = 1

export function inicializarFornecedores() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('fornecedores').classList.add('active')

  const container = document.getElementById('fornecedores')
  container.innerHTML = `
    <div class="tab">Fornecedores</div>
    <button class="btn btn-success" onclick="abrirFormularioFornecedor()">+ Novo Fornecedor</button>
    ${podeExcluirFornecedor ? `<button class="btn btn-secondary" onclick="abrirMesclarFornecedores()">🔀 Mesclar duplicados</button>` : ''}

    <div class="filtros-grid">
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

    <div class="table-scroll">
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
    </div>
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
      <td style="cursor:pointer;" onclick="editarFornecedor(${f.id})">${esc(f.nome)}</td>
      <td>${formatarDocumento(f.documento)}</td>
      <td>${esc(f.cidade || '-')}</td>
      <td>${esc(f.telefone || '-')}</td>
      <td>
        <button class="btn btn-sm btn-info" onclick="editarFornecedor(${f.id})">Editar</button>
        ${podeExcluirFornecedor ? `<button class="btn btn-sm btn-danger" onclick="excluirFornecedor(${f.id})">Excluir</button>` : ''}
      </td>
    </tr>
  `).join('')
}

const TIPOS_CONTA_FORNECEDOR = { corrente: 'Conta Corrente', poupanca: 'Poupança' }

function formularioFornecedorHtml(f = {}) {
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="grid-column:span 2;"><label>Nome *</label><input type="text" id="fornecedor-nome" class="form-control" value="${esc(f.nome || '')}"></div>
      <div><label>CNPJ/CPF</label><input type="text" id="fornecedor-documento" class="form-control" value="${esc(f.documento || '')}" placeholder="Somente números"></div>
      <div><label>Inscrição Estadual</label><input type="text" id="fornecedor-inscEstadual" class="form-control" value="${esc(f.inscEstadual || '')}"></div>
      <div style="grid-column:span 2;"><label>Endereço</label><input type="text" id="fornecedor-endereco" class="form-control" value="${esc(f.endereco || '')}"></div>
      <div><label>Cidade</label><input type="text" id="fornecedor-cidade" class="form-control" value="${esc(f.cidade || '')}"></div>
      <div><label>CEP</label><input type="text" id="fornecedor-cep" class="form-control" value="${esc(f.cep || '')}"></div>
      <div><label>Telefone</label><input type="text" id="fornecedor-telefone" class="form-control" value="${esc(f.telefone || '')}"></div>
      <div><label>Chave PIX</label><input type="text" id="fornecedor-chavePix" class="form-control" value="${esc(f.chavePix || '')}"></div>
      <div>
        <label>Tipo de Conta</label>
        <select id="fornecedor-tipoConta" class="form-control">
          <option value="">Selecione...</option>
          ${Object.entries(TIPOS_CONTA_FORNECEDOR).map(([valor, label]) => `<option value="${valor}" ${f.tipoConta === valor ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div><label>Agência</label><input type="text" id="fornecedor-agencia" class="form-control" value="${esc(f.agencia || '')}"></div>
      <div><label>Número da Conta</label><input type="text" id="fornecedor-contaNumero" class="form-control" value="${esc(f.contaNumero || '')}"></div>
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

  const verificacao = await verificarFornecedorNovo(body.nome, body.documento)
  if (verificacao.cancelar) return
  if (verificacao.usar) { editarFornecedor(verificacao.usar.id); return }

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
      ${podeExcluirFornecedor ? `<button type="button" class="btn btn-danger" style="margin-top:20px;" onclick="excluirFornecedor(${id})">Excluir</button>` : ''}
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

window.excluirFornecedor = async function (id) {
  if (!confirm('Excluir este fornecedor? Essa ação não pode ser desfeita.')) return

  const res = await apiJson(`${API}/fornecedores/${id}`, { method: 'DELETE' })
  if (res.ok) {
    alert('Fornecedor excluído.')
    inicializarFornecedores()
  } else {
    const err = await res.json().catch(() => ({}))
    alert('Erro ao excluir: ' + (err.erro || 'falha'))
  }
}

// ─── Aviso de duplicado antes de cadastrar fornecedor novo ────────────────────
// Usado aqui e na OC (fornecedor digitado sem escolher da lista).
// Mesmo CPF/CNPJ → não deixa criar outro: oferece usar o existente ({ usar: fornecedor }).
// Nome parecido → só avisa ({ cancelar: true } se o usuário desistir).
// Se a checagem falhar, segue — o backend ainda bloqueia CPF/CNPJ repetido.
export async function verificarFornecedorNovo(nome, documento) {
  let semelhantes
  try {
    const params = new URLSearchParams({ nome: nome || '', documento: documento || '' })
    semelhantes = await apiFetch(`${API}/fornecedores/semelhantes?${params}`).then(r => r.json())
  } catch {
    return {}
  }

  const { mesmoDocumento, parecidos = [] } = semelhantes || {}
  if (mesmoDocumento) {
    const usar = confirm(`Já existe fornecedor com esse CPF/CNPJ:\n\n${mesmoDocumento.nome} (${formatarDocumento(mesmoDocumento.documento)})\n\nNão dá para cadastrar outro com o mesmo documento. Usar o cadastro existente?`)
    return usar ? { usar: mesmoDocumento } : { cancelar: true }
  }
  if (parecidos.length) {
    const lista = parecidos.map(f => `• ${f.nome}${f.documento ? ` (${formatarDocumento(f.documento)})` : ''}${f.cidade ? ` — ${f.cidade}` : ''}`).join('\n')
    const continuar = confirm(`Já existe fornecedor com nome parecido:\n\n${lista}\n\nSe for um desses, cancele e escolha o cadastro existente.\nCadastrar "${nome}" como fornecedor novo mesmo assim?`)
    if (!continuar) return { cancelar: true }
  }
  return {}
}

// ─── Mesclar duplicados (gerente/admin) ───────────────────────────────────────
// Busca por pedaço do nome/documento, adiciona os cadastros que são o mesmo
// fornecedor (pode buscar várias vezes: "dantas", depois "douglas"…), escolhe o
// principal e mescla. As OCs e vendedores dos outros passam pro principal.
let mesclarSelecionados = new Map()
let mesclarPrincipalId = null
let mesclarResultados = []

const formatarData = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-'

window.abrirMesclarFornecedores = function () {
  mesclarSelecionados = new Map()
  mesclarPrincipalId = null
  mesclarResultados = []
  document.getElementById('fornecedores').innerHTML = `
    <div style="margin-top:20px; max-width:1000px;">
      <button class="btn btn-secondary" onclick="inicializarFornecedores()">← Voltar</button>
      <h3 style="margin:20px 0 6px;">Mesclar fornecedores duplicados</h3>
      <p style="color:#666; font-size:13px; margin-bottom:16px;">
        Busque pelo nome (ou pedaço dele) e adicione os cadastros que são o <strong>mesmo</strong> fornecedor.
        Dá para buscar mais de uma vez. Depois escolha o cadastro principal: as OCs e os vendedores dos outros passam para ele,
        os campos vazios dele são completados com os dados dos outros, e os outros são apagados.
        Filiais (CNPJ diferente) não podem ser mescladas.
      </p>

      <label style="font-size:12px;">Buscar por nome ou CPF/CNPJ</label>
      <input type="text" id="mesclar-busca" class="form-control" placeholder="Ex.: dantas" oninput="buscarCandidatosMesclar()">
      <div class="table-scroll" style="margin-top:8px;">
        <table class="table-certificados">
          <thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>Cidade</th><th>OCs</th><th>Última OC</th><th>Vendedores</th><th></th></tr></thead>
          <tbody id="mesclar-resultados">
            <tr><td colspan="7" style="text-align:center; color:#999; padding:20px;">Digite pelo menos 2 letras</td></tr>
          </tbody>
        </table>
      </div>

      <h4 style="margin:24px 0 8px;">Selecionados</h4>
      <div id="mesclar-selecionados"></div>
    </div>
  `
  renderizarSelecionadosMesclar()
}

let temporizadorBuscaMesclar
window.buscarCandidatosMesclar = function () {
  clearTimeout(temporizadorBuscaMesclar)
  temporizadorBuscaMesclar = setTimeout(async () => {
    const q = document.getElementById('mesclar-busca').value.trim()
    const tbody = document.getElementById('mesclar-resultados')
    if (q.length < 2) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#999; padding:20px;">Digite pelo menos 2 letras</td></tr>`
      return
    }
    try {
      mesclarResultados = await apiFetch(`${API}/fornecedores/mesclar/candidatos?q=${encodeURIComponent(q)}`).then(r => r.json())
    } catch {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red; padding:20px;">Erro ao buscar</td></tr>`
      return
    }
    renderizarResultadosMesclar()
  }, 300)
}

function renderizarResultadosMesclar() {
  const tbody = document.getElementById('mesclar-resultados')
  if (!tbody) return
  if (!mesclarResultados.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#999; padding:20px;">Nenhum fornecedor encontrado</td></tr>`
    return
  }
  tbody.innerHTML = mesclarResultados.map(f => `
    <tr>
      <td>${esc(f.nome)}</td>
      <td>${f.documento ? esc(formatarDocumento(f.documento)) : '<span style="color:#999;">sem documento</span>'}</td>
      <td>${esc(f.cidade || '-')}</td>
      <td>${f.qtdOCs}</td>
      <td>${formatarData(f.ultimaOC)}</td>
      <td>${f.qtdVendedores}</td>
      <td>${mesclarSelecionados.has(f.id)
        ? '<span style="color:#198754;">✓ adicionado</span>'
        : `<button class="btn btn-sm btn-info" onclick="adicionarMesclar(${f.id})">+ Adicionar</button>`}</td>
    </tr>
  `).join('')
}

window.adicionarMesclar = function (id) {
  const f = mesclarResultados.find(x => x.id === id)
  if (!f) return
  mesclarSelecionados.set(id, f)
  // Sugestão de principal: o primeiro com documento, senão o com mais OCs — o usuário pode trocar
  const lista = [...mesclarSelecionados.values()]
  if (!mesclarPrincipalId || !mesclarSelecionados.has(mesclarPrincipalId)) {
    mesclarPrincipalId = (lista.find(x => x.documento) || lista.sort((a, b) => b.qtdOCs - a.qtdOCs)[0]).id
  }
  renderizarResultadosMesclar()
  renderizarSelecionadosMesclar()
}

window.removerMesclar = function (id) {
  mesclarSelecionados.delete(id)
  if (mesclarPrincipalId === id) mesclarPrincipalId = mesclarSelecionados.keys().next().value ?? null
  renderizarResultadosMesclar()
  renderizarSelecionadosMesclar()
}

window.escolherPrincipalMesclar = function (id) {
  mesclarPrincipalId = id
  renderizarSelecionadosMesclar()
}

// Mais de um CPF/CNPJ diferente entre os selecionados → não são o mesmo fornecedor
function documentosConflitantesMesclar() {
  const docs = new Set([...mesclarSelecionados.values()].map(f => (f.documento || '').replace(/\D/g, '')).filter(Boolean))
  return docs.size > 1
}

function renderizarSelecionadosMesclar() {
  const painel = document.getElementById('mesclar-selecionados')
  if (!painel) return
  const lista = [...mesclarSelecionados.values()]
  if (!lista.length) {
    painel.innerHTML = '<p style="color:#999;">Nenhum cadastro adicionado ainda.</p>'
    return
  }

  const conflito = documentosConflitantesMesclar()
  const totalOCs = lista.filter(f => f.id !== mesclarPrincipalId).reduce((s, f) => s + f.qtdOCs, 0)
  painel.innerHTML = `
    <div class="table-scroll">
      <table class="table-certificados">
        <thead><tr><th>Principal</th><th>Nome</th><th>CNPJ/CPF</th><th>Cidade</th><th>OCs</th><th></th></tr></thead>
        <tbody>
          ${lista.map(f => `
            <tr style="${f.id === mesclarPrincipalId ? 'background:#d1e7dd;' : ''}">
              <td style="text-align:center;"><input type="radio" name="mesclar-principal" ${f.id === mesclarPrincipalId ? 'checked' : ''} onchange="escolherPrincipalMesclar(${f.id})"></td>
              <td>${esc(f.nome)}</td>
              <td>${f.documento ? esc(formatarDocumento(f.documento)) : '<span style="color:#999;">sem documento</span>'}</td>
              <td>${esc(f.cidade || '-')}</td>
              <td>${f.qtdOCs}</td>
              <td><button class="btn btn-sm btn-secondary" onclick="removerMesclar(${f.id})">Remover</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${conflito ? `
      <div style="background:#f8d7da; border:1px solid #f1aeb5; color:#842029; border-radius:6px; padding:10px; margin-top:10px; font-size:13px;">
        Há CPF/CNPJ diferentes entre os selecionados — são fornecedores (ou filiais) diferentes e não podem ser mesclados.
        Remova o que não é o mesmo, ou corrija o documento se foi erro de digitação.
      </div>` : ''}
    <button class="btn btn-danger" style="margin-top:12px;" onclick="confirmarMesclarFornecedores()"
      ${lista.length < 2 || conflito ? 'disabled' : ''}>
      Mesclar ${lista.length - 1} cadastro(s) no principal (${totalOCs} OC(s) serão transferidas)
    </button>
  `
}

window.confirmarMesclarFornecedores = async function () {
  const principal = mesclarSelecionados.get(mesclarPrincipalId)
  const duplicados = [...mesclarSelecionados.values()].filter(f => f.id !== mesclarPrincipalId)
  if (!principal || !duplicados.length) return

  const totalOCs = duplicados.reduce((s, f) => s + f.qtdOCs, 0)
  const totalVendedores = duplicados.reduce((s, f) => s + f.qtdVendedores, 0)
  const msg = `Mesclar no cadastro principal "${principal.nome}":\n\n` +
    duplicados.map(f => `• ${f.nome}${f.documento ? ` (${formatarDocumento(f.documento)})` : ''}`).join('\n') +
    `\n\n${totalOCs} OC(s) e ${totalVendedores} vendedor(es) passam para "${principal.nome}".` +
    `\nAs OCs antigas passam a mostrar os dados (CNPJ, endereço, conta) do principal.` +
    `\n${duplicados.length} cadastro(s) serão apagados. Essa ação não pode ser desfeita. Continuar?`
  if (!confirm(msg)) return

  const res = await apiJson(`${API}/fornecedores/mesclar`, {
    method: 'POST',
    body: JSON.stringify({ principalId: principal.id, duplicadosIds: duplicados.map(f => f.id) })
  })
  const r = await res.json().catch(() => ({}))
  if (!res.ok) { alert('Erro ao mesclar: ' + (r.erro || 'falha')); return }

  alert(`Mesclado!\n\n${r.ocsMovidas} OC(s) transferidas.` +
    `\n${r.vendedoresMovidos} vendedor(es) transferidos${r.vendedoresUnidos ? `, ${r.vendedoresUnidos} unidos a vendedores com o mesmo nome` : ''}.` +
    (r.camposCompletados.length ? `\nCampos completados no principal: ${r.camposCompletados.join(', ')}.` : ''))
  abrirMesclarFornecedores()
}

// Exposta em window para funcionar em onclick inline (ex: botão "Voltar")
window.inicializarFornecedores = inicializarFornecedores
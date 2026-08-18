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
const podeGerenciarContratos = perfil === 'admin' || perfil === 'gerente'

// ══════════════════════════════════════════════════════════════════════════
// CLIENTES (aba Cadastros → Pessoas)
// ══════════════════════════════════════════════════════════════════════════

export function inicializarClientes() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('pessoas').classList.add('active')

  const container = document.getElementById('pessoas')
  container.innerHTML = `
    <div class="tab">Cadastro de Clientes</div>
    <button class="btn btn-success" onclick="abrirFormularioCliente()">+ Novo Cliente</button>

    <div style="margin: 16px 0;">
      <input type="text" id="filtro-cliente" class="form-control" placeholder="Buscar por nome ou CPF/CNPJ..." oninput="filtrarClientes()">
    </div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Nome</th>
          <th>CPF/CNPJ</th>
          <th>Tipo</th>
          <th>Telefone</th>
          <th>Cidade</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-clientes">
        <tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarClientes()
}

let clientesCache = []

async function carregarClientes() {
  try {
    clientesCache = await apiFetch(`${API}/clientes`).then(r => r.json())
    renderizarTabelaClientes(clientesCache)
  } catch {
    document.getElementById('tabela-clientes').innerHTML = `
      <tr><td colspan="6" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

window.filtrarClientes = function () {
  const q = (document.getElementById('filtro-cliente')?.value || '').trim().toLowerCase()
  if (!q) return renderizarTabelaClientes(clientesCache)

  const filtrados = clientesCache.filter(c =>
    c.nome.toLowerCase().includes(q) || c.cpfCnpj.includes(q.replace(/\D/g, ''))
  )
  renderizarTabelaClientes(filtrados)
}

function renderizarTabelaClientes(clientes) {
  const tabela = document.getElementById('tabela-clientes')

  if (clientes.length === 0) {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Nenhuma pessoa cadastrada ainda</td></tr>`
    return
  }

  tabela.innerHTML = clientes.map(c => `
    <tr>
      <td>${c.nome}</td>
      <td>${formatarDocumento(c.cpfCnpj)}</td>
      <td>${c.tipoPessoa === 'fisica' ? 'Física' : 'Jurídica'}</td>
      <td>${c.telefone || '-'}</td>
      <td>${c.cidade || '-'}</td>
      <td><button class="btn btn-sm btn-info" onclick="editarCliente(${c.id})">Editar</button></td>
    </tr>
  `).join('')
}

function formatarDocumento(doc) {
  if (!doc) return '-'
  if (doc.length === 11) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (doc.length === 14) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

window.abrirFormularioCliente = function () {
  document.getElementById('pessoas').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarClientes()">← Voltar</button>
      <h3 style="margin:20px 0;">Nova Pessoa</h3>
      ${formularioClienteHtml()}
      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarCliente()">Salvar</button>
    </div>
  `
}

function formularioClienteHtml(c = {}) {
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div>
        <label>Tipo *</label>
        <select id="cliente-tipoPessoa" class="form-control">
          <option value="fisica" ${c.tipoPessoa === 'fisica' ? 'selected' : ''}>Pessoa Física</option>
          <option value="juridica" ${c.tipoPessoa === 'juridica' ? 'selected' : ''}>Pessoa Jurídica</option>
        </select>
      </div>
      <div><label>CPF/CNPJ *</label><input type="text" id="cliente-cpfCnpj" class="form-control" value="${c.cpfCnpj || ''}" placeholder="Somente números"></div>
      <div style="grid-column: span 2;"><label>Nome / Razão Social *</label><input type="text" id="cliente-nome" class="form-control" value="${c.nome || ''}"></div>
      <div><label>Telefone</label><input type="text" id="cliente-telefone" class="form-control" value="${c.telefone || ''}"></div>
      <div><label>Email</label><input type="text" id="cliente-email" class="form-control" value="${c.email || ''}"></div>
      <div><label>Endereço</label><input type="text" id="cliente-endereco" class="form-control" value="${c.endereco || ''}"></div>
      <div><label>Cidade</label><input type="text" id="cliente-cidade" class="form-control" value="${c.cidade || ''}"></div>
    </div>
  `
}

function lerFormularioCliente() {
  return {
    tipoPessoa: document.getElementById('cliente-tipoPessoa').value,
    cpfCnpj: document.getElementById('cliente-cpfCnpj').value.trim(),
    nome: document.getElementById('cliente-nome').value.trim(),
    telefone: document.getElementById('cliente-telefone').value.trim(),
    email: document.getElementById('cliente-email').value.trim(),
    endereco: document.getElementById('cliente-endereco').value.trim(),
    cidade: document.getElementById('cliente-cidade').value.trim(),
  }
}

window.salvarCliente = async function () {
  const body = lerFormularioCliente()
  if (!body.cpfCnpj || !body.nome) {
    alert('CPF/CNPJ e nome são obrigatórios!')
    return
  }

  const res = await apiJson(`${API}/clientes`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Pessoa cadastrada com sucesso!')
    inicializarClientes()
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao cadastrar'))
  }
}

window.editarCliente = async function (id) {
  const c = await apiFetch(`${API}/clientes/${id}`).then(r => r.json())

  document.getElementById('pessoas').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarClientes()">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Pessoa</h3>
      ${formularioClienteHtml(c)}
      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="atualizarCliente(${c.id})">Salvar Alterações</button>
    </div>
  `
}

window.atualizarCliente = async function (id) {
  const body = lerFormularioCliente()
  const res = await apiJson(`${API}/clientes/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Pessoa atualizada com sucesso!')
    inicializarClientes()
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao atualizar'))
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CONTRATOS DE LOCAÇÃO (aba Produtos → Contratos)
// ══════════════════════════════════════════════════════════════════════════

const STATUS_CONTRATO_LABEL = {
  ativo: { texto: 'Ativo', cor: '#198754' },
  encerrado: { texto: 'Encerrado', cor: '#6c757d' },
  cancelado: { texto: 'Cancelado', cor: '#dc3545' },
}

function badgeStatusContrato(status) {
  const s = STATUS_CONTRATO_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

const TIPO_CONTRATO_LABEL = { locacao: 'Locação', venda: 'Venda' }

export function inicializarContratos() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('contratos').classList.add('active')

  const container = document.getElementById('contratos')
  container.innerHTML = `
    <div class="tab">Contratos</div>
    ${podeGerenciarContratos ? `<button class="btn btn-success" onclick="abrirFormularioContrato()">+ Novo Contrato</button>` : ''}

    <div style="display:flex; gap:16px; margin: 16px 0; max-width:560px;">
      <div style="flex:1;">
        <label style="font-size:12px;">Tipo</label>
        <select id="filtro-tipo-contrato" class="form-control" onchange="carregarContratos()">
          <option value="">Todos</option>
          <option value="locacao">Locação</option>
          <option value="venda">Venda</option>
        </select>
      </div>
      <div style="flex:1;">
        <label style="font-size:12px;">Status</label>
        <select id="filtro-status-contrato" class="form-control" onchange="carregarContratos()">
          <option value="">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="encerrado">Encerrado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
    </div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Nº Contrato</th>
          <th>Tipo</th>
          <th>Cliente</th>
          <th>Balsas</th>
          <th>Início</th>
          <th>Fim</th>
          <th>Valor</th>
          <th>Status</th>
          ${podeGerenciarContratos ? '<th>Ações</th>' : ''}
        </tr>
      </thead>
      <tbody id="tabela-contratos">
        <tr><td colspan="9" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarContratos()
}

window.carregarContratos = async function () {
  const status = document.getElementById('filtro-status-contrato')?.value || ''
  const tipo = document.getElementById('filtro-tipo-contrato')?.value || ''
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (tipo) params.append('tipo', tipo)

  try {
    const contratos = await apiFetch(`${API}/contratos?${params}`).then(r => r.json())
    renderizarTabelaContratos(contratos)
  } catch {
    document.getElementById('tabela-contratos').innerHTML = `
      <tr><td colspan="9" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

function renderizarTabelaContratos(contratos) {
  const tabela = document.getElementById('tabela-contratos')
  const colspan = podeGerenciarContratos ? 9 : 8

  if (contratos.length === 0) {
    tabela.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999; padding:30px;">Nenhum contrato encontrado</td></tr>`
    return
  }

  tabela.innerHTML = contratos.map(c => {
    const balsasTxt = c.balsas.map(cb => cb.balsa.numeroSerie).join(', ')
    const inicio = new Date(c.dataInicio).toLocaleDateString('pt-BR')
    const fim = c.dataFim ? new Date(c.dataFim).toLocaleDateString('pt-BR') : '-'
    const valor = c.valor ? 'R$ ' + c.valor.toFixed(2) : '-'

    const acoes = c.status === 'ativo' ? `
      ${c.tipo === 'locacao' ? `<button class="btn btn-sm btn-secondary" onclick="encerrarContrato(${c.id})">Encerrar</button>` : ''}
      <button class="btn btn-sm btn-danger" onclick="cancelarContrato(${c.id})">Cancelar</button>
    ` : ''

    return `
      <tr>
        <td><a href="#" onclick="verContrato(${c.id}); return false;" style="color:var(--verde); font-weight:600; text-decoration:none;">${c.numero}.${c.ano}</a></td>
        <td>${TIPO_CONTRATO_LABEL[c.tipo] || c.tipo}</td>
        <td>${c.cliente.nome}</td>
        <td>${balsasTxt}</td>
        <td>${inicio}</td>
        <td>${fim}</td>
        <td>${valor}</td>
        <td>${badgeStatusContrato(c.status)}</td>
        ${podeGerenciarContratos ? `<td style="white-space:nowrap;">${acoes}</td>` : ''}
      </tr>
    `
  }).join('')
}

window.encerrarContrato = async function (id) {
  if (!confirm('Encerrar este contrato? As balsas vinculadas voltarão a ficar disponíveis.')) return
  const res = await apiJson(`${API}/contratos/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'encerrado' }) })
  if (res.ok) carregarContratos()
  else alert('Erro ao encerrar contrato')
}

window.cancelarContrato = async function (id) {
  if (!confirm('Cancelar este contrato? As balsas vinculadas voltarão a ficar disponíveis.')) return
  const res = await apiJson(`${API}/contratos/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelado' }) })
  if (res.ok) carregarContratos()
  else alert('Erro ao cancelar contrato')
}

// ===== VISUALIZAÇÃO DO CONTRATO ==============================================
window.verContrato = async function (id) {
  const c = await apiFetch(`${API}/contratos/${id}`).then(r => r.json())

  const inicio = new Date(c.dataInicio).toLocaleDateString('pt-BR')
  const fim = c.dataFim ? new Date(c.dataFim).toLocaleDateString('pt-BR') : '-'
  const valor = c.valor ? 'R$ ' + c.valor.toFixed(2) : '-'
  const frete = c.frete ? 'R$ ' + c.frete.toFixed(2) : '-'
  const desconto = c.descontoValor
    ? (c.descontoTipo === 'fixo' ? 'R$ ' + c.descontoValor.toFixed(2) : c.descontoValor + '%')
    : '-'

  document.getElementById('contratos').innerHTML = `
    <div style="margin-top:20px; max-width:800px;">
      <button class="btn btn-secondary" onclick="inicializarContratos()">← Voltar</button>

      <div style="display:flex; align-items:center; gap:12px; margin:20px 0;">
        <h3 style="margin:0;">Contrato ${c.numero}.${c.ano}</h3>
        <span style="background:#6c757d; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${TIPO_CONTRATO_LABEL[c.tipo] || c.tipo}</span>
        ${badgeStatusContrato(c.status)}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Cliente</div>
        <div><strong>${c.cliente.nome}</strong></div>
        <div style="color:#666; font-size:13px;">${formatarDocumento(c.cliente.cpfCnpj)}</div>
        ${c.cliente.telefone ? `<div style="color:#666; font-size:13px;">Tel: ${c.cliente.telefone}</div>` : ''}
        ${c.cliente.email ? `<div style="color:#666; font-size:13px;">${c.cliente.email}</div>` : ''}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Balsas Locadas</div>
        <ul style="list-style:none; padding:0; margin:0;">
          ${c.balsas.map(cb => `
            <li style="padding:6px 0; border-bottom:1px solid #eee; font-size:13px; display:flex; justify-content:space-between;">
              <span><strong>${cb.balsa.numeroSerie}</strong> — ${cb.balsa.fabricante} ${cb.balsa.modelo}, capacidade ${cb.balsa.capacidade}</span>
              <strong>${cb.valor ? 'R$ ' + cb.valor.toFixed(2) : '-'}</strong>
            </li>
          `).join('')}
        </ul>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Condições</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:13px;">
          <div><span style="color:#999;">Início</span><br><strong>${inicio}</strong></div>
          <div><span style="color:#999;">Fim</span><br><strong>${fim}</strong></div>
          <div><span style="color:#999;">Frete</span><br><strong>${frete}</strong></div>
          <div><span style="color:#999;">Desconto</span><br><strong>${desconto}</strong></div>
          <div><span style="color:#999;">Valor</span><br><strong>${valor}</strong></div>
          <div><span style="color:#999;">Forma Pagto</span><br><strong>${c.formaPagamento || '-'}</strong></div>
          <div style="grid-column:span 2;"><span style="color:#999;">Condições Pagto</span><br><strong>${c.condicoesPagto || '-'}</strong></div>
        </div>
      </div>

      ${c.observacoes ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:#158815; margin-bottom:8px;">Observações</div>
          <div style="font-size:13px; color:#444;">${c.observacoes}</div>
        </div>
      ` : ''}

      ${podeGerenciarContratos && c.status === 'ativo' ? `
        <div style="display:flex; gap:8px;">
          ${c.tipo === 'locacao' ? `<button class="btn btn-secondary" onclick="encerrarContrato(${c.id})">Encerrar Contrato</button>` : ''}
          <button class="btn btn-danger" onclick="cancelarContrato(${c.id})">Cancelar Contrato</button>
        </div>
      ` : ''}
    </div>
  `
}

// ===== FORMULÁRIO — NOVO CONTRATO =============================================
let balsasDisponiveisCache = []
let clienteSelecionadoId = null
let balsaValoresSelecionados = new Map() // balsaId -> valor individual (string)
let tipoContratoAtual = 'locacao'

function renderizarListaBalsasContrato(lista) {
  const container = document.getElementById('lista-balsas-contrato')
  if (!container) return

  if (lista.length === 0) {
    container.innerHTML = '<div style="color:#999; padding:8px;">Nenhuma balsa encontrada</div>'
    return
  }

  container.innerHTML = lista.map(b => {
    const marcado = balsaValoresSelecionados.has(b.id)
    return `
      <div style="display:flex; align-items:center; gap:8px; padding:6px 0;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
          <input type="checkbox" value="${b.id}" class="checkbox-balsa-contrato"
            ${marcado ? 'checked' : ''}
            onchange="toggleBalsaSelecionada(${b.id}, this.checked)">
          <span>${b.numeroSerie} — ${b.fabricante} ${b.modelo}, capacidade ${b.capacidade}</span>
        </label>
        <input type="number" step="0.01" min="0" placeholder="Valor" class="form-control form-control-sm"
          style="width:130px;" value="${balsaValoresSelecionados.get(b.id) || ''}" ${marcado ? '' : 'disabled'}
          oninput="atualizarValorBalsaContrato(${b.id}, this.value)">
      </div>
    `
  }).join('')
}

window.toggleBalsaSelecionada = function (id, marcado) {
  if (marcado) balsaValoresSelecionados.set(id, balsaValoresSelecionados.get(id) || '')
  else balsaValoresSelecionados.delete(id)
  filtrarBalsasContrato()
  recalcularValorContrato()
}

window.atualizarValorBalsaContrato = function (id, valor) {
  balsaValoresSelecionados.set(id, valor)
  recalcularValorContrato()
}

// Soma os valores das balsas selecionadas + frete - desconto. O campo "Valor" continua
// editável manualmente — ele só é sobrescrito quando algum desses componentes muda.
window.recalcularValorContrato = function () {
  const campoValor = document.getElementById('contrato-valor')
  if (!campoValor) return

  const somaBalsas = Array.from(balsaValoresSelecionados.values())
    .reduce((acc, v) => acc + (parseFloat(v) || 0), 0)
  const frete = parseFloat(document.getElementById('contrato-frete')?.value) || 0
  const descTipo = document.getElementById('contrato-descontoTipo')?.value
  const descValor = parseFloat(document.getElementById('contrato-descontoValor')?.value) || 0

  // Desconto incide só sobre as balsas — o frete entra por fora, sem desconto
  const descontoBruto = descTipo === 'fixo' ? descValor : somaBalsas * (descValor / 100)
  const descontoAplicado = Math.min(descontoBruto, somaBalsas)

  campoValor.value = (somaBalsas - descontoAplicado + frete).toFixed(2)
}

window.filtrarBalsasContrato = function () {
  const serie = (document.getElementById('filtro-balsa-contrato-serie')?.value || '').trim().toLowerCase()
  const fabricante = (document.getElementById('filtro-balsa-contrato-fabricante')?.value || '').trim().toLowerCase()
  const capacidadeStr = document.getElementById('filtro-balsa-contrato-capacidade')?.value
  const capacidade = capacidadeStr ? Number(capacidadeStr) : null

  let filtradas = [...balsasDisponiveisCache]
  if (serie) filtradas = filtradas.filter(b => b.numeroSerie.toLowerCase().includes(serie))
  if (fabricante) filtradas = filtradas.filter(b => b.fabricante.toLowerCase().includes(fabricante))
  if (capacidade !== null) filtradas = filtradas.filter(b => b.capacidade === capacidade)

  renderizarListaBalsasContrato(filtradas)
}

window.abrirFormularioContrato = async function () {
  clienteSelecionadoId = null
  balsaValoresSelecionados = new Map()
  tipoContratoAtual = 'locacao'
  balsasDisponiveisCache = await apiFetch(`${API}/estoque?finalidade=${tipoContratoAtual}`).then(r => r.json())

  document.getElementById('contratos').innerHTML = `
    <div style="margin-top:20px;">
      <button class="btn btn-secondary" onclick="inicializarContratos()">← Voltar</button>
      <h3 style="margin:20px 0;">Novo Contrato de Locação</h3>

      <div style="position:relative; margin-bottom:16px;">
        <label>Cliente * <small style="color:#999;">(busca por nome ou CPF/CNPJ — se não achar, preencha os dados abaixo para cadastrar um novo)</small></label>
        <input type="text" id="contrato-cliente-busca" class="form-control"
          placeholder="Digite nome ou CPF/CNPJ..."
          oninput="buscarClienteContrato(this.value)" autocomplete="off">
        <div id="sugestoes-cliente" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
      </div>

      <div id="dados-cliente-novo" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div>
          <label>Tipo</label>
          <select id="contrato-cliente-tipoPessoa" class="form-control">
            <option value="fisica">Pessoa Física</option>
            <option value="juridica">Pessoa Jurídica</option>
          </select>
        </div>
        <div><label>CPF/CNPJ</label><input type="text" id="contrato-cliente-cpfCnpj" class="form-control" placeholder="Somente números"></div>
        <div style="grid-column:span 2;"><label>Nome / Razão Social</label><input type="text" id="contrato-cliente-nome" class="form-control"></div>
        <div><label>Telefone</label><input type="text" id="contrato-cliente-telefone" class="form-control"></div>
        <div><label>Email</label><input type="text" id="contrato-cliente-email" class="form-control"></div>
      </div>

      <h5 id="titulo-balsas-contrato" style="margin: 20px 0 10px;">Balsas Disponíveis <small style="color:#999; font-weight:400;">(marque as balsas e informe o valor individual de cada uma)</small></h5>

      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-size:12px;">Nº Série</label>
          <input type="text" id="filtro-balsa-contrato-serie" class="form-control form-control-sm" oninput="filtrarBalsasContrato()">
        </div>
        <div>
          <label style="font-size:12px;">Fabricante</label>
          <input type="text" id="filtro-balsa-contrato-fabricante" class="form-control form-control-sm" oninput="filtrarBalsasContrato()">
        </div>
        <div>
          <label style="font-size:12px;">Capacidade</label>
          <input type="number" id="filtro-balsa-contrato-capacidade" class="form-control form-control-sm" oninput="filtrarBalsasContrato()">
        </div>
      </div>

      <div id="lista-balsas-contrato" style="max-height:200px; overflow-y:auto; border:1px solid #ddd; border-radius:4px; padding:8px; margin-bottom:16px;">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Data Início *</label><input type="date" id="contrato-dataInicio" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
        <div id="campo-dataFim"><label>Data Fim</label><input type="date" id="contrato-dataFim" class="form-control"></div>
        <div><label>Frete</label><input type="number" id="contrato-frete" class="form-control" step="0.01" min="0" oninput="recalcularValorContrato()"></div>
        <div>
          <label>Desconto</label>
          <div style="display:flex; gap:8px;">
            <select id="contrato-descontoTipo" class="form-control" style="max-width:90px;" onchange="recalcularValorContrato()">
              <option value="percentual">%</option>
              <option value="fixo">R$</option>
            </select>
            <input type="number" id="contrato-descontoValor" class="form-control" step="0.01" min="0" oninput="recalcularValorContrato()">
          </div>
        </div>
        <div><label>Valor <small style="color:#999;">(soma das balsas + frete - desconto — pode ser ajustado manualmente)</small></label><input type="number" id="contrato-valor" class="form-control" step="0.01"></div>
        <div><label>Periodicidade</label>
          <select id="contrato-periodicidade" class="form-control">
            <option value="unico">Pagamento único</option>
            <option value="mensal">Mensal</option>
          </select>
        </div>
        <div><label>Data de Vencimento <small style="color:#999;">(obrigatório se houver valor)</small></label><input type="date" id="contrato-dataVencimento" class="form-control"></div>
        <div><label>Forma de Pagamento</label><input type="text" id="contrato-formaPagamento" class="form-control"></div>
        <div style="grid-column:span 2;"><label>Condições de Pagamento</label><input type="text" id="contrato-condicoesPagto" class="form-control"></div>
      </div>

      <div style="margin-top:16px;">
        <label>Observações</label>
        <textarea id="contrato-observacoes" class="form-control" rows="3"></textarea>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarContrato()">Salvar Contrato</button>
    </div>
  `

  renderizarListaBalsasContrato(balsasDisponiveisCache)
}

window.trocarTipoContrato = async function (tipo) {
  tipoContratoAtual = tipo
  balsaValoresSelecionados = new Map()

  const titulo = document.getElementById('titulo-balsas-contrato')
  titulo.textContent = `Balsas Disponíveis (${tipo === 'locacao' ? 'Locação' : 'Venda'})`

  // Contrato de venda não tem período — esconde o campo Data Fim
  const campoDataFim = document.getElementById('campo-dataFim')
  campoDataFim.style.display = tipo === 'venda' ? 'none' : 'block'
  if (tipo === 'venda') document.getElementById('contrato-dataFim').value = ''

  balsasDisponiveisCache = await apiFetch(`${API}/estoque?finalidade=${tipo}`).then(r => r.json())
  filtrarBalsasContrato()
}

window.buscarClienteContrato = async function (q) {
  const div = document.getElementById('sugestoes-cliente')
  clienteSelecionadoId = null

  if (q.length < 2) {
    div.style.display = 'none'
    return
  }

  const results = await apiFetch(`${API}/clientes/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())

  if (results.length === 0) {
    div.style.display = 'none'
    return
  }

  div.style.display = 'block'
  div.innerHTML = results.map(c => `
    <div onclick='selecionarClienteContrato(${JSON.stringify(c)})'
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${c.nome}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${formatarDocumento(c.cpfCnpj)}</span>
    </div>
  `).join('')
}

window.selecionarClienteContrato = function (c) {
  clienteSelecionadoId = c.id
  document.getElementById('contrato-cliente-busca').value = c.nome
  document.getElementById('contrato-cliente-tipoPessoa').value = c.tipoPessoa
  document.getElementById('contrato-cliente-cpfCnpj').value = c.cpfCnpj
  document.getElementById('contrato-cliente-nome').value = c.nome
  document.getElementById('contrato-cliente-telefone').value = c.telefone || ''
  document.getElementById('contrato-cliente-email').value = c.email || ''
  document.getElementById('sugestoes-cliente').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('sugestoes-cliente')
  if (div && !div.contains(e.target) && e.target.id !== 'contrato-cliente-busca') {
    div.style.display = 'none'
  }
})

window.salvarContrato = async function () {
  const balsas = Array.from(balsaValoresSelecionados, ([balsaId, valor]) => ({ balsaId, valor: valor || null }))

  if (balsas.length === 0) {
    alert('Selecione ao menos uma balsa!')
    return
  }

  const dataInicio = document.getElementById('contrato-dataInicio').value
  if (!dataInicio) {
    alert('Data de início é obrigatória!')
    return
  }

  let clienteId = clienteSelecionadoId

  if (!clienteId) {
    const cpfCnpj = document.getElementById('contrato-cliente-cpfCnpj').value.trim()
    const nome = document.getElementById('contrato-cliente-nome').value.trim()

    if (!cpfCnpj || !nome) {
      alert('Selecione um cliente existente ou preencha CPF/CNPJ e nome para cadastrar um novo.')
      return
    }

    const novoCliente = await apiJson(`${API}/clientes`, {
      method: 'POST',
      body: JSON.stringify({
        tipoPessoa: document.getElementById('contrato-cliente-tipoPessoa').value,
        cpfCnpj,
        nome,
        telefone: document.getElementById('contrato-cliente-telefone').value.trim(),
        email: document.getElementById('contrato-cliente-email').value.trim(),
      })
    }).then(r => r.json())

    if (!novoCliente.id) {
      alert('Erro ao cadastrar cliente: ' + (novoCliente.erro || ''))
      return
    }
    clienteId = novoCliente.id
  }

  const valorPreenchido = document.getElementById('contrato-valor').value
  const dataVencimentoPreenchida = document.getElementById('contrato-dataVencimento').value

  if (valorPreenchido && !dataVencimentoPreenchida) {
    alert('Data de vencimento é obrigatória quando há valor definido!')
    return
  }

  const body = {
    tipo: tipoContratoAtual,
    clienteId,
    balsas,
    dataInicio,
    dataFim: document.getElementById('contrato-dataFim').value || null,
    valor: valorPreenchido || null,
    frete: document.getElementById('contrato-frete').value || null,
    descontoTipo: document.getElementById('contrato-descontoTipo').value,
    descontoValor: document.getElementById('contrato-descontoValor').value || null,
    periodicidadePagamento: document.getElementById('contrato-periodicidade').value,
    dataVencimento: dataVencimentoPreenchida || null,
    formaPagamento: document.getElementById('contrato-formaPagamento').value,
    condicoesPagto: document.getElementById('contrato-condicoesPagto').value,
    observacoes: document.getElementById('contrato-observacoes').value,
  }

  const res = await apiJson(`${API}/contratos`, { method: 'POST', body: JSON.stringify(body) })

  if (res.ok) {
    alert('Contrato criado com sucesso!')
    inicializarContratos()
  } else {
    const err = await res.json()
    alert('Erro ao criar contrato: ' + (err.erro || ''))
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD DE CONTRATOS — Tela Início
// ══════════════════════════════════════════════════════════════════════════

export async function renderizarDashboardContratos() {
  const container = document.getElementById('inicio')
  if (!container) return

  let painel = document.getElementById('painel-contratos-inicio')
  if (!painel) {
    painel = document.createElement('div')
    painel.id = 'painel-contratos-inicio'
    painel.style = 'margin-top:20px;'
    container.appendChild(painel)
  }

  painel.innerHTML = `<div style="color:#999; padding:12px;">Carregando resumo de contratos...</div>`

  try {
    const d = await apiFetch(`${API}/contratos/dashboard`).then(r => r.json())

    painel.innerHTML = `
      <h5 style="margin-bottom:12px;">Contratos</h5>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="color:#999; font-size:12px;">Ativos</div>
          <div style="font-size:20px; font-weight:700;">${d.total}</div>
        </div>
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="color:#999; font-size:12px;">Em Dia</div>
          <div style="font-size:20px; font-weight:700; color:#198754;">${d.emDia}</div>
        </div>
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="color:#999; font-size:12px;">Atrasados</div>
          <div style="font-size:20px; font-weight:700; color:#dc3545;">${d.atrasados}</div>
        </div>
      </div>
    `
  } catch {
    painel.innerHTML = ''
  }
}

// Expostas em window para funcionar em onclick inline (ex: botões "Voltar")
window.inicializarContratos = inicializarContratos
window.inicializarClientes = inicializarClientes
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
    <div class="tab">Cadastro de Pessoas</div>
    <button class="btn btn-success" onclick="abrirFormularioCliente()">+ Nova Pessoa</button>

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

export function inicializarContratos() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
    document.getElementById('contratos').classList.add('active')

    const container = document.getElementById('contratos')
    container.innerHTML = `
    <div class="tab">Contratos de Locação</div>
    ${podeGerenciarContratos ? `<button class="btn btn-success" onclick="abrirFormularioContrato()">+ Novo Contrato</button>` : ''}

    <div style="margin: 16px 0; max-width:260px;">
      <label style="font-size:12px;">Status</label>
      <select id="filtro-status-contrato" class="form-control" onchange="carregarContratos()">
        <option value="">Todos</option>
        <option value="ativo">Ativo</option>
        <option value="encerrado">Encerrado</option>
        <option value="cancelado">Cancelado</option>
      </select>
    </div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Nº Contrato</th>
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
        <tr><td colspan="8" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

    carregarContratos()
}

window.carregarContratos = async function () {
    const status = document.getElementById('filtro-status-contrato')?.value || ''
    const params = status ? `?status=${status}` : ''

    try {
        const contratos = await apiFetch(`${API}/contratos${params}`).then(r => r.json())
        renderizarTabelaContratos(contratos)
    } catch {
        document.getElementById('tabela-contratos').innerHTML = `
      <tr><td colspan="8" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
    }
}

function renderizarTabelaContratos(contratos) {
    const tabela = document.getElementById('tabela-contratos')
    const colspan = podeGerenciarContratos ? 8 : 7

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
      <button class="btn btn-sm btn-secondary" onclick="encerrarContrato(${c.id})">Encerrar</button>
      <button class="btn btn-sm btn-danger" onclick="cancelarContrato(${c.id})">Cancelar</button>
    ` : ''

        return `
      <tr>
        <td><a href="#" onclick="verContrato(${c.id}); return false;" style="color:var(--verde); font-weight:600; text-decoration:none;">${c.numero}.${c.ano}</a></td>
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

    document.getElementById('contratos').innerHTML = `
    <div style="margin-top:20px; max-width:800px;">
      <button class="btn btn-secondary" onclick="inicializarContratos()">← Voltar</button>

      <div style="display:flex; align-items:center; gap:12px; margin:20px 0;">
        <h3 style="margin:0;">Contrato ${c.numero}.${c.ano}</h3>
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
            <li style="padding:6px 0; border-bottom:1px solid #eee; font-size:13px;">
              <strong>${cb.balsa.numeroSerie}</strong> — ${cb.balsa.fabricante} ${cb.balsa.modelo}, capacidade ${cb.balsa.capacidade}
            </li>
          `).join('')}
        </ul>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Condições</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:13px;">
          <div><span style="color:#999;">Início</span><br><strong>${inicio}</strong></div>
          <div><span style="color:#999;">Fim</span><br><strong>${fim}</strong></div>
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
          <button class="btn btn-secondary" onclick="encerrarContrato(${c.id})">Encerrar Contrato</button>
          <button class="btn btn-danger" onclick="cancelarContrato(${c.id})">Cancelar Contrato</button>
        </div>
      ` : ''}
    </div>
  `
}

// ===== FORMULÁRIO — NOVO CONTRATO =============================================
let balsasDisponiveisCache = []
let clienteSelecionadoId = null

window.abrirFormularioContrato = async function () {
    balsasDisponiveisCache = await apiFetch(`${API}/estoque?finalidade=locacao`).then(r => r.json())
    clienteSelecionadoId = null

    document.getElementById('contratos').innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
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

      <h5 style="margin: 20px 0 10px;">Balsas Disponíveis</h5>
      <div id="lista-balsas-contrato" style="max-height:200px; overflow-y:auto; border:1px solid #ddd; border-radius:4px; padding:8px; margin-bottom:16px;">
        ${balsasDisponiveisCache.length === 0
            ? '<div style="color:#999; padding:8px;">Nenhuma balsa disponível no estoque de locação</div>'
            : balsasDisponiveisCache.map(b => `
            <label style="display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer;">
              <input type="checkbox" value="${b.id}" class="checkbox-balsa-contrato">
              <span>${b.numeroSerie} — ${b.fabricante} ${b.modelo}, capacidade ${b.capacidade}</span>
            </label>
          `).join('')}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Data Início *</label><input type="date" id="contrato-dataInicio" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
        <div><label>Data Fim</label><input type="date" id="contrato-dataFim" class="form-control"></div>
        <div><label>Valor</label><input type="number" id="contrato-valor" class="form-control" step="0.01"></div>
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
    const balsaIds = Array.from(document.querySelectorAll('.checkbox-balsa-contrato:checked')).map(el => parseInt(el.value))

    if (balsaIds.length === 0) {
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

    const body = {
        clienteId,
        balsaIds,
        dataInicio,
        dataFim: document.getElementById('contrato-dataFim').value || null,
        valor: document.getElementById('contrato-valor').value || null,
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
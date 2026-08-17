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

const STATUS_LABEL = {
  aguardando_aprovacao: { texto: 'Ag. Aprovação', cor: '#fd7e14' },
  aprovada: { texto: 'Aprovada', cor: '#198754' },
  recusada: { texto: 'Recusada', cor: '#dc3545' },
  cancelada: { texto: 'Cancelada', cor: '#adb5bd' },
}

function badgeStatus(status) {
  const s = STATUS_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

// ===== RENDERIZA A PÁGINA DE SOLICITAÇÕES =====
export function inicializarSolicitacoes() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('solicitacoes').classList.add('active')

  const container = document.getElementById('solicitacoes')
  container.innerHTML = `
    <div class="tab">Solicitações de Compra</div>
    <button class="btn btn-success" onclick="abrirFormularioSolicitacao()">+ Nova Solicitação</button>

    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin: 16px 0; align-items: end;">
      <div>
        <label>Buscar</label>
        <input type="text" id="filtro-sc-busca" class="form-control" placeholder="Número..." oninput="aplicarFiltrosSC()">
      </div>
      <div>
        <label>Empresa</label>
        <select id="filtro-sc-empresa" class="form-control" onchange="aplicarFiltrosSC()">
          <option value="">Todas</option>
        </select>
      </div>
      <div>
        <label>Status</label>
        <select id="filtro-sc-status" class="form-control" onchange="aplicarFiltrosSC()">
          <option value="">Todos</option>
          <option value="aguardando_aprovacao">Ag. Aprovação</option>
          <option value="aprovada">Aprovada</option>
          <option value="recusada">Recusada</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>
    </div>

    <div id="contador-sc" style="color:#999; font-size:12px; margin-bottom: 8px;"></div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Número</th>
          <th>Empresa</th>
          <th>Itens</th>
          <th>Fornecedores Cotados</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-sc">
        <tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  fetch(`${API}/empresas`, { headers: { 'ngrok-skip-browser-warning': 'true' } }).then(r => r.json()).then(empresas => {
    const select = document.getElementById('filtro-sc-empresa')
    empresas.forEach(e => {
      select.innerHTML += `<option value="${e.id}">${e.sigla}</option>`
    })
  })

  carregarSolicitacoes()
}

let paginaAtualSC = 1

window.carregarSolicitacoes = async function (pagina = 1) {
  paginaAtualSC = pagina
  const busca = document.getElementById('filtro-sc-busca')?.value || ''
  const empresa = document.getElementById('filtro-sc-empresa')?.value || ''
  const status = document.getElementById('filtro-sc-status')?.value || ''

  const params = new URLSearchParams()
  if (busca) params.append('busca', busca)
  if (empresa) params.append('empresa', empresa)
  if (status) params.append('status', status)
  params.append('pagina', pagina)

  try {
    const res = await apiFetch(`${API}/solicitacoes?${params}`)
    const dados = await res.json()
    const solicitacoes = dados.solicitacoes || []
    renderizarTabelaSC(solicitacoes)

    const contador = document.getElementById('contador-sc')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${dados.total || 0} solicitações encontradas</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarSolicitacoes(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarSolicitacoes(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }
  } catch (err) {
    console.error('Erro em carregarSolicitacoes:', err)
    document.getElementById('tabela-sc').innerHTML = `
      <tr><td colspan="6" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

window.aplicarFiltrosSC = function () { carregarSolicitacoes(1) }

function renderizarTabelaSC(solicitacoes) {
  const tabela = document.getElementById('tabela-sc')

  if (solicitacoes.length === 0) {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Nenhuma solicitação cadastrada ainda</td></tr>`
    return
  }

  tabela.innerHTML = solicitacoes.map(sc => {
    const numero = `SC ${sc.numero}.${sc.ano}-${sc.empresa?.sigla || ''}`
    const cancelada = sc.status === 'cancelada'

    const btns = []
    const editavel = ['aguardando_aprovacao', 'recusada'].includes(sc.status)
    if (editavel) btns.push(`<button class="btn btn-sm btn-info" onclick="editarSolicitacao(${sc.id})">Editar</button>`)

    if ((perfil === 'gerente' || perfil === 'admin') && sc.status === 'aguardando_aprovacao') {
      btns.push(`<button class="btn btn-sm btn-success" onclick="verSolicitacao(${sc.id})">Analisar</button>`)
    }

    if (!cancelada) {
      btns.push(`<button class="btn btn-sm btn-danger" onclick="cancelarSolicitacao(${sc.id}, '${numero}')">Cancelar</button>`)
    }

    return `
      <tr style="${cancelada ? 'opacity:0.6; background:#fff5f5;' : ''}">
        <td><a href="#" onclick="verSolicitacao(${sc.id}); return false;" style="color:var(--verde); font-weight:600; text-decoration:none;">${numero}</a></td>
        <td>${sc.empresa?.sigla || '-'}</td>
        <td>${sc.itens?.length || 0}</td>
        <td>${sc.fornecedores?.length || 0}</td>
        <td>${badgeStatus(sc.status)}</td>
        <td style="white-space:nowrap;">${btns.join(' ')}</td>
      </tr>
    `
  }).join('')
}

window.cancelarSolicitacao = async function (id, numero) {
  if (!confirm(`Cancelar a ${numero}?`)) return
  const res = await apiFetch(`${API}/solicitacoes/${id}`, { method: 'DELETE' })
  if (res.ok) carregarSolicitacoes(paginaAtualSC)
  else alert('Erro ao cancelar solicitação')
}

// ══════════════════════════════════════════════════════════════════════════
// FORMULÁRIO — NOVA / EDITAR SOLICITAÇÃO
// ══════════════════════════════════════════════════════════════════════════

// Estado do formulário guardado num único objeto em window, para que os
// atributos onclick/oninput inline (que rodam no escopo global) consigam
// acessar e mutar sem precisar reassinar a referência do objeto.
window.scEstado = { itens: [], fornecedores: [], precos: {} }

function novoItemSC() {
  window.scEstado.itens.push({ quantidade: '', unidade: '', descricao: '' })
}

function novoFornecedorSC() {
  window.scEstado.fornecedores.push({ nome: '', documento: '', telefone: '', prazoEntrega: '', condicoesPagto: '', observacoes: '', favorito: false })
}

window.abrirFormularioSolicitacao = async function (dadosExistentes = null) {
  const empresas = await fetch(`${API}/empresas`, { headers: { 'ngrok-skip-browser-warning': 'true' } }).then(r => r.json())
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${dadosExistentes?.empresaId === e.id ? 'selected' : ''}>${e.nome} (${e.sigla})</option>`
  ).join('')

  if (dadosExistentes) {
    window.scEstado.itens = dadosExistentes.itens.map(i => ({ quantidade: i.quantidade, unidade: i.unidade || '', descricao: i.descricao }))
    window.scEstado.fornecedores = dadosExistentes.fornecedores.map(f => ({
      nome: f.nome, documento: f.documento || '', telefone: f.telefone || '',
      prazoEntrega: f.prazoEntrega || '', condicoesPagto: f.condicoesPagto || '',
      observacoes: f.observacoes || '', favorito: f.favorito
    }))
    window.scEstado.precos = {}
    dadosExistentes.itens.forEach((item, iIdx) => {
      dadosExistentes.fornecedores.forEach((forn, fIdx) => {
        const preco = item.precos?.find(p => p.fornecedorCotadoId === forn.id)
        if (preco) window.scEstado.precos[`${iIdx}-${fIdx}`] = preco.valor
      })
    })
  } else {
    window.scEstado.itens = []
    window.scEstado.fornecedores = []
    window.scEstado.precos = {}
    novoItemSC()
    novoFornecedorSC()
  }

  document.getElementById('solicitacoes').innerHTML = `
    <div style="margin-top:20px;">
      <button class="btn btn-secondary" onclick="inicializarSolicitacoes()">← Voltar</button>
      <h3 style="margin: 20px 0;">${dadosExistentes ? `Editar Solicitação ${dadosExistentes.numero}.${dadosExistentes.ano}` : 'Nova Solicitação de Compra'}</h3>

      <div style="max-width:400px; margin-bottom:16px;">
        <label>Empresa *</label>
        <select id="sc-empresaId" class="form-control">
          <option value="">Selecione...</option>
          ${opcoesEmpresas}
        </select>
      </div>

      <div style="margin-bottom:16px;">
        <label>Instruções</label>
        <textarea id="sc-instrucoes" class="form-control" rows="2">${dadosExistentes?.instrucoes || ''}</textarea>
      </div>

      <h5 style="margin: 20px 0 10px;">Itens</h5>
      <div id="lista-itens-sc"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="adicionarItemSC()">+ Item</button>

      <h5 style="margin: 24px 0 10px;">Fornecedores Cotados</h5>
      <div id="lista-fornecedores-sc"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="adicionarFornecedorSC()">+ Fornecedor</button>

      <h5 style="margin: 24px 0 10px;">Preços Cotados</h5>
      <p style="font-size:12px; color:#999;">Preencha o valor unitário que cada fornecedor cotou para cada item. Deixe em branco se o fornecedor não cotou aquele item.</p>
      <div id="matriz-precos-sc" style="overflow-x:auto;"></div>

      <button type="button" class="btn btn-success" style="margin-top:24px;" onclick="salvarSolicitacao(${dadosExistentes?.id || 'null'})">
        ${dadosExistentes ? 'Salvar Alterações' : 'Salvar Solicitação'}
      </button>
    </div>
  `

  renderizarItensSC()
  renderizarFornecedoresSC()
  renderizarMatrizPrecosSC()
}

function renderizarItensSC() {
  const container = document.getElementById('lista-itens-sc')
  container.innerHTML = window.scEstado.itens.map((item, i) => `
    <div style="display:grid; grid-template-columns: 100px 100px 1fr 40px; gap:8px; margin-bottom:8px;">
      <input type="number" class="form-control" placeholder="Qtd" value="${item.quantidade}" oninput="scEstado.itens[${i}].quantidade = this.value">
      <input type="text" class="form-control" placeholder="Unid" value="${item.unidade}" oninput="scEstado.itens[${i}].unidade = this.value">
      <input type="text" class="form-control" placeholder="Descrição" value="${item.descricao}" oninput="scEstado.itens[${i}].descricao = this.value; renderizarMatrizPrecosSC()">
      <button class="btn btn-sm btn-danger" onclick="removerItemSC(${i})">✕</button>
    </div>
  `).join('')
}

window.adicionarItemSC = function () {
  novoItemSC()
  renderizarItensSC()
  renderizarMatrizPrecosSC()
}

window.removerItemSC = function (i) {
  window.scEstado.itens.splice(i, 1)
  const novosPrecos = {}
  Object.entries(window.scEstado.precos).forEach(([chave, valor]) => {
    const [iIdx, fIdx] = chave.split('-').map(Number)
    if (iIdx === i) return
    const novoIdx = iIdx > i ? iIdx - 1 : iIdx
    novosPrecos[`${novoIdx}-${fIdx}`] = valor
  })
  window.scEstado.precos = novosPrecos
  renderizarItensSC()
  renderizarMatrizPrecosSC()
}

function renderizarFornecedoresSC() {
  const container = document.getElementById('lista-fornecedores-sc')
  container.innerHTML = window.scEstado.fornecedores.map((f, i) => `
    <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:8px;">
      <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 40px; gap:8px; margin-bottom:8px;">
        <input type="text" class="form-control" placeholder="Nome *" value="${f.nome}" oninput="scEstado.fornecedores[${i}].nome = this.value; renderizarMatrizPrecosSC()">
        <input type="text" class="form-control" placeholder="CNPJ/CPF" value="${f.documento}" oninput="scEstado.fornecedores[${i}].documento = this.value">
        <input type="text" class="form-control" placeholder="Telefone" value="${f.telefone}" oninput="scEstado.fornecedores[${i}].telefone = this.value">
        <button class="btn btn-sm btn-danger" onclick="removerFornecedorSC(${i})">✕</button>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
        <input type="text" class="form-control" placeholder="Prazo de entrega" value="${f.prazoEntrega}" oninput="scEstado.fornecedores[${i}].prazoEntrega = this.value">
        <input type="text" class="form-control" placeholder="Condições pagto" value="${f.condicoesPagto}" oninput="scEstado.fornecedores[${i}].condicoesPagto = this.value">
        <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
          <input type="checkbox" ${f.favorito ? 'checked' : ''} onchange="scEstado.fornecedores[${i}].favorito = this.checked">
          Favorito
        </label>
      </div>
    </div>
  `).join('')
}

window.adicionarFornecedorSC = function () {
  novoFornecedorSC()
  renderizarFornecedoresSC()
  renderizarMatrizPrecosSC()
}

window.removerFornecedorSC = function (i) {
  window.scEstado.fornecedores.splice(i, 1)
  const novosPrecos = {}
  Object.entries(window.scEstado.precos).forEach(([chave, valor]) => {
    const [iIdx, fIdx] = chave.split('-').map(Number)
    if (fIdx === i) return
    const novoIdx = fIdx > i ? fIdx - 1 : fIdx
    novosPrecos[`${iIdx}-${novoIdx}`] = valor
  })
  window.scEstado.precos = novosPrecos
  renderizarFornecedoresSC()
  renderizarMatrizPrecosSC()
}

window.renderizarMatrizPrecosSC = function () {
  const container = document.getElementById('matriz-precos-sc')
  if (!container) return

  const itens = window.scEstado.itens
  const fornecedores = window.scEstado.fornecedores

  if (itens.length === 0 || fornecedores.length === 0) {
    container.innerHTML = '<p style="color:#999; font-size:13px;">Adicione ao menos um item e um fornecedor para preencher os preços.</p>'
    return
  }

  container.innerHTML = `
    <table class="table-certificados">
      <thead>
        <tr>
          <th>Item</th>
          ${fornecedores.map(f => `<th>${f.nome || '(sem nome)'}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${itens.map((item, iIdx) => `
          <tr>
            <td>${item.descricao || '(sem descrição)'}</td>
            ${fornecedores.map((f, fIdx) => `
              <td>
                <input type="number" step="0.01" class="form-control form-control-sm"
                  value="${window.scEstado.precos[`${iIdx}-${fIdx}`] ?? ''}"
                  oninput="scEstado.precos['${iIdx}-${fIdx}'] = this.value">
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

window.salvarSolicitacao = async function (id) {
  const empresaId = parseInt(document.getElementById('sc-empresaId').value)
  const instrucoes = document.getElementById('sc-instrucoes').value

  if (!empresaId) {
    alert('Empresa é obrigatória!')
    return
  }

  const itens = window.scEstado.itens
  const fornecedores = window.scEstado.fornecedores
  const precos = window.scEstado.precos

  if (itens.length === 0 || itens.some(i => !i.descricao)) {
    alert('Todos os itens precisam de uma descrição!')
    return
  }
  if (fornecedores.length === 0 || fornecedores.some(f => !f.nome)) {
    alert('Todos os fornecedores precisam de um nome!')
    return
  }

  const precosArray = Object.entries(precos)
    .filter(([, valor]) => valor !== '' && valor !== null && valor !== undefined)
    .map(([chave, valor]) => {
      const [itemIndex, fornecedorIndex] = chave.split('-').map(Number)
      return { itemIndex, fornecedorIndex, valor }
    })

  const body = { empresaId, instrucoes, itens, fornecedores, precos: precosArray }

  const url = id ? `${API}/solicitacoes/${id}` : `${API}/solicitacoes`
  const method = id ? 'PUT' : 'POST'

  const res = await apiJson(url, { method, body: JSON.stringify(body) })

  if (res.ok) {
    const sc = await res.json()
    if (!id) {
      abrirModalAssinaturaSC(sc.id, 'solicitante')
    } else {
      alert('Solicitação atualizada com sucesso!')
      inicializarSolicitacoes()
    }
  } else {
    const err = await res.json()
    alert('Erro ao salvar solicitação: ' + (err.erro || ''))
  }
}

window.editarSolicitacao = async function (id) {
  const sc = await apiFetch(`${API}/solicitacoes/${id}`).then(r => r.json())
  abrirFormularioSolicitacao(sc)
}

// ══════════════════════════════════════════════════════════════════════════
// VISUALIZAÇÃO — TABELA COMPARATIVA + APROVAÇÃO
// ══════════════════════════════════════════════════════════════════════════

window.verSolicitacao = async function (id) {
  const sc = await apiFetch(`${API}/solicitacoes/${id}`).then(r => r.json())

  const numero = `SC ${sc.numero}.${sc.ano}-${sc.empresa?.sigla || ''}`
  const asSolicitante = sc.assinaturas?.find(a => a.etapa === 'solicitante')

  const totais = sc.fornecedores.map(f => {
    const total = sc.itens.reduce((acc, item) => {
      const preco = item.precos.find(p => p.fornecedorCotadoId === f.id)
      return acc + (preco ? preco.valor * item.quantidade : 0)
    }, 0)
    const qtdCotados = sc.itens.filter(item => item.precos.some(p => p.fornecedorCotadoId === f.id)).length
    return { fornecedor: f, total, qtdCotados }
  })

  const podeAprovar = (perfil === 'gerente' || perfil === 'admin') && sc.status === 'aguardando_aprovacao' && asSolicitante

  document.getElementById('solicitacoes').innerHTML = `
    <div style="margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="inicializarSolicitacoes()">← Voltar</button>
        ${sc.status === 'aguardando_aprovacao' ? `<button class="btn btn-danger" onclick="abrirModalRecusaSC(${sc.id})">Recusar</button>` : ''}
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <h3 style="margin:0;">${numero}</h3>
        ${badgeStatus(sc.status)}
      </div>

      ${!asSolicitante ? `
        <div style="background:#fff3cd; border:1px solid #ffc107; padding:12px 16px; border-radius:6px; margin-bottom:20px;">
          ⚠️ Esta solicitação ainda não foi assinada pelo solicitante.
          <button class="btn btn-sm btn-success" style="margin-left:8px;" onclick="abrirModalAssinaturaSC(${sc.id}, 'solicitante')">Assinar agora</button>
        </div>
      ` : ''}

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Quadro Comparativo</div>
        <table class="table-certificados">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qtd</th>
              ${sc.fornecedores.map(f => `<th>${f.nome} ${f.favorito ? '⭐' : ''} ${f.escolhido ? '<span style="color:#198754;">✓ Escolhido</span>' : ''}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${sc.itens.map(item => `
              <tr>
                <td>${item.descricao}</td>
                <td>${item.quantidade} ${item.unidade || ''}</td>
                ${sc.fornecedores.map(f => {
    const preco = item.precos.find(p => p.fornecedorCotadoId === f.id)
    return `<td>${preco ? 'R$ ' + preco.valor.toFixed(2) : '<span style="color:#ccc;">—</span>'}</td>`
  }).join('')}
              </tr>
            `).join('')}
            <tr style="font-weight:700; background:#f9f9f9;">
              <td colspan="2">TOTAL</td>
              ${totais.map(t => `<td>R$ ${t.total.toFixed(2)} <small style="color:#999;">(${t.qtdCotados}/${sc.itens.length} itens)</small></td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Dados dos Fornecedores</div>
        <div style="display:grid; grid-template-columns:repeat(${Math.min(sc.fornecedores.length, 3)}, 1fr); gap:12px;">
          ${sc.fornecedores.map(f => `
            <div style="border:1px solid #eee; border-radius:6px; padding:10px; font-size:13px;">
              <strong>${f.nome}</strong> ${f.favorito ? '⭐' : ''}<br>
              ${f.documento ? `CNPJ: ${f.documento}<br>` : ''}
              ${f.telefone ? `Tel: ${f.telefone}<br>` : ''}
              ${f.prazoEntrega ? `Prazo: ${f.prazoEntrega}<br>` : ''}
              ${f.condicoesPagto ? `Pagto: ${f.condicoesPagto}<br>` : ''}
              ${f.observacoes ? `<em>${f.observacoes}</em>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      ${podeAprovar ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:#158815; margin-bottom:10px;">Escolher fornecedor e aprovar</div>
          <select id="sc-fornecedor-escolhido" class="form-control" style="max-width:400px; margin-bottom:12px;">
            <option value="">Selecione o fornecedor...</option>
            ${sc.fornecedores.map(f => `<option value="${f.id}">${f.nome} ${f.favorito ? '⭐' : ''} — R$ ${totais.find(t => t.fornecedor.id === f.id).total.toFixed(2)}</option>`).join('')}
          </select>
          <button class="btn btn-success" onclick="abrirModalAssinaturaSC(${sc.id}, 'aprovar')">✓ Aprovar e Gerar OC</button>
        </div>
      ` : ''}

      ${sc.ocGerada ? `
        <div style="background:#d1e7dd; border:1px solid #198754; padding:12px 16px; border-radius:6px;">
          ✅ OC gerada a partir desta solicitação.
        </div>
      ` : ''}
    </div>
  `
}

window.abrirModalRecusaSC = function (id) {
  const modal = document.createElement('div')
  modal.id = 'modal-recusa-sc'
  modal.style = `position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;`
  modal.innerHTML = `
    <div style="background:white; border-radius:8px; padding:28px; width:440px; max-width:95vw; box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <h4 style="margin:0 0 16px; color:#dc3545;">Recusar Solicitação</h4>
      <div style="margin-bottom:16px;">
        <label style="font-weight:600; font-size:13px;">Motivo *</label>
        <textarea id="motivo-recusa-sc" class="form-control" rows="4"></textarea>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="document.getElementById('modal-recusa-sc').remove()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmarRecusaSC(${id})">Confirmar Recusa</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
}

window.confirmarRecusaSC = async function (id) {
  const motivo = document.getElementById('motivo-recusa-sc').value.trim()
  if (!motivo) { alert('O motivo é obrigatório.'); return }

  const res = await apiJson(`${API}/solicitacoes/${id}/recusar`, { method: 'POST', body: JSON.stringify({ motivo }) })
  if (res.ok) {
    document.getElementById('modal-recusa-sc').remove()
    alert('Solicitação recusada.')
    inicializarSolicitacoes()
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao recusar'))
  }
}

// ===== MODAL DE ASSINATURA (canvas) — reaproveitado para solicitante e aprovação =====
window.abrirModalAssinaturaSC = function (id, acao) {
  if (acao === 'aprovar') {
    const select = document.getElementById('sc-fornecedor-escolhido')
    if (!select || !select.value) {
      alert('Selecione um fornecedor antes de aprovar.')
      return
    }
  }

  const titulos = { solicitante: 'Assinar como Solicitante', aprovar: 'Aprovar Solicitação' }
  const textoChk = {
    solicitante: 'Confirmo que sou o solicitante desta cotação',
    aprovar: 'Confirmo que li o quadro comparativo e aprovo esta escolha'
  }

  const modal = document.createElement('div')
  modal.id = 'modal-assinatura-sc'
  modal.style = `position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;`
  modal.innerHTML = `
    <div style="background:white; border-radius:8px; padding:28px; width:480px; max-width:95vw; box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <h4 style="margin:0 0 16px; color:#158815;">${titulos[acao]}</h4>
      <p style="font-size:13px; color:#555; margin-bottom:12px;">Desenhe sua assinatura abaixo (opcional):</p>
      <canvas id="canvas-assinatura-sc" width="420" height="120" style="border:1px solid #ddd; border-radius:4px; cursor:crosshair; touch-action:none; width:100%;"></canvas>
      <div style="margin-top:8px;"><button class="btn btn-sm btn-secondary" onclick="limparCanvasSC()">Limpar</button></div>
      <div style="margin-top:16px; padding:12px; background:#f0fff0; border-radius:4px; font-size:13px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="checkbox-confirmar-sc">
          ${textoChk[acao]}
        </label>
      </div>
      <div style="margin-top:20px; display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="document.getElementById('modal-assinatura-sc').remove()">Cancelar</button>
        <button class="btn btn-success" onclick="confirmarAssinaturaSC(${id}, '${acao}')">Confirmar</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  iniciarCanvasSC()
}

let canvasSCDesenhando = false

function iniciarCanvasSC() {
  const canvas = document.getElementById('canvas-assinatura-sc')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  function pos(e) {
    const r = canvas.getBoundingClientRect()
    const scaleX = canvas.width / r.width
    const scaleY = canvas.height / r.height
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY }
  }

  canvas.addEventListener('mousedown', e => { canvasSCDesenhando = true; ctx.beginPath(); const p = pos(e); ctx.moveTo(p.x, p.y) })
  canvas.addEventListener('mousemove', e => { if (!canvasSCDesenhando) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke() })
  canvas.addEventListener('mouseup', () => canvasSCDesenhando = false)
  canvas.addEventListener('mouseleave', () => canvasSCDesenhando = false)
  canvas.addEventListener('touchstart', e => { e.preventDefault(); canvasSCDesenhando = true; ctx.beginPath(); const p = pos(e); ctx.moveTo(p.x, p.y) })
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!canvasSCDesenhando) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke() })
  canvas.addEventListener('touchend', () => canvasSCDesenhando = false)
}

window.limparCanvasSC = function () {
  const canvas = document.getElementById('canvas-assinatura-sc')
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
}

window.confirmarAssinaturaSC = async function (id, acao) {
  const checkbox = document.getElementById('checkbox-confirmar-sc')
  if (!checkbox.checked) { alert('Marque a caixa de confirmação para continuar.'); return }

  const canvas = document.getElementById('canvas-assinatura-sc')
  const assinaturaImg = canvas ? canvas.toDataURL('image/png') : null

  if (acao === 'solicitante') {
    const res = await apiJson(`${API}/solicitacoes/${id}/assinar-solicitante`, {
      method: 'POST', body: JSON.stringify({ assinaturaImg })
    })
    if (res.ok) {
      document.getElementById('modal-assinatura-sc').remove()
      alert('Assinatura registrada!')
      verSolicitacao(id)
    } else {
      const err = await res.json()
      alert('Erro: ' + (err.erro || 'Falha ao processar'))
    }
    return
  }

  if (acao === 'aprovar') {
    const fornecedorEscolhidoId = document.getElementById('sc-fornecedor-escolhido').value
    const res = await apiJson(`${API}/solicitacoes/${id}/aprovar`, {
      method: 'POST', body: JSON.stringify({ fornecedorEscolhidoId, assinaturaImg })
    })
    if (res.ok) {
      document.getElementById('modal-assinatura-sc').remove()
      alert('Solicitação aprovada! OC gerada com sucesso.')
      inicializarSolicitacoes()
    } else {
      const err = await res.json()
      alert('Erro: ' + (err.erro || 'Falha ao aprovar'))
    }
  }
}

// Exposta em window para funcionar em onclick inline (ex: botão "Voltar")
window.inicializarSolicitacoes = inicializarSolicitacoes
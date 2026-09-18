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
const podeGerenciarOrcamentos = perfil === 'admin' || perfil === 'gerente'

function formatarMoedaOrc(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarDataOrc(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR') : '-'
}

// ══════════════════════════════════════════════════════════════════════════
// ORÇAMENTOS (aba Produtos → Orçamentos)
// ══════════════════════════════════════════════════════════════════════════

const STATUS_ORCAMENTO_LABEL = {
  em_andamento: { texto: 'Em andamento', cor: '#997404', fundo: '#fff3cd' },
  aprovado: { texto: 'Aprovado', cor: 'white', fundo: '#198754' },
  recusado: { texto: 'Recusado', cor: 'white', fundo: '#dc3545' },
  expirado: { texto: 'Expirado', cor: 'white', fundo: '#6c757d' },
  convertido: { texto: 'Convertido', cor: 'white', fundo: '#0d6efd' },
}

function badgeStatusOrcamento(status) {
  const s = STATUS_ORCAMENTO_LABEL[status] || { texto: status, cor: 'white', fundo: '#6c757d' }
  return `<span style="background:${s.fundo}; color:${s.cor}; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

function badgeEnvioOrcamento(statusEnvio) {
  return statusEnvio === 'enviado'
    ? `<span style="color:#198754;">Enviado ✓</span>`
    : `<span style="color:#999;">E-mail não enviado</span>`
}

export function inicializarOrcamentos() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('orcamentos').classList.add('active')

  const container = document.getElementById('orcamentos')
  container.innerHTML = `
    <div class="tab">Orçamentos</div>
    ${podeGerenciarOrcamentos ? `<button class="btn btn-success" onclick="abrirFormularioOrcamento()">+ Novo Orçamento</button>` : ''}

    <div style="display:flex; gap:16px; margin: 16px 0; max-width:280px;">
      <div style="flex:1;">
        <label style="font-size:12px;">Situação</label>
        <select id="filtro-status-orcamento" class="form-control" onchange="carregarOrcamentos(1)">
          <option value="">Todas</option>
          <option value="em_andamento">Em andamento</option>
          <option value="aprovado">Aprovado</option>
          <option value="recusado">Recusado</option>
          <option value="expirado">Expirado</option>
          <option value="convertido">Convertido</option>
        </select>
      </div>
    </div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Nº Orçamento</th>
          <th>Cliente</th>
          <th>Vendedor</th>
          <th>Data</th>
          <th>Validade</th>
          <th>Situação</th>
          <th>Envio</th>
          <th>Total líquido</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-orcamentos">
        <tr><td colspan="9" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
    <div id="contador-orcamentos" style="margin-top:12px;"></div>
  `

  carregarOrcamentos()
}
window.inicializarOrcamentos = inicializarOrcamentos

let paginaAtualOrcamentos = 1

window.carregarOrcamentos = async function (pagina = 1) {
  paginaAtualOrcamentos = pagina
  const status = document.getElementById('filtro-status-orcamento')?.value || ''
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  params.append('pagina', pagina)

  try {
    const dados = await apiFetch(`${API}/orcamentos?${params}`).then(r => r.json())
    renderizarTabelaOrcamentos(dados.orcamentos || [])

    const contador = document.getElementById('contador-orcamentos')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${dados.total || 0} orçamentos encontrados</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarOrcamentos(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarOrcamentos(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }
  } catch {
    document.getElementById('tabela-orcamentos').innerHTML = `
      <tr><td colspan="9" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

function renderizarTabelaOrcamentos(orcamentos) {
  const tabela = document.getElementById('tabela-orcamentos')

  if (orcamentos.length === 0) {
    tabela.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#999; padding:30px;">Nenhum orçamento encontrado</td></tr>`
    return
  }

  tabela.innerHTML = orcamentos.map(o => `
    <tr>
      <td><a href="#" onclick="verOrcamento(${o.id}); return false;" style="color:var(--acento); font-weight:600; text-decoration:none;">${o.numero}.${o.ano}</a></td>
      <td>${o.cliente.nome}</td>
      <td>${o.vendedor?.nome || '-'}</td>
      <td>${formatarDataOrc(o.dataOrcamento)}</td>
      <td>${formatarDataOrc(o.validade)}</td>
      <td>${badgeStatusOrcamento(o.status)}</td>
      <td>${badgeEnvioOrcamento(o.statusEnvio)}</td>
      <td>${formatarMoedaOrc(o.totalLiquido)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm btn-info" onclick="verOrcamento(${o.id})">Ver</button>
        ${podeGerenciarOrcamentos && o.status !== 'convertido' ? `<button class="btn btn-sm btn-secondary" onclick="editarOrcamento(${o.id})">Editar</button>` : ''}
      </td>
    </tr>
  `).join('')
}

// ===== VISUALIZAÇÃO DO ORÇAMENTO ================================================
window.verOrcamento = async function (id) {
  const o = await apiFetch(`${API}/orcamentos/${id}`).then(r => r.json())

  const tipoLabel = { produto: 'Produto', servico: 'Serviço' }

  document.getElementById('orcamentos').innerHTML = `
    <div style="margin-top:20px; max-width:1000px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <button class="btn btn-secondary" onclick="inicializarOrcamentos()">← Voltar</button>
        ${podeGerenciarOrcamentos && o.status !== 'convertido' ? `<button class="btn btn-info" onclick="editarOrcamento(${o.id})">Editar</button>` : ''}
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin:20px 0;">
        <h3 style="margin:0;">Orçamento ${o.numero}.${o.ano}</h3>
        ${badgeStatusOrcamento(o.status)}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Informações do orçamento</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; font-size:13px;">
          <div><span style="color:#999;">Cliente</span><br><strong>${o.cliente.nome}</strong></div>
          <div><span style="color:#999;">E-mail</span><br><strong>${o.email || '-'}</strong></div>
          <div><span style="color:#999;">Telefone</span><br><strong>${o.telefone || '-'}</strong></div>
          <div><span style="color:#999;">Vendedor responsável</span><br><strong>${o.vendedor?.nome || '-'}</strong></div>
          <div><span style="color:#999;">Status de envio</span><br>${badgeEnvioOrcamento(o.statusEnvio)}</div>
          <div><span style="color:#999;">Situação do orçamento</span><br>${badgeStatusOrcamento(o.status)}</div>
          <div><span style="color:#999;">Data do orçamento</span><br><strong>${formatarDataOrc(o.dataOrcamento)}</strong></div>
          <div><span style="color:#999;">Validade do orçamento</span><br><strong>${formatarDataOrc(o.validade)}</strong></div>
          <div><span style="color:#999;">Previsão de entrega</span><br><strong>${formatarDataOrc(o.previsaoEntrega)}</strong></div>
        </div>
        ${o.descricao ? `
          <div style="margin-top:14px;">
            <span style="color:#999; font-size:13px;">Descrição</span>
            <div style="font-size:13px; white-space:pre-line;">${o.descricao}</div>
          </div>
        ` : ''}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <table class="table-certificados" style="margin:0;">
          <thead>
            <tr><th>Produto/Serviço</th><th>Tipo</th><th>Detalhes</th><th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            ${o.itens.map(i => `
              <tr>
                <td>${i.nome}</td>
                <td>${tipoLabel[i.tipo] || i.tipo}</td>
                <td>${i.detalhes || '-'}</td>
                <td>${i.quantidade}</td>
                <td>${formatarMoedaOrc(i.valorUnitario)}</td>
                <td>${formatarMoedaOrc(i.quantidade * i.valorUnitario)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="margin-top:16px; padding-top:16px; border-top:1px solid #eee; display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:700;">Total do orçamento</div>
            <div style="color:#999; font-size:12px;">Total de itens: ${o.itens.length}</div>
          </div>
          <div style="text-align:right; font-size:13px;">
            <div>Total bruto: <strong>${formatarMoedaOrc(o.totalBruto)}</strong></div>
            <div>Desconto: <strong>${formatarMoedaOrc(o.descontoAplicado)}</strong></div>
            <div style="margin-top:4px;">Total líquido: <strong style="color:#198754; font-size:16px;">${formatarMoedaOrc(o.totalLiquido)}</strong></div>
          </div>
        </div>
      </div>

      ${o.observacoes ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:var(--acento); margin-bottom:8px;">Observações</div>
          <div style="font-size:13px; color:#444; white-space:pre-line;">${o.observacoes}</div>
        </div>
      ` : ''}

      ${podeGerenciarOrcamentos ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${o.statusEnvio === 'nao_enviado' ? `<button class="btn btn-secondary" onclick="mudarStatusEnvioOrcamento(${o.id}, 'enviado')">Marcar como Enviado</button>` : ''}
          ${o.status === 'em_andamento' ? `
            <button class="btn btn-success" onclick="mudarStatusOrcamento(${o.id}, 'aprovado')">Aprovar</button>
            <button class="btn btn-danger" onclick="mudarStatusOrcamento(${o.id}, 'recusado')">Recusar</button>
          ` : ''}
          ${o.status === 'aprovado' ? `<button class="btn btn-success" onclick="abrirCriarVendaOrcamento(${o.id})">Criar Venda</button>` : ''}
          ${o.status !== 'convertido' ? `<button class="btn btn-danger" style="margin-left:auto;" onclick="excluirOrcamento(${o.id})">Excluir</button>` : ''}
        </div>
      ` : ''}
    </div>
  `
}

window.mudarStatusOrcamento = async function (id, status) {
  const res = await apiJson(`${API}/orcamentos/${id}`, { method: 'PUT', body: JSON.stringify({ status }) })
  if (res.ok) verOrcamento(id)
  else alert('Erro ao atualizar situação do orçamento')
}

window.mudarStatusEnvioOrcamento = async function (id, statusEnvio) {
  const res = await apiJson(`${API}/orcamentos/${id}`, { method: 'PUT', body: JSON.stringify({ statusEnvio }) })
  if (res.ok) verOrcamento(id)
  else alert('Erro ao atualizar status de envio')
}

window.excluirOrcamento = async function (id) {
  if (!confirm('Excluir este orçamento? Essa ação não pode ser desfeita.')) return
  const res = await apiJson(`${API}/orcamentos/${id}`, { method: 'DELETE' })
  if (res.ok) inicializarOrcamentos()
  else alert('Erro ao excluir orçamento')
}

// ===== FORMULÁRIO — NOVO / EDITAR ORÇAMENTO ====================================
let clienteSelecionadoOrcId = null
let usuariosCacheOrc = []
let orcCatalogoProdutos = []
let orcCatalogoServicos = []
let orcItensAtivos = []
let orcItensContador = 0
let orcamentoEmEdicaoId = null

function opcoesCatalogoItem(tipo, selecionadoId) {
  const lista = tipo === 'produto' ? orcCatalogoProdutos : orcCatalogoServicos
  const opcoes = lista.map(c =>
    `<option value="${c.id}" ${String(c.id) === String(selecionadoId) ? 'selected' : ''}>${c.nome}</option>`
  ).join('')
  return `<option value="">Selecione...</option>${opcoes}<option value="novo">+ Cadastrar novo...</option>`
}

function linhaItemOrcamento(i, item = {}) {
  const tipo = item.tipo || 'servico'
  const selecionadoId = tipo === 'produto' ? item.produtoId : item.servicoId
  return `
    <tr id="orc-item-row-${i}">
      <td>
        <select class="form-control form-control-sm" id="orc-item-tipo-${i}" onchange="mudarTipoItemOrcamento(${i})">
          <option value="servico" ${tipo === 'servico' ? 'selected' : ''}>Serviço</option>
          <option value="produto" ${tipo === 'produto' ? 'selected' : ''}>Produto</option>
        </select>
      </td>
      <td style="min-width:180px;">
        <select class="form-control form-control-sm" id="orc-item-catalogo-${i}" onchange="selecionarCatalogoItemOrcamento(${i})">
          ${opcoesCatalogoItem(tipo, selecionadoId)}
        </select>
        <div id="orc-item-novo-${i}" style="display:none;"></div>
      </td>
      <td><input type="text" class="form-control form-control-sm" id="orc-item-detalhes-${i}" value="${item.detalhes || ''}" placeholder="Opcional"></td>
      <td><input type="number" class="form-control form-control-sm" id="orc-item-qtd-${i}" min="0" step="0.01" value="${item.quantidade || 1}" style="width:80px;" oninput="recalcularTotaisOrcamento()"></td>
      <td><input type="number" class="form-control form-control-sm" id="orc-item-valor-${i}" min="0" step="0.01" value="${item.valorUnitario ?? ''}" style="width:100px;" oninput="recalcularTotaisOrcamento()"></td>
      <td class="orc-col-desconto-item" style="display:none;">
        <div style="display:flex; gap:4px;">
          <select class="form-control form-control-sm" id="orc-item-descTipo-${i}" style="width:58px;" onchange="recalcularTotaisOrcamento()">
            <option value="percentual" ${item.descontoTipo !== 'fixo' ? 'selected' : ''}>%</option>
            <option value="fixo" ${item.descontoTipo === 'fixo' ? 'selected' : ''}>R$</option>
          </select>
          <input type="number" class="form-control form-control-sm" id="orc-item-descValor-${i}" min="0" step="0.01" value="${item.descontoValor || ''}" style="width:70px;" oninput="recalcularTotaisOrcamento()">
        </div>
      </td>
      <td id="orc-item-subtotal-${i}" style="text-align:right; font-weight:600; white-space:nowrap;">R$ 0,00</td>
      <td><button type="button" class="btn btn-sm btn-danger" onclick="removerItemOrcamento(${i})">✕</button></td>
    </tr>
  `
}

window.adicionarLinhaItemOrcamento = function (item = {}) {
  const i = orcItensContador++
  orcItensAtivos.push(i)
  document.getElementById('orc-itens-tbody').insertAdjacentHTML('beforeend', linhaItemOrcamento(i, item))
  recalcularTotaisOrcamento()
}

window.removerItemOrcamento = function (i) {
  document.getElementById(`orc-item-row-${i}`)?.remove()
  orcItensAtivos = orcItensAtivos.filter(x => x !== i)
  recalcularTotaisOrcamento()
}

window.mudarTipoItemOrcamento = function (i) {
  const tipo = document.getElementById(`orc-item-tipo-${i}`).value
  document.getElementById(`orc-item-catalogo-${i}`).innerHTML = opcoesCatalogoItem(tipo, '')
  document.getElementById(`orc-item-valor-${i}`).value = ''
  const novoDiv = document.getElementById(`orc-item-novo-${i}`)
  novoDiv.style.display = 'none'
  novoDiv.innerHTML = ''
  recalcularTotaisOrcamento()
}

window.selecionarCatalogoItemOrcamento = function (i) {
  const tipo = document.getElementById(`orc-item-tipo-${i}`).value
  const select = document.getElementById(`orc-item-catalogo-${i}`)
  const novoDiv = document.getElementById(`orc-item-novo-${i}`)

  if (select.value === 'novo') {
    novoDiv.style.display = 'block'
    novoDiv.innerHTML = tipo === 'produto' ? `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:6px;">
        <input type="text" class="form-control form-control-sm" id="orc-item-novo-codigo-${i}" placeholder="Código *">
        <input type="text" class="form-control form-control-sm" id="orc-item-novo-nome-${i}" placeholder="Nome *">
        <input type="text" class="form-control form-control-sm" id="orc-item-novo-unidade-${i}" placeholder="Unidade *">
        <input type="number" step="0.01" class="form-control form-control-sm" id="orc-item-novo-valor-${i}" placeholder="Valor (R$)">
      </div>
      <button type="button" class="btn btn-sm btn-secondary" style="margin-top:4px;" onclick="criarItemCatalogoOrcamento(${i}, 'produto')">Cadastrar e usar</button>
    ` : `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:6px;">
        <input type="text" class="form-control form-control-sm" id="orc-item-novo-nome-${i}" placeholder="Nome *" style="grid-column:span 2;">
        <input type="number" step="0.01" class="form-control form-control-sm" id="orc-item-novo-valor-${i}" placeholder="Valor (R$)">
      </div>
      <button type="button" class="btn btn-sm btn-secondary" style="margin-top:4px;" onclick="criarItemCatalogoOrcamento(${i}, 'servico')">Cadastrar e usar</button>
    `
    return
  }

  novoDiv.style.display = 'none'
  novoDiv.innerHTML = ''

  if (!select.value) return

  const lista = tipo === 'produto' ? orcCatalogoProdutos : orcCatalogoServicos
  const item = lista.find(c => String(c.id) === select.value)
  if (item) document.getElementById(`orc-item-valor-${i}`).value = item.valor ?? ''
  recalcularTotaisOrcamento()
}

window.criarItemCatalogoOrcamento = async function (i, tipo) {
  const nome = document.getElementById(`orc-item-novo-nome-${i}`).value.trim()
  const valor = document.getElementById(`orc-item-novo-valor-${i}`).value
  if (!nome) { alert('Nome é obrigatório!'); return }

  let novo
  if (tipo === 'produto') {
    const codigo = document.getElementById(`orc-item-novo-codigo-${i}`).value.trim()
    const unidade = document.getElementById(`orc-item-novo-unidade-${i}`).value.trim()
    if (!codigo || !unidade) { alert('Código e unidade são obrigatórios!'); return }
    const res = await apiJson(`${API}/almoxarifado/produtos`, { method: 'POST', body: JSON.stringify({ codigo, nome, unidade, valor }) })
    novo = await res.json()
    if (!res.ok) { alert('Erro ao cadastrar produto: ' + (novo.erro || '')); return }
    orcCatalogoProdutos.push(novo)
  } else {
    const res = await apiJson(`${API}/servicos`, { method: 'POST', body: JSON.stringify({ nome, valor }) })
    novo = await res.json()
    if (!res.ok) { alert('Erro ao cadastrar serviço: ' + (novo.erro || '')); return }
    orcCatalogoServicos.push(novo)
  }

  document.getElementById(`orc-item-catalogo-${i}`).innerHTML = opcoesCatalogoItem(tipo, novo.id)
  document.getElementById(`orc-item-novo-${i}`).style.display = 'none'
  document.getElementById(`orc-item-novo-${i}`).innerHTML = ''
  document.getElementById(`orc-item-valor-${i}`).value = novo.valor ?? ''
  recalcularTotaisOrcamento()
}

// Desconto no total OU por item — nunca os dois: alternar de modo esconde o
// bloco de desconto que não se aplica, e recalcularTotaisOrcamento ignora os
// campos escondidos.
window.alternarModoDescontoOrcamento = function () {
  const modo = document.querySelector('input[name="orc-descontoModo"]:checked').value
  document.getElementById('orc-desconto-conjunto').style.display = modo === 'conjunto' ? 'flex' : 'none'
  document.querySelectorAll('.orc-col-desconto-item').forEach(el => { el.style.display = modo === 'item' ? '' : 'none' })
  recalcularTotaisOrcamento()
}

window.recalcularTotaisOrcamento = function () {
  const modoEl = document.querySelector('input[name="orc-descontoModo"]:checked')
  const modo = modoEl ? modoEl.value : 'conjunto'
  let totalBruto = 0
  let descontoAplicado = 0

  orcItensAtivos.forEach(i => {
    const qtd = parseFloat(document.getElementById(`orc-item-qtd-${i}`)?.value) || 0
    const valor = parseFloat(document.getElementById(`orc-item-valor-${i}`)?.value) || 0
    const bruto = qtd * valor
    totalBruto += bruto

    let descItem = 0
    if (modo === 'item') {
      const descValor = parseFloat(document.getElementById(`orc-item-descValor-${i}`)?.value) || 0
      const descTipo = document.getElementById(`orc-item-descTipo-${i}`)?.value
      descItem = descValor ? Math.min(descTipo === 'fixo' ? descValor : bruto * (descValor / 100), bruto) : 0
      descontoAplicado += descItem
    }

    const subtotalEl = document.getElementById(`orc-item-subtotal-${i}`)
    if (subtotalEl) subtotalEl.textContent = formatarMoedaOrc(bruto - descItem)
  })

  if (modo === 'conjunto') {
    const descTipo = document.getElementById('orc-descontoTipo')?.value
    const descValor = parseFloat(document.getElementById('orc-descontoValor')?.value) || 0
    descontoAplicado = descValor ? Math.min(descTipo === 'fixo' ? descValor : totalBruto * (descValor / 100), totalBruto) : 0
  }

  document.getElementById('orc-total-bruto').textContent = formatarMoedaOrc(totalBruto)
  document.getElementById('orc-total-desconto').textContent = formatarMoedaOrc(descontoAplicado)
  document.getElementById('orc-total-liquido').textContent = formatarMoedaOrc(totalBruto - descontoAplicado)
}

async function abrirFormularioOrcamentoBase(o = null) {
  orcamentoEmEdicaoId = o?.id || null
  clienteSelecionadoOrcId = o?.clienteId || null
  orcItensAtivos = []
  orcItensContador = 0

  const [usuarios, produtos, servicos] = await Promise.all([
    apiFetch(`${API}/auth/simples`).then(r => r.json()),
    apiFetch(`${API}/almoxarifado/produtos?todas=1`).then(r => r.json()),
    apiFetch(`${API}/servicos?todas=1`).then(r => r.json()),
  ])
  usuariosCacheOrc = usuarios
  orcCatalogoProdutos = produtos
  orcCatalogoServicos = servicos

  const modoAtual = o?.descontoModo || 'conjunto'

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('orcamentos').classList.add('active')

  document.getElementById('orcamentos').innerHTML = `
    <div style="margin-top:20px;">
      <button class="btn btn-secondary" onclick="inicializarOrcamentos()">← Voltar</button>
      <h3 style="margin:20px 0;">${o ? `Editar Orçamento ${o.numero}.${o.ano}` : 'Novo Orçamento'}</h3>

      <div style="position:relative; margin-bottom:16px;">
        <label>Cliente * <small style="color:#999;">(busca por nome ou CPF/CNPJ — se não achar, preencha os dados abaixo para cadastrar um novo)</small></label>
        <input type="text" id="orc-cliente-busca" class="form-control"
          placeholder="Digite nome ou CPF/CNPJ..." value="${o?.cliente?.nome || ''}"
          oninput="buscarClienteOrcamento(this.value)" autocomplete="off">
        <div id="sugestoes-cliente-orc" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
      </div>

      <div id="dados-cliente-novo-orc" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div>
          <label>Tipo</label>
          <select id="orc-cliente-tipoPessoa" class="form-control">
            <option value="fisica" ${o?.cliente?.tipoPessoa === 'fisica' ? 'selected' : ''}>Pessoa Física</option>
            <option value="juridica" ${o?.cliente?.tipoPessoa === 'juridica' ? 'selected' : ''}>Pessoa Jurídica</option>
          </select>
        </div>
        <div><label>CPF/CNPJ</label><input type="text" id="orc-cliente-cpfCnpj" class="form-control" placeholder="Somente números" value="${o?.cliente?.cpfCnpj || ''}"></div>
        <div style="grid-column:span 2;"><label>Nome / Razão Social</label><input type="text" id="orc-cliente-nome" class="form-control" value="${o?.cliente?.nome || ''}"></div>
        <div><label>Telefone</label><input type="text" id="orc-telefone" class="form-control" value="${o?.telefone || ''}"></div>
        <div><label>Email</label><input type="text" id="orc-email" class="form-control" value="${o?.email || ''}"></div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
        <div>
          <label>Vendedor Responsável</label>
          <select id="orc-vendedorId" class="form-control">
            <option value="">Selecione...</option>
            ${usuariosCacheOrc.map(u => `<option value="${u.id}" ${o?.vendedorId === u.id ? 'selected' : ''}>${u.nome}</option>`).join('')}
          </select>
        </div>
        <div><label>Data do Orçamento</label><input type="date" id="orc-dataOrcamento" class="form-control" value="${o?.dataOrcamento ? o.dataOrcamento.split('T')[0] : new Date().toISOString().split('T')[0]}"></div>
        <div><label>Validade do Orçamento</label><input type="date" id="orc-validade" class="form-control" value="${o?.validade ? o.validade.split('T')[0] : ''}"></div>
        <div><label>Previsão de Entrega</label><input type="date" id="orc-previsaoEntrega" class="form-control" value="${o?.previsaoEntrega ? o.previsaoEntrega.split('T')[0] : ''}"></div>
        <div>
          <label>Situação do Orçamento</label>
          <select id="orc-status" class="form-control">
            ${Object.keys(STATUS_ORCAMENTO_LABEL).filter(s => s !== 'convertido').map(s => `<option value="${s}" ${(o?.status || 'em_andamento') === s ? 'selected' : ''}>${STATUS_ORCAMENTO_LABEL[s].texto}</option>`).join('')}
          </select>
          <small style="color:#999;">"Convertido" só é definido automaticamente ao criar uma Venda</small>
        </div>
      </div>

      <div style="margin-top:16px;">
        <label>Descrição</label>
        <textarea id="orc-descricao" class="form-control" rows="2">${o?.descricao || ''}</textarea>
      </div>

      <h5 style="margin: 24px 0 10px;">Itens</h5>
      <div style="margin-bottom:10px; display:flex; gap:20px; align-items:center;">
        <label style="display:flex; align-items:center; gap:6px; font-weight:400;">
          <input type="radio" name="orc-descontoModo" value="conjunto" ${modoAtual === 'conjunto' ? 'checked' : ''} onchange="alternarModoDescontoOrcamento()"> Desconto no total
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-weight:400;">
          <input type="radio" name="orc-descontoModo" value="item" ${modoAtual === 'item' ? 'checked' : ''} onchange="alternarModoDescontoOrcamento()"> Desconto por item
        </label>
      </div>

      <table class="table-certificados">
        <thead>
          <tr>
            <th>Tipo</th><th>Produto/Serviço</th><th>Detalhes</th><th>Qtd</th><th>Valor Unit. (R$)</th>
            <th class="orc-col-desconto-item" style="display:${modoAtual === 'item' ? '' : 'none'};">Desconto</th>
            <th>Subtotal</th><th></th>
          </tr>
        </thead>
        <tbody id="orc-itens-tbody"></tbody>
      </table>
      <button type="button" class="btn btn-secondary" style="margin-top:8px;" onclick="adicionarLinhaItemOrcamento()">+ Item</button>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-top:20px;">
        <div id="orc-desconto-conjunto" style="display:${modoAtual === 'conjunto' ? 'flex' : 'none'}; gap:16px; align-items:flex-end; margin-bottom:16px;">
          <div>
            <label>Desconto (sobre o total)</label>
            <div style="display:flex; gap:8px;">
              <select id="orc-descontoTipo" class="form-control" style="max-width:90px;" onchange="recalcularTotaisOrcamento()">
                <option value="percentual" ${o?.descontoTipo !== 'fixo' ? 'selected' : ''}>%</option>
                <option value="fixo" ${o?.descontoTipo === 'fixo' ? 'selected' : ''}>R$</option>
              </select>
              <input type="number" id="orc-descontoValor" class="form-control" step="0.01" min="0" value="${o?.descontoValor || ''}" oninput="recalcularTotaisOrcamento()">
            </div>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:24px; font-size:14px;">
          <div>Total bruto: <strong id="orc-total-bruto">R$ 0,00</strong></div>
          <div>Desconto: <strong id="orc-total-desconto">R$ 0,00</strong></div>
          <div>Total líquido: <strong id="orc-total-liquido" style="color:#198754; font-size:16px;">R$ 0,00</strong></div>
        </div>
      </div>

      <div style="margin-top:16px;">
        <label>Observações complementares</label>
        <textarea id="orc-observacoes" class="form-control" rows="3">${o?.observacoes || ''}</textarea>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarOrcamento()">${o ? 'Salvar Alterações' : 'Salvar Orçamento'}</button>
    </div>
  `

  if (o) {
    o.itens.forEach(item => window.adicionarLinhaItemOrcamento({
      tipo: item.tipo,
      produtoId: item.produtoId,
      servicoId: item.servicoId,
      detalhes: item.detalhes,
      quantidade: item.quantidade,
      valorUnitario: item.valorUnitario,
      descontoTipo: item.descontoTipo,
      descontoValor: item.descontoValor,
    }))
  } else {
    window.adicionarLinhaItemOrcamento()
  }
}

window.abrirFormularioOrcamento = function () {
  abrirFormularioOrcamentoBase(null)
}

window.editarOrcamento = async function (id) {
  const o = await apiFetch(`${API}/orcamentos/${id}`).then(r => r.json())
  abrirFormularioOrcamentoBase(o)
}

window.buscarClienteOrcamento = async function (q) {
  const div = document.getElementById('sugestoes-cliente-orc')
  clienteSelecionadoOrcId = null

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
    <div onclick='selecionarClienteOrcamento(${JSON.stringify(c)})'
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${c.nome}</strong>
    </div>
  `).join('')
}

// Autopreenche telefone/email (e os campos de cadastro, caso precise corrigir
// algo do cliente) assim que um cliente já cadastrado é escolhido.
window.selecionarClienteOrcamento = function (c) {
  clienteSelecionadoOrcId = c.id
  document.getElementById('orc-cliente-busca').value = c.nome
  document.getElementById('orc-cliente-tipoPessoa').value = c.tipoPessoa
  document.getElementById('orc-cliente-cpfCnpj').value = c.cpfCnpj
  document.getElementById('orc-cliente-nome').value = c.nome
  document.getElementById('orc-telefone').value = c.telefone || ''
  document.getElementById('orc-email').value = c.email || ''
  document.getElementById('sugestoes-cliente-orc').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('sugestoes-cliente-orc')
  if (div && !div.contains(e.target) && e.target.id !== 'orc-cliente-busca') {
    div.style.display = 'none'
  }
})

window.salvarOrcamento = async function () {
  let clienteId = clienteSelecionadoOrcId

  if (!clienteId) {
    const cpfCnpj = document.getElementById('orc-cliente-cpfCnpj').value.trim()
    const nome = document.getElementById('orc-cliente-nome').value.trim()

    if (!cpfCnpj || !nome) {
      alert('Selecione um cliente existente ou preencha CPF/CNPJ e nome para cadastrar um novo.')
      return
    }

    const novoCliente = await apiJson(`${API}/clientes`, {
      method: 'POST',
      body: JSON.stringify({
        tipoPessoa: document.getElementById('orc-cliente-tipoPessoa').value,
        cpfCnpj,
        nome,
        telefone: document.getElementById('orc-telefone').value.trim(),
        email: document.getElementById('orc-email').value.trim(),
      })
    }).then(r => r.json())

    if (!novoCliente.id) {
      alert('Erro ao cadastrar cliente: ' + (novoCliente.erro || ''))
      return
    }
    clienteId = novoCliente.id
  }

  if (orcItensAtivos.length === 0) {
    alert('Adicione ao menos um produto/serviço!')
    return
  }

  const itens = []
  for (const i of orcItensAtivos) {
    const tipo = document.getElementById(`orc-item-tipo-${i}`).value
    const catalogoId = document.getElementById(`orc-item-catalogo-${i}`).value
    const valorUnitario = document.getElementById(`orc-item-valor-${i}`).value

    if (!catalogoId || catalogoId === 'novo') {
      alert('Selecione (ou cadastre) o produto/serviço de todos os itens!')
      return
    }
    if (valorUnitario === '') {
      alert('Informe o valor unitário de todos os itens!')
      return
    }

    const lista = tipo === 'produto' ? orcCatalogoProdutos : orcCatalogoServicos
    const catalogo = lista.find(c => String(c.id) === catalogoId)

    itens.push({
      tipo,
      produtoId: tipo === 'produto' ? catalogoId : null,
      servicoId: tipo === 'servico' ? catalogoId : null,
      nome: catalogo?.nome || '',
      detalhes: document.getElementById(`orc-item-detalhes-${i}`).value.trim(),
      quantidade: document.getElementById(`orc-item-qtd-${i}`).value || 1,
      valorUnitario,
      descontoTipo: document.getElementById(`orc-item-descTipo-${i}`)?.value,
      descontoValor: document.getElementById(`orc-item-descValor-${i}`)?.value,
    })
  }

  const descontoModo = document.querySelector('input[name="orc-descontoModo"]:checked').value

  const body = {
    clienteId,
    email: document.getElementById('orc-email').value.trim(),
    telefone: document.getElementById('orc-telefone').value.trim(),
    vendedorId: document.getElementById('orc-vendedorId').value || null,
    dataOrcamento: document.getElementById('orc-dataOrcamento').value,
    validade: document.getElementById('orc-validade').value,
    previsaoEntrega: document.getElementById('orc-previsaoEntrega').value,
    descricao: document.getElementById('orc-descricao').value.trim(),
    observacoes: document.getElementById('orc-observacoes').value.trim(),
    status: document.getElementById('orc-status').value,
    descontoModo,
    descontoTipo: document.getElementById('orc-descontoTipo').value,
    descontoValor: document.getElementById('orc-descontoValor').value,
    itens,
  }

  const url = orcamentoEmEdicaoId ? `${API}/orcamentos/${orcamentoEmEdicaoId}` : `${API}/orcamentos`
  const method = orcamentoEmEdicaoId ? 'PUT' : 'POST'

  const res = await apiJson(url, { method, body: JSON.stringify(body) })

  if (res.ok) {
    alert(`Orçamento ${orcamentoEmEdicaoId ? 'atualizado' : 'criado'} com sucesso!`)
    inicializarOrcamentos()
  } else {
    const err = await res.json()
    alert('Erro ao salvar orçamento: ' + (err.erro || ''))
  }
}

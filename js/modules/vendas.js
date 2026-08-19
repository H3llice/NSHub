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
const podeGerenciarVendas = perfil === 'admin' || perfil === 'gerente'

function formatarDocumento(doc) {
  if (!doc) return '-'
  if (doc.length === 11) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (doc.length === 14) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

// ══════════════════════════════════════════════════════════════════════════
// VENDAS DE BALSA (aba Produtos → Vendas)
// ══════════════════════════════════════════════════════════════════════════

const STATUS_VENDA_LABEL = {
  ativo: { texto: 'Ativo', cor: '#198754' },
  cancelado: { texto: 'Cancelado', cor: '#dc3545' },
}

function badgeStatusVenda(status) {
  const s = STATUS_VENDA_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

export function inicializarVendas() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('vendas').classList.add('active')

  const container = document.getElementById('vendas')
  container.innerHTML = `
    <div class="tab">Vendas de Balsa</div>
    ${podeGerenciarVendas ? `<button class="btn btn-success" onclick="abrirFormularioVenda()">+ Nova Venda</button>` : ''}

    <div style="display:flex; gap:16px; margin: 16px 0; max-width:280px;">
      <div style="flex:1;">
        <label style="font-size:12px;">Status</label>
        <select id="filtro-status-venda" class="form-control" onchange="carregarVendas()">
          <option value="">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
    </div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Nº Venda</th>
          <th>Cliente</th>
          <th>Vendedor</th>
          <th>Balsas</th>
          <th>Data</th>
          <th>Valor</th>
          <th>Status</th>
          ${podeGerenciarVendas ? '<th>Ações</th>' : ''}
        </tr>
      </thead>
      <tbody id="tabela-vendas">
        <tr><td colspan="8" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarVendas()
}

window.carregarVendas = async function () {
  const status = document.getElementById('filtro-status-venda')?.value || ''
  const params = new URLSearchParams()
  if (status) params.append('status', status)

  try {
    const vendas = await apiFetch(`${API}/vendas?${params}`).then(r => r.json())
    renderizarTabelaVendas(vendas)
  } catch {
    document.getElementById('tabela-vendas').innerHTML = `
      <tr><td colspan="8" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

function renderizarTabelaVendas(vendas) {
  const tabela = document.getElementById('tabela-vendas')
  const colspan = podeGerenciarVendas ? 8 : 7

  if (vendas.length === 0) {
    tabela.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999; padding:30px;">Nenhuma venda encontrada</td></tr>`
    return
  }

  tabela.innerHTML = vendas.map(v => {
    const balsasTxt = v.balsas.map(vb => vb.balsa.numeroSerie).join(', ')
    const data = new Date(v.dataVenda).toLocaleDateString('pt-BR')
    const valor = v.valor ? 'R$ ' + v.valor.toFixed(2) : '-'

    const acoes = v.status === 'ativo'
      ? `<button class="btn btn-sm btn-danger" onclick="cancelarVenda(${v.id})">Cancelar</button>`
      : ''

    return `
      <tr>
        <td><a href="#" onclick="verVenda(${v.id}); return false;" style="color:var(--verde); font-weight:600; text-decoration:none;">${v.numero}.${v.ano}</a></td>
        <td>${v.cliente.nome}</td>
        <td>${v.vendedor?.nome || '-'}</td>
        <td>${balsasTxt}</td>
        <td>${data}</td>
        <td>${valor}</td>
        <td>${badgeStatusVenda(v.status)}</td>
        ${podeGerenciarVendas ? `<td style="white-space:nowrap;">${acoes}</td>` : ''}
      </tr>
    `
  }).join('')
}

window.cancelarVenda = async function (id) {
  if (!confirm('Cancelar esta venda? As balsas vinculadas voltarão a ficar disponíveis.')) return
  const res = await apiJson(`${API}/vendas/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelado' }) })
  if (res.ok) carregarVendas()
  else alert('Erro ao cancelar venda')
}

// ===== VISUALIZAÇÃO DA VENDA ==================================================
window.verVenda = async function (id) {
  const v = await apiFetch(`${API}/vendas/${id}`).then(r => r.json())

  const data = new Date(v.dataVenda).toLocaleDateString('pt-BR')
  const valor = v.valor ? 'R$ ' + v.valor.toFixed(2) : '-'
  const frete = v.frete ? 'R$ ' + v.frete.toFixed(2) : '-'
  const desconto = v.descontoValor
    ? (v.descontoTipo === 'fixo' ? 'R$ ' + v.descontoValor.toFixed(2) : v.descontoValor + '%')
    : '-'

  document.getElementById('vendas').innerHTML = `
    <div style="margin-top:20px; max-width:800px;">
      <button class="btn btn-secondary" onclick="inicializarVendas()">← Voltar</button>

      <div style="display:flex; align-items:center; gap:12px; margin:20px 0;">
        <h3 style="margin:0;">Venda ${v.numero}.${v.ano}</h3>
        ${badgeStatusVenda(v.status)}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Cliente</div>
        <div><strong>${v.cliente.nome}</strong></div>
        <div style="color:#666; font-size:13px;">${formatarDocumento(v.cliente.cpfCnpj)}</div>
        ${v.cliente.telefone ? `<div style="color:#666; font-size:13px;">Tel: ${v.cliente.telefone}</div>` : ''}
        ${v.cliente.email ? `<div style="color:#666; font-size:13px;">${v.cliente.email}</div>` : ''}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Balsas Vendidas</div>
        <ul style="list-style:none; padding:0; margin:0;">
          ${v.balsas.map(vb => `
            <li style="padding:6px 0; border-bottom:1px solid #eee; font-size:13px; display:flex; justify-content:space-between;">
              <span><strong>${vb.balsa.numeroSerie}</strong> — ${vb.balsa.fabricante} ${vb.balsa.modelo}, capacidade ${vb.balsa.capacidade}</span>
              <strong>${vb.valor ? 'R$ ' + vb.valor.toFixed(2) : '-'}</strong>
            </li>
          `).join('')}
        </ul>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Condições</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:13px;">
          <div><span style="color:#999;">Data da Venda</span><br><strong>${data}</strong></div>
          <div><span style="color:#999;">Vendedor Responsável</span><br><strong>${v.vendedor?.nome || '-'}</strong></div>
          <div><span style="color:#999;">Frete</span><br><strong>${frete}</strong></div>
          <div><span style="color:#999;">Desconto</span><br><strong>${desconto}</strong></div>
          <div><span style="color:#999;">Valor</span><br><strong>${valor}</strong></div>
          <div><span style="color:#999;">Forma Pagto</span><br><strong>${v.formaPagamento || '-'}</strong></div>
          <div style="grid-column:span 2;"><span style="color:#999;">Condições Pagto</span><br><strong>${v.condicoesPagto || '-'}</strong></div>
        </div>
      </div>

      ${v.observacoes ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:#158815; margin-bottom:8px;">Observações</div>
          <div style="font-size:13px; color:#444;">${v.observacoes}</div>
        </div>
      ` : ''}

      ${podeGerenciarVendas && v.status === 'ativo' ? `
        <div style="display:flex; gap:8px;">
          <button class="btn btn-danger" onclick="cancelarVenda(${v.id})">Cancelar Venda</button>
        </div>
      ` : ''}
    </div>
  `
}

// ===== FORMULÁRIO — NOVA VENDA =================================================
let balsasDisponiveisVendaCache = []
let clienteSelecionadoVendaId = null
let balsaValoresSelecionadosVenda = new Map() // balsaId -> valor individual (string)
let usuariosCacheVenda = []

function renderizarListaBalsasVenda(lista) {
  const container = document.getElementById('lista-balsas-venda')
  if (!container) return

  if (lista.length === 0) {
    container.innerHTML = '<div style="color:#999; padding:8px;">Nenhuma balsa encontrada</div>'
    return
  }

  container.innerHTML = lista.map(b => {
    const marcado = balsaValoresSelecionadosVenda.has(b.id)
    return `
      <div style="display:flex; align-items:center; gap:8px; padding:6px 0;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
          <input type="checkbox" value="${b.id}" class="checkbox-balsa-venda"
            ${marcado ? 'checked' : ''}
            onchange="toggleBalsaSelecionadaVenda(${b.id}, this.checked)">
          <span>${b.numeroSerie} — ${b.fabricante} ${b.modelo}, capacidade ${b.capacidade}</span>
        </label>
        <input type="number" step="0.01" min="0" placeholder="Valor" class="form-control form-control-sm"
          style="width:130px;" value="${balsaValoresSelecionadosVenda.get(b.id) || ''}" ${marcado ? '' : 'disabled'}
          oninput="atualizarValorBalsaVenda(${b.id}, this.value)">
      </div>
    `
  }).join('')
}

window.toggleBalsaSelecionadaVenda = function (id, marcado) {
  if (marcado) balsaValoresSelecionadosVenda.set(id, balsaValoresSelecionadosVenda.get(id) || '')
  else balsaValoresSelecionadosVenda.delete(id)
  filtrarBalsasVenda()
  recalcularValorVenda()
}

window.atualizarValorBalsaVenda = function (id, valor) {
  balsaValoresSelecionadosVenda.set(id, valor)
  recalcularValorVenda()
}

// Soma os valores das balsas selecionadas + frete - desconto. O campo "Valor" continua
// editável manualmente — ele só é sobrescrito quando algum desses componentes muda.
window.recalcularValorVenda = function () {
  const campoValor = document.getElementById('venda-valor')
  if (!campoValor) return

  const somaBalsas = Array.from(balsaValoresSelecionadosVenda.values())
    .reduce((acc, v) => acc + (parseFloat(v) || 0), 0)
  const frete = parseFloat(document.getElementById('venda-frete')?.value) || 0
  const descTipo = document.getElementById('venda-descontoTipo')?.value
  const descValor = parseFloat(document.getElementById('venda-descontoValor')?.value) || 0

  // Desconto incide só sobre as balsas — o frete entra por fora, sem desconto
  const descontoBruto = descTipo === 'fixo' ? descValor : somaBalsas * (descValor / 100)
  const descontoAplicado = Math.min(descontoBruto, somaBalsas)

  campoValor.value = (somaBalsas - descontoAplicado + frete).toFixed(2)
}

window.filtrarBalsasVenda = function () {
  const serie = (document.getElementById('filtro-balsa-venda-serie')?.value || '').trim().toLowerCase()
  const fabricante = (document.getElementById('filtro-balsa-venda-fabricante')?.value || '').trim().toLowerCase()
  const capacidadeStr = document.getElementById('filtro-balsa-venda-capacidade')?.value
  const capacidade = capacidadeStr ? Number(capacidadeStr) : null

  let filtradas = [...balsasDisponiveisVendaCache]
  if (serie) filtradas = filtradas.filter(b => b.numeroSerie.toLowerCase().includes(serie))
  if (fabricante) filtradas = filtradas.filter(b => b.fabricante.toLowerCase().includes(fabricante))
  if (capacidade !== null) filtradas = filtradas.filter(b => b.capacidade === capacidade)

  renderizarListaBalsasVenda(filtradas)
}

window.abrirFormularioVenda = async function () {
  clienteSelecionadoVendaId = null
  balsaValoresSelecionadosVenda = new Map()

  const [balsas, usuarios] = await Promise.all([
    apiFetch(`${API}/estoque?finalidade=venda`).then(r => r.json()),
    apiFetch(`${API}/auth/simples`).then(r => r.json())
  ])
  balsasDisponiveisVendaCache = balsas
  usuariosCacheVenda = usuarios

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('vendas').classList.add('active')

  document.getElementById('vendas').innerHTML = `
    <div style="margin-top:20px;">
      <button class="btn btn-secondary" onclick="inicializarVendas()">← Voltar</button>
      <h3 style="margin:20px 0;">Nova Venda de Balsa</h3>

      <div style="position:relative; margin-bottom:16px;">
        <label>Cliente * <small style="color:#999;">(busca por nome ou CPF/CNPJ — se não achar, preencha os dados abaixo para cadastrar um novo)</small></label>
        <input type="text" id="venda-cliente-busca" class="form-control"
          placeholder="Digite nome ou CPF/CNPJ..."
          oninput="buscarClienteVenda(this.value)" autocomplete="off">
        <div id="sugestoes-cliente-venda" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
      </div>

      <div id="dados-cliente-novo-venda" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div>
          <label>Tipo</label>
          <select id="venda-cliente-tipoPessoa" class="form-control">
            <option value="fisica">Pessoa Física</option>
            <option value="juridica">Pessoa Jurídica</option>
          </select>
        </div>
        <div><label>CPF/CNPJ</label><input type="text" id="venda-cliente-cpfCnpj" class="form-control" placeholder="Somente números"></div>
        <div style="grid-column:span 2;"><label>Nome / Razão Social</label><input type="text" id="venda-cliente-nome" class="form-control"></div>
        <div><label>Telefone</label><input type="text" id="venda-cliente-telefone" class="form-control"></div>
        <div><label>Email</label><input type="text" id="venda-cliente-email" class="form-control"></div>
      </div>

      <h5 style="margin: 20px 0 10px;">Balsas Disponíveis <small style="color:#999; font-weight:400;">(marque as balsas e informe o valor individual de cada uma)</small></h5>

      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-size:12px;">Nº Série</label>
          <input type="text" id="filtro-balsa-venda-serie" class="form-control form-control-sm" oninput="filtrarBalsasVenda()">
        </div>
        <div>
          <label style="font-size:12px;">Fabricante</label>
          <input type="text" id="filtro-balsa-venda-fabricante" class="form-control form-control-sm" oninput="filtrarBalsasVenda()">
        </div>
        <div>
          <label style="font-size:12px;">Capacidade</label>
          <input type="number" id="filtro-balsa-venda-capacidade" class="form-control form-control-sm" oninput="filtrarBalsasVenda()">
        </div>
      </div>

      <div id="lista-balsas-venda" style="max-height:200px; overflow-y:auto; border:1px solid #ddd; border-radius:4px; padding:8px; margin-bottom:16px;">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Data da Venda *</label><input type="date" id="venda-dataVenda" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
        <div>
          <label>Vendedor Responsável *</label>
          <select id="venda-vendedorId" class="form-control">
            <option value="">Selecione...</option>
            ${usuariosCacheVenda.map(u => `<option value="${u.id}">${u.nome}</option>`).join('')}
          </select>
        </div>
        <div><label>Frete</label><input type="number" id="venda-frete" class="form-control" step="0.01" min="0" oninput="recalcularValorVenda()"></div>
        <div>
          <label>Desconto</label>
          <div style="display:flex; gap:8px;">
            <select id="venda-descontoTipo" class="form-control" style="max-width:90px;" onchange="recalcularValorVenda()">
              <option value="percentual">%</option>
              <option value="fixo">R$</option>
            </select>
            <input type="number" id="venda-descontoValor" class="form-control" step="0.01" min="0" oninput="recalcularValorVenda()">
          </div>
        </div>
        <div><label>Valor <small style="color:#999;">(soma das balsas + frete - desconto — pode ser ajustado manualmente)</small></label><input type="number" id="venda-valor" class="form-control" step="0.01"></div>
        <div><label>Periodicidade</label>
          <select id="venda-periodicidade" class="form-control">
            <option value="unico">Pagamento único</option>
            <option value="mensal">Mensal</option>
          </select>
        </div>
        <div><label>Data de Vencimento <small style="color:#999;">(obrigatório se houver valor)</small></label><input type="date" id="venda-dataVencimento" class="form-control"></div>
        <div><label>Forma de Pagamento</label><input type="text" id="venda-formaPagamento" class="form-control"></div>
        <div style="grid-column:span 2;"><label>Condições de Pagamento</label><input type="text" id="venda-condicoesPagto" class="form-control"></div>
      </div>

      <div style="margin-top:16px;">
        <label>Observações</label>
        <textarea id="venda-observacoes" class="form-control" rows="3"></textarea>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarVenda()">Salvar Venda</button>
    </div>
  `

  renderizarListaBalsasVenda(balsasDisponiveisVendaCache)
}

window.buscarClienteVenda = async function (q) {
  const div = document.getElementById('sugestoes-cliente-venda')
  clienteSelecionadoVendaId = null

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
    <div onclick='selecionarClienteVenda(${JSON.stringify(c)})'
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${c.nome}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${formatarDocumento(c.cpfCnpj)}</span>
    </div>
  `).join('')
}

window.selecionarClienteVenda = function (c) {
  clienteSelecionadoVendaId = c.id
  document.getElementById('venda-cliente-busca').value = c.nome
  document.getElementById('venda-cliente-tipoPessoa').value = c.tipoPessoa
  document.getElementById('venda-cliente-cpfCnpj').value = c.cpfCnpj
  document.getElementById('venda-cliente-nome').value = c.nome
  document.getElementById('venda-cliente-telefone').value = c.telefone || ''
  document.getElementById('venda-cliente-email').value = c.email || ''
  document.getElementById('sugestoes-cliente-venda').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('sugestoes-cliente-venda')
  if (div && !div.contains(e.target) && e.target.id !== 'venda-cliente-busca') {
    div.style.display = 'none'
  }
})

window.salvarVenda = async function () {
  const balsas = Array.from(balsaValoresSelecionadosVenda, ([balsaId, valor]) => ({ balsaId, valor: valor || null }))

  if (balsas.length === 0) {
    alert('Selecione ao menos uma balsa!')
    return
  }

  const dataVenda = document.getElementById('venda-dataVenda').value
  if (!dataVenda) {
    alert('Data da venda é obrigatória!')
    return
  }

  const vendedorId = document.getElementById('venda-vendedorId').value
  if (!vendedorId) {
    alert('Selecione o vendedor responsável!')
    return
  }

  let clienteId = clienteSelecionadoVendaId

  if (!clienteId) {
    const cpfCnpj = document.getElementById('venda-cliente-cpfCnpj').value.trim()
    const nome = document.getElementById('venda-cliente-nome').value.trim()

    if (!cpfCnpj || !nome) {
      alert('Selecione um cliente existente ou preencha CPF/CNPJ e nome para cadastrar um novo.')
      return
    }

    const novoCliente = await apiJson(`${API}/clientes`, {
      method: 'POST',
      body: JSON.stringify({
        tipoPessoa: document.getElementById('venda-cliente-tipoPessoa').value,
        cpfCnpj,
        nome,
        telefone: document.getElementById('venda-cliente-telefone').value.trim(),
        email: document.getElementById('venda-cliente-email').value.trim(),
      })
    }).then(r => r.json())

    if (!novoCliente.id) {
      alert('Erro ao cadastrar cliente: ' + (novoCliente.erro || ''))
      return
    }
    clienteId = novoCliente.id
  }

  const valorPreenchido = document.getElementById('venda-valor').value
  const dataVencimentoPreenchida = document.getElementById('venda-dataVencimento').value

  if (valorPreenchido && !dataVencimentoPreenchida) {
    alert('Data de vencimento é obrigatória quando há valor definido!')
    return
  }

  const body = {
    clienteId,
    vendedorId,
    balsas,
    dataVenda,
    valor: valorPreenchido || null,
    frete: document.getElementById('venda-frete').value || null,
    descontoTipo: document.getElementById('venda-descontoTipo').value,
    descontoValor: document.getElementById('venda-descontoValor').value || null,
    periodicidadePagamento: document.getElementById('venda-periodicidade').value,
    dataVencimento: dataVencimentoPreenchida || null,
    formaPagamento: document.getElementById('venda-formaPagamento').value,
    condicoesPagto: document.getElementById('venda-condicoesPagto').value,
    observacoes: document.getElementById('venda-observacoes').value,
  }

  const res = await apiJson(`${API}/vendas`, { method: 'POST', body: JSON.stringify(body) })

  if (res.ok) {
    alert('Venda registrada com sucesso!')
    inicializarVendas()
  } else {
    const err = await res.json()
    alert('Erro ao registrar venda: ' + (err.erro || ''))
  }
}

// Expostas em window para funcionar em onclick inline (ex: botões "Voltar")
window.inicializarVendas = inicializarVendas

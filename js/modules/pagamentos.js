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
const podeMarcarPago = perfil === 'admin' || perfil === 'financeiro'

const STATUS_PAGAMENTO_LABEL = {
  pendente: { texto: 'Pendente', cor: '#fd7e14' },
  atrasado: { texto: 'Atrasado', cor: '#dc3545' },
  pago: { texto: 'Pago', cor: '#198754' },
}

function badgeStatusPagamento(status) {
  const s = STATUS_PAGAMENTO_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

function formatarMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ══════════════════════════════════════════════════════════════════════════
// TELA — CONTAS A RECEBER (Financeiro → Contas a Receber)
// ══════════════════════════════════════════════════════════════════════════

export function inicializarContasReceber() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('contasReceber').classList.add('active')

  const container = document.getElementById('contasReceber')
  container.innerHTML = `
    <div class="tab">Contas a Receber</div>
    ${podeMarcarPago ? `<button class="btn btn-success" onclick="abrirFormularioContaAvulsa()">+ Nova Conta</button>` : ''}

    <div id="resumo-contas-receber" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin: 16px 0;">
      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <div style="color:#999; font-size:12px;">Total a Receber</div>
        <div id="resumo-total-receber" style="font-size:22px; font-weight:700; color:#158815;">-</div>
      </div>
      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <div style="color:#999; font-size:12px;">Total Atrasado</div>
        <div id="resumo-total-atrasado" style="font-size:22px; font-weight:700; color:#dc3545;">-</div>
      </div>
      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <div style="color:#999; font-size:12px;">Recebido (últimos 30 dias)</div>
        <div id="resumo-total-recebido" style="font-size:22px; font-weight:700; color:#0d6efd;">-</div>
      </div>
    </div>

    <!-- Filtros -->
    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; align-items:end;">
      <div>
        <label style="font-size:12px;">Buscar (cliente, contrato, referência)</label>
        <input type="text" id="filtro-busca-pagamento" class="form-control form-control-sm" oninput="filtrarPagamentos()">
      </div>
      <div>
        <label style="font-size:12px;">Status</label>
        <select id="filtro-status-pagamento" class="form-control form-control-sm" onchange="filtrarPagamentos()">
          <option value="">Todos</option>
          <option value="pendente">Pendente</option>
          <option value="atrasado">Atrasado</option>
          <option value="pago">Pago</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;">Vencimento de</label>
        <input type="date" id="filtro-vencimento-de" class="form-control form-control-sm" onchange="filtrarPagamentos()">
      </div>
      <div>
        <label style="font-size:12px;">Vencimento até</label>
        <input type="date" id="filtro-vencimento-ate" class="form-control form-control-sm" onchange="filtrarPagamentos()">
      </div>
    </div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Contrato</th>
          <th>Cliente</th>
          <th>Referência / Descrição</th>
          <th>Vencimento</th>
          <th>Valor</th>
          <th>Status</th>
          ${podeMarcarPago ? '<th>Ações</th>' : ''}
        </tr>
      </thead>
      <tbody id="tabela-pagamentos">
        <tr><td colspan="7" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarResumoContasReceber()
  carregarPagamentos()
}

async function carregarResumoContasReceber() {
  try {
    const d = await apiFetch(`${API}/pagamentos/dashboard`).then(r => r.json())
    document.getElementById('resumo-total-receber').textContent = formatarMoeda(d.totalAReceber)
    document.getElementById('resumo-total-atrasado').textContent = formatarMoeda(d.totalAtrasado)
    document.getElementById('resumo-total-recebido').textContent = formatarMoeda(d.totalRecebido30dias)
  } catch {
    // Silencioso — o resumo é secundário, a tabela principal já mostra erro se falhar
  }
}

let pagamentosCache = []

window.carregarPagamentos = async function () {
  try {
    pagamentosCache = await apiFetch(`${API}/pagamentos`).then(r => r.json())
    filtrarPagamentos()
  } catch {
    document.getElementById('tabela-pagamentos').innerHTML = `
      <tr><td colspan="7" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

window.filtrarPagamentos = function () {
  const busca = (document.getElementById('filtro-busca-pagamento')?.value || '').trim().toLowerCase()
  const status = document.getElementById('filtro-status-pagamento')?.value || ''
  const vencDe = document.getElementById('filtro-vencimento-de')?.value || ''
  const vencAte = document.getElementById('filtro-vencimento-ate')?.value || ''

  let filtrados = [...pagamentosCache]

  if (status) filtrados = filtrados.filter(p => p.status === status)

  if (busca) {
    filtrados = filtrados.filter(p => {
      const cliente = (p.contrato?.cliente?.nome || p.clienteNome || '').toLowerCase()
      const contratoNum = p.contrato ? `${p.contrato.numero}.${p.contrato.ano}`.toLowerCase() : ''
      const ref = (p.referencia || p.descricao || '').toLowerCase()
      return cliente.includes(busca) || contratoNum.includes(busca) || ref.includes(busca)
    })
  }

  if (vencDe) filtrados = filtrados.filter(p => p.dataVencimento.split('T')[0] >= vencDe)
  if (vencAte) filtrados = filtrados.filter(p => p.dataVencimento.split('T')[0] <= vencAte)

  renderizarTabelaPagamentos(filtrados)
}

function renderizarTabelaPagamentos(pagamentos) {
  const tabela = document.getElementById('tabela-pagamentos')
  const colspan = podeMarcarPago ? 7 : 6

  if (pagamentos.length === 0) {
    tabela.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999; padding:30px;">Nenhum pagamento encontrado</td></tr>`
    return
  }

  tabela.innerHTML = pagamentos.map(p => {
    const c = p.contrato
    const venc = new Date(p.dataVencimento).toLocaleDateString('pt-BR')
    const cliente = c?.cliente?.nome || p.clienteNome || '-'
    const contratoTxt = c ? `${c.numero}.${c.ano}` : '<span style="color:#999;">Avulsa</span>'
    const refTxt = p.referencia || p.descricao || '-'

    const acoes = p.status === 'pago'
      ? `<button class="btn btn-sm btn-secondary" onclick="reverterPagamento(${p.id})">Reverter</button>`
      : `<button class="btn btn-sm btn-success" onclick="marcarPagamentoPago(${p.id})">Marcar Pago</button>`

    return `
      <tr>
        <td>${contratoTxt}</td>
        <td>${cliente}</td>
        <td>${refTxt}</td>
        <td>${venc}</td>
        <td>${formatarMoeda(p.valor)}</td>
        <td>${badgeStatusPagamento(p.status)}</td>
        ${podeMarcarPago ? `<td>${acoes}</td>` : ''}
      </tr>
    `
  }).join('')
}

// ===== FORMULÁRIO — NOVA CONTA AVULSA (sem contrato) ==========================
window.abrirFormularioContaAvulsa = function () {
  document.getElementById('contasReceber').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="inicializarContasReceber()">← Voltar</button>
      <h3 style="margin:20px 0;">Nova Conta a Receber (avulsa)</h3>
      <p style="font-size:13px; color:#999;">Use isso para cobranças que não vêm de um contrato de locação ou venda.</p>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div style="grid-column:span 2;"><label>Cliente</label><input type="text" id="conta-clienteNome" class="form-control" placeholder="Nome do cliente (opcional)"></div>
        <div style="grid-column:span 2;"><label>Descrição *</label><input type="text" id="conta-descricao" class="form-control" placeholder="Ex: Serviço avulso, reembolso, etc."></div>
        <div><label>Valor *</label><input type="number" id="conta-valor" class="form-control" step="0.01"></div>
        <div><label>Data de Vencimento *</label><input type="date" id="conta-dataVencimento" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarContaAvulsa()">Salvar Conta</button>
    </div>
  `
}

window.salvarContaAvulsa = async function () {
  const body = {
    clienteNome: document.getElementById('conta-clienteNome').value.trim(),
    descricao: document.getElementById('conta-descricao').value.trim(),
    valor: document.getElementById('conta-valor').value,
    dataVencimento: document.getElementById('conta-dataVencimento').value,
  }

  if (!body.descricao || !body.valor || !body.dataVencimento) {
    alert('Descrição, valor e data de vencimento são obrigatórios!')
    return
  }

  const res = await apiJson(`${API}/pagamentos`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Conta cadastrada com sucesso!')
    inicializarContasReceber()
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao cadastrar'))
  }
}

window.marcarPagamentoPago = async function (id) {
  if (!confirm('Confirmar que este pagamento foi recebido?')) return
  const res = await apiJson(`${API}/pagamentos/${id}/marcar-pago`, { method: 'POST', body: JSON.stringify({}) })
  if (res.ok) {
    carregarResumoContasReceber()
    carregarPagamentos()
  } else {
    alert('Erro ao marcar pagamento como pago')
  }
}

window.reverterPagamento = async function (id) {
  if (!confirm('Reverter este pagamento para pendente?')) return
  const res = await apiJson(`${API}/pagamentos/${id}/reverter`, { method: 'POST', body: JSON.stringify({}) })
  if (res.ok) {
    carregarResumoContasReceber()
    carregarPagamentos()
  } else {
    alert('Erro ao reverter pagamento')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD — Tela Início
// ══════════════════════════════════════════════════════════════════════════

export async function renderizarDashboardInicio() {
  const container = document.getElementById('inicio')
  if (!container) return

  // Preserva conteúdo já existente na página de início, só adiciona o painel financeiro
  let painel = document.getElementById('painel-financeiro-inicio')
  if (!painel) {
    painel = document.createElement('div')
    painel.id = 'painel-financeiro-inicio'
    painel.style = 'margin-top:20px;'
    container.appendChild(painel)
  }

  painel.innerHTML = `<div style="color:#999; padding:12px;">Carregando resumo financeiro...</div>`

  try {
    const d = await apiFetch(`${API}/pagamentos/dashboard`).then(r => r.json())

    painel.innerHTML = `
      <h5 style="margin-bottom:12px;">Resumo Financeiro</h5>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:20px;">
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="color:#999; font-size:12px;">Total a Receber</div>
          <div style="font-size:20px; font-weight:700; color:#158815;">${formatarMoeda(d.totalAReceber)}</div>
        </div>
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="color:#999; font-size:12px;">Pagamentos Atrasados</div>
          <div style="font-size:20px; font-weight:700; color:#dc3545;">${d.qtdAtrasados} (${formatarMoeda(d.totalAtrasado)})</div>
        </div>
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="color:#999; font-size:12px;">Recebido (30 dias)</div>
          <div style="font-size:20px; font-weight:700; color:#0d6efd;">${formatarMoeda(d.totalRecebido30dias)}</div>
        </div>
      </div>

      ${d.proximosVencimentos?.length > 0 ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="font-weight:700; color:#158815; margin-bottom:10px;">Próximos Vencimentos</div>
          <ul style="list-style:none; padding:0; margin:0;">
            ${d.proximosVencimentos.map(p => `
              <li style="padding:6px 0; border-bottom:1px solid #eee; font-size:13px; display:flex; justify-content:space-between;">
                <span>${p.contrato?.cliente?.nome || '-'} — Contrato ${p.contrato?.numero}.${p.contrato?.ano}</span>
                <span>${new Date(p.dataVencimento).toLocaleDateString('pt-BR')} · ${formatarMoeda(p.valor)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    `
  } catch {
    painel.innerHTML = ''
  }
}

// Expostas em window para funcionar em onclick inline (ex: botão "Voltar")
window.inicializarContasReceber = inicializarContasReceber
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
const podeGerenciarVendasOrc = perfil === 'admin' || perfil === 'gerente'

function formatarMoedaVO(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarDataVO(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR') : '-'
}

// ══════════════════════════════════════════════════════════════════════════
// VENDAS (aba Produtos → Vendas) — gerada ao aprovar um Orçamento
// ══════════════════════════════════════════════════════════════════════════

const STATUS_VENDA_ORC_LABEL = {
  ativo: { texto: 'Ativo', cor: 'white', fundo: '#198754' },
  cancelado: { texto: 'Cancelado', cor: 'white', fundo: '#dc3545' },
}

function badgeStatusVendaOrc(status) {
  const s = STATUS_VENDA_ORC_LABEL[status] || { texto: status, cor: 'white', fundo: '#6c757d' }
  return `<span style="background:${s.fundo}; color:${s.cor}; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

const STATUS_PARCELA_LABEL = {
  pendente: { texto: 'Pendente', cor: '#997404', fundo: '#fff3cd' },
  pago: { texto: 'Pago', cor: 'white', fundo: '#198754' },
  atrasado: { texto: 'Atrasado', cor: 'white', fundo: '#dc3545' },
}

function badgeStatusParcela(status) {
  const s = STATUS_PARCELA_LABEL[status] || { texto: status, cor: 'white', fundo: '#6c757d' }
  return `<span style="background:${s.fundo}; color:${s.cor}; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

function labelFormaPagamento(v) {
  return v.formaPagamento === 'parcelado' ? `Parcelado (${v.numeroParcelas}x)` : 'À vista'
}

export function inicializarVendasOrcamento() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('vendasOrcamento').classList.add('active')

  const container = document.getElementById('vendasOrcamento')
  container.innerHTML = `
    <div class="tab">Vendas</div>
    <p style="color:#999; font-size:13px; margin: 4px 0 16px;">
      Vendas nascem de um Orçamento aprovado — vá em Orçamentos e use "Criar Venda".
    </p>

    <div style="display:flex; gap:16px; margin-bottom: 16px; max-width:280px;">
      <div style="flex:1;">
        <label style="font-size:12px;">Status</label>
        <select id="filtro-status-venda-orc" class="form-control" onchange="carregarVendasOrcamento(1)">
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
          <th>Data</th>
          <th>Pagamento</th>
          <th>Valor Total</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-vendas-orc">
        <tr><td colspan="8" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
    <div id="contador-vendas-orc" style="margin-top:12px;"></div>
  `

  carregarVendasOrcamento()
}
window.inicializarVendasOrcamento = inicializarVendasOrcamento

let paginaAtualVendasOrc = 1

window.carregarVendasOrcamento = async function (pagina = 1) {
  paginaAtualVendasOrc = pagina
  const status = document.getElementById('filtro-status-venda-orc')?.value || ''
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  params.append('pagina', pagina)

  try {
    const dados = await apiFetch(`${API}/vendas-orcamento?${params}`).then(r => r.json())
    renderizarTabelaVendasOrcamento(dados.vendas || [])

    const contador = document.getElementById('contador-vendas-orc')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${dados.total || 0} vendas encontradas</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarVendasOrcamento(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarVendasOrcamento(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }
  } catch {
    document.getElementById('tabela-vendas-orc').innerHTML = `
      <tr><td colspan="8" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

function renderizarTabelaVendasOrcamento(vendas) {
  const tabela = document.getElementById('tabela-vendas-orc')

  if (vendas.length === 0) {
    tabela.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#999; padding:30px;">Nenhuma venda encontrada</td></tr>`
    return
  }

  tabela.innerHTML = vendas.map(v => `
    <tr>
      <td><a href="#" onclick="verVendaOrcamento(${v.id}); return false;" style="color:var(--acento); font-weight:600; text-decoration:none;">${v.numero}.${v.ano}</a></td>
      <td>${v.cliente.nome}</td>
      <td>${v.vendedor?.nome || '-'}</td>
      <td>${formatarDataVO(v.dataVenda)}</td>
      <td>${labelFormaPagamento(v)}</td>
      <td>${formatarMoedaVO(v.valorTotal)}</td>
      <td>${badgeStatusVendaOrc(v.status)}</td>
      <td><button class="btn btn-sm btn-info" onclick="verVendaOrcamento(${v.id})">Ver</button></td>
    </tr>
  `).join('')
}

// ===== VISUALIZAÇÃO DA VENDA =====================================================
window.verVendaOrcamento = async function (id) {
  const v = await apiFetch(`${API}/vendas-orcamento/${id}`).then(r => r.json())

  document.getElementById('vendasOrcamento').innerHTML = `
    <div style="margin-top:20px; max-width:900px;">
      <button class="btn btn-secondary" onclick="inicializarVendasOrcamento()">← Voltar</button>

      <div style="display:flex; align-items:center; gap:12px; margin:20px 0;">
        <h3 style="margin:0;">Venda ${v.numero}.${v.ano}</h3>
        ${badgeStatusVendaOrc(v.status)}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; font-size:13px;">
          <div><span style="color:#999;">Cliente</span><br><strong>${v.cliente.nome}</strong></div>
          <div><span style="color:#999;">Vendedor responsável</span><br><strong>${v.vendedor?.nome || '-'}</strong></div>
          <div><span style="color:#999;">Data da venda</span><br><strong>${formatarDataVO(v.dataVenda)}</strong></div>
          <div><span style="color:#999;">Forma de pagamento</span><br><strong>${labelFormaPagamento(v)}</strong></div>
          <div><span style="color:#999;">Valor total</span><br><strong>${formatarMoedaVO(v.valorTotal)}</strong></div>
          <div><span style="color:#999;">Orçamento de origem</span><br>
            <a href="#" onclick="verOrcamentoDeVenda(${v.orcamento.id}); return false;">Orçamento ${v.orcamento.numero}.${v.orcamento.ano}</a>
          </div>
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Contas a receber</div>
        <table class="table-certificados" style="margin:0;">
          <thead><tr><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>
            ${v.pagamentos.map(p => `
              <tr>
                <td>${p.referencia || 'Pagamento único'}</td>
                <td>${formatarDataVO(p.dataVencimento)}</td>
                <td>${formatarMoedaVO(p.valor)}</td>
                <td>${badgeStatusParcela(p.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="font-size:12px; color:#999; margin:10px 0 0;">Para marcar como pago, gerencie em Financeiro → Contas a Receber.</p>
      </div>

      ${v.observacoes ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:var(--acento); margin-bottom:8px;">Observações</div>
          <div style="font-size:13px; color:#444; white-space:pre-line;">${v.observacoes}</div>
        </div>
      ` : ''}

      ${podeGerenciarVendasOrc && v.status === 'ativo' ? `
        <button class="btn btn-danger" onclick="cancelarVendaOrcamento(${v.id})">Cancelar Venda</button>
      ` : ''}
    </div>
  `
}

// js/modules/orcamentos.js expõe verOrcamento em window (carregado por
// app.js antes de qualquer clique acontecer) — sem precisar de import
// cruzado entre os dois módulos de frontend.
window.verOrcamentoDeVenda = function (orcamentoId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('orcamentos').classList.add('active')
  window.verOrcamento(orcamentoId)
}

window.cancelarVendaOrcamento = async function (id) {
  if (!confirm('Cancelar esta venda? As contas a receber já geradas continuam existindo — gerencie-as separadamente se precisar.')) return
  const res = await apiJson(`${API}/vendas-orcamento/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelado' }) })
  if (res.ok) verVendaOrcamento(id)
  else alert('Erro ao cancelar venda')
}

// ===== CRIAR VENDA (a partir de um Orçamento aprovado) ==========================
let voOrcamentoAtual = null

// Chamada pelo botão "Criar Venda" na tela de detalhe do Orçamento (aprovado).
export async function abrirCriarVendaOrcamento(orcamentoId) {
  const o = await apiFetch(`${API}/orcamentos/${orcamentoId}`).then(r => r.json())
  voOrcamentoAtual = o

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('vendasOrcamento').classList.add('active')

  document.getElementById('vendasOrcamento').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="verOrcamentoDeVenda(${o.id})">← Voltar ao Orçamento</button>
      <h3 style="margin:20px 0;">Criar Venda — Orçamento ${o.numero}.${o.ano}</h3>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px; font-size:13px;">
        <div><span style="color:#999;">Cliente</span><br><strong>${o.cliente.nome}</strong></div>
        <div style="margin-top:8px;"><span style="color:#999;">Valor total do orçamento</span><br><strong style="font-size:16px; color:#198754;">${formatarMoedaVO(o.totalLiquido)}</strong></div>
      </div>

      <div><label>Data da Venda</label><input type="date" id="vo-dataVenda" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>

      <div style="margin-top:16px; display:flex; gap:20px;">
        <label style="display:flex; align-items:center; gap:6px; font-weight:400;">
          <input type="radio" name="vo-formaPagamento" value="avista" checked onchange="alternarFormaPagamentoVenda()"> À vista
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-weight:400;">
          <input type="radio" name="vo-formaPagamento" value="parcelado" onchange="alternarFormaPagamentoVenda()"> Parcelado
        </label>
      </div>

      <div id="vo-campo-parcelas" style="display:none; margin-top:16px;">
        <label>Número de Parcelas</label>
        <input type="number" id="vo-numeroParcelas" class="form-control" min="2" value="2" oninput="atualizarPreviaParcelasVenda()">
      </div>

      <div style="margin-top:16px;">
        <label id="vo-label-vencimento">Data de Vencimento</label>
        <input type="date" id="vo-dataVencimento" class="form-control" value="${new Date().toISOString().split('T')[0]}" oninput="atualizarPreviaParcelasVenda()">
      </div>

      <div id="vo-previa-parcelas" style="margin-top:12px; font-size:13px; color:#666;"></div>

      <div style="margin-top:16px;">
        <label>Observações</label>
        <textarea id="vo-observacoes" class="form-control" rows="3"></textarea>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarVendaOrcamento()">Criar Venda</button>
    </div>
  `

  window.alternarFormaPagamentoVenda()
}

window.abrirCriarVendaOrcamento = abrirCriarVendaOrcamento

window.alternarFormaPagamentoVenda = function () {
  const forma = document.querySelector('input[name="vo-formaPagamento"]:checked').value
  document.getElementById('vo-campo-parcelas').style.display = forma === 'parcelado' ? 'block' : 'none'
  document.getElementById('vo-label-vencimento').textContent = forma === 'parcelado' ? 'Data de Vencimento da 1ª Parcela' : 'Data de Vencimento'
  window.atualizarPreviaParcelasVenda()
}

// Mesma conta de gerarParcelas em backend/routes/vendas-orcamento.js — só pra
// exibição antes de salvar, nunca persistida (o backend recalcula de verdade).
window.atualizarPreviaParcelasVenda = function () {
  const div = document.getElementById('vo-previa-parcelas')
  const forma = document.querySelector('input[name="vo-formaPagamento"]:checked').value
  const dataVencimento = document.getElementById('vo-dataVencimento').value
  const valorTotal = voOrcamentoAtual?.totalLiquido || 0

  if (!dataVencimento) { div.innerHTML = ''; return }

  const numeroParcelas = forma === 'parcelado' ? Math.max(2, parseInt(document.getElementById('vo-numeroParcelas').value) || 2) : 1
  const valorBase = Math.floor((valorTotal / numeroParcelas) * 100) / 100
  let somaParcial = 0
  const linhas = []

  for (let i = 0; i < numeroParcelas; i++) {
    const ultima = i === numeroParcelas - 1
    const valor = ultima ? Math.round((valorTotal - somaParcial) * 100) / 100 : valorBase
    somaParcial += valor

    const vencimento = new Date(dataVencimento + 'T00:00:00')
    vencimento.setMonth(vencimento.getMonth() + i)

    linhas.push(`${numeroParcelas > 1 ? `Parcela ${i + 1}/${numeroParcelas}` : 'Pagamento único'} — ${formatarMoedaVO(valor)} — vence em ${vencimento.toLocaleDateString('pt-BR')}`)
  }

  div.innerHTML = linhas.join('<br>')
}

window.salvarVendaOrcamento = async function () {
  const forma = document.querySelector('input[name="vo-formaPagamento"]:checked').value
  const numeroParcelas = document.getElementById('vo-numeroParcelas').value
  const dataVencimento = document.getElementById('vo-dataVencimento').value

  if (!dataVencimento) {
    alert('Informe a data de vencimento!')
    return
  }
  if (forma === 'parcelado' && (!numeroParcelas || parseInt(numeroParcelas) < 2)) {
    alert('Informe ao menos 2 parcelas!')
    return
  }

  const body = {
    orcamentoId: voOrcamentoAtual.id,
    dataVenda: document.getElementById('vo-dataVenda').value,
    formaPagamento: forma,
    numeroParcelas: forma === 'parcelado' ? numeroParcelas : 1,
    dataVencimento,
    observacoes: document.getElementById('vo-observacoes').value.trim(),
  }

  const res = await apiJson(`${API}/vendas-orcamento`, { method: 'POST', body: JSON.stringify(body) })

  if (res.ok) {
    const venda = await res.json()
    alert('Venda criada com sucesso!')
    verVendaOrcamento(venda.id)
  } else {
    const err = await res.json()
    alert('Erro ao criar venda: ' + (err.erro || ''))
  }
}

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
// VENDAS (aba Produtos → Vendas) — gerada ao aprovar um Orçamento, ou avulsa
// ══════════════════════════════════════════════════════════════════════════

const STATUS_VENDA_ORC_LABEL = {
  ativo: { texto: 'Ativo', cor: 'white', fundo: '#198754' },
  cancelado: { texto: 'Cancelado', cor: 'white', fundo: '#dc3545' },
}

function badgeStatusVendaOrc(status) {
  const s = STATUS_VENDA_ORC_LABEL[status] || { texto: status, cor: 'white', fundo: '#6c757d' }
  return `<span style="background:${s.fundo}; color:${s.cor}; padding:2px 8px; border-radius:12px; font-size:12px;">${esc(s.texto)}</span>`
}

const STATUS_PARCELA_LABEL = {
  pendente: { texto: 'Pendente', cor: '#997404', fundo: '#fff3cd' },
  pago: { texto: 'Pago', cor: 'white', fundo: '#198754' },
  atrasado: { texto: 'Atrasado', cor: 'white', fundo: '#dc3545' },
}

function badgeStatusParcela(status) {
  const s = STATUS_PARCELA_LABEL[status] || { texto: status, cor: 'white', fundo: '#6c757d' }
  return `<span style="background:${s.fundo}; color:${s.cor}; padding:2px 8px; border-radius:12px; font-size:12px;">${esc(s.texto)}</span>`
}

const TIPO_ITEM_VENDA_LABEL = { servico: 'Serviço', produto: 'Produto' }

function labelFormaPagamento(v) {
  return v.formaPagamento === 'parcelado' ? `Parcelado (${v.numeroParcelas}x)` : 'À vista'
}

export function inicializarVendasOrcamento() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('vendasOrcamento').classList.add('active')

  const container = document.getElementById('vendasOrcamento')
  container.innerHTML = `
    <div class="tab">Vendas</div>
    ${podeGerenciarVendasOrc ? `<button class="btn btn-success" onclick="abrirVendaAvulsa()">+ Nova Venda</button>` : ''}

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

    <div class="table-scroll">
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
    </div>
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
      <td>${esc(v.cliente.nome)}</td>
      <td>${esc(v.vendedor?.nome || '-')}</td>
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
          <div><span style="color:#999;">Cliente</span><br><strong>${esc(v.cliente.nome)}</strong></div>
          <div><span style="color:#999;">Vendedor responsável</span><br><strong>${esc(v.vendedor?.nome || '-')}</strong></div>
          <div><span style="color:#999;">Data da venda</span><br><strong>${formatarDataVO(v.dataVenda)}</strong></div>
          <div><span style="color:#999;">Forma de pagamento</span><br><strong>${labelFormaPagamento(v)}</strong></div>
          <div><span style="color:#999;">Valor total</span><br><strong>${formatarMoedaVO(v.valorTotal)}</strong></div>
          <div><span style="color:#999;">Comissão do vendedor</span><br><strong>${v.comissao != null ? formatarMoedaVO(v.comissao) : '-'}</strong>
            ${podeGerenciarVendasOrc ? `<a href="#" onclick="editarComissaoVendaOrcamento(${v.id}, ${v.comissao ?? 'null'}); return false;" style="font-size:12px; margin-left:6px;">editar</a>` : ''}
          </div>
          <div><span style="color:#999;">Orçamento de origem</span><br>
            ${v.orcamento
              ? `<a href="#" onclick="verOrcamentoDeVenda(${v.orcamento.id}); return false;">Orçamento ${v.orcamento.numero}.${v.orcamento.ano}</a>`
              : '<strong>Venda avulsa</strong>'}
          </div>
        </div>
      </div>

      ${v.itens?.length > 0 ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Itens</div>
          <table class="table-certificados" style="margin:0;">
            <thead><tr><th>Tipo</th><th>Item</th><th>Qtd</th><th>Valor Unit.</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${v.itens.map(i => `
                <tr>
                  <td>${esc(TIPO_ITEM_VENDA_LABEL[i.tipo] || i.tipo)}</td>
                  <td>${esc(i.nome)}${i.detalhes ? `<br><small style="color:#999;">${esc(i.detalhes)}</small>` : ''}</td>
                  <td>${i.quantidade}</td>
                  <td>${formatarMoedaVO(i.valorUnitario)}</td>
                  <td>${formatarMoedaVO(i.quantidade * i.valorUnitario)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Contas a receber</div>
        <table class="table-certificados" style="margin:0;">
          <thead><tr><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>
            ${v.pagamentos.map(p => `
              <tr>
                <td>${esc(p.referencia || 'Pagamento único')}</td>
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
          <div style="font-size:13px; color:#444; white-space:pre-line;">${esc(v.observacoes)}</div>
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

// Comissão pode ser lançada/corrigida depois da venda (vale pra folha que
// ainda estiver aberta — ao atualizar os dados automáticos dela)
window.editarComissaoVendaOrcamento = async function (id, atual) {
  const valor = prompt('Comissão do vendedor (R$) — deixe vazio pra remover:', atual ?? '')
  if (valor === null) return
  const res = await apiJson(`${API}/vendas-orcamento/${id}`, { method: 'PUT', body: JSON.stringify({ comissao: valor.trim() }) })
  if (res.ok) verVendaOrcamento(id)
  else alert('Erro ao salvar comissão: ' + ((await res.json()).erro || ''))
}

window.cancelarVendaOrcamento = async function (id) {
  if (!confirm('Cancelar esta venda? As contas a receber já geradas continuam existindo — gerencie-as separadamente se precisar.')) return
  const res = await apiJson(`${API}/vendas-orcamento/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelado' }) })
  if (res.ok) verVendaOrcamento(id)
  else alert('Erro ao cancelar venda')
}

// ===== CRIAR VENDA (a partir de um Orçamento aprovado) ==========================
let voOrcamentoAtual = null
// true quando o formulário aberto é o de venda avulsa (sem Orçamento)
let voModoAvulsa = false

// Chamada pelo botão "Criar Venda" na tela de detalhe do Orçamento (aprovado).
export async function abrirCriarVendaOrcamento(orcamentoId) {
  const o = await apiFetch(`${API}/orcamentos/${orcamentoId}`).then(r => r.json())
  voOrcamentoAtual = o
  voModoAvulsa = false

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('vendasOrcamento').classList.add('active')

  document.getElementById('vendasOrcamento').innerHTML = `
    <div style="margin-top:20px; max-width:600px;">
      <button class="btn btn-secondary" onclick="verOrcamentoDeVenda(${o.id})">← Voltar ao Orçamento</button>
      <h3 style="margin:20px 0;">Criar Venda — Orçamento ${o.numero}.${o.ano}</h3>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px; font-size:13px;">
        <div><span style="color:#999;">Cliente</span><br><strong>${esc(o.cliente.nome)}</strong></div>
        <div style="margin-top:8px;"><span style="color:#999;">Valor total do orçamento</span><br><strong style="font-size:16px; color:#198754;">${formatarMoedaVO(o.totalLiquido)}</strong></div>
      </div>

      <div><label>Data da Venda</label><input type="date" id="vo-dataVenda" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>

      ${camposPagamentoVendaHtml()}

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarVendaOrcamento()">Criar Venda</button>
    </div>
  `

  window.alternarFormaPagamentoVenda()
}

// Forma de pagamento, vencimento, prévia das parcelas e observações — igual
// na venda de Orçamento e na avulsa (mesmos ids vo-*, lidos por salvarVendaOrcamento)
function camposPagamentoVendaHtml() {
  return `
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
        <label>Comissão do vendedor (R$) <small style="color:#999;">(opcional — entra na Folha de pagamento do mês da venda)</small></label>
        <input type="number" id="vo-comissao" class="form-control" min="0" step="0.01">
      </div>

      <div style="margin-top:16px;">
        <label>Observações</label>
        <textarea id="vo-observacoes" class="form-control" rows="3"></textarea>
      </div>
  `
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
  const valorTotal = voModoAvulsa ? totalItensVendaAvulsa() : (voOrcamentoAtual?.totalLiquido || 0)

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

// ===== VENDA AVULSA (sem Orçamento) =============================================
// Cliente, vendedor e itens preenchidos direto aqui. Itens funcionam igual aos
// do Orçamento: busca no catálogo (serviço/produto) e, se não achar,
// "+ Cadastrar novo..." cadastra no catálogo e já usa na linha.
let vaClienteId = null
let vaClientesBusca = []
let vaCatalogoProdutos = []
let vaCatalogoServicos = []
let vaItensAtivos = []
let vaItensContador = 0

window.abrirVendaAvulsa = async function () {
  voModoAvulsa = true
  voOrcamentoAtual = null
  vaClienteId = null
  vaItensAtivos = []
  vaItensContador = 0

  const [usuarios, produtos, servicos] = await Promise.all([
    apiFetch(`${API}/colaboradores/vendedores`).then(r => r.json()),
    apiFetch(`${API}/almoxarifado/produtos?todas=1`).then(r => r.json()),
    apiFetch(`${API}/servicos?todas=1`).then(r => r.json()),
  ])
  vaCatalogoProdutos = produtos
  vaCatalogoServicos = servicos

  document.getElementById('vendasOrcamento').innerHTML = `
    <div style="margin-top:20px;">
      <button class="btn btn-secondary" onclick="inicializarVendasOrcamento()">← Voltar</button>
      <h3 style="margin:20px 0;">Nova Venda avulsa</h3>

      <div style="position:relative; margin-bottom:16px;">
        <label>Cliente * <small style="color:#999;">(busca por nome ou CPF/CNPJ — se não achar, preencha os dados abaixo para cadastrar um novo)</small></label>
        <input type="text" id="va-cliente-busca" class="form-control" placeholder="Digite nome ou CPF/CNPJ..."
          oninput="buscarClienteVendaAvulsa(this.value)" autocomplete="off">
        <div id="va-sugestoes-cliente" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div>
          <label>Tipo</label>
          <select id="va-cliente-tipoPessoa" class="form-control">
            <option value="fisica">Pessoa Física</option>
            <option value="juridica">Pessoa Jurídica</option>
          </select>
        </div>
        <div><label>CPF/CNPJ</label><input type="text" id="va-cliente-cpfCnpj" class="form-control" placeholder="Somente números"></div>
        <div style="grid-column:span 2;"><label>Nome / Razão Social</label><input type="text" id="va-cliente-nome" class="form-control"></div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; max-width:600px;">
        <div>
          <label>Vendedor Responsável</label>
          <select id="va-vendedorId" class="form-control">
            <option value="">Selecione...</option>
            ${usuarios.map(u => `<option value="${u.id}" ${usuarioAtual?.id === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}
          </select>
        </div>
        <div><label>Data da Venda</label><input type="date" id="vo-dataVenda" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
      </div>

      <h5 style="margin: 24px 0 10px;">Itens</h5>
      <div class="table-scroll">
        <table class="table-certificados">
          <thead>
            <tr><th>Tipo</th><th>Produto/Serviço</th><th>Detalhes</th><th>Qtd</th><th>Valor Unit. (R$)</th><th>Subtotal</th><th></th></tr>
          </thead>
          <tbody id="va-itens-tbody"></tbody>
        </table>
      </div>
      <button type="button" class="btn btn-secondary" style="margin-top:8px;" onclick="adicionarItemVendaAvulsa()">+ Item</button>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-top:20px; text-align:right; font-size:14px;">
        Valor total: <strong id="va-total" style="color:#198754; font-size:16px;">R$ 0,00</strong>
      </div>

      <div style="max-width:600px;">
        ${camposPagamentoVendaHtml()}
      </div>

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarVendaOrcamento()">Criar Venda</button>
    </div>
  `

  window.adicionarItemVendaAvulsa()
  window.alternarFormaPagamentoVenda()
}

function totalItensVendaAvulsa() {
  return Math.round(vaItensAtivos.reduce((soma, i) => {
    const qtd = parseFloat(document.getElementById(`va-item-qtd-${i}`)?.value) || 0
    const valor = parseFloat(document.getElementById(`va-item-valor-${i}`)?.value) || 0
    return soma + qtd * valor
  }, 0) * 100) / 100
}

window.recalcularVendaAvulsa = function () {
  vaItensAtivos.forEach(i => {
    const qtd = parseFloat(document.getElementById(`va-item-qtd-${i}`).value) || 0
    const valor = parseFloat(document.getElementById(`va-item-valor-${i}`).value) || 0
    document.getElementById(`va-item-subtotal-${i}`).textContent = formatarMoedaVO(qtd * valor)
  })
  document.getElementById('va-total').textContent = formatarMoedaVO(totalItensVendaAvulsa())
  // Na abertura do formulário os campos de pagamento ainda não existem quando
  // o 1º item é adicionado — a prévia é montada logo depois por alternarFormaPagamentoVenda
  if (document.querySelector('input[name="vo-formaPagamento"]:checked')) window.atualizarPreviaParcelasVenda()
}

window.adicionarItemVendaAvulsa = function () {
  const i = vaItensContador++
  vaItensAtivos.push(i)
  document.getElementById('va-itens-tbody').insertAdjacentHTML('beforeend', `
    <tr id="va-item-row-${i}">
      <td>
        <select class="form-control form-control-sm" id="va-item-tipo-${i}" onchange="mudarTipoItemVendaAvulsa(${i})">
          <option value="servico">Serviço</option>
          <option value="produto">Produto</option>
        </select>
      </td>
      <td style="min-width:200px;">
        <input type="text" class="form-control form-control-sm" id="va-item-nome-${i}" placeholder="Digite pra buscar..." autocomplete="off"
          oninput="buscarCatalogoItemVendaAvulsa(${i})" onfocus="buscarCatalogoItemVendaAvulsa(${i})">
        <input type="hidden" id="va-item-catalogo-${i}">
        <div id="va-item-novo-${i}" style="display:none;"></div>
      </td>
      <td><input type="text" class="form-control form-control-sm" id="va-item-detalhes-${i}" placeholder="Opcional"></td>
      <td><input type="number" class="form-control form-control-sm" id="va-item-qtd-${i}" min="0" step="0.01" value="1" style="width:80px;" oninput="recalcularVendaAvulsa()"></td>
      <td><input type="number" class="form-control form-control-sm" id="va-item-valor-${i}" min="0" step="0.01" style="width:100px;" oninput="recalcularVendaAvulsa()"></td>
      <td id="va-item-subtotal-${i}" style="text-align:right; font-weight:600; white-space:nowrap;">R$ 0,00</td>
      <td><button type="button" class="btn btn-sm btn-danger" onclick="removerItemVendaAvulsa(${i})">✕</button></td>
    </tr>
  `)
  window.recalcularVendaAvulsa()
}

window.removerItemVendaAvulsa = function (i) {
  document.getElementById(`va-item-row-${i}`)?.remove()
  vaItensAtivos = vaItensAtivos.filter(x => x !== i)
  esconderSugestoesCatalogoVendaAvulsa()
  window.recalcularVendaAvulsa()
}

window.mudarTipoItemVendaAvulsa = function (i) {
  document.getElementById(`va-item-nome-${i}`).value = ''
  document.getElementById(`va-item-catalogo-${i}`).value = ''
  document.getElementById(`va-item-valor-${i}`).value = ''
  const novoDiv = document.getElementById(`va-item-novo-${i}`)
  novoDiv.style.display = 'none'
  novoDiv.innerHTML = ''
  esconderSugestoesCatalogoVendaAvulsa()
  window.recalcularVendaAvulsa()
}

// Dropdown flutuante no <body>, pelo mesmo motivo do Orçamento: dentro do
// .table-scroll (overflow:auto) ele ficaria recortado.
function elementoSugestoesCatalogoVendaAvulsa() {
  let div = document.getElementById('va-catalogo-sugestoes-flutuante')
  if (!div) {
    div = document.createElement('div')
    div.id = 'va-catalogo-sugestoes-flutuante'
    div.style.cssText = 'display:none; position:fixed; background:white; border:1px solid #ccc; border-radius:4px; z-index:2000; max-height:220px; overflow-y:auto; box-shadow:0 2px 8px rgba(0,0,0,0.15);'
    document.body.appendChild(div)
  }
  return div
}

function esconderSugestoesCatalogoVendaAvulsa() {
  const div = document.getElementById('va-catalogo-sugestoes-flutuante')
  if (div) div.style.display = 'none'
}

window.buscarCatalogoItemVendaAvulsa = function (i) {
  const tipo = document.getElementById(`va-item-tipo-${i}`).value
  const input = document.getElementById(`va-item-nome-${i}`)
  const q = input.value.trim().toLowerCase()
  const lista = tipo === 'produto' ? vaCatalogoProdutos : vaCatalogoServicos

  // Só esquece a seleção se o texto mudou de fato (onfocus também chama aqui)
  const hidden = document.getElementById(`va-item-catalogo-${i}`)
  const atual = hidden.value ? lista.find(c => String(c.id) === hidden.value) : null
  if (!atual || atual.nome.toLowerCase() !== q) hidden.value = ''

  const filtrados = (q ? lista.filter(c => c.nome.toLowerCase().includes(q)) : lista).slice(0, 50)

  const div = elementoSugestoesCatalogoVendaAvulsa()
  div.dataset.linha = i
  div.innerHTML = (filtrados.length === 0
    ? `<div style="padding:8px 12px; color:#999;">Nenhum resultado</div>`
    : filtrados.map(c => `
      <div onclick="selecionarCatalogoItemVendaAvulsa(${i}, '${c.id}')" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee;"
        onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">
        ${esc(c.nome)} <span style="color:#999; font-size:12px;">${formatarMoedaVO(c.valor)}</span>
      </div>
    `).join('')) + `
    <div onclick="mostrarNovoItemCatalogoVendaAvulsa(${i})" style="padding:8px 12px; cursor:pointer; color:var(--acento); font-weight:600;"
      onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">+ Cadastrar novo...</div>
  `

  const rect = input.getBoundingClientRect()
  div.style.left = `${rect.left}px`
  div.style.top = `${rect.bottom}px`
  div.style.width = `${rect.width}px`
  div.style.display = 'block'
}

window.selecionarCatalogoItemVendaAvulsa = function (i, id) {
  const tipo = document.getElementById(`va-item-tipo-${i}`).value
  const lista = tipo === 'produto' ? vaCatalogoProdutos : vaCatalogoServicos
  const item = lista.find(c => String(c.id) === String(id))
  if (!item) return

  document.getElementById(`va-item-nome-${i}`).value = item.nome
  document.getElementById(`va-item-catalogo-${i}`).value = item.id
  document.getElementById(`va-item-valor-${i}`).value = item.valor ?? ''
  esconderSugestoesCatalogoVendaAvulsa()
  window.recalcularVendaAvulsa()
}

// Mesmos campos do "cadastrar novo" do Orçamento (produto pede código e
// unidade, que são obrigatórios no Almoxarifado)
window.mostrarNovoItemCatalogoVendaAvulsa = function (i) {
  const tipo = document.getElementById(`va-item-tipo-${i}`).value
  esconderSugestoesCatalogoVendaAvulsa()

  const novoDiv = document.getElementById(`va-item-novo-${i}`)
  novoDiv.style.display = 'block'
  novoDiv.innerHTML = tipo === 'produto' ? `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:6px;">
      <input type="text" class="form-control form-control-sm" id="va-item-novo-codigo-${i}" placeholder="Código *">
      <input type="text" class="form-control form-control-sm" id="va-item-novo-nome-${i}" placeholder="Nome *">
      <input type="text" class="form-control form-control-sm" id="va-item-novo-unidade-${i}" placeholder="Unidade *">
      <input type="number" step="0.01" class="form-control form-control-sm" id="va-item-novo-valor-${i}" placeholder="Valor (R$)">
    </div>
    <button type="button" class="btn btn-sm btn-secondary" style="margin-top:4px;" onclick="criarItemCatalogoVendaAvulsa(${i}, 'produto')">Cadastrar e usar</button>
  ` : `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:6px;">
      <input type="text" class="form-control form-control-sm" id="va-item-novo-nome-${i}" placeholder="Nome *" style="grid-column:span 2;">
      <input type="number" step="0.01" class="form-control form-control-sm" id="va-item-novo-valor-${i}" placeholder="Valor (R$)">
    </div>
    <button type="button" class="btn btn-sm btn-secondary" style="margin-top:4px;" onclick="criarItemCatalogoVendaAvulsa(${i}, 'servico')">Cadastrar e usar</button>
  `
}

window.criarItemCatalogoVendaAvulsa = async function (i, tipo) {
  const nome = document.getElementById(`va-item-novo-nome-${i}`).value.trim()
  const valor = document.getElementById(`va-item-novo-valor-${i}`).value
  if (!nome) { alert('Nome é obrigatório!'); return }

  let novo
  if (tipo === 'produto') {
    const codigo = document.getElementById(`va-item-novo-codigo-${i}`).value.trim()
    const unidade = document.getElementById(`va-item-novo-unidade-${i}`).value.trim()
    if (!codigo || !unidade) { alert('Código e unidade são obrigatórios!'); return }
    const res = await apiJson(`${API}/almoxarifado/produtos`, { method: 'POST', body: JSON.stringify({ codigo, nome, unidade, valor }) })
    novo = await res.json()
    if (!res.ok) { alert('Erro ao cadastrar produto: ' + (novo.erro || '')); return }
    vaCatalogoProdutos.push(novo)
  } else {
    const res = await apiJson(`${API}/servicos`, { method: 'POST', body: JSON.stringify({ nome, valor }) })
    novo = await res.json()
    if (!res.ok) { alert('Erro ao cadastrar serviço: ' + (novo.erro || '')); return }
    vaCatalogoServicos.push(novo)
  }

  document.getElementById(`va-item-nome-${i}`).value = novo.nome
  document.getElementById(`va-item-catalogo-${i}`).value = novo.id
  document.getElementById(`va-item-novo-${i}`).style.display = 'none'
  document.getElementById(`va-item-novo-${i}`).innerHTML = ''
  document.getElementById(`va-item-valor-${i}`).value = novo.valor ?? ''
  window.recalcularVendaAvulsa()
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('va-catalogo-sugestoes-flutuante')
  if (div && div.style.display !== 'none') {
    const input = document.getElementById(`va-item-nome-${div.dataset.linha}`)
    if (!div.contains(e.target) && e.target !== input) div.style.display = 'none'
  }

  const sugCliente = document.getElementById('va-sugestoes-cliente')
  if (sugCliente && !sugCliente.contains(e.target) && e.target.id !== 'va-cliente-busca') {
    sugCliente.style.display = 'none'
  }
})

window.buscarClienteVendaAvulsa = async function (q) {
  const div = document.getElementById('va-sugestoes-cliente')
  vaClienteId = null

  if (q.length < 2) { div.style.display = 'none'; return }

  vaClientesBusca = await apiFetch(`${API}/clientes/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())
  if (vaClientesBusca.length === 0) { div.style.display = 'none'; return }

  div.style.display = 'block'
  div.innerHTML = vaClientesBusca.map(c => `
    <div onclick="selecionarClienteVendaAvulsa(${c.id})" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">
      <strong>${esc(c.nome)}</strong>
    </div>
  `).join('')
}

window.selecionarClienteVendaAvulsa = function (id) {
  const c = vaClientesBusca.find(x => x.id === id)
  if (!c) return
  vaClienteId = c.id
  document.getElementById('va-cliente-busca').value = c.nome
  document.getElementById('va-cliente-tipoPessoa').value = c.tipoPessoa
  document.getElementById('va-cliente-cpfCnpj').value = c.cpfCnpj
  document.getElementById('va-cliente-nome').value = c.nome
  document.getElementById('va-sugestoes-cliente').style.display = 'none'
}

// Monta cliente/vendedor/itens da venda avulsa pro corpo do POST. Valida os
// itens ANTES de cadastrar cliente novo, pra um erro de item não deixar um
// cliente cadastrado à toa. Retorna null (já avisando) se algo estiver faltando.
async function montarOrigemVendaAvulsa() {
  if (vaItensAtivos.length === 0) {
    alert('Adicione ao menos um item!')
    return null
  }

  const itens = []
  for (const i of vaItensAtivos) {
    const tipo = document.getElementById(`va-item-tipo-${i}`).value
    const catalogoId = document.getElementById(`va-item-catalogo-${i}`).value
    const valorUnitario = document.getElementById(`va-item-valor-${i}`).value

    if (!catalogoId) {
      alert('Selecione (ou cadastre) o produto/serviço de todos os itens!')
      return null
    }
    if (valorUnitario === '') { alert('Informe o valor unitário de todos os itens!'); return null }

    // Nome vem do catálogo, não do campo de busca (que pode ter sido editado)
    const lista = tipo === 'produto' ? vaCatalogoProdutos : vaCatalogoServicos
    const nome = lista.find(c => String(c.id) === catalogoId)?.nome || ''

    itens.push({
      tipo,
      produtoId: tipo === 'produto' ? catalogoId : null,
      servicoId: tipo === 'servico' ? catalogoId : null,
      nome,
      detalhes: document.getElementById(`va-item-detalhes-${i}`).value.trim(),
      quantidade: document.getElementById(`va-item-qtd-${i}`).value || 1,
      valorUnitario,
    })
  }

  if (totalItensVendaAvulsa() <= 0) {
    alert('O valor total da venda precisa ser maior que zero!')
    return null
  }

  let clienteId = vaClienteId
  if (!clienteId) {
    const cpfCnpj = document.getElementById('va-cliente-cpfCnpj').value.trim()
    const nome = document.getElementById('va-cliente-nome').value.trim()
    if (!cpfCnpj || !nome) {
      alert('Selecione um cliente existente ou preencha CPF/CNPJ e nome para cadastrar um novo.')
      return null
    }

    const novoCliente = await apiJson(`${API}/clientes`, {
      method: 'POST',
      body: JSON.stringify({ tipoPessoa: document.getElementById('va-cliente-tipoPessoa').value, cpfCnpj, nome })
    }).then(r => r.json())

    if (!novoCliente.id) {
      alert('Erro ao cadastrar cliente: ' + (novoCliente.erro || ''))
      return null
    }
    // Se a venda der erro depois, a próxima tentativa reaproveita esse
    // cliente em vez de tentar cadastrar de novo (e bater no CPF/CNPJ repetido)
    vaClienteId = clienteId = novoCliente.id
  }

  return {
    clienteId,
    vendedorId: document.getElementById('va-vendedorId').value || null,
    itens,
  }
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

  let origem
  if (voModoAvulsa) {
    origem = await montarOrigemVendaAvulsa()
    if (!origem) return
  } else {
    origem = { orcamentoId: voOrcamentoAtual.id }
  }

  const body = {
    ...origem,
    dataVenda: document.getElementById('vo-dataVenda').value,
    formaPagamento: forma,
    numeroParcelas: forma === 'parcelado' ? numeroParcelas : 1,
    dataVencimento,
    observacoes: document.getElementById('vo-observacoes').value.trim(),
    comissao: document.getElementById('vo-comissao').value,
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

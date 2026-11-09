import { esc } from './html.js'
import { API, apiFetch, apiJson, apiDados } from './api.js'

const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
const perfil = usuarioAtual?.perfil || 'usuario'
const podeGerenciar = perfil === 'admin' || perfil === 'gerente'

// ─── Labels de status ─────────────────────────────────────────────────────────
const STATUS_LABEL = {
  disponivel: { texto: 'Disponível', cor: '#198754' },
  locado: { texto: 'Locado', cor: '#0d6efd' },
  vendido: { texto: 'Vendido', cor: '#6c757d' },
}

function badgeStatus(status) {
  const s = STATUS_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${esc(s.texto)}</span>`
}

// Guarda a lista completa (sem filtro) recebida do backend, por finalidade
const balsasCache = {}

// Seleção em lote (checkbox da tabela) — ids das balsas marcadas, por finalidade.
// Sobrevive a filtro e a ir/voltar do formulário de lote; só balsa disponível entra.
const balsasSelecionadas = { locacao: new Set(), venda: new Set() }
// O que a tabela está mostrando agora (depois dos filtros) — base do "selecionar todas"
const balsasVisiveis = { locacao: [], venda: [] }

// Coluna do checkbox + coluna de ações só existem pra quem gerencia
const COLUNAS_TABELA = podeGerenciar ? 11 : 9

// ===== RENDERIZA A PÁGINA DE ESTOQUE (locação ou venda) ======================
// finalidade: 'locacao' | 'venda'
export function inicializarEstoque(finalidade) {
  const containerId = finalidade === 'locacao' ? 'estoqueLocacao' : 'estoqueVendas'
  const titulo = finalidade === 'locacao' ? 'Estoque de Locação' : 'Estoque de Vendas'

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById(containerId).classList.add('active')

  const container = document.getElementById(containerId)
  container.innerHTML = `
    <div class="tab">${titulo}</div>
    ${podeGerenciar ? `<button class="btn btn-success" onclick="abrirFormularioBalsa('${finalidade}')">+ Nova Balsa</button>` : ''}

    <div style="margin: 16px 0 8px; display:flex; align-items:center; gap:8px; font-size:13px;">
      <label for="situacao-${finalidade}">Mostrar:</label>
      <select id="situacao-${finalidade}" class="form-control form-control-sm" style="width:auto;" onchange="carregarBalsasWrapper('${finalidade}')">
        <option value="disponivel">Só disponíveis</option>
        ${finalidade === 'locacao'
      ? '<option value="locado">Só locadas</option>'
      : '<option value="vendido">Só vendidas</option>'}
        <option value="todas">Todas</option>
      </select>
    </div>

    <!-- Filtros -->
    <div class="filtros-grid" style="margin-bottom: 8px;">
      <div>
        <label style="font-size:12px;">Nº Série</label>
        <input type="text" id="filtro-numeroSerie-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Patrimônio</label>
        <input type="text" id="filtro-patrimonio-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Fabricante</label>
        <input type="text" id="filtro-fabricante-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Modelo</label>
        <input type="text" id="filtro-modelo-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Tipo</label>
        <input type="text" id="filtro-tipo-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Armazém</label>
        <input type="text" id="filtro-armazem-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Ano mín.</label>
        <input type="number" id="filtro-anoMin-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Ano máx.</label>
        <input type="number" id="filtro-anoMax-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <div>
        <label style="font-size:12px;">Capacidade</label>
        <input type="number" id="filtro-capacidade-${finalidade}" class="form-control form-control-sm" oninput="aplicarFiltrosBalsa('${finalidade}')">
      </div>
      <!-- Duas colunas do grid: numa só os botões quebravam o texto e ficavam mais altos que os campos -->
      <div style="grid-column: span 2; display:flex; gap:8px;">
        <button class="btn btn-sm btn-outline-secondary" style="flex:1; white-space:nowrap;" onclick="limparFiltrosBalsa('${finalidade}')">Limpar filtros</button>
        <button class="btn btn-sm btn-outline-primary" style="flex:1; white-space:nowrap;" onclick="exportarPdfEstoque('${finalidade}')">Exportar PDF</button>
      </div>
    </div>

    <div id="contador-balsas-${finalidade}" style="color:#999; font-size:12px; margin-bottom: 8px;"></div>

    <div id="barra-selecao-${finalidade}" style="display:none; align-items:center; gap:8px; flex-wrap:wrap; background:#eef4ff; border:1px solid #cfe0ff; border-radius:6px; padding:8px 12px; margin-bottom:8px;"></div>

    <div class="table-scroll">
      <table class="table-certificados">
        <thead>
          <tr>
            ${podeGerenciar ? `<th style="width:32px;"><input type="checkbox" id="selecionar-todas-${finalidade}" title="Selecionar todas as disponíveis da lista" onchange="selecionarTodasBalsas('${finalidade}', this.checked)"></th>` : ''}
            <th>Capacidade</th>
            <th>Patrimônio</th>
            <th>Fabricante</th>
            <th>Nº Série</th>
            <th>Modelo</th>
            <th>Ano</th>
            <th>Tipo</th>
            <th>Armazém</th>
            <th>Status</th>
            ${podeGerenciar ? '<th class="col-acoes">Ações</th>' : ''}
          </tr>
        </thead>
        <tbody id="tabela-balsas-${finalidade}">
          <tr><td colspan="${COLUNAS_TABELA}" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `

  carregarBalsas(finalidade)
}

// Ordenação fixa: sempre por capacidade, menor para maior
const CAMPO_ORDEM = 'capacidade'
const DIRECAO_ORDEM = 'asc'

const CAMPOS_FILTRO = ['numeroSerie', 'patrimonio', 'fabricante', 'modelo', 'tipo', 'armazem', 'anoMin', 'anoMax', 'capacidade']

// ===== CARREGA BALSAS DO BACKEND ==============================================
// disponivel | locado | vendido | todas (seletor "Mostrar" — ver lerSituacao em routes/estoque.js)
const situacaoAtual = finalidade => document.getElementById(`situacao-${finalidade}`)?.value || 'disponivel'

async function carregarBalsas(finalidade) {
  const situacao = situacaoAtual(finalidade)

  try {
    const params = new URLSearchParams({ finalidade, situacao })

    const res = await apiFetch(`${API}/estoque?${params}`)
    const balsas = await res.json()
    balsasCache[finalidade] = balsas

    // Tira da seleção o que deixou de estar disponível (locada/vendida por outra pessoa, etc.)
    const disponiveis = new Set(balsas.filter(b => b.status === 'disponivel').map(b => b.id))
    balsasSelecionadas[finalidade].forEach(id => { if (!disponiveis.has(id)) balsasSelecionadas[finalidade].delete(id) })

    aplicarFiltros(finalidade, situacao)
  } catch (err) {
    document.getElementById(`tabela-balsas-${finalidade}`).innerHTML = `
      <tr><td colspan="${COLUNAS_TABELA}" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

// Wrapper acessível globalmente (usado pelo onchange do checkbox)
window.carregarBalsasWrapper = function (finalidade) {
  carregarBalsas(finalidade)
}

// ===== APLICA FILTROS + ORDENAÇÃO (client-side, sobre o cache) ===============
window.aplicarFiltrosBalsa = function (finalidade) {
  aplicarFiltros(finalidade, situacaoAtual(finalidade))
}

window.limparFiltrosBalsa = function (finalidade) {
  CAMPOS_FILTRO.forEach(campo => {
    const el = document.getElementById(`filtro-${campo}-${finalidade}`)
    if (el) el.value = ''
  })
  aplicarFiltrosBalsa(finalidade)
}

// PDF abre em nova aba — sem header Authorization, o token vai na query. Manda os
// filtros preenchidos e o backend (GET /estoque/pdf) aplica a mesma regra de aplicarFiltros
window.exportarPdfEstoque = function (finalidade) {
  const params = new URLSearchParams({ finalidade, situacao: situacaoAtual(finalidade), token: localStorage.getItem('ns_token') || '' })
  CAMPOS_FILTRO.forEach(campo => {
    const valor = (document.getElementById(`filtro-${campo}-${finalidade}`)?.value || '').trim()
    if (valor) params.append(campo, valor)
  })
  window.open(`${API}/estoque/pdf?${params}`, '_blank')
}

const CONTADOR_SITUACAO = { disponivel: 'disponível(is)', locado: 'locada(s)', vendido: 'vendida(s)', todas: 'no total' }

function aplicarFiltros(finalidade, situacao) {
  let balsas = [...(balsasCache[finalidade] || [])]

  const texto = campo => (document.getElementById(`filtro-${campo}-${finalidade}`)?.value || '').trim().toLowerCase()
  const numero = campo => {
    const v = document.getElementById(`filtro-${campo}-${finalidade}`)?.value
    return v ? Number(v) : null
  }

  const fNumeroSerie = texto('numeroSerie')
  const fPatrimonio = texto('patrimonio')
  const fFabricante = texto('fabricante')
  const fModelo = texto('modelo')
  const fTipo = texto('tipo')
  const fArmazem = texto('armazem')
  const anoMin = numero('anoMin')
  const anoMax = numero('anoMax')
  const capacidade = numero('capacidade')

  if (fNumeroSerie) balsas = balsas.filter(b => b.numeroSerie.toLowerCase().includes(fNumeroSerie))
  if (fPatrimonio) balsas = balsas.filter(b => (b.patrimonio || '').toLowerCase().includes(fPatrimonio))
  if (fFabricante) balsas = balsas.filter(b => b.fabricante.toLowerCase().includes(fFabricante))
  if (fModelo) balsas = balsas.filter(b => b.modelo.toLowerCase().includes(fModelo))
  if (fTipo) balsas = balsas.filter(b => b.tipo.toLowerCase().includes(fTipo))
  if (fArmazem) balsas = balsas.filter(b => (b.armazem || '').toLowerCase().includes(fArmazem))
  if (anoMin !== null) balsas = balsas.filter(b => b.anoFabricacao >= anoMin)
  if (anoMax !== null) balsas = balsas.filter(b => b.anoFabricacao <= anoMax)
  if (capacidade !== null) balsas = balsas.filter(b => b.capacidade === capacidade)

  balsas.sort((a, b) => {
    let valA = a[CAMPO_ORDEM]
    let valB = b[CAMPO_ORDEM]
    if (typeof valA === 'string') {
      valA = valA.toLowerCase()
      valB = (valB || '').toLowerCase()
    }
    if (valA < valB) return DIRECAO_ORDEM === 'asc' ? -1 : 1
    if (valA > valB) return DIRECAO_ORDEM === 'asc' ? 1 : -1
    return 0
  })

  renderizarTabela(finalidade, balsas)

  const contador = document.getElementById(`contador-balsas-${finalidade}`)
  if (contador) {
    const totalCache = (balsasCache[finalidade] || []).length
    contador.textContent = balsas.length === totalCache
      ? `${balsas.length} balsa(s) ${CONTADOR_SITUACAO[situacao] || ''}`
      : `${balsas.length} de ${totalCache} balsa(s) (filtro aplicado)`
  }
}

// ===== RENDERIZA A TABELA =====================================================
function renderizarTabela(finalidade, balsas) {
  const tabela = document.getElementById(`tabela-balsas-${finalidade}`)
  balsasVisiveis[finalidade] = balsas
  atualizarBarraSelecao(finalidade)

  if (balsas.length === 0) {
    tabela.innerHTML = `<tr><td colspan="${COLUNAS_TABELA}" style="text-align:center; color:#999; padding:30px;">Nenhuma balsa encontrada</td></tr>`
    return
  }

  const selecionadas = balsasSelecionadas[finalidade]
  tabela.innerHTML = balsas.map(b => `
    <tr>
      ${podeGerenciar ? `<td>${b.status === 'disponivel'
        ? `<input type="checkbox" ${selecionadas.has(b.id) ? 'checked' : ''} onchange="alternarSelecaoBalsa('${finalidade}', ${b.id}, this.checked)">`
        : ''}</td>` : ''}
      <td${podeGerenciar ? ` style="cursor:pointer;" onclick="editarBalsa(${b.id}, '${finalidade}')"` : ''}><strong>${esc(b.capacidade)}</strong></td>
      <td>${esc(b.patrimonio) || '-'}</td>
      <td${podeGerenciar ? ` style="cursor:pointer;" onclick="editarBalsa(${b.id}, '${finalidade}')"` : ''}>${esc(b.fabricante)}</td>
      <td>${esc(b.numeroSerie)}</td>
      <td>${esc(b.modelo)}</td>
      <td>${esc(b.anoFabricacao)}</td>
      <td>${esc(b.tipo)}</td>
      <td>${esc(b.armazem || '-')}</td>
      <td>${badgeStatus(b.status)}</td>
      ${podeGerenciar ? `
        <td class="col-acoes">
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <button class="btn btn-sm btn-info" onclick="editarBalsa(${b.id}, '${finalidade}')">Editar</button>
            ${b.status === 'disponivel' && finalidade === 'locacao'
        ? `<button class="btn btn-sm btn-warning" onclick="marcarStatusBalsa(${b.id}, 'locado', '${finalidade}')">Marcar locado</button>`
        : ''}
            ${b.status === 'disponivel'
        ? `<button class="btn btn-sm btn-secondary" onclick="marcarStatusBalsa(${b.id}, 'vendido', '${finalidade}')">Marcar vendido</button>`
        : ''}
            ${b.status !== 'disponivel'
        ? `<button class="btn btn-sm btn-success" onclick="marcarStatusBalsa(${b.id}, 'disponivel', '${finalidade}')">Reativar</button>`
        : ''}
          </div>
        </td>
      ` : ''}
    </tr>
  `).join('')
}

// ===== SELEÇÃO EM LOTE ========================================================
window.alternarSelecaoBalsa = function (finalidade, id, marcada) {
  if (marcada) balsasSelecionadas[finalidade].add(id)
  else balsasSelecionadas[finalidade].delete(id)
  atualizarBarraSelecao(finalidade)
}

// "Todas" = as disponíveis que a tabela está mostrando agora (respeita os filtros)
window.selecionarTodasBalsas = function (finalidade, marcar) {
  balsasVisiveis[finalidade].filter(b => b.status === 'disponivel').forEach(b => {
    if (marcar) balsasSelecionadas[finalidade].add(b.id)
    else balsasSelecionadas[finalidade].delete(b.id)
  })
  renderizarTabela(finalidade, balsasVisiveis[finalidade])
}

window.limparSelecaoBalsas = function (finalidade) {
  balsasSelecionadas[finalidade].clear()
  renderizarTabela(finalidade, balsasVisiveis[finalidade])
}

function atualizarBarraSelecao(finalidade) {
  const barra = document.getElementById(`barra-selecao-${finalidade}`)
  if (!barra) return
  const qtd = balsasSelecionadas[finalidade].size

  const disponiveisVisiveis = balsasVisiveis[finalidade].filter(b => b.status === 'disponivel')
  const checkTodas = document.getElementById(`selecionar-todas-${finalidade}`)
  if (checkTodas) {
    checkTodas.checked = disponiveisVisiveis.length > 0 && disponiveisVisiveis.every(b => balsasSelecionadas[finalidade].has(b.id))
  }

  if (qtd === 0) {
    barra.style.display = 'none'
    return
  }
  barra.style.display = 'flex'
  barra.innerHTML = `
    <strong>${qtd} balsa(s) selecionada(s)</strong>
    <button class="btn btn-sm btn-primary" onclick="abrirFormularioLoteBalsas('${finalidade}')">${finalidade === 'locacao' ? 'Locar selecionadas' : 'Vender selecionadas'}</button>
    <button class="btn btn-sm btn-outline-secondary" onclick="limparSelecaoBalsas('${finalidade}')">Limpar seleção</button>
  `
}

// ===== LOCAR / VENDER EM LOTE — contrato/venda simplificado ===================
// Cria um Contrato de locação (ou uma Venda) de verdade pelas mesmas rotas do
// formulário completo — numeração, fatura em Contas a Receber e status das
// balsas saem iguais —, só que pedindo o mínimo: cliente, valor total (dividido
// igualmente entre as balsas) e, na locação, a data de fim. O resto (frete,
// desconto, condições) dá pra completar depois editando o contrato/venda.

let clienteLote = null // { id, nome, cpfCnpj } quando escolhido na busca

// Data local como YYYY-MM-DD — toISOString() daria o dia seguinte depois das 21h em Brasília
function dataLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Mesmo dia N meses depois; 31/01 + 1 mês vira 28/02 (e não 03/03, como o Date faria sozinho)
function somarMeses(iso, meses) {
  const [a, m, d] = iso.split('-').map(Number)
  const ultimoDia = new Date(a, m - 1 + meses + 1, 0).getDate()
  return dataLocalISO(new Date(a, m - 1 + meses, Math.min(d, ultimoDia)))
}

// Divide o total em centavos inteiros; a sobra da divisão vai 1 centavo pra cada
// uma das primeiras balsas, pra soma bater exatamente com o total digitado
function dividirValor(total, qtd) {
  const centavos = Math.round(total * 100)
  const base = Math.floor(centavos / qtd)
  const sobra = centavos - base * qtd
  return Array.from({ length: qtd }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100)
}

const moedaBR = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

window.abrirFormularioLoteBalsas = async function (finalidade) {
  const containerId = finalidade === 'locacao' ? 'estoqueLocacao' : 'estoqueVendas'
  const locacao = finalidade === 'locacao'
  const balsas = (balsasCache[finalidade] || []).filter(b => balsasSelecionadas[finalidade].has(b.id))
  if (balsas.length === 0) { alert('Selecione ao menos uma balsa!'); return }
  balsas.sort((a, b) => a.capacidade - b.capacidade)

  clienteLote = null
  const hoje = dataLocalISO(new Date())

  // Venda exige vendedor responsável (é dele a comissão na folha) — vem marcado quem está logado, se for vendedor
  let vendedores = []
  if (!locacao) {
    vendedores = await apiDados(`${API}/colaboradores/vendedores`, { semAviso: true }).catch(() => [])
  }

  document.getElementById(containerId).innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarEstoqueWrapper('${finalidade}')">← Voltar</button>
      <h3 style="margin:20px 0 4px;">${locacao ? 'Locar' : 'Vender'} ${balsas.length} balsa(s)</h3>
      <div style="color:#999; font-size:13px; margin-bottom:16px;">
        Cria ${locacao ? 'um contrato de locação' : 'uma venda'} com o mínimo de dados — frete, desconto e condições podem ser completados depois em ${locacao ? 'Contratos' : 'Vendas'}.
      </div>

      <div class="table-scroll" style="margin-bottom:20px;">
        <table class="table-certificados">
          <thead><tr><th>Capacidade</th><th>Patrimônio</th><th>Nº Série</th><th>Fabricante / Modelo</th><th>Valor</th></tr></thead>
          <tbody>
            ${balsas.map((b, i) => `
              <tr>
                <td><strong>${esc(b.capacidade)}</strong></td>
                <td>${esc(b.patrimonio) || '-'}</td>
                <td>${esc(b.numeroSerie)}</td>
                <td>${esc(b.fabricante)} ${esc(b.modelo)}</td>
                <td id="lote-valor-balsa-${i}" style="white-space:nowrap;">-</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div style="grid-column:span 2; position:relative;">
          <label>${locacao ? 'Para quem vai (cliente)' : 'Comprador (cliente)'} *</label>
          <input type="text" id="lote-cliente" class="form-control" placeholder="Digite o nome ou CPF/CNPJ..." autocomplete="off" oninput="buscarClienteLote(this.value)">
          <div id="lote-sugestoes-cliente" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
        </div>
        <div style="grid-column:span 2;" id="lote-cliente-novo">
          <label>CPF/CNPJ <small style="color:#999;">(só pra cliente novo — escolhendo um da lista, vem preenchido)</small></label>
          <input type="text" id="lote-cpfCnpj" class="form-control" placeholder="Somente números">
        </div>

        ${locacao ? `
          <div><label>Fim da locação *</label><input type="date" id="lote-dataFim" class="form-control" min="${hoje}" oninput="atualizarResumoLote(${balsas.length}, '${finalidade}')"></div>
          <div><label>Valor mensal (total das balsas)</label><input type="number" id="lote-valor" class="form-control" step="0.01" min="0" oninput="atualizarResumoLote(${balsas.length}, '${finalidade}')"></div>
        ` : `
          <div>
            <label>Vendedor responsável *</label>
            <select id="lote-vendedorId" class="form-control">
              <option value="">Selecione...</option>
              ${vendedores.map(u => `<option value="${u.id}" ${u.id === usuarioAtual?.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}
            </select>
          </div>
          <div><label>Valor total da venda</label><input type="number" id="lote-valor" class="form-control" step="0.01" min="0" oninput="atualizarResumoLote(${balsas.length}, '${finalidade}')"></div>
          <div><label>Vencimento do pagamento</label><input type="date" id="lote-dataVencimento" class="form-control" value="${hoje}"></div>
        `}
      </div>

      <div id="lote-resumo" style="margin-top:12px; color:#555; font-size:13px;"></div>

      <button type="button" id="lote-salvar" class="btn btn-success" style="margin-top:20px;" onclick="salvarLoteBalsas('${finalidade}')">
        ${locacao ? 'Criar contrato de locação' : 'Registrar venda'}
      </button>
    </div>
  `
  atualizarResumoLote(balsas.length, finalidade)
}

// Mostra o valor de cada balsa (divisão do total) e, na locação, quando vence a 1ª fatura
window.atualizarResumoLote = function (qtd, finalidade) {
  const total = parseFloat(document.getElementById('lote-valor').value) || 0
  const valores = total > 0 ? dividirValor(total, qtd) : null
  for (let i = 0; i < qtd; i++) {
    const cel = document.getElementById(`lote-valor-balsa-${i}`)
    if (cel) cel.textContent = valores ? moedaBR(valores[i]) : '-'
  }

  const resumo = document.getElementById('lote-resumo')
  if (!total) {
    resumo.textContent = 'Sem valor, nenhuma fatura é criada em Contas a Receber.'
    return
  }
  if (finalidade === 'locacao') {
    const vencimento = primeiroVencimentoLocacao()
    resumo.textContent = `Fatura mensal de ${moedaBR(total)}${vencimento ? ` — a 1ª vence em ${vencimento.split('-').reverse().join('/')}` : ''}.`
  } else {
    resumo.textContent = `Fatura única de ${moedaBR(total)}.`
  }
}

// 1ª parcela da locação: um mês depois de hoje — ou no fim, se a locação acabar antes disso
function primeiroVencimentoLocacao() {
  const fim = document.getElementById('lote-dataFim')?.value
  const umMes = somarMeses(dataLocalISO(new Date()), 1)
  return fim && fim < umMes ? fim : umMes
}

window.buscarClienteLote = async function (q) {
  const div = document.getElementById('lote-sugestoes-cliente')
  // Digitou de novo depois de escolher: volta a ser cliente "a definir"
  if (clienteLote) {
    clienteLote = null
    const cpf = document.getElementById('lote-cpfCnpj')
    cpf.value = ''
    cpf.disabled = false
  }

  if (q.trim().length < 2) { div.style.display = 'none'; return }

  const clientes = await apiDados(`${API}/clientes/buscar?q=${encodeURIComponent(q.trim())}`, { semAviso: true }).catch(() => [])
  if (!Array.isArray(clientes) || clientes.length === 0) { div.style.display = 'none'; return }

  div.style.display = 'block'
  div.innerHTML = clientes.map(c => `
    <div onclick="selecionarClienteLote(${esc(JSON.stringify({ id: c.id, nome: c.nome, cpfCnpj: c.cpfCnpj }))})"
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">
      <strong>${esc(c.nome)}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${esc(c.cpfCnpj)}</span>
    </div>
  `).join('')
}

window.selecionarClienteLote = function (c) {
  clienteLote = c
  document.getElementById('lote-cliente').value = c.nome
  const cpf = document.getElementById('lote-cpfCnpj')
  cpf.value = c.cpfCnpj
  cpf.disabled = true
  document.getElementById('lote-sugestoes-cliente').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('lote-sugestoes-cliente')
  if (div && !div.contains(e.target) && e.target.id !== 'lote-cliente') div.style.display = 'none'
})

// Cliente escolhido na busca, ou cadastra um novo só com nome + CPF/CNPJ (o tipo
// de pessoa sai do nº de dígitos). Devolve o id, ou null se não deu.
async function resolverClienteLote() {
  if (clienteLote) return clienteLote.id

  const nome = document.getElementById('lote-cliente').value.trim()
  const cpfCnpj = document.getElementById('lote-cpfCnpj').value.replace(/\D/g, '')
  if (!nome) { alert('Informe o cliente!'); return null }
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    alert('Cliente não encontrado na lista. Pra cadastrar um novo, informe o CPF (11 dígitos) ou CNPJ (14 dígitos).')
    return null
  }

  const res = await apiJson(`${API}/clientes`, {
    method: 'POST',
    body: JSON.stringify({ tipoPessoa: cpfCnpj.length === 11 ? 'fisica' : 'juridica', cpfCnpj, nome })
  })
  const dados = await res.json().catch(() => ({}))
  if (res.ok) return dados.id

  // CPF/CNPJ já cadastrado com outro nome — oferece usar o cadastro existente
  if (dados.cliente) {
    return confirm(`Já existe um cliente com esse CPF/CNPJ: ${dados.cliente.nome}. Usar esse cadastro?`) ? dados.cliente.id : null
  }
  alert('Erro ao cadastrar cliente: ' + (dados.erro || ''))
  return null
}

window.salvarLoteBalsas = async function (finalidade) {
  const locacao = finalidade === 'locacao'
  const balsas = (balsasCache[finalidade] || []).filter(b => balsasSelecionadas[finalidade].has(b.id))
  balsas.sort((a, b) => a.capacidade - b.capacidade)
  const hoje = dataLocalISO(new Date())

  const dataFim = locacao ? document.getElementById('lote-dataFim').value : null
  if (locacao && !dataFim) { alert('Informe o fim da locação!'); return }
  if (locacao && dataFim < hoje) { alert('O fim da locação não pode ser antes de hoje!'); return }

  const vendedorId = locacao ? null : document.getElementById('lote-vendedorId').value
  if (!locacao && !vendedorId) { alert('Selecione o vendedor responsável!'); return }

  const total = parseFloat(document.getElementById('lote-valor').value) || 0
  const dataVencimento = locacao ? primeiroVencimentoLocacao() : document.getElementById('lote-dataVencimento').value
  if (total && !dataVencimento) { alert('Informe o vencimento do pagamento!'); return }
  if (!total && !confirm('Sem valor, nenhuma fatura será criada em Contas a Receber. Continuar assim?')) return

  const botao = document.getElementById('lote-salvar')
  botao.disabled = true
  try {
    const clienteId = await resolverClienteLote()
    if (!clienteId) return

    const valores = total ? dividirValor(total, balsas.length) : balsas.map(() => null)
    const body = {
      clienteId,
      balsas: balsas.map((b, i) => ({ balsaId: b.id, valor: valores[i] })),
      valor: total || null,
      dataVencimento: total ? dataVencimento : null,
      ...(locacao
        ? { dataInicio: hoje, dataFim, periodicidadePagamento: 'mensal' }
        : { dataVenda: hoje, vendedorId, periodicidadePagamento: 'unico' })
    }

    const res = await apiJson(`${API}/${locacao ? 'contratos' : 'vendas'}`, { method: 'POST', body: JSON.stringify(body) })
    const criado = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(`Erro ao ${locacao ? 'criar contrato' : 'registrar venda'}: ` + (criado.erro || ''))
      return
    }

    balsasSelecionadas[finalidade].clear()
    // Tela de confirmação com link (e não window.open): depois dos awaits o
    // navegador já não conta como clique do usuário e bloquearia a aba como pop-up
    const token = encodeURIComponent(localStorage.getItem('ns_token') || '')
    document.getElementById(locacao ? 'estoqueLocacao' : 'estoqueVendas').innerHTML = `
      <div style="margin-top:20px; max-width:700px;">
        <h3 style="margin:20px 0 8px;">${locacao ? 'Contrato' : 'Venda'} ${criado.numero}.${criado.ano} ${locacao ? 'criado' : 'registrada'}</h3>
        <div style="color:#555; margin-bottom:20px;">
          ${balsas.length} balsa(s) marcada(s) como ${locacao ? 'locada(s)' : 'vendida(s)'} para ${esc(criado.cliente?.nome)}${total ? ` — fatura de ${moedaBR(total)} em Contas a Receber` : ''}.
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${locacao ? `<a class="btn btn-primary" href="${API}/contratos/${criado.id}/pdf?token=${token}" target="_blank">Abrir PDF do contrato</a>` : ''}
          <button class="btn btn-secondary" onclick="inicializarEstoqueWrapper('${finalidade}')">← Voltar ao estoque</button>
        </div>
      </div>
    `
  } finally {
    // Some junto com o formulário quando dá certo; no erro, libera pra tentar de novo
    if (document.body.contains(botao)) botao.disabled = false
  }
}

// ===== MARCA STATUS (locado / vendido / disponível novamente) ================
window.marcarStatusBalsa = async function (id, status, finalidade) {
  const confirmacoes = {
    locado: 'Marcar esta balsa como locada? Ela sairá da lista de disponíveis.',
    vendido: 'Marcar esta balsa como vendida? Ela sairá da lista de disponíveis.',
    disponivel: 'Marcar esta balsa como disponível novamente?',
  }
  if (!confirm(confirmacoes[status] || 'Confirmar alteração de status?')) return

  const res = await apiJson(`${API}/estoque/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  })

  if (res.ok) {
    // Chamado tanto da lista quanto de dentro da balsa aberta (editarBalsa) —
    // nesse segundo caso a tabela da lista não está no DOM, então volta pra
    // lista em vez de tentar atualizar um elemento que não existe mais.
    if (document.getElementById(`tabela-balsas-${finalidade}`)) carregarBalsas(finalidade)
    else inicializarEstoqueWrapper(finalidade)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao atualizar status'))
  }
}

// ===== DOCUMENTOS DA BALSA (mesmo esquema dos documentos de colaborador) ======
function secaoDocumentosBalsaHtml(documentos) {
  const token = encodeURIComponent(localStorage.getItem('ns_token') || '')
  const salvos = documentos?.length > 0
    ? documentos.map(d => `
        <li style="padding: 6px 0; border-bottom: 1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
          <a href="${API}/estoque/documentos/${d.id}/arquivo?token=${token}" target="_blank">📄 ${esc(d.titulo)}</a>
          <button class="btn btn-sm btn-danger" onclick="removerDocumentoBalsa(${d.id}, this)">✕</button>
        </li>
      `).join('')
    : documentos ? '<li style="color:#999; padding: 6px 0;">Nenhum documento</li>' : ''

  return `
    <div style="margin-top: 24px;">
      <h5>Documentos</h5>
      <ul id="lista-documentos-balsa-salvos" style="padding: 0; list-style: none; margin-bottom: 12px;">${salvos}</ul>
      <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items:end;">
        <div>
          <label>Título</label>
          <input type="text" id="documento-balsa-titulo" class="form-control" placeholder="Ex.: Certificado, Nota fiscal, Foto">
        </div>
        <div>
          <label>Arquivo (PDF ou imagem)</label>
          <input type="file" id="documento-balsa-arquivo" class="form-control" accept="application/pdf,image/*">
        </div>
        <button type="button" class="btn btn-secondary" onclick="adicionarDocumentoBalsaPendente()">+ Adicionar</button>
      </div>
      <ul id="lista-documentos-balsa-pendentes" style="margin-top: 12px; padding: 0; list-style: none;"></ul>
    </div>
  `
}

// Documentos escolhidos no formulário mas ainda não enviados — sobem ao salvar
let documentosBalsaPendentes = []

window.adicionarDocumentoBalsaPendente = function () {
  const titulo = document.getElementById('documento-balsa-titulo').value.trim()
  const input = document.getElementById('documento-balsa-arquivo')
  const arquivo = input.files[0]

  if (!titulo) { alert('Informe um título para o documento!'); return }
  if (!arquivo) { alert('Selecione um arquivo!'); return }
  if (arquivo.type !== 'application/pdf' && !arquivo.type.startsWith('image/')) { alert('Só são aceitos arquivos PDF ou imagem.'); return }

  documentosBalsaPendentes.push({ titulo, arquivo })

  const li = document.createElement('li')
  li.style = 'padding: 6px 0; border-bottom: 1px solid #eee; display:flex; justify-content:space-between;'
  li.innerHTML = `
    <span>📎 ${esc(titulo)} <small style="color:#999">(${esc(arquivo.name)} — será enviado ao salvar)</small></span>
    <button class="btn btn-sm btn-danger" onclick="removerDocumentoBalsaPendente(${documentosBalsaPendentes.length - 1}, this)">✕</button>
  `
  document.getElementById('lista-documentos-balsa-pendentes').appendChild(li)
  document.getElementById('documento-balsa-titulo').value = ''
  input.value = ''
}

window.removerDocumentoBalsaPendente = function (index, btn) {
  documentosBalsaPendentes[index] = null
  btn.closest('li').remove()
}

async function enviarDocumentosBalsaPendentes(balsaId) {
  const pendentes = documentosBalsaPendentes.filter(d => d !== null)
  const resultados = await Promise.all(pendentes.map(d => {
    const formData = new FormData()
    formData.append('titulo', d.titulo)
    formData.append('arquivo', d.arquivo)
    return apiFetch(`${API}/estoque/${balsaId}/documentos`, { method: 'POST', body: formData })
  }))
  documentosBalsaPendentes = []
  return resultados.every(r => r.ok)
}

window.removerDocumentoBalsa = async function (id, btn) {
  if (!confirm('Remover este documento? O arquivo será apagado.')) return
  const res = await apiFetch(`${API}/estoque/documentos/${id}`, { method: 'DELETE' })
  if (res.ok) btn.closest('li').remove()
  else alert('Erro ao remover documento')
}

// ===== HISTÓRICO DE LOCAÇÕES DA BALSA ==========================================
// Uma linha por passagem da balsa por um contrato (ver ContratoBalsa no schema)
const ESTADO_DEVOLUCAO_LABEL = { bom: 'Bom estado', avariado: 'Avariada' }

function dataPura(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'
}

function secaoHistoricoLocacoesHtml(locacoes) {
  if (!locacoes || locacoes.length === 0) return ''

  return `
    <div style="margin-top: 24px;">
      <h5>Histórico de locações</h5>
      <div class="table-scroll">
        <table class="table-certificados">
          <thead>
            <tr><th>Contrato</th><th>Cliente</th><th>Saída</th><th>Devolução</th><th>Vistoria</th></tr>
          </thead>
          <tbody>
            ${locacoes.map(l => `
              <tr>
                <td>${l.contrato.numero}.${l.contrato.ano}${l.aditivo ? ` <small style="color:#999;">(aditivo ${l.aditivo})</small>` : ''}</td>
                <td>${esc(l.contrato.cliente?.nome)}</td>
                <td>${dataPura(l.aditivo ? l.criadoEm : l.contrato.dataInicio)}</td>
                <td>${l.devolvidaEm ? dataPura(l.devolvidaEm) : '<span style="color:#0d6efd;">Com o cliente</span>'}</td>
                <td>${l.devolvidaEm
      ? (l.estadoDevolucao ? (ESTADO_DEVOLUCAO_LABEL[l.estadoDevolucao] || esc(l.estadoDevolucao)) : 'Contrato cancelado')
      + (l.observacoesDevolucao ? ' — ' + esc(l.observacoesDevolucao) : '')
      : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}

// ===== FORMULÁRIO — NOVA BALSA =================================================
window.abrirFormularioBalsa = function (finalidade) {
  documentosBalsaPendentes = []
  const containerId = finalidade === 'locacao' ? 'estoqueLocacao' : 'estoqueVendas'

  document.getElementById(containerId).innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarEstoqueWrapper('${finalidade}')">← Voltar</button>
      <h3 style="margin:20px 0;">Nova Balsa</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Fabricante *</label><input type="text" id="balsa-fabricante" class="form-control"></div>
        <div><label>Nº de Série *</label><input type="text" id="balsa-numeroSerie" class="form-control"></div>
        <div><label>Modelo *</label><input type="text" id="balsa-modelo" class="form-control"></div>
        <div><label>Ano de Fabricação *</label><input type="number" id="balsa-anoFabricacao" class="form-control"></div>
        <div><label>Capacidade *</label><input type="number" id="balsa-capacidade" class="form-control"></div>
        <div><label>Tipo *</label><input type="text" id="balsa-tipo" class="form-control" placeholder="Ex: balsa, baleeira..."></div>
        <div><label>Patrimônio *</label><input type="text" id="balsa-patrimonio" class="form-control"></div>
        <div><label>Armazém</label><input type="text" id="balsa-armazem" class="form-control"></div>
        <div style="grid-column:span 2;"><label>Observações</label><textarea id="balsa-observacoes" class="form-control" rows="3"></textarea></div>
      </div>

      ${secaoDocumentosBalsaHtml(null)}

      <input type="hidden" id="balsa-finalidade" value="${finalidade}">

      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarBalsa('${finalidade}')">Salvar Balsa</button>
    </div>
  `
}

window.salvarBalsa = async function (finalidade) {
  const body = {
    fabricante: document.getElementById('balsa-fabricante').value.trim(),
    numeroSerie: document.getElementById('balsa-numeroSerie').value.trim(),
    modelo: document.getElementById('balsa-modelo').value.trim(),
    anoFabricacao: parseInt(document.getElementById('balsa-anoFabricacao').value) || null,
    capacidade: parseInt(document.getElementById('balsa-capacidade').value) || null,
    tipo: document.getElementById('balsa-tipo').value.trim(),
    patrimonio: document.getElementById('balsa-patrimonio').value.trim(),
    armazem: document.getElementById('balsa-armazem').value.trim(),
    observacoes: document.getElementById('balsa-observacoes').value.trim(),
    finalidade,
  }

  if (!body.fabricante || !body.numeroSerie || !body.modelo || !body.anoFabricacao || !body.capacidade || !body.tipo || !body.patrimonio) {
    alert('Preencha todos os campos obrigatórios!')
    return
  }

  const res = await apiJson(`${API}/estoque`, {
    method: 'POST',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    const balsa = await res.json()
    const documentosOk = await enviarDocumentosBalsaPendentes(balsa.id)
    alert(documentosOk
      ? 'Balsa cadastrada com sucesso!'
      : 'Balsa cadastrada, mas algum documento não foi enviado. Confira a lista de documentos.')
    inicializarEstoqueWrapper(finalidade)
  } else {
    const err = await res.json()
    alert('Erro ao cadastrar balsa: ' + (err.erro || ''))
  }
}

// ===== FORMULÁRIO — EDITAR BALSA ===============================================
window.editarBalsa = async function (id, finalidade) {
  const containerId = finalidade === 'locacao' ? 'estoqueLocacao' : 'estoqueVendas'
  documentosBalsaPendentes = []
  const b = await apiDados(`${API}/estoque/${id}`)

  document.getElementById(containerId).innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarEstoqueWrapper('${finalidade}')">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Balsa ${badgeStatus(b.status)}</h3>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Fabricante *</label><input type="text" id="balsa-fabricante" class="form-control" value="${esc(b.fabricante)}"></div>
        <div><label>Nº de Série *</label><input type="text" id="balsa-numeroSerie" class="form-control" value="${esc(b.numeroSerie)}"></div>
        <div><label>Modelo *</label><input type="text" id="balsa-modelo" class="form-control" value="${esc(b.modelo)}"></div>
        <div><label>Ano de Fabricação *</label><input type="number" id="balsa-anoFabricacao" class="form-control" value="${esc(b.anoFabricacao)}"></div>
        <div><label>Capacidade *</label><input type="number" id="balsa-capacidade" class="form-control" value="${esc(b.capacidade)}"></div>
        <div><label>Tipo *</label><input type="text" id="balsa-tipo" class="form-control" value="${esc(b.tipo)}"></div>
        <div><label>Patrimônio *</label><input type="text" id="balsa-patrimonio" class="form-control" value="${esc(b.patrimonio)}"></div>
        <div><label>Armazém</label><input type="text" id="balsa-armazem" class="form-control" value="${esc(b.armazem || '')}"></div>
        <div>
          <label>Finalidade</label>
          <select id="balsa-finalidade" class="form-control">
            <option value="locacao" ${b.finalidade === 'locacao' ? 'selected' : ''}>Locação</option>
            <option value="venda" ${b.finalidade === 'venda' ? 'selected' : ''}>Venda</option>
          </select>
        </div>
        <div style="grid-column:span 2;"><label>Observações</label><textarea id="balsa-observacoes" class="form-control" rows="3">${esc(b.observacoes)}</textarea></div>
      </div>

      ${secaoDocumentosBalsaHtml(b.documentos || [])}

      ${secaoHistoricoLocacoesHtml(b.contratosBalsa)}

      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:20px;">
        <button type="button" class="btn btn-success" onclick="atualizarBalsa(${b.id}, '${finalidade}')">Salvar Alterações</button>
        ${b.status === 'disponivel' && finalidade === 'locacao'
      ? `<button type="button" class="btn btn-warning" onclick="marcarStatusBalsa(${b.id}, 'locado', '${finalidade}')">Marcar locado</button>`
      : ''}
        ${b.status === 'disponivel'
      ? `<button type="button" class="btn btn-secondary" onclick="marcarStatusBalsa(${b.id}, 'vendido', '${finalidade}')">Marcar vendido</button>`
      : ''}
        ${b.status !== 'disponivel'
      ? `<button type="button" class="btn btn-success" onclick="marcarStatusBalsa(${b.id}, 'disponivel', '${finalidade}')">Reativar</button>`
      : ''}
      </div>
    </div>
  `
}

window.atualizarBalsa = async function (id, finalidadeOrigem) {
  const body = {
    fabricante: document.getElementById('balsa-fabricante').value.trim(),
    numeroSerie: document.getElementById('balsa-numeroSerie').value.trim(),
    modelo: document.getElementById('balsa-modelo').value.trim(),
    anoFabricacao: parseInt(document.getElementById('balsa-anoFabricacao').value) || null,
    capacidade: parseInt(document.getElementById('balsa-capacidade').value) || null,
    tipo: document.getElementById('balsa-tipo').value.trim(),
    patrimonio: document.getElementById('balsa-patrimonio').value.trim(),
    armazem: document.getElementById('balsa-armazem').value.trim(),
    observacoes: document.getElementById('balsa-observacoes').value.trim(),
    finalidade: document.getElementById('balsa-finalidade').value,
  }

  if (!body.patrimonio) {
    alert('Patrimônio é obrigatório!')
    return
  }

  const res = await apiJson(`${API}/estoque/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    const documentosOk = await enviarDocumentosBalsaPendentes(id)
    alert(documentosOk
      ? 'Balsa atualizada com sucesso!'
      : 'Balsa atualizada, mas algum documento não foi enviado. Confira a lista de documentos.')
    inicializarEstoqueWrapper(finalidadeOrigem)
  } else {
    const err = await res.json()
    alert('Erro ao atualizar balsa: ' + (err.erro || ''))
  }
}

// Wrapper acessível globalmente (usado pelos onclick inline do HTML)
window.inicializarEstoqueWrapper = function (finalidade) {
  inicializarEstoque(finalidade)
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD DE ESTOQUE — Tela Início
// ══════════════════════════════════════════════════════════════════════════

export async function renderizarDashboardEstoque() {
  const container = document.getElementById('inicio')
  if (!container) return

  // Balsas disponíveis não interessa ao Financeiro
  if (perfil === 'financeiro') {
    document.getElementById('painel-estoque-inicio')?.remove()
    return
  }

  let painel = document.getElementById('painel-estoque-inicio')
  if (!painel) {
    painel = document.createElement('div')
    painel.id = 'painel-estoque-inicio'
    painel.style = 'margin-top:20px;'
    container.appendChild(painel)
  }

  painel.innerHTML = `<div style="color:#999; padding:12px;">Carregando estoque de balsas...</div>`

  try {
    const [locacao, venda] = await Promise.all([
      apiDados(`${API}/estoque?finalidade=locacao`, { semAviso: true }),
      apiDados(`${API}/estoque?finalidade=venda`, { semAviso: true })
    ])

    painel.innerHTML = `
      <h5 style="margin-bottom:12px;">Balsas Disponíveis</h5>
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:16px;">
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="color:#999; font-size:12px;">Para Locação</div>
          <div style="font-size:20px; font-weight:700;">${locacao.length}</div>
        </div>
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="color:#999; font-size:12px;">Para Venda</div>
          <div style="font-size:20px; font-weight:700;">${venda.length}</div>
        </div>
      </div>
    `
  } catch {
    painel.innerHTML = ''
  }
}
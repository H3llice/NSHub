import { labelFuncao, TIPOS_CONTRATO } from './funcoes-colaborador.js'

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
// Reabrir folha fechada é exceção — só admin (backend também bloqueia)
const podeReabrirFolha = perfil === 'admin'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']


// Os 3 tópicos da folha, nessa ordem (grupo vem do backend: técnicos N1/N2/N3
// → tecnicos, estagiário → estagiarios, o resto → base)
const GRUPOS = [
  { id: 'base', titulo: 'Funcionários da base' },
  { id: 'tecnicos', titulo: 'Técnicos' },
  { id: 'estagiarios', titulo: 'Estagiários' },
]

// Colunas de valor (R$) editáveis — mesmos nomes dos campos de ItemFolhaPagamento
const CAMPOS_VALOR = [
  { campo: 'descontoPlanoSaude', titulo: 'Desc. plano de saúde' },
  { campo: 'auxilioMoradia', titulo: 'Auxílio moradia' },
  { campo: 'coparticipacaoPlanoSaude', titulo: 'Coparticipação plano' },
  { campo: 'ajudaCusto', titulo: 'Ajuda de custo' },
  { campo: 'premio', titulo: 'Prêmio' },
  { campo: 'comissao', titulo: 'Comissão' },
]

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function formatarMoedaFolha(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const nomeMes = f => `${MESES[f.mes - 1]}/${f.ano}`

// PDF abre em nova aba — sem header Authorization, o token vai na query.
// grupo: '' (folha inteira) ou o id de um dos GRUPOS (base | tecnicos | estagiarios)
function urlPdfFolha(id, grupo = '') {
  const params = new URLSearchParams({ token: localStorage.getItem('ns_token') || '' })
  if (grupo) params.append('grupo', grupo)
  return `${API}/folha-pagamento/${id}/pdf?${params}`
}

function badgeStatusFolha(status) {
  return status === 'fechada'
    ? `<span style="background:#6c757d; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">Fechada</span>`
    : `<span style="background:#fff3cd; color:#997404; padding:2px 8px; border-radius:12px; font-size:12px;">Aberta</span>`
}

// ══════════════════════════════════════════════════════════════════════════
// FOLHA DE PAGAMENTO (Financeiro → Folha de pagamento)
// Uma folha por mês, gerada com o que dá pra puxar sozinho (embarques/dobras,
// desconto do plano de saúde, comissões) — ver routes/folha-pagamento.js
// ══════════════════════════════════════════════════════════════════════════

export async function inicializarFolhaPagamento() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('folhaPagamento').classList.add('active')

  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  document.getElementById('folhaPagamento').innerHTML = `
    <div class="tab">Folha de pagamento</div>
    <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
      <div>
        <label style="font-size:12px;">Mês</label>
        <input type="month" id="folha-novo-mes" class="form-control" value="${mesAtual}">
      </div>
      <button class="btn btn-success" onclick="gerarFolhaPagamento()">+ Nova Folha</button>
    </div>

    <div class="table-scroll" style="margin-top:16px;">
      <table class="table-certificados">
        <thead><tr><th>Mês</th><th>Situação</th><th>Colaboradores</th><th>Gerada por</th><th>Ações</th></tr></thead>
        <tbody id="tabela-folhas">
          <tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `

  const tabela = document.getElementById('tabela-folhas')
  try {
    const folhas = await apiFetch(`${API}/folha-pagamento`).then(r => r.json())
    tabela.innerHTML = folhas.length === 0
      ? `<tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">Nenhuma folha gerada ainda</td></tr>`
      : folhas.map(f => `
        <tr>
          <td><a href="#" onclick="abrirFolhaPagamento(${f.id}); return false;" style="color:var(--acento); font-weight:600; text-decoration:none;">${nomeMes(f)}</a></td>
          <td>${badgeStatusFolha(f.status)}</td>
          <td>${f._count.itens}</td>
          <td>${esc(f.criadoPor?.nome) || '-'}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-info" onclick="abrirFolhaPagamento(${f.id})">Abrir</button>
            <a class="btn btn-sm btn-secondary" href="${urlPdfFolha(f.id)}" target="_blank" title="PDF da folha inteira">PDF</a>
            ${f.status === 'aberta' ? `<button class="btn btn-sm btn-danger" onclick="excluirFolhaPagamento(${f.id})">Excluir</button>` : ''}
          </td>
        </tr>
      `).join('')
  } catch {
    tabela.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>`
  }
}
window.inicializarFolhaPagamento = inicializarFolhaPagamento

window.gerarFolhaPagamento = async function () {
  const valor = document.getElementById('folha-novo-mes').value
  if (!valor) { alert('Escolha o mês!'); return }
  const [ano, mes] = valor.split('-').map(Number)

  const res = await apiJson(`${API}/folha-pagamento`, { method: 'POST', body: JSON.stringify({ mes, ano }) })
  const dados = await res.json()
  if (res.ok) { abrirFolhaPagamento(dados.id); return }

  // Já existe folha do mês — oferece abrir a existente
  if (dados.id && confirm(`${dados.erro}. Abrir a folha existente?`)) abrirFolhaPagamento(dados.id)
  else if (!dados.id) alert('Erro ao gerar folha: ' + (dados.erro || ''))
}

window.excluirFolhaPagamento = async function (id) {
  if (!confirm('Excluir esta folha? Os valores digitados nela serão perdidos.')) return
  const res = await apiFetch(`${API}/folha-pagamento/${id}`, { method: 'DELETE' })
  if (res.ok) inicializarFolhaPagamento()
  else alert('Erro ao excluir folha: ' + ((await res.json()).erro || ''))
}

// ─── Tela da folha ────────────────────────────────────────────────────────────
let folhaAtual = null

window.abrirFolhaPagamento = async function (id) {
  const res = await apiFetch(`${API}/folha-pagamento/${id}`)
  const folha = await res.json()
  if (!res.ok) { alert('Erro ao abrir folha: ' + (folha.erro || '')); return }
  renderizarFolha(folha)
}

function renderizarFolha(folha) {
  // Mantém o filtro escolhido quando a tela é refeita (salvar, atualizar, fechar)
  const filtroAnterior = folhaAtual?.id === folha.id ? (document.getElementById('folha-filtro')?.value || '') : ''
  folhaAtual = folha
  const aberta = folha.status === 'aberta'

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('folhaPagamento').classList.add('active')

  document.getElementById('folhaPagamento').innerHTML = `
    <div style="margin-top:20px;">
      <button class="btn btn-secondary" onclick="inicializarFolhaPagamento()">← Voltar</button>

      <div style="display:flex; align-items:center; gap:12px; margin:20px 0 8px;">
        <h3 style="margin:0;">Folha de pagamento — ${nomeMes(folha)}</h3>
        ${badgeStatusFolha(folha.status)}
      </div>
      <p style="font-size:12px; color:#999; margin:0 0 16px;">
        ${aberta
          ? 'Embarques, dobras, vale-transporte, desconto do plano de saúde, auxílio moradia e comissões vêm preenchidos. "Atualizar dados automáticos" puxa de novo esses dados (e inclui colaboradores novos), sem mexer em coparticipação, ajuda de custo, prêmio e observações. Dias trabalhados é só pra intermitente (o salário dele é por dia): vem preenchido com os dias embarcados e pode ser alterado — depois de alterado à mão, a atualização automática não mexe mais nele.'
          : `Fechada em ${new Date(folha.fechadaEm).toLocaleDateString('pt-BR')} — valores congelados.`}
      </p>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        ${aberta ? `
          <button class="btn btn-success" onclick="salvarFolhaPagamento()">Salvar</button>
          <button class="btn btn-secondary" onclick="atualizarAutomaticosFolha()">Atualizar dados automáticos</button>
          <button class="btn btn-primary" onclick="fecharFolhaPagamento()">Fechar folha</button>
        ` : podeReabrirFolha ? `<button class="btn btn-secondary" onclick="reabrirFolhaPagamento()">Reabrir folha</button>` : ''}
      </div>

      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin:16px 0 4px; padding:12px; background:white; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <div>
          <label style="font-size:12px;">Mostrar</label>
          <select id="folha-filtro" class="form-control form-control-sm" style="min-width:220px;" onchange="aplicarFiltroFolha()">
            <option value="">Folha inteira</option>
            ${GRUPOS.map(g => `<option value="${g.id}" ${g.id === filtroAnterior ? 'selected' : ''}>${g.titulo}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="abrirPdfFolha()">📄 PDF do que está na tela</button>
        <small style="color:#999; flex-basis:100%;">O filtro só muda o que aparece e o que sai no PDF — "Salvar" continua gravando a folha inteira.</small>
      </div>

      ${GRUPOS.map(g => secaoGrupoHtml(g, folha.itens.filter(i => i.grupo === g.id), aberta)).join('')}
    </div>
  `
  window.aplicarFiltroFolha()
  window.atualizarTotaisFolha()
}

// O filtro é a mesma divisão da página (os GRUPOS): mostra só a seção escolhida.
// As outras ficam escondidas, não removidas — o que foi digitado nelas continua
// na tela e é salvo normalmente.
window.aplicarFiltroFolha = function () {
  const grupo = document.getElementById('folha-filtro')?.value || ''
  document.querySelectorAll('.folha-secao').forEach(secao => {
    secao.style.display = !grupo || secao.dataset.grupo === grupo ? '' : 'none'
  })
}

// PDF do grupo que está na tela (ou da folha inteira, sem filtro). O PDF sai do que está gravado, então com a
// folha aberta salva antes — senão valores recém-digitados ficariam de fora.
window.abrirPdfFolha = async function () {
  const grupo = document.getElementById('folha-filtro')?.value || ''
  // A aba é aberta já no clique: aberta depois do await, o navegador bloquearia como pop-up
  const aba = window.open('', '_blank')

  if (folhaAtual.status === 'aberta') {
    const folha = await salvarItensFolha()
    if (!folha) { aba?.close(); return }
    folhaAtual = folha
  }

  const url = urlPdfFolha(folhaAtual.id, grupo)
  if (aba) aba.location = url
  else window.location.href = url
}

function secaoGrupoHtml(grupo, itens, aberta) {
  const dis = aberta ? '' : 'disabled'
  const inputValor = (item, campo) => `
    <input type="number" class="form-control form-control-sm folha-valor" data-item="${item.id}" data-campo="${campo}"
      min="0" step="0.01" value="${item[campo] ?? ''}" style="width:110px;" oninput="atualizarTotaisFolha()" ${dis}>
  `

  return `
    <div class="folha-secao" data-grupo="${grupo.id}">
    <h5 style="margin:24px 0 10px;">${grupo.titulo} <small style="color:#999; font-weight:400;">(${itens.length})</small></h5>
    ${itens.length === 0 ? '<p style="color:#999; font-size:13px;">Nenhum colaborador neste grupo.</p>' : `
    <div class="table-scroll">
      <table class="table-certificados" style="font-size:13px;">
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Embarcado</th>
            <th>Dobras</th>
            <th title="Só para intermitente (salário por dia). Vem com os dias embarcados e pode ser alterado.">Dias trabalhados</th>
            <th>Vale-transporte</th>
            ${CAMPOS_VALOR.map(c => `<th>${c.titulo}</th>`).join('')}
            <th>Observações</th>
          </tr>
        </thead>
        <tbody>
          ${itens.map(i => `
            <tr>
              <td style="white-space:nowrap;"><strong>${esc(i.nome)}</strong><br><small style="color:#999;">${esc(labelFuncao(i.funcao))}${i.tipoContrato ? ` · ${TIPOS_CONTRATO[i.tipoContrato] || esc(i.tipoContrato)}` : ''}</small></td>
              <td style="min-width:180px;">
                ${i.diasEmbarcados > 0
                  ? `${esc(i.embarques)}<br><small style="color:#999;">${i.diasEmbarcados} ${i.diasEmbarcados === 1 ? 'dia' : 'dias'}</small>`
                  : '<span style="color:#999;">-</span>'}
              </td>
              <td style="text-align:center;">${i.diasDobra > 0 ? `<strong style="color:#dc3545;">${i.diasDobra}</strong>` : '0'}</td>
              <td style="text-align:center;">
                ${i.tipoContrato === 'intermitente'
                  ? `<input type="number" class="form-control form-control-sm folha-dias" data-item="${i.id}" min="0" max="31" step="1" value="${i.diasTrabalhados ?? ''}" style="width:80px; margin:0 auto;" oninput="atualizarTotaisFolha()" ${dis}>`
                  : '<span style="color:#999;">-</span>'}
              </td>
              <td style="text-align:center;">${i.valeTransporte ? 'Sim' : 'Não'}</td>
              ${CAMPOS_VALOR.map(c => `<td>${inputValor(i, c.campo)}</td>`).join('')}
              <td><input type="text" class="form-control form-control-sm folha-obs" data-item="${i.id}" value="${esc(i.observacoes)}" style="min-width:140px;" ${dis}></td>
            </tr>
          `).join('')}
          <tr style="background:#f8f9fa; font-weight:600;">
            <td>Total</td>
            <td></td>
            <td style="text-align:center;">${itens.reduce((s, i) => s + i.diasDobra, 0)}</td>
            <td style="text-align:center;" class="folha-total-dias" data-grupo="${grupo.id}"></td>
            <td style="text-align:center;">${itens.filter(i => i.valeTransporte).length}</td>
            ${CAMPOS_VALOR.map(c => `<td class="folha-total" data-grupo="${grupo.id}" data-campo="${c.campo}"></td>`).join('')}
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>`}
    </div>
  `
}

// Totais por grupo/coluna, recalculados a cada digitação
window.atualizarTotaisFolha = function () {
  const grupoDoItem = new Map(folhaAtual.itens.map(i => [String(i.id), i.grupo]))
  const somas = {}
  document.querySelectorAll('.folha-valor').forEach(el => {
    const chave = `${grupoDoItem.get(el.dataset.item)}|${el.dataset.campo}`
    somas[chave] = (somas[chave] || 0) + (parseFloat(el.value) || 0)
  })
  document.querySelectorAll('.folha-total').forEach(el => {
    el.textContent = formatarMoedaFolha(somas[`${el.dataset.grupo}|${el.dataset.campo}`])
  })

  // Dias trabalhados (só intermitentes têm o campo) — "-" no grupo sem nenhum
  const dias = {}
  document.querySelectorAll('.folha-dias').forEach(el => {
    const grupo = grupoDoItem.get(el.dataset.item)
    dias[grupo] = (dias[grupo] || 0) + (parseInt(el.value) || 0)
  })
  document.querySelectorAll('.folha-total-dias').forEach(el => {
    el.textContent = dias[el.dataset.grupo] ?? '-'
  })
}

function lerItensDaTela() {
  const porItem = new Map()
  const item = id => {
    if (!porItem.has(id)) porItem.set(id, { id: Number(id) })
    return porItem.get(id)
  }
  document.querySelectorAll('.folha-valor').forEach(el => { item(el.dataset.item)[el.dataset.campo] = el.value })
  document.querySelectorAll('.folha-dias').forEach(el => { item(el.dataset.item).diasTrabalhados = el.value })
  document.querySelectorAll('.folha-obs').forEach(el => { item(el.dataset.item).observacoes = el.value })
  return [...porItem.values()]
}

// Salva o que foi digitado; retorna a folha atualizada ou null (já avisando)
async function salvarItensFolha() {
  const res = await apiJson(`${API}/folha-pagamento/${folhaAtual.id}/itens`, { method: 'PUT', body: JSON.stringify({ itens: lerItensDaTela() }) })
  const dados = await res.json()
  if (!res.ok) { alert('Erro ao salvar folha: ' + (dados.erro || '')); return null }
  return dados
}

window.salvarFolhaPagamento = async function () {
  const folha = await salvarItensFolha()
  if (!folha) return
  renderizarFolha(folha)
  alert('Folha salva!')
}

window.atualizarAutomaticosFolha = async function () {
  if (!confirm('Puxar de novo embarques, dobras, vale-transporte, desconto do plano de saúde, auxílio moradia e comissões? Se você editou desconto do plano, auxílio moradia ou comissão à mão, eles voltam pro valor do cadastro/vendas. Dias trabalhados que você alterou à mão são mantidos.')) return
  // Salva antes pra não perder coparticipação/ajuda/prêmio digitados agora
  if (!(await salvarItensFolha())) return

  const res = await apiFetch(`${API}/folha-pagamento/${folhaAtual.id}/atualizar`, { method: 'POST' })
  const dados = await res.json()
  if (!res.ok) { alert('Erro ao atualizar: ' + (dados.erro || '')); return }
  renderizarFolha(dados)
}

window.fecharFolhaPagamento = async function () {
  if (!confirm(`Fechar a folha de ${nomeMes(folhaAtual)}? Os valores ficam congelados${podeReabrirFolha ? '' : ' (só um admin consegue reabrir)'}.`)) return
  if (!(await salvarItensFolha())) return

  const res = await apiFetch(`${API}/folha-pagamento/${folhaAtual.id}/fechar`, { method: 'POST' })
  const dados = await res.json()
  if (!res.ok) { alert('Erro ao fechar folha: ' + (dados.erro || '')); return }
  renderizarFolha(dados)
}

window.reabrirFolhaPagamento = async function () {
  if (!confirm('Reabrir esta folha pra edição?')) return
  const res = await apiFetch(`${API}/folha-pagamento/${folhaAtual.id}/reabrir`, { method: 'POST' })
  const dados = await res.json()
  if (!res.ok) { alert('Erro ao reabrir folha: ' + (dados.erro || '')); return }
  renderizarFolha(dados)
}

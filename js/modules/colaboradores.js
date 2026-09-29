import { FUNCOES, labelFuncao } from './funcoes-colaborador.js'

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
// Só admin e gerente editam e veem dados pessoais (CPF, email pessoal, documentos).
// O backend já omite esses campos pros outros perfis — aqui é só a interface.
const podeGerir = ['admin', 'gerente'].includes(perfil)
const tokenAtual = localStorage.getItem('ns_token')

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function formatarCpf(cpf) {
  if (!cpf) return '-'
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

// ══════════════════════════════════════════════════════════════════════════
// COLABORADORES (aba Cadastros → Colaboradores)
// ══════════════════════════════════════════════════════════════════════════

let colaboradoresCache = []
let paginaAtualColaboradores = 1

export function inicializarColaboradores() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('colaboradores').classList.add('active')

  const colunas = podeGerir ? 5 : 4
  document.getElementById('colaboradores').innerHTML = `
    <div class="tab">Colaboradores</div>
    ${podeGerir ? `<button class="btn btn-success" onclick="abrirFormularioColaborador()">+ Novo Colaborador</button>` : ''}
    <div id="avisos-ferias-colaboradores" style="margin-top:16px;"></div>

    <div class="filtros-grid">
      <div>
        <label style="font-size:12px;">Nome</label>
        <input type="text" id="filtro-colaborador-nome" class="form-control form-control-sm" oninput="carregarColaboradores(1)">
      </div>
      <div>
        <label style="font-size:12px;">Função</label>
        <select id="filtro-colaborador-funcao" class="form-control form-control-sm" onchange="carregarColaboradores(1)">
          <option value="">Todas</option>
          ${Object.entries(FUNCOES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:12px;">Situação</label>
        <select id="filtro-colaborador-ativo" class="form-control form-control-sm" onchange="carregarColaboradores(1)">
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
          <option value="">Todos</option>
        </select>
      </div>
    </div>

    <div class="table-scroll">
      <table class="table-certificados">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Função</th>
            <th>Email corporativo</th>
            ${podeGerir ? '<th>Usuário do sistema</th>' : ''}
            <th>Ações</th>
          </tr>
        </thead>
        <tbody id="tabela-colaboradores">
          <tr><td colspan="${colunas}" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
    <div id="contador-colaboradores" style="margin-top:12px;"></div>
  `

  carregarColaboradores()
  renderizarAvisosFerias(document.getElementById('avisos-ferias-colaboradores'))
}

// ─── Aviso de férias (30 dias antes do início até o fim) — admin/gerente ─────
// Mesmo aviso na página inicial (renderizarDashboardFerias) e no topo de Colaboradores.
const formatarDataUTC = d => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' })

async function renderizarAvisosFerias(painel) {
  if (!painel || !podeGerir) return
  try {
    const avisos = await apiFetch(`${API}/colaboradores/ferias-avisos`).then(r => r.json())
    if (!Array.isArray(avisos) || avisos.length === 0) { painel.innerHTML = ''; return }

    painel.innerHTML = `
      <div style="background:#cfe2ff; border:1px solid #9ec5fe; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <div style="font-weight:700; color:#084298; margin-bottom:10px;">🌴 Férias de colaboradores</div>
        <ul style="list-style:none; padding:0; margin:0;">
          ${avisos.map(a => `
            <li style="padding:6px 0; border-bottom:1px solid #9ec5fe; font-size:13px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
              <span><strong>${esc(a.nome)}</strong> — ${esc(labelFuncao(a.funcao))}</span>
              <span>
                ${formatarDataUTC(a.feriasInicio)} a ${formatarDataUTC(a.feriasFim)} ·
                <strong>${a.emFerias ? `em férias até ${formatarDataUTC(a.feriasFim)}`
                  : `começam em ${a.diasParaInicio} ${a.diasParaInicio === 1 ? 'dia' : 'dias'}`}</strong>
              </span>
            </li>
          `).join('')}
        </ul>
      </div>
    `
  } catch {
    painel.innerHTML = ''
  }
}

export async function renderizarDashboardFerias() {
  const container = document.getElementById('inicio')
  if (!container || !podeGerir) return

  let painel = document.getElementById('painel-ferias-inicio')
  if (!painel) {
    painel = document.createElement('div')
    painel.id = 'painel-ferias-inicio'
    painel.style = 'margin-top:20px;'
    container.appendChild(painel)
  }
  renderizarAvisosFerias(painel)
}

window.carregarColaboradores = async function (pagina = 1) {
  paginaAtualColaboradores = pagina
  const nome = document.getElementById('filtro-colaborador-nome')?.value || ''
  const funcao = document.getElementById('filtro-colaborador-funcao')?.value || ''
  const ativo = document.getElementById('filtro-colaborador-ativo')?.value || ''

  const params = new URLSearchParams()
  if (nome) params.append('nome', nome)
  if (funcao) params.append('funcao', funcao)
  if (ativo) params.append('ativo', ativo)
  params.append('pagina', pagina)

  try {
    const dados = await apiFetch(`${API}/colaboradores?${params}`).then(r => r.json())
    colaboradoresCache = dados.colaboradores || []
    renderizarTabelaColaboradores(colaboradoresCache)

    const contador = document.getElementById('contador-colaboradores')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${dados.total || 0} colaboradores encontrados</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarColaboradores(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarColaboradores(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }
  } catch {
    document.getElementById('tabela-colaboradores').innerHTML = `
      <tr><td colspan="${podeGerir ? 5 : 4}" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

function renderizarTabelaColaboradores(colaboradores) {
  const tabela = document.getElementById('tabela-colaboradores')

  if (colaboradores.length === 0) {
    tabela.innerHTML = `<tr><td colspan="${podeGerir ? 5 : 4}" style="text-align:center; color:#999; padding:30px;">Nenhum colaborador encontrado</td></tr>`
    return
  }

  tabela.innerHTML = colaboradores.map(c => `
    <tr${c.ativo ? '' : ' style="opacity:0.55;"'}>
      <td>${esc(c.nome)}${c.ativo ? '' : ' <small>(inativo)</small>'}</td>
      <td>${esc(labelFuncao(c.funcao))}</td>
      <td>${esc(c.emailCorporativo) || '-'}</td>
      ${podeGerir ? `<td>${esc(c.usuario?.nome) || '-'}</td>` : ''}
      <td>
        <button class="btn btn-sm btn-info" onclick="${podeGerir ? 'editarColaborador' : 'verColaborador'}(${c.id})">
          ${podeGerir ? 'Editar' : 'Ver'}
        </button>
      </td>
    </tr>
  `).join('')
}

// ─── Visualização (perfis sem permissão de edição) ────────────────────────────
window.verColaborador = function (id) {
  const c = colaboradoresCache.find(x => x.id === id)
  if (!c) return

  document.getElementById('colaboradores').innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarColaboradores()">← Voltar</button>
      <h3 style="margin:20px 0;">${esc(c.nome)}</h3>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><span style="color:#999;">Função</span><br><strong>${esc(labelFuncao(c.funcao))}</strong></div>
        <div><span style="color:#999;">Email corporativo</span><br><strong>${esc(c.emailCorporativo) || '-'}</strong></div>
        <div><span style="color:#999;">Situação</span><br><strong>${c.ativo ? 'Ativo' : 'Inativo'}</strong></div>
      </div>
    </div>
  `
}

// ─── Formulário (admin e gerente) ─────────────────────────────────────────────
async function formularioColaboradorHtml(c = {}) {
  // Logins ativos, para vincular o colaborador ao usuário do sistema
  const usuarios = await apiFetch(`${API}/auth/simples`).then(r => r.json()).catch(() => [])
  // Se o login vinculado estiver inativo, ele não vem em /auth/simples — mantém como opção
  if (c.usuario && !usuarios.some(u => u.id === c.usuario.id)) usuarios.push(c.usuario)

  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="grid-column:span 2;"><label>Nome *</label><input type="text" id="colaborador-nome" class="form-control" value="${esc(c.nome)}"></div>
      <div><label>CPF</label><input type="text" id="colaborador-cpf" class="form-control" value="${c.cpf ? formatarCpf(c.cpf) : ''}" placeholder="000.000.000-00"></div>
      <div>
        <label>Função *</label>
        <select id="colaborador-funcao" class="form-control">
          <option value="">Selecione...</option>
          ${Object.entries(FUNCOES).map(([v, t]) => `<option value="${v}" ${c.funcao === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div><label>Email pessoal</label><input type="email" id="colaborador-emailPessoal" class="form-control" value="${esc(c.emailPessoal)}"></div>
      <div><label>Email corporativo</label><input type="email" id="colaborador-emailCorporativo" class="form-control" value="${esc(c.emailCorporativo)}"></div>
      <div><label>Salário (R$/mês) *</label><input type="number" id="colaborador-salario" class="form-control" min="0" step="0.01" value="${c.salario ?? ''}"></div>
      <div>
        <label>Desconto do plano de saúde (R$/mês)</label>
        <input type="number" id="colaborador-descontoPlanoSaude" class="form-control" min="0" step="0.01" value="${c.descontoPlanoSaude ?? ''}" placeholder="Vazio = sem plano">
        <small style="color:#999;">Puxado automaticamente na Folha de pagamento.</small>
      </div>
      <div style="padding-top:24px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="colaborador-descontoValeTransporte" ${c.descontoValeTransporte ? 'checked' : ''}>
          <label for="colaborador-descontoValeTransporte" style="margin:0;">Descontar vale-transporte</label>
        </div>
        <small style="color:#999;">Desconta 6% do salário. Aparece na Folha de pagamento.</small>
      </div>
      <div>
        <label>Usuário do sistema</label>
        <select id="colaborador-usuarioId" class="form-control">
          <option value="">Sem login vinculado</option>
          ${usuarios.map(u => `<option value="${u.id}" ${c.usuario?.id === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}
        </select>
        <small style="color:#999;">O que esse login registrar (vendas, OS…) conta para o colaborador.</small>
      </div>
      <div style="padding-top:24px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="colaborador-ativo" ${c.ativo === false ? '' : 'checked'}>
          <label for="colaborador-ativo" style="margin:0;">Ativo</label>
        </div>
        <small style="color:#999;">Desmarcar também desativa o login vinculado.</small>
      </div>
      <div></div>
      <div><label>Início das férias</label><input type="date" id="colaborador-feriasInicio" class="form-control" value="${c.feriasInicio ? c.feriasInicio.slice(0, 10) : ''}"></div>
      <div>
        <label>Fim das férias</label><input type="date" id="colaborador-feriasFim" class="form-control" value="${c.feriasFim ? c.feriasFim.slice(0, 10) : ''}">
        <small style="color:#999;">Aviso na página inicial 30 dias antes do início.</small>
      </div>
    </div>
  `
}

function lerFormularioColaborador() {
  return {
    nome: document.getElementById('colaborador-nome').value.trim(),
    cpf: document.getElementById('colaborador-cpf').value.replace(/\D/g, ''),
    funcao: document.getElementById('colaborador-funcao').value,
    emailPessoal: document.getElementById('colaborador-emailPessoal').value.trim(),
    emailCorporativo: document.getElementById('colaborador-emailCorporativo').value.trim(),
    descontoPlanoSaude: document.getElementById('colaborador-descontoPlanoSaude').value,
    salario: document.getElementById('colaborador-salario').value,
    descontoValeTransporte: document.getElementById('colaborador-descontoValeTransporte').checked,
    feriasInicio: document.getElementById('colaborador-feriasInicio').value,
    feriasFim: document.getElementById('colaborador-feriasFim').value,
    usuarioId: document.getElementById('colaborador-usuarioId').value || null,
    ativo: document.getElementById('colaborador-ativo').checked,
  }
}

function secaoDocumentosHtml(documentos) {
  const salvos = documentos?.length > 0
    ? documentos.map(d => `
        <li style="padding: 6px 0; border-bottom: 1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
          <a href="${API}/colaboradores/documentos/${d.id}/arquivo?token=${tokenAtual}" target="_blank">📄 ${esc(d.titulo)}</a>
          <button class="btn btn-sm btn-danger" onclick="removerDocumentoColaborador(${d.id}, this)">✕</button>
        </li>
      `).join('')
    : documentos ? '<li style="color:#999; padding: 6px 0;">Nenhum documento</li>' : ''

  return `
    <div style="margin-top: 24px;">
      <h5>Documentos</h5>
      <ul id="lista-documentos-salvos" style="padding: 0; list-style: none; margin-bottom: 12px;">${salvos}</ul>
      <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items:end;">
        <div>
          <label>Título</label>
          <input type="text" id="documento-titulo" class="form-control" placeholder="Ex.: RG, Contrato de trabalho, ASO">
        </div>
        <div>
          <label>Arquivo (PDF)</label>
          <input type="file" id="documento-arquivo" class="form-control" accept="application/pdf">
        </div>
        <button type="button" class="btn btn-secondary" onclick="adicionarDocumentoPendente()">+ Adicionar</button>
      </div>
      <ul id="lista-documentos-pendentes" style="margin-top: 12px; padding: 0; list-style: none;"></ul>
    </div>
  `
}

// Documentos escolhidos no formulário mas ainda não enviados — sobem ao salvar
let documentosPendentes = []
// Situação do colaborador ao abrir o formulário — o aviso de desativar o login
// só aparece quando ele passa de ativo para inativo
let estavaAtivo = true

window.adicionarDocumentoPendente = function () {
  const titulo = document.getElementById('documento-titulo').value.trim()
  const input = document.getElementById('documento-arquivo')
  const arquivo = input.files[0]

  if (!titulo) { alert('Informe um título para o documento!'); return }
  if (!arquivo) { alert('Selecione um arquivo!'); return }
  if (arquivo.type !== 'application/pdf') { alert('Só são aceitos arquivos PDF.'); return }

  documentosPendentes.push({ titulo, arquivo })

  const li = document.createElement('li')
  li.style = 'padding: 6px 0; border-bottom: 1px solid #eee; display:flex; justify-content:space-between;'
  li.innerHTML = `
    <span>📎 ${esc(titulo)} <small style="color:#999">(${esc(arquivo.name)} — será enviado ao salvar)</small></span>
    <button class="btn btn-sm btn-danger" onclick="removerDocumentoPendente(${documentosPendentes.length - 1}, this)">✕</button>
  `
  document.getElementById('lista-documentos-pendentes').appendChild(li)
  document.getElementById('documento-titulo').value = ''
  input.value = ''
}

window.removerDocumentoPendente = function (index, btn) {
  documentosPendentes[index] = null
  btn.closest('li').remove()
}

async function enviarDocumentosPendentes(colaboradorId) {
  const pendentes = documentosPendentes.filter(d => d !== null)
  const resultados = await Promise.all(pendentes.map(d => {
    const formData = new FormData()
    formData.append('titulo', d.titulo)
    formData.append('arquivo', d.arquivo)
    return apiFetch(`${API}/colaboradores/${colaboradorId}/documentos`, { method: 'POST', body: formData })
  }))
  documentosPendentes = []
  return resultados.every(r => r.ok)
}

window.removerDocumentoColaborador = async function (id, btn) {
  if (!confirm('Remover este documento? O arquivo será apagado.')) return
  const res = await apiFetch(`${API}/colaboradores/documentos/${id}`, { method: 'DELETE' })
  if (res.ok) btn.closest('li').remove()
  else alert('Erro ao remover documento')
}

window.abrirFormularioColaborador = async function () {
  documentosPendentes = []
  estavaAtivo = true
  document.getElementById('colaboradores').innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarColaboradores()">← Voltar</button>
      <h3 style="margin:20px 0;">Novo Colaborador</h3>
      ${await formularioColaboradorHtml()}
      ${secaoDocumentosHtml(null)}
      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarColaborador()">Salvar</button>
    </div>
  `
}

window.editarColaborador = async function (id) {
  documentosPendentes = []
  const c = await apiFetch(`${API}/colaboradores/${id}`).then(r => r.json())
  estavaAtivo = c.ativo

  document.getElementById('colaboradores').innerHTML = `
    <div style="margin-top:20px; max-width:700px;">
      <button class="btn btn-secondary" onclick="inicializarColaboradores()">← Voltar</button>
      <h3 style="margin:20px 0;">Editar Colaborador</h3>
      ${await formularioColaboradorHtml(c)}
      ${secaoDocumentosHtml(c.documentos || [])}
      <button type="button" class="btn btn-success" style="margin-top:20px;" onclick="salvarColaborador(${id})">Salvar Alterações</button>
    </div>
  `
}

// Sem id = cadastro novo; com id = edição
window.salvarColaborador = async function (id) {
  const body = lerFormularioColaborador()
  if (!body.nome) { alert('Nome é obrigatório!'); return }
  if (estavaAtivo && !body.ativo && body.usuarioId &&
    !confirm('Colaborador inativo: o login vinculado também será desativado e a pessoa não conseguirá mais entrar no sistema. Continuar?')) return
  if (!body.funcao) { alert('Selecione a função!'); return }
  if (!(parseFloat(body.salario) > 0)) { alert('Informe o salário!'); return }
  if (!body.feriasInicio !== !body.feriasFim) { alert('Informe início e fim das férias (ou deixe os dois vazios)!'); return }
  if (body.feriasInicio && body.feriasFim < body.feriasInicio) { alert('O fim das férias não pode ser antes do início!'); return }
  if (body.cpf && body.cpf.length !== 11) { alert('CPF deve ter 11 dígitos.'); return }

  const res = await apiJson(id ? `${API}/colaboradores/${id}` : `${API}/colaboradores`, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    alert('Erro: ' + (err.erro || 'Falha ao salvar'))
    return
  }

  const colaborador = await res.json()
  const documentosOk = await enviarDocumentosPendentes(colaborador.id)
  alert(documentosOk
    ? 'Colaborador salvo com sucesso!'
    : 'Colaborador salvo, mas algum documento não foi enviado. Confira a lista de documentos.')
  inicializarColaboradores()
}

window.novoRegistroColaborador = function (event) {
  event.preventDefault()
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('colaboradores').classList.add('active')
  abrirFormularioColaborador()
  document.getElementById('novo-registro-dropdown').classList.remove('show')
}

// Exposta em window para funcionar em onclick inline (ex: botão "Voltar")
window.inicializarColaboradores = inicializarColaboradores

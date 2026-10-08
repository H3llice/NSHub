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

// O log guarda método + rota (ver backend/middleware/auditoria.js) — aqui vira
// um verbo legível. O último trecho da rota costuma dizer a ação específica
// (marcar-pago, devolucao, restaurar...), então aparece junto.
const ACAO_POR_METODO = { POST: 'Criou / executou', PUT: 'Alterou', PATCH: 'Alterou', DELETE: 'Removeu / cancelou' }
const COR_POR_METODO = { POST: '#198754', PUT: '#0d6efd', PATCH: '#0d6efd', DELETE: '#dc3545' }

// ===== RENDERIZA A PÁGINA (Cadastros → Auditoria, só admin) ===================
export function inicializarAuditoria() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  const container = document.getElementById('auditoria')
  container.classList.add('active')

  container.innerHTML = `
    <div class="tab">Auditoria</div>
    <p style="font-size:13px; color:#999;">Registro de quem criou, alterou ou removeu dados no sistema.</p>

    <div class="filtros-grid" style="margin-bottom: 8px;">
      <div>
        <label style="font-size:12px;">Área</label>
        <select id="filtro-auditoria-entidade" class="form-control form-control-sm" onchange="carregarAuditoria(1)">
          <option value="">Todas</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;">Nº do registro (id)</label>
        <input type="number" id="filtro-auditoria-entidadeId" class="form-control form-control-sm" onchange="carregarAuditoria(1)">
      </div>
      <div>
        <label style="font-size:12px;">Usuário</label>
        <select id="filtro-auditoria-usuario" class="form-control form-control-sm" onchange="carregarAuditoria(1)">
          <option value="">Todos</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;">De</label>
        <input type="date" id="filtro-auditoria-de" class="form-control form-control-sm" onchange="carregarAuditoria(1)">
      </div>
      <div>
        <label style="font-size:12px;">Até</label>
        <input type="date" id="filtro-auditoria-ate" class="form-control form-control-sm" onchange="carregarAuditoria(1)">
      </div>
    </div>

    <div class="table-scroll">
      <table class="table-certificados">
        <thead>
          <tr>
            <th>Data / hora</th>
            <th>Usuário</th>
            <th>Ação</th>
            <th>Onde</th>
            <th>Dados enviados</th>
          </tr>
        </thead>
        <tbody id="tabela-auditoria">
          <tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
    <div id="contador-auditoria" style="margin-top:12px;"></div>
  `

  carregarUsuariosFiltro()
  carregarAuditoria(1)
}

async function carregarUsuariosFiltro() {
  try {
    const usuarios = await apiFetch(`${API}/auth/simples`).then(r => r.json())
    const select = document.getElementById('filtro-auditoria-usuario')
    if (!select) return
    select.innerHTML = '<option value="">Todos</option>' +
      usuarios.map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')
  } catch {
    // filtro de usuário é opcional — a lista carrega sem ele
  }
}

window.carregarAuditoria = async function (pagina = 1) {
  const valor = id => document.getElementById(id)?.value || ''
  const params = new URLSearchParams({ pagina })
  const filtros = {
    entidade: valor('filtro-auditoria-entidade'),
    entidadeId: valor('filtro-auditoria-entidadeId'),
    usuarioId: valor('filtro-auditoria-usuario'),
    de: valor('filtro-auditoria-de'),
    ate: valor('filtro-auditoria-ate'),
  }
  for (const [chave, v] of Object.entries(filtros)) if (v) params.append(chave, v)

  const tabela = document.getElementById('tabela-auditoria')

  try {
    const res = await apiFetch(`${API}/auditoria?${params}`)
    if (!res.ok) throw new Error()
    const dados = await res.json()

    // Opções de "Área" vêm do que já existe no log; preserva a escolha atual
    const selectEntidade = document.getElementById('filtro-auditoria-entidade')
    selectEntidade.innerHTML = '<option value="">Todas</option>' +
      dados.entidades.map(e => `<option value="${esc(e)}" ${e === filtros.entidade ? 'selected' : ''}>${esc(e)}</option>`).join('')

    if (dados.registros.length === 0) {
      tabela.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">Nenhum registro encontrado</td></tr>`
    } else {
      tabela.innerHTML = dados.registros.map(r => {
        const trechos = r.rota.split('/').filter(Boolean)
        const ultimo = trechos[trechos.length - 1]
        // Último trecho que não é número nem a própria área = ação específica (marcar-pago, devolucao...)
        const detalhe = trechos.length > 1 && isNaN(Number(ultimo)) ? ` (${esc(ultimo)})` : ''
        const dadosTxt = r.dados ? JSON.stringify(r.dados) : ''

        return `
          <tr>
            <td style="white-space:nowrap;">${new Date(r.criadoEm).toLocaleString('pt-BR')}</td>
            <td>${esc(r.usuarioNome) || '<span style="color:#999;">—</span>'}</td>
            <td><span style="color:${COR_POR_METODO[r.metodo] || '#333'}; font-weight:600;">${ACAO_POR_METODO[r.metodo] || esc(r.metodo)}</span>${detalhe}</td>
            <td>${esc(r.entidade)}${r.entidadeId ? ` nº ${r.entidadeId}` : ''}<br><small style="color:#999;">${esc(r.rota)}</small></td>
            <td style="max-width:360px;">
              ${dadosTxt
            ? `<details><summary style="cursor:pointer; color:var(--acento);">ver</summary><pre style="white-space:pre-wrap; word-break:break-word; font-size:11px; margin:6px 0 0;">${esc(JSON.stringify(r.dados, null, 2))}</pre></details>`
            : '<span style="color:#999;">—</span>'}
            </td>
          </tr>
        `
      }).join('')
    }

    document.getElementById('contador-auditoria').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span>${dados.total} registro(s)</span>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn btn-sm btn-secondary" onclick="carregarAuditoria(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
          <span>Página ${pagina} de ${dados.totalPaginas || 1}</span>
          <button class="btn btn-sm btn-secondary" onclick="carregarAuditoria(${pagina + 1})" ${pagina >= (dados.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
        </div>
      </div>
    `
  } catch {
    tabela.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red; padding:30px;">Erro ao carregar a auditoria</td></tr>`
  }
}

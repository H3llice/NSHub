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

function esc(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const LABEL_PERFIL = { admin: 'Admin', gerente: 'Gerente', usuario: 'Usuário', tecnico: 'Técnico', financeiro: 'Financeiro' }

let usuariosCache = []
let permissoesCatalogo = {}

// ===== RENDERIZA A PÁGINA (Cadastros → Usuários, só admin) ====================
// Por enquanto só as permissões extras de cada usuário — criar usuário e trocar
// perfil/senha continuam pelos scripts de backend/scripts.
export async function inicializarUsuarios() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  const container = document.getElementById('usuarios')
  container.classList.add('active')

  container.innerHTML = `
    <div class="tab">Usuários</div>
    <p style="font-size:13px; color:#999;">
      Permissões extras liberam uma ação para um usuário específico, sem trocar o perfil dele.
      A permissão vale na hora no sistema; os botões aparecem na tela da pessoa depois que ela sair e entrar de novo.
    </p>
    <div class="table-scroll">
      <table>
        <thead id="usuarios-cabecalho"></thead>
        <tbody id="usuarios-tabela"><tr><td style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr></tbody>
      </table>
    </div>
  `

  const [usuarios, permissoes] = await Promise.all([
    apiJson(`${API}/auth`).then(r => r.json()),
    apiJson(`${API}/auth/permissoes`).then(r => r.json())
  ])
  usuariosCache = usuarios
  permissoesCatalogo = permissoes
  renderizarUsuarios()
}

function renderizarUsuarios() {
  const chaves = Object.keys(permissoesCatalogo)
  document.getElementById('usuarios-cabecalho').innerHTML = `
    <tr>
      <th>Nome</th>
      <th>Email</th>
      <th>Perfil</th>
      <th>Situação</th>
      ${chaves.map(k => `<th style="text-align:center;" title="${esc(permissoesCatalogo[k].descricao)}">${esc(permissoesCatalogo[k].descricao)}</th>`).join('')}
    </tr>
  `

  document.getElementById('usuarios-tabela').innerHTML = usuariosCache.map(u => `
    <tr style="${u.ativo ? '' : 'opacity:0.5;'}">
      <td>${esc(u.nome)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(LABEL_PERFIL[u.perfil] || u.perfil)}</td>
      <td>${u.ativo ? 'Ativo' : 'Inativo'}</td>
      ${chaves.map(k => {
        // Perfil que já tem a permissão: caixa marcada e travada, só informativa
        const peloPerfil = permissoesCatalogo[k].perfis.includes(u.perfil)
        return `
          <td style="text-align:center;">
            <input type="checkbox" ${peloPerfil || u.permissoes.includes(k) ? 'checked' : ''} ${peloPerfil ? 'disabled title="Já tem pelo perfil"' : ''}
              onchange="alternarPermissaoUsuario(${u.id}, '${k}', this)">
          </td>
        `
      }).join('')}
    </tr>
  `).join('')
}

window.alternarPermissaoUsuario = async function (id, chave, checkbox) {
  const usuario = usuariosCache.find(u => u.id === id)
  const permissoes = checkbox.checked
    ? [...usuario.permissoes, chave]
    : usuario.permissoes.filter(p => p !== chave)

  checkbox.disabled = true
  const res = await apiJson(`${API}/auth/${id}`, { method: 'PUT', body: JSON.stringify({ permissoes }) })
  checkbox.disabled = false

  if (res.ok) {
    usuario.permissoes = (await res.json()).permissoes
  } else {
    const err = await res.json().catch(() => ({}))
    alert('Erro ao salvar permissão: ' + (err.erro || 'falha'))
    checkbox.checked = !checkbox.checked
  }
}

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

// Aplica o tema salvo no <html data-theme="...">. 'azul' é o padrão (sem atributo).
function aplicarTema(tema) {
  if (tema === 'classico') {
    document.documentElement.setAttribute('data-theme', 'classico')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

// ===== Deixa o nome na topbar clicável e liga o modal de edição de perfil =====
export function inicializarPerfil() {
  const span = document.getElementById('topbar-usuario')
  if (!span) return

  span.style.cursor = 'pointer'
  span.title = 'Editar perfil'
  span.onclick = () => window.abrirModalPerfil()
}

// ===== MODAL — EDITAR PERFIL (nome e tema) =====================================
window.abrirModalPerfil = function () {
  const usuario = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
  if (!usuario) return

  const temaAtual = usuario.tema === 'classico' ? 'classico' : 'azul'

  const modal = document.createElement('div')
  modal.id = 'modal-perfil'
  modal.style = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5);
    display:flex; align-items:center; justify-content:center; z-index:9999;
  `
  modal.innerHTML = `
    <div style="background:white; border-radius:8px; padding:28px; width:420px; max-width:95vw; box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <h4 style="margin:0 0 16px; color:var(--acento);">Editar Perfil</h4>

      <div style="margin-bottom:18px;">
        <label style="font-weight:600; font-size:13px;">Nome</label>
        <input type="text" id="perfil-nome" class="form-control" value="${usuario.nome}" style="margin-top:6px;">
      </div>

      <div style="margin-bottom:8px; font-weight:600; font-size:13px;">Tema</div>
      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:22px;">
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; border:1px solid #ddd; border-radius:6px; padding:10px 12px;">
          <input type="radio" name="perfil-tema" value="azul" ${temaAtual === 'azul' ? 'checked' : ''}>
          <span style="width:16px; height:16px; border-radius:50%; background:#244d69; display:inline-block;"></span>
          Azul (padrão)
        </label>
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; border:1px solid #ddd; border-radius:6px; padding:10px 12px;">
          <input type="radio" name="perfil-tema" value="classico" ${temaAtual === 'classico' ? 'checked' : ''}>
          <span style="width:16px; height:16px; border-radius:50%; background:#158815; display:inline-block;"></span>
          Clássico (verde)
        </label>
      </div>

      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="fecharModalPerfil()">Cancelar</button>
        <button class="btn btn-success" onclick="salvarPerfil()">Salvar</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
}

window.fecharModalPerfil = function () {
  document.getElementById('modal-perfil')?.remove()
}

window.salvarPerfil = async function () {
  const nome = document.getElementById('perfil-nome').value.trim()
  const tema = document.querySelector('input[name="perfil-tema"]:checked')?.value || 'azul'

  if (!nome) {
    alert('Informe seu nome.')
    return
  }

  const res = await apiJson(`${API}/auth/perfil`, {
    method: 'PUT',
    body: JSON.stringify({ nome, tema })
  })

  if (res.ok) {
    const usuarioAtualizado = await res.json()
    const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
    const novoUsuario = { ...usuarioAtual, ...usuarioAtualizado }
    localStorage.setItem('ns_usuario', JSON.stringify(novoUsuario))

    const span = document.getElementById('topbar-usuario')
    if (span) span.textContent = `👤 ${novoUsuario.nome} (${novoUsuario.perfil})`

    aplicarTema(novoUsuario.tema)
    fecharModalPerfil()
  } else {
    const err = await res.json()
    alert('Erro ao atualizar perfil: ' + (err.erro || ''))
  }
}

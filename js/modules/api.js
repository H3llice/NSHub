// Acesso à API — único lugar com o endereço do backend, a sessão expirada e o
// aviso de erro. Todo módulo importa daqui (antes cada um tinha a sua cópia).

// O próprio Express serve o frontend, então a API é a mesma origem da página
// (caminho relativo): funciona igual pelo ngrok, pela rede local ou no próprio
// servidor, sem passar pela internet à toa. A exceção é a página aberta num
// servidor de dev local que não é o backend (Live Server etc.) — aí aponta pro
// de produção, como era antes. Mesma regra no login.html.
const API_PRODUCAO = 'https://override-steerable-professed.ngrok-free.dev'
const devLocal = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '3000'
export const API = devLocal ? API_PRODUCAO : ''

// A tela dispara várias chamadas ao mesmo tempo, e com o token vencido todas
// voltam 401 — sem a trava, cada uma abria o seu alert. Só a primeira avisa e
// redireciona; todas (inclusive ela) ficam pendentes pra sempre em vez de
// rejeitar, senão o .catch de quem chamou mostraria outro alert/aviso de erro
// enquanto a página ainda está indo pro login.
let sessaoExpirada = false

function tratarSessaoExpirada(res) {
  if (res.status === 401) {
    if (!sessaoExpirada) {
      sessaoExpirada = true
      localStorage.removeItem('ns_token')
      localStorage.removeItem('ns_usuario')
      alert('Sua sessão expirou. Faça login novamente.')
      window.location.href = './login.html'
    }
    return new Promise(() => {})
  }
  return res
}

// Devolve a Response crua — quem chama confere res.ok (usado nas gravações,
// que mostram a mensagem de erro do backend no alert)
export async function apiFetch(url, options = {}) {
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

// apiFetch com corpo JSON
export async function apiJson(url, options = {}) {
  return apiFetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
}

// Leitura que já devolve os dados: se o backend respondeu erro (403, 404, 500...)
// mostra a mensagem dele num aviso e rejeita — antes a tela recebia o { erro }
// como se fosse a lista/registro e quebrava calada (tabela vazia, "undefined",
// "Carregando..." pra sempre). `semAviso: true` rejeita sem o aviso, pra quem
// já tem plano B (.catch com valor padrão, painel da tela inicial que some).
export async function apiDados(url, { semAviso = false, ...options } = {}) {
  const res = await apiFetch(url, options)
  const dados = await res.json().catch(() => null)
  if (res.ok) return dados

  const erro = new Error(dados?.erro || `Erro ${res.status} ao carregar dados do servidor`)
  erro.status = res.status
  if (!semAviso) {
    avisarErro(erro.message)
    erro.avisado = true
  }
  throw erro
}

// Erro que já virou aviso não precisa aparecer de novo como "Uncaught (in promise)"
// no console — quem chamou sem .catch só para ali, que é o comportamento certo
window.addEventListener('unhandledrejection', e => {
  if (e.reason?.avisado) e.preventDefault()
})

// ─── Aviso de erro (canto da tela, some sozinho) ──────────────────────────────
// Não usa alert(): uma tela que carrega várias coisas ao mesmo tempo empilharia
// um alert por chamada. Mensagem repetida enquanto a anterior está na tela não duplica.
const avisosNaTela = new Set()

export function avisarErro(mensagem) {
  if (avisosNaTela.has(mensagem)) return
  avisosNaTela.add(mensagem)

  let pilha = document.getElementById('avisos-erro')
  if (!pilha) {
    pilha = document.createElement('div')
    pilha.id = 'avisos-erro'
    pilha.style = 'position:fixed; right:16px; bottom:16px; z-index:10000; display:flex; flex-direction:column; gap:8px; max-width:min(420px, calc(100vw - 32px));'
    document.body.appendChild(pilha)
  }

  const aviso = document.createElement('div')
  aviso.style = 'background:#dc3545; color:white; padding:10px 14px; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.2); font-size:14px; cursor:pointer;'
  aviso.title = 'Clique para fechar'
  aviso.textContent = mensagem
  const fechar = () => { aviso.remove(); avisosNaTela.delete(mensagem) }
  aviso.onclick = fechar
  setTimeout(fechar, 8000)
  pilha.appendChild(aviso)
}

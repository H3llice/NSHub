// Escapa texto vindo do banco antes de interpolar em template que vai pra
// innerHTML. Sem isso, um nome/descrição com "<img onerror=...>" roda script na
// sessão de quem abre a tela — e o token fica no localStorage.
// Serve pra conteúdo de tag e pra atributo entre aspas (value="..."), mas NÃO
// pra string JS dentro de onclick="f('...')": o navegador desfaz as entidades
// antes de rodar o JS. Nesses casos, passar o id e buscar o resto no JS.
export function esc(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

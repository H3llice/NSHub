import jwt from 'jsonwebtoken'
import { prisma } from '../server.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido no .env — servidor não pode iniciar sem isso.')
}

export function autenticar(req, res, next) {
  // Aceita o token também via query string (?token=) para casos de navegação direta
  // (abrir PDF/anexo em nova aba), onde não dá pra mandar o header Authorization.
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token

  if (!token) {
    return res.status(401).json({ erro: 'Token não fornecido' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.usuario = payload // { id, nome, email, perfil }
    next()
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' })
  }
}

// Permissões que dá pra liberar por usuário, sem trocar o perfil dele — pra
// quem precisa de UMA ação de gerente sem ganhar todas as outras. `perfis` são
// os que já têm a permissão sem precisar marcar nada. A tela de Usuários lista
// este catálogo (GET /auth/permissoes).
export const PERMISSOES = {
  embarques: { descricao: 'Registrar, editar e excluir embarques', perfis: ['admin', 'gerente'] }
}

// Middleware de permissão — uso: exigirPermissao('embarques')
// A permissão extra é lida do banco a cada requisição (não do token): tirar a
// permissão de alguém vale na hora, sem esperar o login de 8h expirar.
export function exigirPermissao(chave) {
  return async (req, res, next) => {
    if (PERMISSOES[chave].perfis.includes(req.usuario?.perfil)) return next()
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario?.id },
      select: { ativo: true, permissoes: true }
    })
    if (usuario?.ativo && usuario.permissoes.includes(chave)) return next()
    return res.status(403).json({ erro: 'Sem permissão para esta ação' })
  }
}

// Middleware de perfil — uso: exigirPerfil('gerente', 'admin')
export function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!perfis.includes(req.usuario?.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para esta ação' })
    }
    next()
  }
}
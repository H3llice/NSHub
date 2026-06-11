import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'nshub-secret-troque-em-producao'

export function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')

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

// Middleware de perfil — uso: exigirPerfil('gerente', 'admin')
export function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!perfis.includes(req.usuario?.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para esta ação' })
    }
    next()
  }
}
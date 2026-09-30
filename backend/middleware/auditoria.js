import jwt from 'jsonwebtoken'
import { prisma } from '../server.js'

// Trilha de auditoria: grava quem fez cada requisição que ALTERA dados
// (POST/PUT/PATCH/DELETE) e terminou com sucesso. Fica num middleware global, e
// não espalhado pelas rotas, pra que rota nova já nasça auditada.

const METODOS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Nunca vão pro log: senhas, tokens e assinaturas (imagem em base64, enorme)
const CAMPOS_OMITIDOS = new Set(['senha', 'senhaAtual', 'novaSenha', 'token', 'assinaturaImg', 'assinaturaCliente'])
const TAMANHO_MAXIMO_TEXTO = 500

function limpar(valor) {
  if (Array.isArray(valor)) return valor.map(limpar)
  if (valor && typeof valor === 'object') {
    const saida = {}
    for (const [chave, v] of Object.entries(valor)) {
      saida[chave] = CAMPOS_OMITIDOS.has(chave) ? '[omitido]' : limpar(v)
    }
    return saida
  }
  if (typeof valor === 'string' && valor.length > TAMANHO_MAXIMO_TEXTO) {
    return valor.slice(0, TAMANHO_MAXIMO_TEXTO) + '…'
  }
  return valor
}

// Quem fez: normalmente o `autenticar` da rota já preencheu req.usuario; o
// fallback lê o token direto pra cobrir rota que altera dado sem passar por ele.
function usuarioDaRequisicao(req) {
  if (req.usuario) return req.usuario
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token
  try {
    return token ? jwt.verify(token, process.env.JWT_SECRET) : null
  } catch {
    return null
  }
}

export function auditoria(req, res, next) {
  if (!METODOS.has(req.method)) return next()

  // originalUrl é capturado agora porque dentro dos routers o req.url é relativo
  const rota = req.originalUrl.split('?')[0]

  // Numa criação (POST /contratos) o id não está na rota — só na resposta.
  // Guarda pra que o log do "criou" fique ligado ao mesmo registro dos "alterou".
  let idCriado = null
  const jsonOriginal = res.json.bind(res)
  res.json = corpo => {
    if (Number.isInteger(corpo?.id)) idCriado = corpo.id
    return jsonOriginal(corpo)
  }

  res.on('finish', () => {
    if (res.statusCode >= 400) return

    const trechos = rota.split('/').filter(Boolean)
    const entidade = trechos[0] || ''
    // Login, reset de senha e webhook não são alteração de dado feita por usuário logado
    if (entidade === 'webhook' || (entidade === 'auth' && ['login', 'esqueci-senha', 'reset_senha'].includes(trechos[1]))) return

    const usuario = usuarioDaRequisicao(req)
    const id = trechos.map(Number).find(n => Number.isInteger(n) && n > 0) ?? idCriado
    const temCorpo = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0

    prisma.logAuditoria.create({
      data: {
        usuarioId: usuario?.id ?? null,
        usuarioNome: usuario?.nome ?? null,
        metodo: req.method,
        rota,
        entidade,
        entidadeId: id ?? null,
        dados: temCorpo ? limpar(req.body) : undefined
      }
    }).catch(err => console.error('⚠️  Falha ao gravar auditoria:', err.message))
  })

  next()
}

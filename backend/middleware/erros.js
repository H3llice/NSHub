import multer from 'multer'
import { Prisma } from '@prisma/client'

// Tratamento de erro global — último middleware do server.js. Pega tudo que
// escapou das rotas (o Express 5 já encaminha pra cá a Promise rejeitada de
// rota async) e sempre responde JSON { erro }, que é o que o frontend lê.
//
// Sem ele valia o handler padrão do Express, que responde HTML — com stack
// trace e caminho de pasta do servidor quando NODE_ENV não é "production" (o
// caso daqui) — e o res.json() do frontend quebrava ao ler isso.
// O detalhe do erro vai só pro log do servidor; o usuário recebe uma mensagem
// genérica (ou específica, quando dá pra saber o que foi).

// Erros conhecidos do Prisma que são culpa do pedido, não do servidor
const ERROS_PRISMA = {
  P2025: [404, 'Registro não encontrado'],
  P2002: [409, 'Já existe um registro com esses dados'],
  P2003: [409, 'Operação recusada: o registro está ligado a outros dados (ou aponta pra um que não existe)']
}

function respostaDoErro(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && ERROS_PRISMA[err.code]) {
    return ERROS_PRISMA[err.code]
  }
  // Ex.: id que não é número (GET /estoque/abc → Number('abc') = NaN)
  if (err instanceof Prisma.PrismaClientValidationError) {
    return [400, 'Dados inválidos na requisição']
  }
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? [413, 'Arquivo maior que o tamanho permitido']
      : [400, 'Envio de arquivo inválido']
  }
  // body-parser (express.json): JSON malformado, corpo grande demais
  if (err.type === 'entity.parse.failed') return [400, 'JSON inválido na requisição']
  if (err.type === 'entity.too.large') return [413, 'Requisição grande demais']
  // Outros erros 4xx marcados como "pode mostrar" (http-errors) — a mensagem
  // deles vem em inglês, então só o status é aproveitado
  if (err.expose && err.status >= 400 && err.status < 500) return [err.status, 'Requisição inválida']

  return [500, 'Erro interno no servidor']
}

// Os 4 parâmetros são obrigatórios: é pela quantidade que o Express reconhece handler de erro
export function tratarErros(err, req, res, next) {
  const [status, mensagem] = respostaDoErro(err)

  // Sem a query string: PDF e anexo mandam o token de login em ?token=
  const rota = `${req.method} ${req.originalUrl.split('?')[0]}`
  const usuario = req.usuario ? ` (usuário ${req.usuario.id})` : ''
  if (status >= 500) {
    console.error(`❌ ${rota}${usuario}:`, err)
  } else {
    // Erro do pedido: uma linha basta. A mensagem do Prisma traz a consulta
    // inteira antes — a última linha é a que diz o que houve ("Argument `id` is missing.")
    const resumo = String(err.message || '').trim().split('\n').filter(l => l.trim()).pop() || ''
    console.warn(`⚠️  ${rota}${usuario} → ${status}: ${resumo.trim()}`)
  }

  // Resposta já começou a sair (ex.: erro no meio de um sendFile) — não dá mais
  // pra mandar JSON; repassa pro Express, que só encerra a conexão
  if (res.headersSent) return next(err)

  res.status(status).json({ erro: mensagem })
}

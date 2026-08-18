import { Router } from 'express'
import crypto from 'crypto'
import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const raizProjeto = path.resolve(__dirname, '..', '..') // backend/routes -> backend -> raiz do projeto

const router = Router()

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET

// ─── Valida a assinatura enviada pelo GitHub ──────────────────────────────────
function assinaturaValida(payload, assinaturaRecebida) {
  if (!WEBHOOK_SECRET || !assinaturaRecebida) return false

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET)
  const digest = 'sha256=' + hmac.update(payload).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(assinaturaRecebida))
  } catch {
    return false // tamanhos diferentes = inválido
  }
}

// Middleware que captura o corpo bruto da requisição (necessário pra validar a assinatura HMAC)
const capturarRawBody = express.raw({ type: 'application/json' })

// ─── Webhook do GitHub ─────────────────────────────────────────────────────────
// Configurar no GitHub: Settings > Webhooks > Payload URL = {BASE_URL}/webhook/deploy
router.post('/deploy', capturarRawBody, (req, res) => {
  const assinatura = req.headers['x-hub-signature-256']
  const payloadBruto = req.body // aqui é um Buffer por causa do express.raw()

  if (!assinaturaValida(payloadBruto, assinatura)) {
    console.warn('⚠️  Webhook recebido com assinatura inválida — ignorado')
    return res.status(401).json({ erro: 'Assinatura inválida' })
  }

  console.log('📦 Webhook do GitHub recebido — iniciando deploy...')
  res.json({ ok: true, mensagem: 'Deploy iniciado' }) // responde rápido, processa o resto depois

  // O restart do pm2 é sempre o ÚLTIMO passo — este handler roda DENTRO do processo nshub,
  // então parar o pm2 antes de terminar o resto do script mataria o próprio script no meio
  // (foi exatamente isso que quebrou um deploy anterior: o npm install/prisma nunca terminavam
  // de rodar porque o processo que os disparou já tinha sido derrubado).
  // `db push` (não `migrate deploy`) porque as migrations não são versionadas neste repo;
  // sem --accept-data-loss, se algum dia uma mudança de schema for destrutiva, o push falha
  // e só isso — não apaga dado nenhum sozinho.
  const comando = `cd "${raizProjeto}"; git pull; cd backend; npm install; npx prisma db push; pm2 restart nshub`

  exec(comando, { shell: 'powershell.exe' }, (erro, stdout, stderr) => {
    if (erro) {
      console.error('❌ Erro no deploy automático:', erro.message)
      return
    }
    console.log('✅ Deploy automático concluído:')
    console.log(stdout)
    if (stderr) console.log('stderr:', stderr)
  })
})

export default router
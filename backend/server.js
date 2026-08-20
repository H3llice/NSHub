import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import ocsRouter from './routes/ocs.js'
import solicitacoesRouter from './routes/solicitacoes.js'
import empresasRouter from './routes/empresas.js'
import fornecedoresRouter from './routes/fornecedores.js'
import anexosRouter from './routes/anexos.js'
import pdfRouter from './routes/pdf.js'
import authRouter from './routes/auth.js'
import { autenticar } from './middleware/auth.js'
import webhookRouter from './routes/webhook.js'
import estoqueRouter from './routes/estoque.js'
import clientesRouter from './routes/clientes.js'
import contratosRouter from './routes/contratos.js'
import vendasRouter from './routes/vendas.js'
import pagamentosRouter from './routes/pagamentos.js'
import almoxarifadoRouter from './routes/almoxarifado.js'
import { notificarPagamentoAtrasado } from './email.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const prisma = new PrismaClient()

app.use(cors())

// ─── Webhook do GitHub ──────────────────────────────────────────────────────────
// Precisa vir ANTES do express.json() global, porque o webhook usa seu próprio
// middleware de raw body (necessário para validar a assinatura HMAC do GitHub)
app.use('/webhook', webhookRouter)

app.use(express.json())

// ─── Serve o frontend (html, css, js) a partir do backend ────────────────────
const raizProjeto = path.resolve(__dirname, '..')

app.use('/html', express.static(path.join(raizProjeto, 'html')))
app.use('/css', express.static(path.join(raizProjeto, 'css')))
app.use('/js', express.static(path.join(raizProjeto, 'js')))

app.get('/', (req, res) => {
  res.redirect('/html/login.html')
})

// ─── Rotas da API ──────────────────────────────────────────────────────────────
app.use('/auth', authRouter)
app.use('/empresas', empresasRouter)
app.use('/fornecedores', fornecedoresRouter)
app.use('/anexos', anexosRouter)
app.use('/uploads', autenticar, express.static('uploads'))
app.use('/pdf', pdfRouter)
app.use('/ocs', ocsRouter)
app.use('/solicitacoes', solicitacoesRouter)
app.use('/estoque', estoqueRouter)
app.use('/clientes', clientesRouter)
app.use('/contratos', contratosRouter)
app.use('/vendas', vendasRouter)
app.use('/pagamentos', pagamentosRouter)
app.use('/almoxarifado', almoxarifadoRouter)

app.get('/api', (req, res) => {
  res.json({ mensagem: 'API do Portal NS funcionando!' })
})

// Roda a cada 24h e deleta OCs canceladas há mais de 30 dias
setInterval(async () => {
  const limite = new Date()
  limite.setDate(limite.getDate() - 30)

  const antigas = await prisma.ordemCompra.findMany({
    where: { status: 'cancelada', canceladoEm: { lt: limite } },
    include: { anexos: true }
  })

  for (const oc of antigas) {
    await prisma.itemOC.deleteMany({ where: { ocId: oc.id } })
    await prisma.anexo.deleteMany({ where: { ocId: oc.id } })
    await prisma.ordemCompra.delete({ where: { id: oc.id } })
  }

  if (antigas.length > 0) {
    console.log(`🗑️ ${antigas.length} OCs canceladas deletadas permanentemente`)
  }
}, 24 * 60 * 60 * 1000)

setInterval(async () => {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  // ── Marca como atrasado e envia email (só na primeira vez) ──────────────────
  const vencidos = await prisma.pagamento.findMany({
    where: { status: 'pendente', dataVencimento: { lt: hoje } },
    include: { contrato: { include: { cliente: true } } }
  })

  for (const p of vencidos) {
    await prisma.pagamento.update({
      where: { id: p.id },
      data: { status: 'atrasado' }
    })

    if (!p.alertaEnviado) {
      try {
        await notificarPagamentoAtrasado(p)
        await prisma.pagamento.update({
          where: { id: p.id },
          data: { alertaEnviado: true }
        })
      } catch (err) {
        console.error('⚠️  Falha ao enviar aviso de atraso:', err.message)
      }
    }
  }

  // ── Gera a próxima parcela dos contratos mensais ativos ─────────────────────
  const contratosMensais = await prisma.contrato.findMany({
    where: { status: 'ativo', periodicidadePagamento: 'mensal' },
    include: { pagamentos: { orderBy: { dataVencimento: 'desc' }, take: 1 } }
  })

  for (const c of contratosMensais) {
    const ultimaParcela = c.pagamentos[0]
    if (!ultimaParcela) continue

    const proximoVencimento = new Date(ultimaParcela.dataVencimento)
    proximoVencimento.setMonth(proximoVencimento.getMonth() + 1)

    // Só cria a próxima parcela quando estiver a 5 dias ou menos do vencimento
    const antecedencia = new Date(proximoVencimento)
    antecedencia.setDate(antecedencia.getDate() - 5)

    if (hoje >= antecedencia) {
      const jaExiste = await prisma.pagamento.findFirst({
        where: { contratoId: c.id, dataVencimento: proximoVencimento.toISOString().split('T')[0] }
      })
      if (jaExiste) continue

      // Frete só entra na 1ª fatura (criada junto com o contrato) — as parcelas
      // seguintes cobram só o valor recorrente (balsas - desconto), sem o frete.
      await prisma.pagamento.create({
        data: {
          contratoId: c.id,
          valor: (c.valor || 0) - (c.frete || 0),
          dataVencimento: proximoVencimento.toISOString(),
          referencia: `${String(proximoVencimento.getMonth() + 1).padStart(2, '0')}/${proximoVencimento.getFullYear()}`
        }
      })
      console.log(`💰 Nova parcela gerada — Contrato ${c.numero}.${c.ano}`)
    }
  }

  if (vencidos.length > 0) {
    console.log(`⚠️  ${vencidos.length} pagamento(s) marcado(s) como atrasado(s)`)
  }
}, 24 * 60 * 60 * 1000)


const PORT = 3000
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})

export { prisma }
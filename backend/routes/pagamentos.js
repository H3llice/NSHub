import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ─── Listar pagamentos (com filtros) ───────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { status, contratoId } = req.query

  const where = {}
  if (status) where.status = status
  if (contratoId) where.contratoId = parseInt(contratoId)

  const pagamentos = await prisma.pagamento.findMany({
    where,
    include: {
      contrato: { include: { cliente: true, balsas: { include: { balsa: true } } } }
    },
    orderBy: { dataVencimento: 'asc' }
  })

  res.json(pagamentos)
})

// ─── Dashboard de contas a receber ─────────────────────────────────────────────
router.get('/dashboard', autenticar, async (req, res) => {
  const [pendentes, atrasados, pagos30dias] = await Promise.all([
    prisma.pagamento.findMany({
      where: { status: 'pendente' },
      include: { contrato: { include: { cliente: true } } }
    }),
    prisma.pagamento.findMany({
      where: { status: 'atrasado' },
      include: { contrato: { include: { cliente: true } } }
    }),
    prisma.pagamento.findMany({
      where: {
        status: 'pago',
        dataPagamento: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }
    })
  ])

  const totalAReceber = [...pendentes, ...atrasados].reduce((acc, p) => acc + p.valor, 0)
  const totalAtrasado = atrasados.reduce((acc, p) => acc + p.valor, 0)
  const totalRecebido30dias = pagos30dias.reduce((acc, p) => acc + p.valor, 0)

  const proximosVencimentos = pendentes
    .sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento))
    .slice(0, 10)

  res.json({
    totalAReceber,
    totalAtrasado,
    totalRecebido30dias,
    qtdPendentes: pendentes.length,
    qtdAtrasados: atrasados.length,
    proximosVencimentos,
    atrasados
  })
})

// ─── Marcar pagamento como pago (só admin e financeiro) ────────────────────────
router.post('/:id/marcar-pago', autenticar, exigirPerfil('admin', 'financeiro'), async (req, res) => {
  const id = Number(req.params.id)
  const { dataPagamento } = req.body

  const pagamento = await prisma.pagamento.findUnique({ where: { id } })
  if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado' })

  const atualizado = await prisma.pagamento.update({
    where: { id },
    data: {
      status: 'pago',
      dataPagamento: dataPagamento ? new Date(dataPagamento).toISOString() : new Date().toISOString()
    }
  })

  res.json(atualizado)
})

// ─── Reverter pagamento pra pendente (caso tenha marcado errado) ──────────────
router.post('/:id/reverter', autenticar, exigirPerfil('admin', 'financeiro'), async (req, res) => {
  const id = Number(req.params.id)

  const atualizado = await prisma.pagamento.update({
    where: { id },
    data: { status: 'pendente', dataPagamento: null, alertaEnviado: false }
  })

  res.json(atualizado)
})

export default router
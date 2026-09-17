import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ─── Listar pagamentos (com filtros, paginado) ─────────────────────────────────
router.get('/', autenticar, async (req, res) => {
    const { status, contratoId, busca, vencimentoDe, vencimentoAte, pagina = 1 } = req.query
    const porPagina = 50
    const paginaNum = parseInt(pagina)

    const where = {}
    if (status) where.status = status
    if (contratoId) where.contratoId = parseInt(contratoId)
    if (vencimentoDe || vencimentoAte) {
        where.dataVencimento = {}
        if (vencimentoDe) where.dataVencimento.gte = new Date(vencimentoDe)
        if (vencimentoAte) where.dataVencimento.lte = new Date(vencimentoAte + 'T23:59:59')
    }
    if (busca) {
        where.OR = [
            { clienteNome: { contains: busca, mode: 'insensitive' } },
            { descricao: { contains: busca, mode: 'insensitive' } },
            { referencia: { contains: busca, mode: 'insensitive' } },
            { contrato: { cliente: { nome: { contains: busca, mode: 'insensitive' } } } },
            { venda: { cliente: { nome: { contains: busca, mode: 'insensitive' } } } },
        ]
    }

    const [pagamentos, total] = await Promise.all([
        prisma.pagamento.findMany({
            where,
            include: {
                contrato: { include: { cliente: true, balsas: { include: { balsa: true } } } },
                venda: { include: { cliente: true, balsas: { include: { balsa: true } } } }
            },
            orderBy: { dataVencimento: 'asc' },
            take: porPagina,
            skip: (paginaNum - 1) * porPagina
        }),
        prisma.pagamento.count({ where })
    ])

    res.json({ pagamentos, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Criar conta avulsa (sem vínculo com contrato) — só admin e financeiro ────
router.post('/', autenticar, exigirPerfil('admin', 'financeiro'), async (req, res) => {
    const { clienteNome, descricao, valor, dataVencimento, referencia } = req.body

    if (!valor || !dataVencimento) {
        return res.status(400).json({ erro: 'Valor e data de vencimento são obrigatórios' })
    }

    const pagamento = await prisma.pagamento.create({
        data: {
            clienteNome: clienteNome || null,
            descricao: descricao || null,
            valor: parseFloat(valor),
            dataVencimento: new Date(dataVencimento).toISOString(),
            referencia: referencia || null
        }
    })

    res.json(pagamento)
})

// ─── Dashboard de contas a receber ─────────────────────────────────────────────
router.get('/dashboard', autenticar, exigirPerfil('admin', 'financeiro'), async (req, res) => {
    const [pendentes, atrasados, pagos30dias] = await Promise.all([
        prisma.pagamento.findMany({
            where: { status: 'pendente' },
            include: { contrato: { include: { cliente: true } }, venda: { include: { cliente: true } } }
        }),
        prisma.pagamento.findMany({
            where: { status: 'atrasado' },
            include: { contrato: { include: { cliente: true } }, venda: { include: { cliente: true } } }
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
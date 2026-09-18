import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { totalLiquidoOrcamento } from './orcamentos.js'

const router = Router()

const FORMAS_PAGAMENTO = ['avista', 'parcelado']
const STATUS_VALIDOS = ['ativo', 'cancelado']

const INCLUDE_PADRAO = {
  orcamento: { include: { itens: { include: { produto: true, servico: true }, orderBy: { id: 'asc' } } } },
  cliente: true,
  vendedor: { select: { id: true, nome: true } },
  criadoPor: { select: { id: true, nome: true } },
  pagamentos: { orderBy: { dataVencimento: 'asc' } }
}

// Divide o valor em N parcelas exatas (evita sobra/falta de centavos por
// arredondamento — a última parcela absorve a diferença). Vencimentos mensais
// a partir de primeiroVencimento, um mês por parcela — em UTC (getUTC.../
// Date.UTC), não setMonth em hora local: "2026-10-01" (data pura, sem hora)
// vira meia-noite UTC, e o servidor roda em America/Sao_Paulo (UTC-3) — usar
// setMonth em hora local nessa data cai no dia anterior e desalinha o mês
// inteiro da 2ª parcela em diante.
function gerarParcelas(valorTotal, numeroParcelas, primeiroVencimento) {
  const valorBase = Math.floor((valorTotal / numeroParcelas) * 100) / 100
  const parcelas = []
  let somaParcial = 0
  const base = new Date(primeiroVencimento)

  for (let i = 0; i < numeroParcelas; i++) {
    const ultima = i === numeroParcelas - 1
    const valor = ultima ? Math.round((valorTotal - somaParcial) * 100) / 100 : valorBase
    somaParcial += valor

    const vencimento = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, base.getUTCDate()))

    parcelas.push({
      valor,
      dataVencimento: vencimento.toISOString(),
      referencia: numeroParcelas > 1 ? `Parcela ${i + 1}/${numeroParcelas}` : null
    })
  }

  return parcelas
}

// ─── Listar vendas (paginado) ──────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { status, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const where = {}
  if (status) where.status = status

  const [vendas, total] = await Promise.all([
    prisma.vendaOrcamento.findMany({
      where,
      include: INCLUDE_PADRAO,
      orderBy: { criadoEm: 'desc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.vendaOrcamento.count({ where })
  ])

  res.json({ vendas, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Buscar uma venda pelo ID ───────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const venda = await prisma.vendaOrcamento.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_PADRAO
  })
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada' })
  res.json(venda)
})

// ─── Criar venda a partir de um Orçamento aprovado ("Criar Venda") ─────────────
// Só admin/gerente, mesma regra de Orçamento/Venda de balsa. Gera 1 Pagamento
// (à vista) ou N Pagamentos (parcelado) — contas a receber de verdade, iguais
// às de Contrato/Venda de balsa (aparecem juntas em Financeiro → Contas a
// Receber). O Orçamento vira "convertido" e trava pra edição (ver routes/orcamentos.js).
router.post('/', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const { orcamentoId, dataVenda, formaPagamento, numeroParcelas, dataVencimento, observacoes } = req.body

  if (!orcamentoId || !formaPagamento || !dataVencimento) {
    return res.status(400).json({ erro: 'Orçamento, forma de pagamento e data de vencimento são obrigatórios' })
  }
  if (!FORMAS_PAGAMENTO.includes(formaPagamento)) {
    return res.status(400).json({ erro: `Forma de pagamento inválida. Use: ${FORMAS_PAGAMENTO.join(', ')}` })
  }

  const parcelas = formaPagamento === 'parcelado' ? parseInt(numeroParcelas) : 1
  if (formaPagamento === 'parcelado' && (!parcelas || parcelas < 2)) {
    return res.status(400).json({ erro: 'Informe ao menos 2 parcelas' })
  }

  const orcamento = await prisma.orcamento.findUnique({
    where: { id: parseInt(orcamentoId) },
    include: { itens: true }
  })
  if (!orcamento) return res.status(400).json({ erro: 'Orçamento não encontrado' })
  if (orcamento.status !== 'aprovado') {
    return res.status(400).json({ erro: 'Só é possível criar venda a partir de um orçamento aprovado' })
  }

  const vendaExistente = await prisma.vendaOrcamento.findUnique({ where: { orcamentoId: orcamento.id } })
  if (vendaExistente) return res.status(400).json({ erro: 'Esse orçamento já tem uma venda' })

  const valorTotal = totalLiquidoOrcamento(orcamento)
  if (!valorTotal || valorTotal <= 0) {
    return res.status(400).json({ erro: 'O orçamento precisa ter um valor total maior que zero' })
  }

  const ano = new Date().getFullYear()
  const ultima = await prisma.vendaOrcamento.findFirst({ where: { ano }, orderBy: { numero: 'desc' } })
  const proximoNumero = ultima ? ultima.numero + 1 : 1

  const parcelasGeradas = gerarParcelas(valorTotal, parcelas, dataVencimento)

  const venda = await prisma.$transaction(async (tx) => {
    const novaVenda = await tx.vendaOrcamento.create({
      data: {
        numero: proximoNumero,
        ano,
        orcamentoId: orcamento.id,
        clienteId: orcamento.clienteId,
        vendedorId: orcamento.vendedorId,
        dataVenda: dataVenda ? new Date(dataVenda).toISOString() : undefined,
        valorTotal,
        formaPagamento,
        numeroParcelas: parcelas,
        observacoes: observacoes || null,
        criadoPorId: req.usuario.id,
        pagamentos: { create: parcelasGeradas }
      },
      include: INCLUDE_PADRAO
    })

    await tx.orcamento.update({ where: { id: orcamento.id }, data: { status: 'convertido' } })

    return novaVenda
  })

  res.json(venda)
})

// ─── Cancelar venda (só admin e gerente) ───────────────────────────────────────
// Não mexe nas contas a receber já geradas (mesma regra da Venda de balsa —
// quem cuida delas dali pra frente é a tela de Contas a Receber).
router.put('/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const { status, observacoes } = req.body

  const atual = await prisma.vendaOrcamento.findUnique({ where: { id } })
  if (!atual) return res.status(404).json({ erro: 'Venda não encontrada' })

  const dados = {}
  if (observacoes !== undefined) dados.observacoes = observacoes || null
  if (status !== undefined) {
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` })
    }
    dados.status = status
  }

  const venda = await prisma.vendaOrcamento.update({ where: { id }, data: dados, include: INCLUDE_PADRAO })
  res.json(venda)
})

export default router

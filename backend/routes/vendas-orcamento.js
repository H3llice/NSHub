import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { totalLiquidoOrcamento } from './orcamentos.js'

const router = Router()

// Valores e dados de cliente — só esses perfis leem, mesmo direto pela API
const PERFIS_LEITURA = ['admin', 'gerente', 'financeiro']

const FORMAS_PAGAMENTO = ['avista', 'parcelado']
const STATUS_VALIDOS = ['ativo', 'cancelado']
const TIPOS_ITEM = ['produto', 'servico']

const INCLUDE_PADRAO = {
  orcamento: { include: { itens: { include: { produto: true, servico: true }, orderBy: { id: 'asc' } } } },
  cliente: true,
  vendedor: { select: { id: true, nome: true } },
  criadoPor: { select: { id: true, nome: true } },
  pagamentos: { orderBy: { dataVencimento: 'asc' } },
  itens: { include: { produto: true, servico: true }, orderBy: { id: 'asc' } }
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

// Comissão do vendedor (R$), opcional — somada na Folha de pagamento do mês
// da venda. "" / null → null; aceita "123,45". Retorna undefined se inválida.
function lerComissao(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.'))
  return n >= 0 ? Math.round(n * 100) / 100 : undefined
}

// Valida e normaliza os itens de uma venda avulsa. Todo item aponta pro
// catálogo (produto ou serviço), mesma regra do Orçamento.
// Retorna { itens } ou { erro }.
function lerItensAvulsa(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    return { erro: 'Ao menos um item é obrigatório' }
  }

  const normalizados = []
  for (const item of itens) {
    if (!TIPOS_ITEM.includes(item.tipo)) {
      return { erro: `Tipo de item inválido. Use: ${TIPOS_ITEM.join(', ')}` }
    }
    const nome = (item.nome || '').trim()
    const quantidade = parseFloat(item.quantidade) || 1
    const valorUnitario = parseFloat(item.valorUnitario)
    if (!nome || isNaN(valorUnitario) || valorUnitario < 0) {
      return { erro: 'Nome e valor unitário são obrigatórios em todos os itens' }
    }
    if (item.tipo === 'produto' && !item.produtoId) return { erro: 'Selecione o produto do catálogo' }
    if (item.tipo === 'servico' && !item.servicoId) return { erro: 'Selecione o serviço do catálogo' }

    normalizados.push({
      tipo: item.tipo,
      produtoId: item.tipo === 'produto' ? parseInt(item.produtoId) : null,
      servicoId: item.tipo === 'servico' ? parseInt(item.servicoId) : null,
      nome,
      detalhes: (item.detalhes || '').trim() || null,
      quantidade,
      valorUnitario
    })
  }
  return { itens: normalizados }
}

// ─── Listar vendas (paginado) ──────────────────────────────────────────────────
router.get('/', autenticar, exigirPerfil(...PERFIS_LEITURA), async (req, res) => {
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
router.get('/:id', autenticar, exigirPerfil(...PERFIS_LEITURA), async (req, res) => {
  const venda = await prisma.vendaOrcamento.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_PADRAO
  })
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada' })
  res.json(venda)
})

// ─── Criar venda — de um Orçamento aprovado ("Criar Venda") ou avulsa ─────────
// Só admin/gerente, mesma regra de Orçamento/Venda de balsa. Gera 1 Pagamento
// (à vista) ou N Pagamentos (parcelado) — contas a receber de verdade, iguais
// às de Contrato/Venda de balsa (aparecem juntas em Financeiro → Contas a
// Receber). Com orcamentoId, o Orçamento vira "convertido" e trava pra edição
// (ver routes/orcamentos.js). Sem orcamentoId é venda avulsa: cliente, vendedor
// e itens vêm direto no corpo.
router.post('/', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const { orcamentoId, dataVenda, formaPagamento, numeroParcelas, dataVencimento, observacoes } = req.body

  if (!formaPagamento || !dataVencimento) {
    return res.status(400).json({ erro: 'Forma de pagamento e data de vencimento são obrigatórias' })
  }
  const comissao = lerComissao(req.body.comissao)
  if (comissao === undefined) return res.status(400).json({ erro: 'Comissão inválida' })
  if (!FORMAS_PAGAMENTO.includes(formaPagamento)) {
    return res.status(400).json({ erro: `Forma de pagamento inválida. Use: ${FORMAS_PAGAMENTO.join(', ')}` })
  }

  const parcelas = formaPagamento === 'parcelado' ? parseInt(numeroParcelas) : 1
  if (formaPagamento === 'parcelado' && (!parcelas || parcelas < 2)) {
    return res.status(400).json({ erro: 'Informe ao menos 2 parcelas' })
  }

  // Campos que dependem da origem da venda (Orçamento ou avulsa)
  let origem

  if (orcamentoId) {
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

    origem = { orcamentoId: orcamento.id, clienteId: orcamento.clienteId, vendedorId: orcamento.vendedorId, valorTotal }
  } else {
    const clienteId = parseInt(req.body.clienteId)
    if (!clienteId) return res.status(400).json({ erro: 'Cliente é obrigatório' })

    const { itens, erro } = lerItensAvulsa(req.body.itens)
    if (erro) return res.status(400).json({ erro })

    const valorTotal = Math.round(itens.reduce((soma, i) => soma + i.quantidade * i.valorUnitario, 0) * 100) / 100
    if (valorTotal <= 0) return res.status(400).json({ erro: 'A venda precisa ter um valor total maior que zero' })

    origem = {
      orcamentoId: null,
      clienteId,
      vendedorId: req.body.vendedorId ? parseInt(req.body.vendedorId) : null,
      valorTotal,
      itens: { create: itens }
    }
  }

  const ano = new Date().getFullYear()
  const ultima = await prisma.vendaOrcamento.findFirst({ where: { ano }, orderBy: { numero: 'desc' } })
  const proximoNumero = ultima ? ultima.numero + 1 : 1

  const parcelasGeradas = gerarParcelas(origem.valorTotal, parcelas, dataVencimento)

  // Na venda avulsa, cliente/vendedor/itens do catálogo vêm por id do corpo —
  // id inexistente estoura FK (P2003) e vira 400 em vez de 500
  let venda
  try {
    venda = await prisma.$transaction(async (tx) => {
      const novaVenda = await tx.vendaOrcamento.create({
        data: {
          ...origem,
          numero: proximoNumero,
          ano,
          dataVenda: dataVenda ? new Date(dataVenda).toISOString() : undefined,
          formaPagamento,
          numeroParcelas: parcelas,
          observacoes: observacoes || null,
          comissao,
          criadoPorId: req.usuario.id,
          pagamentos: { create: parcelasGeradas }
        },
        include: INCLUDE_PADRAO
      })

      if (origem.orcamentoId) {
        await tx.orcamento.update({ where: { id: origem.orcamentoId }, data: { status: 'convertido' } })
      }

      return novaVenda
    })
  } catch (err) {
    if (err.code !== 'P2003') throw err
    return res.status(400).json({ erro: 'Cliente, vendedor ou item do catálogo não encontrado' })
  }

  res.json(venda)
})

// ─── Cancelar venda (só admin e gerente) ───────────────────────────────────────
// Não mexe nas contas a receber já geradas (mesma regra da Venda de balsa —
// quem cuida delas dali pra frente é a tela de Contas a Receber).
router.put('/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const { status, observacoes, comissao } = req.body

  const atual = await prisma.vendaOrcamento.findUnique({ where: { id } })
  if (!atual) return res.status(404).json({ erro: 'Venda não encontrada' })

  const dados = {}
  if (observacoes !== undefined) dados.observacoes = observacoes || null
  if (comissao !== undefined) {
    dados.comissao = lerComissao(comissao)
    if (dados.comissao === undefined) return res.status(400).json({ erro: 'Comissão inválida' })
  }
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

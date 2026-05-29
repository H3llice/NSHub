import { Router } from 'express'
import { prisma } from '../server.js'

const router = Router()

// Listar todas as OCs
router.get('/', async (req, res) => {
  const { busca, empresa, status, dataInicio, dataFim, pagina = 1 } = req.query
  const porPagina = 50

  const where = {}

  if (status) {
    where.status = status
  } else {
    where.status = { not: 'cancelada' }
  }

  if (empresa) where.empresaId = parseInt(empresa)

  if (dataInicio || dataFim) {
    where.dataPedido = {}
    if (dataInicio) where.dataPedido.gte = new Date(dataInicio)
    if (dataFim) where.dataPedido.lte = new Date(dataFim + 'T23:59:59')
  }

  if (busca) {
    where.OR = [
      { fornecedor: { nome: { contains: busca, mode: 'insensitive' } } },
      { numero: isNaN(busca) ? undefined : parseInt(busca) },
    ].filter(c => Object.values(c)[0] !== undefined)
  }

  const [ocs, total] = await Promise.all([
    prisma.ordemCompra.findMany({
      where,
      include: { fornecedor: true, empresa: true, itens: true },
      orderBy: { numero: 'desc' },
      take: porPagina,
      skip: (parseInt(pagina) - 1) * porPagina
    }),
    prisma.ordemCompra.count({ where })
  ])

  res.json({
    ocs,
    total,
    pagina: parseInt(pagina),
    totalPaginas: Math.ceil(total / porPagina)
  })
})

// Buscar uma OC pelo ID
router.get('/:id', async (req, res) => {
  const oc = await prisma.ordemCompra.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      fornecedor: true,
      empresa: true,
      vendedor: true,
      itens: true,
      anexos: true
    }
  })
  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })
  res.json(oc)
})

// Criar nova OC
router.post('/', async (req, res) => {
  const { empresaId, fornecedorId, vendedorId, itens, ...dados } = req.body

  if (dados.dataPedido) {
    dados.dataPedido = new Date(dados.dataPedido).toISOString()
  }

  // Pega o próximo número sequencial do ano atual
  const ano = new Date().getFullYear()
  const ultima = await prisma.ordemCompra.findFirst({
    where: { ano, status: { not: 'cancelada' } },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultima ? ultima.numero + 1 : 1

  const oc = await prisma.ordemCompra.create({
    data: {
      ...dados,
      numero: proximoNumero,
      ano,
      empresaId,
      fornecedorId,
      vendedorId,
      itens: { create: itens }
    },
    include: { itens: true }
  })
  res.json(oc)
})

// Editar OC
router.put('/:id', async (req, res) => {
  const { itens, empresaId, fornecedorId, vendedorId, dataPedido, ...resto } = req.body

  const dadosLimpos = {
    empresaId: parseInt(empresaId),
    fornecedorId: parseInt(fornecedorId),
    vendedorId: vendedorId ? parseInt(vendedorId) : null,
    dataPedido: dataPedido ? new Date(dataPedido).toISOString() : undefined,
    condicoesPagto: resto.condicoesPagto,
    formaPagto: resto.formaPagto,
    prazoEntrega: resto.prazoEntrega,
    incoterms: resto.incoterms,
    transportadora: resto.transportadora,
    enderecoTransp: resto.enderecoTransp,
    telefoneTransp: resto.telefoneTransp,
    instrucoes: resto.instrucoes,
    solicitante: resto.solicitante,
    status: resto.status,
  }

  await prisma.itemOC.deleteMany({ where: { ocId: Number(req.params.id) } })

  const oc = await prisma.ordemCompra.update({
    where: { id: Number(req.params.id) },
    data: {
      ...dadosLimpos,
      itens: { create: itens }
    },
    include: { itens: true, anexos: true }
  })
  res.json(oc)
})

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  await prisma.ordemCompra.update({
    where: { id },
    data: {
      status: 'cancelada',
      canceladoEm: new Date()
    }
  })
  res.json({ ok: true })
})

router.post('/:id/restaurar', async (req, res) => {
  const id = Number(req.params.id)
  const oc = await prisma.ordemCompra.findUnique({ where: { id } })

  // Pega próximo número disponível
  const ano = new Date().getFullYear()
  const ultima = await prisma.ordemCompra.findFirst({
    where: { ano, status: { not: 'cancelada' } },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultima ? ultima.numero + 1 : 1

  const restaurada = await prisma.ordemCompra.update({
    where: { id },
    data: {
      status: 'aberta',
      numero: proximoNumero,
      canceladoEm: null
    }
  })
  res.json(restaurada)
})
export default router
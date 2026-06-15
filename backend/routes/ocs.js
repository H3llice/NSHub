import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { notificarNovaOC, notificarAprovacao } from '../email.js'

const router = Router()

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// ─── Listar todas as OCs ──────────────────────────────────────────────────────
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
      include: { fornecedor: true, empresa: true, itens: true, assinaturas: { include: { usuario: true } } },
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

// ─── Buscar uma OC pelo ID ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const oc = await prisma.ordemCompra.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      fornecedor: true,
      empresa: true,
      vendedor: true,
      itens: true,
      anexos: true,
      assinaturas: { include: { usuario: true }, orderBy: { criadoEm: 'asc' } }
    }
  })
  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })
  res.json(oc)
})

// ─── Criar nova OC ────────────────────────────────────────────────────────────
router.post('/', autenticar, async (req, res) => {
  const { empresaId, fornecedorId, vendedorId, itens,
          fornecedorNome, fornecedorDocumento, fornecedorEndereco, fornecedorCidade, fornecedorTelefone,
          ...dados } = req.body

  if (dados.dataPedido) {
    dados.dataPedido = new Date(dados.dataPedido).toISOString()
  }

  // Atualiza dados do fornecedor existente se vieram preenchidos
  if (fornecedorId) {
    await prisma.fornecedor.update({
      where: { id: fornecedorId },
      data: {
        ...(fornecedorNome      && { nome:      fornecedorNome }),
        ...(fornecedorDocumento && { documento: fornecedorDocumento }),
        ...(fornecedorEndereco  && { endereco:  fornecedorEndereco }),
        ...(fornecedorCidade    && { cidade:    fornecedorCidade }),
        ...(fornecedorTelefone  && { telefone:  fornecedorTelefone }),
      }
    })
  }

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
      status: 'aguardando_aprovacao',
      empresaId,
      fornecedorId,
      vendedorId,
      criadoPorId: req.usuario.id,
      itens: { create: itens }
    },
    include: { itens: true, fornecedor: true, empresa: true }
  })

  notificarNovaOC(oc, BASE_URL).catch(err =>
    console.error('⚠️  Falha ao enviar email da OC:', err.message)
  )
  notificarAprovacao(oc, 'nova', BASE_URL).catch(err =>
    console.error('⚠️  Falha ao notificar gerente:', err.message)
  )

  res.json(oc)
})

// ─── Assinar como solicitante ─────────────────────────────────────────────────
router.post('/:id/assinar-solicitante', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { assinaturaImg } = req.body

  const oc = await prisma.ordemCompra.findUnique({ where: { id } })

  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })

  // Verifica se já foi assinada pelo solicitante
  const jaAssinou = await prisma.assinatura.findFirst({
    where: { ocId: id, etapa: 'solicitante' }
  })
  if (jaAssinou) {
    return res.status(400).json({ erro: 'OC já foi assinada pelo solicitante' })
  }

  const assinatura = await prisma.assinatura.create({
    data: {
      ocId: id,
      usuarioId: req.usuario.id,
      etapa: 'solicitante',
      acao: 'aprovada',
      assinaturaImg: assinaturaImg || null
    },
    include: { usuario: true }
  })

  res.json(assinatura)
})

// ─── Editar OC ────────────────────────────────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const ocAtual = await prisma.ordemCompra.findUnique({ where: { id } })

  const editaveis = ['aberta', 'aguardando_aprovacao', 'recusada']
  if (!editaveis.includes(ocAtual?.status)) {
    return res.status(400).json({ erro: 'OC não pode ser editada neste status' })
  }

  const { itens, empresaId, fornecedorId, vendedorId, dataPedido, fornecedorNome, fornecedorDocumento, fornecedorEndereco, fornecedorCidade, fornecedorTelefone, ...resto } = req.body

  // Atualiza dados do fornecedor existente se vieram preenchidos
  if (fornecedorId) {
    await prisma.fornecedor.update({
      where: { id: parseInt(fornecedorId) },
      data: {
        ...(fornecedorNome      && { nome:      fornecedorNome }),
        ...(fornecedorDocumento && { documento: fornecedorDocumento }),
        ...(fornecedorEndereco  && { endereco:  fornecedorEndereco }),
        ...(fornecedorCidade    && { cidade:    fornecedorCidade }),
        ...(fornecedorTelefone  && { telefone:  fornecedorTelefone }),
      }
    })
  }

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
    status: ocAtual.status === 'recusada' ? 'aguardando_aprovacao' : ocAtual.status,
  }

  await prisma.itemOC.deleteMany({ where: { ocId: id } })

  const oc = await prisma.ordemCompra.update({
    where: { id },
    data: { ...dadosLimpos, itens: { create: itens } },
    include: { itens: true, anexos: true }
  })
  res.json(oc)
})

// ─── Aprovar OC (gerente) ─────────────────────────────────────────────────────
router.post('/:id/aprovar', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const { assinaturaImg } = req.body

  const oc = await prisma.ordemCompra.findUnique({
    where: { id },
    include: { fornecedor: true, empresa: true }
  })

  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })
  if (oc.status !== 'aguardando_aprovacao') {
    return res.status(400).json({ erro: `OC não está aguardando aprovação (status atual: ${oc.status})` })
  }

  await prisma.$transaction([
    prisma.assinatura.create({
      data: {
        ocId: id,
        usuarioId: req.usuario.id,
        etapa: 'aprovacao',
        acao: 'aprovada',
        assinaturaImg: assinaturaImg || null
      }
    }),
    prisma.ordemCompra.update({
      where: { id },
      data: { status: 'aguardando_autorizacao' }
    })
  ])

  const ocAtualizada = await prisma.ordemCompra.findUnique({
    where: { id },
    include: { fornecedor: true, empresa: true, itens: true }
  })

  notificarAprovacao(ocAtualizada, 'aprovada', BASE_URL).catch(err =>
    console.error('⚠️  Falha ao notificar financeiro:', err.message)
  )

  res.json(ocAtualizada)
})

// ─── Autorizar OC (financeiro) ────────────────────────────────────────────────
router.post('/:id/autorizar', autenticar, exigirPerfil('financeiro', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const { assinaturaImg } = req.body

  const oc = await prisma.ordemCompra.findUnique({
    where: { id },
    include: { fornecedor: true, empresa: true }
  })

  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })
  if (oc.status !== 'aguardando_autorizacao') {
    return res.status(400).json({ erro: `OC não está aguardando autorização (status atual: ${oc.status})` })
  }

  await prisma.$transaction([
    prisma.assinatura.create({
      data: {
        ocId: id,
        usuarioId: req.usuario.id,
        etapa: 'autorizacao',
        acao: 'aprovada',
        assinaturaImg: assinaturaImg || null
      }
    }),
    prisma.ordemCompra.update({
      where: { id },
      data: { status: 'aprovada' }
    })
  ])

  const ocAtualizada = await prisma.ordemCompra.findUnique({
    where: { id },
    include: { fornecedor: true, empresa: true, itens: true }
  })

  notificarAprovacao(ocAtualizada, 'autorizada', BASE_URL).catch(err =>
    console.error('⚠️  Falha ao notificar criador:', err.message)
  )

  res.json(ocAtualizada)
})

// ─── Recusar OC ───────────────────────────────────────────────────────────────
router.post('/:id/recusar', autenticar, exigirPerfil('gerente', 'financeiro', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const { motivo, assinaturaImg } = req.body

  if (!motivo?.trim()) {
    return res.status(400).json({ erro: 'Motivo é obrigatório ao recusar uma OC' })
  }

  const oc = await prisma.ordemCompra.findUnique({
    where: { id },
    include: { fornecedor: true, empresa: true }
  })

  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })

  const statusPermitidos = ['aguardando_aprovacao', 'aguardando_autorizacao']
  if (!statusPermitidos.includes(oc.status)) {
    return res.status(400).json({ erro: `OC não pode ser recusada neste status (${oc.status})` })
  }

  if (oc.status === 'aguardando_aprovacao' && req.usuario.perfil === 'financeiro') {
    return res.status(403).json({ erro: 'Aguardando aprovação do gerente, não do financeiro' })
  }
  if (oc.status === 'aguardando_autorizacao' && req.usuario.perfil === 'gerente') {
    return res.status(403).json({ erro: 'Aguardando autorização do financeiro, não do gerente' })
  }

  const etapa = oc.status === 'aguardando_aprovacao' ? 'aprovacao' : 'autorizacao'

  await prisma.$transaction([
    prisma.assinatura.create({
      data: {
        ocId: id,
        usuarioId: req.usuario.id,
        etapa,
        acao: 'recusada',
        motivo,
        assinaturaImg: assinaturaImg || null
      }
    }),
    prisma.ordemCompra.update({
      where: { id },
      data: { status: 'recusada' }
    })
  ])

  const ocAtualizada = await prisma.ordemCompra.findUnique({
    where: { id },
    include: { fornecedor: true, empresa: true, itens: true }
  })

  notificarAprovacao(ocAtualizada, 'recusada', BASE_URL, motivo).catch(err =>
    console.error('⚠️  Falha ao notificar recusa:', err.message)
  )

  res.json(ocAtualizada)
})

// ─── Cancelar OC ─────────────────────────────────────────────────────────────
router.delete('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  await prisma.ordemCompra.update({
    where: { id },
    data: { status: 'cancelada', canceladoEm: new Date() }
  })
  res.json({ ok: true })
})

// ─── Restaurar OC cancelada ───────────────────────────────────────────────────
router.post('/:id/restaurar', autenticar, async (req, res) => {
  const id = Number(req.params.id)

  const ano = new Date().getFullYear()
  const ultima = await prisma.ordemCompra.findFirst({
    where: { ano, status: { not: 'cancelada' } },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultima ? ultima.numero + 1 : 1

  const restaurada = await prisma.ordemCompra.update({
    where: { id },
    data: { status: 'aguardando_aprovacao', numero: proximoNumero, canceladoEm: null }
  })
  res.json(restaurada)
})

export default router
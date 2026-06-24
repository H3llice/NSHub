import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ─── Listar solicitações ──────────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { busca, empresa, status, pagina = 1 } = req.query
  const porPagina = 50

  const where = {}

  if (status) {
    where.status = status
  } else {
    where.status = { not: 'cancelada' }
  }

  if (empresa) where.empresaId = parseInt(empresa)

  if (busca && !isNaN(busca)) {
    where.numero = parseInt(busca)
  }

  const [solicitacoes, total] = await Promise.all([
    prisma.solicitacaoCompra.findMany({
      where,
      include: {
        empresa: true,
        criadoPor: true,
        itens: true,
        fornecedores: true,
        assinaturas: { include: { usuario: true } }
      },
      orderBy: { numero: 'desc' },
      take: porPagina,
      skip: (parseInt(pagina) - 1) * porPagina
    }),
    prisma.solicitacaoCompra.count({ where })
  ])

  res.json({
    solicitacoes,
    total,
    pagina: parseInt(pagina),
    totalPaginas: Math.ceil(total / porPagina)
  })
})

// ─── Buscar uma solicitação pelo ID ───────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const solicitacao = await prisma.solicitacaoCompra.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      empresa: true,
      criadoPor: true,
      itens: {
        include: { precos: true }
      },
      fornecedores: {
        include: { precos: true }
      },
      assinaturas: { include: { usuario: true }, orderBy: { criadoEm: 'asc' } },
      ocGerada: true
    }
  })

  if (!solicitacao) return res.status(404).json({ erro: 'Solicitação não encontrada' })
  res.json(solicitacao)
})

// ─── Criar nova solicitação ────────────────────────────────────────────────────
// Body esperado:
// {
//   empresaId, instrucoes,
//   itens: [{ quantidade, unidade, descricao }],
//   fornecedores: [{ nome, documento, telefone, prazoEntrega, condicoesPagto, observacoes, favorito }],
//   precos: [{ itemIndex, fornecedorIndex, valor }]   // referencia pelo índice nos arrays acima
// }
router.post('/', autenticar, async (req, res) => {
  const { empresaId, instrucoes, itens, fornecedores, precos } = req.body

  if (!empresaId || !itens?.length || !fornecedores?.length) {
    return res.status(400).json({ erro: 'Empresa, itens e ao menos um fornecedor cotado são obrigatórios' })
  }

  const ano = new Date().getFullYear()
  const ultima = await prisma.solicitacaoCompra.findFirst({
    where: { ano, status: { not: 'cancelada' } },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultima ? ultima.numero + 1 : 1

  // Cria a solicitação com itens e fornecedores em transação
  const solicitacao = await prisma.$transaction(async (tx) => {
    const sc = await tx.solicitacaoCompra.create({
      data: {
        numero: proximoNumero,
        ano,
        empresaId: parseInt(empresaId),
        criadoPorId: req.usuario.id,
        instrucoes,
        itens: { create: itens.map(i => ({
          quantidade: parseFloat(i.quantidade) || 0,
          unidade: i.unidade || null,
          descricao: i.descricao
        })) },
        fornecedores: { create: fornecedores.map(f => ({
          nome: f.nome,
          documento: f.documento || null,
          telefone: f.telefone || null,
          prazoEntrega: f.prazoEntrega || null,
          condicoesPagto: f.condicoesPagto || null,
          observacoes: f.observacoes || null,
          favorito: !!f.favorito
        })) }
      },
      include: { itens: true, fornecedores: true }
    })

    // Cria os preços cotados, referenciando os itens/fornecedores recém-criados pelo índice
    if (precos?.length) {
      await tx.precoCotado.createMany({
        data: precos
          .filter(p => p.valor !== null && p.valor !== undefined && p.valor !== '')
          .map(p => ({
            itemSolicitacaoId: sc.itens[p.itemIndex].id,
            fornecedorCotadoId: sc.fornecedores[p.fornecedorIndex].id,
            valor: parseFloat(p.valor)
          }))
      })
    }

    return sc
  })

  const completa = await prisma.solicitacaoCompra.findUnique({
    where: { id: solicitacao.id },
    include: { itens: { include: { precos: true } }, fornecedores: { include: { precos: true } }, empresa: true }
  })

  res.json(completa)
})

// ─── Editar solicitação ────────────────────────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const atual = await prisma.solicitacaoCompra.findUnique({ where: { id } })

  if (!atual) return res.status(404).json({ erro: 'Solicitação não encontrada' })

  const editaveis = ['aguardando_aprovacao', 'recusada']
  if (!editaveis.includes(atual.status)) {
    return res.status(400).json({ erro: 'Solicitação não pode ser editada neste status' })
  }

  const { empresaId, instrucoes, itens, fornecedores, precos } = req.body

  await prisma.$transaction(async (tx) => {
    // Remove itens/fornecedores/preços antigos e recria (mais simples que diff incremental)
    await tx.precoCotado.deleteMany({ where: { item: { solicitacaoId: id } } })
    await tx.itemSolicitacao.deleteMany({ where: { solicitacaoId: id } })
    await tx.fornecedorCotado.deleteMany({ where: { solicitacaoId: id } })

    await tx.solicitacaoCompra.update({
      where: { id },
      data: {
        empresaId: parseInt(empresaId),
        instrucoes,
        status: atual.status === 'recusada' ? 'aguardando_aprovacao' : atual.status,
        itens: { create: itens.map(i => ({
          quantidade: parseFloat(i.quantidade) || 0,
          unidade: i.unidade || null,
          descricao: i.descricao
        })) },
        fornecedores: { create: fornecedores.map(f => ({
          nome: f.nome,
          documento: f.documento || null,
          telefone: f.telefone || null,
          prazoEntrega: f.prazoEntrega || null,
          condicoesPagto: f.condicoesPagto || null,
          observacoes: f.observacoes || null,
          favorito: !!f.favorito
        })) }
      }
    })

    const novosItens = await tx.itemSolicitacao.findMany({ where: { solicitacaoId: id } })
    const novosFornecedores = await tx.fornecedorCotado.findMany({ where: { solicitacaoId: id } })

    if (precos?.length) {
      await tx.precoCotado.createMany({
        data: precos
          .filter(p => p.valor !== null && p.valor !== undefined && p.valor !== '')
          .map(p => ({
            itemSolicitacaoId: novosItens[p.itemIndex].id,
            fornecedorCotadoId: novosFornecedores[p.fornecedorIndex].id,
            valor: parseFloat(p.valor)
          }))
      })
    }
  })

  const completa = await prisma.solicitacaoCompra.findUnique({
    where: { id },
    include: { itens: { include: { precos: true } }, fornecedores: { include: { precos: true } }, empresa: true }
  })

  res.json(completa)
})

// ─── Assinar como solicitante ──────────────────────────────────────────────────
router.post('/:id/assinar-solicitante', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { assinaturaImg } = req.body

  const solicitacao = await prisma.solicitacaoCompra.findUnique({ where: { id } })
  if (!solicitacao) return res.status(404).json({ erro: 'Solicitação não encontrada' })

  const jaAssinou = await prisma.assinatura.findFirst({
    where: { solicitacaoId: id, etapa: 'solicitante' }
  })
  if (jaAssinou) {
    return res.status(400).json({ erro: 'Solicitação já foi assinada pelo solicitante' })
  }

  const assinatura = await prisma.assinatura.create({
    data: {
      solicitacaoId: id,
      usuarioId: req.usuario.id,
      etapa: 'solicitante',
      acao: 'aprovada',
      assinaturaImg: assinaturaImg || null
    },
    include: { usuario: true }
  })

  res.json(assinatura)
})

// ─── Aprovar solicitação (gerente) — escolhe fornecedor e gera a OC ───────────
router.post('/:id/aprovar', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const { fornecedorEscolhidoId, assinaturaImg } = req.body

  if (!fornecedorEscolhidoId) {
    return res.status(400).json({ erro: 'É necessário escolher um fornecedor para aprovar' })
  }

  const solicitacao = await prisma.solicitacaoCompra.findUnique({
    where: { id },
    include: {
      empresa: true,
      itens: { include: { precos: true } },
      fornecedores: { include: { precos: true } },
      assinaturas: { include: { usuario: true } }
    }
  })

  if (!solicitacao) return res.status(404).json({ erro: 'Solicitação não encontrada' })
  if (solicitacao.status !== 'aguardando_aprovacao') {
    return res.status(400).json({ erro: `Solicitação não está aguardando aprovação (status atual: ${solicitacao.status})` })
  }

  const fornecedorEscolhido = solicitacao.fornecedores.find(f => f.id === Number(fornecedorEscolhidoId))
  if (!fornecedorEscolhido) {
    return res.status(400).json({ erro: 'Fornecedor escolhido não pertence a esta solicitação' })
  }

  const assinaturaSolicitante = solicitacao.assinaturas.find(a => a.etapa === 'solicitante')

  // Monta os itens da OC com base nos preços daquele fornecedor escolhido
  const itensOC = solicitacao.itens.map(item => {
    const preco = item.precos.find(p => p.fornecedorCotadoId === fornecedorEscolhido.id)
    const valorUni = preco?.valor ?? 0
    return {
      quantidade: item.quantidade,
      unidade: item.unidade,
      descricao: item.descricao,
      valorUni,
      ipi: 0,
      valorTotal: valorUni * item.quantidade
    }
  })

  const ano = new Date().getFullYear()

  const resultado = await prisma.$transaction(async (tx) => {
    // Marca o fornecedor escolhido
    await tx.fornecedorCotado.updateMany({
      where: { solicitacaoId: id },
      data: { escolhido: false }
    })
    await tx.fornecedorCotado.update({
      where: { id: fornecedorEscolhido.id },
      data: { escolhido: true }
    })

    // Registra a assinatura de aprovação do gerente na solicitação
    await tx.assinatura.create({
      data: {
        solicitacaoId: id,
        usuarioId: req.usuario.id,
        etapa: 'aprovacao',
        acao: 'aprovada',
        assinaturaImg: assinaturaImg || null
      }
    })

    // Cria ou reusa um Fornecedor cadastrado com o nome do fornecedor cotado
    // (a OC exige fornecedorId vinculado a um Fornecedor real do sistema)
    let fornecedorCadastro = await tx.fornecedor.findFirst({
      where: { nome: fornecedorEscolhido.nome }
    })
    if (!fornecedorCadastro) {
      fornecedorCadastro = await tx.fornecedor.create({
        data: {
          nome: fornecedorEscolhido.nome,
          documento: fornecedorEscolhido.documento,
          telefone: fornecedorEscolhido.telefone
        }
      })
    }

    const ultima = await tx.ordemCompra.findFirst({
      where: { ano, status: { not: 'cancelada' } },
      orderBy: { numero: 'desc' }
    })
    const proximoNumero = ultima ? ultima.numero + 1 : 1

    // Cria a OC já com status aguardando_autorizacao (pula direto pro financeiro)
    const oc = await tx.ordemCompra.create({
      data: {
        numero: proximoNumero,
        ano,
        empresaId: solicitacao.empresaId,
        fornecedorId: fornecedorCadastro.id,
        criadoPorId: solicitacao.criadoPorId,
        condicoesPagto: fornecedorEscolhido.condicoesPagto,
        prazoEntrega: fornecedorEscolhido.prazoEntrega,
        instrucoes: fornecedorEscolhido.observacoes,
        solicitante: solicitacao.criadoPor?.nome,
        status: 'aguardando_autorizacao',
        geradaDeSolicitacaoId: id,
        itens: { create: itensOC }
      },
      include: { itens: true, fornecedor: true, empresa: true }
    })

    // Copia a assinatura do solicitante para a OC (mesma imagem/usuário, nova etapa)
    if (assinaturaSolicitante) {
      await tx.assinatura.create({
        data: {
          ocId: oc.id,
          usuarioId: assinaturaSolicitante.usuarioId,
          etapa: 'solicitante',
          acao: 'aprovada',
          assinaturaImg: assinaturaSolicitante.assinaturaImg
        }
      })
    }

    // Copia a assinatura de aprovação do gerente para a OC
    await tx.assinatura.create({
      data: {
        ocId: oc.id,
        usuarioId: req.usuario.id,
        etapa: 'aprovacao',
        acao: 'aprovada',
        assinaturaImg: assinaturaImg || null
      }
    })

    // Marca a solicitação como aprovada
    await tx.solicitacaoCompra.update({
      where: { id },
      data: { status: 'aprovada' }
    })

    return oc
  })

  res.json({ ok: true, ocGerada: resultado })
})

// ─── Recusar solicitação ───────────────────────────────────────────────────────
router.post('/:id/recusar', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const { motivo, assinaturaImg } = req.body

  if (!motivo?.trim()) {
    return res.status(400).json({ erro: 'Motivo é obrigatório ao recusar uma solicitação' })
  }

  const solicitacao = await prisma.solicitacaoCompra.findUnique({ where: { id } })
  if (!solicitacao) return res.status(404).json({ erro: 'Solicitação não encontrada' })

  if (solicitacao.status !== 'aguardando_aprovacao') {
    return res.status(400).json({ erro: `Solicitação não pode ser recusada neste status (${solicitacao.status})` })
  }

  await prisma.$transaction([
    prisma.assinatura.create({
      data: {
        solicitacaoId: id,
        usuarioId: req.usuario.id,
        etapa: 'aprovacao',
        acao: 'recusada',
        motivo,
        assinaturaImg: assinaturaImg || null
      }
    }),
    prisma.solicitacaoCompra.update({
      where: { id },
      data: { status: 'recusada' }
    })
  ])

  const atualizada = await prisma.solicitacaoCompra.findUnique({
    where: { id },
    include: { itens: true, fornecedores: true, empresa: true }
  })

  res.json(atualizada)
})

// ─── Cancelar solicitação ───────────────────────────────────────────────────────
router.delete('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  await prisma.solicitacaoCompra.update({
    where: { id },
    data: { status: 'cancelada', canceladoEm: new Date() }
  })
  res.json({ ok: true })
})

export default router
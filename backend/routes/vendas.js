import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

const STATUS_VALIDOS = ['ativo', 'cancelado']

// ─── Listar vendas ───────────────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { status } = req.query

  const where = {}
  if (status) where.status = status

  const vendas = await prisma.venda.findMany({
    where,
    include: {
      cliente: true,
      vendedor: { select: { id: true, nome: true } },
      criadoPor: { select: { id: true, nome: true } },
      balsas: { include: { balsa: true } }
    },
    orderBy: { criadoEm: 'desc' }
  })

  res.json(vendas)
})

// ─── Buscar uma venda pelo ID ──────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const venda = await prisma.venda.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      cliente: true,
      vendedor: { select: { id: true, nome: true } },
      criadoPor: { select: { id: true, nome: true } },
      balsas: { include: { balsa: true } }
    }
  })
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada' })
  res.json(venda)
})

// ─── Criar venda (só admin e gerente) ───────────────────────────────────────────
router.post('/', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const {
    clienteId, balsas, dataVenda, vendedorId,
    valor, frete, descontoTipo, descontoValor, formaPagamento, condicoesPagto, observacoes,
    periodicidadePagamento, dataVencimento
  } = req.body

  if (!clienteId || !Array.isArray(balsas) || balsas.length === 0 || !dataVenda || !vendedorId) {
    return res.status(400).json({ erro: 'Cliente, vendedor responsável, ao menos uma balsa e data da venda são obrigatórios' })
  }

  const balsaIds = balsas.map(b => b.balsaId)

  const periodicidade = periodicidadePagamento === 'mensal' ? 'mensal' : 'unico'

  if (valor && !dataVencimento) {
    return res.status(400).json({ erro: 'Data de vencimento é obrigatória quando há valor definido' })
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: parseInt(clienteId) } })
  if (!cliente) return res.status(400).json({ erro: 'Cliente não encontrado' })

  const vendedor = await prisma.usuario.findUnique({ where: { id: parseInt(vendedorId) } })
  if (!vendedor) return res.status(400).json({ erro: 'Vendedor responsável não encontrado' })

  const balsasEncontradas = await prisma.balsa.findMany({ where: { id: { in: balsaIds.map(Number) } } })
  if (balsasEncontradas.length !== balsaIds.length) {
    return res.status(400).json({ erro: 'Uma ou mais balsas selecionadas não foram encontradas' })
  }

  const finalidadeErrada = balsasEncontradas.filter(b => b.finalidade !== 'venda')
  if (finalidadeErrada.length > 0) {
    return res.status(400).json({
      erro: `As seguintes balsas não pertencem ao estoque de venda: ${finalidadeErrada.map(b => b.numeroSerie).join(', ')}`
    })
  }

  const indisponiveis = balsasEncontradas.filter(b => b.status !== 'disponivel')
  if (indisponiveis.length > 0) {
    return res.status(400).json({
      erro: `As seguintes balsas não estão disponíveis: ${indisponiveis.map(b => b.numeroSerie).join(', ')}`
    })
  }

  const ano = new Date().getFullYear()
  const ultima = await prisma.venda.findFirst({
    where: { ano },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultima ? ultima.numero + 1 : 1

  const venda = await prisma.$transaction(async (tx) => {
    const novaVenda = await tx.venda.create({
      data: {
        numero: proximoNumero,
        ano,
        clienteId: parseInt(clienteId),
        vendedorId: parseInt(vendedorId),
        dataVenda: new Date(dataVenda).toISOString(),
        valor: valor ? parseFloat(valor) : null,
        frete: frete ? parseFloat(frete) : null,
        descontoTipo: descontoValor ? (descontoTipo || 'percentual') : null,
        descontoValor: descontoValor ? parseFloat(descontoValor) : null,
        formaPagamento: formaPagamento || null,
        condicoesPagto: condicoesPagto || null,
        observacoes: observacoes || null,
        periodicidadePagamento: periodicidade,
        criadoPorId: req.usuario.id,
        balsas: {
          create: balsas.map(b => ({ balsaId: parseInt(b.balsaId), valor: b.valor ? parseFloat(b.valor) : null }))
        }
      },
      include: { cliente: true, vendedor: { select: { id: true, nome: true } }, balsas: { include: { balsa: true } } }
    })

    await tx.balsa.updateMany({
      where: { id: { in: balsaIds.map(Number) } },
      data: { status: 'vendido' }
    })

    // Cria a primeira parcela, se houver valor definido
    if (valor && dataVencimento) {
      const dataVenc = new Date(dataVencimento)
      await tx.pagamento.create({
        data: {
          vendaId: novaVenda.id,
          valor: parseFloat(valor),
          dataVencimento: dataVenc.toISOString(),
          referencia: periodicidade === 'mensal'
            ? `${String(dataVenc.getMonth() + 1).padStart(2, '0')}/${dataVenc.getFullYear()}`
            : null
        }
      })
    }

    return novaVenda
  })

  res.json(venda)
})

// ─── Editar venda (só admin e gerente) ──────────────────────────────────────────
// Não permite trocar as balsas vinculadas aqui — só dados da venda, o valor individual delas e status.
router.put('/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const { dataVenda, valor, frete, descontoTipo, descontoValor, balsas, formaPagamento, condicoesPagto, observacoes, status } = req.body

  const vendaAtual = await prisma.venda.findUnique({
    where: { id },
    include: { balsas: true }
  })
  if (!vendaAtual) return res.status(404).json({ erro: 'Venda não encontrada' })

  const dados = {}
  if (dataVenda) dados.dataVenda = new Date(dataVenda).toISOString()
  if (valor !== undefined) dados.valor = valor ? parseFloat(valor) : null
  if (frete !== undefined) dados.frete = frete ? parseFloat(frete) : null
  if (descontoValor !== undefined) {
    dados.descontoValor = descontoValor ? parseFloat(descontoValor) : null
    dados.descontoTipo = descontoValor ? (descontoTipo || 'percentual') : null
  }
  if (formaPagamento !== undefined) dados.formaPagamento = formaPagamento || null
  if (condicoesPagto !== undefined) dados.condicoesPagto = condicoesPagto || null
  if (observacoes !== undefined) dados.observacoes = observacoes || null

  if (status) {
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` })
    }
    dados.status = status
  }

  const venda = await prisma.$transaction(async (tx) => {
    await tx.venda.update({ where: { id }, data: dados })

    // Ao cancelar a venda, libera as balsas vinculadas de volta para disponível
    const cancelando = status === 'cancelado' && vendaAtual.status === 'ativo'
    if (cancelando) {
      const balsaIds = vendaAtual.balsas.map(vb => vb.balsaId)
      await tx.balsa.updateMany({
        where: { id: { in: balsaIds }, status: 'vendido' },
        data: { status: 'disponivel' }
      })
    }

    // Permite corrigir o valor individual de balsas já vinculadas — não adiciona/remove balsas da venda
    if (Array.isArray(balsas)) {
      for (const b of balsas) {
        const vinculada = vendaAtual.balsas.find(vb => vb.balsaId === parseInt(b.balsaId))
        if (!vinculada) continue
        await tx.vendaBalsa.update({
          where: { id: vinculada.id },
          data: { valor: b.valor ? parseFloat(b.valor) : null }
        })
      }
    }

    return tx.venda.findUnique({
      where: { id },
      include: { cliente: true, vendedor: { select: { id: true, nome: true } }, balsas: { include: { balsa: true } } }
    })
  })

  res.json(venda)
})

export default router

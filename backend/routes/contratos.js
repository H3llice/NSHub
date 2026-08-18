import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

const TIPOS_VALIDOS = ['locacao', 'venda']
const STATUS_VALIDOS = ['ativo', 'encerrado', 'cancelado']

// ─── Listar contratos ───────────────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { status, tipo } = req.query

  const where = {}
  if (status) where.status = status
  if (tipo) where.tipo = tipo

  const contratos = await prisma.contrato.findMany({
    where,
    include: {
      cliente: true,
      criadoPor: { select: { id: true, nome: true } },
      balsas: { include: { balsa: true } }
    },
    orderBy: { criadoEm: 'desc' }
  })

  res.json(contratos)
})

// ─── Buscar um contrato pelo ID ─────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const contrato = await prisma.contrato.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      cliente: true,
      criadoPor: { select: { id: true, nome: true } },
      balsas: { include: { balsa: true } }
    }
  })
  if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' })
  res.json(contrato)
})

// ─── Criar contrato (só admin e gerente) ────────────────────────────────────────
router.post('/', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const {
    tipo, clienteId, balsas, dataInicio, dataFim,
    valor, frete, descontoTipo, descontoValor, formaPagamento, condicoesPagto, observacoes,
    periodicidadePagamento, dataVencimento
  } = req.body

  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ erro: `Tipo de contrato inválido. Use: ${TIPOS_VALIDOS.join(', ')}` })
  }

  if (!clienteId || !Array.isArray(balsas) || balsas.length === 0 || !dataInicio) {
    return res.status(400).json({ erro: 'Cliente, ao menos uma balsa e data de início são obrigatórios' })
  }

  const balsaIds = balsas.map(b => b.balsaId)

  const periodicidade = periodicidadePagamento === 'mensal' ? 'mensal' : 'unico'

  if (valor && !dataVencimento) {
    return res.status(400).json({ erro: 'Data de vencimento é obrigatória quando há valor definido' })
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: parseInt(clienteId) } })
  if (!cliente) return res.status(400).json({ erro: 'Cliente não encontrado' })

  const balsasEncontradas = await prisma.balsa.findMany({ where: { id: { in: balsaIds.map(Number) } } })
  if (balsasEncontradas.length !== balsaIds.length) {
    return res.status(400).json({ erro: 'Uma ou mais balsas selecionadas não foram encontradas' })
  }

  // As balsas precisam ter a mesma finalidade do tipo de contrato
  const finalidadeErrada = balsasEncontradas.filter(b => b.finalidade !== tipo)
  if (finalidadeErrada.length > 0) {
    return res.status(400).json({
      erro: `As seguintes balsas não pertencem ao estoque de ${tipo}: ${finalidadeErrada.map(b => b.numeroSerie).join(', ')}`
    })
  }

  const indisponiveis = balsasEncontradas.filter(b => b.status !== 'disponivel')
  if (indisponiveis.length > 0) {
    return res.status(400).json({
      erro: `As seguintes balsas não estão disponíveis: ${indisponiveis.map(b => b.numeroSerie).join(', ')}`
    })
  }

  const ano = new Date().getFullYear()
  const ultimo = await prisma.contrato.findFirst({
    where: { ano },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultimo ? ultimo.numero + 1 : 1

  const statusBalsaAlvo = tipo === 'venda' ? 'vendido' : 'locado'

  const contrato = await prisma.$transaction(async (tx) => {
    const novoContrato = await tx.contrato.create({
      data: {
        numero: proximoNumero,
        ano,
        tipo,
        clienteId: parseInt(clienteId),
        dataInicio: new Date(dataInicio).toISOString(),
        dataFim: dataFim ? new Date(dataFim).toISOString() : null,
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
      include: { cliente: true, balsas: { include: { balsa: true } } }
    })

    await tx.balsa.updateMany({
      where: { id: { in: balsaIds.map(Number) } },
      data: { status: statusBalsaAlvo }
    })

    // Cria a primeira parcela, se houver valor definido
    if (valor && dataVencimento) {
      const dataVenc = new Date(dataVencimento)
      await tx.pagamento.create({
        data: {
          contratoId: novoContrato.id,
          valor: parseFloat(valor),
          dataVencimento: dataVenc.toISOString(),
          referencia: periodicidade === 'mensal'
            ? `${String(dataVenc.getMonth() + 1).padStart(2, '0')}/${dataVenc.getFullYear()}`
            : null
        }
      })
    }

    return novoContrato
  })

  res.json(contrato)
})

// ─── Editar contrato (só admin e gerente) ───────────────────────────────────────
// Não permite trocar as balsas vinculadas aqui — só dados do contrato e status.
router.put('/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const { dataInicio, dataFim, valor, frete, descontoTipo, descontoValor, balsas, formaPagamento, condicoesPagto, observacoes, status } = req.body

  const contratoAtual = await prisma.contrato.findUnique({
    where: { id },
    include: { balsas: true }
  })
  if (!contratoAtual) return res.status(404).json({ erro: 'Contrato não encontrado' })

  const dados = {}
  if (dataInicio) dados.dataInicio = new Date(dataInicio).toISOString()
  if (dataFim !== undefined) dados.dataFim = dataFim ? new Date(dataFim).toISOString() : null
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
    // Contrato de venda não tem "encerrado" — venda é definitiva, só pode ser cancelada
    if (contratoAtual.tipo === 'venda' && status === 'encerrado') {
      return res.status(400).json({ erro: 'Contratos de venda não podem ser "encerrados", apenas cancelados' })
    }
    dados.status = status
  }

  const contrato = await prisma.$transaction(async (tx) => {
    await tx.contrato.update({ where: { id }, data: dados })

    // Ao encerrar ou cancelar o contrato, libera as balsas vinculadas de volta para disponível
    const finalizando = status && ['encerrado', 'cancelado'].includes(status) && contratoAtual.status === 'ativo'
    if (finalizando) {
      const balsaIds = contratoAtual.balsas.map(cb => cb.balsaId)
      await tx.balsa.updateMany({
        where: { id: { in: balsaIds }, status: { in: ['locado', 'vendido'] } },
        data: { status: 'disponivel' }
      })
    }

    // Permite corrigir o valor individual de balsas já vinculadas — não adiciona/remove balsas do contrato
    if (Array.isArray(balsas)) {
      for (const b of balsas) {
        const vinculada = contratoAtual.balsas.find(cb => cb.balsaId === parseInt(b.balsaId))
        if (!vinculada) continue
        await tx.contratoBalsa.update({
          where: { id: vinculada.id },
          data: { valor: b.valor ? parseFloat(b.valor) : null }
        })
      }
    }

    return tx.contrato.findUnique({
      where: { id },
      include: { cliente: true, balsas: { include: { balsa: true } } }
    })
  })

  res.json(contrato)
})

export default router
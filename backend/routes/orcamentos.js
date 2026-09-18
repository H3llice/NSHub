import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

const STATUS_VALIDOS = ['em_andamento', 'aprovado', 'recusado', 'expirado', 'convertido']
const STATUS_ENVIO_VALIDOS = ['nao_enviado', 'enviado']
const DESCONTO_MODOS = ['conjunto', 'item']
const DESCONTO_TIPOS = ['percentual', 'fixo']

const INCLUDE_PADRAO = {
  cliente: true,
  vendedor: { select: { id: true, nome: true } },
  criadoPor: { select: { id: true, nome: true } },
  itens: { include: { produto: true, servico: true }, orderBy: { id: 'asc' } }
}

// Mesma conta usada na tela (recalcularTotaisOrcamento em js/modules/orcamentos.js)
// — duplicada de propósito, como o par recalcularValorVenda/venda.valor: aqui é
// só pra exibição (lista/detalhe), nunca persistida, então não tem risco de
// dessincronizar com o que foi de fato salvo.
function calcularTotais(orcamento) {
  const brutoItens = orcamento.itens.map(i => i.quantidade * i.valorUnitario)
  const totalBruto = brutoItens.reduce((acc, v) => acc + v, 0)

  let descontoAplicado = 0
  if (orcamento.descontoModo === 'item') {
    orcamento.itens.forEach((item, i) => {
      if (!item.descontoValor) return
      const bruto = brutoItens[i]
      const desc = item.descontoTipo === 'fixo' ? item.descontoValor : bruto * (item.descontoValor / 100)
      descontoAplicado += Math.min(desc, bruto)
    })
  } else if (orcamento.descontoValor) {
    const desc = orcamento.descontoTipo === 'fixo' ? orcamento.descontoValor : totalBruto * (orcamento.descontoValor / 100)
    descontoAplicado = Math.min(desc, totalBruto)
  }

  return { totalBruto, descontoAplicado, totalLiquido: totalBruto - descontoAplicado }
}

function comTotais(orcamento) {
  return { ...orcamento, ...calcularTotais(orcamento) }
}

// Usado por routes/vendas-orcamento.js pra saber o valor da venda no momento
// da conversão — mesma conta de calcularTotais, só que devolve direto o número.
export function totalLiquidoOrcamento(orcamento) {
  return calcularTotais(orcamento).totalLiquido
}

// Item precisa sempre apontar pra um Produto ou Servico do catálogo — "inserir
// novo" na tela primeiro cadastra em /almoxarifado/produtos ou /servicos, depois
// referencia o id aqui. nome/detalhes/valorUnitario ficam copiados no Item
// (podem ser corrigidos por orçamento, sem mexer no catálogo).
async function validarItens(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    return { erro: 'Ao menos um produto/serviço é obrigatório' }
  }

  for (const item of itens) {
    if (item.tipo !== 'produto' && item.tipo !== 'servico') {
      return { erro: 'Tipo de item inválido. Use: produto | servico' }
    }
    if (!item.nome || item.valorUnitario === undefined || item.valorUnitario === null || item.valorUnitario === '') {
      return { erro: 'Nome e valor unitário são obrigatórios em todos os itens' }
    }
    if (item.tipo === 'produto' && !item.produtoId) {
      return { erro: 'Selecione o produto do catálogo' }
    }
    if (item.tipo === 'servico' && !item.servicoId) {
      return { erro: 'Selecione o serviço do catálogo' }
    }
  }

  const produtoIds = itens.filter(i => i.tipo === 'produto').map(i => parseInt(i.produtoId))
  const servicoIds = itens.filter(i => i.tipo === 'servico').map(i => parseInt(i.servicoId))

  const [produtos, servicos] = await Promise.all([
    produtoIds.length ? prisma.produto.findMany({ where: { id: { in: produtoIds } } }) : [],
    servicoIds.length ? prisma.servico.findMany({ where: { id: { in: servicoIds } } }) : []
  ])

  if (produtos.length !== new Set(produtoIds).size) return { erro: 'Um ou mais produtos selecionados não foram encontrados' }
  if (servicos.length !== new Set(servicoIds).size) return { erro: 'Um ou mais serviços selecionados não foram encontrados' }

  return null
}

function montarDadosItens(itens, descontoModo) {
  return itens.map(item => ({
    tipo: item.tipo,
    produtoId: item.tipo === 'produto' ? parseInt(item.produtoId) : null,
    servicoId: item.tipo === 'servico' ? parseInt(item.servicoId) : null,
    nome: item.nome,
    detalhes: item.detalhes || null,
    quantidade: item.quantidade ? parseFloat(item.quantidade) : 1,
    valorUnitario: parseFloat(item.valorUnitario),
    // Desconto por item só é gravado quando o orçamento inteiro está no modo "item"
    // — evita ficar com valor "fantasma" salvo se o usuário mudar de modo depois.
    descontoTipo: descontoModo === 'item' && item.descontoValor ? (item.descontoTipo || 'percentual') : null,
    descontoValor: descontoModo === 'item' && item.descontoValor ? parseFloat(item.descontoValor) : null,
  }))
}

// ─── Listar orçamentos (paginado) ───────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { status, ano, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const where = {}
  if (status) where.status = status
  if (ano && !isNaN(ano)) where.ano = parseInt(ano)

  const [orcamentos, total] = await Promise.all([
    prisma.orcamento.findMany({
      where,
      include: INCLUDE_PADRAO,
      orderBy: { criadoEm: 'desc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.orcamento.count({ where })
  ])

  res.json({
    orcamentos: orcamentos.map(comTotais),
    total,
    pagina: paginaNum,
    totalPaginas: Math.ceil(total / porPagina)
  })
})

// ─── Buscar um orçamento pelo ID ────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const orcamento = await prisma.orcamento.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_PADRAO
  })
  if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' })
  res.json(comTotais(orcamento))
})

// ─── Criar orçamento (só admin e gerente — mesma regra de Venda) ───────────────
router.post('/', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const {
    clienteId, email, telefone, vendedorId,
    dataOrcamento, validade, previsaoEntrega,
    descricao, observacoes, status,
    descontoModo, descontoTipo, descontoValor,
    itens
  } = req.body

  if (!clienteId) return res.status(400).json({ erro: 'Cliente é obrigatório' })

  if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: `Situação inválida. Use: ${STATUS_VALIDOS.join(', ')}` })
  }

  const modo = DESCONTO_MODOS.includes(descontoModo) ? descontoModo : 'conjunto'

  const erroItens = await validarItens(itens)
  if (erroItens) return res.status(400).json(erroItens)

  const cliente = await prisma.cliente.findUnique({ where: { id: parseInt(clienteId) } })
  if (!cliente) return res.status(400).json({ erro: 'Cliente não encontrado' })

  const ano = new Date().getFullYear()
  const ultimo = await prisma.orcamento.findFirst({ where: { ano }, orderBy: { numero: 'desc' } })
  const proximoNumero = ultimo ? ultimo.numero + 1 : 1

  const orcamento = await prisma.orcamento.create({
    data: {
      numero: proximoNumero,
      ano,
      clienteId: parseInt(clienteId),
      email: email || cliente.email || null,
      telefone: telefone || cliente.telefone || null,
      vendedorId: vendedorId ? parseInt(vendedorId) : null,
      dataOrcamento: dataOrcamento ? new Date(dataOrcamento).toISOString() : undefined,
      validade: validade ? new Date(validade).toISOString() : null,
      previsaoEntrega: previsaoEntrega ? new Date(previsaoEntrega).toISOString() : null,
      descricao: descricao || null,
      observacoes: observacoes || null,
      status: status || undefined,
      descontoModo: modo,
      descontoTipo: modo === 'conjunto' && descontoValor ? (descontoTipo || 'percentual') : null,
      descontoValor: modo === 'conjunto' && descontoValor ? parseFloat(descontoValor) : null,
      criadoPorId: req.usuario.id,
      itens: { create: montarDadosItens(itens, modo) }
    },
    include: INCLUDE_PADRAO
  })

  res.json(comTotais(orcamento))
})

// ─── Editar orçamento (só admin e gerente) ─────────────────────────────────────
// Editável em qualquer situação, igual Certificado — não é um fluxo de
// assinaturas que trava após aprovado/recusado. Exceção: "convertido" só é
// setado pelo POST /vendas-orcamento (que cria a Venda de verdade) — depois
// de convertido, o orçamento trava (mesma regra de "cancelado" do Certificado),
// pra não desalinhar do que já virou venda/contas a receber.
router.put('/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const atual = await prisma.orcamento.findUnique({ where: { id } })
  if (!atual) return res.status(404).json({ erro: 'Orçamento não encontrado' })

  if (atual.status === 'convertido') {
    return res.status(400).json({ erro: 'Orçamento já convertido em venda não pode ser editado' })
  }

  const {
    clienteId, email, telefone, vendedorId,
    dataOrcamento, validade, previsaoEntrega,
    descricao, observacoes,
    descontoModo, descontoTipo, descontoValor,
    status, statusEnvio,
    itens
  } = req.body

  const modo = DESCONTO_MODOS.includes(descontoModo) ? descontoModo : atual.descontoModo

  if (itens !== undefined) {
    const erroItens = await validarItens(itens)
    if (erroItens) return res.status(400).json(erroItens)
  }

  if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: `Situação inválida. Use: ${STATUS_VALIDOS.join(', ')}` })
  }
  if (status === 'convertido') {
    return res.status(400).json({ erro: 'Use "Criar Venda" para converter o orçamento — não dá pra marcar direto' })
  }
  if (statusEnvio !== undefined && !STATUS_ENVIO_VALIDOS.includes(statusEnvio)) {
    return res.status(400).json({ erro: `Status de envio inválido. Use: ${STATUS_ENVIO_VALIDOS.join(', ')}` })
  }

  const dados = {}
  if (clienteId !== undefined) dados.clienteId = parseInt(clienteId)
  if (email !== undefined) dados.email = email || null
  if (telefone !== undefined) dados.telefone = telefone || null
  if (vendedorId !== undefined) dados.vendedorId = vendedorId ? parseInt(vendedorId) : null
  if (dataOrcamento !== undefined) dados.dataOrcamento = new Date(dataOrcamento).toISOString()
  if (validade !== undefined) dados.validade = validade ? new Date(validade).toISOString() : null
  if (previsaoEntrega !== undefined) dados.previsaoEntrega = previsaoEntrega ? new Date(previsaoEntrega).toISOString() : null
  if (descricao !== undefined) dados.descricao = descricao || null
  if (observacoes !== undefined) dados.observacoes = observacoes || null
  if (status !== undefined) dados.status = status
  if (statusEnvio !== undefined) dados.statusEnvio = statusEnvio

  if (descontoModo !== undefined || descontoValor !== undefined) {
    dados.descontoModo = modo
    dados.descontoTipo = modo === 'conjunto' && descontoValor ? (descontoTipo || 'percentual') : null
    dados.descontoValor = modo === 'conjunto' && descontoValor ? parseFloat(descontoValor) : null
  }

  const orcamento = await prisma.$transaction(async (tx) => {
    if (itens !== undefined) {
      await tx.itemOrcamento.deleteMany({ where: { orcamentoId: id } })
      dados.itens = { create: montarDadosItens(itens, modo) }
    }

    await tx.orcamento.update({ where: { id }, data: dados })
    return tx.orcamento.findUnique({ where: { id }, include: INCLUDE_PADRAO })
  })

  res.json(comTotais(orcamento))
})

// ─── Excluir orçamento (só admin e gerente) ────────────────────────────────────
router.delete('/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const orcamento = await prisma.orcamento.findUnique({ where: { id } })
  if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' })

  const venda = await prisma.vendaOrcamento.findUnique({ where: { orcamentoId: id } })
  if (venda) return res.status(400).json({ erro: 'Este orçamento já virou venda e não pode ser excluído' })

  await prisma.itemOrcamento.deleteMany({ where: { orcamentoId: id } })
  await prisma.orcamento.delete({ where: { id } })

  res.json({ ok: true })
})

export default router

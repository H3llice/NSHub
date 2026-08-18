import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ═══════════════════════════════ PRODUTOS ═══════════════════════════════════════

// ─── Listar produtos ───────────────────────────────────────────────────────────
router.get('/produtos', autenticar, async (req, res) => {
  const produtos = await prisma.produto.findMany({
    orderBy: { nome: 'asc' }
  })
  res.json(produtos)
})

// ─── Buscar um produto ─────────────────────────────────────────────────────────
router.get('/produtos/:id', autenticar, async (req, res) => {
  const produto = await prisma.produto.findUnique({
    where: { id: Number(req.params.id) }
  })

  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' })

  res.json(produto)
})

// ─── Cadastrar produto (só admin e gerente) ────────────────────────────────────
router.post('/produtos', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const { codigo, nome, unidade, valor, quantidade } = req.body

  if (!codigo || !nome || !unidade) {
    return res.status(400).json({ erro: 'Código, nome e unidade são obrigatórios' })
  }

  const existe = await prisma.produto.findUnique({ where: { codigo } })
  if (existe) {
    return res.status(400).json({ erro: 'Já existe um produto cadastrado com esse código' })
  }

  const produto = await prisma.produto.create({
    data: {
      codigo,
      nome,
      unidade,
      valor: valor !== undefined && valor !== null && valor !== '' ? parseFloat(valor) : null,
      quantidade: quantidade !== undefined && quantidade !== null && quantidade !== '' ? parseFloat(quantidade) : 0
    }
  })

  res.json(produto)
})

// ─── Editar produto — inclui corrigir quantidade em estoque (só admin e gerente) ─
router.put('/produtos/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const { codigo, nome, unidade, valor, quantidade } = req.body

  const dados = {}
  if (codigo) dados.codigo = codigo
  if (nome) dados.nome = nome
  if (unidade) dados.unidade = unidade
  if (valor !== undefined) dados.valor = valor !== null && valor !== '' ? parseFloat(valor) : null
  if (quantidade !== undefined) dados.quantidade = parseFloat(quantidade) || 0

  try {
    const produto = await prisma.produto.update({
      where: { id },
      data: dados
    })
    res.json(produto)
  } catch {
    res.status(404).json({ erro: 'Produto não encontrado' })
  }
})

// ═══════════════════════════════ PEDIDOS ═════════════════════════════════════════

// ─── Listar pedidos de almoxarifado ────────────────────────────────────────────
router.get('/pedidos', autenticar, async (req, res) => {
  const pedidos = await prisma.pedidoAlmoxarifado.findMany({
    include: {
      itens: { include: { produto: true } },
      solicitante: { select: { id: true, nome: true, email: true, perfil: true } }
    },
    orderBy: { criadoEm: 'desc' }
  })
  res.json(pedidos)
})

// ─── Buscar um pedido ──────────────────────────────────────────────────────────
router.get('/pedidos/:id', autenticar, async (req, res) => {
  const pedido = await prisma.pedidoAlmoxarifado.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      itens: { include: { produto: true } },
      solicitante: { select: { id: true, nome: true, email: true, perfil: true } }
    }
  })

  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' })

  res.json(pedido)
})

// ─── Criar pedido — abate o estoque dos produtos escolhidos ────────────────────
// Body esperado: { observacoes, itens: [{ produtoId, quantidade }] }
router.post('/pedidos', autenticar, async (req, res) => {
  const { observacoes, itens } = req.body

  if (!itens?.length) {
    return res.status(400).json({ erro: 'Informe ao menos um item' })
  }

  for (const item of itens) {
    if (!item.produtoId || !item.quantidade || parseFloat(item.quantidade) <= 0) {
      return res.status(400).json({ erro: 'Todos os itens precisam de produto e quantidade válida' })
    }
  }

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      // Confere estoque disponível de cada item dentro da própria transação
      const insuficientes = []
      const produtosMap = {}

      for (const item of itens) {
        const produto = await tx.produto.findUnique({ where: { id: Number(item.produtoId) } })
        if (!produto) {
          insuficientes.push(`Produto #${item.produtoId} não encontrado`)
          continue
        }
        produtosMap[produto.id] = produto
        if (produto.quantidade < parseFloat(item.quantidade)) {
          insuficientes.push(`${produto.nome} (disponível: ${produto.quantidade}, pedido: ${item.quantidade})`)
        }
      }

      if (insuficientes.length > 0) {
        throw new EstoqueInsuficiente(insuficientes)
      }

      // Abate o estoque
      for (const item of itens) {
        await tx.produto.update({
          where: { id: Number(item.produtoId) },
          data: { quantidade: { decrement: parseFloat(item.quantidade) } }
        })
      }

      const ano = new Date().getFullYear()
      const ultimo = await tx.pedidoAlmoxarifado.findFirst({
        where: { ano },
        orderBy: { numero: 'desc' }
      })
      const proximoNumero = ultimo ? ultimo.numero + 1 : 1

      return tx.pedidoAlmoxarifado.create({
        data: {
          numero: proximoNumero,
          ano,
          solicitanteId: req.usuario.id,
          observacoes: observacoes || null,
          itens: {
            create: itens.map(i => ({
              produtoId: Number(i.produtoId),
              quantidade: parseFloat(i.quantidade),
              valorUni: produtosMap[i.produtoId]?.valor ?? null
            }))
          }
        },
        include: { itens: { include: { produto: true } }, solicitante: { select: { id: true, nome: true, email: true, perfil: true } } }
      })
    })

    res.json(pedido)
  } catch (err) {
    if (err instanceof EstoqueInsuficiente) {
      return res.status(400).json({ erro: 'Estoque insuficiente para os itens abaixo', itens: err.itens })
    }
    throw err
  }
})

class EstoqueInsuficiente extends Error {
  constructor(itens) {
    super('Estoque insuficiente')
    this.itens = itens
  }
}

export default router

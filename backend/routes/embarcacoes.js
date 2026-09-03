import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

// ─── Listar embarcações ────────────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const embarcacoes = await prisma.embarcacao.findMany({
    include: { armador: true },
    orderBy: { nome: 'asc' }
  })
  res.json(embarcacoes)
})

// ─── Buscar embarcação por nome do navio (autocomplete) ───────────────────────
router.get('/buscar', autenticar, async (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])

  const embarcacoes = await prisma.embarcacao.findMany({
    where: { nome: { contains: q, mode: 'insensitive' } },
    include: { armador: true },
    take: 10
  })

  res.json(embarcacoes)
})

// ─── Buscar uma embarcação pelo ID ─────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const embarcacao = await prisma.embarcacao.findUnique({
    where: { id: Number(req.params.id) },
    include: { armador: true }
  })
  if (!embarcacao) return res.status(404).json({ erro: 'Embarcação não encontrada' })
  res.json(embarcacao)
})

// ─── Cadastrar embarcação (qualquer usuário logado) ────────────────────────────
router.post('/', autenticar, async (req, res) => {
  const { nome, armadorId, portoRegistro, email, telefone } = req.body

  if (!nome || !armadorId) {
    return res.status(400).json({ erro: 'Nome do navio e armador são obrigatórios' })
  }

  const armador = await prisma.cliente.findUnique({ where: { id: parseInt(armadorId) } })
  if (!armador) {
    return res.status(400).json({ erro: 'Armador não encontrado' })
  }

  const embarcacao = await prisma.embarcacao.create({
    data: {
      nome,
      armadorId: parseInt(armadorId),
      portoRegistro: portoRegistro || null,
      email: email || null,
      telefone: telefone || null,
    },
    include: { armador: true }
  })

  res.json(embarcacao)
})

// ─── Editar embarcação (qualquer usuário logado) ───────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { nome, armadorId, portoRegistro, email, telefone } = req.body

  const dados = {}
  if (nome) dados.nome = nome
  if (armadorId) {
    const armador = await prisma.cliente.findUnique({ where: { id: parseInt(armadorId) } })
    if (!armador) return res.status(400).json({ erro: 'Armador não encontrado' })
    dados.armadorId = parseInt(armadorId)
  }
  if (portoRegistro !== undefined) dados.portoRegistro = portoRegistro || null
  if (email !== undefined) dados.email = email || null
  if (telefone !== undefined) dados.telefone = telefone || null

  try {
    const embarcacao = await prisma.embarcacao.update({ where: { id }, data: dados, include: { armador: true } })
    res.json(embarcacao)
  } catch {
    res.status(404).json({ erro: 'Embarcação não encontrada' })
  }
})

export default router

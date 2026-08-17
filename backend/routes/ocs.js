import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

// ─── Listar todos ──────────────────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const fornecedores = await prisma.fornecedor.findMany({
    orderBy: { nome: 'asc' }
  })
  res.json(fornecedores)
})

// ─── Buscar por nome/documento (autocomplete) — precisa vir ANTES de /:id ──────
router.get('/buscar', autenticar, async (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])

  const fornecedores = await prisma.fornecedor.findMany({
    where: {
      OR: [
        { nome: { contains: q, mode: 'insensitive' } },
        { documento: { contains: q } }
      ]
    },
    take: 5
  })
  res.json(fornecedores)
})

// ─── Buscar um fornecedor pelo ID ───────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: Number(req.params.id) } })
  if (!fornecedor) return res.status(404).json({ erro: 'Fornecedor não encontrado' })
  res.json(fornecedor)
})

// ─── Listar vendedores de um fornecedor ────────────────────────────────────────
router.get('/:id/vendedores', autenticar, async (req, res) => {
  const vendedores = await prisma.vendedor.findMany({
    where: { fornecedorId: Number(req.params.id) }
  })
  res.json(vendedores)
})

// ─── Criar fornecedor ───────────────────────────────────────────────────────────
router.post('/', autenticar, async (req, res) => {
  const fornecedor = await prisma.fornecedor.create({ data: req.body })
  res.json(fornecedor)
})

// ─── Editar fornecedor ──────────────────────────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { nome, documento, endereco, cidade, cep, inscEstadual, telefone } = req.body

  const dados = {}
  if (nome) dados.nome = nome
  if (documento !== undefined) dados.documento = documento || null
  if (endereco !== undefined) dados.endereco = endereco || null
  if (cidade !== undefined) dados.cidade = cidade || null
  if (cep !== undefined) dados.cep = cep || null
  if (inscEstadual !== undefined) dados.inscEstadual = inscEstadual || null
  if (telefone !== undefined) dados.telefone = telefone || null

  try {
    const fornecedor = await prisma.fornecedor.update({ where: { id }, data: dados })
    res.json(fornecedor)
  } catch {
    res.status(404).json({ erro: 'Fornecedor não encontrado' })
  }
})

export default router
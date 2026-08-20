import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

router.get('/', autenticar, async (req, res) => {
  const fornecedores = await prisma.fornecedor.findMany()
  res.json(fornecedores)
})

router.get('/:id/vendedores', autenticar, async (req, res) => {
  const vendedores = await prisma.vendedor.findMany({
    where: { fornecedorId: Number(req.params.id) }
  })
  res.json(vendedores)
})

router.post('/', autenticar, async (req, res) => {
  const fornecedor = await prisma.fornecedor.create({ data: req.body })
  res.json(fornecedor)
})

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

export default router
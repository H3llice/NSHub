import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

// ─── Listar fornecedores (paginado, com filtros opcionais por nome/doc/cidade) ─
router.get('/', autenticar, async (req, res) => {
  const { nome, documento, cidade, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const where = {}
  if (nome) where.nome = { contains: nome, mode: 'insensitive' }
  if (documento) where.documento = { contains: documento.replace(/\D/g, '') || documento }
  if (cidade) where.cidade = { contains: cidade, mode: 'insensitive' }

  const [fornecedores, total] = await Promise.all([
    prisma.fornecedor.findMany({
      where,
      orderBy: { nome: 'asc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.fornecedor.count({ where })
  ])

  res.json({ fornecedores, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
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

// ─── Buscar um fornecedor pelo ID ──────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: Number(req.params.id) } })
  if (!fornecedor) return res.status(404).json({ erro: 'Fornecedor não encontrado' })
  res.json(fornecedor)
})

// ─── Editar fornecedor ──────────────────────────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { nome, endereco, cidade, cep, documento, inscEstadual, telefone, chavePix, tipoConta, agencia, contaNumero } = req.body

  const dados = {}
  if (nome) dados.nome = nome
  if (endereco !== undefined) dados.endereco = endereco || null
  if (cidade !== undefined) dados.cidade = cidade || null
  if (cep !== undefined) dados.cep = cep || null
  if (documento !== undefined) dados.documento = documento || null
  if (inscEstadual !== undefined) dados.inscEstadual = inscEstadual || null
  if (telefone !== undefined) dados.telefone = telefone || null
  if (chavePix !== undefined) dados.chavePix = chavePix || null
  if (tipoConta !== undefined) dados.tipoConta = tipoConta || null
  if (agencia !== undefined) dados.agencia = agencia || null
  if (contaNumero !== undefined) dados.contaNumero = contaNumero || null

  try {
    const fornecedor = await prisma.fornecedor.update({ where: { id }, data: dados })
    res.json(fornecedor)
  } catch {
    res.status(404).json({ erro: 'Fornecedor não encontrado' })
  }
})

export default router
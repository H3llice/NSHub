import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

const TIPOS_VALIDOS = ['fisica', 'juridica']

// ─── Listar clientes ───────────────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const clientes = await prisma.cliente.findMany({
    orderBy: { nome: 'asc' }
  })
  res.json(clientes)
})

// ─── Buscar cliente por nome ou CPF/CNPJ (autocomplete) ───────────────────────
router.get('/buscar', autenticar, async (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])

  const clientes = await prisma.cliente.findMany({
    where: {
      OR: [
        { nome: { contains: q, mode: 'insensitive' } },
        { cpfCnpj: { contains: q.replace(/\D/g, '') } }
      ]
    },
    take: 10
  })

  res.json(clientes)
})

// ─── Buscar um cliente pelo ID ─────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: Number(req.params.id) }
  })
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado' })
  res.json(cliente)
})

// ─── Cadastrar cliente (qualquer usuário logado) ──────────────────────────────
router.post('/', autenticar, async (req, res) => {
  const { tipoPessoa, cpfCnpj, nome, telefone, email, endereco, cidade } = req.body

  if (!tipoPessoa || !cpfCnpj || !nome) {
    return res.status(400).json({ erro: 'Tipo de pessoa, CPF/CNPJ e nome são obrigatórios' })
  }

  if (!TIPOS_VALIDOS.includes(tipoPessoa)) {
    return res.status(400).json({ erro: `Tipo de pessoa inválido. Use: ${TIPOS_VALIDOS.join(', ')}` })
  }

  const cpfCnpjLimpo = cpfCnpj.replace(/\D/g, '')

  const existe = await prisma.cliente.findUnique({ where: { cpfCnpj: cpfCnpjLimpo } })
  if (existe) {
    return res.status(400).json({ erro: 'Já existe um cliente cadastrado com esse CPF/CNPJ', cliente: existe })
  }

  const cliente = await prisma.cliente.create({
    data: {
      tipoPessoa,
      cpfCnpj: cpfCnpjLimpo,
      nome,
      telefone: telefone || null,
      email: email || null,
      endereco: endereco || null,
      cidade: cidade || null,
    }
  })

  res.json(cliente)
})

// ─── Editar cliente (qualquer usuário logado) ─────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { tipoPessoa, cpfCnpj, nome, telefone, email, endereco, cidade } = req.body

  const dados = {}
  if (tipoPessoa) {
    if (!TIPOS_VALIDOS.includes(tipoPessoa)) {
      return res.status(400).json({ erro: `Tipo de pessoa inválido. Use: ${TIPOS_VALIDOS.join(', ')}` })
    }
    dados.tipoPessoa = tipoPessoa
  }
  if (cpfCnpj) dados.cpfCnpj = cpfCnpj.replace(/\D/g, '')
  if (nome) dados.nome = nome
  if (telefone !== undefined) dados.telefone = telefone || null
  if (email !== undefined) dados.email = email || null
  if (endereco !== undefined) dados.endereco = endereco || null
  if (cidade !== undefined) dados.cidade = cidade || null

  try {
    const cliente = await prisma.cliente.update({ where: { id }, data: dados })
    res.json(cliente)
  } catch {
    res.status(404).json({ erro: 'Cliente não encontrado' })
  }
})

export default router
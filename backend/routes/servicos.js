import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ─── Listar serviços (paginado) ─────────────────────────────────────────────────
// ?todas=1 devolve tudo sem paginar — mesmo uso do /almoxarifado/produtos?todas=1,
// pro select de item do Orçamento, que precisa do catálogo inteiro pra buscar/escolher.
router.get('/', autenticar, async (req, res) => {
  if (req.query.todas) {
    const servicos = await prisma.servico.findMany({ orderBy: { nome: 'asc' } })
    return res.json(servicos)
  }

  const { pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const [servicos, total] = await Promise.all([
    prisma.servico.findMany({
      orderBy: { nome: 'asc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.servico.count()
  ])

  res.json({ servicos, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Buscar um serviço ──────────────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const servico = await prisma.servico.findUnique({ where: { id: Number(req.params.id) } })
  if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' })
  res.json(servico)
})

// ─── Cadastrar serviço (só admin e gerente) ────────────────────────────────────
router.post('/', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const { nome, descricao, valor } = req.body

  if (!nome) {
    return res.status(400).json({ erro: 'Nome é obrigatório' })
  }

  const servico = await prisma.servico.create({
    data: {
      nome,
      descricao: descricao || null,
      valor: valor !== undefined && valor !== null && valor !== '' ? parseFloat(valor) : null,
    }
  })

  res.json(servico)
})

// ─── Editar serviço (só admin e gerente) ───────────────────────────────────────
router.put('/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const { nome, descricao, valor } = req.body

  const dados = {}
  if (nome) dados.nome = nome
  if (descricao !== undefined) dados.descricao = descricao || null
  if (valor !== undefined) dados.valor = valor !== null && valor !== '' ? parseFloat(valor) : null

  try {
    const servico = await prisma.servico.update({ where: { id }, data: dados })
    res.json(servico)
  } catch {
    res.status(404).json({ erro: 'Serviço não encontrado' })
  }
})

// ─── Excluir serviço (só admin) ─────────────────────────────────────────────────
router.delete('/:id', autenticar, exigirPerfil('admin'), async (req, res) => {
  const id = Number(req.params.id)

  try {
    await prisma.servico.delete({ where: { id } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ erro: 'Serviço não encontrado' })
  }
})

export default router

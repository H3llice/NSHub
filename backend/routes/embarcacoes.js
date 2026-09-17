import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ─── Listar embarcações (paginado, com filtros opcionais por navio/armador) ───
router.get('/', autenticar, async (req, res) => {
  const { nome, armador, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const where = {}
  if (nome) where.nome = { contains: nome, mode: 'insensitive' }
  if (armador) where.armador = { nome: { contains: armador, mode: 'insensitive' } }

  const [embarcacoes, total] = await Promise.all([
    prisma.embarcacao.findMany({
      where,
      include: { armador: true },
      orderBy: { nome: 'asc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.embarcacao.count({ where })
  ])

  res.json({ embarcacoes, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
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

// ─── Excluir embarcação (só gerente/admin) ─────────────────────────────────────
// Bloqueia se existir OS/Relatório/Certificado vinculado — cadastro não pode
// levar histórico operacional junto sem o usuário decidir isso explicitamente
// (ver Ordens de Serviço/Relatórios/Certificados dessa embarcação primeiro).
router.delete('/:id', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const embarcacao = await prisma.embarcacao.findUnique({ where: { id } })
  if (!embarcacao) return res.status(404).json({ erro: 'Embarcação não encontrada' })

  const [qtdOS, qtdRelatorios, qtdCertificados] = await Promise.all([
    prisma.ordemServico.count({ where: { embarcacaoId: id } }),
    prisma.relatorio.count({ where: { embarcacaoId: id } }),
    prisma.certificado.count({ where: { embarcacaoId: id } }),
  ])

  if (qtdOS || qtdRelatorios || qtdCertificados) {
    return res.status(400).json({
      erro: `Não é possível excluir: existem ${qtdOS} Ordem(ns) de Serviço, ${qtdRelatorios} Relatório(s) e ${qtdCertificados} Certificado(s) vinculados a esta embarcação.`
    })
  }

  await prisma.embarcacao.delete({ where: { id } })
  res.json({ ok: true })
})

export default router

import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

const FINALIDADES_VALIDAS = ['locacao', 'venda']
const STATUS_VALIDOS = ['disponivel', 'locado', 'vendido']

// ─── Listar balsas ─────────────────────────────────────────────────────────────
// GET /estoque?finalidade=locacao        → só disponíveis dessa finalidade
// GET /estoque?finalidade=locacao&todas=1 → inclui locadas/vendidas também
router.get('/', autenticar, async (req, res) => {
  const { finalidade, todas } = req.query

  const where = {}

  if (finalidade) {
    if (!FINALIDADES_VALIDAS.includes(finalidade)) {
      return res.status(400).json({ erro: `Finalidade inválida. Use: ${FINALIDADES_VALIDAS.join(', ')}` })
    }
    where.finalidade = finalidade
  }

  if (!todas) {
    where.status = 'disponivel'
  }

  const balsas = await prisma.balsa.findMany({
    where,
    orderBy: { criadoEm: 'desc' }
  })

  res.json(balsas)
})

// ─── Buscar uma balsa ──────────────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const balsa = await prisma.balsa.findUnique({
    where: { id: Number(req.params.id) }
  })

  if (!balsa) return res.status(404).json({ erro: 'Balsa não encontrada' })

  res.json(balsa)
})

// ─── Cadastrar balsa (só admin e gerente) ─────────────────────────────────────
router.post('/', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const {
    fabricante, numeroSerie, modelo, anoFabricacao,
    capacidade, tipo, armazem, finalidade
  } = req.body

  if (!fabricante || !numeroSerie || !modelo || !anoFabricacao || !capacidade || !tipo || !finalidade) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios, exceto armazém' })
  }

  if (!FINALIDADES_VALIDAS.includes(finalidade)) {
    return res.status(400).json({ erro: `Finalidade inválida. Use: ${FINALIDADES_VALIDAS.join(', ')}` })
  }

  const existe = await prisma.balsa.findUnique({ where: { numeroSerie } })
  if (existe) {
    return res.status(400).json({ erro: 'Já existe uma balsa cadastrada com esse número de série' })
  }

  const balsa = await prisma.balsa.create({
    data: {
      fabricante,
      numeroSerie,
      modelo,
      anoFabricacao: Number(anoFabricacao),
      capacidade: Number(capacidade),
      tipo,
      armazem: armazem || null,
      finalidade
    }
  })

  res.json(balsa)
})

// ─── Editar balsa — inclui trocar status: disponivel | locado | vendido (só admin e gerente) ─
router.put('/:id', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const id = Number(req.params.id)
  const {
    fabricante, numeroSerie, modelo, anoFabricacao,
    capacidade, tipo, armazem, finalidade, status
  } = req.body

  const dados = {}
  if (fabricante) dados.fabricante = fabricante
  if (numeroSerie) dados.numeroSerie = numeroSerie
  if (modelo) dados.modelo = modelo
  if (anoFabricacao) dados.anoFabricacao = Number(anoFabricacao)
  if (capacidade) dados.capacidade = Number(capacidade)
  if (tipo) dados.tipo = tipo
  if (armazem !== undefined) dados.armazem = armazem || null

  if (finalidade) {
    if (!FINALIDADES_VALIDAS.includes(finalidade)) {
      return res.status(400).json({ erro: `Finalidade inválida. Use: ${FINALIDADES_VALIDAS.join(', ')}` })
    }
    dados.finalidade = finalidade
  }

  if (status) {
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` })
    }
    dados.status = status
  }

  try {
    const balsa = await prisma.balsa.update({
      where: { id },
      data: dados
    })
    res.json(balsa)
  } catch {
    res.status(404).json({ erro: 'Balsa não encontrada' })
  }
})

export default router
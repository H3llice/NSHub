import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ─── Consultar a trilha de auditoria (só admin, paginado) ──────────────────────
// Os registros são gravados por middleware/auditoria.js
router.get('/', autenticar, exigirPerfil('admin'), async (req, res) => {
  const { usuarioId, entidade, entidadeId, de, ate, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina) || 1

  const where = {}
  if (usuarioId) where.usuarioId = parseInt(usuarioId)
  if (entidade) where.entidade = entidade
  if (entidadeId) where.entidadeId = parseInt(entidadeId)
  if (de || ate) {
    where.criadoEm = {}
    if (de) where.criadoEm.gte = new Date(de)
    if (ate) where.criadoEm.lte = new Date(ate + 'T23:59:59')
  }

  const [registros, total, entidades] = await Promise.all([
    prisma.logAuditoria.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.logAuditoria.count({ where }),
    prisma.logAuditoria.findMany({ distinct: ['entidade'], select: { entidade: true }, orderBy: { entidade: 'asc' } })
  ])

  res.json({
    registros,
    total,
    pagina: paginaNum,
    totalPaginas: Math.ceil(total / porPagina),
    entidades: entidades.map(e => e.entidade)
  })
})

export default router

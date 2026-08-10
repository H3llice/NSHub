import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

// Status em que a OC pode ter anexos adicionados
const STATUS_PERMITE_ADICIONAR = ['aberta', 'aguardando_aprovacao', 'recusada', 'aprovada']
// Status em que a OC pode ter anexos removidos (mais restrito — não inclui 'aprovada')
const STATUS_PERMITE_REMOVER = ['aberta', 'aguardando_aprovacao', 'recusada']

// Configuração do multer — onde e como salvar os arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/')
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const upload = multer({ storage })

// Upload de anexo para uma OC
router.post('/:ocId', autenticar, upload.single('arquivo'), async (req, res) => {
  const { ocId } = req.params
  const { tipo } = req.body

  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' })

  const oc = await prisma.ordemCompra.findUnique({ where: { id: parseInt(ocId) } })
  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })

  if (!STATUS_PERMITE_ADICIONAR.includes(oc.status)) {
    return res.status(400).json({ erro: `Não é possível adicionar anexos a uma OC com status "${oc.status}"` })
  }

  const anexo = await prisma.anexo.create({
    data: {
      ocId: parseInt(ocId),
      nomeOriginal: req.file.originalname,
      nomeArquivo: req.file.filename,
      tipo: tipo || 'outro',
      mimeType: req.file.mimetype,
    }
  })

  res.json(anexo)
})

// Listar anexos de uma OC
router.get('/:ocId', autenticar, async (req, res) => {
  const anexos = await prisma.anexo.findMany({
    where: { ocId: parseInt(req.params.ocId) }
  })
  res.json(anexos)
})

// Deletar anexo
router.delete('/:id', autenticar, async (req, res) => {
  const anexo = await prisma.anexo.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!anexo) return res.status(404).json({ erro: 'Anexo não encontrado' })

  const oc = await prisma.ordemCompra.findUnique({ where: { id: anexo.ocId } })
  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })

  if (!STATUS_PERMITE_REMOVER.includes(oc.status)) {
    return res.status(400).json({ erro: `Não é possível remover anexos de uma OC com status "${oc.status}"` })
  }

  await prisma.anexo.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ ok: true })
})

export default router
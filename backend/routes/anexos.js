import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { prisma } from '../server.js'

const router = Router()

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
router.post('/:ocId', upload.single('arquivo'), async (req, res) => {
  const { ocId } = req.params
  const { tipo } = req.body

  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' })

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
router.get('/:ocId', async (req, res) => {
  const anexos = await prisma.anexo.findMany({
    where: { ocId: parseInt(req.params.ocId) }
  })
  res.json(anexos)
})

// Deletar anexo
router.delete('/:id', async (req, res) => {
  await prisma.anexo.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ ok: true })
})

export default router
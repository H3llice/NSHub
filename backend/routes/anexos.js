import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

// Status em que a OC pode ter anexos adicionados
const STATUS_PERMITE_ADICIONAR = ['aberta', 'aguardando_aprovacao', 'recusada', 'aprovada']
// Status em que a OC pode ter anexos removidos (mais restrito — não inclui 'aprovada')
const STATUS_PERMITE_REMOVER = ['aberta', 'aguardando_aprovacao', 'recusada']

// Extensões aceitas → mimeType gravado no Anexo. A pasta uploads/ é servida
// estaticamente na mesma origem do app, então aceitar qualquer extensão deixava
// subir um .html/.svg que rodaria script com a sessão de quem abrisse o anexo.
// O mimeType vem daqui, e não do que o navegador mandou, porque o PDF da OC
// (routes/pdf.js) decide por ele se mescla como PDF ou como imagem.
const TIPOS_PERMITIDOS = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}
const TAMANHO_MAXIMO_MB = 20

// Configuração do multer — onde e como salvar os arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/')
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname).toLowerCase())
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const permitido = path.extname(file.originalname).toLowerCase() in TIPOS_PERMITIDOS
    if (!permitido) req.arquivoRecusado = true
    cb(null, permitido)
  },
  limits: { fileSize: TAMANHO_MAXIMO_MB * 1024 * 1024 }
})

// Erro do multer (arquivo grande demais) vira 400 com mensagem, em vez de cair
// no handler de erro padrão do Express
function receberArquivo(req, res, next) {
  upload.single('arquivo')(req, res, err => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ erro: `Arquivo maior que ${TAMANHO_MAXIMO_MB} MB` })
    }
    if (err) return next(err)
    next()
  })
}

// Upload de anexo para uma OC
router.post('/:ocId', autenticar, receberArquivo, async (req, res) => {
  const { ocId } = req.params
  const { tipo } = req.body

  if (req.arquivoRecusado) {
    return res.status(400).json({ erro: 'Tipo de arquivo não permitido. Envie PDF, imagem (PNG/JPG), Word ou Excel.' })
  }
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
      mimeType: TIPOS_PERMITIDOS[path.extname(req.file.filename)],
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
  // Apaga o arquivo também — antes só o registro saía e o arquivo ficava órfão em uploads/
  fs.unlink(path.resolve('uploads', anexo.nomeArquivo), () => { })
  res.json({ ok: true })
})

export default router
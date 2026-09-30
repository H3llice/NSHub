import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

const FINALIDADES_VALIDAS = ['locacao', 'venda']
const STATUS_VALIDOS = ['disponivel', 'locado', 'vendido']

// Documentos da balsa ficam fora de backend/uploads, no mesmo esquema dos
// documentos de colaborador: pasta própria, entregues só pela rota autenticada.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PASTA_DOCUMENTOS = path.resolve(__dirname, '..', 'uploads-privado', 'balsas')
fs.mkdirSync(PASTA_DOCUMENTOS, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PASTA_DOCUMENTOS),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`)
  }),
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')),
  limits: { fileSize: 20 * 1024 * 1024 }
})

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

// ═══════════════════════════════ DOCUMENTOS ══════════════════════════════════════
// Declaradas antes de GET /:id pra "/documentos/..." não ser lido como um id de balsa.

// ─── Abrir documento (link em nova aba, token via ?token=) ────────────────────
router.get('/documentos/:docId/arquivo', autenticar, async (req, res) => {
  const documento = await prisma.documentoBalsa.findUnique({ where: { id: Number(req.params.docId) } })
  if (!documento) return res.status(404).json({ erro: 'Documento não encontrado' })

  res.setHeader('Content-Type', documento.mimeType)
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(documento.nomeOriginal)}"`)
  res.sendFile(path.join(PASTA_DOCUMENTOS, documento.nomeArquivo))
})

// ─── Remover documento ─────────────────────────────────────────────────────────
router.delete('/documentos/:docId', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const documento = await prisma.documentoBalsa.findUnique({ where: { id: Number(req.params.docId) } })
  if (!documento) return res.status(404).json({ erro: 'Documento não encontrado' })

  await prisma.documentoBalsa.delete({ where: { id: documento.id } })
  fs.unlink(path.join(PASTA_DOCUMENTOS, documento.nomeArquivo), () => { })
  res.json({ ok: true })
})

// ─── Anexar documento (PDF ou imagem + título) ─────────────────────────────────
router.post('/:id/documentos', autenticar, exigirPerfil('admin', 'gerente'), upload.single('arquivo'), async (req, res) => {
  const titulo = (req.body.titulo || '').trim()

  if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo PDF ou imagem' })
  if (!titulo) {
    fs.unlink(req.file.path, () => { })
    return res.status(400).json({ erro: 'Título é obrigatório' })
  }

  const balsaId = Number(req.params.id)
  const balsa = await prisma.balsa.findUnique({ where: { id: balsaId } })
  if (!balsa) {
    fs.unlink(req.file.path, () => { })
    return res.status(404).json({ erro: 'Balsa não encontrada' })
  }

  const documento = await prisma.documentoBalsa.create({
    data: {
      balsaId,
      titulo,
      nomeOriginal: req.file.originalname,
      nomeArquivo: req.file.filename,
      mimeType: req.file.mimetype
    }
  })
  res.json(documento)
})

// ─── Buscar uma balsa ──────────────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const balsa = await prisma.balsa.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      documentos: { orderBy: { criadoEm: 'desc' } },
      // Histórico de locações — sem valores: esta rota é lida por perfis que não
      // veem contratos (usuário, técnico)
      contratosBalsa: {
        orderBy: { id: 'desc' },
        select: {
          id: true, aditivo: true, criadoEm: true,
          devolvidaEm: true, estadoDevolucao: true, observacoesDevolucao: true,
          contrato: {
            select: {
              id: true, numero: true, ano: true, status: true, dataInicio: true, dataFim: true,
              cliente: { select: { nome: true } }
            }
          }
        }
      }
    }
  })

  if (!balsa) return res.status(404).json({ erro: 'Balsa não encontrada' })

  res.json(balsa)
})

// ─── Cadastrar balsa (só admin e gerente) ─────────────────────────────────────
router.post('/', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const {
    fabricante, numeroSerie, modelo, anoFabricacao,
    capacidade, tipo, armazem, finalidade, observacoes
  } = req.body
  const patrimonio = (req.body.patrimonio || '').trim()

  if (!fabricante || !numeroSerie || !modelo || !anoFabricacao || !capacidade || !tipo || !finalidade || !patrimonio) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios, exceto armazém e observações' })
  }

  if (!FINALIDADES_VALIDAS.includes(finalidade)) {
    return res.status(400).json({ erro: `Finalidade inválida. Use: ${FINALIDADES_VALIDAS.join(', ')}` })
  }

  const existe = await prisma.balsa.findUnique({ where: { numeroSerie } })
  if (existe) {
    return res.status(400).json({ erro: 'Já existe uma balsa cadastrada com esse número de série' })
  }

  const patrimonioExiste = await prisma.balsa.findFirst({ where: { patrimonio } })
  if (patrimonioExiste) {
    return res.status(400).json({ erro: 'Já existe uma balsa cadastrada com esse patrimônio' })
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
      patrimonio,
      observacoes: observacoes || null,
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
    capacidade, tipo, armazem, finalidade, status, observacoes
  } = req.body

  const dados = {}
  if (fabricante) dados.fabricante = fabricante
  if (numeroSerie) dados.numeroSerie = numeroSerie
  if (modelo) dados.modelo = modelo
  if (anoFabricacao) dados.anoFabricacao = Number(anoFabricacao)
  if (capacidade) dados.capacidade = Number(capacidade)
  if (tipo) dados.tipo = tipo
  if (armazem !== undefined) dados.armazem = armazem || null
  if (observacoes !== undefined) dados.observacoes = observacoes || null

  // Só valida o patrimônio quando ele vem no body — a troca de status
  // (marcar locado/vendido/reativar) manda só { status } e não pode ser barrada
  // por uma balsa antiga que ainda não tem patrimônio.
  if (req.body.patrimonio !== undefined) {
    const patrimonio = String(req.body.patrimonio || '').trim()
    if (!patrimonio) return res.status(400).json({ erro: 'Patrimônio é obrigatório' })

    const patrimonioExiste = await prisma.balsa.findFirst({ where: { patrimonio } })
    if (patrimonioExiste && patrimonioExiste.id !== id) {
      return res.status(400).json({ erro: 'Já existe uma balsa cadastrada com esse patrimônio' })
    }
    dados.patrimonio = patrimonio
  }

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

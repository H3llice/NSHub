import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { gerarPdf } from '../pdf-browser.js'
import { htmlEstoqueBalsas } from '../templates/estoque-balsas.js'

const router = Router()

const FINALIDADES_VALIDAS = ['locacao', 'venda']
const STATUS_VALIDOS = ['disponivel', 'locado', 'vendido']

// ─── Patrimônio automático: SIGLA-NNN ─────────────────────────────────────────
// Quem cadastra/edita só escolhe a sigla; o número é o maior já usado naquela
// sigla + 1 (3 dígitos, NSB-001; passa de 999 sem problema, NSB-1000).
// Patrimônios antigos fora do formato ficam como estão até alguém trocar a
// sigla na edição. Lista de siglas repetida em js/modules/estoque.js (SIGLAS_PATRIMONIO).
const SIGLAS_PATRIMONIO = ['NSB', 'NS', 'SB']
const FORMATO_PATRIMONIO = /^([A-Z]+)-(\d+)$/

// Sigla do patrimônio, se ele já estiver no formato novo (senão null)
function siglaDoPatrimonio(patrimonio) {
  const m = FORMATO_PATRIMONIO.exec(String(patrimonio || '').trim().toUpperCase())
  return m && SIGLAS_PATRIMONIO.includes(m[1]) ? m[1] : null
}

// startsWith 'NS-' não pega 'NSB-' (o hífen faz parte do prefixo)
async function proximoPatrimonio(db, sigla) {
  const existentes = await db.balsa.findMany({
    where: { patrimonio: { startsWith: `${sigla}-`, mode: 'insensitive' } },
    select: { patrimonio: true }
  })
  let maior = 0
  for (const { patrimonio } of existentes) {
    const m = FORMATO_PATRIMONIO.exec(patrimonio.trim().toUpperCase())
    if (m && m[1] === sigla) maior = Math.max(maior, Number(m[2]))
  }
  return `${sigla}-${String(maior + 1).padStart(3, '0')}`
}

// Gera o número e grava na mesma transação serializável: dois cadastros ao mesmo
// tempo na mesma sigla não saem com o mesmo número (o segundo falha com P2034 e
// tenta de novo). `gravar(db, patrimonio)` faz o create/update.
async function comPatrimonioNovo(sigla, gravar) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await prisma.$transaction(async tx => gravar(tx, await proximoPatrimonio(tx, sigla)), { isolationLevel: 'Serializable' })
    } catch (err) {
      if (err.code !== 'P2034' || tentativa >= 5) throw err
    }
  }
}

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

// ─── Situação (filtro de status da tela de estoque) ─────────────────────────────
// ?situacao=disponivel | locado | vendido | todas. Sem situacao vale o formato
// antigo (?todas=1 = todas; nada = só disponíveis), que é o que contratos.js e
// vendas.js usam pra listar balsas livres.
const SITUACOES = ['disponivel', 'locado', 'vendido', 'todas']
function lerSituacao(query) {
  if (SITUACOES.includes(query.situacao)) return query.situacao
  return query.todas ? 'todas' : 'disponivel'
}

// ─── Listar balsas ─────────────────────────────────────────────────────────────
// GET /estoque?finalidade=locacao[&situacao=...]  (ver lerSituacao)
router.get('/', autenticar, async (req, res) => {
  const { finalidade } = req.query
  const situacao = lerSituacao(req.query)

  const where = {}

  if (finalidade) {
    if (!FINALIDADES_VALIDAS.includes(finalidade)) {
      return res.status(400).json({ erro: `Finalidade inválida. Use: ${FINALIDADES_VALIDAS.join(', ')}` })
    }
    where.finalidade = finalidade
  }

  if (situacao !== 'todas') {
    where.status = situacao
  }

  const balsas = await prisma.balsa.findMany({
    where,
    orderBy: { criadoEm: 'desc' }
  })

  res.json(balsas)
})

// ─── PDF do estoque (link em nova aba, token via ?token=) ─────────────────────
// GET /estoque/pdf?finalidade=locacao[&situacao=...][&armazem=...&capacidade=...]
// Os filtros são os mesmos da tela (js/modules/estoque.js → aplicarFiltros) e
// com a mesma regra: texto é "contém" sem diferenciar maiúscula, capacidade é
// exata e ano é faixa. Se mudar lá, mudar aqui, senão o PDF sai diferente da tabela.
const FILTROS_TEXTO_PDF = [
  { campo: 'numeroSerie', rotulo: 'Nº Série' },
  { campo: 'patrimonio', rotulo: 'Patrimônio' },
  { campo: 'fabricante', rotulo: 'Fabricante' },
  { campo: 'modelo', rotulo: 'Modelo' },
  { campo: 'tipo', rotulo: 'Tipo' },
  { campo: 'armazem', rotulo: 'Armazém' }
]

router.get('/pdf', autenticar, async (req, res) => {
  const { finalidade } = req.query
  const situacao = lerSituacao(req.query)
  if (!FINALIDADES_VALIDAS.includes(finalidade)) {
    return res.status(400).json({ erro: `Finalidade inválida. Use: ${FINALIDADES_VALIDAS.join(', ')}` })
  }

  const where = { finalidade }
  if (situacao !== 'todas') where.status = situacao
  let balsas = await prisma.balsa.findMany({ where, orderBy: { capacidade: 'asc' } })

  const filtros = []
  FILTROS_TEXTO_PDF.forEach(({ campo, rotulo }) => {
    const valor = String(req.query[campo] || '').trim()
    if (!valor) return
    balsas = balsas.filter(b => (b[campo] || '').toLowerCase().includes(valor.toLowerCase()))
    filtros.push(`${rotulo}: ${valor}`)
  })

  const numero = campo => {
    const v = Number(req.query[campo])
    return req.query[campo] && Number.isFinite(v) ? v : null
  }
  const anoMin = numero('anoMin')
  const anoMax = numero('anoMax')
  const capacidade = numero('capacidade')
  if (anoMin !== null) { balsas = balsas.filter(b => b.anoFabricacao >= anoMin); filtros.push(`Ano mín.: ${anoMin}`) }
  if (anoMax !== null) { balsas = balsas.filter(b => b.anoFabricacao <= anoMax); filtros.push(`Ano máx.: ${anoMax}`) }
  if (capacidade !== null) { balsas = balsas.filter(b => b.capacidade === capacidade); filtros.push(`Capacidade: ${capacidade}`) }

  // Contrato em que cada balsa locada está agora (passagem sem devolvidaEm).
  // Map balsaId → { numero, ano, cliente, dataFim }
  const contratoAtual = new Map()
  const idsLocadas = balsas.filter(b => b.status === 'locado').map(b => b.id)
  if (idsLocadas.length > 0) {
    const passagens = await prisma.contratoBalsa.findMany({
      where: { balsaId: { in: idsLocadas }, devolvidaEm: null },
      select: { balsaId: true, contrato: { select: { numero: true, ano: true, dataFim: true, cliente: { select: { nome: true } } } } },
      orderBy: { criadoEm: 'desc' }
    })
    for (const p of passagens) {
      if (!contratoAtual.has(p.balsaId)) {
        contratoAtual.set(p.balsaId, { numero: p.contrato.numero, ano: p.contrato.ano, cliente: p.contrato.cliente?.nome, dataFim: p.contrato.dataFim })
      }
    }
  }

  const pdfBytes = await gerarPdf(htmlEstoqueBalsas(balsas, { finalidade, situacao, filtros, contratoAtual }), { preferCSSPageSize: true })

  const nomeArquivo = `${finalidade === 'locacao' ? 'Estoque de locação' : 'Estoque de vendas'}${situacao === 'locado' ? ' - locadas' : situacao === 'vendido' ? ' - vendidas' : ''} ${new Date().toLocaleDateString('pt-BR').replaceAll('/', '-')}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

// ─── Próximo patrimônio de uma sigla (prévia no formulário) ───────────────────
// Só prévia: o número de verdade é gerado na hora de gravar (outro cadastro
// pode pegar este número antes). Antes de GET /:id, senão o Express lê
// "proximo-patrimonio" como id.
router.get('/proximo-patrimonio', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const sigla = String(req.query.sigla || '').toUpperCase()
  if (!SIGLAS_PATRIMONIO.includes(sigla)) return res.status(400).json({ erro: 'Sigla de patrimônio inválida' })
  res.json({ patrimonio: await proximoPatrimonio(prisma, sigla) })
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
  const sigla = String(req.body.siglaPatrimonio || '').toUpperCase()

  if (!fabricante || !numeroSerie || !modelo || !anoFabricacao || !capacidade || !tipo || !finalidade || !sigla) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios, exceto armazém e observações' })
  }

  if (!SIGLAS_PATRIMONIO.includes(sigla)) {
    return res.status(400).json({ erro: `Sigla de patrimônio inválida. Use: ${SIGLAS_PATRIMONIO.join(', ')}` })
  }

  if (!FINALIDADES_VALIDAS.includes(finalidade)) {
    return res.status(400).json({ erro: `Finalidade inválida. Use: ${FINALIDADES_VALIDAS.join(', ')}` })
  }

  const existe = await prisma.balsa.findUnique({ where: { numeroSerie } })
  if (existe) {
    return res.status(400).json({ erro: 'Já existe uma balsa cadastrada com esse número de série' })
  }

  const balsa = await comPatrimonioNovo(sigla, (tx, patrimonio) => tx.balsa.create({
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
  }))

  res.json(balsa)
})

// ─── Marcar várias balsas como disponíveis (seleção em lote da tela) ──────────
// POST /estoque/disponivel-lote { ids: [...] }. Mesmo efeito do botão "Reativar"
// de cada linha (PUT /:id { status }): só troca o status — não registra devolução
// no contrato. Pra devolver balsa de contrato o caminho é o próprio contrato.
router.post('/disponivel-lote', autenticar, exigirPerfil('admin', 'gerente'), async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : []
  if (ids.length === 0) return res.status(400).json({ erro: 'Selecione ao menos uma balsa' })

  const { count } = await prisma.balsa.updateMany({
    where: { id: { in: ids }, status: { not: 'disponivel' } },
    data: { status: 'disponivel' }
  })
  res.json({ atualizadas: count })
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

  // Patrimônio não se digita: vem só a sigla. Sigla igual à atual = mantém o
  // número; diferente (ou balsa antiga fora do formato) = gera número novo.
  // Sem siglaPatrimonio no body (troca de status, ou "manter atual" numa balsa
  // antiga) o patrimônio não muda.
  let novaSigla = null
  if (req.body.siglaPatrimonio) {
    const sigla = String(req.body.siglaPatrimonio).toUpperCase()
    if (!SIGLAS_PATRIMONIO.includes(sigla)) {
      return res.status(400).json({ erro: `Sigla de patrimônio inválida. Use: ${SIGLAS_PATRIMONIO.join(', ')}` })
    }
    const atual = await prisma.balsa.findUnique({ where: { id }, select: { patrimonio: true } })
    if (!atual) return res.status(404).json({ erro: 'Balsa não encontrada' })
    if (siglaDoPatrimonio(atual.patrimonio) !== sigla) novaSigla = sigla
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
    const balsa = novaSigla
      ? await comPatrimonioNovo(novaSigla, (tx, patrimonio) => tx.balsa.update({ where: { id }, data: { ...dados, patrimonio } }))
      : await prisma.balsa.update({ where: { id }, data: dados })
    res.json(balsa)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Balsa não encontrada' })
    throw err
  }
})

export default router

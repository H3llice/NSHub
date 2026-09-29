import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// Perfis que podem editar e ver dados pessoais (CPF, email pessoal, documentos).
// Os demais perfis só enxergam nome, email corporativo e função.
const PERFIS_GESTAO = ['admin', 'gerente']
const FUNCOES = ['gerente', 'tecnico', 'vendedor', 'auxiliar', 'estagiario']

// Documentos pessoais NÃO vão pra backend/uploads — essa pasta é servida estaticamente
// pra qualquer usuário logado (server.js). Aqui ficam numa pasta própria, entregues só
// pela rota /documentos/:id/arquivo, que exige admin/gerente.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PASTA_DOCUMENTOS = path.resolve(__dirname, '..', 'uploads-privado', 'colaboradores')
fs.mkdirSync(PASTA_DOCUMENTOS, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PASTA_DOCUMENTOS),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`)
  }),
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
  limits: { fileSize: 20 * 1024 * 1024 }
})

const podeGerir = req => PERFIS_GESTAO.includes(req.usuario?.perfil)

// Remove os campos pessoais para quem não é admin/gerente
function filtrarCampos(colaborador, completo) {
  if (completo) return colaborador
  const { cpf, emailPessoal, documentos, usuario, ...publico } = colaborador
  return { ...publico, usuario: usuario && { id: usuario.id, nome: usuario.nome } }
}

function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  for (const t of [9, 10]) {
    let soma = 0
    for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i)
    const digito = (soma * 10) % 11 % 10
    if (digito !== Number(cpf[t])) return false
  }
  return true
}

// Valida e normaliza o corpo de criação/edição. Retorna { dados } ou { erro }.
function lerCorpo(body) {
  const nome = (body.nome || '').trim()
  const funcao = body.funcao
  const cpf = (body.cpf || '').replace(/\D/g, '') || null

  if (!nome) return { erro: 'Nome é obrigatório' }
  if (!FUNCOES.includes(funcao)) return { erro: 'Função inválida' }
  if (cpf && !cpfValido(cpf)) return { erro: 'CPF inválido' }

  return {
    dados: {
      nome,
      funcao,
      cpf,
      emailPessoal: (body.emailPessoal || '').trim() || null,
      emailCorporativo: (body.emailCorporativo || '').trim() || null,
      ativo: body.ativo !== false,
      usuarioId: body.usuarioId ? Number(body.usuarioId) : null
    }
  }
}

// Erros de unicidade do Prisma (CPF repetido ou login já vinculado a outro colaborador)
// e de usuário vinculado inexistente
function erroUnico(err, res) {
  if (err.code === 'P2003') return res.status(400).json({ erro: 'Usuário do sistema não encontrado' })
  if (err.code !== 'P2002') throw err
  const campo = err.meta?.target?.includes('cpf') ? 'CPF' : 'Usuário do sistema'
  return res.status(400).json({ erro: `${campo} já está vinculado a outro colaborador` })
}

const incluirUsuario = { usuario: { select: { id: true, nome: true, email: true, perfil: true } } }

// Colaborador desativado (saiu da empresa) → desativa também o login vinculado.
// Reativar o colaborador NÃO reativa o login: isso fica a cargo do admin, no
// cadastro de usuários. Gerente não derruba login de admin.
async function desativarLoginSeInativo(colaborador, req) {
  if (colaborador.ativo || !colaborador.usuario) return
  if (colaborador.usuario.perfil === 'admin' && req.usuario.perfil !== 'admin') return

  await prisma.usuario.update({ where: { id: colaborador.usuario.id }, data: { ativo: false } })
}

// ─── Listar colaboradores (paginado, com filtros opcionais por nome/função/situação) ─
// ativo: 'true' | 'false' | vazio (todos)
router.get('/', autenticar, async (req, res) => {
  const { nome, funcao, ativo, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const where = {}
  if (nome) where.nome = { contains: nome, mode: 'insensitive' }
  if (funcao) where.funcao = funcao
  if (ativo === 'true' || ativo === 'false') where.ativo = ativo === 'true'

  const [colaboradores, total] = await Promise.all([
    prisma.colaborador.findMany({
      where,
      include: incluirUsuario,
      orderBy: { nome: 'asc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.colaborador.count({ where })
  ])

  // CPF nunca vai na listagem, nem pra admin/gerente — só no detalhe (GET /:id),
  // que é o que o formulário de edição usa
  res.json({
    colaboradores: colaboradores.map(c => {
      const { cpf, ...semCpf } = filtrarCampos(c, podeGerir(req))
      return semCpf
    }),
    total,
    pagina: paginaNum,
    totalPaginas: Math.ceil(total / porPagina)
  })
})

// ─── Detalhe de um colaborador ─────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const completo = podeGerir(req)
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      ...incluirUsuario,
      ...(completo && { documentos: { orderBy: { criadoEm: 'desc' } } })
    }
  })
  if (!colaborador) return res.status(404).json({ erro: 'Colaborador não encontrado' })
  res.json(filtrarCampos(colaborador, completo))
})

// ─── Cadastrar colaborador (só admin e gerente) ────────────────────────────────
router.post('/', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const { dados, erro } = lerCorpo(req.body)
  if (erro) return res.status(400).json({ erro })

  try {
    const colaborador = await prisma.colaborador.create({ data: dados, include: incluirUsuario })
    await desativarLoginSeInativo(colaborador, req)
    res.json(colaborador)
  } catch (err) {
    return erroUnico(err, res)
  }
})

// ─── Editar colaborador (só admin e gerente) ───────────────────────────────────
router.put('/:id', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const { dados, erro } = lerCorpo(req.body)
  if (erro) return res.status(400).json({ erro })

  const anterior = await prisma.colaborador.findUnique({ where: { id: Number(req.params.id) } })
  if (!anterior) return res.status(404).json({ erro: 'Colaborador não encontrado' })

  try {
    const colaborador = await prisma.colaborador.update({
      where: { id: Number(req.params.id) },
      data: dados,
      include: incluirUsuario
    })
    // Só na transição ativo → inativo (ou ao vincular um login a um colaborador já
    // inativo), pra não derrubar de novo um login que o admin reativou de propósito
    if (anterior.ativo || anterior.usuarioId !== colaborador.usuarioId) {
      await desativarLoginSeInativo(colaborador, req)
    }
    res.json(colaborador)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Colaborador não encontrado' })
    return erroUnico(err, res)
  }
})

// ═══════════════════════════════ DOCUMENTOS ══════════════════════════════════════

// ─── Anexar documento (PDF + título) ───────────────────────────────────────────
router.post('/:id/documentos', autenticar, exigirPerfil(...PERFIS_GESTAO), upload.single('arquivo'), async (req, res) => {
  const titulo = (req.body.titulo || '').trim()

  if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo PDF' })
  if (!titulo) {
    fs.unlink(req.file.path, () => { })
    return res.status(400).json({ erro: 'Título é obrigatório' })
  }

  const colaboradorId = Number(req.params.id)
  const colaborador = await prisma.colaborador.findUnique({ where: { id: colaboradorId } })
  if (!colaborador) {
    fs.unlink(req.file.path, () => { })
    return res.status(404).json({ erro: 'Colaborador não encontrado' })
  }

  const documento = await prisma.documentoColaborador.create({
    data: {
      colaboradorId,
      titulo,
      nomeOriginal: req.file.originalname,
      nomeArquivo: req.file.filename
    }
  })
  res.json(documento)
})

// ─── Abrir documento (link em nova aba, token via ?token=) ────────────────────
router.get('/documentos/:docId/arquivo', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const documento = await prisma.documentoColaborador.findUnique({ where: { id: Number(req.params.docId) } })
  if (!documento) return res.status(404).json({ erro: 'Documento não encontrado' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(documento.nomeOriginal)}"`)
  res.sendFile(path.join(PASTA_DOCUMENTOS, documento.nomeArquivo))
})

// ─── Remover documento ─────────────────────────────────────────────────────────
router.delete('/documentos/:docId', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const documento = await prisma.documentoColaborador.findUnique({ where: { id: Number(req.params.docId) } })
  if (!documento) return res.status(404).json({ erro: 'Documento não encontrado' })

  await prisma.documentoColaborador.delete({ where: { id: documento.id } })
  fs.unlink(path.join(PASTA_DOCUMENTOS, documento.nomeArquivo), () => { })
  res.json({ ok: true })
})

export default router

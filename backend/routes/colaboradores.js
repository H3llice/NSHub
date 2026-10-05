import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil, PERMISSOES } from '../middleware/auth.js'

const router = Router()

// Perfis que podem editar e ver dados pessoais (CPF, email pessoal, nascimento,
// contato de emergência, documentos). Os demais perfis só enxergam os dados de trabalho.
const PERFIS_GESTAO = ['admin', 'gerente']
// Funções (cargos) — mesmas chaves de js/modules/funcoes-colaborador.js
const FUNCOES = [
  'gerente_operacional', 'gerente_comercial', 'gerente_administrativo', 'gerente_financeiro',
  'auxiliar_manutencao', 'assistente_administrativo', 'assistente_comercial',
  'tecnico_n1', 'tecnico_n2', 'tecnico_n3', 'engenheiro', 'estagiario'
]
const TIPOS_CONTRATO = ['mensalista', 'intermitente']
// Quem aparece como "Vendedor Responsável" em Orçamento/Vendas
const FUNCOES_VENDEDOR = ['gerente_comercial', 'assistente_comercial']
// Tópico "Técnicos" da Folha de pagamento
const FUNCOES_TECNICO = ['tecnico_n1', 'tecnico_n2', 'tecnico_n3']

// Funções da lista antiga → nova. Convertidas uma vez ao subir o servidor
// (converterFuncoesAntigas, chamada em server.js) — idempotente, então rodar
// de novo a cada deploy não faz nada.
const FUNCOES_ANTIGAS = {
  gerente: 'gerente_operacional',
  tecnico: 'tecnico_n1',
  vendedor: 'assistente_comercial',
  auxiliar: 'auxiliar_manutencao'
}

async function converterFuncoesAntigas() {
  for (const [antiga, nova] of Object.entries(FUNCOES_ANTIGAS)) {
    const { count } = await prisma.colaborador.updateMany({ where: { funcao: antiga }, data: { funcao: nova } })
    if (count > 0) console.log(`Colaboradores: função "${antiga}" → "${nova}" (${count})`)
  }
}

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
  const { cpf, emailPessoal, dataNascimento, contatoEmergenciaNome, contatoEmergenciaTelefone, descontoPlanoSaude, salario, valeTransporte, descontoValeTransporte, auxilioMoradia, valorAuxilioMoradia, documentos, usuario, ...publico } = colaborador
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
  // Valores em R$: vazio → null; aceita "123,45"
  const lerValor = v => {
    const texto = String(v ?? '').trim().replace(',', '.')
    return texto === '' ? null : Number(texto)
  }
  const descontoPlanoSaude = lerValor(body.descontoPlanoSaude)
  const salario = lerValor(body.salario)
  // Auxílio moradia: marcou → valor obrigatório; desmarcou → valor descartado
  const tipoContrato = body.tipoContrato
  const auxilioMoradia = body.auxilioMoradia === true
  const valorAuxilioMoradia = auxilioMoradia ? lerValor(body.valorAuxilioMoradia) : null
  // Datas "AAAA-MM-DD" → meia-noite UTC; vazio → null; inválida → undefined
  const lerData = v => {
    if (!v) return null
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00Z') : undefined
  }
  const feriasInicio = lerData(body.feriasInicio)
  const feriasFim = lerData(body.feriasFim)
  const dataNascimento = lerData(body.dataNascimento)
  const dataAdmissao = lerData(body.dataAdmissao)
  const contatoEmergenciaNome = (body.contatoEmergenciaNome || '').trim()
  const contatoEmergenciaTelefone = (body.contatoEmergenciaTelefone || '').trim()

  if (!nome) return { erro: 'Nome é obrigatório' }
  if (!FUNCOES.includes(funcao)) return { erro: 'Função inválida' }
  if (cpf && !cpfValido(cpf)) return { erro: 'CPF inválido' }
  if (salario === null) return { erro: 'Salário é obrigatório' }
  if (!(salario > 0)) return { erro: 'Salário inválido' }
  if (descontoPlanoSaude !== null && !(descontoPlanoSaude >= 0)) return { erro: 'Desconto do plano de saúde inválido' }
  if (!TIPOS_CONTRATO.includes(tipoContrato)) return { erro: 'Informe o tipo de contrato (mensalista ou intermitente)' }
  if (auxilioMoradia && !(valorAuxilioMoradia > 0)) return { erro: 'Informe o valor do auxílio moradia' }
  if (feriasInicio === undefined || feriasFim === undefined) return { erro: 'Data de férias inválida' }
  if (!feriasInicio !== !feriasFim) return { erro: 'Informe início e fim das férias (ou deixe os dois vazios)' }
  if (feriasInicio && feriasFim < feriasInicio) return { erro: 'O fim das férias não pode ser antes do início' }
  if (dataNascimento === undefined) return { erro: 'Data de nascimento inválida' }
  if (dataAdmissao === undefined) return { erro: 'Data de admissão inválida' }
  if (!dataNascimento) return { erro: 'Data de nascimento é obrigatória' }
  if (!dataAdmissao) return { erro: 'Data de admissão é obrigatória' }
  if (!contatoEmergenciaNome || !contatoEmergenciaTelefone) return { erro: 'Informe nome e telefone do contato de emergência' }

  return {
    dados: {
      nome,
      funcao,
      cpf,
      emailPessoal: (body.emailPessoal || '').trim() || null,
      emailCorporativo: (body.emailCorporativo || '').trim() || null,
      descontoPlanoSaude,
      salario,
      descontoValeTransporte: body.descontoValeTransporte === true,
      tipoContrato,
      auxilioMoradia,
      valorAuxilioMoradia,
      feriasInicio,
      feriasFim,
      dataNascimento,
      dataAdmissao,
      sispat: FUNCOES_TECNICO.includes(funcao) ? (body.sispat || '').trim() || null : null,
      contatoEmergenciaNome,
      contatoEmergenciaTelefone,
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

const incluirUsuario = { usuario: { select: { id: true, nome: true, email: true, perfil: true, permissoes: true } } }

// Permissões extras (ver PERMISSOES em middleware/auth.js) do login vinculado ao
// colaborador — marcadas no próprio formulário do colaborador. Só admin mexe
// nelas: gerente salvando o colaborador não manda o campo, e se mandar é ignorado.
async function salvarPermissoesLogin(colaborador, req) {
  const { permissoes } = req.body
  if (req.usuario.perfil !== 'admin' || !Array.isArray(permissoes) || !colaborador.usuarioId) return colaborador
  const validas = [...new Set(permissoes.filter(p => PERMISSOES[p]))]
  await prisma.usuario.update({ where: { id: colaborador.usuarioId }, data: { permissoes: validas } })
  return { ...colaborador, usuario: { ...colaborador.usuario, permissoes: validas } }
}

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

// ─── Vendedores (dropdown "Vendedor Responsável" de Orçamento/Venda) ──────────
// Só colaborador ativo com função comercial (FUNCOES_VENDEDOR) E login ativo vinculado — o campo
// vendedorId de Orçamento/Venda aponta pra Usuario, não pra Colaborador, então
// devolve o usuário (id/nome) de cada um. Declarada antes de /:id pra não cair nela.
router.get('/vendedores', autenticar, async (req, res) => {
  const colaboradores = await prisma.colaborador.findMany({
    where: { funcao: { in: FUNCOES_VENDEDOR }, ativo: true, usuario: { ativo: true } },
    select: { usuario: { select: { id: true, nome: true } } },
    orderBy: { nome: 'asc' }
  })
  res.json(colaboradores.map(c => c.usuario))
})

// ─── Avisos de férias (página inicial e Colaboradores, admin/gerente) ─────────
// Colaboradores ativos com férias começando nos próximos 30 dias ou em
// andamento. "Hoje" é a data local do servidor (America/Sao_Paulo) como
// meia-noite UTC, mesmo formato das datas de férias. Antes de /:id.
const DIAS_AVISO_FERIAS = 30
router.get('/ferias-avisos', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const agora = new Date()
  const hoje = new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()))
  const limite = new Date(hoje.getTime() + DIAS_AVISO_FERIAS * 24 * 60 * 60 * 1000)

  const colaboradores = await prisma.colaborador.findMany({
    where: { ativo: true, feriasInicio: { lte: limite }, feriasFim: { gte: hoje } },
    select: { id: true, nome: true, funcao: true, feriasInicio: true, feriasFim: true },
    orderBy: { feriasInicio: 'asc' }
  })

  res.json(colaboradores.map(c => ({
    ...c,
    emFerias: c.feriasInicio <= hoje,
    diasParaInicio: Math.round((c.feriasInicio - hoje) / (24 * 60 * 60 * 1000))
  })))
})

// ─── Lista simples de colaboradores ativos (seleção em Embarques) ─────────────
// Só id/nome/função — sem dados pessoais, sem paginação. Antes de /:id.
router.get('/simples', autenticar, async (req, res) => {
  const colaboradores = await prisma.colaborador.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, funcao: true },
    orderBy: { nome: 'asc' }
  })
  res.json(colaboradores)
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
    res.json(await salvarPermissoesLogin(colaborador, req))
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
    res.json(await salvarPermissoesLogin(colaborador, req))
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

export { FUNCOES_TECNICO, converterFuncoesAntigas }
export default router

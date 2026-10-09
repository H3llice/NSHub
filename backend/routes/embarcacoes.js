import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

const CAMPOS_TEXTO = ['portoRegistro', 'tipo', 'supervisor', 'classe', 'email', 'telefone']
const CAMPOS_VENCIMENTO = ['vencLsaBaleeiras', 'vencBalsa', 'vencFfe', 'vencIloCrane']

// IMO: 7 dígitos, o último é verificador — soma dos 6 primeiros × (7, 6, 5, 4, 3, 2),
// último dígito da soma. Validar aqui evita IMO digitado errado, que é a chave pra
// achar o navio em serviços externos (ex.: botão do MarineTraffic).
// Devolve a mensagem de erro (ou null se válido) — tamanho e dígito verificador
// têm mensagens separadas porque "inválido" genérico parecia erro de tamanho.
function erroImo(imo) {
  if (!/^\d{7}$/.test(imo)) return `Número IMO deve ter 7 dígitos (foram digitados ${imo.length})`
  const soma = [...imo.slice(0, 6)].reduce((acc, d, i) => acc + Number(d) * (7 - i), 0)
  const esperado = soma % 10
  if (esperado === Number(imo[6])) return null
  return `Número IMO ${imo} não confere: pelo dígito verificador, o último dígito deveria ser ${esperado}. ` +
    'Confira no documento do navio — provavelmente há um dígito trocado.'
}

// Lê os campos opcionais do body. Só inclui o que veio (PUT parcial); string vazia
// vira null. Devolve { erro } se algum valor for inválido.
function lerCamposOpcionais(body) {
  const dados = {}
  for (const campo of CAMPOS_TEXTO) {
    if (body[campo] !== undefined) dados[campo] = String(body[campo] ?? '').trim() || null
  }

  if (body.imo !== undefined) {
    // Aceita "IMO 9074729" / "9.074.729" — guarda só os dígitos
    const imo = String(body.imo ?? '').replace(/^\s*IMO\s*/i, '').replace(/\D/g, '')
    const erro = imo && erroImo(imo)
    if (erro) return { erro }
    dados.imo = imo || null
  }

  // Datas chegam como YYYY-MM-DD do <input type="date"> → meia-noite UTC
  for (const campo of CAMPOS_VENCIMENTO) {
    if (body[campo] === undefined) continue
    if (!body[campo]) { dados[campo] = null; continue }
    const data = new Date(body[campo])
    if (isNaN(data)) return { erro: `Data inválida em ${campo}` }
    dados[campo] = data
  }

  return { dados }
}

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
  const { nome, armadorId } = req.body

  if (!nome || !armadorId) {
    return res.status(400).json({ erro: 'Nome do navio e armador são obrigatórios' })
  }

  const { dados, erro } = lerCamposOpcionais(req.body)
  if (erro) return res.status(400).json({ erro })

  const armador = await prisma.cliente.findUnique({ where: { id: parseInt(armadorId) } })
  if (!armador) {
    return res.status(400).json({ erro: 'Armador não encontrado' })
  }

  const embarcacao = await prisma.embarcacao.create({
    data: {
      ...dados,
      nome,
      armadorId: parseInt(armadorId),
    },
    include: { armador: true }
  })

  res.json(embarcacao)
})

// ─── Cadastrar várias embarcações do mesmo armador de uma vez ──────────────────
// Tudo ou nada: se uma estiver inválida, nenhuma é gravada — senão o usuário
// teria que descobrir quais entraram pra não cadastrar em dobro ao corrigir.
router.post('/lote', autenticar, async (req, res) => {
  const { armadorId, embarcacoes } = req.body

  if (!armadorId) return res.status(400).json({ erro: 'Armador é obrigatório' })
  if (!Array.isArray(embarcacoes) || embarcacoes.length === 0) {
    return res.status(400).json({ erro: 'Informe ao menos uma embarcação' })
  }
  if (embarcacoes.length > 50) return res.status(400).json({ erro: 'Máximo de 50 embarcações por vez' })

  const armador = await prisma.cliente.findUnique({ where: { id: parseInt(armadorId) } })
  if (!armador) return res.status(400).json({ erro: 'Armador não encontrado' })

  const registros = []
  for (const [i, e] of embarcacoes.entries()) {
    const nome = String(e?.nome ?? '').trim()
    if (!nome) return res.status(400).json({ erro: `Embarcação ${i + 1}: nome do navio é obrigatório` })
    const { dados, erro } = lerCamposOpcionais(e)
    if (erro) return res.status(400).json({ erro: `Embarcação ${i + 1} (${nome}): ${erro}` })
    registros.push({ ...dados, nome, armadorId: armador.id })
  }

  const criadas = await prisma.$transaction(registros.map(data => prisma.embarcacao.create({ data })))
  res.json(criadas)
})

// ─── Editar embarcação (qualquer usuário logado) ───────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { nome, armadorId } = req.body

  const { dados, erro } = lerCamposOpcionais(req.body)
  if (erro) return res.status(400).json({ erro })

  if (nome) dados.nome = nome
  if (armadorId) {
    const armador = await prisma.cliente.findUnique({ where: { id: parseInt(armadorId) } })
    if (!armador) return res.status(400).json({ erro: 'Armador não encontrado' })
    dados.armadorId = parseInt(armadorId)
  }

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

  // Todo model com FK pra Embarcacao entra aqui — o que faltar faz o delete
  // estourar no banco em vez de virar aviso (era o caso dos embarques)
  const [qtdOS, qtdRelatorios, qtdCertificados, qtdEmbarques] = await Promise.all([
    prisma.ordemServico.count({ where: { embarcacaoId: id } }),
    prisma.relatorio.count({ where: { embarcacaoId: id } }),
    prisma.certificado.count({ where: { embarcacaoId: id } }),
    prisma.embarque.count({ where: { embarcacaoId: id } }),
  ])

  const vinculos = [
    qtdOS && `${qtdOS} Ordem(ns) de Serviço`,
    qtdRelatorios && `${qtdRelatorios} Relatório(s)`,
    qtdCertificados && `${qtdCertificados} Certificado(s)`,
    qtdEmbarques && `${qtdEmbarques} Embarque(s)`,
  ].filter(Boolean)
  if (vinculos.length) {
    return res.status(400).json({
      erro: `Não é possível excluir: existem ${vinculos.join(', ')} vinculados a esta embarcação.`
    })
  }

  await prisma.embarcacao.delete({ where: { id } })
  res.json({ ok: true })
})

export default router

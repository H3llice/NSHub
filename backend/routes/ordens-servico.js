import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

const CAMPOS = [
  'empresaId', 'clienteId', 'aosCuidadosDe', 'embarcacaoId',
  'dataInicio', 'previsaoEntrega',
  'equipamentoRecebido', 'equipNumeroSerie', 'equipMarca', 'equipModelo', 'vencimentoCertificacao',
  'problemaApresentado', 'servicoApresentado', 'observacoes'
]

function extrair(body) {
  const dados = {}
  for (const campo of CAMPOS) {
    if (body[campo] !== undefined) dados[campo] = body[campo] === '' ? null : body[campo]
  }
  if (dados.dataInicio) dados.dataInicio = new Date(dados.dataInicio).toISOString()
  if (dados.previsaoEntrega) dados.previsaoEntrega = new Date(dados.previsaoEntrega).toISOString()
  return dados
}

// ─── Listar ordens de serviço ───────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { busca, empresa, status, pagina = 1 } = req.query
  const porPagina = 50

  const where = {}
  if (status) where.status = status
  if (empresa) where.empresaId = parseInt(empresa)
  if (busca && !isNaN(busca)) where.numero = parseInt(busca)

  const [ordensServico, total] = await Promise.all([
    prisma.ordemServico.findMany({
      where,
      include: { embarcacao: { include: { armador: true } }, cliente: true, empresa: true, relatorio: true },
      orderBy: { numero: 'desc' },
      take: porPagina,
      skip: (parseInt(pagina) - 1) * porPagina
    }),
    prisma.ordemServico.count({ where })
  ])

  res.json({ ordensServico, total, pagina: parseInt(pagina), totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Buscar uma OS pelo ID ──────────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const os = await prisma.ordemServico.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      embarcacao: { include: { armador: true } },
      cliente: true,
      empresa: true,
      criadoPor: true,
      relatorio: true
    }
  })
  if (!os) return res.status(404).json({ erro: 'Ordem de Serviço não encontrada' })
  res.json(os)
})

// ─── Criar nova OS ──────────────────────────────────────────────────────────────
router.post('/', autenticar, async (req, res) => {
  const dados = extrair(req.body)

  if (!dados.empresaId || !dados.clienteId || !dados.embarcacaoId) {
    return res.status(400).json({ erro: 'Empresa, cliente e embarcação são obrigatórios' })
  }

  const ano = new Date().getFullYear()
  const ultima = await prisma.ordemServico.findFirst({
    where: { ano },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultima ? ultima.numero + 1 : 1

  const os = await prisma.ordemServico.create({
    data: {
      ...dados,
      empresaId: parseInt(dados.empresaId),
      clienteId: parseInt(dados.clienteId),
      embarcacaoId: parseInt(dados.embarcacaoId),
      numero: proximoNumero,
      ano,
      criadoPorId: req.usuario.id
    },
    include: { embarcacao: { include: { armador: true } }, cliente: true, empresa: true }
  })

  res.json(os)
})

// ─── Editar OS ──────────────────────────────────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const atual = await prisma.ordemServico.findUnique({ where: { id } })
  if (!atual) return res.status(404).json({ erro: 'Ordem de Serviço não encontrada' })

  if (atual.status !== 'aberta') {
    return res.status(400).json({ erro: 'Ordem de Serviço não pode ser editada neste status' })
  }

  const dados = extrair(req.body)
  if (dados.empresaId) dados.empresaId = parseInt(dados.empresaId)
  if (dados.clienteId) dados.clienteId = parseInt(dados.clienteId)
  if (dados.embarcacaoId) dados.embarcacaoId = parseInt(dados.embarcacaoId)

  const os = await prisma.ordemServico.update({
    where: { id },
    data: dados,
    include: { embarcacao: { include: { armador: true } }, cliente: true, empresa: true }
  })
  res.json(os)
})

// ─── Concluir OS (canhoto de retirada do equipamento) ──────────────────────────
router.post('/:id/concluir', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { horaEntrada, horaSaida, assinaturaCliente } = req.body

  const os = await prisma.ordemServico.findUnique({ where: { id } })
  if (!os) return res.status(404).json({ erro: 'Ordem de Serviço não encontrada' })
  if (os.status !== 'aberta') {
    return res.status(400).json({ erro: 'Ordem de Serviço já foi concluída' })
  }

  const atualizada = await prisma.ordemServico.update({
    where: { id },
    data: {
      status: 'concluida',
      dataConclusao: new Date().toISOString(),
      horaEntrada: horaEntrada || null,
      horaSaida: horaSaida || null,
      assinaturaCliente: assinaturaCliente || null
    }
  })

  res.json(atualizada)
})

export default router

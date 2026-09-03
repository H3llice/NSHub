import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

const CAMPOS_RELATORIO = [
  'empresaId', 'embarcacaoId', 'data',
  'equipTipo', 'equipNumeroSerie', 'equipAnoFabricacao', 'equipFabricante', 'equipCapacidade',
  'certRevisaoNumero', 'certRevisaoDataExpedicao',
  'foguetesQtd', 'foguetesSubstituido', 'foguetesValidade',
  'fachosQtd', 'fachosSubstituido', 'fachosValidade',
  'fumigenoQtd', 'fumigenoSubstituido', 'fumigenoValidade',
  'pilhasQtd', 'pilhasSubstituido', 'pilhasValidade',
  'racoesSolidasQtd', 'racoesSolidasPesoGramas', 'racoesSolidasSubstituido', 'racoesSolidasValidade',
  'racoesLiquidasQtd', 'racoesLiquidasVolumeMl', 'racoesLiquidasSubstituido', 'racoesLiquidasValidade',
  'medicamentosQtd', 'medicamentosSubstituido', 'medicamentosValidade',
  'pescaQtd', 'pescaSubstituido', 'pescaValidade',
  'reparosQtd', 'reparosSubstituido', 'reparosValidade',
  'enjooQtd', 'enjooSubstituido', 'enjooValidade',
  'bateriaResgateQtd', 'bateriaResgateSubstituido', 'bateriaResgateValidade',
  'ancoraFlutuante', 'remos', 'quadroSinais', 'facaCaboFlutuante', 'espelhoSinalizacao',
  'copoGraduado', 'aroFlutuante', 'jarrosAgua', 'documentacao', 'lanternaEstanque',
  'apito', 'protecaoTermica', 'esponja', 'refletorRadar', 'abridorLatas', 'foleManual',
  'napRealizado', 'napValor', 'wpRealizado', 'wpValor', 'giRealizado', 'giValor',
  'fsRealizado', 'fsValor', 'olRealizado', 'olValor', 'temperatura',
  'revisaoAnualOk', 'observacoes'
]

const CAMPOS_CILINDRO = [
  'numero', 'valvulaNumero', 'teste', 'cargaCO2', 'cargaN2', 'fabricante', 'anoFabricacao',
  'validadeHidrostatica', 'caboInternoMetros', 'caboExternoMetros', 'alturaMaximaEstocagemMetros', 'classe'
]

const CAMPOS_TESTE_IMO = [
  'wpRealizado', 'wpAnual',
  'wpSupInicioTemp', 'wpSupInicioPressao', 'wpSupTerminoTemp', 'wpSupTerminoPressao', 'wpSupDiff', 'wpSupDiffPct',
  'wpInfInicioTemp', 'wpInfInicioPressao', 'wpInfTerminoTemp', 'wpInfTerminoPressao', 'wpInfDiff', 'wpInfDiffPct',
  'giRealizado', 'giPressaoMaxSuperior', 'giPressaoMaxInferior', 'giTuboSuperiorOk', 'giTuboInferiorOk',
  'napRealizado', 'napSupInicio', 'napSupTermino', 'napSupDiff', 'napSupDiffPct',
  'napInfInicio', 'napInfTermino', 'napInfDiff', 'napInfDiffPct', 'napRachaduras', 'napAberturaCostura',
  'fsRealizado', 'fsResultadoOk', 'fsObservacoes',
  'olRealizado', 'olPessoasNr', 'olPesoPessoas', 'olPesoBalsa', 'olPesoTotal', 'olObservacoes',
  'tecnicoNome', 'controladoPorNome'
]

function extrair(body, campos) {
  const dados = {}
  for (const campo of campos) {
    if (body[campo] !== undefined) dados[campo] = body[campo] === '' ? null : body[campo]
  }
  if (dados.data) dados.data = new Date(dados.data).toISOString()
  // Campos de validade (foguetesValidade etc.) são texto livre digitável — não convertidos pra Date.
  return dados
}

// ─── Listar relatórios ──────────────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { busca, empresa, status, pagina = 1 } = req.query
  const porPagina = 50

  const where = {}
  if (status) where.status = status
  if (empresa) where.empresaId = parseInt(empresa)
  if (busca && !isNaN(busca)) where.numero = parseInt(busca)

  const [relatorios, total] = await Promise.all([
    prisma.relatorio.findMany({
      where,
      include: { embarcacao: { include: { armador: true } }, empresa: true, ordemServico: true },
      orderBy: { numero: 'desc' },
      take: porPagina,
      skip: (parseInt(pagina) - 1) * porPagina
    }),
    prisma.relatorio.count({ where })
  ])

  res.json({ relatorios, total, pagina: parseInt(pagina), totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Buscar um relatório pelo ID ────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const relatorio = await prisma.relatorio.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      embarcacao: { include: { armador: true } },
      empresa: true,
      ordemServico: true,
      criadoPor: true,
      cilindros: true,
      testeImo: true,
      assinaturas: { include: { usuario: true }, orderBy: { criadoEm: 'asc' } }
    }
  })
  if (!relatorio) return res.status(404).json({ erro: 'Relatório não encontrado' })
  res.json(relatorio)
})

// ─── Criar novo relatório (sempre a partir de uma Ordem de Serviço) ────────────
router.post('/', autenticar, async (req, res) => {
  const { cilindros, testeImo, ordemServicoId } = req.body
  const dados = extrair(req.body, CAMPOS_RELATORIO)

  if (!ordemServicoId) {
    return res.status(400).json({ erro: 'Relatório precisa ser gerado a partir de uma Ordem de Serviço' })
  }
  if (!dados.empresaId || !dados.embarcacaoId) {
    return res.status(400).json({ erro: 'Empresa e embarcação são obrigatórias' })
  }

  const os = await prisma.ordemServico.findUnique({
    where: { id: parseInt(ordemServicoId) },
    include: { relatorio: true }
  })
  if (!os) return res.status(400).json({ erro: 'Ordem de Serviço não encontrada' })
  if (os.relatorio) return res.status(400).json({ erro: 'Essa Ordem de Serviço já tem um relatório gerado' })

  const ano = new Date().getFullYear()
  const ultimo = await prisma.relatorio.findFirst({
    where: { ano },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultimo ? ultimo.numero + 1 : 1

  const relatorio = await prisma.relatorio.create({
    data: {
      ...dados,
      empresaId: parseInt(dados.empresaId),
      embarcacaoId: parseInt(dados.embarcacaoId),
      ordemServicoId: os.id,
      numero: proximoNumero,
      ano,
      criadoPorId: req.usuario.id,
      cilindros: { create: (cilindros || []).map(c => extrair(c, CAMPOS_CILINDRO)) },
      ...(testeImo && { testeImo: { create: extrair(testeImo, CAMPOS_TESTE_IMO) } })
    },
    include: { embarcacao: { include: { armador: true } }, empresa: true, ordemServico: true, cilindros: true, testeImo: true }
  })

  res.json(relatorio)
})

// ─── Editar relatório ───────────────────────────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const atual = await prisma.relatorio.findUnique({ where: { id } })
  if (!atual) return res.status(404).json({ erro: 'Relatório não encontrado' })

  if (atual.status !== 'preenchendo') {
    return res.status(400).json({ erro: 'Relatório não pode ser editado neste status' })
  }

  const { cilindros, testeImo } = req.body
  const dados = extrair(req.body, CAMPOS_RELATORIO)
  if (dados.empresaId) dados.empresaId = parseInt(dados.empresaId)
  if (dados.embarcacaoId) dados.embarcacaoId = parseInt(dados.embarcacaoId)

  await prisma.$transaction(async (tx) => {
    if (cilindros) {
      await tx.cilindroRelatorio.deleteMany({ where: { relatorioId: id } })
    }

    await tx.relatorio.update({
      where: { id },
      data: {
        ...dados,
        ...(cilindros && { cilindros: { create: cilindros.map(c => extrair(c, CAMPOS_CILINDRO)) } })
      }
    })

    if (testeImo) {
      const dadosTeste = extrair(testeImo, CAMPOS_TESTE_IMO)
      await tx.testeImo.upsert({
        where: { relatorioId: id },
        create: { relatorioId: id, ...dadosTeste },
        update: dadosTeste
      })
    }
  })

  const completo = await prisma.relatorio.findUnique({
    where: { id },
    include: { embarcacao: { include: { armador: true } }, empresa: true, ordemServico: true, cilindros: true, testeImo: true }
  })
  res.json(completo)
})

// ─── Concluir relatório (assinatura do técnico) ────────────────────────────────
router.post('/:id/concluir', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { assinaturaImg } = req.body

  const relatorio = await prisma.relatorio.findUnique({ where: { id } })
  if (!relatorio) return res.status(404).json({ erro: 'Relatório não encontrado' })
  if (relatorio.status !== 'preenchendo') {
    return res.status(400).json({ erro: 'Relatório já foi concluído' })
  }

  const [, atualizado] = await prisma.$transaction([
    prisma.assinatura.create({
      data: {
        relatorioId: id,
        usuarioId: req.usuario.id,
        etapa: 'tecnico',
        acao: 'aprovada',
        assinaturaImg: assinaturaImg || null
      }
    }),
    prisma.relatorio.update({ where: { id }, data: { status: 'concluido' } })
  ])

  res.json(atualizado)
})

export default router

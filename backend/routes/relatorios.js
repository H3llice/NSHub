import { Router } from 'express'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

const CAMPOS_RELATORIO = [
  'empresaId', 'embarcacaoId', 'data',
  'equipTipo', 'equipNumeroSerie', 'equipAnoFabricacao', 'equipFabricante', 'equipModelo', 'equipClasse', 'equipCapacidade',
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
  'numero', 'valvulaNumero', 'teste', 'carga', 'cargaCO2', 'cargaN2', 'fabricante', 'anoFabricacao',
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

// Campos Int?/Float? no schema — o form manda tudo como string (.value de
// input), então sem essa conversão o Prisma rejeita com "Expected Int/Float,
// provided String" assim que algum desses campos vem preenchido.
const CAMPOS_INTEIROS = [
  'equipCapacidade',
  'foguetesQtd', 'fachosQtd', 'fumigenoQtd', 'pilhasQtd', 'racoesSolidasQtd', 'racoesLiquidasQtd',
  'medicamentosQtd', 'pescaQtd', 'reparosQtd', 'enjooQtd', 'bateriaResgateQtd',
  'olPessoasNr'
]

const CAMPOS_DECIMAIS = [
  'racoesSolidasPesoGramas', 'racoesLiquidasVolumeMl',
  'napValor', 'wpValor', 'giValor', 'fsValor', 'olValor',
  'carga', 'cargaCO2', 'cargaN2', 'caboInternoMetros', 'caboExternoMetros', 'alturaMaximaEstocagemMetros',
  'wpSupInicioPressao', 'wpSupTerminoPressao', 'wpSupDiff', 'wpSupDiffPct',
  'wpInfInicioPressao', 'wpInfTerminoPressao', 'wpInfDiff', 'wpInfDiffPct',
  'giPressaoMaxSuperior', 'giPressaoMaxInferior',
  'napSupInicio', 'napSupTermino', 'napSupDiff', 'napSupDiffPct',
  'napInfInicio', 'napInfTermino', 'napInfDiff', 'napInfDiffPct',
  'olPesoPessoas', 'olPesoBalsa', 'olPesoTotal'
]

function extrair(body, campos) {
  const dados = {}
  for (const campo of campos) {
    if (body[campo] === undefined) continue
    if (body[campo] === '' || body[campo] === null) { dados[campo] = null; continue }
    if (CAMPOS_INTEIROS.includes(campo)) { dados[campo] = typeof body[campo] === 'number' ? body[campo] : parseInt(body[campo]); continue }
    if (CAMPOS_DECIMAIS.includes(campo)) { dados[campo] = typeof body[campo] === 'number' ? body[campo] : parseFloat(body[campo]); continue }
    dados[campo] = body[campo]
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
      include: { embarcacao: { include: { armador: true } }, empresa: true, ordemServico: true, certificado: true },
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
      assinaturas: { include: { usuario: true }, orderBy: { criadoEm: 'asc' } },
      certificado: true
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

// Aplica os campos editáveis do Relatório (identificação, equipamento, seções
// técnicas, cilindros, teste IMO) — reaproveitado pela rota de edição normal
// (abaixo, só com Relatório em 'preenchendo') e pela tela do Certificado
// (backend/routes/certificados.js), que edita o Relatório de origem mesmo
// já concluído — única exceção às travas de documento concluído do sistema.
export async function atualizarRelatorioCompleto(id, body) {
  const { cilindros, testeImo } = body
  const dados = extrair(body, CAMPOS_RELATORIO)
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
}

// ─── Editar relatório ───────────────────────────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const atual = await prisma.relatorio.findUnique({ where: { id } })
  if (!atual) return res.status(404).json({ erro: 'Relatório não encontrado' })

  if (atual.status !== 'preenchendo') {
    return res.status(400).json({ erro: 'Relatório não pode ser editado neste status' })
  }

  await atualizarRelatorioCompleto(id, req.body)

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

// ─── Geração do PDF do Relatório (Lista de Verificação e Reparos de Balsa) ─────
// Mesma técnica do Certificado: imagem de fundo real do modelo em papel
// (assets/relatorio-balsa-fundo.jpeg, extraída do .docm) + valores desenhados
// nas coordenadas originais das caixas de texto do Word (extraídas do XML, não
// estimadas). As seções em lista (kit, componentes, testes) têm espaçamento
// uniforme entre linhas, então usamos um y inicial + passo por linha em vez de
// repetir 70+ coordenadas na mão.
const MM = 2.83465
const MARGEM_ESQUERDA_MM = 10
const MARGEM_TOPO_MM = 12.7
const IMG_LARGURA_MM = 180
const IMG_ALTURA_MM = 270

// Ordem = mesma do KIT_ITENS do frontend (js/modules/relatorios.js)
const KIT_ITENS_ORDEM = [
  'foguetes', 'fachos', 'fumigeno', 'pilhas', 'racoesSolidas', 'racoesLiquidas',
  'medicamentos', 'pesca', 'reparos', 'enjoo', 'bateriaResgate'
]
const KIT_LINHA_Y0 = 31.1
const KIT_LINHA_PASSO = 4.46
const KIT_COL_QTD_X = 7.3
const KIT_COL_SUBSTITUIDO_X = 129.5
const KIT_COL_VALIDADE_X = 158.0

// 16 componentes em 3 colunas (6, 6, 4), mesma ordem do COMPONENTES do frontend
const COMPONENTES_COLUNAS = [
  { x: 6.0, chaves: ['ancoraFlutuante', 'remos', 'quadroSinais', 'facaCaboFlutuante', 'espelhoSinalizacao', 'copoGraduado'] },
  { x: 70.0, chaves: ['aroFlutuante', 'jarrosAgua', 'documentacao', 'lanternaEstanque', 'apito', 'protecaoTermica'] },
  { x: 127.8, chaves: ['esponja', 'refletorRadar', 'abridorLatas', 'foleManual'] },
]
const COMPONENTES_LINHA_Y0 = 93.2
const COMPONENTES_LINHA_PASSO = 4.46

// 5 testes de flutuador, mesma ordem do TESTES_FLUTUADOR do frontend
const TESTES_FLUTUADOR_ORDEM = ['nap', 'wp', 'gi', 'fs', 'ol']
const TESTES_LINHA_Y0 = 129.1
const TESTES_LINHA_PASSO = 4.375
const TESTES_COL_X = 103.0
const TEST_VALOR_POS = { x: 142.7, y: 132.6 }
const TEMP_VALOR_POS = { x: 142.9, y: 141.1 }

// Cilindro — grade de 4 linhas x 2 colunas (múltiplos cilindros: valores juntados com " / ")
const CILINDRO_COL_ESQUERDA_X = 47.4
const CILINDRO_COL_DIREITA_X = 142.9
const CILINDRO_LINHAS_Y = [154.1, 159.1, 164.4, 169.3]

const DATA_ATENDIMENTO_POS = { x: 139.7, y: 243.7 }
const TECNICO_NOME_POS = { x: 51.4, y: 259.4 }

function formatarKg(v) {
  return v === null || v === undefined ? '' : v.toFixed(3).replace('.', ',')
}

// Junta o mesmo campo de todos os cilindros numa única string ("A / B / C") —
// o papel só tem espaço fixo para 1 cilindro, então múltiplos ficam lado a lado.
function juntarCilindros(cilindros, campo, formatador = (v) => v ?? '') {
  return cilindros
    .map(c => formatador(c[campo]))
    .filter(v => v !== '' && v !== null && v !== undefined)
    .join(' / ')
}

// Desenha a página do Relatório (Lista de Verificação e Reparos) dentro de um
// PDFDocument já existente — usada tanto pela rota de PDF do Relatório quanto
// pela do Certificado, que junta as duas páginas num só arquivo (igual ao .docm
// original, que tem Certificado + Relatório no mesmo documento).
export async function desenharPaginaRelatorio(pdfDoc, relatorio) {
  const page = pdfDoc.addPage([595.28, 841.89])
  const alturaPagina = page.getHeight()

  const fundoBytes = fs.readFileSync(path.resolve('assets/relatorio-balsa-fundo.jpeg'))
  const fundoImg = await pdfDoc.embedJpg(fundoBytes)
  page.drawImage(fundoImg, {
    x: MARGEM_ESQUERDA_MM * MM,
    y: alturaPagina - (MARGEM_TOPO_MM + IMG_ALTURA_MM) * MM,
    width: IMG_LARGURA_MM * MM,
    height: IMG_ALTURA_MM * MM,
  })

  const fonteNegrito = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const preto = rgb(0.1, 0.1, 0.1)

  function texto(valor, xMm, yMm, size = 9) {
    if (valor === null || valor === undefined || valor === '') return
    const yTopoPt = alturaPagina - (MARGEM_TOPO_MM + yMm) * MM
    page.drawText(String(valor), {
      x: (MARGEM_ESQUERDA_MM + xMm) * MM,
      y: yTopoPt - size,
      size,
      font: fonteNegrito,
      color: preto,
    })
  }

  // ─── Kit de sobrevivência ─────────────────────────────────────────────────
  KIT_ITENS_ORDEM.forEach((chave, i) => {
    const y = KIT_LINHA_Y0 + i * KIT_LINHA_PASSO
    texto(relatorio[`${chave}Qtd`], KIT_COL_QTD_X, y)
    texto(relatorio[`${chave}Substituido`] ? 'S' : 'N', KIT_COL_SUBSTITUIDO_X, y)
    texto(relatorio[`${chave}Validade`], KIT_COL_VALIDADE_X, y)
  })

  // ─── Checklist de componentes ───────────────────────────────────────────────
  COMPONENTES_COLUNAS.forEach(coluna => {
    coluna.chaves.forEach((chave, i) => {
      const y = COMPONENTES_LINHA_Y0 + i * COMPONENTES_LINHA_PASSO
      texto(relatorio[chave] ? 'S' : 'N', coluna.x, y)
    })
  })

  // ─── Teste dos flutuadores ──────────────────────────────────────────────────
  TESTES_FLUTUADOR_ORDEM.forEach((chave, i) => {
    const y = TESTES_LINHA_Y0 + i * TESTES_LINHA_PASSO
    texto(relatorio[`${chave}Realizado`] ? 'S' : 'N', TESTES_COL_X, y)
  })
  const primeiroValorTeste = TESTES_FLUTUADOR_ORDEM
    .map(chave => relatorio[`${chave}Valor`])
    .find(v => v !== null && v !== undefined)
  texto(primeiroValorTeste, TEST_VALOR_POS.x, TEST_VALOR_POS.y)
  texto(relatorio.temperatura, TEMP_VALOR_POS.x, TEMP_VALOR_POS.y)

  // ─── Cilindro(s) ────────────────────────────────────────────────────────────
  const cilindros = relatorio.cilindros
  texto(juntarCilindros(cilindros, 'numero'), CILINDRO_COL_ESQUERDA_X, CILINDRO_LINHAS_Y[0])
  texto(juntarCilindros(cilindros, 'valvulaNumero'), CILINDRO_COL_DIREITA_X, CILINDRO_LINHAS_Y[0])
  texto(juntarCilindros(cilindros, 'teste'), CILINDRO_COL_ESQUERDA_X, CILINDRO_LINHAS_Y[1])
  texto(juntarCilindros(cilindros, 'carga', formatarKg), CILINDRO_COL_DIREITA_X, CILINDRO_LINHAS_Y[1])
  texto(juntarCilindros(cilindros, 'cargaCO2', formatarKg), CILINDRO_COL_ESQUERDA_X, CILINDRO_LINHAS_Y[2])
  texto(juntarCilindros(cilindros, 'cargaN2', formatarKg), CILINDRO_COL_DIREITA_X, CILINDRO_LINHAS_Y[2])
  texto(juntarCilindros(cilindros, 'fabricante'), CILINDRO_COL_ESQUERDA_X, CILINDRO_LINHAS_Y[3])
  texto(juntarCilindros(cilindros, 'anoFabricacao'), CILINDRO_COL_DIREITA_X, CILINDRO_LINHAS_Y[3])

  // ─── Rodapé ──────────────────────────────────────────────────────────────────
  // relatorio pode ser um Relatorio de verdade OU o JSON dadosTecnicos de um
  // Certificado avulso (ver backend/routes/certificados.js) — nesse segundo
  // caso data/criadoPor vêm emprestados do próprio Certificado, por isso o
  // guard: um avulso sem data de emissão ainda não tem o que mostrar aqui.
  if (relatorio.data) {
    texto(new Date(relatorio.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }), DATA_ATENDIMENTO_POS.x, DATA_ATENDIMENTO_POS.y)
  }
  texto(relatorio.criadoPor?.nome, TECNICO_NOME_POS.x, TECNICO_NOME_POS.y)

  return page
}

const INCLUDE_PDF_RELATORIO = {
  embarcacao: { include: { armador: true } },
  empresa: true,
  criadoPor: true,
  cilindros: true,
  testeImo: true,
}

router.get('/:id/pdf', autenticar, async (req, res) => {
  const relatorio = await prisma.relatorio.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_PDF_RELATORIO
  })
  if (!relatorio) return res.status(404).json({ erro: 'Relatório não encontrado' })

  const pdfDoc = await PDFDocument.create()
  await desenharPaginaRelatorio(pdfDoc, relatorio)

  const pdfBytes = await pdfDoc.save()
  const nomeArquivo = `Relatorio ${relatorio.numero}.${relatorio.ano}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

export { INCLUDE_PDF_RELATORIO }
export default router

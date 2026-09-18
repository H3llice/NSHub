import { Router } from 'express'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

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
  'casuloReparo', 'casuloPintura', 'casuloValvulaNumero', 'casuloValvulaFabricante', 'casuloValvulaValidade',
  'revisaoAnualOk', 'observacoes', 'tecnicoNome'
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
// Financeiro não mexe em Serviços — de fora daqui e das duas rotas abaixo.
router.post('/', autenticar, exigirPerfil('usuario', 'gerente', 'admin', 'tecnico'), async (req, res) => {
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
router.put('/:id', autenticar, exigirPerfil('usuario', 'gerente', 'admin', 'tecnico'), async (req, res) => {
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
router.post('/:id/concluir', autenticar, exigirPerfil('usuario', 'gerente', 'admin', 'tecnico'), async (req, res) => {
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
// +1mm em 2026-09-18 — usuário reportou que os valores do kit/componentes/
// testes/cilindro saíam um pouco acima da linha certa no PDF.
const KIT_LINHA_Y0 = 32.1
const KIT_LINHA_PASSO = 4.46
// Centro horizontal de cada coluna (não a borda) — usadas com centro:true.
const KIT_COL_QTD_X = 17.0
const KIT_COL_QTD_LARGURA = 20.0
const KIT_COL_SUBSTITUIDO_X = 140.0
const KIT_COL_SUBSTITUIDO_LARGURA = 18.0
const KIT_COL_VALIDADE_X = 163.0
const KIT_COL_VALIDADE_LARGURA = 20.0

// 16 componentes em 3 colunas (6, 6, 4), mesma ordem do COMPONENTES do frontend
const COMPONENTES_COLUNAS = [
  { x: 6.0, chaves: ['ancoraFlutuante', 'remos', 'quadroSinais', 'facaCaboFlutuante', 'espelhoSinalizacao', 'copoGraduado'] },
  { x: 70.0, chaves: ['aroFlutuante', 'jarrosAgua', 'documentacao', 'lanternaEstanque', 'apito', 'protecaoTermica'] },
  { x: 127.8, chaves: ['esponja', 'refletorRadar', 'abridorLatas', 'foleManual'] },
]
const COMPONENTES_LINHA_Y0 = 94.2
const COMPONENTES_LINHA_PASSO = 4.46

// 5 testes de flutuador, mesma ordem do TESTES_FLUTUADOR do frontend
const TESTES_FLUTUADOR_ORDEM = ['nap', 'wp', 'gi', 'fs', 'ol']
const TESTES_LINHA_Y0 = 130.1
const TESTES_LINHA_PASSO = 4.375
const TESTES_COL_X = 103.0
const TEST_VALOR_POS = { x: 142.7, y: 133.6 }
const TEMP_VALOR_POS = { x: 142.9, y: 142.1 }

// Cilindro — grade de 4 linhas x 2 colunas (múltiplos cilindros: valores juntados com " / ")
const CILINDRO_COL_ESQUERDA_X = 47.4
const CILINDRO_COL_DIREITA_X = 142.9
const CILINDRO_LINHAS_Y = [155.1, 160.1, 165.4, 170.3]

// Casulo (Glass Fiber Container) — logo abaixo do Cilindro. Coordenadas
// conferidas renderizando a página contra o fundo real (certificado 4057 -
// PEROA OFFSHORE II, migracao/certificados/CERTIFICADOS DE BALSAS 2026) — duas
// correções em relação à 1ª estimativa: REPARO/PINTURA (x 155→148) caíam em
// cima do "NÃO/NO" em vez de no vão em branco entre "SIM/YES" e "NÃO/NO"
// (mesma convenção usada nas linhas de Teste dos Flutuadores); e
// CASULO_VALVULA_NUMERO_POS caía em cima do rótulo "VAL. DE LIBERAÇÃO"
// (reaproveitava CILINDRO_COL_ESQUERDA_X, que é a coluna certa pro Cilindro
// mas não pra essa linha, com rótulo bem mais comprido) — ganhou x próprio.
const CASULO_REPARO_POS = { x: 148.0, y: 178.5 }
const CASULO_PINTURA_POS = { x: 148.0, y: 184.0 }
const CASULO_VALVULA_NUMERO_POS = { x: 75.0, y: 193.3 }
const CASULO_VALVULA_FABRICANTE_POS = { x: CILINDRO_COL_DIREITA_X, y: 193.3 }
const CASULO_VALVULA_VALIDADE_POS = { x: CILINDRO_COL_ESQUERDA_X, y: 199.0 }

const DATA_ATENDIMENTO_POS = { x: 139.7, y: 243.7 }
// Nome de quem criou o registro (criadoPor), centralizado embaixo do logo —
// caixa do meio do rodapé (Navio/Vessel | logo | Data de Atendimento). Y um
// pouco mais baixo que o fundo do logo (~258mm) pra não colar nele.
const RESPONSAVEL_POS = { xCentro: 84.0, y: 261.0 }
// Nome do técnico responsável (Relatorio.tecnicoNome — editável, nasce
// preenchido com criadoPor mas pode ser outra pessoa), logo abaixo da Data
// de Atendimento, na mesma caixa da direita. x original (113.5) caía em cima
// da borda da caixa do meio (logo) — empurrado pra direita pra ficar dentro
// da caixa certa.
const TECNICO_POS = { x: 120.5, y: 250.5 }

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

  // centro:true trata xMm como o CENTRO horizontal da coluna/caixa, não a
  // borda esquerda — usado nas colunas Quantidade/Substituído/Validade e no
  // nome do responsável embaixo do logo. larguraColunaMm (opcional) trava o
  // texto dentro da largura da coluna em vez de deixar centralizar pra fora
  // dela quando o valor é comprido (ex: "indeterminado" na Validade).
  function texto(valor, xMm, yMm, size = 9, centro = false, larguraColunaMm = null) {
    if (valor === null || valor === undefined || valor === '') return
    const yTopoPt = alturaPagina - (MARGEM_TOPO_MM + yMm) * MM
    const larguraTextoPt = fonteNegrito.widthOfTextAtSize(String(valor), size)
    let xPt = (MARGEM_ESQUERDA_MM + xMm) * MM
    if (centro) {
      xPt -= larguraTextoPt / 2
      if (larguraColunaMm) {
        const minXPt = (MARGEM_ESQUERDA_MM + xMm - larguraColunaMm / 2) * MM
        const maxXPt = (MARGEM_ESQUERDA_MM + xMm + larguraColunaMm / 2) * MM - larguraTextoPt
        xPt = Math.max(minXPt, Math.min(xPt, maxXPt))
      }
    }
    page.drawText(String(valor), {
      x: xPt,
      y: yTopoPt - size,
      size,
      font: fonteNegrito,
      color: preto,
    })
  }

  // ─── Kit de sobrevivência ─────────────────────────────────────────────────
  KIT_ITENS_ORDEM.forEach((chave, i) => {
    const y = KIT_LINHA_Y0 + i * KIT_LINHA_PASSO
    texto(relatorio[`${chave}Qtd`], KIT_COL_QTD_X, y, 9, true, KIT_COL_QTD_LARGURA)
    texto(relatorio[`${chave}Substituido`] ? 'S' : 'N', KIT_COL_SUBSTITUIDO_X, y, 9, true, KIT_COL_SUBSTITUIDO_LARGURA)
    texto(relatorio[`${chave}Validade`], KIT_COL_VALIDADE_X, y, 9, true, KIT_COL_VALIDADE_LARGURA)
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

  // ─── Casulo (reparo/pintura da fibra + válvula de liberação) ────────────────
  texto(relatorio.casuloReparo ? 'S' : 'N', CASULO_REPARO_POS.x, CASULO_REPARO_POS.y)
  texto(relatorio.casuloPintura ? 'S' : 'N', CASULO_PINTURA_POS.x, CASULO_PINTURA_POS.y)
  texto(relatorio.casuloValvulaNumero, CASULO_VALVULA_NUMERO_POS.x, CASULO_VALVULA_NUMERO_POS.y)
  texto(relatorio.casuloValvulaFabricante, CASULO_VALVULA_FABRICANTE_POS.x, CASULO_VALVULA_FABRICANTE_POS.y)
  texto(relatorio.casuloValvulaValidade, CASULO_VALVULA_VALIDADE_POS.x, CASULO_VALVULA_VALIDADE_POS.y)

  // ─── Rodapé ──────────────────────────────────────────────────────────────────
  // relatorio pode ser um Relatorio de verdade OU o JSON dadosTecnicos de um
  // Certificado avulso (ver backend/routes/certificados.js) — nesse segundo
  // caso data/criadoPor vêm emprestados do próprio Certificado, por isso o
  // guard: um avulso sem data de emissão ainda não tem o que mostrar aqui.
  if (relatorio.data) {
    texto(new Date(relatorio.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }), DATA_ATENDIMENTO_POS.x, DATA_ATENDIMENTO_POS.y)
  }
  texto(relatorio.criadoPor?.nome, RESPONSAVEL_POS.xCentro, RESPONSAVEL_POS.y, 9, true)
  texto(relatorio.tecnicoNome, TECNICO_POS.x, TECNICO_POS.y)

  return page
}

// ─── PDF do próprio Relatório — modelo "Relatório de Serviços de Balsas" ──────
// Diferente de desenharPaginaRelatorio (acima), que é só a "Lista de
// Verificação" usada como 2ª página do CERTIFICADO — isso aqui é o PDF que sai
// de GET /relatorios/:id/pdf, no modelo de papel de verdade que a empresa usa
// (backend/migracao/RELATÓRIO E TESTES DE BALSAS.docx: "RELATÓRIO DE SERVIÇOS
// DE BALSAS" com identificação + checklist na pág. 1, "Testes de acordo a
// Resolução IMO A.761(18)" na pág. 2). Fundo de cada página = o próprio modelo
// renderizado (LibreOffice) em 210x297mm cheios (sem margem de impressão, já
// que aqui a gente GERA a página inteira, não sobrepõe em papel pré-impresso
// como faz o Certificado). Coordenadas medidas com grid de mm sobre o fundo
// renderizado — 1ª passada, pode precisar ajuste fino depois de ver impresso.
const REL_SERVICO_LARGURA_MM = 210
const REL_SERVICO_ALTURA_MM = 297

const REL_P1_KIT_Y0 = 95
const REL_P1_KIT_PASSO = 5.0
const REL_P1_KIT_QTD_X = 35
const REL_P1_KIT_QTD_LARGURA = 20
const REL_P1_KIT_SUBSTITUIDO_X = 192
const REL_P1_KIT_SUBSTITUIDO_LARGURA = 16
const REL_P1_KIT_VALIDADE_X = 213
const REL_P1_KIT_VALIDADE_LARGURA = 20

// Componentes tem checkbox de verdade no fundo (☐), diferente da Lista de
// Verificação do Certificado (que só tinha "S"/"N" em texto) — por isso marca
// com "X" dentro do quadrado, não com a letra.
const REL_P1_COMPONENTES_COLUNAS = [
  { x: 52, chaves: COMPONENTES_COLUNAS[0].chaves },
  { x: 122, chaves: COMPONENTES_COLUNAS[1].chaves },
  { x: 195, chaves: COMPONENTES_COLUNAS[2].chaves },
]
const REL_P1_COMPONENTES_Y0 = 155
const REL_P1_COMPONENTES_PASSO = 5.0

const REL_P1_TESTES_Y0 = 194
const REL_P1_TESTES_PASSO = 5.0
const REL_P1_TESTES_SIM_X = 146
const REL_P1_TESTES_NAO_X = 179
const REL_P1_TEMP_POS = { x: 199, y: 204 }

const REL_P1_CILINDRO_COL_ESQ_X = 48
const REL_P1_CILINDRO_COL_DIR_X = 155
const REL_P1_CILINDRO_LINHAS_Y = [219, 224, 229, 234]

const REL_P1_VALVULA_NUMERO_POS = { x: 95, y: 243 }
const REL_P1_VALVULA_FABRICANTE_POS = { x: 155, y: 243 }
const REL_P1_VALVULA_VALIDADE_POS = { x: 58, y: 248 }

const REL_P1_OBS_POS = { x: 147, y: 258, larguraMm: 55 }
const REL_P1_REVISAO_SIM_POS = { x: 57, y: 278 }
const REL_P1_REVISAO_NAO_POS = { x: 76, y: 278 }

const REL_P1_CAMPOS = [
  { campo: 'executante', x: 60, y: 36 },
  { campo: 'dataFormatada', x: 110, y: 36 },
  { campo: 'numeroAno', x: 158, y: 36 },
  { campo: 'navio', x: 40, y: 47, larguraMm: 85 },
  { campo: 'portoRegistro', x: 128, y: 47, larguraMm: 70 },
  { campo: 'armador', x: 33, y: 52, larguraMm: 165 },
  { campo: 'tipo', x: 23, y: 57, larguraMm: 47 },
  { campo: 'numeroSerie', x: 100, y: 57, larguraMm: 38 },
  { campo: 'anoFabricacao', x: 175, y: 57, larguraMm: 23 },
  { campo: 'balsaMarca', x: 45, y: 62, larguraMm: 73 },
  { campo: 'capacidade', x: 145, y: 62, larguraMm: 53 },
  { campo: 'numeroAprovacao', x: 48, y: 70, larguraMm: 45 },
]

function valoresRelatorioServico(r) {
  const e = r.embarcacao
  const a = e?.armador
  return {
    executante: r.tecnicoNome || r.criadoPor?.nome || '',
    dataFormatada: r.data ? new Date(r.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
    numeroAno: `${r.numero}/${r.ano}`,
    navio: e?.nome || '',
    portoRegistro: e?.portoRegistro || '',
    armador: a?.nome || '',
    tipo: r.equipTipo || '',
    numeroSerie: r.equipNumeroSerie || '',
    anoFabricacao: r.equipAnoFabricacao || '',
    balsaMarca: r.equipFabricante || '',
    capacidade: r.equipCapacidade ? `${r.equipCapacidade} PAX` : '',
    numeroAprovacao: r.certRevisaoNumero || '',
  }
}

async function desenharRelatorioServicoPagina1(pdfDoc, relatorio) {
  const page = pdfDoc.addPage([595.28, 841.89])
  const alturaPagina = page.getHeight()

  const fundoBytes = fs.readFileSync(path.resolve('assets/relatorio-servico-pagina1-fundo.jpeg'))
  const fundoImg = await pdfDoc.embedJpg(fundoBytes)
  page.drawImage(fundoImg, { x: 0, y: 0, width: REL_SERVICO_LARGURA_MM * MM, height: REL_SERVICO_ALTURA_MM * MM })

  const fonteNegrito = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const preto = rgb(0.1, 0.1, 0.1)

  function texto(valor, xMm, yMm, size = 9, centro = false, larguraColunaMm = null) {
    if (valor === null || valor === undefined || valor === '') return
    const yTopoPt = alturaPagina - yMm * MM
    const larguraTextoPt = fonteNegrito.widthOfTextAtSize(String(valor), size)
    let xPt = xMm * MM
    if (centro) {
      xPt -= larguraTextoPt / 2
      if (larguraColunaMm) {
        const minXPt = (xMm - larguraColunaMm / 2) * MM
        const maxXPt = (xMm + larguraColunaMm / 2) * MM - larguraTextoPt
        xPt = Math.max(minXPt, Math.min(xPt, maxXPt))
      }
    }
    page.drawText(String(valor), { x: xPt, y: yTopoPt - size, size, font: fonteNegrito, color: preto })
  }
  const marcarX = (xMm, yMm) => texto('X', xMm, yMm, 9, true)

  const valores = valoresRelatorioServico(relatorio)
  REL_P1_CAMPOS.forEach(c => texto(valores[c.campo], c.x, c.y, 9, false, c.larguraMm))

  KIT_ITENS_ORDEM.forEach((chave, i) => {
    const y = REL_P1_KIT_Y0 + i * REL_P1_KIT_PASSO
    texto(relatorio[`${chave}Qtd`], REL_P1_KIT_QTD_X, y, 9, true, REL_P1_KIT_QTD_LARGURA)
    texto(relatorio[`${chave}Substituido`] ? 'S' : '', REL_P1_KIT_SUBSTITUIDO_X, y, 9, true, REL_P1_KIT_SUBSTITUIDO_LARGURA)
    texto(relatorio[`${chave}Validade`], REL_P1_KIT_VALIDADE_X, y, 9, true, REL_P1_KIT_VALIDADE_LARGURA)
  })

  REL_P1_COMPONENTES_COLUNAS.forEach(coluna => {
    coluna.chaves.forEach((chave, i) => {
      if (!relatorio[chave]) return
      marcarX(coluna.x, REL_P1_COMPONENTES_Y0 + i * REL_P1_COMPONENTES_PASSO)
    })
  })

  TESTES_FLUTUADOR_ORDEM.forEach((chave, i) => {
    const realizado = relatorio[`${chave}Realizado`]
    if (realizado === null || realizado === undefined) return
    const y = REL_P1_TESTES_Y0 + i * REL_P1_TESTES_PASSO
    marcarX(realizado ? REL_P1_TESTES_SIM_X : REL_P1_TESTES_NAO_X, y)
  })
  texto(relatorio.temperatura, REL_P1_TEMP_POS.x, REL_P1_TEMP_POS.y, 9, true)

  const cilindros = relatorio.cilindros
  texto(juntarCilindros(cilindros, 'numero'), REL_P1_CILINDRO_COL_ESQ_X, REL_P1_CILINDRO_LINHAS_Y[0])
  texto(juntarCilindros(cilindros, 'valvulaNumero'), REL_P1_CILINDRO_COL_DIR_X, REL_P1_CILINDRO_LINHAS_Y[0])
  texto(juntarCilindros(cilindros, 'teste'), REL_P1_CILINDRO_COL_ESQ_X, REL_P1_CILINDRO_LINHAS_Y[1])
  texto(juntarCilindros(cilindros, 'carga', formatarKg), REL_P1_CILINDRO_COL_DIR_X, REL_P1_CILINDRO_LINHAS_Y[1])
  texto(juntarCilindros(cilindros, 'cargaCO2', formatarKg), REL_P1_CILINDRO_COL_ESQ_X, REL_P1_CILINDRO_LINHAS_Y[2])
  texto(juntarCilindros(cilindros, 'cargaN2', formatarKg), REL_P1_CILINDRO_COL_DIR_X, REL_P1_CILINDRO_LINHAS_Y[2])
  texto(juntarCilindros(cilindros, 'fabricante'), REL_P1_CILINDRO_COL_ESQ_X, REL_P1_CILINDRO_LINHAS_Y[3])
  texto(juntarCilindros(cilindros, 'anoFabricacao'), REL_P1_CILINDRO_COL_DIR_X, REL_P1_CILINDRO_LINHAS_Y[3])

  texto(relatorio.casuloValvulaNumero, REL_P1_VALVULA_NUMERO_POS.x, REL_P1_VALVULA_NUMERO_POS.y)
  texto(relatorio.casuloValvulaFabricante, REL_P1_VALVULA_FABRICANTE_POS.x, REL_P1_VALVULA_FABRICANTE_POS.y)
  texto(relatorio.casuloValvulaValidade, REL_P1_VALVULA_VALIDADE_POS.x, REL_P1_VALVULA_VALIDADE_POS.y)

  if (relatorio.observacoes) {
    quebrarLinhasRelatorio(relatorio.observacoes, fonteNegrito, 8, REL_P1_OBS_POS.larguraMm).forEach((linha, i) => {
      texto(linha, REL_P1_OBS_POS.x, REL_P1_OBS_POS.y + i * 4, 8)
    })
  }

  if (relatorio.revisaoAnualOk !== null && relatorio.revisaoAnualOk !== undefined) {
    marcarX(relatorio.revisaoAnualOk ? REL_P1_REVISAO_SIM_POS.x : REL_P1_REVISAO_NAO_POS.x, relatorio.revisaoAnualOk ? REL_P1_REVISAO_SIM_POS.y : REL_P1_REVISAO_NAO_POS.y)
  }

  return page
}

// Quebra de linha simples pra caixas de observação (mesma ideia de
// quebrarLinhas em routes/certificados.js, duplicada aqui pra não criar
// import cruzado entre os dois arquivos de rota).
function quebrarLinhasRelatorio(texto, fonte, size, larguraMm) {
  const larguraMaxPt = larguraMm * MM
  const palavras = String(texto).split(' ')
  const linhas = []
  let linhaAtual = ''
  for (const palavra of palavras) {
    const tentativa = linhaAtual ? `${linhaAtual} ${palavra}` : palavra
    if (!linhaAtual || fonte.widthOfTextAtSize(tentativa, size) <= larguraMaxPt) {
      linhaAtual = tentativa
    } else {
      linhas.push(linhaAtual)
      linhaAtual = palavra
    }
  }
  if (linhaAtual) linhas.push(linhaAtual)
  return linhas
}

// Página 2 — Testes de acordo a Resolução IMO A.761(18) (model TesteImo).
// TÉCNICO NATAL SAFETY / Controlado por se repetem depois de cada teste no
// papel original — mesmo tecnicoNome/controladoPorNome impresso 4 vezes.
async function desenharRelatorioServicoPagina2(pdfDoc, testeImo) {
  const page = pdfDoc.addPage([595.28, 841.89])
  const alturaPagina = page.getHeight()

  const fundoBytes = fs.readFileSync(path.resolve('assets/relatorio-servico-pagina2-fundo.jpeg'))
  const fundoImg = await pdfDoc.embedJpg(fundoBytes)
  page.drawImage(fundoImg, { x: 0, y: 0, width: REL_SERVICO_LARGURA_MM * MM, height: REL_SERVICO_ALTURA_MM * MM })

  const fonteNegrito = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const preto = rgb(0.1, 0.1, 0.1)

  function texto(valor, xMm, yMm, size = 8, centro = false) {
    if (valor === null || valor === undefined || valor === '') return
    const yTopoPt = alturaPagina - yMm * MM
    let xPt = xMm * MM
    if (centro) xPt -= fonteNegrito.widthOfTextAtSize(String(valor), size) / 2
    page.drawText(String(valor), { x: xPt, y: yTopoPt - size, size, font: fonteNegrito, color: preto })
  }
  const marcarX = (xMm, yMm) => texto('X', xMm, yMm, 8, true)
  const simNao = (valor, xSim, xNao, y) => {
    if (valor === null || valor === undefined) return
    marcarX(valor ? xSim : xNao, y)
  }

  // TÉCNICO/CONTROLADO se repete 4x (WP, GI, NAP, FS) nas mesmas colunas
  const TECNICO_X = 50
  const CONTROLADO_X = 150
  const linhasTecnico = [78, 113, 177, 206]
  linhasTecnico.forEach(y => {
    texto(testeImo.tecnicoNome, TECNICO_X, y)
    texto(testeImo.controladoPorNome, CONTROLADO_X, y)
  })

  // WP test
  simNao(testeImo.wpRealizado, 15, 68, 50)
  const wpX = { inicioTemp: 100, inicioPressao: 133, terminoTemp: 161, terminoPressao: 189, diff: 201, diffPct: 208 }
  texto(testeImo.wpSupInicioTemp, wpX.inicioTemp, 64, 7)
  texto(testeImo.wpSupInicioPressao, wpX.inicioPressao, 64, 7)
  texto(testeImo.wpSupTerminoTemp, wpX.terminoTemp, 64, 7)
  texto(testeImo.wpSupTerminoPressao, wpX.terminoPressao, 64, 7)
  texto(testeImo.wpSupDiff, wpX.diff, 64, 7)
  texto(testeImo.wpSupDiffPct, wpX.diffPct, 64, 7)
  texto(testeImo.wpInfInicioTemp, wpX.inicioTemp, 72, 7)
  texto(testeImo.wpInfInicioPressao, wpX.inicioPressao, 72, 7)
  texto(testeImo.wpInfTerminoTemp, wpX.terminoTemp, 72, 7)
  texto(testeImo.wpInfTerminoPressao, wpX.terminoPressao, 72, 7)
  texto(testeImo.wpInfDiff, wpX.diff, 72, 7)
  texto(testeImo.wpInfDiffPct, wpX.diffPct, 72, 7)

  // GI test
  simNao(testeImo.giRealizado, 178, 205, 83)
  texto(testeImo.giPressaoMaxSuperior, 145, 87, 8)
  texto(testeImo.giPressaoMaxInferior, 208, 87, 8)
  if (testeImo.giTuboSuperiorOk !== null && testeImo.giTuboSuperiorOk !== undefined && testeImo.giTuboSuperiorOk) marcarX(170, 101)
  if (testeImo.giTuboInferiorOk !== null && testeImo.giTuboInferiorOk !== undefined && testeImo.giTuboInferiorOk) marcarX(170, 109)

  // NAP test
  simNao(testeImo.napRealizado, 178, 205, 124)
  const napX = { inicio: 100, termino: 163, diff: 195, diffPct: 207 }
  texto(testeImo.napSupInicio, napX.inicio, 142, 7)
  texto(testeImo.napSupTermino, napX.termino, 142, 7)
  texto(testeImo.napSupDiff, napX.diff, 142, 7)
  texto(testeImo.napSupDiffPct, napX.diffPct, 142, 7)
  texto(testeImo.napInfInicio, napX.inicio, 150, 7)
  texto(testeImo.napInfTermino, napX.termino, 150, 7)
  texto(testeImo.napInfDiff, napX.diff, 150, 7)
  texto(testeImo.napInfDiffPct, napX.diffPct, 150, 7)
  simNao(testeImo.napRachaduras, 129, 183, 159)
  simNao(testeImo.napAberturaCostura, 129, 183, 167)

  // FS test
  simNao(testeImo.fsRealizado, 178, 205, 188)
  simNao(testeImo.fsResultadoOk, 95, 115, 193)
  if (testeImo.fsObservacoes) {
    quebrarLinhasRelatorio(testeImo.fsObservacoes, fonteNegrito, 7, 60).slice(0, 3).forEach((linha, i) => {
      texto(linha, 140, 192 + i * 3.5, 7)
    })
  }

  // OL test
  simNao(testeImo.olRealizado, 178, 205, 221)
  texto(testeImo.olPessoasNr, 95, 238, 8)
  texto(testeImo.olPesoPessoas, 178, 238, 8)
  texto(testeImo.olPesoBalsa, 110, 238, 8)
  texto(testeImo.olPesoTotal, 163, 238, 8)
  if (testeImo.olObservacoes) {
    quebrarLinhasRelatorio(testeImo.olObservacoes, fonteNegrito, 7, 140).slice(0, 2).forEach((linha, i) => {
      texto(linha, 45, 249 + i * 3.5, 7)
    })
  }

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
  await desenharRelatorioServicoPagina1(pdfDoc, relatorio)
  if (relatorio.testeImo) {
    await desenharRelatorioServicoPagina2(pdfDoc, relatorio.testeImo)
  }

  const pdfBytes = await pdfDoc.save()
  const nomeArquivo = `Relatorio ${relatorio.numero}.${relatorio.ano}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

export { INCLUDE_PDF_RELATORIO }
export default router

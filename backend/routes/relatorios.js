import { Router } from 'express'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import puppeteer from 'puppeteer'
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
// Recriado em HTML/CSS puro (mesma técnica do OC/Solicitação em backend/routes/pdf.js),
// fiel ao layout do modelo original (backend/migracao/RELATÓRIO E TESTES DE
// BALSAS.docx — que no Word é ele mesmo só 2 imagens de página escaneadas, sem
// texto nativo), com a cor azul do modelo trocada por preto (inclusive no
// logo, reprocessado em backend/assets/relatorio-logo-natal-safety.png — cada
// pixel azul virou preto com opacidade proporcional à intensidade original).
// Pág. 2 (Testes IMO A.761(18)) é gerada por gerarHtmlTestesImo, abaixo, que já
// era HTML/Puppeteer porque no .docx original ela é tabela nativa do Word.
function formatarMetros(v) {
  return v === null || v === undefined ? '' : String(v).replace('.', ',')
}

// Labels bilíngues (PT/EN) exatamente como no modelo em papel — mesma
// ordem/agrupamento de COMPONENTES_COLUNAS (6/6/4, ver acima).
const COMPONENTES_LABELS = {
  ancoraFlutuante: 'Âncora flutuante sobressalente / Drogue with line',
  remos: 'Remo / Paddles',
  quadroSinais: 'Quadro de sinais I / Table of live save sign',
  facaCaboFlutuante: 'Faca com cabo flutuante / Buoyant safety knife',
  espelhoSinalizacao: 'Espelho de sinalização / Signalizing mirror',
  copoGraduado: 'Copo graduado / Graduated glass',
  aroFlutuante: 'Aro flutuante / Lifebuoy with line (30m)',
  jarrosAgua: "Jarros d'água / Drinking vessel",
  documentacao: 'Documentação / Instruction for survival',
  lanternaEstanque: 'Lanterna estanque / Flashlight waterproof',
  apito: 'Apito / Whistle',
  protecaoTermica: 'Proteção térmica conf. Regra 34 / Thermic protection accordant Norm 34',
  esponja: 'Esponja / Sponge',
  refletorRadar: 'Refletor radar / Radar reflector',
  abridorLatas: 'Abridor de latas / Can opener',
  foleManual: 'Fole manual / Hand bellows',
}

// Mesma ordem de TESTES_FLUTUADOR_ORDEM (nap, wp, gi, fs, ol).
const TESTES_FLUTUADOR_LABELS = {
  nap: 'Pressão adicional necessária / Necessary additional pressure (NAP)',
  wp: 'Pressão de trabalho / Working pressure (WP)',
  gi: 'Enchimento com gás / Gas inflation (GI)',
  fs: 'Costuras, piso e flutuadores / Sewing, floor, buoyant (FS)',
  ol: 'Teste de Sobrecarga / Load Test (Davit)',
}

// Mesma ordem de KIT_ITENS_ORDEM (ver acima) — tabela "Lista de Verificação e
// Reparos de Balsas" (Quantidade/Equipamento/Substituído/Validade), que na
// 1ª versão desta página tinha ficado de fora por engano (ela é uma tabela
// nativa do .docx, não faz parte das imagens escaneadas image1/image2).
const KIT_ITENS_LABELS = {
  foguetes: 'Foguetes paraquedas / Parachute signals',
  fachos: 'Fachos luminosos manuais / Hand flares signals',
  fumigeno: 'Fumígeno laranja flutuante / Buoyant yellow smoke',
  pilhas: 'Pilhas sobressalentes / Spare batteries',
  racoesSolidas: 'Rações sólidas / Ration food',
  racoesLiquidas: 'Rações líquidas / Drinking water',
  medicamentos: 'Estojo de medicamentos / First aid kit',
  pesca: 'Estojo de pesca / Fishing kit',
  reparos: 'Estojo de reparos / Repairs kit',
  enjoo: 'Comprimidos p/ enjôo / Tablet for nausea',
  bateriaResgate: 'Bateria de Resgate / Rescue Battery',
}

// Gera a pág. 1 (identificação + checklist) do PDF do Relatório, usada só por
// GET /relatorios/:id/pdf — o Certificado tem seu próprio modelo
// (desenharPaginaRelatorio, acima), que não inclui identificação.
function gerarHtmlServicoBalsa(relatorio) {
  const esc = escapeHtmlRelatorio
  const e = relatorio.embarcacao
  const a = e?.armador
  const cilindros = relatorio.cilindros || []
  const capacidade = relatorio.equipCapacidade ? `${relatorio.equipCapacidade} PAX` : ''
  const executanteNome = relatorio.tecnicoNome || relatorio.criadoPor?.nome || ''
  const dataObj = relatorio.data ? new Date(relatorio.data) : null
  const dataDD = dataObj ? String(dataObj.getUTCDate()).padStart(2, '0') : ''
  const dataMM = dataObj ? String(dataObj.getUTCMonth() + 1).padStart(2, '0') : ''
  const dataAA = dataObj ? String(dataObj.getUTCFullYear()) : ''
  const numeroCompleto = relatorio.numero ? `${relatorio.numero}/${relatorio.ano}` : ''

  const logoPath = path.resolve('assets/relatorio-logo-natal-safety.png')
  const logoBase64 = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : ''

  const assinaturaTecnico = relatorio.assinaturas?.find(as => as.etapa === 'tecnico')

  const kitHtml = KIT_ITENS_ORDEM.map(chave => {
    let equipamento = KIT_ITENS_LABELS[chave]
    if (chave === 'racoesSolidas' && relatorio.racoesSolidasPesoGramas !== null && relatorio.racoesSolidasPesoGramas !== undefined) {
      equipamento += ` &nbsp; ${esc(relatorio.racoesSolidasPesoGramas)} grs.`
    }
    if (chave === 'racoesLiquidas' && relatorio.racoesLiquidasVolumeMl !== null && relatorio.racoesLiquidasVolumeMl !== undefined) {
      equipamento += ` &nbsp; ${esc(relatorio.racoesLiquidasVolumeMl)} ml.`
    }
    return `
      <tr>
        <td class="rs-kit-qtd">${esc(relatorio[`${chave}Qtd`])}</td>
        <td class="rs-kit-equip">${equipamento}</td>
        <td class="rs-kit-check">${caixaMarcada(!!relatorio[`${chave}Substituido`])}</td>
        <td class="rs-kit-val">${esc(relatorio[`${chave}Validade`])}</td>
      </tr>
    `
  }).join('')

  const componentesHtml = COMPONENTES_COLUNAS.map(coluna => `
    <div class="rs-col">
      ${coluna.chaves.map(chave => `<div class="rs-comp-item"><span>${caixaMarcada(!!relatorio[chave])}</span> ${COMPONENTES_LABELS[chave]}</div>`).join('')}
    </div>
  `).join('')

  const testesHtml = TESTES_FLUTUADOR_ORDEM.map(chave => `
    <div class="rs-linha-teste">
      <span>${TESTES_FLUTUADOR_LABELS[chave]}</span>
      <span class="rs-check-pair">${linhaSimNao(relatorio[`${chave}Realizado`])}</span>
    </div>
  `).join('')

  function campo(rot, valor, estilo = '') {
    return `<div class="campo" style="${estilo}"><span class="rot">${rot}</span><span class="val">${esc(valor)}</span></div>`
  }

  const revisaoOk = relatorio.revisaoAnualOk

  return `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 10.5px; color: #000; padding: 14px; }

        .rs-topo { display: flex; gap: 8px; margin-bottom: 6px; }
        .rs-logo { width: 150px; height: 104px; border: 2px solid #000; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .rs-logo img { max-width: 88%; max-height: 88%; }
        .rs-titulo-caixa { flex: 1; border: 2px solid #000; border-radius: 14px; padding: 10px 18px; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
        .rs-titulo-caixa h1 { font-size: 21px; letter-spacing: 0.5px; text-align: center; }
        .rs-linha-topo { display: flex; gap: 20px; font-size: 12px; font-weight: bold; }
        .rs-linha-topo .val { border-bottom: 1px solid #000; padding: 0 4px; min-width: 40px; display: inline-block; font-weight: normal; }

        .rs-caixa { border: 2px solid #000; border-radius: 14px; padding: 6px 16px; margin-bottom: 6px; }
        .rs-linha-id { display: flex; gap: 20px; font-weight: bold; font-size: 11px; margin-bottom: 5px; }
        .rs-linha-id:last-child { margin-bottom: 0; }
        .campo { display: flex; align-items: flex-end; gap: 4px; flex: 1; white-space: nowrap; }
        .campo .val { flex: 1; border-bottom: 1px solid #000; min-height: 13px; font-weight: normal; padding-left: 4px; white-space: normal; }

        .rs-barra { text-align: center; font-weight: bold; font-size: 12.5px; line-height: 1.5; }

        .rs-kit-table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 6px; }
        .rs-kit-table th, .rs-kit-table td { border: 1px solid #000; padding: 2.5px 6px; }
        .rs-kit-table th { font-size: 9px; text-align: center; }
        .rs-kit-qtd { width: 12%; text-align: center; }
        .rs-kit-equip { font-weight: bold; }
        .rs-kit-check { width: 12%; text-align: center; }
        .rs-kit-val { width: 15%; }

        .rs-caixa-comp { display: grid; grid-template-columns: 1.35fr 1.3fr 1fr; gap: 6px 14px; }
        .rs-comp-item { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px; font-size: 9.5px; }
        .rs-comp-item:last-child { margin-bottom: 0; }

        .rs-testes-titulo { text-align: center; font-weight: bold; font-size: 12.5px; margin-bottom: 6px; }
        .rs-testes-corpo { display: flex; gap: 16px; align-items: center; }
        .rs-testes-lista { flex: 1; }
        .rs-linha-teste { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 10px; gap: 12px; }
        .rs-linha-teste:last-child { margin-bottom: 0; }
        .rs-check-pair { font-weight: bold; white-space: nowrap; }
        .rs-caixa-temp { border: 2px solid #000; border-radius: 10px; padding: 10px 12px; text-align: center; font-weight: bold; font-size: 10.5px; }
        .rs-caixa-temp .val { display: inline-block; border: 1px solid #000; border-radius: 4px; min-width: 46px; padding: 2px 6px; margin: 0 4px; font-weight: normal; }

        .rs-linha-dupla { display: flex; gap: 8px; margin-bottom: 6px; }
        .rs-caixa-cabo { flex: 1.3; }
        .rs-caixa-cabo div { margin-bottom: 4px; font-weight: bold; }
        .rs-caixa-cabo div:last-child { margin-bottom: 0; }
        .rs-caixa-cabo .val { border-bottom: 1px solid #000; padding: 0 6px; font-weight: normal; }
        .rs-caixa-obs { flex: 1; }
        .rs-caixa-obs .rot { font-weight: bold; font-size: 11px; margin-bottom: 4px; }
        .rs-caixa-obs .val { font-size: 9.5px; white-space: pre-wrap; }

        .rs-caixa-revisao { display: flex; align-items: center; gap: 20px; font-weight: bold; font-size: 11px; }
        .rs-caixa-revisao .assinatura { margin-left: auto; display: flex; align-items: center; gap: 8px; font-weight: normal; }
        .rs-caixa-revisao img { max-height: 32px; max-width: 110px; }
      </style>
    </head>
    <body>

      <div class="rs-topo">
        <div class="rs-logo">${logoBase64 ? `<img src="${logoBase64}">` : ''}</div>
        <div class="rs-titulo-caixa">
          <h1>RELATÓRIO DE SERVIÇOS DE BALSAS</h1>
          <div class="rs-linha-topo">
            <span>Executante <span class="val">${esc(executanteNome)}</span></span>
            <span>DATA <span class="val">${esc(dataDD)}</span> / <span class="val">${esc(dataMM)}</span> / <span class="val">${esc(dataAA)}</span></span>
            <span>Nº <span class="val">${esc(numeroCompleto)}</span></span>
          </div>
        </div>
      </div>

      <div class="rs-caixa">
        <div class="rs-linha-id">
          ${campo('NAVIO', e?.nome, 'flex:2.2;')}
          ${campo('PORTO REG.', e?.portoRegistro, 'flex:1.2;')}
        </div>
        <div class="rs-linha-id">
          ${campo('ARMADOR', a?.nome)}
        </div>
        <div class="rs-linha-id">
          ${campo('TIPO', relatorio.equipTipo)}
          ${campo('Nº DE SÉRIE', relatorio.equipNumeroSerie, 'flex:1.3;')}
          ${campo('ANO DE FABRICAÇÃO', relatorio.equipAnoFabricacao, 'flex:1.1;')}
        </div>
        <div class="rs-linha-id">
          ${campo('BALSA MARCA', relatorio.equipFabricante, 'flex:2;')}
          ${campo('CAPACIDADE', capacidade)}
        </div>
        <div class="rs-linha-id">
          ${campo('Nº DE APROVAÇÃO', relatorio.certRevisaoNumero, 'flex:1.3;')}
          ${campo('SINAL DE RÁDIO', '')}
          ${campo('Nº / IMO', '')}
        </div>
      </div>

      <div class="rs-caixa rs-barra">
        LISTA DE VERIFICAÇÃO E REPAROS DE BALSAS<br>LIFERAFT CHECKING LIST AND REPAIRS
      </div>

      <table class="rs-kit-table">
        <thead>
          <tr>
            <th>QUANTIDADE<br>QUANTITY</th>
            <th>EQUIPAMENTO / EQUIPMENT</th>
            <th>SUBSTITUÍDO<br>REPLACED</th>
            <th>VALIDADE<br>VALIDITY</th>
          </tr>
        </thead>
        <tbody>
          ${kitHtml}
        </tbody>
      </table>

      <div class="rs-caixa rs-caixa-comp">
        ${componentesHtml}
      </div>

      <div class="rs-caixa">
        <div class="rs-testes-titulo">TESTE DOS FLUTUADORES / BUOYANT TEST</div>
        <div class="rs-testes-corpo">
          <div class="rs-testes-lista">${testesHtml}</div>
          <div class="rs-caixa-temp">TEMP <span class="val">${esc(relatorio.temperatura)}</span> °C</div>
        </div>
      </div>

      <div class="rs-caixa">
        <div class="rs-linha-id">
          ${campo('CILINDRO/CYLINDER', juntarCilindros(cilindros, 'numero'))}
          ${campo('VALV. Nº', juntarCilindros(cilindros, 'valvulaNumero'))}
        </div>
        <div class="rs-linha-id">
          ${campo('TESTE CILINDRO/CYL. TEST', juntarCilindros(cilindros, 'teste'))}
          ${campo('CARGA/CHARGE', juntarCilindros(cilindros, 'carga', formatarKg) && `${juntarCilindros(cilindros, 'carga', formatarKg)} KG.`)}
        </div>
        <div class="rs-linha-id">
          ${campo('CARGA DE CO2/CO2 CHARGE', juntarCilindros(cilindros, 'cargaCO2', formatarKg) && `${juntarCilindros(cilindros, 'cargaCO2', formatarKg)} KG.`)}
          ${campo('CARGA N2/N2 CHARGE', juntarCilindros(cilindros, 'cargaN2', formatarKg) && `${juntarCilindros(cilindros, 'cargaN2', formatarKg)} KG.`)}
        </div>
        <div class="rs-linha-id">
          ${campo('FABRICANTE/MANUFACTURER', juntarCilindros(cilindros, 'fabricante'))}
          ${campo('ANO FABRICAÇÃO/MANUF. DATE', juntarCilindros(cilindros, 'anoFabricacao'))}
        </div>
      </div>

      <div class="rs-caixa">
        <div class="rs-linha-id">
          ${campo('Val. de Liberação / Release Valve Nº', relatorio.casuloValvulaNumero)}
          ${campo('Fabricante / Maker', relatorio.casuloValvulaFabricante)}
        </div>
        <div class="rs-linha-id">
          ${campo('Validade / Exp. Date', relatorio.casuloValvulaValidade)}
        </div>
      </div>

      <div class="rs-linha-dupla">
        <div class="rs-caixa rs-caixa-cabo">
          <div>CABO DE DISPARO INTERNO / LENGTH OF PAINTER INSIDE <span class="val">${esc(juntarCilindros(cilindros, 'caboInternoMetros', formatarMetros))}</span> M</div>
          <div>CABO DE DISPARO EXTERNO / LENGTH OF PAINTER OUTSIDE <span class="val">${esc(juntarCilindros(cilindros, 'caboExternoMetros', formatarMetros))}</span> M</div>
          <div>CAPACIDADE DE ALTURA MÁXIMA / MAX STOWAGE HEIGHT <span class="val">${esc(juntarCilindros(cilindros, 'alturaMaximaEstocagemMetros', formatarMetros))}</span> M</div>
        </div>
        <div class="rs-caixa rs-caixa-obs">
          <div class="rot">OBS:</div>
          <div class="val">${esc(relatorio.observacoes)}</div>
        </div>
      </div>

      <div class="rs-caixa rs-caixa-revisao">
        <span>REVISÃO ANUAL:</span>
        <span>${caixaMarcada(revisaoOk === true)} OK</span>
        <span>${caixaMarcada(revisaoOk === true)} SIM</span>
        <span>${caixaMarcada(revisaoOk === false)} NÃO</span>
        <span class="assinatura">
          ASSINATURA:
          ${assinaturaTecnico?.assinaturaImg
      ? `<img src="${assinaturaTecnico.assinaturaImg}">`
      : esc(executanteNome)
    }
        </span>
      </div>

    </body>
    </html>
  `
}
function escapeHtmlRelatorio(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function caixaMarcada(marcado) {
  return marcado ? '☑' : '☐'
}

function linhaSimNao(valor) {
  if (valor === null || valor === undefined) return `${caixaMarcada(false)} SIM/YES &nbsp; ${caixaMarcada(false)} NÃO/NO`
  return `${caixaMarcada(valor === true)} SIM/YES &nbsp; ${caixaMarcada(valor === false)} NÃO/NO`
}

// Página 2 (Testes IMO A.761(18)) — só existe quando há TesteImo vinculado.
// No .docm original essa página já é tabela nativa do Word (não imagem
// escaneada), então continua sendo gerada via HTML/Puppeteer normalmente.
function gerarHtmlTestesImo(relatorio) {
  const esc = escapeHtmlRelatorio
  const testeImo = relatorio.testeImo

  const logoPath = path.resolve('assets/logo.png')
  const logoBase64 = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : ''

  const estilos = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9.5px; padding: 16px; }
    .header { margin-bottom: 10px; }
    .header img { width: 100%; height: auto; }
    h2 { text-align: center; font-size: 13px; margin: 6px 0; }
    .caixa { border: 1px solid #000; padding: 6px 8px; margin-bottom: 8px; }
    .linha { margin-bottom: 3px; }
    .linha span { color: #444; margin-right: 4px; }
    .linha b { margin-right: 16px; }
    table.tabela-imo { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    table.tabela-imo th, table.tabela-imo td { border: 1px solid #000; padding: 3px 5px; text-align: center; }
    table.tabela-imo th { background: #f0f0f0; font-size: 8.5px; }
    table.tabela-imo td { font-size: 8.5px; }
    .teste-titulo { font-weight: bold; font-size: 10.5px; margin-bottom: 4px; display: flex; justify-content: space-between; }
  `

  const linhasTecnico = `
    <div class="linha"><span>TÉCNICO NATAL SAFETY:</span><b>${esc(testeImo.tecnicoNome)}</b><span>Controlado por / Controlled by:</span><b>${esc(testeImo.controladoPorNome)}</b></div>
  `

  return `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <style>${estilos}</style>
    </head>
    <body>
      <div class="header">${logoBase64 ? `<img src="${logoBase64}" />` : ''}</div>
      <h2>Testes de acordo a Resolução IMO A.761 (18) / IMO Resolution A.761(18)</h2>

      <div class="caixa">
        <div class="teste-titulo"><span>WP test - Teste de pressão de trabalho / Working pressure test</span><span>${linhaSimNao(testeImo.wpRealizado)}</span></div>
        <table class="tabela-imo">
          <tr><th></th><th>Início/Start Temp</th><th>Início/Start mmHg</th><th>Término/Stop Temp</th><th>Término/Stop mmHg</th><th>Diff.</th><th>Diff.%</th></tr>
          <tr><td>Tubo superior / Upper tube</td><td>${esc(testeImo.wpSupInicioTemp)}</td><td>${esc(testeImo.wpSupInicioPressao)}</td><td>${esc(testeImo.wpSupTerminoTemp)}</td><td>${esc(testeImo.wpSupTerminoPressao)}</td><td>${esc(testeImo.wpSupDiff)}</td><td>${esc(testeImo.wpSupDiffPct)}</td></tr>
          <tr><td>Tubo inferior / Lower tube</td><td>${esc(testeImo.wpInfInicioTemp)}</td><td>${esc(testeImo.wpInfInicioPressao)}</td><td>${esc(testeImo.wpInfTerminoTemp)}</td><td>${esc(testeImo.wpInfTerminoPressao)}</td><td>${esc(testeImo.wpInfDiff)}</td><td>${esc(testeImo.wpInfDiffPct)}</td></tr>
        </table>
        ${linhasTecnico}
      </div>

      <div class="caixa">
        <div class="teste-titulo"><span>GI test - Teste de enchimento com gás / Gas inflation test</span><span>${linhaSimNao(testeImo.giRealizado)}</span></div>
        <div class="linha"><span>Pressão Máxima — Tubo superior/Upper tube:</span><b>${esc(testeImo.giPressaoMaxSuperior)} mmHg</b><span>Tubo inferior/Lower tube:</span><b>${esc(testeImo.giPressaoMaxInferior)} mmHg</b></div>
        <div class="linha"><span>Tubo superior OK:</span><b>${caixaMarcada(testeImo.giTuboSuperiorOk)}</b><span>Tubo inferior OK:</span><b>${caixaMarcada(testeImo.giTuboInferiorOk)}</b></div>
        ${linhasTecnico}
      </div>

      <div class="caixa">
        <div class="teste-titulo"><span>NAP test - Pressão adicional necessária / Necessary additional pressure test</span><span>${linhaSimNao(testeImo.napRealizado)}</span></div>
        <table class="tabela-imo">
          <tr><th></th><th>Início/Start mmHg</th><th>Término/Stop mmHg</th><th>Diff.</th><th>Diff.%</th></tr>
          <tr><td>Tubos superior / Upper tube</td><td>${esc(testeImo.napSupInicio)}</td><td>${esc(testeImo.napSupTermino)}</td><td>${esc(testeImo.napSupDiff)}</td><td>${esc(testeImo.napSupDiffPct)}</td></tr>
          <tr><td>Tubos inferior / Lower tube</td><td>${esc(testeImo.napInfInicio)}</td><td>${esc(testeImo.napInfTermino)}</td><td>${esc(testeImo.napInfDiff)}</td><td>${esc(testeImo.napInfDiffPct)}</td></tr>
        </table>
        <div class="linha"><span>Rachaduras/Cracks:</span><b>${linhaSimNao(testeImo.napRachaduras)}</b></div>
        <div class="linha"><span>Abertura da costura/Seam slippage:</span><b>${linhaSimNao(testeImo.napAberturaCostura)}</b></div>
        ${linhasTecnico}
      </div>

      <div class="caixa">
        <div class="teste-titulo"><span>FS test - Teste de piso e costura / Floor seam test</span><span>${linhaSimNao(testeImo.fsRealizado)}</span></div>
        <div class="linha"><span>Resultado satisfatório:</span><b>${linhaSimNao(testeImo.fsResultadoOk)}</b></div>
        <div class="linha"><span>Observações/Remarks:</span><b>${esc(testeImo.fsObservacoes)}</b></div>
        ${linhasTecnico}
      </div>

      <div class="caixa">
        <div class="teste-titulo"><span>OL test - Teste de sobrecarga / Load test</span><span>${linhaSimNao(testeImo.olRealizado)}</span></div>
        <div class="linha">
          <span>Pessoas nº:</span><b>${esc(testeImo.olPessoasNr)}</b>
          <span>Peso pessoas (+10%):</span><b>${esc(testeImo.olPesoPessoas)}</b>
          <span>+ Peso Balsa:</span><b>${esc(testeImo.olPesoBalsa)}</b>
          <span>Peso total:</span><b>${esc(testeImo.olPesoTotal)}</b>
        </div>
        <div class="linha"><span>Observações/Remarks:</span><b>${esc(testeImo.olObservacoes)}</b></div>
      </div>
    </body>
    </html>
  `
}

const INCLUDE_PDF_RELATORIO = {
  embarcacao: { include: { armador: true } },
  empresa: true,
  criadoPor: true,
  cilindros: true,
  testeImo: true,
}

async function renderHtmlParaPdf(browser, html) {
  const page = await browser.newPage()
  await page.setJavaScriptEnabled(false)
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const bytes = await page.pdf({ format: 'A4', printBackground: true })
  await page.close()
  return bytes
}

router.get('/:id/pdf', autenticar, async (req, res) => {
  const relatorio = await prisma.relatorio.findUnique({
    where: { id: Number(req.params.id) },
    include: { ...INCLUDE_PDF_RELATORIO, assinaturas: { include: { usuario: true } } }
  })
  if (!relatorio) return res.status(404).json({ erro: 'Relatório não encontrado' })

  const pdfDoc = await PDFDocument.create()
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  try {
    const pagina1Bytes = await renderHtmlParaPdf(browser, gerarHtmlServicoBalsa(relatorio))
    const pagina1Pdf = await PDFDocument.load(pagina1Bytes)
    const pagina1Pages = await pdfDoc.copyPages(pagina1Pdf, pagina1Pdf.getPageIndices())
    pagina1Pages.forEach(p => pdfDoc.addPage(p))

    // Testes IMO (pág. 2) só existem quando há TesteImo vinculado.
    if (relatorio.testeImo) {
      const imoPdfBytes = await renderHtmlParaPdf(browser, gerarHtmlTestesImo(relatorio))
      const imoPdf = await PDFDocument.load(imoPdfBytes)
      const imoPages = await pdfDoc.copyPages(imoPdf, imoPdf.getPageIndices())
      imoPages.forEach(p => pdfDoc.addPage(p))
    }
  } finally {
    await browser.close()
  }

  const pdfBytes = await pdfDoc.save()
  const nomeArquivo = `Relatorio ${relatorio.numero}.${relatorio.ano}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

export { INCLUDE_PDF_RELATORIO }
export default router

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
// Diferente de desenharPaginaRelatorio (acima), que é só a "Lista de
// Verificação" usada como 2ª página do CERTIFICADO — isso aqui é o PDF que sai
// de GET /relatorios/:id/pdf. Gerado como documento HTML/CSS de verdade,
// renderizado com Puppeteer (mesma técnica de backend/routes/pdf.js pras OCs/
// Solicitações) — não é imagem de fundo com texto por cima (essa técnica é só
// do Certificado, que precisa bater com um modelo impresso pré-existente). O
// conteúdo/campos vêm do modelo original (backend/migracao/RELATÓRIO E TESTES
// DE BALSAS.docx): identificação + checklist na pág. 1, Testes IMO A.761(18)
// na pág. 2.
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

const KIT_LABELS = {
  foguetes: 'Foguetes paraquedas / Parachute signals',
  fachos: 'Fachos luminosos manuais / Hand flares signals',
  fumigeno: 'Fumígeno laranja flutuante / Buoyant yellow smoke',
  pilhas: 'Pilhas sobressalentes / Spare batteries',
  racoesSolidas: 'Rações sólidas / Ration food',
  racoesLiquidas: 'Rações líquidas / Drinking water',
  medicamentos: 'Estojo de medicamentos / First aid kit',
  pesca: 'Estojo de pesca / Fishing kit',
  reparos: 'Estojo de reparos / Repairs kit',
  enjoo: 'Comprimidos p/ enjoo / Tablet for nausea',
  bateriaResgate: 'Bateria de Resgate / Rescue Battery',
}

const COMPONENTES_LABELS = {
  ancoraFlutuante: 'Âncora flutuante sobressalente / Drogue with line',
  remos: 'Remo / Paddles',
  quadroSinais: 'Quadro de sinais / Table of life save sign',
  facaCaboFlutuante: 'Faca com cabo flutuante / Buoyant safety knife',
  espelhoSinalizacao: 'Espelho de sinalização / Signalizing mirror',
  copoGraduado: 'Copo graduado / Graduated glass',
  aroFlutuante: 'Aro flutuante / Lifebuoy with line (30m)',
  jarrosAgua: "Jarros d'água / Drinking vessel",
  documentacao: 'Documentação / Instruction for survival',
  lanternaEstanque: 'Lanterna estanque / Flashlight waterproof',
  apito: 'Apito / Whistle',
  protecaoTermica: 'Proteção térmica conf. Regra 34 / Thermic protection Norm 34',
  esponja: 'Esponja / Sponge',
  refletorRadar: 'Refletor radar / Radar reflector',
  abridorLatas: 'Abridor de latas / Can opener',
  foleManual: 'Fole manual / Hand bellows',
}

const TESTES_LABELS = {
  nap: 'Pressão adicional necessária / Necessary additional pressure (NAP)',
  wp: 'Pressão de trabalho / Working pressure (WP)',
  gi: 'Enchimento com gás / Gas inflation (GI)',
  fs: 'Costuras, piso e flutuadores / Sewing, floor, buoyant (FS)',
  ol: 'Teste de Sobrecarga / Load Test (Davit)',
}

function linhaSimNao(valor) {
  if (valor === null || valor === undefined) return `${caixaMarcada(false)} SIM/YES &nbsp; ${caixaMarcada(false)} NÃO/NO`
  return `${caixaMarcada(valor === true)} SIM/YES &nbsp; ${caixaMarcada(valor === false)} NÃO/NO`
}

function gerarHtmlRelatorioServico(relatorio) {
  const esc = escapeHtmlRelatorio
  const e = relatorio.embarcacao
  const a = e?.armador
  const cilindros = relatorio.cilindros
  const testeImo = relatorio.testeImo
  const executanteNome = relatorio.tecnicoNome || relatorio.criadoPor?.nome || ''
  const dataFormatada = relatorio.data ? new Date(relatorio.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''
  const capacidade = relatorio.equipCapacidade ? `${relatorio.equipCapacidade} PAX` : ''

  const logoPath = path.resolve('assets/logo.png')
  const logoBase64 = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : ''

  const estilos = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9.5px; padding: 16px; }
    .header { margin-bottom: 10px; }
    .header img { width: 100%; height: auto; }
    h1 { text-align: center; font-size: 16px; margin: 8px 0 4px; }
    h2 { text-align: center; font-size: 13px; margin: 6px 0; }
    .subtitulo { text-align: center; font-size: 10px; margin-bottom: 10px; }
    .subtitulo b { margin-right: 18px; }
    .caixa { border: 1px solid #000; padding: 6px 8px; margin-bottom: 8px; }
    .titulo-secao { text-align: center; font-weight: bold; font-size: 10.5px; margin-bottom: 4px; }
    .titulo-secao small { display: block; font-weight: normal; font-size: 9px; }
    .linha { margin-bottom: 3px; }
    .linha span { color: #444; margin-right: 4px; }
    .linha b { margin-right: 16px; }
    table.tabela-kit, table.tabela-testes, table.tabela-imo { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    table.tabela-kit th, table.tabela-kit td,
    table.tabela-imo th, table.tabela-imo td { border: 1px solid #000; padding: 3px 5px; text-align: center; font-size: 9px; }
    table.tabela-kit td:nth-child(2) { text-align: left; }
    table.tabela-kit th { background: #f0f0f0; }
    .componentes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 10px; }
    .item-check { font-size: 9px; padding: 1px 0; }
    table.tabela-testes td { padding: 2px 4px; font-size: 9px; white-space: nowrap; }
    table.tabela-testes td:first-child { width: 55%; }
    .flex-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .rodape-form { display: flex; justify-content: space-between; align-items: center; }
    .pagina2 { page-break-before: always; padding-top: 16px; }
    .teste-titulo { font-weight: bold; font-size: 10.5px; margin-bottom: 4px; display: flex; justify-content: space-between; }
    table.tabela-imo th { background: #f0f0f0; font-size: 8.5px; }
    table.tabela-imo td { font-size: 8.5px; }
  `

  const linhaIdentificacao = `
    <div class="caixa">
      <div class="linha"><span>NAVIO</span><b>${esc(e?.nome)}</b><span>PORTO REG.</span><b>${esc(e?.portoRegistro)}</b></div>
      <div class="linha"><span>ARMADOR</span><b>${esc(a?.nome)}</b></div>
      <div class="linha"><span>TIPO</span><b>${esc(relatorio.equipTipo)}</b><span>Nº DE SÉRIE</span><b>${esc(relatorio.equipNumeroSerie)}</b><span>ANO DE FABRICAÇÃO</span><b>${esc(relatorio.equipAnoFabricacao)}</b></div>
      <div class="linha"><span>BALSA MARCA</span><b>${esc(relatorio.equipFabricante)}</b><span>CAPACIDADE</span><b>${esc(capacidade)}</b></div>
      <div class="linha"><span>Nº DE APROVAÇÃO</span><b>${esc(relatorio.certRevisaoNumero)}</b></div>
    </div>
  `

  const linhaKit = `
    <table class="tabela-kit">
      <thead><tr><th style="width:12%;">QUANTIDADE<br>QUANTITY</th><th>EQUIPAMENTO / EQUIPMENT</th><th style="width:15%;">SUBSTITUÍDO<br>REPLACED</th><th style="width:15%;">VALIDADE<br>VALIDITY</th></tr></thead>
      <tbody>
        ${KIT_ITENS_ORDEM.map(chave => `
          <tr>
            <td>${relatorio[`${chave}Qtd`] ?? ''}</td>
            <td>${KIT_LABELS[chave]}</td>
            <td>${relatorio[`${chave}Substituido`] ? 'S' : ''}</td>
            <td>${esc(relatorio[`${chave}Validade`])}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `

  const linhaComponentes = `
    <div class="caixa componentes">
      ${COMPONENTES_COLUNAS.map(coluna => `
        <div>
          ${coluna.chaves.map(chave => `<div class="item-check">${caixaMarcada(relatorio[chave])} ${COMPONENTES_LABELS[chave]}</div>`).join('')}
        </div>
      `).join('')}
    </div>
  `

  const linhaTestesFlutuadores = `
    <div class="caixa">
      <div class="titulo-secao">TESTE DOS FLUTUADORES / BUOYANT TEST</div>
      <table class="tabela-testes">
        ${TESTES_FLUTUADOR_ORDEM.map(chave => `
          <tr><td>${TESTES_LABELS[chave]}</td><td>${linhaSimNao(relatorio[`${chave}Realizado`])}</td></tr>
        `).join('')}
      </table>
      <div class="linha"><span>TEMP.</span><b>${esc(relatorio.temperatura)} °C</b></div>
    </div>
  `

  const linhaCilindro = `
    <div class="caixa">
      <div class="linha"><span>CILINDRO/CYLINDER</span><b>${esc(juntarCilindros(cilindros, 'numero'))}</b><span>VALV. Nº</span><b>${esc(juntarCilindros(cilindros, 'valvulaNumero'))}</b></div>
      <div class="linha"><span>TESTE CILINDRO/CYL. TEST</span><b>${esc(juntarCilindros(cilindros, 'teste'))}</b><span>CARGA/CHARGE</span><b>${esc(juntarCilindros(cilindros, 'carga', formatarKg))} KG.</b></div>
      <div class="linha"><span>CARGA DE CO2/CO2 CHARGE</span><b>${esc(juntarCilindros(cilindros, 'cargaCO2', formatarKg))} KG.</b><span>KG. CARGA N2/N2 CHARGE</span><b>${esc(juntarCilindros(cilindros, 'cargaN2', formatarKg))} KG.</b></div>
      <div class="linha"><span>FABRICANTE/MANUFACTURER</span><b>${esc(juntarCilindros(cilindros, 'fabricante'))}</b><span>ANO FABRICAÇÃO/MANUF. DATE</span><b>${esc(juntarCilindros(cilindros, 'anoFabricacao'))}</b></div>
    </div>
  `

  const linhaValvula = `
    <div class="caixa">
      <div class="linha"><span>Val. de Liberação / Release Valve Nº</span><b>${esc(relatorio.casuloValvulaNumero)}</b><span>Fabricante/Maker</span><b>${esc(relatorio.casuloValvulaFabricante)}</b></div>
      <div class="linha"><span>Validade / Exp. Date</span><b>${esc(relatorio.casuloValvulaValidade)}</b></div>
    </div>
  `

  const linhaObsRevisao = `
    <div class="caixa flex-2col">
      <div>OBS:<br>${esc(relatorio.observacoes)}</div>
      <div>
        <div>REVISÃO ANUAL: ${caixaMarcada(relatorio.revisaoAnualOk === true)} SIM &nbsp; ${caixaMarcada(relatorio.revisaoAnualOk === false)} NÃO</div>
        <div style="margin-top:14px;">ASSINATURA: ____________________________</div>
      </div>
    </div>
  `

  const linhasTecnico = testeImo ? `
    <div class="linha"><span>TÉCNICO NATAL SAFETY:</span><b>${esc(testeImo.tecnicoNome)}</b><span>Controlado por / Controlled by:</span><b>${esc(testeImo.controladoPorNome)}</b></div>
  ` : ''

  const paginaTestesImo = testeImo ? `
    <div class="pagina2">
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
    </div>
  ` : ''

  return `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <style>${estilos}</style>
    </head>
    <body>
      <div class="header">${logoBase64 ? `<img src="${logoBase64}" />` : ''}</div>
      <h1>RELATÓRIO DE SERVIÇOS DE BALSAS</h1>
      <div class="subtitulo">
        <b>Executante: ${esc(executanteNome)}</b>
        <b>Data: ${esc(dataFormatada)}</b>
        <b>Nº: ${relatorio.numero}/${relatorio.ano}</b>
      </div>

      ${linhaIdentificacao}

      <div class="caixa titulo-secao">
        LISTA DE VERIFICAÇÃO E REPAROS DE BALSAS
        <small>LIFERAFT CHECKING LIST AND REPAIRS</small>
      </div>

      ${linhaKit}
      ${linhaComponentes}
      ${linhaTestesFlutuadores}
      ${linhaCilindro}
      ${linhaValvula}
      ${linhaObsRevisao}

      ${paginaTestesImo}
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

router.get('/:id/pdf', autenticar, async (req, res) => {
  const relatorio = await prisma.relatorio.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_PDF_RELATORIO
  })
  if (!relatorio) return res.status(404).json({ erro: 'Relatório não encontrado' })

  const html = gerarHtmlRelatorioServico(relatorio)

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setJavaScriptEnabled(false)
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const pdfBytes = await page.pdf({ format: 'A4', printBackground: true })
  await browser.close()

  const nomeArquivo = `Relatorio ${relatorio.numero}.${relatorio.ano}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

export { INCLUDE_PDF_RELATORIO }
export default router

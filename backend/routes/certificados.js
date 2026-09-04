import { Router } from 'express'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { desenharPaginaRelatorio, INCLUDE_PDF_RELATORIO, atualizarRelatorioCompleto } from './relatorios.js'

const router = Router()

const INCLUDE_PADRAO = {
  embarcacao: { include: { armador: true } },
  empresa: true,
  relatorio: { include: { ordemServico: true, cilindros: true, testeImo: true } },
  assinaturas: { include: { usuario: true }, orderBy: { criadoEm: 'asc' } }
}

const CAMPOS_EQUIPAMENTO_CERTIFICADO = [
  'equipTipo', 'equipNumeroSerie', 'equipAnoFabricacao', 'equipFabricante', 'equipModelo', 'equipClasse', 'equipCapacidade'
]

// Cópia própria do equipamento no Certificado — indispensável pro avulso (sem
// Relatório), e mantida em paralelo também quando há Relatório vinculado (que
// continua sendo atualizado à parte, via atualizarRelatorioCompleto).
function extrairEquipamentoCertificado(body) {
  const dados = {}
  for (const campo of CAMPOS_EQUIPAMENTO_CERTIFICADO) {
    if (body[campo] === undefined) continue
    if (body[campo] === '' || body[campo] === null) { dados[campo] = null; continue }
    dados[campo] = campo === 'equipCapacidade' ? parseInt(body[campo]) : body[campo]
  }
  return dados
}

// ─── Listar certificados ────────────────────────────────────────────────────────
router.get('/', autenticar, async (req, res) => {
  const { busca, empresa, status, pagina = 1 } = req.query
  const porPagina = 50

  const where = {}
  if (status) where.status = status
  if (empresa) where.empresaId = parseInt(empresa)
  if (busca && !isNaN(busca)) where.numero = parseInt(busca)

  const [certificados, total] = await Promise.all([
    prisma.certificado.findMany({
      where,
      include: { embarcacao: { include: { armador: true } }, empresa: true, relatorio: true },
      orderBy: { numero: 'desc' },
      take: porPagina,
      skip: (parseInt(pagina) - 1) * porPagina
    }),
    prisma.certificado.count({ where })
  ])

  res.json({ certificados, total, pagina: parseInt(pagina), totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Buscar um certificado pelo ID ──────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const certificado = await prisma.certificado.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_PADRAO
  })
  if (!certificado) return res.status(404).json({ erro: 'Certificado não encontrado' })
  res.json(certificado)
})

// Próximo número disponível no ano — compartilhado pelo fluxo com Relatório e
// pelo avulso, senão os dois emitiriam números repetidos.
async function proximoNumeroCertificado(ano) {
  const ultimo = await prisma.certificado.findFirst({ where: { ano }, orderBy: { numero: 'desc' } })
  return ultimo ? ultimo.numero + 1 : 1
}

// ─── Criar certificado — a partir de um Relatório concluído, OU avulso (sem
// Relatório/OS) ──────────────────────────────────────────────────────────────
// O avulso existe pra cobrir a transição pro sistema novo (OS/Relatório ainda
// preenchidos no papel) e a futura importação de certificados antigos, que
// nunca tiveram esse rastro digital — usuário pediu essa exceção explicitamente.
router.post('/', autenticar, async (req, res) => {
  const { relatorioId, empresaId, navio, armador, portoRegistro, telefone, email, dataEmissao, validade, observacoes, relatorio: dadosTecnicos } = req.body
  const ano = new Date().getFullYear()

  if (relatorioId) {
    const relatorio = await prisma.relatorio.findUnique({
      where: { id: parseInt(relatorioId) },
      include: { certificado: true, embarcacao: { include: { armador: true } } }
    })
    if (!relatorio) return res.status(400).json({ erro: 'Relatório não encontrado' })
    if (relatorio.status !== 'concluido') {
      return res.status(400).json({ erro: 'O Relatório precisa estar concluído para gerar o certificado' })
    }
    if (relatorio.certificado) {
      return res.status(400).json({ erro: 'Esse Relatório já tem um certificado gerado' })
    }

    // navio/armador/portoRegistro/telefone/email/equip* nascem copiados da
    // Embarcacao/Relatorio, mas viram cópias PRÓPRIAS do certificado a partir
    // daqui — podem ser corrigidas por certificado sem mexer no cadastro/
    // relatório de origem.
    const certificado = await prisma.certificado.create({
      data: {
        numero: await proximoNumeroCertificado(ano),
        ano,
        empresaId: relatorio.empresaId,
        embarcacaoId: relatorio.embarcacaoId,
        relatorioId: relatorio.id,
        criadoPorId: req.usuario.id,
        navio: relatorio.embarcacao?.nome || null,
        armador: relatorio.embarcacao?.armador?.nome || null,
        portoRegistro: relatorio.embarcacao?.portoRegistro || null,
        telefone: relatorio.embarcacao?.armador?.telefone || null,
        email: relatorio.embarcacao?.armador?.email || null,
        equipTipo: relatorio.equipTipo,
        equipNumeroSerie: relatorio.equipNumeroSerie,
        equipAnoFabricacao: relatorio.equipAnoFabricacao,
        equipFabricante: relatorio.equipFabricante,
        equipModelo: relatorio.equipModelo,
        equipClasse: relatorio.equipClasse,
        equipCapacidade: relatorio.equipCapacidade,
      },
      include: INCLUDE_PADRAO
    })
    return res.json(certificado)
  }

  // Avulso — sem Relatório/OS nem Embarcacao cadastrada. Navio/armador/etc.
  // são texto livre, criados e emitidos num só passo (ver js/modules/
  // certificados.js: a tela de criação é o mesmo formulário completo da
  // edição). O cadastro formal de Embarcacao/Cliente, se algum dia for feito,
  // é independente disso — nunca é pré-requisito.
  if (!empresaId || !navio) {
    return res.status(400).json({ erro: 'Empresa e Navio são obrigatórios' })
  }

  const certificado = await prisma.certificado.create({
    data: {
      numero: await proximoNumeroCertificado(ano),
      ano,
      empresaId: parseInt(empresaId),
      criadoPorId: req.usuario.id,
      navio,
      armador: armador || null,
      portoRegistro: portoRegistro || null,
      telefone: telefone || null,
      email: email || null,
      dataEmissao: dataEmissao ? new Date(dataEmissao).toISOString() : null,
      validade: validade || null,
      observacoes: observacoes || null,
      dadosTecnicos: dadosTecnicos || undefined,
      ...extrairEquipamentoCertificado(req.body)
    },
    include: INCLUDE_PADRAO
  })

  res.json(certificado)
})

// ─── Editar certificado (sempre editável, mesmo já emitido — diferente de OC/
// Relatório/Solicitação, que travam após concluídos) ────────────────────────────
router.put('/:id', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const { dataEmissao, validade, observacoes, empresaId, navio, armador, portoRegistro, telefone, email, relatorio } = req.body

  const certificado = await prisma.certificado.findUnique({ where: { id } })
  if (!certificado) return res.status(404).json({ erro: 'Certificado não encontrado' })

  // Certificado com Relatório vinculado: editar aqui atualiza o Relatório de
  // origem por baixo dos panos (única exceção às travas de doc. concluído).
  // Certificado avulso não tem Relatório — os dados do equipamento moram só
  // nos campos equip* do próprio Certificado (abaixo).
  if (relatorio && certificado.relatorioId) {
    await atualizarRelatorioCompleto(certificado.relatorioId, relatorio)
  }

  const atualizado = await prisma.certificado.update({
    where: { id },
    data: {
      dataEmissao: dataEmissao ? new Date(dataEmissao).toISOString() : null,
      validade: validade || null,
      observacoes: observacoes || null,
      navio: navio || null,
      armador: armador || null,
      portoRegistro: portoRegistro || null,
      telefone: telefone || null,
      email: email || null,
      ...extrairEquipamentoCertificado(req.body),
      ...(relatorio && !certificado.relatorioId && { dadosTecnicos: relatorio }),
      ...(empresaId && { empresaId: parseInt(empresaId) })
    },
    include: INCLUDE_PADRAO
  })

  res.json(atualizado)
})

// ─── Emitir certificado (só gerente/admin) ─────────────────────────────────────
router.post('/:id/emitir', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const { dataEmissao, validade, observacoes, empresaId, navio, armador, portoRegistro, telefone, email, relatorio, assinaturaImg } = req.body

  const certificado = await prisma.certificado.findUnique({ where: { id } })
  if (!certificado) return res.status(404).json({ erro: 'Certificado não encontrado' })
  if (certificado.status !== 'pendente') {
    return res.status(400).json({ erro: 'Certificado já foi emitido' })
  }
  if (!dataEmissao || !validade) {
    return res.status(400).json({ erro: 'Data de emissão e validade são obrigatórias para emitir o certificado' })
  }

  if (relatorio && certificado.relatorioId) {
    await atualizarRelatorioCompleto(certificado.relatorioId, relatorio)
  }

  const [, atualizado] = await prisma.$transaction([
    prisma.assinatura.create({
      data: {
        certificadoId: id,
        usuarioId: req.usuario.id,
        etapa: 'gerente',
        acao: 'aprovada',
        assinaturaImg: assinaturaImg || null
      }
    }),
    prisma.certificado.update({
      where: { id },
      data: {
        status: 'emitido',
        dataEmissao: new Date(dataEmissao).toISOString(),
        validade,
        observacoes: observacoes || null,
        navio: navio || null,
        armador: armador || null,
        portoRegistro: portoRegistro || null,
        telefone: telefone || null,
        email: email || null,
        ...extrairEquipamentoCertificado(req.body),
        ...(relatorio && !certificado.relatorioId && { dadosTecnicos: relatorio }),
        ...(empresaId && { empresaId: parseInt(empresaId) })
      },
      include: INCLUDE_PADRAO
    })
  ])

  res.json(atualizado)
})

// ─── Geração do PDF do Certificado de Balsa ────────────────────────────────────
// A imagem de fundo (assets/certificado-balsa-fundo.jpeg) é o próprio modelo
// oficial em papel (bordas, marca d'água, rótulos PT/EN) extraído do .docm usado
// pela empresa — as margens em branco em cima/embaixo já vêm dela, para impressão
// em papel timbrado. Os valores são desenhados por cima, nas MESMAS coordenadas
// (em mm, relativas ao canto superior esquerdo da imagem) que o Word usava para
// as caixas de texto do modelo original — extraídas do XML do .docm, não estimadas.
const MM = 2.83465 // 1mm em pontos PDF
const MARGEM_ESQUERDA_MM = 10
const MARGEM_TOPO_MM = 12.7
const IMG_LARGURA_MM = 180
const IMG_ALTURA_MM = 270

const CAMPOS_CERTIFICADO = [
  { campo: 'numero', x: 90, y: 45.8, size: 22, bold: true, centro: true },
  { campo: 'navio', x: 31.3, y: 122.4, size: 10, bold: true },
  { campo: 'portoRegistro', x: 125.0, y: 124.9, size: 10, bold: true },
  { campo: 'armador', x: 29.2, y: 135.5, size: 10, bold: true },
  { campo: 'telefone', x: 124.9, y: 133.3, size: 10, bold: true },
  { campo: 'email', x: 29.3, y: 144.7, size: 9, bold: true },
  { campo: 'numeroSerie', x: 126.3, y: 144.5, size: 10, bold: true },
  { campo: 'equipamento', x: 43.0, y: 155.9, size: 10, bold: true },
  { campo: 'capacidade', x: 128.9, y: 155.3, size: 10, bold: true },
  { campo: 'modelo', x: 42.2, y: 167.4, size: 10, bold: true },
  { campo: 'classe', x: 111.7, y: 167.0, size: 10, bold: true },
  { campo: 'fabricante', x: 41.1, y: 177.5, size: 10, bold: true },
  { campo: 'anoFabricacao', x: 132.7, y: 178.6, size: 10, bold: true },
  { campo: 'dataEmissao', x: 120.1, y: 193.7, size: 10, bold: true },
  { campo: 'validade', x: 147.0, y: 193.7, size: 10, bold: true },
]

const ASSINATURA_POS = { x: 66.0, y: 198.4, larguraMm: 56.8, alturaMm: 17.7 }

function valoresCertificado(c) {
  const r = c.relatorio
  const e = c.embarcacao
  const a = e?.armador
  return {
    numero: String(c.numero),
    // navio/armador/portoRegistro/telefone/email são cópias PRÓPRIAS do certificado
    // (editáveis por certificado, sem mexer no cadastro da Embarcacao/Cliente)
    // — o fallback pro dado da Embarcacao só cobre certificados criados antes
    // desses campos existirem.
    navio: c.navio || e?.nome || '',
    portoRegistro: c.portoRegistro || e?.portoRegistro || '',
    armador: c.armador || a?.nome || '',
    telefone: c.telefone || a?.telefone || '',
    email: c.email || a?.email || '',
    // equip* também são cópias próprias do certificado (obrigatório pro avulso,
    // que não tem Relatório nenhum) — fallback pro Relatório só cobre
    // certificados criados antes desses campos existirem no Certificado.
    numeroSerie: c.equipNumeroSerie || r?.equipNumeroSerie || '',
    equipamento: c.equipTipo || r?.equipTipo || '',
    capacidade: (c.equipCapacidade ?? r?.equipCapacidade) ? `${c.equipCapacidade ?? r.equipCapacidade} PAX` : '',
    modelo: c.equipModelo || r?.equipModelo || '',
    classe: c.equipClasse || r?.equipClasse || '',
    fabricante: c.equipFabricante || r?.equipFabricante || '',
    anoFabricacao: c.equipAnoFabricacao || r?.equipAnoFabricacao || '',
    dataEmissao: c.dataEmissao ? new Date(c.dataEmissao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
    validade: c.validade || '',
  }
}

router.get('/:id/pdf', autenticar, async (req, res) => {
  const certificado = await prisma.certificado.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      embarcacao: { include: { armador: true } },
      empresa: true,
      relatorio: { include: INCLUDE_PDF_RELATORIO },
      criadoPor: true,
    }
  })
  if (!certificado) return res.status(404).json({ erro: 'Certificado não encontrado' })

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const alturaPagina = page.getHeight()

  const fundoPath = path.resolve('assets/certificado-balsa-fundo.jpeg')
  const fundoBytes = fs.readFileSync(fundoPath)
  const fundoImg = await pdfDoc.embedJpg(fundoBytes)
  page.drawImage(fundoImg, {
    x: MARGEM_ESQUERDA_MM * MM,
    y: alturaPagina - (MARGEM_TOPO_MM + IMG_ALTURA_MM) * MM,
    width: IMG_LARGURA_MM * MM,
    height: IMG_ALTURA_MM * MM,
  })

  const fonteNormal = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fonteNegrito = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const preto = rgb(0.1, 0.1, 0.1)

  const valores = valoresCertificado(certificado)

  for (const campo of CAMPOS_CERTIFICADO) {
    const texto = valores[campo.campo]
    if (!texto) continue

    const fonte = campo.bold ? fonteNegrito : fonteNormal
    const size = campo.size
    const yTopoPt = alturaPagina - (MARGEM_TOPO_MM + campo.y) * MM
    const yPt = yTopoPt - size

    let xPt = (MARGEM_ESQUERDA_MM + campo.x) * MM
    if (campo.centro) {
      xPt -= fonte.widthOfTextAtSize(texto, size) / 2
    }

    page.drawText(texto, { x: xPt, y: yPt, size, font: fonte, color: preto })
  }

  // Assinatura do engenheiro responsável — só no certificado já emitido; um
  // "pendente" fica sem ela (rascunho, ainda não foi de fato aprovado/assinado).
  if (certificado.status === 'emitido') {
    const assinaturaPath = path.resolve('assets/assinatura-engenheiro.jpeg')
    if (fs.existsSync(assinaturaPath)) {
      const assinaturaBytes = fs.readFileSync(assinaturaPath)
      const assinaturaImg = await pdfDoc.embedJpg(assinaturaBytes)
      const larguraPt = ASSINATURA_POS.larguraMm * MM
      const alturaPt = ASSINATURA_POS.alturaMm * MM
      page.drawImage(assinaturaImg, {
        x: (MARGEM_ESQUERDA_MM + ASSINATURA_POS.x) * MM,
        y: alturaPagina - (MARGEM_TOPO_MM + ASSINATURA_POS.y) * MM - alturaPt,
        width: larguraPt,
        height: alturaPt,
      })
    }
  }

  // Segunda página — Lista de Verificação e Reparos, igual ao .docm original,
  // que tem Certificado + Relatório no mesmo documento de 2 páginas. Vem do
  // Relatório de verdade quando há um vinculado, senão do dadosTecnicos salvo
  // direto no Certificado avulso (data/técnico emprestados do próprio
  // certificado, que não tem "data de atendimento"/técnico responsável próprios).
  const dadosPagina2 = certificado.relatorio
    || (certificado.dadosTecnicos ? { ...certificado.dadosTecnicos, data: certificado.dataEmissao, criadoPor: certificado.criadoPor } : null)
  if (dadosPagina2) {
    await desenharPaginaRelatorio(pdfDoc, dadosPagina2)
  }

  const pdfBytes = await pdfDoc.save()
  const nomeArquivo = `Certificado ${certificado.numero}.${certificado.ano}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

export default router

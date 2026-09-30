import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { htmlContratoLocacao } from '../templates/contrato-locacao.js'
import { gerarPdf } from '../pdf-browser.js'

const router = Router()

const STATUS_VALIDOS = ['ativo', 'encerrado', 'cancelado']
const ESTADOS_DEVOLUCAO = ['bom', 'avariado']

// Contrato tem valores e dados do cliente — quem não é desses perfis não lê nem
// pela API (o menu escondido no frontend não protege nada sozinho).
const PERFIS_LEITURA = ['admin', 'gerente', 'financeiro']
const PERFIS_GESTAO = ['admin', 'gerente']

const INCLUDE_BALSAS = { include: { balsa: true }, orderBy: { id: 'asc' } }

// Documentos do contrato (o contrato assinado etc.) ficam fora de backend/uploads,
// no mesmo esquema dos documentos de balsa/colaborador.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PASTA_DOCUMENTOS = path.resolve(__dirname, '..', 'uploads-privado', 'contratos')
fs.mkdirSync(PASTA_DOCUMENTOS, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PASTA_DOCUMENTOS),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`)
  }),
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')),
  limits: { fileSize: 20 * 1024 * 1024 }
})

// Hoje como data pura (meia-noite UTC) — mesmo formato das datas que chegam dos
// <input type="date">, pra devolução registrada "agora" não cair no dia errado
function hojeDataPura() {
  const agora = new Date()
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()))
}

// Quanto o valor do contrato muda quando uma balsa de valor `valorBalsa` entra
// (ou sai, com sinal trocado). Desconto percentual incide sobre as balsas, então
// acompanha; desconto fixo e frete não dependem da quantidade de balsas.
function deltaValorContrato(contrato, valorBalsa) {
  const valor = valorBalsa || 0
  if (contrato.descontoTipo === 'percentual' && contrato.descontoValor) {
    return valor * (1 - contrato.descontoValor / 100)
  }
  return valor
}

// ─── Listar contratos (paginado) ───────────────────────────────────────────────
router.get('/', autenticar, exigirPerfil(...PERFIS_LEITURA), async (req, res) => {
  const { status, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const where = {}
  if (status) where.status = status

  const [contratos, total] = await Promise.all([
    prisma.contrato.findMany({
      where,
      include: {
        cliente: true,
        criadoPor: { select: { id: true, nome: true } },
        balsas: INCLUDE_BALSAS
      },
      orderBy: { criadoEm: 'desc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.contrato.count({ where })
  ])

  res.json({ contratos, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Dashboard de contratos (tela Início) — contagem por situação ──────────────
router.get('/dashboard', autenticar, exigirPerfil('admin'), async (req, res) => {
  const ativos = await prisma.contrato.findMany({
    where: { status: 'ativo' },
    include: { pagamentos: { where: { status: 'atrasado' }, select: { id: true } } }
  })

  const atrasados = ativos.filter(c => c.pagamentos.length > 0).length

  const limiteVencimento = new Date()
  limiteVencimento.setDate(limiteVencimento.getDate() + 30)
  const vencendoEmBreve = ativos.filter(c => c.dataFim && new Date(c.dataFim) <= limiteVencimento).length

  res.json({
    total: ativos.length,
    atrasados,
    emDia: ativos.length - atrasados,
    vencendoEmBreve
  })
})

// ═══════════════════════════════ DOCUMENTOS ══════════════════════════════════════

// ─── Abrir documento (link em nova aba, token via ?token=) ────────────────────
router.get('/documentos/:docId/arquivo', autenticar, exigirPerfil(...PERFIS_LEITURA), async (req, res) => {
  const documento = await prisma.documentoContrato.findUnique({ where: { id: Number(req.params.docId) } })
  if (!documento) return res.status(404).json({ erro: 'Documento não encontrado' })

  res.setHeader('Content-Type', documento.mimeType)
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(documento.nomeOriginal)}"`)
  res.sendFile(path.join(PASTA_DOCUMENTOS, documento.nomeArquivo))
})

// ─── Remover documento ─────────────────────────────────────────────────────────
router.delete('/documentos/:docId', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const documento = await prisma.documentoContrato.findUnique({ where: { id: Number(req.params.docId) } })
  if (!documento) return res.status(404).json({ erro: 'Documento não encontrado' })

  await prisma.documentoContrato.delete({ where: { id: documento.id } })
  fs.unlink(path.join(PASTA_DOCUMENTOS, documento.nomeArquivo), () => { })
  res.json({ ok: true })
})

// ─── Anexar documento (ex.: contrato assinado) — PDF ou imagem + título ────────
router.post('/:id/documentos', autenticar, exigirPerfil(...PERFIS_GESTAO), upload.single('arquivo'), async (req, res) => {
  const titulo = (req.body.titulo || '').trim()

  if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo PDF ou imagem' })
  if (!titulo) {
    fs.unlink(req.file.path, () => { })
    return res.status(400).json({ erro: 'Título é obrigatório' })
  }

  const contratoId = Number(req.params.id)
  const contrato = await prisma.contrato.findUnique({ where: { id: contratoId } })
  if (!contrato) {
    fs.unlink(req.file.path, () => { })
    return res.status(404).json({ erro: 'Contrato não encontrado' })
  }

  const documento = await prisma.documentoContrato.create({
    data: {
      contratoId,
      titulo,
      nomeOriginal: req.file.originalname,
      nomeArquivo: req.file.filename,
      mimeType: req.file.mimetype
    }
  })
  res.json(documento)
})

// ─── Buscar um contrato pelo ID ─────────────────────────────────────────────────
router.get('/:id', autenticar, exigirPerfil(...PERFIS_LEITURA), async (req, res) => {
  const contrato = await prisma.contrato.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      cliente: true,
      criadoPor: { select: { id: true, nome: true } },
      balsas: INCLUDE_BALSAS,
      documentos: { orderBy: { criadoEm: 'desc' } }
    }
  })
  if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' })
  res.json(contrato)
})

// ─── PDF do contrato (link em nova aba, token via ?token=) ─────────────────────
router.get('/:id/pdf', autenticar, exigirPerfil(...PERFIS_LEITURA), async (req, res) => {
  const contrato = await prisma.contrato.findUnique({
    where: { id: Number(req.params.id) },
    include: { cliente: true, balsas: INCLUDE_BALSAS }
  })
  if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' })

  // O PDF mostra as balsas que estão no contrato agora. Contrato já encerrado não
  // tem nenhuma "agora" — aí mostra todas as que passaram por ele.
  const noContrato = contrato.balsas.filter(cb => !cb.devolvidaEm)
  if (noContrato.length > 0) contrato.balsas = noContrato

  // preferCSSPageSize: as margens do modelo vêm do @page do template
  const pdfBytes = await gerarPdf(htmlContratoLocacao(contrato), { preferCSSPageSize: true })

  const nomeArquivo = `Contrato de Locação ${contrato.numero}.${contrato.ano} - ${contrato.cliente.nome}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

// Valida que as balsas existem, são do estoque de locação e estão disponíveis.
// Devolve uma mensagem de erro, ou null se estiver tudo certo.
async function validarBalsasParaLocacao(balsaIds) {
  const balsasEncontradas = await prisma.balsa.findMany({ where: { id: { in: balsaIds } } })
  if (balsasEncontradas.length !== balsaIds.length) {
    return 'Uma ou mais balsas selecionadas não foram encontradas (ou estão repetidas)'
  }

  const finalidadeErrada = balsasEncontradas.filter(b => b.finalidade !== 'locacao')
  if (finalidadeErrada.length > 0) {
    return `As seguintes balsas não pertencem ao estoque de locação: ${finalidadeErrada.map(b => b.numeroSerie).join(', ')}`
  }

  const indisponiveis = balsasEncontradas.filter(b => b.status !== 'disponivel')
  if (indisponiveis.length > 0) {
    return `As seguintes balsas não estão disponíveis: ${indisponiveis.map(b => b.numeroSerie).join(', ')}`
  }

  return null
}

// ─── Criar contrato (só admin e gerente) ────────────────────────────────────────
router.post('/', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const {
    clienteId, balsas, dataInicio, dataFim,
    valor, frete, descontoTipo, descontoValor, formaPagamento, condicoesPagto, observacoes,
    periodicidadePagamento, dataVencimento
  } = req.body

  if (!clienteId || !Array.isArray(balsas) || balsas.length === 0 || !dataInicio) {
    return res.status(400).json({ erro: 'Cliente, ao menos uma balsa e data de início são obrigatórios' })
  }

  if (dataFim && new Date(dataFim) < new Date(dataInicio)) {
    return res.status(400).json({ erro: 'A data de fim não pode ser anterior à data de início' })
  }

  const balsaIds = balsas.map(b => Number(b.balsaId))

  const periodicidade = periodicidadePagamento === 'mensal' ? 'mensal' : 'unico'

  if (valor && !dataVencimento) {
    return res.status(400).json({ erro: 'Data de vencimento é obrigatória quando há valor definido' })
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: parseInt(clienteId) } })
  if (!cliente) return res.status(400).json({ erro: 'Cliente não encontrado' })

  const erroBalsas = await validarBalsasParaLocacao(balsaIds)
  if (erroBalsas) return res.status(400).json({ erro: erroBalsas })

  const ano = new Date().getFullYear()
  const ultimo = await prisma.contrato.findFirst({
    where: { ano },
    orderBy: { numero: 'desc' }
  })
  const proximoNumero = ultimo ? ultimo.numero + 1 : 1

  const contrato = await prisma.$transaction(async (tx) => {
    const novoContrato = await tx.contrato.create({
      data: {
        numero: proximoNumero,
        ano,
        tipo: 'locacao',
        clienteId: parseInt(clienteId),
        dataInicio: new Date(dataInicio).toISOString(),
        dataFim: dataFim ? new Date(dataFim).toISOString() : null,
        valor: valor ? parseFloat(valor) : null,
        frete: frete ? parseFloat(frete) : null,
        descontoTipo: descontoValor ? (descontoTipo || 'percentual') : null,
        descontoValor: descontoValor ? parseFloat(descontoValor) : null,
        formaPagamento: formaPagamento || null,
        condicoesPagto: condicoesPagto || null,
        observacoes: observacoes || null,
        periodicidadePagamento: periodicidade,
        criadoPorId: req.usuario.id,
        balsas: {
          create: balsas.map(b => ({ balsaId: parseInt(b.balsaId), valor: b.valor ? parseFloat(b.valor) : null }))
        }
      },
      include: { cliente: true, balsas: INCLUDE_BALSAS }
    })

    await tx.balsa.updateMany({
      where: { id: { in: balsaIds } },
      data: { status: 'locado' }
    })

    // Cria a primeira parcela, se houver valor definido
    if (valor && dataVencimento) {
      const dataVenc = new Date(dataVencimento)
      await tx.pagamento.create({
        data: {
          contratoId: novoContrato.id,
          valor: parseFloat(valor),
          dataVencimento: dataVenc.toISOString(),
          referencia: periodicidade === 'mensal'
            ? `${String(dataVenc.getMonth() + 1).padStart(2, '0')}/${dataVenc.getFullYear()}`
            : null
        }
      })
    }

    return novoContrato
  })

  res.json(contrato)
})

// ─── Aditivo: incluir balsa(s) num contrato ativo (só admin e gerente) ──────────
// Todas as balsas de uma mesma chamada entram com o mesmo nº de aditivo (o próximo
// do contrato), que aparece na coluna "Aditivo" do PDF. O valor do contrato sobe
// junto; parcelas já geradas não são alteradas.
router.post('/:id/balsas', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const id = Number(req.params.id)
  const { balsas } = req.body

  if (!Array.isArray(balsas) || balsas.length === 0) {
    return res.status(400).json({ erro: 'Informe ao menos uma balsa' })
  }

  const contrato = await prisma.contrato.findUnique({ where: { id }, include: { balsas: true } })
  if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' })
  if (contrato.status !== 'ativo') {
    return res.status(400).json({ erro: 'Só é possível incluir balsas em contrato ativo' })
  }

  const balsaIds = balsas.map(b => Number(b.balsaId))
  const erroBalsas = await validarBalsasParaLocacao(balsaIds)
  if (erroBalsas) return res.status(400).json({ erro: erroBalsas })

  const aditivo = Math.max(0, ...contrato.balsas.map(cb => cb.aditivo || 0)) + 1
  const acrescimo = balsas.reduce((acc, b) => acc + deltaValorContrato(contrato, parseFloat(b.valor) || 0), 0)

  const atualizado = await prisma.$transaction(async (tx) => {
    await tx.contratoBalsa.createMany({
      data: balsas.map(b => ({
        contratoId: id,
        balsaId: Number(b.balsaId),
        valor: b.valor ? parseFloat(b.valor) : null,
        aditivo
      }))
    })

    await tx.balsa.updateMany({ where: { id: { in: balsaIds } }, data: { status: 'locado' } })

    return tx.contrato.update({
      where: { id },
      data: contrato.valor != null ? { valor: contrato.valor + acrescimo } : {},
      include: { cliente: true, balsas: INCLUDE_BALSAS }
    })
  })

  res.json(atualizado)
})

// ─── Devolução de uma balsa (vistoria) com o contrato ainda ativo ───────────────
// A linha do ContratoBalsa não é apagada — fica como histórico da locação. A
// última balsa não sai por aqui: devolver a última é encerrar o contrato.
router.post('/:id/balsas/:contratoBalsaId/devolucao', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const id = Number(req.params.id)
  const { data, estado, observacoes } = req.body

  if (!ESTADOS_DEVOLUCAO.includes(estado)) {
    return res.status(400).json({ erro: `Estado inválido. Use: ${ESTADOS_DEVOLUCAO.join(', ')}` })
  }

  const contrato = await prisma.contrato.findUnique({ where: { id }, include: { balsas: true } })
  if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado' })
  if (contrato.status !== 'ativo') {
    return res.status(400).json({ erro: 'Só é possível registrar devolução em contrato ativo' })
  }

  const noContrato = contrato.balsas.filter(cb => !cb.devolvidaEm)
  const vinculo = noContrato.find(cb => cb.id === Number(req.params.contratoBalsaId))
  if (!vinculo) return res.status(404).json({ erro: 'Balsa não encontrada neste contrato (ou já devolvida)' })
  if (noContrato.length === 1) {
    return res.status(400).json({ erro: 'Esta é a última balsa do contrato — encerre o contrato para registrar a devolução dela' })
  }

  const devolvidaEm = data ? new Date(data) : hojeDataPura()
  if (devolvidaEm < new Date(contrato.dataInicio)) {
    return res.status(400).json({ erro: 'A devolução não pode ser anterior ao início do contrato' })
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    await tx.contratoBalsa.update({
      where: { id: vinculo.id },
      data: { devolvidaEm, estadoDevolucao: estado, observacoesDevolucao: observacoes || null }
    })

    await tx.balsa.updateMany({ where: { id: vinculo.balsaId, status: 'locado' }, data: { status: 'disponivel' } })

    const novoValor = contrato.valor != null
      ? Math.max(0, contrato.valor - deltaValorContrato(contrato, vinculo.valor))
      : null

    return tx.contrato.update({
      where: { id },
      data: novoValor != null ? { valor: novoValor } : {},
      include: { cliente: true, balsas: INCLUDE_BALSAS }
    })
  })

  res.json(atualizado)
})

// ─── Editar contrato (só admin e gerente) ───────────────────────────────────────
// Balsas entram por POST /:id/balsas (aditivo) e saem por devolução — aqui só
// dados do contrato, valor individual das balsas e status.
router.put('/:id', autenticar, exigirPerfil(...PERFIS_GESTAO), async (req, res) => {
  const id = Number(req.params.id)
  const {
    dataInicio, dataFim, valor, frete, descontoTipo, descontoValor, balsas,
    formaPagamento, condicoesPagto, observacoes, status, devolucao
  } = req.body

  const contratoAtual = await prisma.contrato.findUnique({
    where: { id },
    include: { balsas: true }
  })
  if (!contratoAtual) return res.status(404).json({ erro: 'Contrato não encontrado' })

  const dados = {}
  if (dataInicio) dados.dataInicio = new Date(dataInicio).toISOString()
  if (dataFim !== undefined) dados.dataFim = dataFim ? new Date(dataFim).toISOString() : null
  if (valor !== undefined) dados.valor = valor ? parseFloat(valor) : null
  if (frete !== undefined) dados.frete = frete ? parseFloat(frete) : null
  if (descontoValor !== undefined) {
    dados.descontoValor = descontoValor ? parseFloat(descontoValor) : null
    dados.descontoTipo = descontoValor ? (descontoTipo || 'percentual') : null
  }
  if (formaPagamento !== undefined) dados.formaPagamento = formaPagamento || null
  if (condicoesPagto !== undefined) dados.condicoesPagto = condicoesPagto || null
  if (observacoes !== undefined) dados.observacoes = observacoes || null

  // Valida o par início/fim como vai ficar depois da edição (renovação manda só a dataFim)
  const inicioFinal = dados.dataInicio ?? contratoAtual.dataInicio
  const fimFinal = dados.dataFim !== undefined ? dados.dataFim : contratoAtual.dataFim
  if (fimFinal && new Date(fimFinal) < new Date(inicioFinal)) {
    return res.status(400).json({ erro: 'A data de fim não pode ser anterior à data de início' })
  }

  // Data de fim nova (renovação) → os avisos de vencimento voltam a valer pra ela
  const fimMudou = dados.dataFim !== undefined &&
    new Date(dados.dataFim || 0).getTime() !== new Date(contratoAtual.dataFim || 0).getTime()
  if (fimMudou) {
    dados.avisoVencimentoEnviado = false
    dados.avisoVencidoEnviado = false
  }

  if (status) {
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` })
    }
    // Contrato de venda não tem "encerrado" — venda é definitiva, só pode ser cancelada
    if (contratoAtual.tipo === 'venda' && status === 'encerrado') {
      return res.status(400).json({ erro: 'Contratos de venda não podem ser "encerrados", apenas cancelados' })
    }
    dados.status = status
  }

  const finalizando = status && ['encerrado', 'cancelado'].includes(status) && contratoAtual.status === 'ativo'

  // Encerrar = as balsas voltaram: exige a vistoria (data e estado) das que ainda
  // estão com o cliente. Cancelar só desfaz o contrato, sem vistoria.
  if (finalizando && status === 'encerrado' && !ESTADOS_DEVOLUCAO.includes(devolucao?.estado)) {
    return res.status(400).json({ erro: `Informe o estado das balsas na devolução (${ESTADOS_DEVOLUCAO.join(' ou ')})` })
  }

  // Só as balsas que estão no contrato agora — as já devolvidas podem estar em outro contrato
  const noContrato = contratoAtual.balsas.filter(cb => !cb.devolvidaEm)

  const contrato = await prisma.$transaction(async (tx) => {
    await tx.contrato.update({ where: { id }, data: dados })

    // Ao encerrar ou cancelar o contrato, libera as balsas vinculadas de volta para disponível
    if (finalizando) {
      const encerrando = status === 'encerrado'
      await tx.contratoBalsa.updateMany({
        where: { id: { in: noContrato.map(cb => cb.id) } },
        data: {
          devolvidaEm: encerrando && devolucao.data ? new Date(devolucao.data) : hojeDataPura(),
          estadoDevolucao: encerrando ? devolucao.estado : null,
          observacoesDevolucao: encerrando ? (devolucao.observacoes || null) : null
        }
      })

      await tx.balsa.updateMany({
        where: { id: { in: noContrato.map(cb => cb.balsaId) }, status: { in: ['locado', 'vendido'] } },
        data: { status: 'disponivel' }
      })
    }

    // Permite corrigir o valor individual de balsas já vinculadas — não adiciona/remove balsas do contrato
    if (Array.isArray(balsas)) {
      for (const b of balsas) {
        const vinculada = noContrato.find(cb => cb.balsaId === parseInt(b.balsaId))
        if (!vinculada) continue
        await tx.contratoBalsa.update({
          where: { id: vinculada.id },
          data: { valor: b.valor ? parseFloat(b.valor) : null }
        })
      }
    }

    return tx.contrato.findUnique({
      where: { id },
      include: { cliente: true, balsas: INCLUDE_BALSAS }
    })
  })

  res.json(contrato)
})

export default router

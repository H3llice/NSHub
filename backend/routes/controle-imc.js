import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { FUNCOES_TECNICO } from './colaboradores.js'
import { htmlControleImc, nomeArquivoControleImc } from '../templates/controle-imc.js'
import { aplicarTimbrado } from '../templates/relatorio-tecnico.js'
import { gerarPdf } from '../pdf-browser.js'

const router = Router()

// Conformidade → Controle de IMC. Peso e altura são dado de saúde — só admin e
// gerente, inclusive pra ler (o menu escondido no frontend não protege).
const PERFIS_IMC = ['admin', 'gerente']

// Faixas aceitas — só pra barrar erro de digitação (altura em cm, peso com vírgula no lugar errado)
const ALTURA_MIN = 1, ALTURA_MAX = 2.5
const PESO_MIN = 30, PESO_MAX = 300

function lerMesAno(origem) {
  const mes = Number(origem.mes)
  const ano = Number(origem.ano)
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || ano < 2000 || ano > 2100) return null
  return { mes, ano }
}

// Última pesagem de cada colaborador ANTES do mês (pra variação e altura sugerida):
// Map colaboradorId → { altura, peso, mes, ano }
async function pesagensAnteriores(colaboradorIds, { mes, ano }) {
  const anteriores = await prisma.medicaoImc.findMany({
    where: {
      colaboradorId: { in: colaboradorIds },
      controle: { OR: [{ ano: { lt: ano } }, { ano, mes: { lt: mes } }] }
    },
    include: { controle: { select: { mes: true, ano: true } } },
    orderBy: [{ controle: { ano: 'desc' } }, { controle: { mes: 'desc' } }]
  })
  const porColaborador = new Map()
  for (const m of anteriores) {
    if (!porColaborador.has(m.colaboradorId)) {
      porColaborador.set(m.colaboradorId, { altura: m.altura, peso: m.peso, mes: m.controle.mes, ano: m.controle.ano })
    }
  }
  return porColaborador
}

// ─── Tela do mês ──────────────────────────────────────────────────────────────
// Técnicos ativos + quem já tem pesagem no mês (técnico que saiu ou mudou de
// função continua no mês em que foi pesado). Mês sem nada gravado ainda vem
// com empresa/PCMSO do último mês registrado.
router.get('/', autenticar, exigirPerfil(...PERFIS_IMC), async (req, res) => {
  const periodo = lerMesAno(req.query)
  if (!periodo) return res.status(400).json({ erro: 'Mês/ano inválido' })

  const controle = await prisma.controleImc.findUnique({
    where: { ano_mes: periodo },
    include: { medicoes: true }
  })
  const ultimo = controle || await prisma.controleImc.findFirst({ orderBy: [{ ano: 'desc' }, { mes: 'desc' }] })

  const medicoes = controle?.medicoes || []
  const colaboradores = await prisma.colaborador.findMany({
    where: {
      OR: [
        { ativo: true, funcao: { in: FUNCOES_TECNICO } },
        { id: { in: medicoes.map(m => m.colaboradorId) } }
      ]
    },
    select: { id: true, nome: true, funcao: true, ativo: true },
    orderBy: { nome: 'asc' }
  })

  const anteriores = await pesagensAnteriores(colaboradores.map(c => c.id), periodo)
  const medicaoDe = new Map(medicoes.map(m => [m.colaboradorId, m]))

  res.json({
    ...periodo,
    salvo: !!controle,
    empresaId: ultimo?.empresaId ?? null,
    pcmso: ultimo?.pcmso ?? '',
    tecnicos: colaboradores.map(c => {
      const m = medicaoDe.get(c.id)
      return {
        colaboradorId: c.id,
        nome: c.nome,
        funcao: c.funcao,
        ativo: c.ativo,
        altura: m?.altura ?? null,
        peso: m?.peso ?? null,
        observacoes: m?.observacoes ?? '',
        anterior: anteriores.get(c.id) || null
      }
    })
  })
})

// ─── Salvar o mês ─────────────────────────────────────────────────────────────
// Recebe a tela inteira: técnico sem peso = sem pesagem no mês (apaga se tinha).
router.put('/', autenticar, exigirPerfil(...PERFIS_IMC), async (req, res) => {
  const periodo = lerMesAno(req.body)
  if (!periodo) return res.status(400).json({ erro: 'Mês/ano inválido' })

  const empresaId = req.body.empresaId ? Number(req.body.empresaId) : null
  if (empresaId && !(await prisma.empresa.findUnique({ where: { id: empresaId } }))) {
    return res.status(400).json({ erro: 'Empresa não encontrada' })
  }
  const pcmso = String(req.body.pcmso || '').trim() || null

  const medicoes = []
  for (const bruto of Array.isArray(req.body.medicoes) ? req.body.medicoes : []) {
    const colaboradorId = Number(bruto.colaboradorId)
    const peso = bruto.peso === '' || bruto.peso == null ? null : Number(bruto.peso)
    const altura = bruto.altura === '' || bruto.altura == null ? null : Number(bruto.altura)
    if (!Number.isInteger(colaboradorId)) return res.status(400).json({ erro: 'Técnico inválido' })
    if (peso === null) continue

    const nome = bruto.nome || `colaborador ${colaboradorId}`
    if (!(peso >= PESO_MIN && peso <= PESO_MAX)) {
      return res.status(400).json({ erro: `Peso de ${nome} fora do esperado (${PESO_MIN} a ${PESO_MAX} kg)` })
    }
    if (!(altura >= ALTURA_MIN && altura <= ALTURA_MAX)) {
      return res.status(400).json({ erro: `Altura de ${nome} fora do esperado (em metros, ex.: 1,75)` })
    }
    medicoes.push({ colaboradorId, peso, altura, observacoes: String(bruto.observacoes || '').trim() || null })
  }

  const ids = medicoes.map(m => m.colaboradorId)
  if (new Set(ids).size !== ids.length) return res.status(400).json({ erro: 'Técnico repetido na lista' })
  const existentes = await prisma.colaborador.count({ where: { id: { in: ids } } })
  if (existentes !== ids.length) return res.status(400).json({ erro: 'Colaborador não encontrado' })

  await prisma.$transaction(async tx => {
    const controle = await tx.controleImc.upsert({
      where: { ano_mes: periodo },
      create: { ...periodo, empresaId, pcmso },
      update: { empresaId, pcmso }
    })
    await tx.medicaoImc.deleteMany({ where: { controleId: controle.id, colaboradorId: { notIn: ids } } })
    for (const m of medicoes) {
      await tx.medicaoImc.upsert({
        where: { controleId_colaboradorId: { controleId: controle.id, colaboradorId: m.colaboradorId } },
        create: { controleId: controle.id, ...m },
        update: { peso: m.peso, altura: m.altura, observacoes: m.observacoes }
      })
    }
  })

  res.json({ ok: true })
})

// ─── PDF do mês (link em nova aba, token via ?token=) ─────────────────────────
// Documento de auditoria: cabeçalho (empresa/período/PCMSO) + gráfico, no papel
// timbrado. Sem nomes — só o número de cada técnico.
router.get('/pdf', autenticar, exigirPerfil(...PERFIS_IMC), async (req, res) => {
  const periodo = lerMesAno(req.query)
  if (!periodo) return res.status(400).json({ erro: 'Mês/ano inválido' })

  const controle = await prisma.controleImc.findUnique({
    where: { ano_mes: periodo },
    include: { medicoes: true, empresa: true }
  })
  if (!controle || controle.medicoes.length === 0) {
    return res.status(404).json({ erro: 'Nenhuma pesagem salva neste mês' })
  }

  const conteudo = await gerarPdf(htmlControleImc(controle), { preferCSSPageSize: true })
  const pdfBytes = await aplicarTimbrado(conteudo, controle.empresa?.cnpj)

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivoControleImc(controle))}`)
  res.send(Buffer.from(pdfBytes))
})

export default router

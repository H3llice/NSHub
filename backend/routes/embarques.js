import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPermissao } from '../middleware/auth.js'

const router = Router()

// Qualquer perfil logado vê embarques e folgas/dobras; só admin/gerente — ou
// quem tiver a permissão extra "embarques" — criam, editam e excluem
// (folga/dobra vira pagamento na folha).

const UM_DIA = 24 * 60 * 60 * 1000

const INCLUDE_PADRAO = {
  embarcacao: { select: { id: true, nome: true } },
  armador: { select: { id: true, nome: true } },
  criadoPor: { select: { id: true, nome: true } },
  colaboradores: {
    include: { colaborador: { select: { id: true, nome: true, funcao: true, ativo: true } } },
    orderBy: { colaborador: { nome: 'asc' } }
  }
}

// Datas de embarque são datas puras: "2026-09-10" → meia-noite UTC. Todo o
// cálculo usa a chave "AAAA-MM-DD" em UTC, nunca hora local (o servidor roda
// em America/Sao_Paulo e a meia-noite UTC cai no dia anterior no horário local).
const chaveDia = data => new Date(data).toISOString().slice(0, 10)
const somarDias = (chave, n) => chaveDia(new Date(chave + 'T00:00:00Z').getTime() + n * UM_DIA)
const lerData = valor => (/^\d{4}-\d{2}-\d{2}$/.test(valor || '') ? new Date(valor + 'T00:00:00Z') : null)

// ─── Regra de folga/dobra ──────────────────────────────────────────────────────
// Recebe TODOS os embarques de um colaborador e devolve um Map dia → situação:
//   { tipo: 'embarcado', embarqueId, dobra, folgaDeEmbarqueId }
//   { tipo: 'folga', folgaDeEmbarqueId }
// - Cada dia embarcado gera 1 dia de folga (inclusive o dia de embarque e o de
//   desembarque: 10→12/09 = 3 folgas).
// - As folgas ocupam os dias logo após o desembarque (13, 14, 15/09). Se algum
//   desses dias já for folga de um embarque anterior, a nova folga vai pro
//   próximo dia livre (folgas se acumulam, não se sobrepõem).
// - Embarcar num dia que era folga = dobra (pagamento por trabalhar na folga).
//   A dobra SUBSTITUI a folga: aquela folga é consumida e o dia de dobra não
//   gera folga nova (ex.: 10→12 e depois 13→15 = 3 dobras e nenhuma folga).
// Embarques do mesmo colaborador nunca se sobrepõem (validado ao salvar), então
// processar em ordem cronológica basta: as folgas de um embarque só podem cair
// em embarques posteriores, que ainda vão ser processados.
// dataInicio/dataFim de cada embarque recebido aqui já são o período DO
// COLABORADOR naquele embarque (ver embarquesPorColaborador), que pode ser menor
// que o do embarque inteiro.
function calcularDiasColaborador(embarques) {
  const dias = new Map()
  const ordenados = [...embarques].sort((a, b) => new Date(a.dataInicio) - new Date(b.dataInicio))

  for (const e of ordenados) {
    const inicio = chaveDia(e.dataInicio)
    const fim = chaveDia(e.dataFim)
    let folgasGeradas = 0

    for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
      const atual = dias.get(d)
      const dobra = atual?.tipo === 'folga'
      dias.set(d, { tipo: 'embarcado', embarqueId: e.id, dobra, folgaDeEmbarqueId: dobra ? atual.folgaDeEmbarqueId : null })
      if (!dobra) folgasGeradas++
    }

    let d = somarDias(fim, 1)
    for (let n = 0; n < folgasGeradas; d = somarDias(d, 1)) {
      if (dias.has(d)) continue
      dias.set(d, { tipo: 'folga', folgaDeEmbarqueId: e.id })
      n++
    }
  }

  return dias
}

// Período que o colaborador de fato passou embarcado: o individual do vínculo,
// ou o do embarque inteiro quando não foi informado
function periodoDoVinculo(vinculo) {
  return {
    dataInicio: vinculo.dataInicio || vinculo.embarque.dataInicio,
    dataFim: vinculo.dataFim || vinculo.embarque.dataFim
  }
}

// Todos os embarques de cada colaborador pedido, agrupados: Map colaboradorId → embarques[]
// Cada embarque vem com dataInicio/dataFim trocados pelo período do colaborador —
// é o que folga/dobra e a folha de pagamento usam.
async function embarquesPorColaborador(colaboradorIds) {
  const vinculos = await prisma.embarqueColaborador.findMany({
    where: colaboradorIds ? { colaboradorId: { in: colaboradorIds } } : {},
    include: {
      embarque: { include: { embarcacao: { select: { nome: true } } } },
      colaborador: { select: { id: true, nome: true, funcao: true, ativo: true } }
    }
  })

  const grupos = new Map()
  for (const v of vinculos) {
    if (!grupos.has(v.colaboradorId)) grupos.set(v.colaboradorId, { colaborador: v.colaborador, embarques: [] })
    grupos.get(v.colaboradorId).embarques.push({ ...v.embarque, ...periodoDoVinculo(v) })
  }
  return grupos
}

// Dobras que caem dentro de um embarque, por colaborador — devolvidas ao salvar
// pra tela avisar na hora quem está trabalhando na folga.
async function dobrasDoEmbarque(embarque) {
  const grupos = await embarquesPorColaborador(embarque.colaboradores.map(c => c.colaboradorId))
  const resultado = []

  for (const { colaborador, embarques } of grupos.values()) {
    const dias = calcularDiasColaborador(embarques)
    const datas = [...dias.entries()]
      .filter(([, info]) => info.tipo === 'embarcado' && info.dobra && info.embarqueId === embarque.id)
      .map(([data]) => data)
      .sort()
    if (datas.length > 0) resultado.push({ colaborador: { id: colaborador.id, nome: colaborador.nome }, datas })
  }
  return resultado
}

// Valida e normaliza o corpo de criação/edição. Retorna { dados, colaboradores } ou { erro }.
// body.colaboradores: [{ colaboradorId, dataInicio?, dataFim? }] — datas em branco
// = período inteiro do embarque. (body.colaboradorIds, só ids, ainda é aceito.)
function lerCorpo(body) {
  const dataInicio = lerData(body.dataInicio)
  const dataFim = lerData(body.dataFim)

  if (!Number(body.embarcacaoId)) return { erro: 'Embarcação é obrigatória' }
  if (!Number(body.armadorId)) return { erro: 'Armador é obrigatório' }
  if (!dataInicio || !dataFim) return { erro: 'Datas de início e fim são obrigatórias' }
  if (dataFim < dataInicio) return { erro: 'A data de fim não pode ser antes da data de início' }

  const entrada = Array.isArray(body.colaboradores)
    ? body.colaboradores
    : (body.colaboradorIds || []).map(colaboradorId => ({ colaboradorId }))

  const colaboradores = []
  for (const c of entrada) {
    const colaboradorId = Number(c?.colaboradorId)
    if (!colaboradorId || colaboradores.some(x => x.colaboradorId === colaboradorId)) continue

    const inicio = lerData(c.dataInicio)
    const fim = lerData(c.dataFim)
    if ((c.dataInicio && !inicio) || (c.dataFim && !fim)) return { erro: 'Data inválida no período de um colaborador' }

    const inicioEfetivo = inicio || dataInicio
    const fimEfetivo = fim || dataFim
    if (fimEfetivo < inicioEfetivo) return { erro: 'O desembarque de um colaborador não pode ser antes do embarque dele' }
    if (inicioEfetivo < dataInicio || fimEfetivo > dataFim) {
      return { erro: 'O período de cada colaborador tem que ficar dentro do período do embarque' }
    }

    // Igual ao do embarque → grava null (ver EmbarqueColaborador no schema)
    colaboradores.push({
      colaboradorId,
      dataInicio: inicioEfetivo.getTime() !== dataInicio.getTime() ? inicioEfetivo : null,
      dataFim: fimEfetivo.getTime() !== dataFim.getTime() ? fimEfetivo : null
    })
  }
  if (colaboradores.length === 0) return { erro: 'Selecione ao menos um colaborador' }

  return {
    dados: {
      embarcacaoId: Number(body.embarcacaoId),
      armadorId: Number(body.armadorId),
      dataInicio,
      dataFim,
      observacoes: (body.observacoes || '').trim() || null
    },
    colaboradores
  }
}

// Um colaborador não pode estar em dois embarques no mesmo dia. O que conta é o
// período de cada colaborador, não o do embarque: quem desceu dia 12 de um
// embarque que vai até o dia 20 pode subir em outro no dia 13.
async function verificarConflitos(colaboradores, dados, ignorarEmbarqueId) {
  const periodos = new Map(colaboradores.map(c => [c.colaboradorId, {
    dataInicio: c.dataInicio || dados.dataInicio,
    dataFim: c.dataFim || dados.dataFim
  }]))

  // O período individual fica sempre dentro do período do embarque, então buscar
  // pelos embarques que tocam este já traz todos os candidatos a conflito
  const candidatos = await prisma.embarqueColaborador.findMany({
    where: {
      colaboradorId: { in: [...periodos.keys()] },
      embarque: {
        dataInicio: { lte: dados.dataFim },
        dataFim: { gte: dados.dataInicio },
        ...(ignorarEmbarqueId ? { id: { not: ignorarEmbarqueId } } : {})
      }
    },
    include: { colaborador: { select: { nome: true } }, embarque: { include: { embarcacao: { select: { nome: true } } } } }
  })

  const conflitos = candidatos
    .map(v => ({ v, existente: periodoDoVinculo(v), novo: periodos.get(v.colaboradorId) }))
    .filter(({ existente, novo }) => existente.dataInicio <= novo.dataFim && existente.dataFim >= novo.dataInicio)
  if (conflitos.length === 0) return null

  const formatar = d => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  return 'Colaborador já embarcado nesse período: ' + conflitos.map(({ v, existente }) =>
    `${v.colaborador.nome} (${v.embarque.embarcacao.nome}, ${formatar(existente.dataInicio)} a ${formatar(existente.dataFim)})`
  ).join('; ')
}

// Embarcação/armador/colaborador inexistente estoura FK (P2003) → 400 em vez de 500
function erroFk(err, res) {
  if (err.code !== 'P2003') throw err
  return res.status(400).json({ erro: 'Embarcação, armador ou colaborador não encontrado' })
}

// ─── Listar embarques (paginado, filtros opcionais) ────────────────────────────
// de/ate (AAAA-MM-DD): embarques que tocam o período; colaboradorId: só os dele
router.get('/', autenticar, async (req, res) => {
  const { colaboradorId, de, ate, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const where = {}
  if (Number(colaboradorId)) where.colaboradores = { some: { colaboradorId: Number(colaboradorId) } }
  if (lerData(de)) where.dataFim = { gte: lerData(de) }
  if (lerData(ate)) where.dataInicio = { lte: lerData(ate) }

  const [embarques, total] = await Promise.all([
    prisma.embarque.findMany({
      where,
      include: INCLUDE_PADRAO,
      orderBy: { dataInicio: 'desc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.embarque.count({ where })
  ])

  res.json({ embarques, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Folgas e dobras por colaborador num período ───────────────────────────────
// Base da futura folha de pagamento. O cálculo usa o histórico inteiro de cada
// colaborador (folga de um embarque anterior ao período pode cair dentro dele),
// e só o resultado é recortado em de/ate.
router.get('/resumo', autenticar, async (req, res) => {
  const de = lerData(req.query.de)
  const ate = lerData(req.query.ate)
  if (!de || !ate) return res.status(400).json({ erro: 'Informe o período (de e ate, AAAA-MM-DD)' })
  if (ate < de) return res.status(400).json({ erro: 'Período inválido' })

  const colaboradorId = Number(req.query.colaboradorId)
  const grupos = await embarquesPorColaborador(colaboradorId ? [colaboradorId] : null)
  const deChave = chaveDia(de)
  const ateChave = chaveDia(ate)

  const resumo = []
  for (const { colaborador, embarques } of grupos.values()) {
    const porId = new Map(embarques.map(e => [e.id, e]))
    const dias = [...calcularDiasColaborador(embarques).entries()]
      .filter(([data]) => data >= deChave && data <= ateChave)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, info]) => {
        const embarque = porId.get(info.tipo === 'embarcado' ? info.embarqueId : info.folgaDeEmbarqueId)
        return { data, ...info, embarcacao: embarque?.embarcacao?.nome || null }
      })

    if (dias.length === 0) continue
    resumo.push({
      colaborador,
      diasEmbarcados: dias.filter(d => d.tipo === 'embarcado').length,
      dobras: dias.filter(d => d.dobra).length,
      folgas: dias.filter(d => d.tipo === 'folga').length,
      dias
    })
  }

  resumo.sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome))
  res.json(resumo)
})

// ─── Buscar um embarque pelo ID ────────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const embarque = await prisma.embarque.findUnique({ where: { id: Number(req.params.id) }, include: INCLUDE_PADRAO })
  if (!embarque) return res.status(404).json({ erro: 'Embarque não encontrado' })
  res.json(embarque)
})

// ─── Criar embarque ────────────────────────────────────────────────────────────
router.post('/', autenticar, exigirPermissao('embarques'), async (req, res) => {
  const { dados, colaboradores, erro } = lerCorpo(req.body)
  if (erro) return res.status(400).json({ erro })

  const conflito = await verificarConflitos(colaboradores, dados)
  if (conflito) return res.status(400).json({ erro: conflito })

  try {
    const embarque = await prisma.embarque.create({
      data: {
        ...dados,
        criadoPorId: req.usuario.id,
        colaboradores: { create: colaboradores }
      },
      include: INCLUDE_PADRAO
    })
    res.json({ ...embarque, dobras: await dobrasDoEmbarque(embarque) })
  } catch (err) {
    return erroFk(err, res)
  }
})

// ─── Editar embarque ───────────────────────────────────────────────────────────
// Troca a lista de colaboradores inteira (apaga os vínculos e recria)
router.put('/:id', autenticar, exigirPermissao('embarques'), async (req, res) => {
  const id = Number(req.params.id)
  const atual = await prisma.embarque.findUnique({ where: { id } })
  if (!atual) return res.status(404).json({ erro: 'Embarque não encontrado' })

  const { dados, colaboradores, erro } = lerCorpo(req.body)
  if (erro) return res.status(400).json({ erro })

  const conflito = await verificarConflitos(colaboradores, dados, id)
  if (conflito) return res.status(400).json({ erro: conflito })

  try {
    const embarque = await prisma.$transaction(async (tx) => {
      await tx.embarqueColaborador.deleteMany({ where: { embarqueId: id } })
      return tx.embarque.update({
        where: { id },
        data: { ...dados, colaboradores: { create: colaboradores } },
        include: INCLUDE_PADRAO
      })
    })
    res.json({ ...embarque, dobras: await dobrasDoEmbarque(embarque) })
  } catch (err) {
    return erroFk(err, res)
  }
})

// ─── Excluir embarque ──────────────────────────────────────────────────────────
// Vínculos com colaboradores caem junto (onDelete: Cascade); folgas/dobras se
// recalculam sozinhas por não serem gravadas.
router.delete('/:id', autenticar, exigirPermissao('embarques'), async (req, res) => {
  const id = Number(req.params.id)
  const atual = await prisma.embarque.findUnique({ where: { id } })
  if (!atual) return res.status(404).json({ erro: 'Embarque não encontrado' })

  await prisma.embarque.delete({ where: { id } })
  res.json({ ok: true })
})

export { calcularDiasColaborador, embarquesPorColaborador, chaveDia, somarDias }
export default router

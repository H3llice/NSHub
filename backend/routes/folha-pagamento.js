import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { calcularDiasColaborador, embarquesPorColaborador, chaveDia } from './embarques.js'
import { FUNCOES_TECNICO } from './colaboradores.js'
import { htmlFolhaPagamento, nomeMesFolha, GRUPOS_FOLHA } from '../templates/folha-pagamento.js'
import { gerarPdf } from '../pdf-browser.js'

const router = Router()

// Folha tem valores pagos a cada colaborador — admin, gerente e financeiro
const PERFIS_FOLHA = ['admin', 'gerente', 'financeiro']

// Tópico da folha: técnicos N1/N2/N3 → tecnicos, estagiário → estagiarios, resto → base
const grupoDaFuncao = funcao => (FUNCOES_TECNICO.includes(funcao) ? 'tecnicos' : funcao === 'estagiario' ? 'estagiarios' : 'base')

// Campos em R$ digitados na tela (descontoPlanoSaude e comissao vêm
// preenchidos pela geração, mas também são editáveis)
const CAMPOS_VALOR = ['descontoPlanoSaude', 'coparticipacaoPlanoSaude', 'auxilioMoradia', 'ajudaCusto', 'premio', 'comissao']

const INCLUDE_ITENS = { itens: { orderBy: [{ grupo: 'asc' }, { nome: 'asc' }] } }

// Mês da folha em UTC: [primeiro dia, primeiro dia do mês seguinte). Datas de
// venda/embarque são gravadas como meia-noite UTC do dia escolhido.
function periodoDoMes(mes, ano) {
  return { inicio: new Date(Date.UTC(ano, mes - 1, 1)), fimExclusivo: new Date(Date.UTC(ano, mes, 1)) }
}

const formatarDiaMes = chave => `${chave.slice(8, 10)}/${chave.slice(5, 7)}`

// Dias embarcados de um colaborador no mês → { embarques (texto), diasEmbarcados, diasDobra }.
// Dias seguidos do mesmo embarque viram um período "10/09 a 12/09 (NAVIO)".
function resumoEmbarquesDoMes(embarques, inicioChave, fimChave) {
  const nomes = new Map(embarques.map(e => [e.id, e.embarcacao?.nome || '']))
  const diasMes = [...calcularDiasColaborador(embarques).entries()]
    .filter(([data, info]) => info.tipo === 'embarcado' && data >= inicioChave && data <= fimChave)
    .sort(([a], [b]) => a.localeCompare(b))

  const periodos = []
  for (const [data, info] of diasMes) {
    const ultimo = periodos[periodos.length - 1]
    if (ultimo && ultimo.embarqueId === info.embarqueId) ultimo.fim = data
    else periodos.push({ embarqueId: info.embarqueId, inicio: data, fim: data })
  }

  return {
    embarques: periodos.map(p => `${formatarDiaMes(p.inicio)}${p.fim !== p.inicio ? ` a ${formatarDiaMes(p.fim)}` : ''} (${nomes.get(p.embarqueId)})`).join('; ') || null,
    diasEmbarcados: diasMes.length,
    diasDobra: diasMes.filter(([, info]) => info.dobra).length
  }
}

// Soma das comissões do mês por usuário vendedor (Venda de balsa + Venda de
// orçamento/avulsa, só as ativas). O vendedor é um Usuario; o colaborador chega
// nele pelo vínculo colaborador.usuarioId.
async function comissoesDoMes(mes, ano) {
  const { inicio, fimExclusivo } = periodoDoMes(mes, ano)
  const where = { status: 'ativo', vendedorId: { not: null }, comissao: { not: null }, dataVenda: { gte: inicio, lt: fimExclusivo } }
  const [balsas, outras] = await Promise.all([
    prisma.venda.groupBy({ by: ['vendedorId'], where, _sum: { comissao: true } }),
    prisma.vendaOrcamento.groupBy({ by: ['vendedorId'], where, _sum: { comissao: true } })
  ])

  const porUsuario = new Map()
  for (const g of [...balsas, ...outras]) {
    porUsuario.set(g.vendedorId, Math.round(((porUsuario.get(g.vendedorId) || 0) + (g._sum.comissao || 0)) * 100) / 100)
  }
  return porUsuario
}

// Dados que a folha puxa sozinha, por colaborador: Map colaboradorId → campos do item
async function dadosAutomaticos(colaboradores, mes, ano) {
  const { inicio, fimExclusivo } = periodoDoMes(mes, ano)
  const inicioChave = chaveDia(inicio)
  const fimChave = chaveDia(fimExclusivo.getTime() - 1)

  const [grupos, comissoes] = await Promise.all([
    embarquesPorColaborador(colaboradores.map(c => c.id)),
    comissoesDoMes(mes, ano)
  ])

  const dados = new Map()
  for (const c of colaboradores) {
    const embarques = grupos.get(c.id)?.embarques || []
    dados.set(c.id, {
      nome: c.nome,
      funcao: c.funcao,
      tipoContrato: c.tipoContrato,
      grupo: grupoDaFuncao(c.funcao),
      ...resumoEmbarquesDoMes(embarques, inicioChave, fimChave),
      valeTransporte: c.descontoValeTransporte,
      auxilioMoradia: c.auxilioMoradia ? c.valorAuxilioMoradia : null,
      descontoPlanoSaude: c.descontoPlanoSaude ?? null,
      comissao: c.usuarioId ? (comissoes.get(c.usuarioId) ?? null) : null
    })
  }
  return dados
}

// Dias trabalhados que a folha sugere sozinha: pro intermitente, os dias
// embarcados no mês (null se não embarcou ou se não é intermitente — o campo fica
// vazio pra digitar). É só o ponto de partida: o valor é editável na tela.
const diasTrabalhadosSugeridos = dados => (dados.tipoContrato === 'intermitente' && dados.diasEmbarcados > 0 ? dados.diasEmbarcados : null)

// "" / null → null; senão número (aceita "1234,56"). Retorna undefined se inválido.
function lerValor(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? undefined : Math.round(n * 100) / 100
}

// Campos de contagem de dias digitados na tela (diasTrabalhados só existe na
// tela pro intermitente; os outros dois, pra todos)
const CAMPOS_DIAS = { diasTrabalhados: 'Dias trabalhados', atestados: 'Atestados', faltasNaoJustificadas: 'Faltas não justificadas' }

// Contagem de dias: "" / null → null; senão inteiro de 0 a 31. undefined se inválido.
function lerDias(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 31 ? n : undefined
}

async function buscarFolhaAberta(id, res) {
  const folha = await prisma.folhaPagamento.findUnique({ where: { id } })
  if (!folha) { res.status(404).json({ erro: 'Folha não encontrada' }); return null }
  if (folha.status !== 'aberta') { res.status(400).json({ erro: 'Folha fechada — reabra pra alterar' }); return null }
  return folha
}

// ─── Listar folhas ─────────────────────────────────────────────────────────────
router.get('/', autenticar, exigirPerfil(...PERFIS_FOLHA), async (req, res) => {
  const folhas = await prisma.folhaPagamento.findMany({
    include: { _count: { select: { itens: true } }, criadoPor: { select: { nome: true } } },
    orderBy: [{ ano: 'desc' }, { mes: 'desc' }]
  })
  res.json(folhas)
})

// ─── Buscar uma folha ──────────────────────────────────────────────────────────
router.get('/:id', autenticar, exigirPerfil(...PERFIS_FOLHA), async (req, res) => {
  const folha = await prisma.folhaPagamento.findUnique({ where: { id: Number(req.params.id) }, include: INCLUDE_ITENS })
  if (!folha) return res.status(404).json({ erro: 'Folha não encontrada' })
  res.json(folha)
})

// ─── PDF da folha (link em nova aba, token via ?token=) ────────────────────────
// Sem filtro sai a folha inteira. ?grupo=base|tecnicos|estagiarios imprime só
// essa seção (o filtro da tela da folha) e ?itens=1,2,3 (ids de ItemFolhaPagamento)
// só os colaboradores marcados na tela. Os dois podem vir juntos.
router.get('/:id/pdf', autenticar, exigirPerfil(...PERFIS_FOLHA), async (req, res) => {
  const folha = await prisma.folhaPagamento.findUnique({ where: { id: Number(req.params.id) }, include: INCLUDE_ITENS })
  if (!folha) return res.status(404).json({ erro: 'Folha não encontrada' })

  const grupo = req.query.grupo ? GRUPOS_FOLHA.find(g => g.id === req.query.grupo) : null
  if (req.query.grupo && !grupo) {
    return res.status(400).json({ erro: `Grupo inválido. Use: ${GRUPOS_FOLHA.map(g => g.id).join(', ')}` })
  }
  if (grupo) folha.itens = folha.itens.filter(i => i.grupo === grupo.id)

  const selecionados = String(req.query.itens || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0)
  if (selecionados.length > 0) folha.itens = folha.itens.filter(i => selecionados.includes(i.id))

  const selecao = selecionados.length > 0
    ? `${folha.itens.length} ${folha.itens.length === 1 ? 'colaborador selecionado' : 'colaboradores selecionados'}`
    : null
  const filtro = [grupo?.titulo, selecao].filter(Boolean).join(' — ') || null

  // preferCSSPageSize: o template pede A4 deitado no @page
  const pdfBytes = await gerarPdf(htmlFolhaPagamento(folha, filtro), { preferCSSPageSize: true })

  const nomeArquivo = `Folha de pagamento ${nomeMesFolha(folha).replace('/', '-')}${filtro ? ' - ' + filtro : ''}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

// ─── Gerar folha do mês ────────────────────────────────────────────────────────
// Um item por colaborador ATIVO, já com embarques/dobras, desconto do plano de
// saúde e comissões do mês preenchidos.
router.post('/', autenticar, exigirPerfil(...PERFIS_FOLHA), async (req, res) => {
  const mes = parseInt(req.body.mes)
  const ano = parseInt(req.body.ano)
  if (!(mes >= 1 && mes <= 12) || !(ano >= 2000 && ano <= 2100)) {
    return res.status(400).json({ erro: 'Mês/ano inválido' })
  }

  const existente = await prisma.folhaPagamento.findUnique({ where: { ano_mes: { ano, mes } } })
  if (existente) return res.status(400).json({ erro: 'Já existe folha desse mês', id: existente.id })

  const colaboradores = await prisma.colaborador.findMany({ where: { ativo: true } })
  const dados = await dadosAutomaticos(colaboradores, mes, ano)

  const folha = await prisma.folhaPagamento.create({
    data: {
      mes,
      ano,
      criadoPorId: req.usuario.id,
      itens: {
        create: colaboradores.map(c => ({
          colaboradorId: c.id,
          ...dados.get(c.id),
          diasTrabalhados: diasTrabalhadosSugeridos(dados.get(c.id))
        }))
      }
    },
    include: INCLUDE_ITENS
  })
  res.json(folha)
})

// ─── Atualizar dados automáticos (folha aberta) ────────────────────────────────
// Refaz embarques/dias/dobras, desconto do plano de saúde e comissão a partir
// dos cadastros atuais, e inclui colaboradores ativados depois da geração.
// Coparticipação, ajuda de custo, prêmio e observações NÃO são tocados.
// Dias trabalhados (intermitente) acompanha os embarques só enquanto ninguém
// mexeu nele: se ainda é igual aos dias embarcados de antes (ou está vazio),
// passa a ser os de agora; se foi editado à mão, fica como está.
router.post('/:id/atualizar', autenticar, exigirPerfil(...PERFIS_FOLHA), async (req, res) => {
  const folha = await buscarFolhaAberta(Number(req.params.id), res)
  if (!folha) return

  const itensAtuais = await prisma.itemFolhaPagamento.findMany({
    where: { folhaId: folha.id },
    select: { colaboradorId: true, diasTrabalhados: true, diasEmbarcados: true }
  })
  const itemAtual = new Map(itensAtuais.map(i => [i.colaboradorId, i]))
  const colaboradores = await prisma.colaborador.findMany({
    where: { OR: [{ ativo: true }, { id: { in: itensAtuais.map(i => i.colaboradorId) } }] }
  })
  const dados = await dadosAutomaticos(colaboradores, folha.mes, folha.ano)

  await prisma.$transaction(colaboradores.map(c => {
    const novo = dados.get(c.id)
    const sugerido = diasTrabalhadosSugeridos(novo)
    const antes = itemAtual.get(c.id)
    const naoEditado = antes && (antes.diasTrabalhados === null || antes.diasTrabalhados === antes.diasEmbarcados)

    return prisma.itemFolhaPagamento.upsert({
      where: { folhaId_colaboradorId: { folhaId: folha.id, colaboradorId: c.id } },
      update: { ...novo, ...(naoEditado && novo.tipoContrato === 'intermitente' ? { diasTrabalhados: sugerido } : {}) },
      create: { folhaId: folha.id, colaboradorId: c.id, ...novo, diasTrabalhados: sugerido }
    })
  }))

  res.json(await prisma.folhaPagamento.findUnique({ where: { id: folha.id }, include: INCLUDE_ITENS }))
})

// ─── Salvar valores digitados (folha aberta) ───────────────────────────────────
// body.itens: [{ id, diasTrabalhados, atestados, faltasNaoJustificadas, descontoPlanoSaude, coparticipacaoPlanoSaude, ajudaCusto, premio, comissao, observacoes }]
router.put('/:id/itens', autenticar, exigirPerfil(...PERFIS_FOLHA), async (req, res) => {
  const folha = await buscarFolhaAberta(Number(req.params.id), res)
  if (!folha) return

  const itens = Array.isArray(req.body.itens) ? req.body.itens : []
  const atualizacoes = []
  for (const item of itens) {
    const data = { observacoes: (item.observacoes || '').trim() || null }
    // Só grava o que veio na requisição — diasTrabalhados, por exemplo, só vem
    // pra quem é intermitente (é quem tem o campo na tela)
    for (const [campo, titulo] of Object.entries(CAMPOS_DIAS)) {
      if (item[campo] === undefined) continue
      const dias = lerDias(item[campo])
      if (dias === undefined) return res.status(400).json({ erro: `${titulo} inválido (use um número inteiro de 0 a 31)` })
      data[campo] = dias
    }
    for (const campo of CAMPOS_VALOR) {
      const valor = lerValor(item[campo])
      if (valor === undefined) return res.status(400).json({ erro: `Valor inválido em ${campo}` })
      data[campo] = valor
    }
    // where com folhaId: item de outra folha não é alterado por engano
    atualizacoes.push(prisma.itemFolhaPagamento.updateMany({ where: { id: Number(item.id), folhaId: folha.id }, data }))
  }

  await prisma.$transaction(atualizacoes)
  res.json(await prisma.folhaPagamento.findUnique({ where: { id: folha.id }, include: INCLUDE_ITENS }))
})

// ─── Fechar / reabrir ──────────────────────────────────────────────────────────
router.post('/:id/fechar', autenticar, exigirPerfil(...PERFIS_FOLHA), async (req, res) => {
  const folha = await buscarFolhaAberta(Number(req.params.id), res)
  if (!folha) return
  res.json(await prisma.folhaPagamento.update({ where: { id: folha.id }, data: { status: 'fechada', fechadaEm: new Date() }, include: INCLUDE_ITENS }))
})

// Reabrir é exceção (corrigir algo depois de fechar) — só admin
router.post('/:id/reabrir', autenticar, exigirPerfil('admin'), async (req, res) => {
  const id = Number(req.params.id)
  const folha = await prisma.folhaPagamento.findUnique({ where: { id } })
  if (!folha) return res.status(404).json({ erro: 'Folha não encontrada' })
  res.json(await prisma.folhaPagamento.update({ where: { id }, data: { status: 'aberta', fechadaEm: null }, include: INCLUDE_ITENS }))
})

// ─── Excluir (só aberta) ───────────────────────────────────────────────────────
router.delete('/:id', autenticar, exigirPerfil(...PERFIS_FOLHA), async (req, res) => {
  const folha = await buscarFolhaAberta(Number(req.params.id), res)
  if (!folha) return
  await prisma.folhaPagamento.delete({ where: { id: folha.id } })
  res.json({ ok: true })
})

export default router

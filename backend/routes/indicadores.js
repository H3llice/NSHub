import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil, temPerfil } from '../middleware/auth.js'

const router = Router()

// ═══════════════════════════════ INDICADORES ═══════════════════════════════
// Painel de indicadores (KPIs) mês a mês, calculado direto do banco — feito pra
// substituir o Power BI que a consultoria ia montar por fora. Cada indicador é
// uma entrada do catálogo INDICADORES abaixo; a tela (js/modules/indicadores.js)
// só desenha o que vier daqui, então indicador novo = entrada nova no catálogo,
// sem mexer no frontend.
//
// Formato de cada entrada:
//   id        identificador fixo (vai pra URL / favoritos no futuro)
//   area      agrupamento na tela
//   titulo    nome curto
//   formula   texto que aparece na tela explicando a conta (o consultor precisa
//             conseguir conferir de onde sai o número)
//   unidade   'percentual' | 'moeda' | 'numero'
//   melhor    'maior' | 'menor' — pra tela pintar a variação de verde/vermelho
//   perfis    quem pode ver (mesma regra das rotas de leitura de cada área —
//             indicador não pode virar porta dos fundos pra dado financeiro)
//   calcular  async (meses) => array de valores (number | null), um por mês, na
//             mesma ordem de `meses`. null = sem base pra calcular (ex.: divisão por zero)
//
// Meses contados em UTC, igual aos jobs do server.js: as datas "só dia" do banco
// (vencimento, início de contrato) são gravadas como meia-noite UTC, e puxar pro
// fuso local jogaria o dia 1º pro mês anterior.

const PERFIS_FINANCEIRO = ['admin', 'gerente', 'financeiro']
const PERFIS_COMERCIAL = ['admin', 'gerente', 'vendedor', 'financeiro']
// Quem enxerga a tela (união dos perfis do catálogo). O filtro fino é por indicador.
const PERFIS_TELA = ['admin', 'gerente', 'vendedor', 'financeiro']

const MAX_MESES = 36

// ─── Helpers de período ──────────────────────────────────────────────────────

// 'YYYY-MM' → { ano, mes } ou null
function lerMes(texto) {
  const m = /^(\d{4})-(\d{2})$/.exec(texto || '')
  if (!m) return null
  const ano = Number(m[1]), mes = Number(m[2])
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null
  return { ano, mes }
}

const chaveDe = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`
const chaveMes = data => chaveDe(data.getUTCFullYear(), data.getUTCMonth() + 1)

// Lista de meses do período: [{ chave, inicio, fim, referencia }]
//   inicio/fim = [1º dia 00:00 UTC, 1º dia do mês seguinte) — fim exclusivo
//   referencia = instante da "foto" dos indicadores de estoque/saldo: fim do mês,
//                ou agora se o mês ainda não acabou
function mesesDoPeriodo({ ano: anoDe, mes: mesDe }, { ano: anoAte, mes: mesAte }) {
  const agora = new Date()
  const meses = []
  let ano = anoDe, mes = mesDe
  while (ano < anoAte || (ano === anoAte && mes <= mesAte)) {
    const inicio = new Date(Date.UTC(ano, mes - 1, 1))
    const fim = new Date(Date.UTC(ano, mes, 1))
    meses.push({ chave: chaveDe(ano, mes), inicio, fim, referencia: fim > agora ? agora : new Date(fim.getTime() - 1) })
    if (++mes > 12) { mes = 1; ano++ }
  }
  return meses
}

// Soma `valor(linha)` por mês de `data(linha)` — devolve um array alinhado com `meses`
function somarPorMes(meses, linhas, data, valor = () => 1) {
  const porChave = new Map(meses.map(m => [m.chave, 0]))
  for (const linha of linhas) {
    const d = data(linha)
    if (!d) continue
    const chave = chaveMes(d)
    if (porChave.has(chave)) porChave.set(chave, porChave.get(chave) + (valor(linha) || 0))
  }
  return meses.map(m => porChave.get(m.chave))
}

const percentual = (parte, total) => (total > 0 ? (parte / total) * 100 : null)

// ─── Catálogo ────────────────────────────────────────────────────────────────

const INDICADORES = [
  {
    id: 'ocupacao-frota',
    area: 'Locação de balsas',
    titulo: 'Taxa de ocupação da frota',
    formula: 'Balsas de locação que estavam em contrato no último dia do mês ÷ balsas de locação cadastradas hoje.',
    unidade: 'percentual',
    melhor: 'maior',
    perfis: PERFIS_COMERCIAL,
    async calcular(meses) {
      // Frota = cadastro atual (não há histórico de quando a balsa entrou/saiu da
      // frota de locação — criadoEm é a data da digitação, e as migradas ficariam
      // fora dos meses antigos). Aproximação aceitável enquanto a frota for estável.
      const frota = await prisma.balsa.findMany({
        where: { finalidade: 'locacao', status: { not: 'vendido' } },
        select: { id: true }
      })
      const idsFrota = new Set(frota.map(b => b.id))
      if (idsFrota.size === 0) return meses.map(() => null)

      // Passagens que ainda estavam abertas em algum ponto do período
      const passagens = await prisma.contratoBalsa.findMany({
        where: {
          balsaId: { in: [...idsFrota] },
          OR: [{ devolvidaEm: null }, { devolvidaEm: { gte: meses[0].inicio } }]
        },
        select: { balsaId: true, aditivo: true, criadoEm: true, devolvidaEm: true, contrato: { select: { dataInicio: true } } }
      })

      return meses.map(({ referencia }) => {
        const locadas = new Set()
        for (const p of passagens) {
          // Balsa do contrato original entra na data de início; a de aditivo, quando foi incluída
          const entrada = p.aditivo ? p.criadoEm : p.contrato.dataInicio
          if (entrada <= referencia && (!p.devolvidaEm || p.devolvidaEm > referencia)) locadas.add(p.balsaId)
        }
        return percentual(locadas.size, idsFrota.size)
      })
    }
  },
  {
    id: 'receita-recebida',
    area: 'Financeiro',
    titulo: 'Receita recebida',
    formula: 'Soma das contas a receber marcadas como pagas, pela data do pagamento.',
    unidade: 'moeda',
    melhor: 'maior',
    perfis: PERFIS_FINANCEIRO,
    async calcular(meses) {
      const pagos = await prisma.pagamento.findMany({
        where: { status: 'pago', dataPagamento: { gte: meses[0].inicio, lt: meses.at(-1).fim } },
        select: { valor: true, dataPagamento: true }
      })
      return somarPorMes(meses, pagos, p => p.dataPagamento, p => p.valor)
    }
  },
  {
    id: 'inadimplencia',
    area: 'Financeiro',
    titulo: 'Taxa de inadimplência',
    formula: 'Valor que venceu no mês e não estava pago no último dia do mês ÷ valor total que venceu no mês. No mês corrente, só o que já venceu até hoje.',
    unidade: 'percentual',
    melhor: 'menor',
    perfis: PERFIS_FINANCEIRO,
    async calcular(meses) {
      const contas = await prisma.pagamento.findMany({
        where: { dataVencimento: { gte: meses[0].inicio, lt: meses.at(-1).fim } },
        select: { valor: true, dataVencimento: true, dataPagamento: true, status: true }
      })
      return meses.map(({ inicio, fim, referencia }) => {
        let vencido = 0, emAberto = 0
        for (const c of contas) {
          if (c.dataVencimento < inicio || c.dataVencimento >= fim || c.dataVencimento > referencia) continue
          vencido += c.valor
          // Pago sem data (dado antigo/migrado) conta como pago em dia
          const pagoAteReferencia = c.status === 'pago' && (!c.dataPagamento || c.dataPagamento <= referencia)
          if (!pagoAteReferencia) emAberto += c.valor
        }
        return percentual(emAberto, vencido)
      })
    }
  },
  {
    id: 'gasto-compras',
    area: 'Compras',
    titulo: 'Gasto com compras',
    formula: 'Soma do valor das Ordens de Compra aprovadas, pela data do pedido.',
    unidade: 'moeda',
    melhor: 'menor',
    perfis: PERFIS_FINANCEIRO,
    async calcular(meses) {
      const ocs = await prisma.ordemCompra.findMany({
        where: { status: 'aprovada', dataPedido: { gte: meses[0].inicio, lt: meses.at(-1).fim } },
        select: { valorTotal: true, dataPedido: true }
      })
      return somarPorMes(meses, ocs, o => o.dataPedido, o => o.valorTotal)
    }
  },
  {
    id: 'conversao-orcamentos',
    area: 'Comercial',
    titulo: 'Taxa de conversão de orçamentos',
    formula: 'Orçamentos do mês aprovados ou convertidos em venda ÷ orçamentos do mês que já tiveram desfecho (aprovado, convertido, recusado ou expirado). Os ainda em andamento ficam fora da conta.',
    unidade: 'percentual',
    melhor: 'maior',
    perfis: PERFIS_COMERCIAL,
    async calcular(meses) {
      const orcamentos = await prisma.orcamento.findMany({
        where: { dataOrcamento: { gte: meses[0].inicio, lt: meses.at(-1).fim }, status: { not: 'em_andamento' } },
        select: { status: true, dataOrcamento: true }
      })
      const ganhos = somarPorMes(meses, orcamentos.filter(o => ['aprovado', 'convertido'].includes(o.status)), o => o.dataOrcamento)
      const decididos = somarPorMes(meses, orcamentos, o => o.dataOrcamento)
      return meses.map((_, i) => percentual(ganhos[i], decididos[i]))
    }
  },
  {
    id: 'ordens-servico',
    area: 'Serviços técnicos',
    titulo: 'Ordens de serviço emitidas',
    formula: 'Quantidade de OS emitidas no mês (data de emissão).',
    unidade: 'numero',
    melhor: 'maior',
    perfis: PERFIS_COMERCIAL,
    async calcular(meses) {
      const oss = await prisma.ordemServico.findMany({
        where: { dataEmissao: { gte: meses[0].inicio, lt: meses.at(-1).fim } },
        select: { dataEmissao: true }
      })
      return somarPorMes(meses, oss, o => o.dataEmissao)
    }
  }
]

// Remove a função de cálculo — o que vai pro frontend é só a descrição
const descricao = ({ calcular, perfis, ...resto }) => resto

// ─── GET /indicadores?de=YYYY-MM&ate=YYYY-MM[&ids=a,b] ───────────────────────
// Sem período = últimos 12 meses (incluindo o atual). Devolve só os indicadores
// que o perfil logado pode ver.
router.get('/', autenticar, exigirPerfil(...PERFIS_TELA), async (req, res) => {
  const hoje = new Date()
  const ate = lerMes(req.query.ate) || { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 }
  let de = lerMes(req.query.de)
  if (!de) {
    const d = new Date(Date.UTC(ate.ano, ate.mes - 12, 1))
    de = { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
  }

  const meses = mesesDoPeriodo(de, ate)
  if (meses.length === 0) return res.status(400).json({ erro: 'Período inválido: o início é depois do fim' })
  if (meses.length > MAX_MESES) return res.status(400).json({ erro: `Período máximo é de ${MAX_MESES} meses` })

  const pedidos = req.query.ids ? String(req.query.ids).split(',') : null
  const visiveis = INDICADORES.filter(i => temPerfil(req.usuario.perfil, i.perfis) && (!pedidos || pedidos.includes(i.id)))

  // Um indicador com erro não derruba a tela inteira — volta com `erro` e os outros seguem
  const resultados = await Promise.all(visiveis.map(async ind => {
    try {
      const valores = await ind.calcular(meses)
      return { ...descricao(ind), valores }
    } catch (err) {
      console.error(`Erro ao calcular indicador ${ind.id}:`, err)
      return { ...descricao(ind), valores: meses.map(() => null), erro: 'Não foi possível calcular' }
    }
  }))

  res.json({ meses: meses.map(m => m.chave), indicadores: resultados })
})

export default router

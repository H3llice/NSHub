import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import ocsRouter from './routes/ocs.js'
import solicitacoesRouter from './routes/solicitacoes.js'
import empresasRouter from './routes/empresas.js'
import fornecedoresRouter from './routes/fornecedores.js'
import anexosRouter from './routes/anexos.js'
import pdfRouter from './routes/pdf.js'
import authRouter from './routes/auth.js'
import { autenticar } from './middleware/auth.js'
import webhookRouter from './routes/webhook.js'
import estoqueRouter from './routes/estoque.js'
import clientesRouter from './routes/clientes.js'
import embarcacoesRouter from './routes/embarcacoes.js'
import relatoriosRouter from './routes/relatorios.js'
import certificadosRouter from './routes/certificados.js'
import ordensServicoRouter from './routes/ordens-servico.js'
import contratosRouter from './routes/contratos.js'
import vendasRouter from './routes/vendas.js'
import orcamentosRouter from './routes/orcamentos.js'
import vendasOrcamentoRouter from './routes/vendas-orcamento.js'
import pagamentosRouter from './routes/pagamentos.js'
import contasPagarRouter from './routes/contas-pagar.js'
import almoxarifadoRouter from './routes/almoxarifado.js'
import servicosRouter from './routes/servicos.js'
import colaboradoresRouter, { converterFuncoesAntigas } from './routes/colaboradores.js'
import embarquesRouter from './routes/embarques.js'
import folhaPagamentoRouter from './routes/folha-pagamento.js'
import auditoriaRouter from './routes/auditoria.js'
import { auditoria } from './middleware/auditoria.js'
import { extensaoDinheiro } from './dinheiro.js'
import { notificarPagamentoAtrasado, notificarVencimentoContrato } from './email.js'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
// extensaoDinheiro arredonda valores em R$ antes de gravar — ver dinheiro.js
const prisma = new PrismaClient().$extends(extensaoDinheiro)

// ─── CORS ──────────────────────────────────────────────────────────────────────
// O frontend é servido pelo próprio Express (mesma origem do BASE_URL), então
// nenhum site de terceiro precisa acessar a API — só libera a origem de produção
// e localhost/127.0.0.1 em qualquer porta, pra não travar dev local (ex.: Live Server).
const origemProducao = process.env.BASE_URL
const origemLocalRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

app.use(cors({
  origin(origin, callback) {
    // Sem header Origin = requisição same-origin, server-to-server ou via curl — libera.
    // Origem não permitida: `false` (não `Error`) faz o cors só omitir o header de liberação
    // em vez de derrubar a request com exceção — sem handler de erro global ainda, um
    // Error aqui vazaria stack trace com caminho do servidor pra quem tentasse.
    if (!origin) return callback(null, true)
    const permitida = origin === origemProducao || origemLocalRegex.test(origin)
    callback(null, permitida)
  }
}))

// ─── Webhook do GitHub ──────────────────────────────────────────────────────────
// Precisa vir ANTES do express.json() global, porque o webhook usa seu próprio
// middleware de raw body (necessário para validar a assinatura HMAC do GitHub)
app.use('/webhook', webhookRouter)

app.use(express.json())

// Trilha de auditoria — antes das rotas, pra cobrir todas (ver middleware/auditoria.js)
app.use(auditoria)

// ─── Serve o frontend (html, css, js) a partir do backend ────────────────────
const raizProjeto = path.resolve(__dirname, '..')

app.use('/html', express.static(path.join(raizProjeto, 'html')))
app.use('/css', express.static(path.join(raizProjeto, 'css')))
app.use('/js', express.static(path.join(raizProjeto, 'js')))
app.use('/img', express.static(path.join(raizProjeto, 'img')))

app.get('/', (req, res) => {
  res.redirect('/html/login.html')
})

// ─── Rotas da API ──────────────────────────────────────────────────────────────
app.use('/auth', authRouter)
app.use('/empresas', empresasRouter)
app.use('/fornecedores', fornecedoresRouter)
app.use('/anexos', anexosRouter)
// Anexos de OC são servidos na mesma origem do app (e o token fica no localStorage),
// então só PDF/imagem abrem no navegador; qualquer outra coisa — inclusive arquivo
// antigo enviado antes do filtro de tipos em routes/anexos.js — sai como download,
// pra um .html/.svg nunca rodar script com a sessão de quem abriu.
const EXTENSOES_INLINE = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.jfif'])
app.use('/uploads', autenticar, express.static('uploads', {
  setHeaders(res, caminho) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!EXTENSOES_INLINE.has(path.extname(caminho).toLowerCase())) {
      res.setHeader('Content-Disposition', 'attachment')
    }
  }
}))
app.use('/pdf', pdfRouter)
app.use('/ocs', ocsRouter)
app.use('/solicitacoes', solicitacoesRouter)
app.use('/estoque', estoqueRouter)
app.use('/clientes', clientesRouter)
app.use('/embarcacoes', embarcacoesRouter)
app.use('/relatorios', relatoriosRouter)
app.use('/certificados', certificadosRouter)
app.use('/ordens-servico', ordensServicoRouter)
app.use('/contratos', contratosRouter)
app.use('/vendas', vendasRouter)
app.use('/orcamentos', orcamentosRouter)
app.use('/vendas-orcamento', vendasOrcamentoRouter)
app.use('/pagamentos', pagamentosRouter)
app.use('/contas-pagar', contasPagarRouter)
app.use('/almoxarifado', almoxarifadoRouter)
app.use('/servicos', servicosRouter)
app.use('/colaboradores', colaboradoresRouter)
app.use('/embarques', embarquesRouter)
app.use('/folha-pagamento', folhaPagamentoRouter)
app.use('/auditoria', auditoriaRouter)

app.get('/api', (req, res) => {
  res.json({ mensagem: 'API do Portal NS funcionando!' })
})

// ═══════════════════════════════ JOBS AUTOMÁTICOS ═══════════════════════════════
// Todos são idempotentes (rodar duas vezes no mesmo dia não duplica nada), então
// rodam logo que o servidor sobe e depois a cada 6h — ver agendamento no fim do
// arquivo. Antes era um setInterval de 24h puro: como cada deploy reinicia o
// processo e zera o relógio, com deploy frequente eles nunca chegavam a rodar.

// Deleta OCs canceladas há mais de 30 dias (e os arquivos dos anexos delas)
async function limparOcsCanceladas() {
  const limite = new Date()
  limite.setDate(limite.getDate() - 30)

  const antigas = await prisma.ordemCompra.findMany({
    where: { status: 'cancelada', canceladoEm: { lt: limite } },
    include: { anexos: true }
  })

  for (const oc of antigas) {
    await prisma.itemOC.deleteMany({ where: { ocId: oc.id } })
    await prisma.anexo.deleteMany({ where: { ocId: oc.id } })
    await prisma.ordemCompra.delete({ where: { id: oc.id } })
    // Só depois de apagar do banco — se o delete falhar, o arquivo continua lá
    for (const anexo of oc.anexos) {
      fs.unlink(path.resolve('uploads', anexo.nomeArquivo), () => { })
    }
  }

  if (antigas.length > 0) {
    console.log(`🗑️ ${antigas.length} OCs canceladas deletadas permanentemente`)
  }
}

function inicioDeHoje() {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return hoje
}

// Marca pagamento vencido como atrasado e envia email (só na primeira vez)
async function marcarPagamentosAtrasados() {
  const hoje = inicioDeHoje()

  const vencidos = await prisma.pagamento.findMany({
    where: { status: 'pendente', dataVencimento: { lt: hoje } },
    include: {
      contrato: { include: { cliente: true } },
      venda: { include: { cliente: true } },
      vendaOrcamento: { include: { cliente: true } }
    }
  })

  for (const p of vencidos) {
    await prisma.pagamento.update({
      where: { id: p.id },
      data: { status: 'atrasado' }
    })

    if (!p.alertaEnviado) {
      try {
        await notificarPagamentoAtrasado(p)
        await prisma.pagamento.update({
          where: { id: p.id },
          data: { alertaEnviado: true }
        })
      } catch (err) {
        console.error('⚠️  Falha ao enviar aviso de atraso:', err.message)
      }
    }
  }

  if (vencidos.length > 0) {
    console.log(`⚠️  ${vencidos.length} pagamento(s) marcado(s) como atrasado(s)`)
  }
}

// Gera a próxima parcela dos contratos mensais ativos
async function gerarParcelasMensais() {
  const hoje = inicioDeHoje()

  const contratosMensais = await prisma.contrato.findMany({
    where: { status: 'ativo', periodicidadePagamento: 'mensal' },
    include: { pagamentos: { orderBy: { dataVencimento: 'desc' }, take: 1 } }
  })

  for (const c of contratosMensais) {
    const ultimaParcela = c.pagamentos[0]
    if (!ultimaParcela) continue

    const proximoVencimento = new Date(ultimaParcela.dataVencimento)
    proximoVencimento.setMonth(proximoVencimento.getMonth() + 1)

    // Só cria a próxima parcela quando estiver a 5 dias ou menos do vencimento
    const antecedencia = new Date(proximoVencimento)
    antecedencia.setDate(antecedencia.getDate() - 5)

    if (hoje >= antecedencia) {
      const jaExiste = await prisma.pagamento.findFirst({
        where: { contratoId: c.id, dataVencimento: proximoVencimento.toISOString().split('T')[0] }
      })
      if (jaExiste) continue

      // Frete só entra na 1ª fatura (criada junto com o contrato) — as parcelas
      // seguintes cobram só o valor recorrente (balsas - desconto), sem o frete.
      await prisma.pagamento.create({
        data: {
          contratoId: c.id,
          valor: (c.valor || 0) - (c.frete || 0),
          dataVencimento: proximoVencimento.toISOString(),
          referencia: `${String(proximoVencimento.getMonth() + 1).padStart(2, '0')}/${proximoVencimento.getFullYear()}`
        }
      })
      console.log(`💰 Nova parcela gerada — Contrato ${c.numero}.${c.ano}`)
    }
  }
}

// Avisa por email os contratos de locação perto do fim (7 dias antes) e os já
// vencidos — uma vez cada (flags no Contrato, zeradas quando a dataFim muda).
// NÃO encerra o contrato sozinho: encerrar libera as balsas no estoque, e a balsa
// pode continuar com o cliente (cláusula 4.1, relocação automática) — quem decide
// entre renovar e encerrar é quem recebe o aviso.
const DIAS_AVISO_VENCIMENTO = 7

async function avisarContratosVencendo() {
  const hoje = inicioDeHoje()
  const limite = new Date(hoje)
  limite.setDate(limite.getDate() + DIAS_AVISO_VENCIMENTO)

  const contratos = await prisma.contrato.findMany({
    where: {
      status: 'ativo',
      dataFim: { lte: limite },
      OR: [{ avisoVencimentoEnviado: false }, { avisoVencidoEnviado: false }]
    },
    include: { cliente: true, balsas: { where: { devolvidaEm: null }, include: { balsa: true } } }
  })

  for (const c of contratos) {
    const vencido = new Date(c.dataFim) < hoje
    const flag = vencido ? 'avisoVencidoEnviado' : 'avisoVencimentoEnviado'
    if (c[flag]) continue

    try {
      const enviado = await notificarVencimentoContrato(c, vencido)
      if (enviado) await prisma.contrato.update({ where: { id: c.id }, data: { [flag]: true } })
    } catch (err) {
      console.error('⚠️  Falha ao enviar aviso de vencimento de contrato:', err.message)
    }
  }
}

const JOBS = [limparOcsCanceladas, marcarPagamentosAtrasados, gerarParcelasMensais, avisarContratosVencendo]

// Um job que falha não pode impedir os outros nem derrubar o processo (promise
// rejeitada sem catch dentro de timer encerra o Node)
async function rodarJobs() {
  for (const job of JOBS) {
    try {
      await job()
    } catch (err) {
      console.error(`⚠️  Job ${job.name} falhou:`, err.message)
    }
  }
}


const PORT = 3000
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
  converterFuncoesAntigas().catch(err => console.error('Erro ao converter funções antigas de colaboradores:', err))

  // 1 min depois de subir (deixa o servidor atender primeiro) e depois a cada 6h
  setTimeout(rodarJobs, 60 * 1000)
  setInterval(rodarJobs, 6 * 60 * 60 * 1000)
})

export { prisma }
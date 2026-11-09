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
import controleImcRouter from './routes/controle-imc.js'
import indicadoresRouter from './routes/indicadores.js'
import { auditoria } from './middleware/auditoria.js'
import { tratarErros } from './middleware/erros.js'
import { extensaoDinheiro } from './dinheiro.js'
import { notificarPagamentoAtrasado, notificarVencimentoContrato, notificarProblemaBackup } from './email.js'
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
    // em vez de derrubar a request com exceção.
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
app.use('/controle-imc', controleImcRouter)
app.use('/indicadores', indicadoresRouter)

app.get('/api', (req, res) => {
  res.json({ mensagem: 'API do Portal NS funcionando!' })
})

// Tratamento de erro global — tem que ser o último app.use (ver middleware/erros.js)
app.use(tratarErros)

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

// Vencimento de parcela é data pura (meia-noite UTC, como vem do <input type="date">)
// — toda a conta abaixo é em UTC pra o fuso de Brasília não jogar pro dia anterior.
const DIA_MS = 24 * 60 * 60 * 1000

function hojeDataPura() {
  const agora = new Date()
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()))
}

// `meses` depois de `data`, no dia `dia` do mês — ou no último dia, se o mês for
// mais curto (vence dia 31 → 28/02 → 31/03, sem ir escorregando pro dia 28)
function mesSeguinteNoDia(data, meses, dia) {
  const ano = data.getUTCFullYear()
  const mes = data.getUTCMonth() + meses
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia)))
}

// Gera a próxima parcela dos contratos mensais ativos, 5 dias antes do vencimento.
// Mês que passou sem parcela (contrato antigo, de quando este job não funcionava)
// NÃO é gerado retroativamente: o vencimento pula pro primeiro que ainda não passou.
// Decisão do usuário — cobrança atrasada, se houver, é lançada à mão.
async function gerarParcelasMensais() {
  const hoje = hojeDataPura()

  const contratosMensais = await prisma.contrato.findMany({
    where: { status: 'ativo', periodicidadePagamento: 'mensal' },
    include: { pagamentos: { select: { dataVencimento: true }, orderBy: { dataVencimento: 'asc' } } }
  })

  for (const c of contratosMensais) {
    if (c.pagamentos.length === 0) continue

    // O dia de vencimento é o da 1ª parcela; a contagem segue da última
    const dia = c.pagamentos[0].dataVencimento.getUTCDate()
    const ultima = c.pagamentos[c.pagamentos.length - 1].dataVencimento

    let meses = 1
    let vencimento = mesSeguinteNoDia(ultima, meses, dia)
    while (vencimento < hoje) vencimento = mesSeguinteNoDia(ultima, ++meses, dia)

    if (hoje < new Date(vencimento.getTime() - 5 * DIA_MS)) continue

    // Já tem parcela neste mês (gerada antes ou lançada à mão com outro dia)? Não duplica
    const inicioMes = new Date(Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), 1))
    const inicioMesSeguinte = new Date(Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth() + 1, 1))
    const jaExiste = await prisma.pagamento.findFirst({
      where: { contratoId: c.id, dataVencimento: { gte: inicioMes, lt: inicioMesSeguinte } }
    })
    if (jaExiste) continue

    // Frete só entra na 1ª fatura (criada junto com o contrato) — as parcelas
    // seguintes cobram só o valor recorrente (balsas - desconto), sem o frete.
    await prisma.pagamento.create({
      data: {
        contratoId: c.id,
        valor: (c.valor || 0) - (c.frete || 0),
        dataVencimento: vencimento,
        referencia: `${String(vencimento.getUTCMonth() + 1).padStart(2, '0')}/${vencimento.getUTCFullYear()}`
      }
    })
    console.log(`💰 Nova parcela gerada — Contrato ${c.numero}.${c.ano} (vence ${vencimento.toISOString().slice(0, 10)})`)
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

// Lê o resultado do último backup (gravado por scripts/backup.ps1, tarefa noturna
// do Agendador) e avisa por email se ele falhou em algum destino ou se parou de
// rodar — sem isso, um HD externo desconectado passaria meses sem ninguém notar.
// Só roda onde o backup está configurado (BACKUP_DESTINOS no .env), não em dev.
const PASTA_BACKUPS = path.join(__dirname, 'backups')
const HORAS_BACKUP_ATRASADO = 36

async function verificarBackup() {
  if (!process.env.BACKUP_DESTINOS) return

  let status = null
  try {
    status = JSON.parse(fs.readFileSync(path.join(PASTA_BACKUPS, 'ultimo-backup.json'), 'utf8'))
  } catch { }

  const problemas = []
  if (!status) {
    problemas.push('Nenhum backup registrado ainda — a tarefa NSHubBackup nunca rodou (ver scripts/registrar-backup.ps1).')
  } else {
    const horas = (Date.now() - new Date(status.fim || status.inicio)) / (60 * 60 * 1000)
    if (horas > HORAS_BACKUP_ATRASADO) {
      problemas.push(`O último backup foi há ${Math.floor(horas / 24)} dia(s) — a tarefa agendada pode ter parado ou o PC ficou desligado.`)
    }
    if (status.erroBanco) problemas.push(`Cópia do banco: ${status.erroBanco}`)
    for (const d of status.destinos || []) {
      if (!d.ok) problemas.push(`Destino ${d.caminho}: ${d.erro}`)
    }
  }
  if (problemas.length === 0) return

  // Um email por situação, não um a cada 6h: a chave muda quando roda um backup
  // novo ou quando muda o texto (o "há N dias" muda uma vez por dia)
  const arquivoAviso = path.join(PASTA_BACKUPS, 'aviso-enviado.txt')
  const chave = `${status?.inicio || 'nenhum'}|${problemas.join('|')}`
  let ultimoAviso = null
  try { ultimoAviso = fs.readFileSync(arquivoAviso, 'utf8') } catch { }
  if (ultimoAviso === chave) return

  if (await notificarProblemaBackup(problemas)) {
    fs.mkdirSync(PASTA_BACKUPS, { recursive: true })
    fs.writeFileSync(arquivoAviso, chave)
  }
}

const JOBS = [limparOcsCanceladas, marcarPagamentosAtrasados, gerarParcelasMensais, avisarContratosVencendo, verificarBackup]

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
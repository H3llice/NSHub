import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'mail.natalsafety.com.br',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || 'tec2@natalsafety.com.br',
    pass: process.env.EMAIL_PASS || 'Est@giario2'
  }
})

const FINANCEIRO = [
  process.env.EMAIL_FINANCEIRO_1 || 'financeiro1@natalsafety.com.br',
  process.env.EMAIL_FINANCEIRO_2 || 'financeiro2@natalsafety.com.br'
]

const GERENTES = (process.env.EMAIL_GERENTES || '').split(',').map(e => e.trim()).filter(Boolean)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatarOC(oc) {
  return {
    numero: `OC ${oc.numero}.${oc.ano}-${oc.empresa?.sigla ?? ''}`,
    fornecedor: oc.fornecedor?.nome ?? 'Não informado',
    empresa: oc.empresa?.nome ?? oc.empresa?.sigla ?? '',
    solicitante: oc.solicitante ?? 'Não informado',
    data: oc.dataPedido ? new Date(oc.dataPedido).toLocaleDateString('pt-BR') : 'Não informada',
    total: (oc.itens ?? []).reduce((acc, item) => {
      const sub = (item.quantidade ?? 0) * (item.valorUnitario ?? 0)
      return acc + sub + sub * ((item.ipi ?? 0) / 100)
    }, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    condicoes: oc.condicoesPagto ?? '-',
    prazo: oc.prazoEntrega ?? '-',
  }
}

function cabecalho(f) {
  return `
─────────────────────────────────
  ${f.numero}
─────────────────────────────────
Fornecedor : ${f.fornecedor}
Empresa    : ${f.empresa}
Solicitante: ${f.solicitante}
Data       : ${f.data}
Total      : ${f.total}
Condições  : ${f.condicoes}
Prazo      : ${f.prazo}
─────────────────────────────────`.trim()
}

async function enviar({ para, assunto, corpo }) {
  await transporter.sendMail({
    from: `"NSHub - Natal Safety" <${process.env.EMAIL_USER || 'tec2@natalsafety.com.br'}>`,
    to: Array.isArray(para) ? para.join(', ') : para,
    subject: assunto,
    text: corpo
  })
}

// ─── Nova OC → financeiro ─────────────────────────────────────────────────────
export async function notificarNovaOC(oc, baseUrl) {
  const f = formatarOC(oc)
  const link = `${baseUrl}/html/index.html#oc-${oc.id}`

  await enviar({
    para: FINANCEIRO,
    assunto: `[Nova OC] ${f.numero} — ${f.fornecedor}`,
    corpo: `Nova Ordem de Compra gerada no NSHub.\n\n${cabecalho(f)}\n\nAcesse: ${link}`
  })

  console.log(`📧 Email enviado para o financeiro — ${f.numero}`)
}

// ─── Notificações do fluxo de aprovação ──────────────────────────────────────
// evento: 'nova' | 'aprovada' | 'autorizada' | 'recusada'
export async function notificarAprovacao(oc, evento, baseUrl, motivo = null) {
  const f = formatarOC(oc)
  const link = `${baseUrl}/html/index.html#oc-${oc.id}`

  const configs = {
    nova: {
      para: GERENTES,
      assunto: `[Aguardando Aprovação] ${f.numero} — ${f.fornecedor}`,
      corpo: `Uma nova OC aguarda sua aprovação.\n\n${cabecalho(f)}\n\nAcesse para aprovar ou recusar: ${link}`
    },
    aprovada: {
      para: FINANCEIRO,
      assunto: `[Aguardando Autorização] ${f.numero} — ${f.fornecedor}`,
      corpo: `A OC abaixo foi aprovada pelo gerente e aguarda sua autorização.\n\n${cabecalho(f)}\n\nAcesse para autorizar ou recusar: ${link}`
    },
    autorizada: {
      para: GERENTES,
      assunto: `[OC Aprovada ✓] ${f.numero} — ${f.fornecedor}`,
      corpo: `A OC abaixo foi totalmente aprovada e autorizada.\n\n${cabecalho(f)}\n\nAcesse: ${link}`
    },
    recusada: {
      para: GERENTES,
      assunto: `[OC Recusada ✗] ${f.numero} — ${f.fornecedor}`,
      corpo: `A OC abaixo foi recusada.\n\nMotivo: ${motivo ?? 'Não informado'}\n\n${cabecalho(f)}\n\nAcesse: ${link}`
    }
  }

  const cfg = configs[evento]
  if (!cfg || cfg.para.length === 0) return

  await enviar(cfg)
  console.log(`📧 Notificação [${evento}] enviada — ${f.numero}`)
}
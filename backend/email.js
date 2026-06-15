import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'mail.natalsafety.com.br',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
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
    from: `"NSHub - Natal Safety" <${process.env.EMAIL_USER}>`,
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

// ─── Reset de senha ───────────────────────────────────────────────────────────
export async function enviarEmailResetSenha(usuario, link) {
  await transporter.sendMail({
    from: `"Natal Safety App" <${process.env.EMAIL_USER}>`,
    to: usuario.email,
    subject: 'Redefinição de senha — Natal Safety App',
    html: `
      <div style="font-family:Arial,sans-serif; max-width:480px; margin:0 auto;">
        <h2 style="color:#158815;">Natal Safety App</h2>
        <p>Olá, <strong>${usuario.nome}</strong>.</p>
        <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para continuar:</p>
        <div style="text-align:center; margin:28px 0;">
          <a href="${link}"
            style="background:#158815; color:white; padding:12px 28px; border-radius:6px;
                   text-decoration:none; font-weight:bold; font-size:15px;">
            Redefinir minha senha
          </a>
        </div>
        <p style="color:#888; font-size:12px;">
          Este link expira em <strong>1 hora</strong>.<br>
          Se você não solicitou a redefinição, ignore este email — sua senha permanece a mesma.
        </p>
        <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">
        <p style="color:#aaa; font-size:11px;">Natal Safety · Sistema interno</p>
      </div>
    `
  })
}
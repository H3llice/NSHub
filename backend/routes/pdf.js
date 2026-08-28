import { Router } from 'express'
import { prisma } from '../server.js'
import puppeteer from 'puppeteer'
import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { autenticar } from '../middleware/auth.js'

const router = Router()

// Escapa texto livre antes de interpolar no HTML do PDF — evita que um campo
// como "instruções" ou "descrição do item" injete tags/script no template
// renderizado pelo Puppeteer.
function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function blocoAssinatura({ cargo, nome, assinatura }) {
  const recusada = assinatura?.acao === 'recusada'
  const cor = recusada ? '#dc3545' : '#000'

  return `
    <div class="assinatura">
      <div class="cargo">${escapeHtml(cargo)}</div>
      <div class="nome" style="min-height:16px;">${escapeHtml(nome)}</div>
      <div style="height:54px; display:flex; align-items:flex-end; justify-content:center;">
        ${assinatura?.assinaturaImg
      ? `<img src="${assinatura.assinaturaImg}" style="max-height:50px; max-width:140px;">`
      : ''
    }
      </div>
      <div class="linha-assinatura" style="border-color:${cor};"></div>
      <div style="font-size:9px; color:${cor}; min-height:14px;">
        ${assinatura
      ? `${assinatura.acao === 'aprovada' ? '✓ ' : '✗ '}${escapeHtml(assinatura.usuario?.nome)} — ${new Date(assinatura.criadoEm).toLocaleDateString('pt-BR')}`
      : ''
    }
      </div>
      ${assinatura?.motivo
      ? `<div style="font-size:9px; color:${cor}; margin-top:2px;">${recusada ? 'Motivo' : 'Observação'}: ${escapeHtml(assinatura.motivo)}</div>`
      : ''
    }
    </div>
  `
}

router.get('/:id', autenticar, async (req, res) => {
  const oc = await prisma.ordemCompra.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      fornecedor: true,
      empresa: true,
      vendedor: true,
      itens: true,
      anexos: true,
      criadoPor: true,          // ← para usar como fallback do nome do solicitante
      assinaturas: {
        include: { usuario: true },
        orderBy: { criadoEm: 'asc' }
      }
    }
  })

  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })

  const total = oc.itens.reduce((acc, item) => acc + (item.valorTotal || 0), 0)
  const numero = `OC ${oc.numero}.${oc.ano}-${oc.empresa?.sigla || ''}`
  const dataPedido = new Date(oc.dataPedido).toLocaleDateString('pt-BR', { timeZone: 'UTC'})
  const nomeDownload = `${oc.numero} - ${oc.fornecedor?.nome || 'sem-fornecedor'} - ${oc.empresa?.sigla || ''}`

  const logoPath = path.resolve('assets/logo.png')
  const logoBase64 = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : ''
  const rodapePath = path.resolve('assets/rodape.png')
  const rodapeBase64 = fs.existsSync(rodapePath)
    ? `data:image/png;base64,${fs.readFileSync(rodapePath).toString('base64')}`
    : ''

  // ─── Assinaturas ────────────────────────────────────────────────────────────
  const asSolicitante = oc.assinaturas.find(a => a.etapa === 'solicitante')
  const asAprovacao = oc.assinaturas.find(a => a.etapa === 'aprovacao')
  const asAutorizacao = oc.assinaturas.find(a => a.etapa === 'autorizacao')

  // Nome do solicitante: campo texto da OC → nome do criador → vazio
  const nomeSolicitante = oc.solicitante?.trim() || oc.criadoPor?.nome || ''

  const html = `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; padding-bottom: 80px; }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 8px;
        }
        .header img { width: 100%; height: auto; }
        .header-text {
          text-align: right;
          font-size: 9px;
          font-style: italic;
          font-weight: bold;
          line-height: 1.6;
        }

        h1 { text-align: center; font-size: 20px; letter-spacing: 2px; margin-bottom: 12px; }

        .aviso { border: 1px solid #000; padding: 8px; text-align: center; margin-bottom: 12px; font-size: 10px; }
        .aviso strong { font-size: 13px; display: block; margin-top: 4px; }

        .secao { border: 1px solid #000; padding: 8px; margin-bottom: 10px; }
        .secao-titulo { text-align: center; font-style: italic; margin-bottom: 6px; font-size: 10px; }
        .linha { display: flex; gap: 8px; margin-bottom: 3px; }
        .label { font-weight: normal; min-width: 80px; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th { background: #f0f0f0; border: 1px solid #000; padding: 5px; text-align: left; }
        td { border: 1px solid #000; padding: 5px; }
        .total-row td { font-weight: bold; }

        .condicoes { border: 1px solid #000; padding: 8px; margin-bottom: 10px; }
        .condicoes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }

        .instrucoes { border: 1px solid #000; padding: 8px; margin-bottom: 16px; min-height: 40px; }

        .assinaturas { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
        .assinatura { text-align: center; }
        .assinatura .linha-assinatura { border-top: 1px solid #000; margin-bottom: 4px; }
        .assinatura .cargo { font-weight: bold; font-size: 10px; }
        .assinatura .nome { font-size: 10px; }

        .rodape {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0 20px;
        }
        .rodape img { width: 100%; display: block; }
      </style>
    </head>
    <body>

      <div class="header">
        ${logoBase64 ? `<img src="${logoBase64}" />` : ''}
      </div>

      <h1>ORDEM DE COMPRAS</h1>

      <div class="aviso">
        Favor mencionar este numero em todos os tipos de documentos, notas fiscais e faturas relacionados:
        <strong>${numero}</strong>
      </div>

      <div class="secao">
        <div class="secao-titulo">Dados para Faturamento e Entrega</div>
        <strong>${escapeHtml(oc.empresa?.nome)}</strong><br>
        ENDEREÇO: ${escapeHtml(oc.empresa?.endereco)}, ${escapeHtml(oc.empresa?.cidade)} CEP: ${escapeHtml(oc.empresa?.cep)} &nbsp; Tel. ${escapeHtml(oc.empresa?.telefone)}<br>
        CNPJ ${escapeHtml(oc.empresa?.cnpj)} &nbsp;&nbsp; INSC EST ${escapeHtml(oc.empresa?.inscEstadual)} &nbsp;&nbsp; ${escapeHtml(oc.empresa?.email)}
      </div>

      <div class="secao">
        <div class="secao-titulo">Dados do Fornecedor</div>
        <div class="linha"><span class="label">Empresa</span> ${escapeHtml(oc.fornecedor?.nome)}</div>
        <div class="linha"><span class="label">Endereço</span> ${escapeHtml(oc.fornecedor?.endereco)}</div>
        <div class="linha"><span class="label">Cidade e CEP</span> ${escapeHtml(oc.fornecedor?.cidade)}</div>
        <div class="linha"><span class="label">C N P J</span> ${escapeHtml(oc.fornecedor?.documento)}</div>
        <div class="linha"><span class="label">Telefone</span> ${escapeHtml(oc.fornecedor?.telefone)}</div>
        <div class="linha"><span class="label">Vendedor</span> ${escapeHtml(oc.vendedor?.nome)}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>QTD</th><th>UNID</th><th>DESCRIÇÃO</th><th>VALOR UNI</th><th>IPI</th><th>VALOR TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${oc.itens.map(item => `
            <tr>
              <td>${item.quantidade}</td>
              <td>${escapeHtml(item.unidade)}</td>
              <td>${escapeHtml(item.descricao)}</td>
              <td>${item.valorUni ? 'R$ ' + item.valorUni.toFixed(2) : ''}</td>
              <td>${item.ipi ? item.ipi + '%' : ''}</td>
              <td>${item.valorTotal ? 'R$ ' + item.valorTotal.toFixed(2) : ''}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="5" style="text-align:right;">TOTAL</td>
            <td>R$ ${total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div class="condicoes">
        <div class="secao-titulo">Condições Comerciais</div>
        <div class="condicoes-grid">
          <div><strong>Data Pedido</strong> ${dataPedido}</div>
          <div><strong>Condições Pagto</strong> ${escapeHtml(oc.condicoesPagto)}</div>
          <div><strong>Forma de Pagto</strong> ${escapeHtml(oc.formaPagto)}</div>
          <div><strong>Prazo de entrega</strong> ${escapeHtml(oc.prazoEntrega)}</div>
          <div><strong>Incoterms</strong> ${escapeHtml(oc.incoterms)}</div>
          <div><strong>Transportadora</strong> ${escapeHtml(oc.transportadora)}</div>
          <div><strong>Endereço</strong> ${escapeHtml(oc.enderecoTransp)}</div>
          <div><strong>Tel e contato</strong> ${escapeHtml(oc.telefoneTransp)}</div>
        </div>
      </div>

      <div class="instrucoes">
        <div class="secao-titulo">Instruções ou Condições Especiais</div>
        ${escapeHtml(oc.instrucoes)}
      </div>

      <div class="assinaturas">
        ${blocoAssinatura({
    cargo: 'SOLICITANTE',
    nome: nomeSolicitante,
    assinatura: asSolicitante || null
  })}
        ${blocoAssinatura({
    cargo: 'AUTORIZADO',
    nome: 'CELSO',
    assinatura: asAprovacao || null
  })}
        ${blocoAssinatura({
    cargo: 'FINANCEIRO',
    nome: 'ROSANE',
    assinatura: asAutorizacao || null
  })}
      </div>

      <div class="rodape">
        ${rodapeBase64 ? `<img src="${rodapeBase64}" style="width:100%;" />` : ''}
      </div>

    </body>
    </html>
  `

  // ===== GERA PDF COM PUPPETEER =====
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()
  // O template é só marcação estática pra impressão — desabilita JS pra fechar
  // a superfície de injeção mesmo que algum campo escape do escapeHtml() acima.
  await page.setJavaScriptEnabled(false)
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const ocPdfBytes = await page.pdf({ format: 'A4', printBackground: true })
  await browser.close()

  // ===== MESCLA COM ANEXOS =====
  const pdfFinal = await PDFDocument.create()
  const ocPdf = await PDFDocument.load(ocPdfBytes)
  const ocPages = await pdfFinal.copyPages(ocPdf, ocPdf.getPageIndices())
  ocPages.forEach(p => pdfFinal.addPage(p))

  for (const anexo of oc.anexos) {
    const filePath = path.resolve(`uploads/${anexo.nomeArquivo}`)
    if (!fs.existsSync(filePath)) continue

    if (anexo.mimeType === 'application/pdf') {
      const anexoPdf = await PDFDocument.load(fs.readFileSync(filePath))
      const pages = await pdfFinal.copyPages(anexoPdf, anexoPdf.getPageIndices())
      pages.forEach(p => pdfFinal.addPage(p))
    } else if (anexo.mimeType.startsWith('image/')) {
      const imgBytes = fs.readFileSync(filePath)
      const img = anexo.mimeType === 'image/png'
        ? await pdfFinal.embedPng(imgBytes)
        : await pdfFinal.embedJpg(imgBytes)
      const pg = pdfFinal.addPage()
      const { width, height } = pg.getSize()
      const scale = Math.min(width / img.width, height / img.height) * 0.9
      pg.drawImage(img, {
        x: (width - img.width * scale) / 2,
        y: (height - img.height * scale) / 2,
        width: img.width * scale,
        height: img.height * scale,
      })
    }
  }

  const pdfBytes = await pdfFinal.save()
  const nomeArquivo = `${nomeDownload}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

// Mesma lista de "Justificativa Técnica/Comercial" do formulário oficial NS-PC-SGQ-16,
// usada em backend/routes/solicitacoes.js — repetida aqui pra resolver qual checkbox marcar no PDF.
const JUSTIFICATIVAS_APROVACAO = {
  menor_preco: 'Menor Preço',
  prazo_urgencia: 'Prazo de Entrega que Atende Urgência',
  fornecedor_unico: 'Único Fornecedor Qualificado',
  marca_especifica: 'Marca Específica Exigida em Contrato',
  condicao_pagamento: 'Condição de Pagamento Favorável'
}

function marcador(marcado) {
  return marcado ? '(X)' : '(&nbsp;&nbsp;)'
}

router.get('/solicitacao/:id', autenticar, async (req, res) => {
  const sc = await prisma.solicitacaoCompra.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      empresa: true,
      criadoPor: true,
      itens: { include: { precos: true } },
      fornecedores: { include: { precos: true } },
      assinaturas: {
        include: { usuario: true },
        orderBy: { criadoEm: 'asc' }
      }
    }
  })

  if (!sc) return res.status(404).json({ erro: 'Solicitação não encontrada' })

  const numero = `SC ${sc.numero}.${sc.ano}-${sc.empresa?.sigla || ''}`
  const dataPedido = new Date(sc.dataPedido).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  const nomeDownload = `${numero}`

  const logoPath = path.resolve('assets/logo.png')
  const logoBase64 = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : ''
  const rodapePath = path.resolve('assets/rodape.png')
  const rodapeBase64 = fs.existsSync(rodapePath)
    ? `data:image/png;base64,${fs.readFileSync(rodapePath).toString('base64')}`
    : ''

  const asSolicitante = sc.assinaturas.find(a => a.etapa === 'solicitante')
  const asAprovacao = sc.assinaturas.find(a => a.etapa === 'aprovacao')
  const nomeSolicitante = sc.criadoPor?.nome || ''
  const fornecedorEscolhido = sc.fornecedores.find(f => f.escolhido)

  // Total cotado por fornecedor, considerando só os itens que ele cotou
  const totais = sc.fornecedores.map(f => {
    const total = sc.itens.reduce((acc, item) => {
      const preco = item.precos.find(p => p.fornecedorCotadoId === f.id)
      return acc + (preco?.valor ? preco.valor * item.quantidade : 0)
    }, 0)
    return { fornecedor: f, total }
  })

  // Resolve qual opção de justificativa marcar: compara o texto salvo em `motivo`
  // contra as labels fixas; se não bater com nenhuma, trata como "Outro" com texto livre.
  const justificativaLabels = Object.values(JUSTIFICATIVAS_APROVACAO)
  const motivoAprovacao = asAprovacao?.motivo || null
  const justificativaOutroTexto = motivoAprovacao && !justificativaLabels.includes(motivoAprovacao)
    ? motivoAprovacao
    : null

  const linhaDadosTopo = `
    <table class="dados-topo">
      <tr>
        <td><strong>Solicitante:</strong> ${escapeHtml(nomeSolicitante)}</td>
        <td><strong>Data da Solicitação:</strong> ${dataPedido}</td>
        <td><strong>Departamento Destino:</strong> ${marcador(sc.departamentoDestino === 'tecnico')} Técnico &nbsp; ${marcador(sc.departamentoDestino === 'administrativo')} Administrativo</td>
      </tr>
    </table>
  `

  const html = `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 10.5px; padding: 20px; padding-bottom: 80px; }

        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #000; padding: 5px; text-align: left; vertical-align: top; }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 8px;
        }
        .header img { width: 100%; height: auto; }

        h1 { text-align: center; font-size: 20px; letter-spacing: 2px; margin-bottom: 12px; }

        .aviso { border: 1px solid #000; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 10px; }
        .aviso strong { font-size: 13px; }
        .aviso .controle { font-size: 8.5px; text-align: right; line-height: 1.5; border-left: 1px solid #000; padding-left: 10px; margin-left: 10px; }

        .rodape {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0 20px;
        }
        .rodape img { width: 100%; display: block; }

        .dados-topo { margin-bottom: 10px; }
        .dados-topo td { font-size: 10px; }

        .intro { font-size: 9.5px; font-style: italic; margin-bottom: 8px; }

        .tabela-comparativo th { background: #f0f0f0; font-size: 9.5px; }
        .tabela-comparativo { margin-bottom: 6px; }
        .col-escolhido { background: #eafaf0; }
        .tag-escolhido { color: #158815; font-weight: bold; }
        .linha-label td:first-child { font-weight: bold; background: #f7f7f7; }
        .total-row td { font-weight: bold; }

        .nota { font-size: 9px; font-style: italic; margin-bottom: 16px; }

        .instrucoes { border: 1px solid #000; padding: 8px; margin-bottom: 16px; min-height: 30px; }
        .instrucoes .titulo { text-align: center; font-style: italic; margin-bottom: 6px; font-size: 10px; }

        .assinatura-solicitante-strip { margin-bottom: 16px; font-size: 10px; }

        .pagina2 { page-break-before: always; padding-top: 20px; }
        .titulo-secao { font-weight: bold; font-size: 12px; margin-bottom: 6px; }
        .intro-secao { font-size: 9.5px; margin-bottom: 10px; }

        .tabela-selecao td { font-size: 10px; }
        .tabela-selecao .rotulo { font-weight: bold; width: 180px; background: #f7f7f7; }
        .justificativa-lista div { margin-bottom: 2px; }

        .assinatura-direcao { text-align: center; }
        .assinatura-direcao img { max-height: 45px; max-width: 140px; }
        .assinatura-direcao .linha { border-top: 1px solid #000; margin: 30px 8px 4px; }
        .assinatura-direcao .info { font-size: 9px; }
      </style>
    </head>
    <body>

      <div class="header">
        ${logoBase64 ? `<img src="${logoBase64}" />` : ''}
      </div>

      <h1>SOLICITAÇÃO DE COMPRA</h1>

      <div class="aviso">
        <div>
          Número da solicitação:
          <strong>${escapeHtml(numero)}</strong>
        </div>
        <div class="controle">
          <strong>Nº Revisão:</strong> 06/2026<br>
          <strong>Data de Expedição:</strong> 11/06/2026<br>
          <strong>Ref. Procedimento:</strong> NS-PC-SGQ-16
        </div>
      </div>

      ${linhaDadosTopo}

      <div class="intro">
        Esta seção compila os dados coletados junto ao mercado, permitindo a comparação direta de marcas, valores e prazos de garantia, visando identificar a melhor opção de compra.
      </div>

      <table class="tabela-comparativo">
        <thead>
          <tr>
            <th>QTD.</th>
            <th>DESCRIÇÃO DO MATERIAL / SERVIÇO</th>
            ${sc.fornecedores.map((f, i) => `
              <th class="${f.escolhido ? 'col-escolhido' : ''}">
                FORNECEDOR ${i + 1}<br>
                ${escapeHtml(f.nome)}${f.telefone ? ' / ' + escapeHtml(f.telefone) : ''}
                ${f.escolhido ? '<br><span class="tag-escolhido">✓ ESCOLHIDO</span>' : ''}
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${sc.itens.map(item => `
            <tr>
              <td>${item.quantidade}${item.unidade ? ' ' + escapeHtml(item.unidade) : ''}</td>
              <td>${escapeHtml(item.descricao)}</td>
              ${sc.fornecedores.map(f => {
    const preco = item.precos.find(p => p.fornecedorCotadoId === f.id)
    return `<td class="${f.escolhido ? 'col-escolhido' : ''}">${preco?.valor ? 'R$ ' + preco.valor.toFixed(2) : '-'}</td>`
  }).join('')}
            </tr>
          `).join('')}
          <tr class="linha-label total-row">
            <td colspan="2">VALORES TOTAIS</td>
            ${totais.map(t => `<td class="${t.fornecedor.escolhido ? 'col-escolhido' : ''}">R$ ${t.total.toFixed(2)}</td>`).join('')}
          </tr>
          <tr class="linha-label">
            <td colspan="2">PRAZO DE ENTREGA</td>
            ${sc.fornecedores.map(f => `<td class="${f.escolhido ? 'col-escolhido' : ''}">${f.prazoEntrega ? escapeHtml(f.prazoEntrega) : '-'}</td>`).join('')}
          </tr>
          <tr class="linha-label">
            <td colspan="2">CONDIÇÕES DE PAGAMENTO</td>
            ${sc.fornecedores.map(f => `<td class="${f.escolhido ? 'col-escolhido' : ''}">${f.condicoesPagto ? escapeHtml(f.condicoesPagto) : '-'}</td>`).join('')}
          </tr>
          <tr class="linha-label">
            <td colspan="2">OBSERVAÇÕES COMERCIAIS</td>
            ${sc.fornecedores.map(f => `<td class="${f.escolhido ? 'col-escolhido' : ''}">${f.observacoes ? escapeHtml(f.observacoes) : '-'}</td>`).join('')}
          </tr>
        </tbody>
      </table>

      <div class="nota">
        Nota: Caso existam mais fornecedores ou materiais cotados, utilize uma folha suplementar ou anexe a continuação deste mapa.
      </div>

      ${sc.instrucoes ? `
        <div class="instrucoes">
          <div class="titulo">Instruções</div>
          ${escapeHtml(sc.instrucoes)}
        </div>
      ` : ''}

      <table class="assinatura-solicitante-strip">
        <tr>
          <td style="width:110px;">Solicitante:</td>
          <td>
            ${asSolicitante?.assinaturaImg ? `<img src="${asSolicitante.assinaturaImg}" style="max-height:36px; max-width:120px; vertical-align:middle; margin-right:8px;">` : ''}
            ${escapeHtml(nomeSolicitante)}
            ${asSolicitante ? ` — assinado em ${new Date(asSolicitante.criadoEm).toLocaleDateString('pt-BR')}` : ' — assinatura pendente'}
          </td>
        </tr>
      </table>

      <div class="pagina2">
        <div class="titulo-secao">ANÁLISE CRÍTICA, SELEÇÃO E AUTORIZAÇÃO DA DIRETORIA</div>
        <div class="intro-secao">Nesta seção, as cotações passam pela decisão do fornecedor e pela aprovação da Direção.</div>

        ${linhaDadosTopo}

        <table class="tabela-selecao">
          <tr>
            <td class="rotulo">Fornecedor Selecionado:</td>
            <td colspan="2">${fornecedorEscolhido ? escapeHtml(fornecedorEscolhido.nome) : '—'}</td>
          </tr>
          <tr>
            <td class="rotulo">Justificativa Técnica/Comercial:</td>
            <td colspan="2">
              <div class="justificativa-lista">
                ${Object.entries(JUSTIFICATIVAS_APROVACAO).map(([, label]) => `
                  <div>${marcador(motivoAprovacao === label)} ${escapeHtml(label)}</div>
                `).join('')}
                <div>${marcador(!!justificativaOutroTexto)} Outro: ${justificativaOutroTexto ? escapeHtml(justificativaOutroTexto) : ''}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td class="rotulo">Aprovação da Direção:</td>
            <td style="width:220px;">
              ${marcador(sc.status === 'aprovada')} COMPRA AUTORIZADA<br>
              ${marcador(sc.status === 'recusada')} SOLICITAR NOVA COTAÇÃO
            </td>
            <td class="assinatura-direcao">
              ${asAprovacao?.assinaturaImg ? `<img src="${asAprovacao.assinaturaImg}">` : ''}
              <div class="linha"></div>
              <div class="info">
                ${asAprovacao ? `${escapeHtml(asAprovacao.usuario?.nome)} — ${new Date(asAprovacao.criadoEm).toLocaleDateString('pt-BR')}` : 'Assinatura / Data'}
              </div>
            </td>
          </tr>
        </table>
      </div>

      <div class="rodape">
        ${rodapeBase64 ? `<img src="${rodapeBase64}" />` : ''}
      </div>

    </body>
    </html>
  `

  // ===== GERA PDF COM PUPPETEER =====
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setJavaScriptEnabled(false)
  await page.setContent(html, { waitUntil: 'networkidle0' })
  const pdfBytes = await page.pdf({ format: 'A4', printBackground: true })
  await browser.close()

  const nomeArquivo = `${nomeDownload}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)
  res.send(Buffer.from(pdfBytes))
})

export default router
import { Router } from 'express'
import { prisma } from '../server.js'
import puppeteer from 'puppeteer'
import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

const router = Router()

router.get('/:id', async (req, res) => {
  const oc = await prisma.ordemCompra.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      fornecedor: true,
      empresa: true,
      vendedor: true,
      itens: true,
      anexos: true
    }
  })

  if (!oc) return res.status(404).json({ erro: 'OC não encontrada' })

  // ===== GERA HTML DA OC =====
  const total = oc.itens.reduce((acc, item) => acc + (item.valorTotal || 0), 0)
  const numero = `OC ${oc.numero}.${oc.ano}-${oc.empresa?.sigla || ''}`
  const dataPedido = new Date(oc.dataPedido).toLocaleDateString('pt-BR')
  const nomeDownload = `${oc.numero} - ${oc.fornecedor?.nome || 'sem-fornecedor'} - ${oc.empresa?.sigla || ''}`


  const logoPath = path.resolve('assets/logo.png')
  const logoBase64 = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : ''
  const rodapePath = path.resolve('assets/rodape.png')
  const rodapeBase64 = fs.existsSync(rodapePath)
    ? `data:image/png;base64,${fs.readFileSync(rodapePath).toString('base64')}`
    : ''

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
  border-bottom: 3px solid #e87722;
  padding-bottom: 8px;
}
.header img { height: 100px; }
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
        <strong>${oc.empresa?.nome || ''}</strong><br>
        ENDEREÇO: ${oc.empresa?.endereco || ''}, ${oc.empresa?.cidade || ''} CEP: ${oc.empresa?.cep || ''} &nbsp; Tel. ${oc.empresa?.telefone || ''}<br>
        CNPJ ${oc.empresa?.cnpj || ''} &nbsp;&nbsp; INSC EST ${oc.empresa?.inscEstadual || ''} &nbsp;&nbsp; ${oc.empresa?.email || ''}
      </div>

      <div class="secao">
        <div class="secao-titulo">Dados do Fornecedor</div>
        <div class="linha"><span class="label">Empresa</span> ${oc.fornecedor?.nome || ''}</div>
        <div class="linha"><span class="label">Endereço</span> ${oc.fornecedor?.endereco || ''}</div>
        <div class="linha"><span class="label">Cidade e CEP</span> ${oc.fornecedor?.cidade || ''}</div>
        <div class="linha"><span class="label">C N P J</span> ${oc.fornecedor?.documento || ''}</div>
        <div class="linha"><span class="label">Telefone</span> ${oc.fornecedor?.telefone || ''}</div>
        <div class="linha"><span class="label">Vendedor</span> ${oc.vendedor?.nome || ''}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>QTD</th>
            <th>UNID</th>
            <th>DESCRIÇÃO</th>
            <th>VALOR UNI</th>
            <th>IPI</th>
            <th>VALOR TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${oc.itens.map(item => `
            <tr>
              <td>${item.quantidade}</td>
              <td>${item.unidade || ''}</td>
              <td>${item.descricao}</td>
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
          <div><strong>Condições Pagto</strong> ${oc.condicoesPagto || ''}</div>
          <div><strong>Forma de Pagto</strong> ${oc.formaPagto || ''}</div>
          <div><strong>Prazo de entrega</strong> ${oc.prazoEntrega || ''}</div>
          <div><strong>Incoterms</strong> ${oc.incoterms || ''}</div>
          <div><strong>Transportadora</strong> ${oc.transportadora || ''}</div>
          <div><strong>Endereço</strong> ${oc.enderecoTransp || ''}</div>
          <div><strong>Tel e contato</strong> ${oc.telefoneTransp || ''}</div>
        </div>
      </div>

      <div class="instrucoes">
        <div class="secao-titulo">Instruções ou Condições Especiais</div>
        ${oc.instrucoes || ''}
      </div>

      <div class="assinaturas">
        <div class="assinatura">
          <div class="cargo">SOLICITANTE</div>
          <div class="nome">${oc.solicitante || 'USUÁRIO'}</div>
          <br><br>
          <div class="linha-assinatura"></div>
          <div>Visto</div>
        </div>
        <div class="assinatura">
          <div class="cargo">Autorizado</div>
          <div class="nome">CELSO</div>
          <br><br>
          <div class="linha-assinatura"></div>
          <div>visto</div>
        </div>
        <div class="assinatura">
          <div class="cargo">Financeiro</div>
          <div class="nome">ROSANE</div>
          <br><br>
          <div class="linha-assinatura"></div>
          <div>visto</div>
        </div>
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
      const page = pdfFinal.addPage()
      const { width, height } = page.getSize()
      const scale = Math.min(width / img.width, height / img.height) * 0.9
      page.drawImage(img, {
        x: (width - img.width * scale) / 2,
        y: (height - img.height * scale) / 2,
        width: img.width * scale,
        height: img.height * scale,
      })
    }
  }

  const pdfBytes = await pdfFinal.save()

  res.setHeader('Content-Type', 'application/pdf')
  const nomeArquivo = `${nomeDownload}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`)

  res.send(Buffer.from(pdfBytes))
})

export default router
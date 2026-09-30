import puppeteer from 'puppeteer'

// Um único Chromium para todos os PDFs. Abrir um navegador por requisição custava
// 1–2s e ~100MB cada vez; aqui ele sobe no primeiro PDF e fica — cada PDF só abre
// e fecha uma aba. Guarda a Promise (não o browser) pra que dois PDFs pedidos ao
// mesmo tempo não disparem dois launch().
let navegador = null

function obterNavegador() {
  if (!navegador) {
    navegador = puppeteer.launch({ args: ['--no-sandbox'] }).then(browser => {
      // Se o Chromium cair ou for fechado, o próximo PDF sobe outro
      browser.on('disconnected', () => { navegador = null })
      return browser
    })
    navegador.catch(() => { navegador = null })
  }
  return navegador
}

// Renderiza um HTML estático em PDF A4. `opcoes` vai direto pro page.pdf()
// (ex.: { preferCSSPageSize: true } quando as margens vêm do @page do template).
export async function gerarPdf(html, opcoes = {}) {
  const browser = await obterNavegador()
  const page = await browser.newPage()
  try {
    // Os templates são só marcação estática pra impressão — desabilita JS pra fechar
    // a superfície de injeção mesmo que algum campo escape do escapeHtml().
    await page.setJavaScriptEnabled(false)
    await page.setContent(html, { waitUntil: 'networkidle0' })
    return await page.pdf({ format: 'A4', printBackground: true, ...opcoes })
  } finally {
    await page.close().catch(() => { })
  }
}

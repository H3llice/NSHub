// Mini editor de texto (negrito, itálico, sublinhado, alinhamento) — div
// contenteditable com barrinha de botões, no lugar de um <textarea>.
//
// Formato gravado: uma linha por "\n", texto com HTML escapado (&lt; &amp;) e
// só as tags <b>, <i> e <u>, sem atributo nenhum. Linha com alinhamento vem
// inteira dentro de <centro>, <direita>, <justificado> ou <esquerda> (sem
// nada = padrão, à esquerda). O backend passa o mesmo filtro antes de gravar e
// de imprimir (backend/templates/relatorio-tecnico.js). Texto antigo, gravado
// antes do editor, é texto puro — quem guarda marca o formatado com
// `formato: 'html'` pra não confundir um "<" digitado com tag.
import { esc } from './html.js'

const TAGS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u' }
const ALINHAMENTOS = { esquerda: 'left', centro: 'center', direita: 'right', justificado: 'justify' }
const ALINHAMENTO_CSS = { left: 'esquerda', start: 'esquerda', center: 'centro', right: 'direita', end: 'direita', justify: 'justificado' }

// Dentro da linha: só <b>/<i>/<u> sem atributos; o resto das tags some (o
// texto dentro fica) e "<"/">" soltos viram entidade.
function limparLinha(linha) {
  return linha.split(/(<[^>]*>)/).map(parte => {
    const tag = parte.match(/^<(\/?)\s*(b|i|u|strong|em)\b[^>]*>$/i)
    if (tag) return `<${tag[1]}${TAGS[tag[2].toUpperCase()]}>`
    if (parte.startsWith('<') && parte.endsWith('>')) return ''
    return parte.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  }).join('')
}

// Texto gravado → [{ alinhamento, html }] (já filtrado)
function linhasFormatadas(valor) {
  return String(valor ?? '').split('\n').map(linha => {
    const m = linha.match(/^<(esquerda|centro|direita|justificado)>(.*)<\/\1>$/)
    return m ? { alinhamento: m[1], html: limparLinha(m[2]) } : { alinhamento: '', html: limparLinha(linha) }
  })
}

export function limparTextoFormatado(valor) {
  return linhasFormatadas(valor).map(l => l.alinhamento ? `<${l.alinhamento}>${l.html}</${l.alinhamento}>` : l.html).join('\n')
}

// Uma <div> por linha — é o que o contenteditable do Chrome também produz, e o
// mesmo HTML vai pro PDF (htmlTextoFormatado no backend)
function htmlInicial(texto, formatado) {
  if (!formatado) return (texto || '').split('\n').map(l => `<div>${esc(l) || '<br>'}</div>`).join('')
  return linhasFormatadas(texto).map(l =>
    `<div${l.alinhamento ? ` style="text-align:${ALINHAMENTOS[l.alinhamento]}"` : ''}>${l.html || '<br>'}</div>`
  ).join('')
}

// Ícone de alinhamento: 4 tracinhos, curtos posicionados conforme o lado
function iconeAlinhamento(tipo) {
  const linhas = [14, 9, 14, 9].map((largura, k) => {
    const w = tipo === 'justificado' ? 14 : largura
    const x = tipo === 'centro' ? 1 + (14 - w) / 2 : tipo === 'direita' ? 15 - w : 1
    return `<rect x="${x}" y="${2 + k * 3.5}" width="${w}" height="1.6" rx="0.5"/>`
  }).join('')
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-2px;">${linhas}</svg>`
}

// `formatado`: o texto já está no formato do editor (seção com formato: 'html')
export function editorTexto(id, texto, formatado, desabilitado = false) {
  const linhas = Math.max(3, (texto || '').split('\n').length + 1)
  const botao = (comando, rotulo, titulo, estilo = '') =>
    `<button type="button" class="btn btn-sm btn-secondary" style="min-width:32px; ${estilo}" title="${titulo}" onmousedown="event.preventDefault()" onclick="editorTextoComando('${id}', '${comando}')">${rotulo}</button>`
  const separador = '<span style="width:1px; background:#ccc; margin:2px 4px;"></span>'
  return `
    <div class="editor-texto">
      ${desabilitado ? '' : `
        <div style="display:flex; gap:4px; margin-bottom:4px; flex-wrap:wrap;">
          ${botao('bold', 'N', 'Negrito (Ctrl+B)', 'font-weight:700;')}
          ${botao('italic', 'I', 'Itálico (Ctrl+I)', 'font-style:italic;')}
          ${botao('underline', 'S', 'Sublinhado (Ctrl+U)', 'text-decoration:underline;')}
          ${separador}
          ${botao('justifyLeft', iconeAlinhamento('esquerda'), 'Alinhar à esquerda')}
          ${botao('justifyCenter', iconeAlinhamento('centro'), 'Centralizar')}
          ${botao('justifyRight', iconeAlinhamento('direita'), 'Alinhar à direita')}
          ${botao('justifyFull', iconeAlinhamento('justificado'), 'Justificar')}
          ${separador}
          ${botao('removeFormat', '⌫', 'Tirar negrito/itálico/sublinhado do trecho selecionado')}
        </div>
      `}
      <div id="${id}" class="form-control" contenteditable="${desabilitado ? 'false' : 'true'}"
        style="height:auto; min-height:${linhas * 1.5 + 0.75}em; overflow-wrap:anywhere; ${desabilitado ? 'background:#e9ecef;' : ''}"
        onpaste="editorTextoColar(event)">${htmlInicial(texto, formatado)}</div>
    </div>
  `
}

window.editorTextoComando = function (id, comando) {
  const el = document.getElementById(id)
  if (!el || !el.isContentEditable) return
  el.focus()
  document.execCommand(comando)
}

// Colar entra sempre como texto puro — formatação vinda do Word/navegador traria
// fonte, cor e tamanho que o PDF não imprime e só sujariam o texto.
window.editorTextoColar = function (event) {
  event.preventDefault()
  document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
}

// Lê o editor de volta pro formato gravado. Percorre o DOM em vez de usar o
// innerHTML: o Chrome quebra linha com <div> ou <br>, aninha spans, põe o
// alinhamento no style da <div>... e aqui tudo vira linha + <b>/<i>/<u>.
// Cada trecho de texto sai com a própria formatação (<b>a</b><b>b</b> é
// feio mas certo), assim nenhuma tag fica aberta atravessando linhas.
export function lerEditorTexto(id) {
  const el = document.getElementById(id)
  if (!el) return ''
  const linhas = []
  let atual = null
  // `fechada`: a linha acabou (<br> ou fim de bloco) — o próximo texto abre outra
  const novaLinha = alinhamento => { atual = { alinhamento, html: '', fechada: false }; linhas.push(atual) }

  const percorrer = (no, alinhamento, formatos) => {
    if (no.nodeType === Node.TEXT_NODE) {
      if (!no.textContent) return
      if (!atual || atual.fechada) novaLinha(alinhamento)
      const texto = no.textContent.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', ' ')
      atual.html += formatos.map(t => `<${t}>`).join('') + texto + formatos.slice().reverse().map(t => `</${t}>`).join('')
      return
    }
    if (no.nodeType !== Node.ELEMENT_NODE) return
    if (no.tagName === 'BR') {
      // <br> numa linha já fechada é linha em branco; senão só fecha a linha
      // (o <br> que o Chrome deixa no fim de uma <div> não vira linha extra)
      if (!atual || atual.fechada) novaLinha(alinhamento)
      atual.fechada = true
      return
    }

    const estilo = no.style || {}
    const bloco = ['DIV', 'P', 'LI'].includes(no.tagName)
    const alinhamentoDoNo = ALINHAMENTO_CSS[estilo.textAlign] || ALINHAMENTO_CSS[no.getAttribute('align')] || alinhamento
    if (bloco) {
      // Linha vazia ainda aberta (texto solto antes nada) é reaproveitada
      if (atual && !atual.fechada && !atual.html) atual.alinhamento = alinhamentoDoNo
      else novaLinha(alinhamentoDoNo)
    }

    // Span com estilo (o Chrome às vezes usa em vez da tag) conta igual
    const novos = [...formatos]
    const somar = t => { if (!novos.includes(t)) novos.push(t) }
    if (TAGS[no.tagName]) somar(TAGS[no.tagName])
    if (estilo.fontWeight === 'bold' || Number(estilo.fontWeight) >= 600) somar('b')
    if (estilo.fontStyle === 'italic') somar('i')
    if ((estilo.textDecorationLine || estilo.textDecoration || '').includes('underline')) somar('u')

    no.childNodes.forEach(filho => percorrer(filho, alinhamentoDoNo, novos))
    if (bloco && atual) atual.fechada = true
  }

  el.childNodes.forEach(filho => percorrer(filho, '', []))

  // Linhas em branco do fim não contam (o Chrome deixa uma <div><br></div>)
  while (linhas.length && !linhas[linhas.length - 1].html) linhas.pop()
  return linhas.map(l => l.alinhamento && l.html
    ? `<${l.alinhamento}>${l.html}</${l.alinhamento}>`
    : l.html).join('\n')
}

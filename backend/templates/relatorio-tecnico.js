// Relatório técnico no papel timbrado da Natal Safety (faixa azul + marca
// d'água da boia + rodapé com os endereços) — o mesmo visual dos relatórios
// de gatos (P-77), fibra de vidro (P-76), mangueiras (P-78) e cilindros
// (P-74) em backend/migracao/Certificados & Relatórios/Relatórios. O que muda
// entre eles é só o título e as seções, então o relatório é uma capa + uma
// lista de seções livre, e cada "modelo" abaixo é só o ponto de partida
// (seções já com o texto padrão), que o técnico pode editar à vontade.
//
// O timbrado (assets/relatorio-tecnico-fundo.jpeg) foi extraído do PDF de
// gatos — não existe o arquivo original da arte. Ele não entra no HTML: o
// Chromium gera só o conteúdo e aplicarTimbrado() desenha o fundo por baixo de
// cada página com pdf-lib (fundo em position:fixed no print do Chromium não
// cobre as margens da página de forma confiável).

import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib'
import { gerarPdf } from '../pdf-browser.js'

// Seção 'texto': título + texto livre (quebras de linha mantidas no PDF).
// Seção 'campos': título + um ou mais grupos de "Rótulo: valor" — no
// relatório de gatos cada turco inspecionado é um grupo da mesma seção.
// `sub: true` numera como subseção da anterior (4.1, 4.2...), como nos
// relatórios de fibra e de cilindros.
const texto = (titulo, conteudo = '', sub = false) => ({ tipo: 'texto', titulo, texto: conteudo, sub })
const campos = (titulo, rotulos, valores = {}, sub = false) => ({
  tipo: 'campos',
  titulo,
  sub,
  grupos: [rotulos.map(rotulo => ({ rotulo, valor: valores[rotulo] || '' }))]
})

const EMPRESA_SOLICITANTE = ['EMPRESA', 'PLATAFORMA DE ORIGEM', 'GERÊNCIA SOLICITANTE']
const PETROBRAS = { EMPRESA: 'PETROLEO BRASILEIRO S.A.' }

// Assinatura com `empresa` preenchida é de fora (ex.: coordenador da
// Petrobras na conclusão da fibra/P78) — imprime essa empresa no lugar da
// executante e sem o CNPJ dela.
const COORDENADOR_PETROBRAS = { empresa: 'PETROLEO BRASILEIRO S.A.', nome: '', cargo: 'COORDENADOR EMBARCAÇÃO', registro: 'BUZ/ATP-BUZ/OP-/GEPLAT' }
const NOEL = { nome: 'NOEL CAVALHEIRO JR', cargo: 'ENG MECÂNICO', registro: 'CREA 160.369.515-0' }
const AUGUSTO = { nome: 'AUGUSTO GUSTAVO FILHO', cargo: 'ENG DE PROF, MAN, INSP', registro: 'CREA: 2002105847\nCRT: 39009629791' }
const CELSO = { nome: 'CELSO MOURA', cargo: 'REPARADOR DE FIBRA', registro: 'SISPAT: 47522597' }

export const MODELOS_RELATORIO_TECNICO = {
  gatos: {
    nome: 'Inspeção de Hooks (Gatos)',
    titulo: 'RELATÓRIO DE INSPEÇÃO E CERTIFICAÇÃO\nHOOKS (GATOS) DE LIBERAÇÃO DOS TURCOS DE BALSAS SALVA-VIDAS',
    local: 'RIO DE JANEIRO-RJ',
    secoes: [
      campos('DADOS DA EMPRESA SOLICITANTE', EMPRESA_SOLICITANTE, PETROBRAS),
      campos('DADOS DOS EQUIPAMENTOS', [
        'Unidade / Embarcação', 'Nome / IMO (se aplicável)', 'Local da Inspeção', 'Data da Inspeção',
        'Ordem de Serviço / Certificado Nº', 'Identificação', 'Fabricante do Turco', 'Modelo',
        'Nº Série do Turco', 'Fabricante dos Hooks (Gatos)', 'Modelo / Tipo', 'Nº Série',
        'Capacidade de carga (SWL)'
      ]),
      texto('BASE NORMATIVA / REFERÊNCIAS', 'Inspeção executada em conformidade com:\nInternational Maritime Organization SOLAS Chapter III\nInternational Maritime Organization LSA Code\nMSC.402(96) (Maintenance, examination, operational testing, overhaul and repair of lifeboats and release gear)\nMarinha do Brasil NORMAM aplicável\nManual e procedimentos do fabricante\nRequisitos de classe: '),
      texto('ESCOPO EXECUTADO', 'Foram realizados:\nInspeção visual detalhada dos hooks/gatos;\nVerificação de desgaste, corrosão e trincas;\nLubrificação;\nTeste de reset e travamento;\nEnsaio de carga;\nOverhaul periódico 5 anos.'),
      texto('RESULTADO DA INSPEÇÃO', 'Verificado Condição e Estrutura dos hooks OK.\nPinos/eixos OK\nTravas e gatilhos OK\nReset / Rearme OK\nLiberação operacional OK.'),
      texto('TESTES EXECUTADOS', 'Teste Operacional Satisfatório.\nTeste de Carga Aprovado'),
      texto('SERVIÇOS EXECUTADOS', 'Inspeção e Overhaul 5 anos'),
      texto('CONCLUSÃO', 'Com base na inspeção e testes executados, os hooks (gatos) dos turcos foram considerados:\nCERTIFICADOS E APTOS PARA OPERAÇÃO.')
    ],
    assinaturas: [
      NOEL,
      AUGUSTO,
      { nome: 'JOCIMAR SERAFIM DOS SANTOS', cargo: 'TEC MECÂNICA', registro: 'SISPAT: 45047786' }
    ]
  },

  // P-76_RELATORIO TECNICO DE REPARO DE FIBRA.pdf — as fotos (antes,
  // durante e depois) entram quando o relatório tiver seção de fotos.
  fibra: {
    nome: 'Reparação em Fibra de Vidro e Pintura',
    titulo: 'RELATÓRIO TÉCNICO DE SERVIÇOS DE REPARAÇÃO EM FIBRA DE VIDRO E PINTURA',
    local: 'RIO DE JANEIRO-RJ',
    secoes: [
      campos('DADOS DA EMPRESA SOLICITANTE', EMPRESA_SOLICITANTE, PETROBRAS),
      campos('DADOS DO EQUIPAMENTO', ['EQUIPAMENTO', 'MODELO', 'NÚMERO DE SÉRIE', 'DATA FABRICAÇÃO', 'FABRICANTE', 'TAG']),
      texto('OBJETIVO', 'O PRESENTE TRABALHO TEVE COMO OBJETIVO A REPARAÇÃO DE FIBRA DE VIDRO E PINTURA EXTERNA NA '),
      texto('REPARAÇÕES EM FIBRA'),
      texto('REPARAÇÃO DE FIBRA DE VIDRO', 'NORMAM REV 1-2023 CAP 3 ANEXO 3G. SOLAS CAP III REG.20 E MSC.402(96) REG 20.11 ABNT NBR 15299.2005 ITEM 8 12:1 MANUAL DO FABRICANTE.\n\n* RELATÓRIO TÉCNICO E RELATÓRIO FOTOGRÁFICO EMITIDO\nRELATÓRIO FINAL RESULTADO "APTO" PARA O FIM A QUE SE DESTINA NA PRESENTE DATA.', true),
      texto('CONCLUSÃO', 'OS SERVIÇOS DE REPARAÇÕES DAS FIBRAS DE VIDRO  FORAM CONCLUÍDOS COM ÊXITO, EXCELÊNCIA E APROVAÇÃO PELO RESPONSÁVEL PELA EMBARCAÇÃO.\nEMITIDO CERTIFICADO  COM 90 DIAS DE GARANTIA DOS SERVIÇOS EXECUTADOS.')
    ],
    assinaturas: [COORDENADOR_PETROBRAS, CELSO]
  },

  // P78 RELATÓRIO TÉCNICO DE SERVIÇOS SS-24/2026 (delineamento das mangueiras).
  mangueiras: {
    nome: 'Delineamento das Mangueiras de Ar Respirável',
    titulo: 'RELATÓRIO TÉCNICO DE SERVIÇOS\nDELINEAMENTO DAS MANGUEIRAS DO SISTEMA DE AR RESPIRÁVEL DAS BALEEIRAS',
    local: 'RIO DE JANEIRO-RJ',
    secoes: [
      campos('DADOS DA EMPRESA SOLICITANTE', EMPRESA_SOLICITANTE, PETROBRAS),
      campos('DADOS DOS EQUIPAMENTOS', ['EQUIPAMENTOS', 'MODELO', 'NÚMEROS DE SÉRIE', 'DATAS DE FABRICAÇÃO', 'FABRICANTE', 'TAGs']),
      texto('OBJETIVO', 'O PRESENTE TRABALHO TEVE COMO OBJETIVO O DELINEAMENTO DAS MANGUEIRAS DO SISTEMA DE AR RESPIRÁVEL DAS BALEEIRAS.'),
      texto('DELINEAMENTO DAS MANGUEIRAS DO SISTEMA DE AR RESPIRÁVEL', '* RELATÓRIO TÉCNICO E RELATÓRIO FOTOGRÁFICO EMITIDO\nEquipamento: Baleeira \nModelo: \nSistema: Compressed Air / Emergency Breathing Air System com a configuração geral do sistema:\nCilindros de ar respirável ( unidades).\nVálvulas de cilindros individuais.\nMangueiras de alta pressão.\nColetor (manifold/Tee de distribuição).\nMangueira principal para regulador.\nRegulador redutor de pressão.\nLinha de distribuição de ar para o interior da cabine.\n\nMangueiras dos cilindros\nAplicação: Alta pressão (HP)\nCaracterísticas esperadas:\nMangueira flexível para ar comprimido respirável;\nPressão de trabalho compatível com a pressão de carga dos cilindros (200–300 bar conforme configuração);\nConexões prensadas pelo fabricante;\nIdentificação permanente (fabricante, pressão, lote/data de fabricação).\n\nO Sistema de ar Respirável das Baleeiras encontra-se "Apto" para o fim que se destina na presente data.'),
      texto('CONCLUSÃO', 'OS SERVIÇOS DE DELINEAMENTO DAS MANGUEIRAS DO SISTEMA DE AR RESPIRÁVEL FORAM CONCLUÍDOS COM ÊXITO E EXCELÊNCIA COM AS SEGUINTES MEDIDAS:\n')
    ],
    assinaturas: [COORDENADOR_PETROBRAS, CELSO]
  },

  // RELATÓRIO DE MANUTENÇÃO SUBSTITUIÇÃO DE CILINDROS DE AR RESPIRÁVEL (P-74).
  cilindros: {
    nome: 'Substituição de Cilindros de Ar Respirável',
    titulo: 'RELATÓRIO DE MANUTENÇÃO / SUBSTITUIÇÃO DE CILINDROS DE AR RESPIRÁVEL DE BALEEIRA',
    local: 'RIO DE JANEIRO-RJ',
    secoes: [
      campos('DADOS DA EMPRESA SOLICITANTE', EMPRESA_SOLICITANTE, PETROBRAS),
      campos('DADOS DO EQUIPAMENTO', ['POSTO', 'Baleeira Nº', 'Fabricante', 'Modelo', 'Capacidade', 'Data de fabricação']),
      texto('OBJETIVO', 'Remoção e substituição dos cilindros de ar respirável e mangueiras da embarcação salva-vidas do Posto  em atendimento a SS- e conforme plano de manutenção preventiva, requisitos do fabricante, SOLAS, LSA Code, NORMAM e N-2225 e procedimentos.\nRemoção dos cilindros vencidos e instalação de novos cilindros certificados;\nTeste de estanqueidade das conexões;\nTeste funcional do sistema de ar respirável;\nRestabelecimento e liberação operacional da baleeira.'),
      texto('MANUTENÇÃO/REPARO EM EQUIPAMENTO DE SALVATAGEM', 'Motivo: Vencimento do teste hidrostático dos Cilindros de ar Respirável.'),
      texto('ESCOPO EXECUTADO', 'Foram executadas as seguintes atividades:\nRemoção dos assentos, carenagens, cilindros de ar respirável (vencidos) e mangueiras.\nInstalação de Cilindros de ar Respirável novos e Mangueiras novas.\nTeste de estanqueidade das mangueiras e conexões.\nSistema de ar com pressão de 200 Bar.\nTeste funcional OK.', true),
      campos('INSTALAÇÃO DOS CILINDROS DE AR RESPIRÁVEL, MANGUEIRAS E CONEXÕES', [
        'Série dos cilindros de ar respirável instalados', 'Laudo de qualidade de ar Nº',
        'Laudo de ensaio de teste hidrostático Nº', 'Capacidade dos cilindros de ar respirável',
        'Pressão de carga', 'Validade/Teste'
      ], { 'Pressão de carga': '200 BAR' }, true),
      texto('DADOS DAS MANGUEIRAS E CONEXÕES', 'Mangueiras dos Cilindros de ar Respirável instalados na Baleeira do Posto :\nCertificado Nº \nMangueira Hidráulica 1/4" (6500 PSI) X 33 CM TERMINAL FÊMEA GIRATÓRIA AÇO CARBONO/MACHO GIRATÓRIO 5/8" LATÃO.\nCertificado Nº \nMangueira Hidráulica 1/4" (6500 PSI) X 4.5 M TERMINAL FÊMEA GIRATÓRIA AÇO CARBONO/FÊMEA COM ADAPTADOR 20MM LATÃO.\nCertificado Nº \nTEE EM AÇO CARBONO MACHO CÔNICO.', true),
      texto('TESTES E VERIFICAÇÕES FUNCIONAIS', 'Verificado após substituição:\nSuportes de fixações.\nSistema de ar Respirável sem vazamentos e Pressão de trabalho com 200 BAR OK.\nPainel/Indicadores verificados e conforme.\nBaleeira operacional.', true),
      texto('CONCLUSÃO', 'Após inspeção, substituição dos Cilindros e Mangueiras de ar Respirável, o sistema foi considerado:\nOPERACIONAL E EM CONFORMIDADE.\n\nRecomendações:\nO sistema de ar respirável deve ser inspecionado e mantido operacional ALL TIME.'),
      texto('CONFORMIDADE/REFERÊNCIAS', 'SOLAS Capítulo III, LSA Code, IMO Resolution MSC.402(96)\nManual do fabricante.\nPlano de manutenção / Procedimento.', true)
    ],
    assinaturas: [NOEL, AUGUSTO]
  },

  branco: {
    nome: 'Em branco',
    titulo: 'RELATÓRIO TÉCNICO DE SERVIÇOS',
    local: 'RIO DE JANEIRO-RJ',
    secoes: [
      campos('DADOS DA EMPRESA SOLICITANTE', EMPRESA_SOLICITANTE),
      campos('DADOS DO EQUIPAMENTO', ['EQUIPAMENTO', 'MODELO', 'NÚMERO DE SÉRIE', 'DATA FABRICAÇÃO', 'FABRICANTE', 'TAG']),
      texto('OBJETIVO'),
      texto('CONCLUSÃO')
    ],
    assinaturas: [{ nome: '', cargo: '', registro: '' }]
  }
}

// Conteúdo pronto pra um relatório novo do modelo (cópia — o objeto acima
// não pode ser alterado por quem recebe).
export function conteudoInicial(chave) {
  const m = MODELOS_RELATORIO_TECNICO[chave]
  return structuredClone({
    titulo: m.titulo,
    imo: '',
    certificadoNumero: '',
    local: m.local,
    secoes: m.secoes,
    assinaturas: m.assinaturas
  })
}

// O conteúdo chega do navegador como JSON livre — aqui ele é reduzido ao
// formato que o template sabe imprimir (só strings, só os tipos de seção
// conhecidos), pra não gravar lixo no banco nem quebrar o PDF depois.
export function normalizarConteudo(bruto) {
  const c = bruto && typeof bruto === 'object' ? bruto : {}
  const txt = v => (v === null || v === undefined) ? '' : String(v).slice(0, 20000)
  const lista = v => Array.isArray(v) ? v : []

  return {
    titulo: txt(c.titulo),
    imo: txt(c.imo),
    certificadoNumero: txt(c.certificadoNumero),
    local: txt(c.local),
    secoes: lista(c.secoes).map(s => s?.tipo === 'campos'
      ? {
          tipo: 'campos',
          titulo: txt(s.titulo),
          sub: !!s.sub,
          grupos: lista(s.grupos).map(g => lista(g).map(f => ({ rotulo: txt(f?.rotulo), valor: txt(f?.valor) })))
        }
      : { tipo: 'texto', titulo: txt(s?.titulo), texto: txt(s?.texto), sub: !!s?.sub }),
    assinaturas: lista(c.assinaturas).map(a => ({ empresa: txt(a?.empresa), nome: txt(a?.nome), cargo: txt(a?.cargo), registro: txt(a?.registro) }))
  }
}

// Seção sem título não entra na numeração nem no sumário. Subseção vira
// "4.1", "4.2"... da última seção principal (antes de qualquer principal,
// conta como principal).
export function numerarSecoes(secoes) {
  let principal = 0
  let sub = 0
  return secoes.map(s => {
    if (!s.titulo.trim()) return { ...s, numero: null }
    if (s.sub && principal) return { ...s, numero: `${principal}.${++sub}` }
    sub = 0
    return { ...s, numero: String(++principal) }
  })
}

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// O cadastro da Empresa aceita CNPJ só com dígitos — no papel sai sempre com máscara.
function formatarCnpj(cnpj) {
  const digitos = String(cnpj || '').replace(/\D/g, '')
  if (digitos.length !== 14) return cnpj || ''
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

function comQuebras(valor) {
  return escapeHtml(valor).replaceAll('\n', '<br>')
}

// `paginas`: nº da página de cada seção (índice da seção → página), pra
// imprimir no sumário — vem da 1ª passada de gerarPdfRelatorioTecnico().
export function htmlRelatorioTecnico(relatorio, paginas = {}) {
  const c = normalizarConteudo(relatorio.conteudo)
  // data é gravada como meia-noite UTC — ler em UTC pra não voltar um dia
  // (e, no dia 1º, um mês inteiro na capa).
  const d = relatorio.data ? new Date(relatorio.data) : null
  const mesAno = d ? `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''
  const empresaNome = (relatorio.empresa?.nome || '').toUpperCase()
  const cnpj = formatarCnpj(relatorio.empresa?.cnpj)

  const secoes = numerarSecoes(c.secoes)

  const corpoSecao = s => {
    if (s.tipo === 'texto') return s.texto.trim() ? `<div class="texto">${comQuebras(s.texto)}</div>` : ''
    return s.grupos.map(g => {
      const linhas = g.filter(f => f.rotulo.trim() || f.valor.trim())
      if (!linhas.length) return ''
      return `<div class="grupo">${linhas.map(f => `
        <div>${f.rotulo.trim() ? `${escapeHtml(f.rotulo)}: ` : ''}${escapeHtml(f.valor)}</div>
      `).join('')}</div>`
    }).join('')
  }

  const assinaturas = c.assinaturas.filter(a => a.empresa.trim() || a.nome.trim() || a.cargo.trim() || a.registro.trim())

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  /* Margens fora da faixa azul (topo, até o fim do círculo do logo) e do
     rodapé laranja do timbrado, que é desenhado depois por baixo. */
  @page { size: A4; margin: 52mm 20mm 34mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; margin: 0; line-height: 1.45; }

  .capa { height: 205mm; position: relative; text-align: center; page-break-after: always; }
  .capa .titulo { position: absolute; top: 72mm; left: 0; right: 0; font-size: 12pt; }
  .capa .ident { position: absolute; top: 120mm; left: 0; right: 0; font-size: 11pt; }
  .capa .data { position: absolute; bottom: 4mm; left: 0; right: 0; font-size: 11pt; }

  .sumario { page-break-after: always; }
  .sumario h2 { text-align: center; font-size: 12pt; margin: 0 0 8mm; }
  /* Título longo quebra em mais linhas: o nº da página e os pontos ficam
     na última linha, e o título nunca ocupa a largura toda (sempre sobra
     um trecho pontilhado até o número). */
  .sumario a { display: flex; align-items: flex-end; margin-bottom: 3mm; font-weight: bold; color: inherit; text-decoration: none; }
  .sumario a.sub { margin-left: 8mm; font-weight: normal; }
  .sumario .titulo-item { max-width: 138mm; }
  .sumario .pontos { flex: 1; min-width: 8mm; border-bottom: 1px dotted #555; margin: 0 2mm 1.2mm; }

  .secao { margin-bottom: 7mm; }
  .secao h3 { font-size: 10.5pt; margin: 0 0 2mm; text-transform: uppercase; page-break-after: avoid; }
  .secao.sub h3 { font-size: 10pt; }
  .grupo { margin-bottom: 4mm; page-break-inside: avoid; }

  /* Última seção (a conclusão) + assinaturas não se separam: sem isso as
     assinaturas podiam ir sozinhas pra uma página nova. */
  .fecho { page-break-inside: avoid; }
  .assinaturas { display: flex; justify-content: space-around; gap: 6mm; margin-top: 22mm; page-break-inside: avoid; text-align: center; font-size: 9pt; line-height: 1.3; }
  .assinatura { flex: 1; max-width: 60mm; }
  .assinatura .linha { border-top: 1px solid #333; margin-bottom: 2mm; }
  .assinatura .empresa { font-weight: bold; font-size: 10pt; }
</style>
</head>
<body>
  <div class="capa">
    <div class="titulo">${comQuebras(c.titulo)}</div>
    <div class="ident">
      ${relatorio.navio ? `<div>Unidade Marítima: ${escapeHtml(relatorio.navio)}</div>` : ''}
      ${c.imo ? `<div>IMO: ${escapeHtml(c.imo)}</div>` : ''}
      ${c.certificadoNumero ? `<div>Certificado Nº: ${escapeHtml(c.certificadoNumero)}</div>` : ''}
    </div>
    <div class="data">
      <div>${escapeHtml(mesAno)}</div>
      <div>${escapeHtml(c.local)}</div>
    </div>
  </div>

  <div class="sumario">
    <h2>SUMÁRIO</h2>
    ${secoes.map((s, i) => !s.numero ? '' : `
      <a href="#secao-${i}" class="${s.sub ? 'sub' : ''}">
        <span class="titulo-item">${s.numero}${s.sub ? '' : '.'} ${escapeHtml(s.titulo)}</span>
        <span class="pontos"></span>
        <span>${paginas[i] ?? ''}</span>
      </a>
    `).join('')}
  </div>

  ${secoes.map((s, i) => `
    ${i === secoes.length - 1 ? '<div class="fecho">' : ''}
    <div class="secao ${s.sub ? 'sub' : ''}" id="secao-${i}">
      ${s.numero ? `<h3>${s.numero} – ${escapeHtml(s.titulo)}</h3>` : ''}
      ${corpoSecao(s)}
    </div>
  `).join('')}

  ${assinaturas.length ? `
    <div class="assinaturas">
      ${assinaturas.map(a => `
        <div class="assinatura">
          <div class="linha"></div>
          ${a.empresa.trim()
            ? `<div class="empresa">${escapeHtml(a.empresa.toUpperCase())}</div>`
            : `${empresaNome ? `<div class="empresa">${escapeHtml(empresaNome)}</div>` : ''}
               ${cnpj ? `<div>CNPJ ${escapeHtml(cnpj)}</div>` : ''}`}
          <div>${escapeHtml(a.nome)}</div>
          <div>${escapeHtml(a.cargo)}</div>
          ${a.registro.trim() ? `<div>${comQuebras(a.registro)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : ''}
  ${secoes.length ? '</div>' : ''}
</body>
</html>`
}

// O Chromium não diz em que página cada seção caiu. Os itens do sumário são
// links (#secao-N) e o PDF guarda o destino de cada link no catálogo (/Dests:
// nome → [página, ...]) — daí sai a página de cada seção. Índice 0 = capa,
// então a página impressa é índice + 1, como nos relatórios em papel.
function paginasDasSecoes(pdfDoc) {
  const indicePorPagina = new Map(pdfDoc.getPages().map((pagina, i) => [pagina.ref.toString(), i]))
  const dests = pdfDoc.catalog.lookup(PDFName.of('Dests'))
  const paginas = {}
  if (!dests) return paginas
  for (const [nome, valor] of dests.entries()) {
    const id = nome.decodeText?.() ?? nome.toString().replace(/^\//, '')
    const encontrado = /^secao-(\d+)$/.exec(id)
    if (!encontrado) continue
    const destino = pdfDoc.context.lookup(valor)
    const refPagina = destino?.get?.(0) ?? destino?.lookup?.(PDFName.of('D'))?.get(0)
    const indice = refPagina ? indicePorPagina.get(refPagina.toString()) : undefined
    if (indice !== undefined) paginas[encontrado[1]] = indice + 1
  }
  return paginas
}

// PDF completo do relatório técnico, em duas passadas: a 1ª só descobre a
// página de cada seção; a 2ª imprime o sumário com os números. O sumário é
// uma página própria (page-break-after), então os números não mexem na
// paginação do resto.
export async function gerarPdfRelatorioTecnico(relatorio) {
  const rascunho = await gerarPdf(htmlRelatorioTecnico(relatorio), { preferCSSPageSize: true })
  const paginas = paginasDasSecoes(await PDFDocument.load(rascunho))
  const conteudo = await gerarPdf(htmlRelatorioTecnico(relatorio, paginas), { preferCSSPageSize: true })
  return aplicarTimbrado(conteudo, relatorio.empresa?.cnpj)
}

const mm = valor => valor * 72 / 25.4

// Desenha o timbrado por baixo de cada página do PDF gerado pelo Chromium
// (que sai com fundo transparente) + o CNPJ no canto de baixo, logo acima da
// faixa laranja, como nos relatórios em papel.
export async function aplicarTimbrado(conteudoBytes, cnpj) {
  const saida = await PDFDocument.create()
  const fundo = await saida.embedJpg(fs.readFileSync(path.resolve('assets/relatorio-tecnico-fundo.jpeg')))
  const fonte = await saida.embedFont(StandardFonts.Helvetica)
  const origem = await PDFDocument.load(conteudoBytes)
  const paginas = await saida.embedPages(origem.getPages())
  const textoCnpj = cnpj ? `CNPJ: ${formatarCnpj(cnpj)}` : ''

  for (const pagina of paginas) {
    const page = saida.addPage([pagina.width, pagina.height])
    page.drawImage(fundo, { x: 0, y: 0, width: pagina.width, height: pagina.height })
    page.drawPage(pagina)
    if (textoCnpj) {
      const largura = fonte.widthOfTextAtSize(textoCnpj, 8)
      page.drawText(textoCnpj, { x: pagina.width - mm(14) - largura, y: mm(29), size: 8, font: fonte, color: rgb(0.1, 0.1, 0.1) })
    }
  }
  return saida.save()
}

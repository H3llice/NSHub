import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

const prisma = new PrismaClient()

// ===== EXTRAÇÃO POR POSIÇÃO (x,y) DAS CAIXAS DE TEXTO DO .docm =====
// O certificado NÃO tem rótulo de campo nenhum no texto (testado com
// mammoth.extractRawText) nem Content Control/bookmark no XML — é uma pilha
// de ~86 caixas de texto flutuantes ("Caixa de texto NNN", nome sem
// significado), sem tabela (confirmado com mammoth.convertToHtml: 0 <table>).
// A ORDEM dessas caixas no XML é arbitrária e varia entre arquivos, mas a
// POSIÇÃO (x,y) de cada uma é estável — bate quase pixel-perfeito entre
// arquivos diferentes, e bate com as constantes já usadas pra desenhar o PDF
// (CAMPOS_CERTIFICADO em routes/certificados.js, KIT_LINHA_Y0 etc em
// routes/relatorios.js) — ambas vêm do mesmo template original.
// .docm é um zip — usa jszip (puro JS, sem depender do comando `unzip` do
// sistema, que não existe por padrão num Windows Server sem Git Bash).
const EMU_POR_MM = 36000

async function extrairCamposPosicionais(caminhoDocm) {
    const buffer = fs.readFileSync(caminhoDocm)
    const zip = await JSZip.loadAsync(buffer)
    const arquivoXml = zip.file('word/document.xml')
    if (!arquivoXml) return []
    const xml = await arquivoXml.async('string')

    const campos = []
    const blocos = xml.split('<w:drawing>').slice(1)
    for (const blocoBruto of blocos) {
        const bloco = blocoBruto.split('</w:drawing>')[0]
        const mH = bloco.match(/<wp:positionH[^>]*>\s*<wp:posOffset>(-?\d+)<\/wp:posOffset>/)
        const mV = bloco.match(/<wp:positionV[^>]*>\s*<wp:posOffset>(-?\d+)<\/wp:posOffset>/)
        if (!mH || !mV) continue // ancorado por alinhamento (ex: número do certificado, centralizado) em vez de offset — não usado na migração, número vem do nome do arquivo
        const xMm = parseInt(mH[1]) / EMU_POR_MM
        const yMm = parseInt(mV[1]) / EMU_POR_MM

        const txbx = bloco.match(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/)
        if (!txbx) continue
        const texto = [...txbx[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim()
        campos.push({ xMm, yMm, texto })
    }
    return campos
}

// ===== TABELA DE POSIÇÕES CONHECIDAS =====
// Reaproveita exatamente as coordenadas/fórmulas já usadas pra desenhar o PDF
// (routes/certificados.js e routes/relatorios.js) — geradas por linha/coluna
// em vez de copiadas uma a uma, pros itens em grade (kit, componentes, testes,
// cilindro). tol = tolerância em mm; a coluna Validade do kit usa faixa de X
// em vez de posição fixa, porque a caixa parece crescer/alinhar à direita.
function gerarSlots() {
    const slots = []

    // --- Página 1 ---
    const CAMPOS_PAGINA1 = [
        ['navio', 31.3, 122.4], ['portoRegistro', 125.0, 124.9],
        ['telefone', 124.9, 133.3], ['email', 29.3, 144.7],
        ['equipNumeroSerie', 126.3, 144.5], ['equipTipo', 43.0, 155.9], ['equipCapacidade', 128.9, 155.3],
        ['equipModelo', 42.2, 167.4],
        ['equipFabricante', 41.1, 177.5], ['equipAnoFabricacao', 132.7, 178.6],
        ['dataEmissao', 120.1, 193.7],
    ]
    for (const [campo, x, y] of CAMPOS_PAGINA1) slots.push({ campo, x, y, tolX: 4, tolY: 2 })
    // armador e classe têm caixa que parece crescer/alinhar de forma variável
    // (visto: "CLASSE II PACK B" em x=111.7 vs só "II" em x=120.2 num arquivo
    // de 2023) — tolerância bem mais larga, sem risco de colidir com outro
    // campo porque não tem nada perto (verificado nos exemplos testados).
    slots.push({ campo: 'armador', x: 29.2, y: 135.5, tolX: 10, tolY: 5 })
    slots.push({ campo: 'equipClasse', x: 116, y: 167.0, tolX: 15, tolY: 2 })

    // --- Kit de sobrevivência (11 linhas x 3 colunas) ---
    const KIT_ITENS_ORDEM = ['foguetes', 'fachos', 'fumigeno', 'pilhas', 'racoesSolidas', 'racoesLiquidas',
        'medicamentos', 'pesca', 'reparos', 'enjoo', 'bateriaResgate']
    const KIT_LINHA_Y0 = 31.1, KIT_LINHA_PASSO = 4.46
    KIT_ITENS_ORDEM.forEach((chave, i) => {
        const y = KIT_LINHA_Y0 + i * KIT_LINHA_PASSO
        slots.push({ campo: `${chave}Qtd`, x: 7.3, y, tolX: 5, tolY: 2 })
        slots.push({ campo: `${chave}Substituido`, x: 129.8, y, tolX: 4, tolY: 2 })
        // faixa de X em vez de ponto fixo — caixa da Validade varia de ~148 a ~158mm
        slots.push({ campo: `${chave}Validade`, x: 153, y, tolX: 12, tolY: 2 })
    })

    // --- Checklist de componentes (16, em 3 colunas de 6/6/4) ---
    const COMPONENTES_COLUNAS = [
        { x: 6.0, chaves: ['ancoraFlutuante', 'remos', 'quadroSinais', 'facaCaboFlutuante', 'espelhoSinalizacao', 'copoGraduado'] },
        { x: 70.0, chaves: ['aroFlutuante', 'jarrosAgua', 'documentacao', 'lanternaEstanque', 'apito', 'protecaoTermica'] },
        { x: 127.8, chaves: ['esponja', 'refletorRadar', 'abridorLatas', 'foleManual'] },
    ]
    const COMPONENTES_LINHA_Y0 = 93.2, COMPONENTES_LINHA_PASSO = 4.46
    COMPONENTES_COLUNAS.forEach(coluna => {
        coluna.chaves.forEach((chave, i) => {
            slots.push({ campo: chave, x: coluna.x, y: COMPONENTES_LINHA_Y0 + i * COMPONENTES_LINHA_PASSO, tolX: 3, tolY: 2 })
        })
    })

    // --- Teste dos flutuadores ---
    const TESTES_FLUTUADOR_ORDEM = ['nap', 'wp', 'gi', 'fs', 'ol']
    const TESTES_LINHA_Y0 = 129.1, TESTES_LINHA_PASSO = 4.375
    TESTES_FLUTUADOR_ORDEM.forEach((chave, i) => {
        slots.push({ campo: `${chave}Realizado`, x: 103.0, y: TESTES_LINHA_Y0 + i * TESTES_LINHA_PASSO, tolX: 3, tolY: 2 })
    })
    slots.push({ campo: '_testeValor', x: 141, y: 132.6, tolX: 6, tolY: 2 })
    slots.push({ campo: 'temperatura', x: 142.9, y: 141.1, tolX: 4, tolY: 2 })

    // --- Cilindro (1º cilindro só — papel só tem espaço pra 1) ---
    const CIL_ESQ = 47.4, CIL_DIR = 142.9
    const CIL_Y = [154.1, 159.1, 164.4, 169.3]
    slots.push({ campo: '_cilNumero', x: CIL_ESQ, y: CIL_Y[0], tolX: 4, tolY: 2 })
    slots.push({ campo: '_cilValvula', x: CIL_DIR, y: CIL_Y[0], tolX: 4, tolY: 2 })
    slots.push({ campo: '_cilTeste', x: CIL_ESQ, y: CIL_Y[1], tolX: 4, tolY: 2 })
    slots.push({ campo: '_cilCarga', x: CIL_DIR, y: CIL_Y[1], tolX: 4, tolY: 2 })
    slots.push({ campo: '_cilCargaCO2', x: CIL_ESQ, y: CIL_Y[2], tolX: 4, tolY: 2 })
    slots.push({ campo: '_cilCargaN2', x: CIL_DIR, y: CIL_Y[2], tolX: 4, tolY: 2 })
    slots.push({ campo: '_cilFabricante', x: CIL_ESQ, y: CIL_Y[3], tolX: 4, tolY: 2 })
    slots.push({ campo: '_cilAnoFabricacao', x: CIL_DIR, y: CIL_Y[3], tolX: 4, tolY: 2 })

    // --- Observações (texto livre, "EM ATENDIMENTO À NORMAM..." etc) ---
    slots.push({ campo: '_observacoesPagina2', x: 6.5, y: 205.8, tolX: 15, tolY: 8 })

    // --- Rodapé ---
    slots.push({ campo: '_dataAtendimento', x: 139.7, y: 243.7, tolX: 4, tolY: 2 })
    slots.push({ campo: '_nomeAtendente', x: 51.4, y: 259.4, tolX: 6, tolY: 2 })
    slots.push({ campo: 'tecnicoNome', x: 113.5, y: 250.5, tolX: 6, tolY: 2 })

    return slots
}

// Acha, pra cada caixa extraída, o slot conhecido mais próximo dentro da
// tolerância — evita depender da ordem em que as caixas aparecem no XML.
function mapearCampos(camposPosicionais, slots) {
    const valores = {}
    const naoReconhecidos = []

    for (const caixa of camposPosicionais) {
        let melhor = null, melhorDist = Infinity
        for (const slot of slots) {
            const dx = Math.abs(caixa.xMm - slot.x)
            const dy = Math.abs(caixa.yMm - slot.y)
            if (dx > slot.tolX || dy > slot.tolY) continue
            const dist = dx * dx + dy * dy
            if (dist < melhorDist) { melhorDist = dist; melhor = slot }
        }
        if (melhor) {
            if (valores[melhor.campo] !== undefined) {
                naoReconhecidos.push({ ...caixa, motivo: `colidiu com campo já preenchido "${melhor.campo}"` })
            } else {
                valores[melhor.campo] = caixa.texto
            }
        } else if (caixa.texto) {
            naoReconhecidos.push(caixa)
        }
    }
    return { valores, naoReconhecidos }
}

// Artefato de template visto em todos os exemplos testados, sempre grudado
// no valor do Armador (ex: "WILSON SONS LTDAaNAADAHA", ou só "...PINHEIRO a"
// em arquivos mais antigos onde só metade do artefato ficou perto o
// suficiente pra entrar na mesma caixa) — não é digitação do usuário.
function limparArmador(texto) {
    if (!texto) return texto
    // nome do armador sempre sai em CAIXA ALTA no original — um "a" minúsculo
    // sobrando no fim (colado ou com espaço) é sempre esse artefato, nunca
    // parte do nome de verdade.
    return texto.replace(/a?NAADAHA\s*$/i, '').replace(/\s*a\s*$/, '').trim()
}

// ===== NOME DO ARQUIVO → número, navio, cancelado =====
function parsearNomeArquivo(caminho) {
    let base = path.basename(caminho, path.extname(caminho))
    // prefixo "CERT." / "CERTIFICADO" antes do número, visto em vários arquivos de 2023
    base = base.replace(/^CERT(IFICADO)?\.?\s*/i, '')

    let numero, resto
    const matchInicio = base.match(/^(\d+)/)
    if (matchInicio) {
        numero = parseInt(matchInicio[1])
        resto = base.slice(matchInicio[0].length).replace(/^\s*-\s*/, '').trim()
    } else {
        // número não tá no começo (ex: "BORANDA 3257", "ISABEL 3208") — procura
        // um token numérico isolado de 3 a 5 dígitos (tamanho plausível de
        // número de certificado). Se achar mais de um candidato, não arrisca
        // escolher — deixa pra revisão manual (ex: número de série da balsa
        // também é um token de dígitos, junto no nome).
        const candidatos = [...base.matchAll(/(?<![\d.])\b(\d{3,5})\b(?![\d.])/g)]
        if (candidatos.length !== 1) return null
        numero = parseInt(candidatos[0][1])
        resto = (base.slice(0, candidatos[0].index) + base.slice(candidatos[0].index + candidatos[0][0].length))
            .replace(/\s+/g, ' ').replace(/^\s*-\s*|-\s*$/g, '').trim()
    }

    const cancelado = /\(\s*cancelado\s*\)|-\s*cancelado\s*$/i.test(resto)
    resto = resto.replace(/\(\s*cancelado\s*\)/i, '').replace(/-\s*cancelado\s*$/i, '').trim()

    return { numero, navio: resto, cancelado }
}

// ===== ANO A PARTIR DA PASTA =====
function determinarAno(caminho) {
    const m = caminho.match(/(\d{4})/)
    return m ? parseInt(m[1]) : null
}

// ===== LISTAGEM RECURSIVA =====
function listarArquivos(dir, lista = []) {
    for (const item of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, item)
        if (item === 'HONG KONG 2026') continue // numeração própria, sem .docm
        if (fs.statSync(fullPath).isDirectory()) {
            listarArquivos(fullPath, lista)
        } else if (item.toLowerCase().endsWith('.docm') && !item.startsWith('~$') && !/modelo certificado/i.test(item)) {
            lista.push(fullPath)
        }
    }
    return lista
}

// ===== DATAS =====
// dataEmissao vem como DD/MM/YYYY; datas de validade dos itens do kit e ano
// de fabricação vêm como MM/YYYY (texto livre — igual ao Relatorio de verdade,
// não convertido pra Date). validade do Certificado nunca é impressa no papel
// (só "1 (um) ANO" fixo) — calculada aqui como dataEmissao + 1 ano.
function parseDataEmissao(texto) {
    // barra duplicada ou faltando por erro de digitação no original acontece
    // (ex: "25/02//2026", "26/082025")
    const m = texto?.match(/(\d{2})\/*(\d{2})\/*(\d{4})/)
    if (!m) return null
    return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])))
}
function validadePadrao(dataEmissao) {
    if (!dataEmissao) return null
    const d = new Date(Date.UTC(dataEmissao.getUTCFullYear() + 1, dataEmissao.getUTCMonth(), dataEmissao.getUTCDate()))
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function paraNumero(texto) {
    if (!texto) return null
    const limpo = texto.replace(/[^\d.,-]/g, '').replace(',', '.')
    const n = parseFloat(limpo)
    return isNaN(n) ? null : n
}

// Checkbox S/N — algumas caixas têm mais de um parágrafo colado sem separador
// (ex: "SS", artefato de edição), então olha só a primeira letra em vez de
// comparar a string inteira.
function ehSim(texto) {
    return texto?.trim().toUpperCase().startsWith('S') ?? false
}

// ===== MONTA O REGISTRO DO CERTIFICADO A PARTIR DOS VALORES POSICIONAIS =====
function montarCertificado(numero, ano, navio, cancelado, valores) {
    // se o campo principal de data de emissão não bateu com nenhuma caixa,
    // usa a Data de Atendimento do rodapé — em todos os exemplos conferidos
    // as duas datas são sempre iguais.
    const dataEmissao = parseDataEmissao(valores.dataEmissao) || parseDataEmissao(valores._dataAtendimento)

    const KIT_ITENS_ORDEM = ['foguetes', 'fachos', 'fumigeno', 'pilhas', 'racoesSolidas', 'racoesLiquidas',
        'medicamentos', 'pesca', 'reparos', 'enjoo', 'bateriaResgate']
    const COMPONENTES_CHAVES = ['ancoraFlutuante', 'remos', 'quadroSinais', 'facaCaboFlutuante', 'espelhoSinalizacao', 'copoGraduado',
        'aroFlutuante', 'jarrosAgua', 'documentacao', 'lanternaEstanque', 'apito', 'protecaoTermica',
        'esponja', 'refletorRadar', 'abridorLatas', 'foleManual']
    const TESTES_ORDEM = ['nap', 'wp', 'gi', 'fs', 'ol']

    const dadosTecnicos = { tecnicoNome: valores.tecnicoNome || null }
    KIT_ITENS_ORDEM.forEach(chave => {
        dadosTecnicos[`${chave}Qtd`] = valores[`${chave}Qtd`] ? paraNumero(valores[`${chave}Qtd`]) : null
        dadosTecnicos[`${chave}Substituido`] = valores[`${chave}Substituido`]?.trim().toUpperCase().startsWith('S') ?? false
        dadosTecnicos[`${chave}Validade`] = valores[`${chave}Validade`]?.trim() || null
    })
    COMPONENTES_CHAVES.forEach(chave => {
        dadosTecnicos[chave] = valores[chave]?.trim().toUpperCase().startsWith('S') ?? false
    })
    TESTES_ORDEM.forEach(chave => {
        dadosTecnicos[`${chave}Realizado`] = valores[`${chave}Realizado`]?.trim().toUpperCase().startsWith('S') ?? false
        dadosTecnicos[`${chave}Valor`] = paraNumero(valores._testeValor)
    })
    dadosTecnicos.temperatura = valores.temperatura || null
    dadosTecnicos.observacoes = valores._observacoesPagina2?.trim() || null
    dadosTecnicos.cilindros = [{
        numero: valores._cilNumero || null,
        valvulaNumero: valores._cilValvula || null,
        teste: valores._cilTeste || null,
        carga: paraNumero(valores._cilCarga),
        cargaCO2: paraNumero(valores._cilCargaCO2),
        cargaN2: paraNumero(valores._cilCargaN2),
        fabricante: valores._cilFabricante || null,
        anoFabricacao: valores._cilAnoFabricacao || null,
    }]

    const observacoesPartes = []
    if (valores._nomeAtendente) observacoesPartes.push(`Atendido por: ${valores._nomeAtendente.trim()}`)
    observacoesPartes.push('Migrado do sistema antigo (.docm).')

    return {
        numero, ano,
        navio: navio || null,
        _navioDocm: valores.navio || null, // só pra comparar com o nome do arquivo no relatório — não é coluna, removido antes de gravar
        armador: limparArmador(valores.armador) || null,
        portoRegistro: valores.portoRegistro || null,
        telefone: valores.telefone || null,
        email: valores.email || null,
        equipTipo: valores.equipTipo || null,
        equipNumeroSerie: valores.equipNumeroSerie || null,
        equipAnoFabricacao: valores.equipAnoFabricacao || null,
        equipFabricante: valores.equipFabricante || null,
        equipModelo: valores.equipModelo || null,
        equipClasse: valores.equipClasse || null,
        equipCapacidade: valores.equipCapacidade ? parseInt(valores.equipCapacidade) || null : null,
        dataEmissao,
        validade: validadePadrao(dataEmissao),
        observacoes: observacoesPartes.join(' '),
        status: cancelado ? 'cancelado' : 'migrado',
        dadosTecnicos,
    }
}

// ===== MODO DEBUG (1 arquivo só, sem tocar no banco) =====
async function debugArquivo(filePath) {
    const nome = parsearNomeArquivo(filePath)
    const ano = determinarAno(filePath)
    console.log('nome parseado:', nome, 'ano:', ano)

    const slots = gerarSlots()
    const camposPosicionais = await extrairCamposPosicionais(filePath)
    const { valores, naoReconhecidos } = mapearCampos(camposPosicionais, slots)
    const dados = montarCertificado(nome.numero, ano, nome.navio, nome.cancelado, valores)

    console.log('\n--- valores mapeados (brutos) ---')
    console.log(valores)
    console.log('\n--- certificado montado ---')
    console.log(JSON.stringify(dados, null, 2))
    console.log('\n--- caixas não reconhecidas (não bateram com nenhum slot, e não estão vazias) ---')
    for (const c of naoReconhecidos) {
        if (c.texto) console.log(`  (${c.xMm.toFixed(1)},${c.yMm.toFixed(1)}) "${c.texto}" ${c.motivo || ''}`)
    }
    console.log(`\ntotal caixas extraídas: ${camposPosicionais.length}, mapeadas: ${Object.keys(valores).length}`)
}

// ===== EXECUÇÃO =====
const ARQUIVO_DEBUG = (() => {
    const idx = process.argv.indexOf('--arquivo')
    return idx >= 0 ? process.argv[idx + 1] : null
})()
if (ARQUIVO_DEBUG) {
    await debugArquivo(ARQUIVO_DEBUG)
    process.exit(0)
}

const COMMIT = process.argv.includes('--commit')
const LIMITE = (() => {
    const idx = process.argv.indexOf('--limite')
    return idx >= 0 ? parseInt(process.argv[idx + 1]) : null
})()

async function migrar() {
    const pastaRaiz = path.resolve('migracao/certificados')
    let arquivos = listarArquivos(pastaRaiz)
    if (LIMITE) arquivos = arquivos.slice(0, LIMITE)

    console.log(`\n📁 ${arquivos.length} arquivo(s) .docm encontrados${COMMIT ? ' — MODO COMMIT (vai gravar no banco)' : ' — DRY RUN (não grava nada)'}\n`)

    const slots = gerarSlots()
    const relatorio = { sucesso: [], pulado: [], erro: [], avisos: [] }

    const empresa = await prisma.empresa.findFirst({ orderBy: { id: 'asc' } })
    if (!empresa) { console.log('❌ Nenhuma Empresa cadastrada no banco — cancelando.'); await prisma.$disconnect(); return }

    for (const filePath of arquivos) {
        const nomeArquivo = path.relative(pastaRaiz, filePath)
        try {
            const nome = parsearNomeArquivo(filePath)
            if (!nome) { relatorio.erro.push({ arquivo: nomeArquivo, motivo: 'Número não identificado no nome do arquivo' }); continue }

            const ano = determinarAno(filePath)
            if (!ano) { relatorio.erro.push({ arquivo: nomeArquivo, motivo: 'Ano não identificado (pasta)' }); continue }

            const existente = await prisma.certificado.findFirst({ where: { numero: nome.numero, ano } })
            if (existente) { relatorio.pulado.push({ arquivo: nomeArquivo, motivo: `Certificado ${nome.numero}/${ano} já existe (id ${existente.id})` }); continue }

            const camposPosicionais = await extrairCamposPosicionais(filePath)
            const { valores, naoReconhecidos } = mapearCampos(camposPosicionais, slots)
            const dados = montarCertificado(nome.numero, ano, nome.navio, nome.cancelado, valores)
            dados.empresaId = empresa.id

            if (!dados.dataEmissao) {
                relatorio.erro.push({ arquivo: nomeArquivo, motivo: 'Data de emissão não encontrada/reconhecida' })
                continue
            }

            // Navio do nome do arquivo (usado como valor oficial, por pedido do
            // usuário) pode divergir do navio escrito dentro do documento —
            // sinaliza pra conferência manual, não bloqueia a importação.
            const navioDocm = dados._navioDocm
            delete dados._navioDocm
            if (navioDocm && dados.navio && navioDocm.toUpperCase() !== dados.navio.toUpperCase()) {
                relatorio.avisos.push({ arquivo: nomeArquivo, motivo: `Nome do arquivo diz "${dados.navio}", mas o documento diz "${navioDocm}" — confira qual está certo` })
            }

            if (COMMIT) {
                const criado = await prisma.certificado.create({ data: dados })
                relatorio.sucesso.push({ arquivo: nomeArquivo, id: criado.id, numero: criado.numero, ano: criado.ano })
            } else {
                relatorio.sucesso.push({
                    arquivo: nomeArquivo,
                    preview: {
                        numero: dados.numero, ano: dados.ano, status: dados.status,
                        navio: dados.navio, armador: dados.armador, portoRegistro: dados.portoRegistro,
                        equipTipo: dados.equipTipo, equipModelo: dados.equipModelo, equipCapacidade: dados.equipCapacidade,
                        dataEmissao: dados.dataEmissao?.toISOString().slice(0, 10), validade: dados.validade,
                    },
                    naoReconhecidos: naoReconhecidos.filter(c => c.texto).map(c => `(${c.xMm.toFixed(1)},${c.yMm.toFixed(1)}) "${c.texto}"`),
                })
            }
        } catch (e) {
            relatorio.erro.push({ arquivo: nomeArquivo, motivo: e.message })
        }
    }

    console.log('\n========== RELATÓRIO ==========')
    console.log(`✅ ${COMMIT ? 'Criados' : 'OK (preview)'}: ${relatorio.sucesso.length}`)
    console.log(`⏭️  Pulados (já existiam): ${relatorio.pulado.length}`)
    console.log(`⚠️  Avisos (navio do arquivo ≠ navio do documento): ${relatorio.avisos.length}`)
    console.log(`❌ Erro: ${relatorio.erro.length}`)

    if (relatorio.erro.length > 0) {
        console.log('\n❌ ERROS:')
        relatorio.erro.forEach(r => console.log(`  - ${r.arquivo}: ${r.motivo}`))
    }
    if (relatorio.avisos.length > 0) {
        console.log('\n⚠️  AVISOS:')
        relatorio.avisos.forEach(r => console.log(`  - ${r.arquivo}: ${r.motivo}`))
    }

    fs.writeFileSync('scripts/relatorio-migracao-certificados.json', JSON.stringify(relatorio, null, 2))
    console.log('\n📄 Relatório completo salvo em scripts/relatorio-migracao-certificados.json')

    await prisma.$disconnect()
}

migrar()

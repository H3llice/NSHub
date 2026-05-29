import mammoth from 'mammoth'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

// ===== EXTRAI TEXTO DO DOCX =====
async function extrairTexto(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath })
        return result.value
    } catch {
        return null
    }
}

// ===== PARSEIA OS DADOS DO TEXTO =====
function parsearOC(texto, nomeArquivo) {
    const dados = {}

    // Fornecedor
    const empresa = texto.match(/Empresa\s+(.+)/i)
    if (empresa) dados.fornecedorNome = empresa[1].trim()

    const endereco = texto.match(/Endereco\s+(.+)/i)
    if (endereco) dados.fornecedorEndereco = endereco[1].trim()

    const cidadeCep = texto.match(/Cidade e CEP\s+(.+)/i)
    if (cidadeCep) dados.fornecedorCidade = cidadeCep[1].trim()

    const cnpj = texto.match(/C N P J\s+(.+)/i)
    if (cnpj) dados.fornecedorDocumento = cnpj[1].trim().replace(/\D/g, '')

    const telefone = texto.match(/Telefone\s+(.+)/i)
    if (telefone) dados.fornecedorTelefone = telefone[1].trim()

    const vendedor = texto.match(/Vendedor\s+(.+)/i)
    if (vendedor) dados.vendedor = vendedor[1].trim()

    // Datas e condições
    const dataPedido = texto.match(/Data Pedido\s+(\d{2}\/\d{2}\/\d{4})/i)
    if (dataPedido) {
        const [dia, mes, ano] = dataPedido[1].split('/')
        dados.dataPedido = new Date(`${ano}-${mes}-${dia}`).toISOString()
    }

    const condicoes = texto.match(/Condicoes Pagto\s+(.+)/i)
    if (condicoes) dados.condicoesPagto = condicoes[1].trim()

    const formaPagto = texto.match(/Forma de Pagto\s+(.+)/i)
    if (formaPagto) dados.formaPagto = formaPagto[1].trim()

    const prazo = texto.match(/Prazo de entrega\s+(.+)/i)
    if (prazo) dados.prazoEntrega = prazo[1].trim()

    // Instruções
    const instrucoes = texto.match(/Instrucoes ou Condiçoes Especias\s+(.+)/is)
    if (instrucoes) dados.instrucoes = instrucoes[1].split('\n')[0].trim()

    return dados
}

// ===== VARRE PASTA RECURSIVAMENTE =====
function listarArquivos(dir, lista = []) {
    const itens = fs.readdirSync(dir)
    for (const item of itens) {
        const fullPath = path.join(dir, item)
        if (fs.statSync(fullPath).isDirectory()) {
            listarArquivos(fullPath, lista)
        } else if (item.toLowerCase().endsWith('.docx')) {
            lista.push(fullPath)
        }
    }
    return lista
}

// ===== EXTRAI NÚMERO, FORNECEDOR E SIGLA DO NOME DO ARQUIVO =====
function parsearNomeArquivo(nomeArquivo) {
    const base = path.basename(nomeArquivo, '.docx')

    // Ignora arquivos temporários do Word
    if (base.startsWith('~$') || base.startsWith('~')) return { numero: null, sigla: null }

    // Remove prefixos tipo "O.C ", "OC ", "O,C "
    const semPrefixo = base.replace(/^O[.,]?\s*C\.?\s*/i, '').trim()

    // Extrai número
    const matchNumero = semPrefixo.match(/^(\d+)/)
    const numero = matchNumero ? parseInt(matchNumero[1]) : null

    // Pega a última parte após o último hífen
    const partes = semPrefixo.split(/\s*[-–]\s*/)
    let sigla = partes[partes.length - 1]?.trim().toUpperCase() || null

    // Remove sufixos numéricos e de embarcação (NS 206, RS..)
    if (sigla) sigla = sigla.replace(/\s*[\d.]+.*$/, '').trim()
    if (sigla) sigla = sigla.replace(/\(.*\)/, '').trim()

    // Mapeamento de siglas alternativas
    const mapa = {
        'NM': 'NM',
        'NSB': 'SN',
        'SS': 'SS',
    }
    if (sigla && mapa[sigla]) sigla = mapa[sigla]

    // Se sigla não reconhecida, usa SN
    const siglasValidas = ['NS', 'NSM', 'RS', 'NSRS', 'SN', 'SS', 'NM']
    if (!sigla || !siglasValidas.includes(sigla)) sigla = 'SN'

    return { numero, sigla }
}

// ===== MIGRAÇÃO =====
async function migrar() {
    const pastaRaiz = path.resolve('migracao')
    const arquivos = listarArquivos(pastaRaiz)

    console.log(`\n📁 Encontrados ${arquivos.length} arquivos .docx\n`)

    const relatorio = { sucesso: [], parcial: [], erro: [] }

    for (const filePath of arquivos) {
        const nomeArquivo = path.basename(filePath)
        const { numero, sigla } = parsearNomeArquivo(filePath)

        if (!numero) {
            relatorio.erro.push({ arquivo: nomeArquivo, motivo: 'Número não identificado no nome do arquivo' })
            continue
        }

        // Busca empresa pela sigla
        if (!sigla) {
            relatorio.erro.push({ arquivo: nomeArquivo, motivo: 'Sigla não identificada no nome do arquivo' })
            continue
        }
        const empresa = await prisma.empresa.findFirst({ where: { sigla: { equals: sigla, mode: 'insensitive' } } })
        if (!empresa) {
            relatorio.erro.push({ arquivo: nomeArquivo, motivo: `Sigla "${sigla}" não encontrada no banco` })
            continue
        }

        // Extrai texto do docx
        const texto = await extrairTexto(filePath)
        const dados = texto ? parsearOC(texto, nomeArquivo) : {}

        // Busca ou cria fornecedor
        let fornecedor = null
        if (dados.fornecedorNome) {
            fornecedor = await prisma.fornecedor.findFirst({
                where: { nome: { equals: dados.fornecedorNome, mode: 'insensitive' } }
            })
            if (!fornecedor) {
                fornecedor = await prisma.fornecedor.create({
                    data: {
                        nome: dados.fornecedorNome,
                        endereco: dados.fornecedorEndereco || null,
                        cidade: dados.fornecedorCidade || null,
                        documento: dados.fornecedorDocumento || null,
                        telefone: dados.fornecedorTelefone || null,
                    }
                })
            }
        }

        if (!fornecedor) {
            relatorio.erro.push({ arquivo: nomeArquivo, motivo: 'Fornecedor não identificado' })
            continue
        }

        // Verifica se OC já existe
        const ano = dados.dataPedido ? new Date(dados.dataPedido).getFullYear() : new Date().getFullYear()
        const ocExistente = await prisma.ordemCompra.findFirst({
            where: { numero, ano, empresaId: empresa.id }
        })

        if (ocExistente) {
            relatorio.parcial.push({ arquivo: nomeArquivo, motivo: 'OC já existe no banco' })
            continue
        }

        // Cria a OC
        const oc = await prisma.ordemCompra.create({
            data: {
                numero,
                ano,
                empresaId: empresa.id,
                fornecedorId: fornecedor.id,
                dataPedido: dados.dataPedido || new Date().toISOString(),
                condicoesPagto: dados.condicoesPagto || null,
                formaPagto: dados.formaPagto || null,
                prazoEntrega: dados.prazoEntrega || null,
                instrucoes: dados.instrucoes || null,
                solicitante: dados.vendedor || null,
                status: 'migrada',
            }
        })

        // Anexa o PDF se existir
        // Tenta encontrar o PDF no mesmo diretório
        const pdfPath = filePath.replace('.docx', '.pdf')
        console.log('Procurando PDF:', pdfPath, '- existe:', fs.existsSync(pdfPath))

        // Tenta também com nome diferente de capitalização
        const pdfPathAlt = filePath.replace('.docx', '.PDF')
        const pdfFinal = fs.existsSync(pdfPath) ? pdfPath : fs.existsSync(pdfPathAlt) ? pdfPathAlt : null
        if (pdfFinal) {
            const nomeDestino = `migrado-${oc.id}-${path.basename(pdfFinal)}`
            const destino = path.resolve(`uploads/${nomeDestino}`)
            fs.copyFileSync(pdfFinal, destino)

            await prisma.anexo.create({
                data: {
                    ocId: oc.id,
                    nomeOriginal: path.basename(pdfFinal),
                    nomeArquivo: nomeDestino,
                    tipo: 'documento_original',
                    mimeType: 'application/pdf',
                }
            })
        }

        const extraiu = Object.keys(dados).length > 2
        if (extraiu) {
            relatorio.sucesso.push(nomeArquivo)
        } else {
            relatorio.parcial.push({ arquivo: nomeArquivo, motivo: 'Dados extraídos parcialmente' })
        }

        process.stdout.write(`✅ ${nomeArquivo}\n`)
    }

    // Relatório final
    console.log('\n========== RELATÓRIO ==========')
    console.log(`✅ Sucesso completo: ${relatorio.sucesso.length}`)
    console.log(`⚠️  Parcial: ${relatorio.parcial.length}`)
    console.log(`❌ Erro: ${relatorio.erro.length}`)

    if (relatorio.parcial.length > 0) {
        console.log('\n⚠️  PARCIAIS:')
        relatorio.parcial.forEach(r => console.log(`  - ${r.arquivo}: ${r.motivo}`))
    }

    if (relatorio.erro.length > 0) {
        console.log('\n❌ ERROS:')
        relatorio.erro.forEach(r => console.log(`  - ${r.arquivo}: ${r.motivo}`))
    }

    // Salva relatório em arquivo
    fs.writeFileSync(
        'scripts/relatorio-migracao.json',
        JSON.stringify(relatorio, null, 2)
    )
    console.log('\n📄 Relatório salvo em scripts/relatorio-migracao.json')

    await prisma.$disconnect()
}

migrar().catch(console.error)
// Importa clientes a partir de um XML exportado do sistema antigo (Cliente.xml).
// Uso: node scripts/importar-clientes.js [caminho-do-xml]
// Sem argumento, procura em %USERPROFILE%\Downloads\Cliente.xml
//
// Regras de dedupe:
// - cpfCnpj é @unique no schema — clientes sem CNPJ/CPF no XML não têm como
//   ser importados como estão. Eles são pulados e listados no relatório
//   final (scripts/relatorio-importacao-clientes.json) pra cadastro manual.
// - Quando o mesmo CNPJ aparece em mais de um <cliente> do XML (reflete
//   recadastros do mesmo cliente ao longo do tempo no sistema antigo, às
//   vezes com nome ou endereço diferente), mantém só o registro com a
//   DataCriacao mais recente.
// - Clientes cujo CNPJ já existe no banco são pulados (idempotente — pode
//   rodar de novo sem duplicar).

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const TAGS = [
  'Nome', 'RazaoSocial', 'CNPJ', 'DataCriacao', 'Status', 'InscricaoEstadual',
  'DataAniversario', 'CEP', 'Estado', 'Cidade', 'Endereco', 'Numero', 'Bairro',
  'Complemento', 'Emailprincipal', 'TelefonePrincipal', 'NomeContato', 'EmailContato'
]

function decodeEntidades(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extrairTag(bloco, tag) {
  const m = bloco.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return m ? decodeEntidades(m[1]).trim() : ''
}

function parsearXml(caminho) {
  const xml = fs.readFileSync(caminho, 'utf8')
  const blocos = xml.match(/<cliente>[\s\S]*?<\/cliente>/g) || []

  return blocos.map(bloco => {
    const registro = {}
    for (const tag of TAGS) registro[tag] = extrairTag(bloco, tag)
    return registro
  })
}

// DataCriacao vem como DD/MM/YYYY — sem isso não dá pra comparar datas direto
function parsearData(dataCriacao) {
  const m = dataCriacao.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, dia, mes, ano] = m
  return new Date(`${ano}-${mes}-${dia}`)
}

// endereco no nosso schema é um campo de texto livre único (sem CEP/bairro
// separados) — junta tudo que o XML trouxer numa linha legível
function montarEndereco(r) {
  const partes = []
  if (r.Endereco) partes.push(r.Numero ? `${r.Endereco}, ${r.Numero}` : r.Endereco)
  if (r.Bairro) partes.push(r.Bairro)

  let endereco = partes.join(' - ')
  if (r.Complemento) endereco += (endereco ? ' ' : '') + `(${r.Complemento})`
  if (r.CEP) endereco += (endereco ? ', ' : '') + `CEP ${r.CEP}`

  return endereco || null
}

function montarCidade(r) {
  if (!r.Cidade) return null
  return r.Estado ? `${r.Cidade}/${r.Estado}` : r.Cidade
}

async function importar(caminhoXml) {
  const registros = parsearXml(caminhoXml)
  console.log(`\n📁 Lidos ${registros.length} clientes do XML\n`)

  const semDocumento = []
  const porCnpj = new Map()

  for (const r of registros) {
    const digitos = r.CNPJ.replace(/\D/g, '')
    if (!digitos) {
      semDocumento.push({ nome: r.RazaoSocial || r.Nome, cidade: r.Cidade || null, dataCriacao: r.DataCriacao || null })
      continue
    }

    const existente = porCnpj.get(digitos)
    if (!existente) {
      porCnpj.set(digitos, r)
      continue
    }

    const dataAtual = parsearData(r.DataCriacao)
    const dataExistente = parsearData(existente.DataCriacao)

    // Sem data em um dos dois pra comparar, prevalece o que tiver mais campos preenchidos
    const substituir = dataAtual && dataExistente
      ? dataAtual > dataExistente
      : TAGS.filter(tag => r[tag]).length > TAGS.filter(tag => existente[tag]).length

    if (substituir) porCnpj.set(digitos, r)
  }

  const duplicadosNoXml = registros.length - semDocumento.length - porCnpj.size
  console.log(`${porCnpj.size} clientes únicos com CNPJ/CPF (${duplicadosNoXml} descartados por CNPJ repetido no XML)`)
  console.log(`${semDocumento.length} clientes sem CNPJ/CPF serão pulados — vão pro relatório\n`)

  let criados = 0
  let jaExistiam = 0

  for (const [digitos, r] of porCnpj) {
    const jaExiste = await prisma.cliente.findUnique({ where: { cpfCnpj: digitos } })
    if (jaExiste) {
      jaExistiam++
      continue
    }

    await prisma.cliente.create({
      data: {
        tipoPessoa: digitos.length === 11 ? 'fisica' : 'juridica',
        cpfCnpj: digitos,
        nome: r.RazaoSocial || r.Nome,
        telefone: r.TelefonePrincipal || null,
        email: r.Emailprincipal || null,
        endereco: montarEndereco(r),
        cidade: montarCidade(r),
      }
    })
    criados++
  }

  console.log(`✅ ${criados} clientes criados`)
  console.log(`⚠️  ${jaExistiam} já existiam no banco (CNPJ igual) — pulados`)

  const relatorioPath = path.resolve('scripts/relatorio-importacao-clientes.json')
  fs.writeFileSync(relatorioPath, JSON.stringify({
    totalNoXml: registros.length,
    criados,
    jaExistiam,
    duplicadosNoXml,
    semDocumento,
  }, null, 2), 'utf8')

  console.log(`\n📄 ${semDocumento.length} clientes sem CNPJ/CPF listados em ${relatorioPath}`)
}

const caminhoXml = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'Cliente.xml')

if (!fs.existsSync(caminhoXml)) {
  console.error(`Arquivo não encontrado: ${caminhoXml}`)
  process.exit(1)
}

importar(caminhoXml)
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Assinaturas escaneadas dos técnicos, uma imagem por pessoa, com o nome do
// arquivo = nome do técnico sem acento, minúsculo e com hífen no lugar dos
// espaços ("João da Silva" → joao-da-silva.png). Fica em uploads-privado
// (fora do git e sem rota pública): o arquivo só sai dentro do PDF.
// O PDF do relatório procura aqui pelo nome digitado no relatório, então
// basta pôr o arquivo na pasta — não tem cadastro nem passo de assinar.
export const PASTA_ASSINATURAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'uploads-privado', 'assinaturas')
fs.mkdirSync(PASTA_ASSINATURAS, { recursive: true })

const EXTENSOES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

export function nomeArquivoAssinatura(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// data URI da assinatura de quem tem esse nome, ou '' se não houver arquivo.
// Lê a pasta a cada chamada (é pequena) pra arquivo novo valer na hora, sem
// reiniciar o servidor.
export function assinaturaPorNome(nome) {
  const chave = nomeArquivoAssinatura(nome)
  if (!chave) return ''
  let arquivos
  try {
    arquivos = fs.readdirSync(PASTA_ASSINATURAS)
  } catch {
    return ''
  }
  const arquivo = arquivos.find(a => {
    const ext = path.extname(a).toLowerCase()
    return EXTENSOES[ext] && nomeArquivoAssinatura(path.basename(a, path.extname(a))) === chave
  })
  if (!arquivo) return ''
  const bytes = fs.readFileSync(path.join(PASTA_ASSINATURAS, arquivo))
  return `data:${EXTENSOES[path.extname(arquivo).toLowerCase()]};base64,${bytes.toString('base64')}`
}

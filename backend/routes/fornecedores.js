import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ─── Duplicados ────────────────────────────────────────────────────────────────
// O documento é gravado do jeito que foi digitado (com ou sem pontuação), então
// toda comparação é feita só pelos dígitos.
const soDigitos = doc => String(doc || '').replace(/\D/g, '')

// Fornecedor com o mesmo CPF/CNPJ (ignorando pontuação), fora o próprio
export async function buscarPorDocumento(db, documento, excetoId = 0) {
  const digitos = soDigitos(documento)
  if (!digitos) return null
  const [achado] = await db.$queryRaw`
    SELECT id FROM "Fornecedor"
    WHERE regexp_replace(coalesce(documento, ''), '[^0-9]', '', 'g') = ${digitos} AND id <> ${excetoId}
    ORDER BY id LIMIT 1`
  return achado ? db.fornecedor.findUnique({ where: { id: achado.id } }) : null
}

// Palavras do nome sem acento/pontuação e sem as que não identificam ninguém
// (tipo societário, preposição). "Alexandre D. Dantas ME" → alexandre, dantas
const PALAVRAS_IGNORADAS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 'cia', 'de', 'da', 'do', 'das', 'dos', 'e'])
const palavrasNome = nome => String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter(p => p.length > 1 && !PALAVRAS_IGNORADAS.has(p))

// Nome parecido = todas as palavras do nome mais curto aparecem no mais longo
// ("dantas" ⊂ "alexandre douglas dantas"). Só para avisar — quem decide é o usuário.
function nomesParecidos(a, b) {
  const [menor, maior] = [palavrasNome(a), palavrasNome(b)].sort((x, y) => x.length - y.length)
  return menor.length > 0 && menor.every(p => maior.includes(p))
}

const CAMPOS_CADASTRO = ['endereco', 'cidade', 'cep', 'documento', 'inscEstadual', 'telefone', 'chavePix']

// ─── Listar fornecedores (paginado, com filtros opcionais por nome/doc/cidade) ─
router.get('/', autenticar, async (req, res) => {
  const { nome, documento, cidade, pagina = 1 } = req.query
  const porPagina = 50
  const paginaNum = parseInt(pagina)

  const where = {}
  if (nome) where.nome = { contains: nome, mode: 'insensitive' }
  if (documento) where.documento = { contains: documento.replace(/\D/g, '') || documento }
  if (cidade) where.cidade = { contains: cidade, mode: 'insensitive' }

  const [fornecedores, total] = await Promise.all([
    prisma.fornecedor.findMany({
      where,
      orderBy: { nome: 'asc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.fornecedor.count({ where })
  ])

  res.json({ fornecedores, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
})

router.get('/:id/vendedores', autenticar, async (req, res) => {
  const vendedores = await prisma.vendedor.findMany({
    where: { fornecedorId: Number(req.params.id) }
  })
  res.json(vendedores)
})

// CPF/CNPJ repetido é bloqueado (409, devolve o cadastro existente pra tela
// oferecer usar ele); nome parecido só é avisado no frontend (GET /semelhantes)
router.post('/', autenticar, async (req, res) => {
  const existente = await buscarPorDocumento(prisma, req.body.documento)
  if (existente) {
    return res.status(409).json({ erro: `Já existe fornecedor com esse CPF/CNPJ: ${existente.nome}`, fornecedor: existente })
  }
  const fornecedor = await prisma.fornecedor.create({ data: req.body })
  res.json(fornecedor)
})

// ─── Cadastros parecidos (aviso antes de cadastrar fornecedor novo) ────────────
// mesmoDocumento: bloqueia o cadastro; parecidos: só avisa
router.get('/semelhantes', autenticar, async (req, res) => {
  const { nome = '', documento = '' } = req.query
  const mesmoDocumento = await buscarPorDocumento(prisma, documento)
  const todos = palavrasNome(nome).length
    ? await prisma.fornecedor.findMany({ select: { id: true, nome: true, documento: true, cidade: true }, orderBy: { nome: 'asc' } })
    : []
  const parecidos = todos.filter(f => f.id !== mesmoDocumento?.id && nomesParecidos(nome, f.nome)).slice(0, 10)
  res.json({ mesmoDocumento, parecidos })
})

// ─── Mesclar duplicados (só gerente/admin) ─────────────────────────────────────
// Candidatos: busca por pedaço do nome ou documento, com o que ajuda a decidir
// se é o mesmo fornecedor (quantas OCs, última OC, vendedores)
router.get('/mesclar/candidatos', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  // Nome: todas as palavras digitadas, em qualquer ordem ("alexandre dantas" acha
  // "Alexandre Douglas Dantas"). Documento: pelos dígitos, com ou sem pontuação gravada.
  const digitos = soDigitos(q)
  const porDocumento = digitos.length >= 3
    ? (await prisma.$queryRaw`
        SELECT id FROM "Fornecedor"
        WHERE regexp_replace(coalesce(documento, ''), '[^0-9]', '', 'g') LIKE ${'%' + digitos + '%'}`).map(f => f.id)
    : []

  const fornecedores = await prisma.fornecedor.findMany({
    where: {
      OR: [
        { AND: q.split(/\s+/).map(palavra => ({ nome: { contains: palavra, mode: 'insensitive' } })) },
        { id: { in: porDocumento } }
      ]
    },
    include: {
      _count: { select: { ordensCompra: true, vendedores: true } },
      ordensCompra: { select: { dataPedido: true }, orderBy: { dataPedido: 'desc' }, take: 1 }
    },
    orderBy: { nome: 'asc' },
    take: 50
  })

  res.json(fornecedores.map(({ _count, ordensCompra, ...f }) => ({
    ...f, qtdOCs: _count.ordensCompra, qtdVendedores: _count.vendedores, ultimaOC: ordensCompra[0]?.dataPedido || null
  })))
})

// Passa OCs e vendedores dos duplicados pro principal, completa os campos vazios
// do principal com os dados dos duplicados e apaga os duplicados — tudo ou nada.
// Bloqueia se houver dois CPF/CNPJ diferentes: aí são filiais/pessoas diferentes
// (ou documento digitado errado, que tem que ser corrigido antes).
router.post('/mesclar', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const principalId = Number(req.body.principalId)
  const duplicadosIds = [...new Set((req.body.duplicadosIds || []).map(Number))]
  if (!Number.isInteger(principalId) || !duplicadosIds.length || !duplicadosIds.every(Number.isInteger)) {
    return res.status(400).json({ erro: 'Informe o fornecedor principal e ao menos um duplicado' })
  }
  if (duplicadosIds.includes(principalId)) return res.status(400).json({ erro: 'O principal não pode estar entre os duplicados' })

  const principal = await prisma.fornecedor.findUnique({ where: { id: principalId } })
  // Mais recente primeiro: na hora de completar campo vazio, o dado mais novo ganha
  const duplicados = await prisma.fornecedor.findMany({ where: { id: { in: duplicadosIds } }, orderBy: { criadoEm: 'desc' } })
  if (!principal || duplicados.length !== duplicadosIds.length) return res.status(404).json({ erro: 'Fornecedor não encontrado' })

  const todos = [principal, ...duplicados]
  if (new Set(todos.map(f => soDigitos(f.documento)).filter(Boolean)).size > 1) {
    const lista = todos.filter(f => soDigitos(f.documento)).map(f => `${f.nome}: ${f.documento}`).join('; ')
    return res.status(400).json({ erro: `Não é possível mesclar fornecedores com CPF/CNPJ diferentes (${lista}). Se for erro de digitação, corrija o documento antes.` })
  }

  const completar = {}
  for (const campo of CAMPOS_CADASTRO) {
    if (principal[campo]) continue
    const valor = duplicados.find(d => d[campo])?.[campo]
    if (valor) completar[campo] = valor
  }
  // Dados bancários vêm em bloco de um cadastro só (agência de um + conta de outro não serve)
  if (!principal.agencia && !principal.contaNumero) {
    const comConta = duplicados.find(d => d.agencia || d.contaNumero)
    if (comConta) Object.assign(completar, { tipoConta: comConta.tipoConta, agencia: comConta.agencia, contaNumero: comConta.contaNumero })
  }

  const resumo = await prisma.$transaction(async tx => {
    // Vendedor com o mesmo nome (sem acento/maiúscula) vira um só; as OCs passam pro que ficou
    const chaveVendedor = nome => palavrasNome(nome).join(' ')
    const vendedoresPrincipal = await tx.vendedor.findMany({ where: { fornecedorId: principalId } })
    const porNome = new Map(vendedoresPrincipal.map(v => [chaveVendedor(v.nome), v]))
    const vendedoresDuplicados = await tx.vendedor.findMany({ where: { fornecedorId: { in: duplicadosIds } }, orderBy: { id: 'asc' } })
    let vendedoresMovidos = 0, vendedoresUnidos = 0
    for (const v of vendedoresDuplicados) {
      const igual = porNome.get(chaveVendedor(v.nome))
      if (igual) {
        await tx.ordemCompra.updateMany({ where: { vendedorId: v.id }, data: { vendedorId: igual.id } })
        await tx.vendedor.delete({ where: { id: v.id } })
        vendedoresUnidos++
      } else {
        await tx.vendedor.update({ where: { id: v.id }, data: { fornecedorId: principalId } })
        porNome.set(chaveVendedor(v.nome), v)
        vendedoresMovidos++
      }
    }

    const { count: ocsMovidas } = await tx.ordemCompra.updateMany({ where: { fornecedorId: { in: duplicadosIds } }, data: { fornecedorId: principalId } })
    if (Object.keys(completar).length) await tx.fornecedor.update({ where: { id: principalId }, data: completar })
    await tx.fornecedor.deleteMany({ where: { id: { in: duplicadosIds } } })

    return { ocsMovidas, vendedoresMovidos, vendedoresUnidos, camposCompletados: Object.keys(completar), apagados: duplicados.map(d => d.nome) }
  })

  res.json(resumo)
})

router.get('/buscar', autenticar, async (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])

  const fornecedores = await prisma.fornecedor.findMany({
    where: {
      OR: [
        { nome: { contains: q, mode: 'insensitive' } },
        { documento: { contains: q } }
      ]
    },
    take: 5
  })
  res.json(fornecedores)
})

// ─── Buscar um fornecedor pelo ID ──────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: Number(req.params.id) } })
  if (!fornecedor) return res.status(404).json({ erro: 'Fornecedor não encontrado' })
  res.json(fornecedor)
})

// ─── Editar fornecedor ──────────────────────────────────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = Number(req.params.id)
  const { nome, endereco, cidade, cep, documento, inscEstadual, telefone, chavePix, tipoConta, agencia, contaNumero } = req.body

  const dados = {}
  if (nome) dados.nome = nome
  if (endereco !== undefined) dados.endereco = endereco || null
  if (cidade !== undefined) dados.cidade = cidade || null
  if (cep !== undefined) dados.cep = cep || null
  if (documento !== undefined) dados.documento = documento || null
  if (inscEstadual !== undefined) dados.inscEstadual = inscEstadual || null
  if (telefone !== undefined) dados.telefone = telefone || null
  if (chavePix !== undefined) dados.chavePix = chavePix || null
  if (tipoConta !== undefined) dados.tipoConta = tipoConta || null
  if (agencia !== undefined) dados.agencia = agencia || null
  if (contaNumero !== undefined) dados.contaNumero = contaNumero || null

  const existente = dados.documento && await buscarPorDocumento(prisma, dados.documento, id)
  if (existente) return res.status(409).json({ erro: `Já existe outro fornecedor com esse CPF/CNPJ: ${existente.nome}. Se forem o mesmo, use "Mesclar duplicados".` })

  try {
    const fornecedor = await prisma.fornecedor.update({ where: { id }, data: dados })
    res.json(fornecedor)
  } catch {
    res.status(404).json({ erro: 'Fornecedor não encontrado' })
  }
})

// ─── Excluir fornecedor (só gerente/admin) ─────────────────────────────────────
// Bloqueia se tiver OC vinculada: a OC é histórico de compra e não pode ficar
// sem fornecedor. Os vendedores são parte do cadastro e saem junto.
router.delete('/:id', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const id = Number(req.params.id)
  const fornecedor = Number.isInteger(id) && await prisma.fornecedor.findUnique({ where: { id } })
  if (!fornecedor) return res.status(404).json({ erro: 'Fornecedor não encontrado' })

  // OC conta também as canceladas: o job de limpeza só apaga depois de 30 dias
  const qtdOCs = await prisma.ordemCompra.count({ where: { fornecedorId: id } })
  if (qtdOCs) {
    return res.status(400).json({
      erro: `Não é possível excluir: existem ${qtdOCs} Ordem(ns) de Compra vinculadas a este fornecedor.`
    })
  }

  await prisma.$transaction([
    prisma.vendedor.deleteMany({ where: { fornecedorId: id } }),
    prisma.fornecedor.delete({ where: { id } }),
  ])
  res.json({ ok: true })
})

export default router
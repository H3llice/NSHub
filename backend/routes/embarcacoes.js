import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

const CAMPOS_TEXTO = ['portoRegistro', 'tipo', 'supervisor', 'classe', 'email', 'telefone']
const CAMPOS_VENCIMENTO = ['vencLsaBaleeiras', 'vencBalsa', 'vencFfe', 'vencIloCrane']

// IMO: 7 dígitos, o último é verificador — soma dos 6 primeiros × (7, 6, 5, 4, 3, 2),
// último dígito da soma. Validar aqui evita IMO digitado errado, que é a chave pra
// achar o navio em serviços externos (ex.: botão do MarineTraffic).
// Devolve a mensagem de erro (ou null se válido) — tamanho e dígito verificador
// têm mensagens separadas porque "inválido" genérico parecia erro de tamanho.
function erroImo(imo) {
  if (!/^\d{7}$/.test(imo)) return `Número IMO deve ter 7 dígitos (foram digitados ${imo.length})`
  const soma = [...imo.slice(0, 6)].reduce((acc, d, i) => acc + Number(d) * (7 - i), 0)
  const esperado = soma % 10
  if (esperado === Number(imo[6])) return null
  return `Número IMO ${imo} não confere: pelo dígito verificador, o último dígito deveria ser ${esperado}. ` +
    'Confira no documento do navio — provavelmente há um dígito trocado.'
}

// Lê os campos opcionais do body. Só inclui o que veio (PUT parcial); string vazia
// vira null. Devolve { erro } se algum valor for inválido.
function lerCamposOpcionais(body) {
  const dados = {}
  for (const campo of CAMPOS_TEXTO) {
    if (body[campo] !== undefined) dados[campo] = String(body[campo] ?? '').trim() || null
  }

  if (body.imo !== undefined) {
    // Aceita "IMO 9074729" / "9.074.729" — guarda só os dígitos
    const imo = String(body.imo ?? '').replace(/^\s*IMO\s*/i, '').replace(/\D/g, '')
    const erro = imo && erroImo(imo)
    if (erro) return { erro }
    dados.imo = imo || null
  }

  // Datas chegam como YYYY-MM-DD do <input type="date"> → meia-noite UTC
  for (const campo of CAMPOS_VENCIMENTO) {
    if (body[campo] === undefined) continue
    if (!body[campo]) { dados[campo] = null; continue }
    const data = new Date(body[campo])
    if (isNaN(data)) return { erro: `Data inválida em ${campo}` }
    dados[campo] = data
  }

  return { dados }
}

// ID vindo de URL/body: inteiro positivo ou null. Sem isso, "abc" vira NaN e o
// Prisma lança exceção (500) em vez de a rota responder 400/404.
function lerId(valor) {
  const id = Number(valor)
  return Number.isInteger(id) && id > 0 ? id : null
}

// IMO identifica o navio — duas embarcações com o mesmo IMO são cadastro em dobro.
// Devolve a mensagem de erro se algum dos IMOs já existir (fora a própria
// embarcação, na edição), ou null.
async function erroImoDuplicado(imos, ignorarId = null) {
  if (imos.length === 0) return null
  const existente = await prisma.embarcacao.findFirst({
    where: { imo: { in: imos }, ...(ignorarId && { id: { not: ignorarId } }) },
    select: { nome: true, imo: true }
  })
  return existente && `IMO ${existente.imo} já está cadastrado na embarcação ${existente.nome}`
}

// ─── Listar embarcações (paginado, com filtros opcionais por navio/armador) ───
router.get('/', autenticar, async (req, res) => {
  const { nome, armador, porto } = req.query
  const porPagina = 50
  const paginaNum = lerId(req.query.pagina) || 1

  const where = {}
  if (nome) where.nome = { contains: nome, mode: 'insensitive' }
  // Embarcação cadastrada pelo certificado pode ter só o nome do armador (sem Cliente)
  if (armador) {
    where.OR = [
      { armador: { nome: { contains: armador, mode: 'insensitive' } } },
      { armadorNome: { contains: armador, mode: 'insensitive' } }
    ]
  }
  // Só portos atuais: navio que deixou de atracar no porto não entra no filtro
  if (porto) where.portos = { some: { removidoEm: null, porto: { contains: porto, mode: 'insensitive' } } }

  const [embarcacoes, total] = await Promise.all([
    prisma.embarcacao.findMany({
      where,
      include: {
        armador: true,
        portos: { where: { removidoEm: null }, select: { porto: true }, orderBy: { porto: 'asc' } }
      },
      orderBy: { nome: 'asc' },
      take: porPagina,
      skip: (paginaNum - 1) * porPagina
    }),
    prisma.embarcacao.count({ where })
  ])

  res.json({ embarcacoes, total, pagina: paginaNum, totalPaginas: Math.ceil(total / porPagina) })
})

// ─── Buscar embarcação por nome do navio (autocomplete) ───────────────────────
router.get('/buscar', autenticar, async (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])

  const embarcacoes = await prisma.embarcacao.findMany({
    where: { nome: { contains: q, mode: 'insensitive' } },
    include: { armador: true },
    take: 10
  })

  res.json(embarcacoes)
})

// ─── Nomes de porto já usados (sugestões ao digitar) ───────────────────────────
// Vem antes de /:id pra "portos" não ser lido como ID. Sugerir o que já existe
// evita o mesmo porto escrito de jeitos diferentes ("Santos" / "Porto de Santos").
router.get('/portos/sugestoes', autenticar, async (req, res) => {
  const portos = await prisma.embarcacaoPorto.findMany({
    distinct: ['porto'],
    select: { porto: true },
    orderBy: { porto: 'asc' }
  })
  res.json(portos.map(p => p.porto))
})

// ─── Buscar uma embarcação pelo ID ─────────────────────────────────────────────
router.get('/:id', autenticar, async (req, res) => {
  const id = lerId(req.params.id)
  const embarcacao = id && await prisma.embarcacao.findUnique({
    where: { id },
    include: { armador: true, portos: { orderBy: { incluidoEm: 'asc' } } }
  })
  if (!embarcacao) return res.status(404).json({ erro: 'Embarcação não encontrada' })
  res.json(embarcacao)
})

// ─── Cadastrar embarcação (qualquer usuário logado) ────────────────────────────
// Usado pelo cadastro rápido dentro de Embarques e Ordens de Serviço; a tela de
// Embarcações usa /lote
router.post('/', autenticar, async (req, res) => {
  const nome = String(req.body.nome ?? '').trim()
  const armadorId = lerId(req.body.armadorId)

  if (!nome || !armadorId) {
    return res.status(400).json({ erro: 'Nome do navio e armador são obrigatórios' })
  }

  const { dados, erro } = lerCamposOpcionais(req.body)
  if (erro) return res.status(400).json({ erro })

  const armador = await prisma.cliente.findUnique({ where: { id: armadorId } })
  if (!armador) {
    return res.status(400).json({ erro: 'Armador não encontrado' })
  }

  const erroDuplicado = dados.imo && await erroImoDuplicado([dados.imo])
  if (erroDuplicado) return res.status(400).json({ erro: erroDuplicado })

  const embarcacao = await prisma.embarcacao.create({
    data: { ...dados, nome, armadorId },
    include: { armador: true }
  })

  res.json(embarcacao)
})

// ─── Cadastrar várias embarcações do mesmo armador de uma vez ──────────────────
// Tudo ou nada: se uma estiver inválida, nenhuma é gravada — senão o usuário
// teria que descobrir quais entraram pra não cadastrar em dobro ao corrigir.
router.post('/lote', autenticar, async (req, res) => {
  const { embarcacoes } = req.body
  const armadorId = lerId(req.body.armadorId)

  if (!armadorId) return res.status(400).json({ erro: 'Armador é obrigatório' })
  if (!Array.isArray(embarcacoes) || embarcacoes.length === 0) {
    return res.status(400).json({ erro: 'Informe ao menos uma embarcação' })
  }
  if (embarcacoes.length > 50) return res.status(400).json({ erro: 'Máximo de 50 embarcações por vez' })

  const armador = await prisma.cliente.findUnique({ where: { id: armadorId } })
  if (!armador) return res.status(400).json({ erro: 'Armador não encontrado' })

  const registros = []
  for (const [i, e] of embarcacoes.entries()) {
    const nome = String(e?.nome ?? '').trim()
    if (!nome) return res.status(400).json({ erro: `Embarcação ${i + 1}: nome do navio é obrigatório` })
    const { dados, erro } = lerCamposOpcionais(e)
    if (erro) return res.status(400).json({ erro: `Embarcação ${i + 1} (${nome}): ${erro}` })
    const repetida = dados.imo ? registros.findIndex(r => r.imo === dados.imo) : -1
    if (repetida >= 0) {
      return res.status(400).json({ erro: `Embarcação ${i + 1} (${nome}): IMO ${dados.imo} repetido — é o mesmo da embarcação ${repetida + 1}` })
    }
    registros.push({ ...dados, nome, armadorId })
  }

  const erroDuplicado = await erroImoDuplicado(registros.map(r => r.imo).filter(Boolean))
  if (erroDuplicado) return res.status(400).json({ erro: erroDuplicado })

  const criadas = await prisma.$transaction(registros.map(data => prisma.embarcacao.create({ data })))
  res.json(criadas)
})

// ─── Editar embarcação (qualquer usuário logado) ───────────────────────────────
router.put('/:id', autenticar, async (req, res) => {
  const id = lerId(req.params.id)
  const existe = id && await prisma.embarcacao.findUnique({ where: { id }, select: { id: true } })
  if (!existe) return res.status(404).json({ erro: 'Embarcação não encontrada' })

  const { dados, erro } = lerCamposOpcionais(req.body)
  if (erro) return res.status(400).json({ erro })

  // PUT parcial: nome/armador ausentes ficam como estão, mas se vieram não podem ser vazios
  if (req.body.nome !== undefined) {
    const nome = String(req.body.nome ?? '').trim()
    if (!nome) return res.status(400).json({ erro: 'Nome do navio é obrigatório' })
    dados.nome = nome
  }
  if (req.body.armadorId !== undefined) {
    const armadorId = lerId(req.body.armadorId)
    const armador = armadorId && await prisma.cliente.findUnique({ where: { id: armadorId } })
    if (!armador) return res.status(400).json({ erro: 'Armador não encontrado' })
    dados.armadorId = armadorId
    dados.armadorNome = null
  } else if (req.body.armadorNome !== undefined) {
    // Embarcação ainda sem Cliente vinculado: o armador continua só texto
    dados.armadorNome = String(req.body.armadorNome ?? '').trim() || null
  }

  const erroDuplicado = dados.imo && await erroImoDuplicado([dados.imo], id)
  if (erroDuplicado) return res.status(400).json({ erro: erroDuplicado })

  // Sem try/catch: a existência já foi checada acima, então erro aqui é falha
  // real do banco e deve aparecer como 500, não como "não encontrada"
  const embarcacao = await prisma.embarcacao.update({ where: { id }, data: dados, include: { armador: true } })
  res.json(embarcacao)
})

// ─── Incluir porto onde a embarcação atraca (qualquer usuário logado) ──────────
router.post('/:id/portos', autenticar, async (req, res) => {
  const id = lerId(req.params.id)
  const embarcacao = id && await prisma.embarcacao.findUnique({ where: { id }, select: { id: true } })
  if (!embarcacao) return res.status(404).json({ erro: 'Embarcação não encontrada' })

  const porto = String(req.body.porto ?? '').trim().replace(/\s+/g, ' ')
  if (!porto) return res.status(400).json({ erro: 'Informe o nome do porto' })

  const jaAtual = await prisma.embarcacaoPorto.findFirst({
    where: { embarcacaoId: id, removidoEm: null, porto: { equals: porto, mode: 'insensitive' } }
  })
  if (jaAtual) return res.status(400).json({ erro: `${jaAtual.porto} já está na lista de portos desta embarcação` })

  const criado = await prisma.embarcacaoPorto.create({ data: { embarcacaoId: id, porto } })
  res.json(criado)
})

// ─── Remover porto da lista atual (fica no histórico) ──────────────────────────
router.delete('/:id/portos/:portoId', autenticar, async (req, res) => {
  const id = lerId(req.params.id)
  const portoId = lerId(req.params.portoId)
  const atual = id && portoId && await prisma.embarcacaoPorto.findFirst({
    where: { id: portoId, embarcacaoId: id, removidoEm: null }
  })
  if (!atual) return res.status(404).json({ erro: 'Porto não encontrado na lista atual desta embarcação' })

  const removido = await prisma.embarcacaoPorto.update({ where: { id: portoId }, data: { removidoEm: new Date() } })
  res.json(removido)
})

// ─── Excluir embarcação (só gerente/admin) ─────────────────────────────────────
// Bloqueia se existir OS/Relatório/Certificado vinculado — cadastro não pode
// levar histórico operacional junto sem o usuário decidir isso explicitamente
// (ver Ordens de Serviço/Relatórios/Certificados dessa embarcação primeiro).
router.delete('/:id', autenticar, exigirPerfil('gerente', 'admin'), async (req, res) => {
  const id = lerId(req.params.id)
  const embarcacao = id && await prisma.embarcacao.findUnique({ where: { id } })
  if (!embarcacao) return res.status(404).json({ erro: 'Embarcação não encontrada' })

  // Todo model com FK pra Embarcacao entra aqui — o que faltar faz o delete
  // estourar no banco em vez de virar aviso (era o caso dos embarques).
  // Exceção: EmbarcacaoPorto é parte do cadastro e sai junto (onDelete: Cascade).
  const [qtdOS, qtdRelatorios, qtdCertificados, qtdEmbarques] = await Promise.all([
    prisma.ordemServico.count({ where: { embarcacaoId: id } }),
    prisma.relatorio.count({ where: { embarcacaoId: id } }),
    prisma.certificado.count({ where: { embarcacaoId: id } }),
    prisma.embarque.count({ where: { embarcacaoId: id } }),
  ])

  const vinculos = [
    qtdOS && `${qtdOS} Ordem(ns) de Serviço`,
    qtdRelatorios && `${qtdRelatorios} Relatório(s)`,
    qtdCertificados && `${qtdCertificados} Certificado(s)`,
    qtdEmbarques && `${qtdEmbarques} Embarque(s)`,
  ].filter(Boolean)
  if (vinculos.length) {
    return res.status(400).json({
      erro: `Não é possível excluir: existem ${vinculos.join(', ')} vinculados a esta embarcação.`
    })
  }

  await prisma.embarcacao.delete({ where: { id } })
  res.json({ ok: true })
})

// ─── Cadastro da embarcação a partir do certificado ────────────────────────────
// Mesmo papel do fornecedor na OC: salvar o certificado cadastra o navio que
// ainda não existe, ou sobrescreve o cadastro com o que veio preenchido. Nunca
// trava o certificado — o que não der pra gravar volta como aviso.
// Ordem pra achar a embarcação: a escolhida no autocomplete (embarcacaoId),
// depois o IMO, depois o nome (só se houver uma única com esse nome).
// Devolve { embarcacaoId, avisos }.
export async function sincronizarEmbarcacaoDoCertificado(c, embarcacaoIdEscolhida) {
  const avisos = []
  const nome = String(c.navio ?? '').trim()
  // Colete de aeronave usa o campo navio pra aeronave — não é embarcação
  if (!nome || c.tipo === 'colete_aeronave') return { embarcacaoId: c.embarcacaoId ?? null, avisos }

  const texto = campo => String(c[campo] ?? '').trim()
  const dados = { nome }
  for (const [campoCert, campoEmb] of [['portoRegistro', 'portoRegistro'], ['telefone', 'telefone'], ['email', 'email'],
    ['classificadora', 'classe'], ['tipoNavio', 'tipo']]) {
    if (texto(campoCert)) dados[campoEmb] = texto(campoCert)
  }

  let embarcacao = null
  const idEscolhido = lerId(embarcacaoIdEscolhida)
  if (idEscolhido) embarcacao = await prisma.embarcacao.findUnique({ where: { id: idEscolhido } })

  const imo = texto('imo').replace(/^IMO\s*/i, '').replace(/\D/g, '')
  if (imo) {
    const erro = erroImo(imo)
    if (erro) avisos.push(`IMO não gravado no cadastro da embarcação — ${erro}`)
    else {
      if (!embarcacao) embarcacao = await prisma.embarcacao.findFirst({ where: { imo } })
      const duplicado = await erroImoDuplicado([imo], embarcacao?.id)
      if (duplicado) avisos.push(`IMO não gravado no cadastro da embarcação — ${duplicado}`)
      else dados.imo = imo
    }
  }

  if (!embarcacao) {
    const mesmoNome = await prisma.embarcacao.findMany({ where: { nome: { equals: nome, mode: 'insensitive' } }, take: 2 })
    if (mesmoNome.length > 1) {
      avisos.push(`Há mais de uma embarcação "${nome}" no cadastro — escolha a certa na lista de sugestões do campo Navio pra vincular o certificado`)
      return { embarcacaoId: null, avisos }
    }
    embarcacao = mesmoNome[0] || null
  }

  // Armador: vincula ao Cliente se o nome bater com um (e só um) cadastrado;
  // senão fica como texto. Não desfaz vínculo com Cliente por causa de texto
  // diferente — "NORSUL" no certificado não deve soltar o Cliente "Cia. Norsul".
  const armadorTexto = texto('armador')
  if (armadorTexto) {
    const clientes = await prisma.cliente.findMany({ where: { nome: { equals: armadorTexto, mode: 'insensitive' } }, take: 2 })
    if (clientes.length === 1) {
      dados.armadorId = clientes[0].id
      dados.armadorNome = null
    } else if (!embarcacao?.armadorId) {
      dados.armadorNome = armadorTexto
    }
  }

  const salva = embarcacao
    ? await prisma.embarcacao.update({ where: { id: embarcacao.id }, data: dados })
    : await prisma.embarcacao.create({ data: dados })
  return { embarcacaoId: salva.id, avisos }
}

export default router

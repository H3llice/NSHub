import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { enviarEmailResetSenha } from '../email.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'nshub-secret-troque-em-producao'
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, senha } = req.body

  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha são obrigatórios' })
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } })

  if (!usuario || !usuario.ativo) {
    return res.status(401).json({ erro: 'Usuário não encontrado ou inativo' })
  }

  const senhaOk = await bcrypt.compare(senha, usuario.senha)
  if (!senhaOk) {
    return res.status(401).json({ erro: 'Senha incorreta' })
  }

  const token = jwt.sign(
    { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    JWT_SECRET,
    { expiresIn: '8h' }
  )

  res.json({
    token,
    primeiroLogin: usuario.primeiroLogin,
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil }
  })
})

// ─── Listar usuários (admin) ──────────────────────────────────────────────────
router.get('/', autenticar, exigirPerfil('admin'), async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
    orderBy: { nome: 'asc' }
  })
  res.json(usuarios)
})

// ─── Criar usuário (admin) ────────────────────────────────────────────────────
router.post('/', autenticar, exigirPerfil('admin'), async (req, res) => {
  const { nome, email, senha, perfil } = req.body

  if (!nome || !email || !senha || !perfil) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios' })
  }

  const perfisValidos = ['admin', 'usuario', 'gerente', 'financeiro', 'tecnico']
  if (!perfisValidos.includes(perfil)) {
    return res.status(400).json({ erro: `Perfil inválido. Use: ${perfisValidos.join(', ')}` })
  }

  const existe = await prisma.usuario.findUnique({ where: { email } })
  if (existe) {
    return res.status(400).json({ erro: 'Email já cadastrado' })
  }

  const hash = await bcrypt.hash(senha, 10)

  const usuario = await prisma.usuario.create({
    data: { nome, email, senha: hash, perfil, primeiroLogin: true },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true }
  })

  res.json(usuario)
})

// ─── Editar usuário (admin) ───────────────────────────────────────────────────
router.put('/:id', autenticar, exigirPerfil('admin'), async (req, res) => {
  const { nome, email, perfil, ativo, senha } = req.body
  const id = Number(req.params.id)

  const dados = {}
  if (nome) dados.nome = nome
  if (email) dados.email = email
  if (perfil) dados.perfil = perfil
  if (typeof ativo === 'boolean') dados.ativo = ativo
  if (senha) {
    dados.senha = await bcrypt.hash(senha, 10)
    dados.primeiroLogin = true
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data: dados,
    select: { id: true, nome: true, email: true, perfil: true, ativo: true }
  })

  res.json(usuario)
})

// ─── Trocar própria senha ─────────────────────────────────────────────────────
router.post('/trocar-senha', autenticar, async (req, res) => {
  const { senhaAtual, novaSenha } = req.body

  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } })
  const senhaOk = await bcrypt.compare(senhaAtual, usuario.senha)

  if (!senhaOk) {
    return res.status(401).json({ erro: 'Senha atual incorreta' })
  }

  if (!novaSenha || novaSenha.length < 6) {
    return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres' })
  }

  const hash = await bcrypt.hash(novaSenha, 10)
  await prisma.usuario.update({
    where: { id: req.usuario.id },
    data: { senha: hash, primeiroLogin: false }
  })

  res.json({ ok: true })
})

// ─── Solicitar reset de senha ─────────────────────────────────────────────────
router.post('/esqueci-senha', async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ erro: 'Email é obrigatório' })
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } })

  // Sempre responde OK para não revelar se o email existe no sistema
  if (!usuario || !usuario.ativo) {
    return res.json({ ok: true })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expira = new Date(Date.now() + 1000 * 60 * 60) // expira em 1 hora

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { resetToken: token, resetTokenExpira: expira }
  })

  const link = `${BASE_URL}/html/reset-senha.html?token=${token}`

  enviarEmailResetSenha(usuario, link).catch(err =>
    console.error('⚠️  Falha ao enviar email de reset:', err.message)
  )

  res.json({ ok: true })
})

// ─── Validar token de reset ───────────────────────────────────────────────────
router.get('/reset-senha/:token', async (req, res) => {
  const usuario = await prisma.usuario.findFirst({
    where: {
      resetToken: req.params.token,
      resetTokenExpira: { gt: new Date() }
    },
    select: { id: true, nome: true }
  })

  if (!usuario) {
    return res.status(400).json({ erro: 'Link inválido ou expirado' })
  }

  res.json({ ok: true, nome: usuario.nome })
})

// ─── Resetar senha via token ──────────────────────────────────────────────────
router.post('/reset-senha', async (req, res) => {
  const { token, novaSenha } = req.body

  if (!token || !novaSenha) {
    return res.status(400).json({ erro: 'Token e nova senha são obrigatórios' })
  }

  if (novaSenha.length < 6) {
    return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres' })
  }

  const usuario = await prisma.usuario.findFirst({
    where: {
      resetToken: token,
      resetTokenExpira: { gt: new Date() }
    }
  })

  if (!usuario) {
    return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite um novo.' })
  }

  const hash = await bcrypt.hash(novaSenha, 10)

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      senha: hash,
      primeiroLogin: false,
      resetToken: null,
      resetTokenExpira: null
    }
  })

  res.json({ ok: true })
})

export default router
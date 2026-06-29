// Roda uma vez pra criar o admin inicial
// node scripts/criar-admin.js

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const email = 'tec2@natalsafety.com.br'
const senha = 'admin123'  // troque depois de logar
const nome  = 'Administrador'

const hash = await bcrypt.hash(senha, 10)

const usuario = await prisma.usuario.upsert({
  where: { email },
  update: {},
  create: { nome, email, senha: hash, perfil: 'admin' }
})

console.log(`✅ Admin criado: ${usuario.email} / senha: ${senha}`)
console.log('⚠️  Troque a senha após o primeiro login!')

await prisma.$disconnect()
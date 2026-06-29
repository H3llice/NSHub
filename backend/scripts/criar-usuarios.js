// scripts/criar-usuarios.js
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const usuarios = [
  { nome: 'Gerente Teste', email: 'gerente@natalsafety.com.br', senha: 'gerente123', perfil: 'gerente' },
  { nome: 'Financeiro Teste', email: 'financeiro@natalsafety.com.br', senha: 'financeiro123', perfil: 'financeiro' },
]

for (const u of usuarios) {
  const hash = await bcrypt.hash(u.senha, 10)
  await prisma.usuario.upsert({
    where: { email: u.email },
    update: {},
    create: { ...u, senha: hash }
  })
  console.log(`✅ ${u.perfil}: ${u.email} / senha: ${u.senha}`)
}

await prisma.$disconnect()
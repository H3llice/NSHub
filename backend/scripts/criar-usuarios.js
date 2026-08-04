// scripts/criar-usuarios.js
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const usuarios = [
  { nome: 'Janilson', email: 'contrato@natalsafety.com.br', senha: 'JChave4321', perfil: 'Janilson' },
  { nome: 'Celso', email: 'celso@natalsafety.com.br', senha: 'CChave4321', perfil: 'Celso' },
  { nome: 'Rosane', email: 'financeiro@natalsafety.com.br', senha: 'RChave4321', perfil: 'Rosane' },
  { nome: 'Dantas', email: 'adm@natalsafety.com.br', senha: 'SChave4321', perfil: 'Dantas' },
  { nome: 'José Alexandre', email: 'ope@natalsafety.com.br', senha: 'AChave4321', perfil: 'José Alexandre' },
  { nome: 'Dagoberto', email: 'maritme@natalsafety.com.br', senha: 'DChave4321', perfil: 'Dagoberto' },
  { nome: 'Lorena', email: 'compras@natalsafety.com.br', senha: 'LChave4321', perfil: 'Lorena' },
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
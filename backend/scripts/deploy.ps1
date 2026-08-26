# Script de deploy do NSHub.
# Roda disparado pelo Agendador de Tarefas do Windows (ver webhook.js), fora da árvore de
# processos do pm2/nshub — precisa poder dar `pm2 stop nshub` sem se matar junto, porque o
# arquivo da query engine do Prisma (query_engine-windows.dll.node) fica travado no Windows
# enquanto o processo que carregou o Prisma Client estiver rodando, e sem parar o nshub antes
# o `prisma db push` nunca consegue regenerar o client (erro EPERM ao renomear o .tmp).
$ErrorActionPreference = 'Continue'
$raiz = Resolve-Path "$PSScriptRoot\..\.."

Write-Output "=== Deploy iniciado em $(Get-Date) ==="

Set-Location $raiz
git pull

pm2 stop nshub

try {
    Set-Location "$raiz\backend"
    npm install
    npx prisma db push
}
finally {
    # sempre sobe o nshub de volta, mesmo se npm install ou prisma db push falharem no meio
    pm2 start nshub
}

Write-Output "=== Deploy concluído em $(Get-Date) ==="

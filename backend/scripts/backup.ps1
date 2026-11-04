# Backup do NSHub: banco (pg_dump) + arquivos enviados pelo sistema (uploads = anexos de OC,
# uploads-privado = documentos de colaborador/balsa). Sem os arquivos, um backup só do banco
# volta com todos os links de anexo quebrados.
#
# Configuração no backend/.env:
#   BACKUP_DESTINOS=G:\Meu Drive\Backup NSHub;\\OUTRO-PC\Backup NSHub;E:\Backup NSHub
#     Pastas FORA deste disco, separadas por ";". Cada uma recebe o dump e uma cópia das pastas
#     de arquivos. Um destino fora do ar (HD desligado, PC da rede desligado) não impede os outros.
#   BACKUP_MANTER_DIAS=30    (opcional) dumps mais velhos que isso são apagados, sempre
#                            sobrando os 5 mais novos
#   BACKUP_PG_DUMP=...       (opcional) caminho do pg_dump.exe, se não estiver em
#                            C:\Program Files\PostgreSQL\<versão>\bin
#
# Roda toda noite pelo Agendador de Tarefas (registrar-backup.ps1) e grava o resultado em
# backend/backups/ultimo-backup.json, que o job verificarBackup do server.js lê pra mandar
# email quando algo falha ou quando o backup para de rodar.
#
# -SoBanco: só o dump, só na pasta local (backend/backups). É o que o deploy.ps1 chama antes do
# `prisma db push`, pra ter de onde voltar se uma mudança de schema der errado. Não mexe no
# ultimo-backup.json (senão um deploy esconderia uma falha do backup da noite).
#
# ── Restaurar ─────────────────────────────────────────────────────────────────────────────────
# 1. Num Postgres novo, criar o banco vazio:   createdb -U postgres sistema_oc
# 2. Restaurar o dump:   pg_restore -U postgres -d sistema_oc --no-owner nshub-AAAA-MM-DD_HHmm.dump
# 3. Copiar as pastas uploads e uploads-privado do destino de volta pra backend\
# 4. Recriar o backend\.env (não vai no backup por ter senhas — guardar uma cópia num cofre
#    de senhas) e subir o nshub normalmente.
param([switch]$SoBanco)

$ErrorActionPreference = 'Continue'
$backend = (Resolve-Path "$PSScriptRoot\..").Path
$pastaLocal = Join-Path $backend 'backups'
New-Item -ItemType Directory -Force $pastaLocal | Out-Null

# .env simples (CHAVE=valor, valor com ou sem aspas) — o mesmo arquivo que o dotenv lê
function Ler-Env($arquivo) {
    $vars = @{}
    if (Test-Path $arquivo) {
        foreach ($linha in Get-Content $arquivo) {
            if ($linha -match '^\s*([A-Za-z0-9_]+)\s*=\s*"?(.*?)"?\s*$') { $vars[$Matches[1]] = $Matches[2] }
        }
    }
    return $vars
}

$config = Ler-Env (Join-Path $backend '.env')
$diasManter = if ($config.BACKUP_MANTER_DIAS) { [int]$config.BACKUP_MANTER_DIAS } else { 30 }
$destinos = @(($config.BACKUP_DESTINOS -split ';') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
# pg_dump mais novo instalado — ele tem que ser da mesma versão do servidor ou mais nova
function Achar-PgDump {
    if ($config.BACKUP_PG_DUMP) { return $config.BACKUP_PG_DUMP }
    $instalados = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
        Sort-Object { try { [double]$_.Directory.Parent.Name } catch { 0 } } -Descending
    if ($instalados) { return $instalados[0].FullName }
    return 'pg_dump'
}

function Limpar-Antigos($pasta) {
    Get-ChildItem $pasta -Filter 'nshub-*.dump' | Sort-Object LastWriteTime -Descending |
        Select-Object -Skip 5 | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$diasManter) } |
        Remove-Item -Force
}

$inicio = Get-Date
Write-Output "=== Backup iniciado em $inicio$(if ($SoBanco) { ' (só banco, antes do deploy)' }) ==="

$status = [ordered]@{
    inicio = $inicio.ToString('yyyy-MM-ddTHH:mm:ssK')
    fim = $null
    arquivo = $null
    tamanhoMB = $null
    erroBanco = $null
    destinos = @()
}

# ─── Banco ─────────────────────────────────────────────────────────────────────────────────────
# A URL do Prisma pode ter ?schema=public, que o pg_dump não aceita
$url = ($config.DATABASE_URL -split '\?')[0]
$arquivo = Join-Path $pastaLocal ('nshub-{0:yyyy-MM-dd_HHmm}.dump' -f $inicio)
$pgDump = Achar-PgDump

if (-not $url) {
    $status.erroBanco = 'DATABASE_URL não encontrado no backend\.env'
} else {
    # --format=custom: compactado e restaurável por tabela com pg_restore
    & $pgDump --format=custom --no-owner --no-privileges --file "$arquivo" --dbname "$url"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $arquivo)) {
        $status.erroBanco = "pg_dump falhou (código $LASTEXITCODE) — ver backend\backup.log"
    } else {
        # Confere que o arquivo abre — um dump cortado no meio só seria descoberto na hora de restaurar
        $pgRestore = if (Split-Path $pgDump) { Join-Path (Split-Path $pgDump) 'pg_restore.exe' } else { 'pg_restore' }
        & $pgRestore --list "$arquivo" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            $status.erroBanco = 'O dump foi gerado mas não abre no pg_restore (arquivo corrompido)'
        } else {
            $status.arquivo = Split-Path $arquivo -Leaf
            $status.tamanhoMB = [math]::Round((Get-Item $arquivo).Length / 1MB, 1)
            Write-Output "Banco: $($status.arquivo) ($($status.tamanhoMB) MB)"
        }
    }
    if ($status.erroBanco) {
        Write-Output "ERRO: $($status.erroBanco)"
        Remove-Item $arquivo -Force -ErrorAction SilentlyContinue
    }
}
Limpar-Antigos $pastaLocal

if ($SoBanco) {
    Write-Output "=== Backup concluído em $(Get-Date) ==="
    if ($status.erroBanco) { exit 1 } else { exit 0 }
}

# ─── Destinos fora da máquina ─────────────────────────────────────────────────────────────────
foreach ($destino in $destinos) {
    $resultado = [ordered]@{ caminho = $destino; ok = $false; erro = $null }
    try {
        New-Item -ItemType Directory -Force $destino -ErrorAction Stop | Out-Null

        if ($status.arquivo) {
            Copy-Item $arquivo -Destination $destino -ErrorAction Stop
            Limpar-Antigos $destino
        }

        # /E sem /MIR: arquivo apagado no sistema continua no backup (um delete por engano não
        # se propaga). Só copia o que mudou, então só a primeira vez é demorada. /R:2 /W:5 —
        # o padrão do robocopy é tentar 1 milhão de vezes, o que travaria a tarefa com a rede fora.
        foreach ($pasta in 'uploads', 'uploads-privado') {
            $origem = Join-Path $backend $pasta
            if (Test-Path $origem) {
                robocopy $origem (Join-Path $destino $pasta) /E /R:2 /W:5 /NP /NFL /NDL /NJH
                # robocopy: 0–7 = sucesso (com ou sem arquivos copiados), 8+ = falha
                if ($LASTEXITCODE -ge 8) { throw "cópia de $pasta falhou (robocopy código $LASTEXITCODE)" }
            }
        }

        $resultado.ok = $true
        Write-Output "Destino OK: $destino"
    } catch {
        $resultado.erro = $_.Exception.Message
        Write-Output "ERRO no destino $destino`: $($resultado.erro)"
    }
    $status.destinos += $resultado
}

if ($destinos.Count -eq 0) { Write-Output 'AVISO: BACKUP_DESTINOS vazio no .env — o backup ficou só neste disco' }

$status.fim = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
# WriteAllText grava UTF-8 sem BOM (o Set-Content do PowerShell 5 põe BOM e o JSON.parse do Node não aceita)
[IO.File]::WriteAllText((Join-Path $pastaLocal 'ultimo-backup.json'), ($status | ConvertTo-Json -Depth 4))

Write-Output "=== Backup concluído em $(Get-Date) ==="

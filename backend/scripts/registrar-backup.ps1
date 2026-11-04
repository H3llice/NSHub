# Cria (ou atualiza) a tarefa NSHubBackup no Agendador de Tarefas: backup.bat todo dia às 02:00.
# Rodar UMA vez no servidor, logado com o mesmo usuário que roda o pm2/nshub:
#   powershell -ExecutionPolicy Bypass -File backend\scripts\registrar-backup.ps1
#
# A tarefa roda como esse usuário e só com ele logado (Interactive) porque o Google Drive
# para desktop e as credenciais da pasta de rede (cmdkey) existem só na sessão dele — como
# serviço/SYSTEM o backup não enxergaria o G:\ nem o \\OUTRO-PC.
# StartWhenAvailable: se o PC estava desligado às 02:00, roda assim que ligar.
$bat = Join-Path $PSScriptRoot 'backup.bat'

$acao = New-ScheduledTaskAction -Execute $bat
$gatilho = New-ScheduledTaskTrigger -Daily -At '02:00'
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 6) -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
$usuario = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName 'NSHubBackup' -Action $acao -Trigger $gatilho -Settings $config -Principal $usuario -Force | Out-Null
Write-Output "Tarefa NSHubBackup registrada: todo dia às 02:00 como $env:USERDOMAIN\$env:USERNAME"
Write-Output "Pra testar agora: Start-ScheduledTask -TaskName NSHubBackup  (log em backend\backup.log)"

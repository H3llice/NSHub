@echo off
REM Wrapper chamado pelo Agendador de Tarefas (tarefa NSHubBackup, criada por registrar-backup.ps1).
REM Mesmo esquema do deploy.bat: a lógica real está em backup.ps1.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1" >> "%~dp0..\backup.log" 2>&1

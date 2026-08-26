@echo off
REM Wrapper chamado pelo Agendador de Tarefas (schtasks) a partir de webhook.js.
REM Existe só pra dar um caminho sem aspas aninhadas pro schtasks /TR chamar; a lógica real
REM está em deploy.ps1.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" >> "%~dp0..\deploy.log" 2>&1

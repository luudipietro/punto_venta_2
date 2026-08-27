@echo off
chcp 65001 >nul
title Generador de Carteles - REMODEL
cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 (
    echo No se encontro Python instalado en esta PC.
    echo Instalalo desde https://www.python.org/downloads/
    echo ^(al instalar, tildar la opcion "Add Python to PATH"^)
    pause
    exit /b
)

python -c "import reportlab" >nul 2>&1
if errorlevel 1 (
    echo Instalando la libreria necesaria ^(reportlab^), un momento...
    python -m pip install reportlab
)

python "generar_carteles.py"

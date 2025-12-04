#!/usr/bin/env python3
"""
================================================================================
KIT DO PROFESSOR CURADOR - Script de Inicialização
================================================================================

Este script inicia o servidor de desenvolvimento com reload automático.
Útil para desenvolvimento, pois recarrega automaticamente quando arquivos mudam.

USO:
    python run.py

O servidor estará disponível em http://localhost:8000

Para produção, use: uvicorn app:app --host 0.0.0.0 --port 8000
"""

import uvicorn

if __name__ == "__main__":
    print("🎓 Iniciando Kit do Professor Curador...")
    print("📚 Abra http://localhost:8000 no seu navegador")
    print("🛑 Pressione Ctrl+C para parar o servidor\n")
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True  # Recarrega automaticamente em desenvolvimento
    )


#!/usr/bin/env python3
"""Dev server with auto-reload. Run: python run.py"""

import uvicorn

if __name__ == "__main__":
    print("🎓 Curriculum Curator Toolkit")
    print("📚 http://localhost:8000")
    print("🛑 Ctrl+C to stop\n")
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True  # Recarrega automaticamente em desenvolvimento
    )


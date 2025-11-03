#!/bin/bash

if ! command -v python3 &>/dev/null; then
    echo "Python3 missing"
    exit 1
fi

pip3 install --upgrade pip
pip3 install fastapi "uvicorn[standard]" python-socketio aiohttp numpy pandas lttb pydantic python-dotenv

if ! command -v node &>/dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    brew install node
fi

cd frontend || exit 1
rm -rf node_modules package-lock.json
npm install
chmod +x node_modules/.bin/vite 2>/dev/null

echo "Done"
echo "Start backend: python3 start_up.py"
echo "Start frontend: cd frontend && npm run dev"

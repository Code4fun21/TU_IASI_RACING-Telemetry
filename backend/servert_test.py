# websocket_server.py
import socketio
from fastapi import FastAPI, Request
import aiohttp
import asyncio
import uvicorn
import threading
import time

class WebSocketServer:
    def __init__(self, host="wss://tuiasi-telemetry-api.fly.dev", port=8081):
        self.host = host
        self.port = port

        self.sio = socketio.AsyncServer(
            async_mode='asgi',
            cors_allowed_origins="*",
            ping_interval=25,
            ping_timeout=60,
        )
        self.app = FastAPI()
        # mount Socket.IO under FastAPI
        self.sio_app = socketio.ASGIApp(self.sio, other_asgi_app=self.app)

        self.connected_clients = set()
        self.server_thread = None
        self._server = None

        self._setup_routes()
        self._setup_socket_events()

    # ————— REST route to broadcast to everyone —————
    def _setup_routes(self):
        @self.app.post("/broadcast")
        async def broadcast(request: Request):
            data = await request.json()
            message = data.get("message")
            if not message:
                return {"error": "Missing message"}
            # broadcast to all clients
            await self.sio.emit("message", message)
            return {"status": "ok"}

    # ————— Socket event handlers —————
    def _setup_socket_events(self):
        @self.sio.event
        async def connect(sid, environ):
            self.connected_clients.add(sid)
            print(f"[WS] Client connected: {sid}")

            # reply just to that client
            await self.sio.emit("connect_response", {"message": "You are connected!"}, room=sid)

            # background‐notify your API server on first client

        @self.sio.event
        async def disconnect(sid):
            print(f"[WS] Client disconnected: {sid}")
            self.connected_clients.discard(sid)

    # ————— Call your API in background (non‑blocking) —————
    async def notify_api_server(self):
        api_url = "http://127.0.0.1:8080/start"
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(api_url, json={"start": True}) as resp:
                    msg = await resp.text()
                    print("[WS] Notified API:", msg)
            except Exception as e:
                print("[WS] Failed to notify API server:", e)

    def notify_api_server_bg(self):
        # start as a fire‑and‑forget task
        return asyncio.create_task(self.notify_api_server())

    # ————— Optional heartbeat so you can verify live conn’s —————
    async def _heartbeat(self):
        while True:
            await asyncio.sleep(5)
            if self.connected_clients:
                await self.sio.emit("heartbeat", {"ts": time.time()})

    # ————— Utility: broadcast any payload to all —————
    async def send_message_to_all(self, message):
        await self.sio.emit("message", message)

    # ————— Run Uvicorn in a background thread —————
    def _run_uvicorn(self):
        config = uvicorn.Config(
            self.sio_app,
            host=self.host,
            port=self.port,
            log_level="info",
            loop="asyncio",
            lifespan="on",
        )
        self._server = uvicorn.Server(config)

        async def serve_with_heartbeat():
            # schedule heartbeat in the same loop
            asyncio.create_task(self._heartbeat())
            await self._server.serve()

        asyncio.run(serve_with_heartbeat())
        print("[WS] Uvicorn loop exited.")

    async def start_websocket(self):
        if self.server_thread and self.server_thread.is_alive():
            print("[WS] Already running.")
            return

        self.server_thread = threading.Thread(target=self._run_uvicorn, daemon=True)
        self.server_thread.start()
        print(f"[WS] WebSocket server starting on http://{self.host}:{self.port}")

    async def stop_websocket(self):
        print("[WS] Stopping WebSocket...")

        # disconnect clients
        for sid in list(self.connected_clients):
            try:
                await self.sio.disconnect(sid)
                print(f"[WS] Disconnected {sid}")
            except Exception as e:
                print(f"[WS] Error disconnecting {sid}: {e}")
        self.connected_clients.clear()

        # signal Uvicorn to exit
        if self._server:
            self._server.should_exit = True

        # wait up to 5s for thread to join
        if self.server_thread and self.server_thread.is_alive():
            self.server_thread.join(timeout=5)

        print("[WS] WebSocket stop complete.")

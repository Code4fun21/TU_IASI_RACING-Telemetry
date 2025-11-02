import sys
import os
import platform
import subprocess
import tkinter as tk
from tkinter import messagebox
import threading
import time
import urllib.request
import webbrowser

frontend_proc = None
backend_proc = None

def get_base_dir():
    # Works for both .py and PyInstaller .exe
    if getattr(sys, '_MEIPASS', None):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))

def get_project_paths():
    base_dir = get_base_dir()
    frontend = os.path.join(base_dir, "frontend")
    backend  = os.path.join(base_dir, "backend")
    return os.path.normpath(frontend), os.path.normpath(backend)

def kill_process_on_port(port):
    system = platform.system().lower()
    if system == "windows":
        output = os.popen(f'netstat -ano | findstr :{port}').read()
        pids = set()
        for line in output.splitlines():
            parts = line.strip().split()
            if len(parts) >= 5:
                pids.add(parts[-1])
        for pid in pids:
            os.system(f'taskkill /F /PID {pid}')
    else:
        os.system(f"lsof -ti:{port} | xargs kill -9 2>/dev/null || true")

# ---------- helpers to open browser when ready ----------
def _wait_http_ok(url: str, timeout_s: float = 60.0, interval_s: float = 0.5) -> bool:
    """Poll url until it returns anything (200/301/etc.), or timeout."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as _:
                return True
        except Exception:
            time.sleep(interval_s)
    return False

def _open_frontend_when_ready():
    # Vite hops ports if busy; try 5173..5180
    for port in range(5173, 5181):
        url = f"http://localhost:{port}/"
        if _wait_http_ok(url, timeout_s=25.0):
            webbrowser.open_new(url)     # open default browser
            return
    # fallback: still open the default vite port
    webbrowser.open_new("http://localhost:5173/")

def _open_backend_docs_when_ready():
    url = "http://localhost:8080/docs"
    if _wait_http_ok(url, timeout_s=25.0):
        webbrowser.open_new_tab(url)

def start_all():
    global frontend_proc, backend_proc
    frontend, backend = get_project_paths()

    try:
        if platform.system().lower() == "windows":
            frontend_cmd = ["cmd", "/k", "npm install && npm run dev"]
            backend_cmd  = ["cmd", "/k", "python -m uvicorn classes:app --reload --port 8080"]
        else:
            frontend_cmd = ["bash", "-c", "npm install && npm run dev"]
            backend_cmd  = ["bash", "-c", "python3 -m uvicorn classes:app --reload --port 8080"]

        # spawn processes (you can add CREATE_NEW_CONSOLE on Windows if you want a console)
        frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend)
        backend_proc  = subprocess.Popen(backend_cmd,  cwd=backend)

        # kick off background pollers to open the browser automatically
        threading.Thread(target=_open_frontend_when_ready, daemon=True).start()
        threading.Thread(target=_open_backend_docs_when_ready, daemon=True).start()

        messagebox.showinfo("Started", "Frontend and Backend starting… browser will open when ready.")
    except Exception as e:
        messagebox.showerror("Error", str(e))

def stop_all():
    try:
        if frontend_proc:
            frontend_proc.kill()
        if backend_proc:
            backend_proc.kill()

        for port in [5173, 5174, 5175, 8080, 8081]:
            kill_process_on_port(port)

        messagebox.showinfo("Stopped", "All services stopped.")
    except Exception as e:
        messagebox.showerror("Error", str(e))

# --- GUI ---
root = tk.Tk()
root.title("TUIasiRacing App Launcher")
root.geometry("300x150")

tk.Button(root, text="Start App", command=start_all, bg="green", fg="white", height=2).pack(pady=10)
tk.Button(root, text="Stop App",  command=stop_all,  bg="red",   fg="white", height=2).pack()

root.mainloop()

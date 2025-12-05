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

# --- CONFIGURATION CONSTANTS ---
# These are the standard ports for our new stack
FRONTEND_PORT = 5173 
BACKEND_PORT = 8787  

frontend_proc = None
backend_proc = None

def get_base_dir():
    # Returns the directory where the launcher script is located (the project root)
    if getattr(sys, '_MEIPASS', None):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))

def get_project_paths():
    # The monorepo structure is assumed to be inside the base_dir
    base_dir = get_base_dir()
    frontend_dir = os.path.join(base_dir, "apps", "frontend")
    backend_dir  = os.path.join(base_dir, "apps", "backend")
    # Note: We return the root directory as well for running pnpm commands
    return os.path.normpath(base_dir), os.path.normpath(frontend_dir), os.path.normpath(backend_dir)

def kill_process_on_port(port):
    """Kills any process running on the specified port."""
    system = platform.system().lower()
    if system == "windows":
        # Find PIDs using netstat and taskkill them
        output = os.popen(f'netstat -ano | findstr :{port}').read()
        pids = set()
        for line in output.splitlines():
            parts = line.strip().split()
            if len(parts) >= 5:
                pids.add(parts[-1])
        for pid in pids:
            # Using call instead of os.system for better error handling/control
            subprocess.call(f'taskkill /F /PID {pid}', shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    else:
        # Linux/macOS command using lsof and kill
        os.system(f"lsof -ti:{port} | xargs kill -9 2>/dev/null || true")

# ---------- helpers to open browser when ready ----------
def _wait_http_ok(url: str, timeout_s: float = 60.0, interval_s: float = 0.5) -> bool:
    """Poll url until it returns anything (200/301/etc.), or timeout."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            # Check only for status codes, not body content
            with urllib.request.urlopen(url, timeout=1.0) as _:
                return True
        except Exception:
            time.sleep(interval_s)
    return False

def _open_frontend_when_ready(root_dir: str):
    # Vite is configured to run from the frontend folder, but the dev server
    # often starts in the root dir when using the pnpm workspace command.
    
    # We poll the standard Vite port (5173) as configured in the setup
    url = f"http://localhost:{FRONTEND_PORT}/"
    if _wait_http_ok(url, timeout_s=25.0):
        webbrowser.open_new(url)     # open default browser
        return
    # Fallback to the known default if polling fails
    webbrowser.open_new(f"http://localhost:{FRONTEND_PORT}/")

def start_all():
    global frontend_proc, backend_proc
    root_dir, frontend_dir, backend_dir = get_project_paths()

    try:
        # Kill old processes before starting
        kill_process_on_port(FRONTEND_PORT)
        kill_process_on_port(BACKEND_PORT)
        
        # --- COMMANDS FOR MONOREPO ---
        # NOTE: pnpm commands must be run from the root directory to use the --filter flag
        # We must use 'pnpm run' instead of 'npm run' since we are using pnpm workspaces

        # 1. Start Backend (Cloudflare Worker)
        # Command: pnpm --filter backend dev 
        backend_cmd = ["pnpm", "run", "dev", "--filter", "backend"]
        
        # 2. Start Frontend (Vite/React)
        # Command: pnpm --filter frontend dev
        frontend_cmd = ["pnpm", "run", "dev", "--filter", "frontend"]

        # ----------------------------------------------------
        
        # Windows specifics for running commands in a new window
        if platform.system().lower() == "windows":
            # subprocess.CREATE_NEW_CONSOLE ensures separate, visible command windows
            creation_flags = subprocess.CREATE_NEW_CONSOLE
            
            # Use Popen to start the process
            backend_proc = subprocess.Popen(
                backend_cmd, 
                cwd=root_dir, 
                creationflags=creation_flags
            )
            frontend_proc = subprocess.Popen(
                frontend_cmd, 
                cwd=root_dir, 
                creationflags=creation_flags
            )
        else:
            # macOS/Linux uses bash or shell execution
            # The shell=True argument is necessary for 'pnpm' to be found in the path
            backend_proc = subprocess.Popen(
                " ".join(backend_cmd), 
                cwd=root_dir, 
                shell=True
            )
            frontend_proc = subprocess.Popen(
                " ".join(frontend_cmd), 
                cwd=root_dir, 
                shell=True
            )

        # kick off background pollers to open the browser automatically
        threading.Thread(target=_open_frontend_when_ready, args=(root_dir,), daemon=True).start()

        # The backend runs on 8787, but it's an API, no need to open a browser for it.
        # messagebox.showinfo("Started", "Frontend and Backend starting… browser will open when ready.")
        tk.messagebox.showinfo("Started", f"Services running.\nFrontend: http://localhost:{FRONTEND_PORT}\nBackend: http://localhost:{BACKEND_PORT}")
        
    except Exception as e:
        tk.messagebox.showerror("Error", str(e))

def stop_all():
    try:
        if frontend_proc:
            frontend_proc.terminate() # Use terminate/kill for cleaner shutdown
        if backend_proc:
            backend_proc.terminate()

        # Ensure all ports are killed in case the process object failed to stop the server
        for port in [FRONTEND_PORT, BACKEND_PORT, 5174, 5175]:
            kill_process_on_port(port)

        tk.messagebox.showinfo("Stopped", "All services stopped.")
    except Exception as e:
        tk.messagebox.showerror("Error", str(e))

# --- GUI ---
root = tk.Tk()
root.title("TUIasiRacing App Launcher")
root.geometry("300x150")

# Customize colors for better visual
tk.Button(root, text="Start App", command=start_all, bg="#4CAF50", fg="white", height=2, width=20, font=('Arial', 12, 'bold')).pack(pady=10)
tk.Button(root, text="Stop App", command=stop_all, bg="#F44336", fg="white", height=2, width=20, font=('Arial', 12, 'bold')).pack(pady=5)

root.mainloop()
# add near top
USE_CLOUD_FRONTEND = True
CLOUDFLARE_FRONTEND_URL = "https://your-site.pages.dev"  # <-- set this

def _open_frontend_when_ready():
    if USE_CLOUD_FRONTEND:
        webbrowser.open_new(CLOUDFLARE_FRONTEND_URL)
        return
    # fallback to local vite if you keep it
    for port in range(5173, 5181):
        url = f"http://localhost:{port}/"
        if _wait_http_ok(url, timeout_s=25.0):
            webbrowser.open_new(url)
            return
    webbrowser.open_new("http://localhost:5173/")

def start_all():
    global frontend_proc, backend_proc
    frontend, backend = get_project_paths()

    try:
        # only start backend if using cloud frontend
        if platform.system().lower() == "windows":
            backend_cmd  = ["cmd", "/k", "python -m uvicorn classes:app --reload --port 8080"]
        else:
            backend_cmd  = ["bash", "-c", "python3 -m uvicorn classes:app --reload --port 8080"]

        backend_proc  = subprocess.Popen(backend_cmd,  cwd=backend)

        # open Cloudflare (or local vite if USE_CLOUD_FRONTEND=False)
        threading.Thread(target=_open_frontend_when_ready, daemon=True).start()
        threading.Thread(target=_open_backend_docs_when_ready, daemon=True).start()

        messagebox.showinfo("Started", "Backend starting… your browser will open to the frontend.")
    except Exception as e:
        messagebox.showerror("Error", str(e))

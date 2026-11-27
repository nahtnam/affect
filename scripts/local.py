"""Run this checkout's anonymous Convex CLI and its Vite child."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1]
state = root / ".setup.local" / "anonymous"
os.umask(0o077)
state.parent.mkdir(exist_ok=True)
env = dict(PATH=os.environ["PATH"], HOME=str(state / "home"), CONVEX_AGENT_MODE="anonymous",
           CONVEX_DISABLE_TELEMETRY="1", CI="true")
cli = ["node", str(root / "node_modules/convex/bin/main.js")]
runtime = state / "runtime.json"


def convex(*args, **kwargs):
    return subprocess.run(cli + list(args), cwd=state, env=env, check=True, text=True, **kwargs)


def running(pid):
    command = subprocess.run(["ps", "-ww", "-p", str(pid), "-o", "command="],
                             capture_output=True, text=True).stdout
    return command.strip().startswith(f"node {cli[1]} dev ")


def stop(pid):
    if pid and running(pid):
        os.kill(pid, signal.SIGINT)
        for _ in range(150):
            if not running(pid):
                break
            time.sleep(0.1)
        else:
            sys.exit("Convex did not stop.")
    runtime.unlink(missing_ok=True)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def start():
    (state / "home").mkdir(exist_ok=True)
    for name in ["package.json", "node_modules"]:
        if not (state / name).exists():
            (state / name).symlink_to(root / name)
    (state / "convex.json").write_text(json.dumps({"functions": "../../convex"}))
    with (state / "dev.log").open("w") as log:
        convex("init", stdout=log, stderr=log)
        hostname = hashlib.sha256(os.fsencode(root)).hexdigest()[:16] + ".localhost"
        web = free_port()
        origin = f"http://{hostname}:{web}"
        settings = dict(SITE_URL=origin, TRUSTED_ORIGINS=origin, EMAIL_FROM="",
                        CLOUDFLARE_ACCOUNT_ID="", CLOUDFLARE_API_TOKEN="", POSTHOG_PROJECT_TOKEN="")
        if not (state / "configured").exists():
            settings["BETTER_AUTH_SECRET"] = secrets.token_hex(32)
        convex("env", "set", "--force",
               input="".join(f"{k}={v}\n" for k, v in settings.items()), stdout=log, stderr=log)
        (state / "configured").touch()
        frontend = dict(AFFECT_LOCAL="1", PORT=str(web), SITE_URL=origin, VITE_SITE_URL=origin,
                        TRUSTED_ORIGINS=origin, AFFECT_ROOT=str(root))
        proc = subprocess.Popen(cli + ["dev", "--codegen", "disable",
                                "--typecheck", "disable", "--start",
                                'cd "$AFFECT_ROOT/apps/web" && exec node "$AFFECT_ROOT/node_modules/vite/bin/vite.js"'],
                                cwd=state, env={**env, **frontend}, stdout=log, stderr=log,
                                stdin=subprocess.DEVNULL, start_new_session=True)
        data = dict(pid=proc.pid, origin=origin)
        runtime.write_text(json.dumps(data))
        try:
            for _ in range(600):
                if proc.poll() is not None:
                    break
                try:
                    with urlopen(f"http://127.0.0.1:{web}", timeout=2) as response:
                        if response.status == 200:
                            return data
                except OSError:
                    time.sleep(0.25)
            raise SystemExit(f"Local startup failed. See {log.name}")
        except BaseException:
            stop(proc.pid)
            raise


def main():
    action = sys.argv[1]
    data = json.loads(runtime.read_text()) if runtime.exists() else {}
    pid = data.get("pid")
    if action in ("stop", "reset"):
        stop(pid)
        if action == "reset":
            shutil.rmtree(state)
        return
    if not pid or not running(pid):
        if action != "start":
            sys.exit("Run local:start first.")
        data = start()
    if action == "seed" or (action == "start" and "--seed" in sys.argv):
        convex("run", "seed:populate")
    if action == "start":
        print("URL=" + data["origin"])
    elif action == "count":
        convex("run", "seed:count")
    elif action == "code":
        cloud = convex("run", "--inline-query", "process.env.CONVEX_CLOUD_URL", stdout=subprocess.PIPE)
        args = dict(origin=data["origin"], cloudUrl=json.loads(cloud.stdout), email="demo@example.test")
        reply = convex("run", "developmentEmail:send", json.dumps(args),
                       stdout=subprocess.PIPE)
        print(json.loads(reply.stdout)["email"]["code"])


with (state.parent / "anonymous.lock").open("a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    if state.is_symlink() or state.parent.is_symlink():
        sys.exit("Local state must be a checkout directory.")
    state.mkdir(exist_ok=True)
    main()

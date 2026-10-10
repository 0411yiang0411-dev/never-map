"""Local deployment console. Credentials are read without echo, kept in memory.
Never commit this process's environment or logs containing authorization headers.
"""
import getpass, json, os, subprocess, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
secret = getpass.getpass('Cloudflare token (hidden): ')
account = '7aeeb4163af696238b62b47a92d59f55'
env = os.environ.copy()
env.update(CLOUDFLARE_API_TOKEN=secret, CLOUDFLARE_ACCOUNT_ID=account,
           TEMP=str(ROOT / '.tmp'), TMP=str(ROOT / '.tmp'),
           XDG_CONFIG_HOME=str(ROOT / '.cache/config'),
           XDG_CACHE_HOME=str(ROOT / '.cache'),
           WRANGLER_LOG_PATH=str(ROOT / '.cache/wrangler-logs'),
           WRANGLER_SEND_METRICS='false')
print('READY', flush=True)
for line in iter(input, 'EXIT'):
    try:
        command = json.loads(line)
        if command['action'] == 'api':
            path = command['path']
            if not path.startswith('/'): raise ValueError('Invalid path')
            body = json.dumps(command['body']).encode() if 'body' in command else None
            request = urllib.request.Request('https://api.cloudflare.com/client/v4' + path,
                data=body, method=command.get('method', 'GET'),
                headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    result = json.loads(response.read())
                # Never expose token verification identifiers or secrets.
                print(json.dumps(result, ensure_ascii=False), flush=True)
            except urllib.error.HTTPError as error:
                print('HTTP', error.code, error.read().decode()[:2000], flush=True)
        elif command['action'] == 'wrangler':
            args = command['args']
            cli = ROOT / 'node_modules/wrangler/bin/wrangler.js'
            subprocess.run(['node', str(cli), *args], env=env, cwd=ROOT, check=True)
        else: raise ValueError('Unknown action')
    except Exception as error:
        print('ERROR', type(error).__name__, str(error).replace(secret, '[redacted]'), flush=True)

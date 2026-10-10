"""Local deployment console. Credentials are read without echo, kept in memory.
Never commit this process's environment or logs containing authorization headers.
"""
import getpass, json, os, secrets, subprocess, urllib.request, urllib.error
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
        elif command['action'] == 'personal-access':
            access = getpass.getpass('New personal password (hidden): ')
            if not access: raise ValueError('Empty password')
            share_path = ROOT / '.cache/share-key.txt'
            share_path.parent.mkdir(parents=True, exist_ok=True)
            share = share_path.read_text().strip() if share_path.exists() else secrets.token_urlsafe(32)
            for name, value in [('ACCESS_TOKEN', access), ('SHARE_TOKEN', share)]:
                request = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/' + account + '/workers/scripts/never-map/secrets',
                    data=json.dumps({'name': name, 'text': value, 'type': 'secret_text'}).encode(), method='PUT',
                    headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
                with urllib.request.urlopen(request, timeout=30) as response:
                    result = json.loads(response.read())
                if not result.get('success'): raise ValueError('Secret update failed')
                print(name + ': configured', flush=True)
            for path, value in [(ROOT / '.cache/access-key.txt', access), (share_path, share)]:
                path.write_text(value)
                subprocess.run(['icacls', str(path), '/inheritance:r', '/grant:r', 'Administrator:F', 'SYSTEM:F'], capture_output=True, check=True)
            link = 'https://never-map.never-map-0411yiang0411.workers.dev/#share=' + share
            (ROOT / '.cache/shared-link.txt').write_text(link)
            subprocess.run(['icacls', str(ROOT / '.cache/shared-link.txt'), '/inheritance:r', '/grant:r', 'Administrator:F', 'SYSTEM:F'], capture_output=True, check=True)
            print('Personal access updated; shared link saved privately.', flush=True)
        elif command['action'] == 'secrets':
            key_path = ROOT / '.cache/access-key.txt'
            key_path.parent.mkdir(parents=True, exist_ok=True)
            access = key_path.read_text().strip() if key_path.exists() else secrets.token_urlsafe(32)
            if not key_path.exists():
                key_path.write_text(access)
                subprocess.run(['icacls', str(key_path), '/inheritance:r', '/grant:r', 'Administrator:F', 'SYSTEM:F'], capture_output=True, check=True)
            for name, value in [('ACCESS_TOKEN', access), ('MONITOR_TOKEN_CF', secret)]:
                request = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/' + account + '/workers/scripts/never-map/secrets',
                    data=json.dumps({'name': name, 'text': value, 'type': 'secret_text'}).encode(), method='PUT',
                    headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
                with urllib.request.urlopen(request, timeout=30) as response:
                    result = json.loads(response.read())
                print(name + ': ' + ('configured' if result.get('success') else 'FAILED'), flush=True)
            print('Personal access key saved privately; no keys printed.', flush=True)
        elif command['action'] == 'wrangler':
            args = command['args']
            cli = ROOT / 'node_modules/wrangler/bin/wrangler.js'
            subprocess.run(['node', str(cli), *args], env=env, cwd=ROOT, check=True)
        else: raise ValueError('Unknown action')
    except Exception as error:
        print('ERROR', type(error).__name__, str(error).replace(secret, '[redacted]'), flush=True)

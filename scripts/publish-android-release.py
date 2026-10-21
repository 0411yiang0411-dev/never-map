"""Publish only verified Android builds, then expose an atomic update manifest.

GitHub Actions supplies its short-lived, repository-scoped token. No Cloudflare
credentials or application passwords are used by this publisher or the APK.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = '0411yiang0411-dev/never-map'
OUTPUT = ROOT / 'output/android'


def prepare():
    code = int(os.environ['ANDROID_VERSION_CODE'])
    if code < 1:
        raise ValueError('Invalid version code')
    apk = OUTPUT / 'never-map.apk'
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    if not 0 < apk.stat().st_size <= 32 * 1024 * 1024:
        raise ValueError('APK size outside supported updater range')
    if digest != (OUTPUT / 'SHA256SUMS.txt').read_text().split()[0]:
        raise ValueError('APK checksum mismatch')
    verification = (OUTPUT / 'apk-verification.txt').read_text()
    if "versionCode='" + str(code) + "'" not in verification or 'Verified using v2 scheme (APK Signature Scheme v2): true' not in verification:
        raise ValueError('APK version/signature verification missing')
    notes = (ROOT / 'android/release-notes.txt').read_text(encoding='utf-8').strip()
    if len(notes) > 4000:
        raise ValueError('Release notes too large')
    manifest = dict(schema=1, applicationId='com.nevermap.app', versionCode=code,
                    versionName='1.0.' + str(code), minSdk=26, size=apk.stat().st_size,
                    sha256=digest, apkUrl=f'https://github.com/{REPO}/releases/download/android-v1.0.{code}/never-map.apk', notes=notes)
    (OUTPUT / 'update.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return manifest


def publish(manifest):
    token = os.environ['GH_TOKEN']
    sha = os.environ['GITHUB_SHA']
    if not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('Invalid source commit')

    def api(path, method='GET', body=None):
        request = urllib.request.Request('https://api.github.com/repos/' + REPO + path,
            method=method, data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
                     'Accept': 'application/vnd.github+json', 'User-Agent': 'never-map-android-publisher',
                     'X-GitHub-Api-Version': '2022-11-28'})
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}

    def optional(path):
        try:
            return api(path)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            raise

    code = manifest['versionCode']
    tag = 'android-v' + manifest['versionName']
    latest = optional('/releases/latest')
    if latest:
        match = re.fullmatch(r'android-v1\.0\.(\d+)', latest['tag_name'])
        if not match or int(match[1]) > code:
            raise ValueError('Refusing to replace a newer or unrecognized update channel')
    release = optional('/releases/tags/' + tag)
    if release and not release['draft']:
        # Never replace APKs on an already-published version.
        url = f'https://github.com/{REPO}/releases/download/{tag}/update.json'
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'never-map-android-publisher'}), timeout=30) as response:
            previous = json.load(response)
        if previous['sha256'] != manifest['sha256'] or previous['versionCode'] != code:
            raise ValueError('Published version has different bytes; create a new build')
        print('Release already published with matching bytes: ' + release['html_url'])
        return
    body = manifest['notes'] + '\n\nAndroid 8.0+。签名 APK，覆盖安装保留数据。构建、单元测试、Lint、签名验证通过；尚未完成真实 Pad 安装验证。\n\n首次安装含更新功能的版本后，可从 App 菜单“检查更新”，无需再手动访问 GitHub。安装更新仍需安卓系统确认。'
    if not release:
        release = api('/releases', 'POST', dict(tag_name=tag, target_commitish=sha,
            name='never-map Android ' + manifest['versionName'], body=body, draft=True, prerelease=False))
    else:
        if release['target_commitish'] != sha:
            raise ValueError('Draft release belongs to a different source revision')
        api('/releases/' + str(release['id']), 'PATCH', {'body': body})
    names = ['never-map.apk', 'SHA256SUMS.txt', 'apk-verification.txt', 'update.json']
    for asset in release.get('assets', []):
        if asset['name'] in names:
            api('/releases/assets/' + str(asset['id']), 'DELETE')
    for name in names:
        data = (OUTPUT / name).read_bytes()
        request = urllib.request.Request(f'https://uploads.github.com/repos/{REPO}/releases/{release["id"]}/assets?name={name}',
            method='POST', data=data, headers={'Authorization': 'Bearer ' + token,
                'User-Agent': 'never-map-android-publisher', 'Content-Type': 'application/octet-stream'})
        with urllib.request.urlopen(request, timeout=90) as response:
            uploaded = json.load(response)
        if uploaded['size'] != len(data):
            raise ValueError('Uploaded artifact size mismatch')
    complete = api('/releases/' + str(release['id']))
    if not set(names).issubset({asset['name'] for asset in complete['assets']}):
        raise ValueError('Release assets incomplete; leaving draft unpublished')
    published = api('/releases/' + str(release['id']), 'PATCH', {'draft': False, 'prerelease': False, 'make_latest': 'true'})
    print('Published signed APK and in-app update channel: ' + published['html_url'])


if __name__ == '__main__':
    manifest = prepare()
    if '--prepare-only' not in sys.argv:
        publish(manifest)

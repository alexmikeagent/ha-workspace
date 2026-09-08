"""One-time native backend identity provisioning. Secret values never leave pipes."""
import json, os, pathlib, secrets, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
BINARY = pathlib.Path(os.environ['WORKSPACE_DATA_ROOT']).resolve(strict=True) / 'convex/bin/convex-local-backend'
# Refuse to rotate any existing identity. A new application gets its own backend.
existing = subprocess.run(['doppler','secrets','--only-names','--json'],cwd=ROOT,capture_output=True,check=True)
names = json.loads(existing.stdout)
if 'CONVEX_INSTANCE_SECRET' in names:
    required = {'CONVEX_INSTANCE_NAME', 'CONVEX_INSTANCE_SECRET', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'CONVEX_SITE_URL'}
    if not required.issubset(names):
        raise RuntimeError('Existing identity is incomplete. Recover its missing configuration; do not rotate it.')
    print('Existing identity retained; provisioning skipped.')
    raise SystemExit(0)
identity = 'ha-workspace-local'
secret = secrets.token_hex(32)
admin = subprocess.run([str(BINARY),'keygen','admin-key','--instance-name',identity,'--instance-secret',secret],capture_output=True,check=True).stdout.decode().strip()
values = {'CONVEX_INSTANCE_NAME':identity,'CONVEX_INSTANCE_SECRET':secret,'CONVEX_SELF_HOSTED_URL':'http://127.0.0.1:3220','CONVEX_SELF_HOSTED_ADMIN_KEY':admin,'CONVEX_SITE_URL':'http://127.0.0.1:3221'}
for key,value in values.items():
    result = subprocess.run(['doppler','secrets','set',key,'--silent'],input=value.encode(),cwd=ROOT,capture_output=True)
    if result.returncode: raise RuntimeError('Doppler refused key: '+key)
print('Configured dedicated backend identity and endpoints in Doppler; no values printed.')

"""Parcel scheduled runner; credentials stay in host environment secrets."""
import json, os, time, urllib.request, urllib.error, sys
origin = os.environ['PARCEL_SITE_URL'].rstrip('/')
if not origin.startswith('https://'):
    raise ValueError('HTTPS site required')
headers = {'Authorization': 'Bearer ' + os.environ['PARCEL_WORKER_SECRET'], 'Content-Type': 'application/json'}
if os.environ.get('PARCEL_SITE_ACCESS_TOKEN'):
    headers['OAI-Sites-Authorization'] = 'Bearer ' + os.environ['PARCEL_SITE_ACCESS_TOKEN']
# Never forward credentials to an HTTP redirect or sign-in page.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, hdrs, newurl):
        return None
opener = urllib.request.build_opener(NoRedirect())
def call(path, body=None):
    req = urllib.request.Request(origin + path, data=body, headers=headers)
    with opener.open(req, timeout=75) as response:
        if 'application/json' not in response.headers.get('Content-Type', ''):
            raise ValueError('Expected JSON API response')
        return json.load(response)
try:
    deadline = time.monotonic() + min(50, max(1, int(os.environ.get('RUN_SECONDS', '50'))))
    while time.monotonic() < deadline:
        result = call('/api/worker/tick', b'{}')
        print(json.dumps({'worked': result.get('worked'), 'type': result.get('type')}), flush=True)
        if not result.get('worked'):
            break
    ops = call('/api/ops')
    alerts = ops.get('alerts', {})
    if any(alerts.values()):
        print(json.dumps({'operator_attention': alerts}), flush=True)
        sys.exit(1)
except Exception as error:
    print(json.dumps({'error': type(error).__name__, 'status': getattr(error, 'code', None)}), flush=True)
    sys.exit(1)

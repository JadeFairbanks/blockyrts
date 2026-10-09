#!/usr/bin/env python3
"""How busy the test server is: read-only.

Reads the Droplet's own graphs from DigitalOcean Monitoring (the same numbers
as the Graphs tab of the Droplet in the DigitalOcean dashboard) and the
server's /healthz, and prints a summary for the run page. It changes nothing
anywhere. The run log is public, so it prints no address or Droplet ID.

Environment: DIGITALOCEAN_TOKEN, DOMAIN, HOURS (default 24).
DO_API_URL may point at a stand-in API for testing.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("DO_API_URL", "https://api.digitalocean.com").rstrip("/")
TOKEN = os.environ.get("DIGITALOCEAN_TOKEN", "")
DOMAIN = os.environ.get("DOMAIN", "")
HEALTH_URL = os.environ.get("HEALTH_URL", f"https://api.{DOMAIN}/healthz" if DOMAIN else "")
DROPLET = "blockyrts-1"


def get(path, **params):
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def series(metric, host, start, end, **extra):
    """[(labels, [(t, value)])] for one metric, or None when DigitalOcean has none."""
    try:
        body = get(f"/v2/monitoring/metrics/droplet/{metric}", host_id=host, start=start, end=end, **extra)
    except urllib.error.HTTPError as e:
        print(f"  {metric}: not available ({e.code})")
        return None
    out = []
    for s in body.get("data", {}).get("result", []):
        out.append((s.get("metric", {}), [(int(t), float(v)) for t, v in s.get("values", [])]))
    return out


def cpu_busy(host, start, end):
    """Per sample interval: (t, busy fraction, steal fraction) from the cumulative CPU seconds per mode."""
    data = series("cpu", host, start, end)
    if not data:
        return []
    by_t = {}
    for labels, values in data:
        mode = labels.get("mode", "")
        for t, v in values:
            by_t.setdefault(t, {})[mode] = v
    times = sorted(by_t)
    out = []
    for a, b in zip(times, times[1:]):
        before, after = by_t[a], by_t[b]
        modes = set(before) & set(after)
        total = sum(after[m] - before[m] for m in modes)
        if total <= 0:
            continue
        idle = after.get("idle", 0) - before.get("idle", 0)
        steal = after.get("steal", 0) - before.get("steal", 0)
        out.append((b, max(0.0, 1 - idle / total), max(0.0, steal / total)))
    return out


def one(host, metric, start, end, **extra):
    data = series(metric, host, start, end, **extra)
    return data[0][1] if data else []


def memory_used(host, start, end):
    total = dict(one(host, "memory_total", start, end))
    avail = dict(one(host, "memory_available", start, end))
    return [(t, total[t] - avail[t], total[t]) for t in sorted(total) if t in avail and total[t] > 0]


def stats(values):
    if not values:
        return None
    return sum(values) / len(values), max(values)


def pct(x):
    return f"{100 * x:.1f}%"


def window_rows(label, t0, cpu, mem, load, bw_in, bw_out):
    c = stats([b for t, b, _ in cpu if t >= t0])
    s = stats([st for t, _, st in cpu if t >= t0])
    m = [(u, tot) for t, u, tot in mem if t >= t0]
    ld = stats([v for t, v in load if t >= t0])
    i = stats([v for t, v in bw_in if t >= t0])
    o = stats([v for t, v in bw_out if t >= t0])
    mem_txt = "n/a"
    if m:
        used = [u for u, _ in m]
        total = m[-1][1]
        mem_txt = f"{sum(used) / len(used) / 2**20:.0f} MB avg, {max(used) / 2**20:.0f} MB peak of {total / 2**20:.0f} MB"
    return (
        f"| {label} | {pct(c[0]) + ' avg, ' + pct(c[1]) + ' peak' if c else 'n/a'} | {pct(s[1]) + ' peak' if s else 'n/a'} | {mem_txt} | "
        f"{f'{ld[0]:.2f} avg, {ld[1]:.2f} peak' if ld else 'n/a'} | "
        f"{f'{i[0]:.3f} avg, {i[1]:.3f} peak' if i else 'n/a'} | {f'{o[0]:.3f} avg, {o[1]:.3f} peak' if o else 'n/a'} |"
    )


def health():
    if not HEALTH_URL:
        return "not checked (no DOMAIN)"
    # Cloudflare turns away Python's default user agent, so say who is asking.
    req = urllib.request.Request(HEALTH_URL, headers={"User-Agent": "blockyrts-server-load/1", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = json.load(r)
        return f"answering, build `{str(body.get('build', '?'))[:7]}`, {body.get('rooms', '?')} rooms open right now"
    except urllib.error.HTTPError as e:
        return f"did not answer (HTTP {e.code})"
    except Exception as e:  # noqa: BLE001 - any failure is the answer here
        return f"did not answer ({type(e).__name__})"


def main():
    if not TOKEN:
        print("::error::DIGITALOCEAN_TOKEN is not set (repository secret).")
        return 1
    hours = max(1, min(24 * 14, int(os.environ.get("HOURS", "24") or 24)))
    droplets = get("/v2/droplets", name=DROPLET).get("droplets", [])
    if not droplets:
        print(f"::error::No Droplet named {DROPLET}.")
        return 1
    d = droplets[0]
    host = str(d["id"])
    end = int(time.time())
    start = end - hours * 3600
    print(f"Reading the last {hours} h of DigitalOcean Monitoring for {DROPLET}")
    cpu = cpu_busy(host, start, end)
    mem = memory_used(host, start, end)
    load = one(host, "load_5", start, end)
    bw_in = one(host, "bandwidth", start, end, interface="public", direction="inbound")
    bw_out = one(host, "bandwidth", start, end, interface="public", direction="outbound")

    lines = [
        "## Server load (read-only)",
        "",
        f"Droplet `{DROPLET}`: {d.get('size_slug', '?')} ({d.get('vcpus', '?')} vCPU, {d.get('memory', '?')} MB), {d.get('region', {}).get('slug', '?')}.",
        f"Server: {health()}.",
        "",
        "CPU is the share of the Droplet's CPU in use (100% is all of it). Steal is CPU time the host gave to other machines. "
        "Load is the 5-minute load average (1.0 keeps one vCPU fully busy). Bandwidth is the public network in megabits per second.",
        "",
        "| Window | CPU | Steal | Memory used | Load | In (Mbps) | Out (Mbps) |",
        "|---|---|---|---|---|---|---|",
    ]
    for label, span in (("Last hour", 3600), ("Last 6 hours", 6 * 3600), (f"Last {hours} hours", hours * 3600)):
        if span <= hours * 3600:
            lines.append(window_rows(label, end - span, cpu, mem, load, bw_in, bw_out))
    lines += ["", "### Hour by hour", "", "| Hour from (UTC) | CPU avg | CPU peak | Memory peak | Out peak (Mbps) |", "|---|---|---|---|---|"]
    for h in range(min(hours, 48) - 1, -1, -1):
        a, b = end - (h + 1) * 3600, end - h * 3600
        c = stats([x for t, x, _ in cpu if a < t <= b])
        m = [u for t, u, _ in mem if a < t <= b]
        o = [v for t, v in bw_out if a < t <= b]
        if not c and not m:
            continue
        stamp = time.strftime("%m-%d %H:%M", time.gmtime(a))
        lines.append(
            f"| {stamp} | {pct(c[0]) if c else 'n/a'} | {pct(c[1]) if c else 'n/a'} | "
            f"{f'{max(m) / 2**20:.0f} MB' if m else 'n/a'} | {f'{max(o):.3f}' if o else 'n/a'} |"
        )
    text = "\n".join(lines) + "\n"
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())

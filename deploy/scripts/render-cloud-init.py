#!/usr/bin/env python3
"""Writes the Droplet's cloud-init file to stdout.

Reads the settings from environment variables set by the setup workflow and
embeds deploy/droplet/update.sh plus the systemd timers. Secrets land in
/opt/blockyrts/.env and /root/.docker/config.json with mode 0600.
"""
import os
import pathlib
import sys

import yaml

HERE = pathlib.Path(__file__).resolve().parent.parent


def literal(dumper: yaml.SafeDumper, value: str) -> yaml.ScalarNode:
    style = "|" if "\n" in value else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style=style)


yaml.SafeDumper.add_representer(str, literal)

ENV_KEYS = [
    "DOMAIN",
    "REGISTRY",
    "TUNNEL_TOKEN",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "EMAIL_API_KEY",
    "EMAIL_FROM",
]


OPTIONAL_KEYS = {"EMAIL_API_KEY"}


def need(key: str, plain: bool = True) -> str:
    value = os.environ.get(key, "")
    if not value and key in OPTIONAL_KEYS:
        return value
    if not value:
        sys.exit(f"render-cloud-init: {key} is missing")
    # The .env file is read by /bin/sh, so keep its values to one plain word.
    if plain and any(c in value for c in " \t\n'\"$`<>;&|\\"):
        sys.exit(f"render-cloud-init: {key} has a character the .env file cannot hold")
    return value


env_file = "".join(f"{key}={need(key)}\n" for key in ENV_KEYS)
docker_config = need("REGISTRY_DOCKER_CONFIG", plain=False)

update_unit = """[Unit]
Description=Pull and apply the latest blockyrts bundle
After=docker.service network-online.target mnt-blockyrts\\x2ddata.mount
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/blockyrts/update.sh
"""
update_timer = """[Unit]
Description=Check the registry for a new blockyrts deploy every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s

[Install]
WantedBy=timers.target
"""
backup_unit = """[Unit]
Description=Dump the blockyrts database to R2

[Service]
Type=oneshot
ExecStart=/opt/blockyrts/bundle/backup.sh
"""
backup_timer = """[Unit]
Description=Nightly blockyrts database backup (10:00 UTC, 3 a.m. Pacific)

[Timer]
OnCalendar=*-*-* 10:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
"""

volume = "/dev/disk/by-id/scsi-0DO_Volume_blockyrts-data"
config = {
    "package_update": True,
    "packages": ["docker.io", "docker-compose-v2", "openssl"],
    "write_files": [
        {"path": "/opt/blockyrts/.env", "permissions": "0600", "content": env_file},
        {"path": "/root/.docker/config.json", "permissions": "0600", "content": docker_config},
        {
            "path": "/opt/blockyrts/update.sh",
            "permissions": "0755",
            "content": (HERE / "droplet" / "update.sh").read_text(),
        },
        {"path": "/etc/systemd/system/blockyrts-update.service", "content": update_unit},
        {"path": "/etc/systemd/system/blockyrts-update.timer", "content": update_timer},
        {"path": "/etc/systemd/system/blockyrts-backup.service", "content": backup_unit},
        {"path": "/etc/systemd/system/blockyrts-backup.timer", "content": backup_timer},
    ],
    "runcmd": [
        "mkdir -p /mnt/blockyrts-data",
        f"grep -q blockyrts-data /etc/fstab || echo '{volume} /mnt/blockyrts-data ext4 defaults,nofail,discard 0 2' >> /etc/fstab",
        "mount -a",
        "systemctl enable --now docker",
        "systemctl daemon-reload",
        "systemctl enable --now blockyrts-update.timer blockyrts-backup.timer",
    ],
}

sys.stdout.write("#cloud-config\n")
sys.stdout.write(yaml.safe_dump(config, sort_keys=False, width=1000))

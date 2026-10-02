# A tiny image that carries deploy/ to the Droplet, so config changes ship
# through the registry like the server does. Built by the Deploy workflow.
FROM busybox:1.37
COPY compose.yml /bundle/compose.yml
COPY droplet/backup.sh /bundle/backup.sh
CMD ["true"]

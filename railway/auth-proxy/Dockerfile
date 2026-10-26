# I have no login of my own, so on Railway this proxy stands between the
# public internet and my harness. Railway's edge terminates TLS and hands
# Caddy plain HTTP on $PORT; Caddy asks for a username and password, then
# forwards to my harness over Railway's private network.
#
# Railway builds this with the root directory set to railway/auth-proxy, so
# the build context is this directory.
FROM caddy:2.10-alpine

COPY Caddyfile /etc/caddy/Caddyfile

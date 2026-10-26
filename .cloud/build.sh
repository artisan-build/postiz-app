#!/usr/bin/env bash
set -euo pipefail
mkdir -p .cloud/bin
case "$(uname -m)" in
  x86_64)
    arch=amd64
    server_sha=b0427be65cac0859e84e7db65674fc30bbf40f118722dd2b23d0ab33a07e797d
    cli_sha=e2063feade24d90cec1590dd9a46b0ccf838433b013738a348af1c01a9cb3874
    ;;
  aarch64|arm64)
    arch=arm64
    server_sha=697d94f1b2dd25576d3f83a0e3fdf9ee8503cdce4ce783069c6d1a6034fb8803
    cli_sha=3309f004380edc51ad833937bfd16fe3f2b93aa80f8b46b788de4e371f7628f2
    ;;
  *) echo 'Unsupported architecture' >&2; exit 1 ;;
esac
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
curl -fLsS --retry 3 "https://github.com/temporalio/temporal/releases/download/v1.28.1/temporal_1.28.1_linux_${arch}.tar.gz" -o "$scratch/server.tgz"
echo "$server_sha  $scratch/server.tgz" | sha256sum --check
tar -xzf "$scratch/server.tgz" -C .cloud/bin temporal-server temporal-sql-tool
curl -fLsS --retry 3 "https://github.com/temporalio/cli/releases/download/v1.4.1/temporal_cli_1.4.1_linux_${arch}.tar.gz" -o "$scratch/cli.tgz"
echo "$cli_sha  $scratch/cli.tgz" | sha256sum --check
tar -xzf "$scratch/cli.tgz" -C .cloud/bin temporal

corepack prepare pnpm@10.6.1 --activate
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=8192 node -r ./.cloud/environment.cjs -e \
  "require('node:child_process').execFileSync('pnpm', ['run', 'build'], {stdio: 'inherit'})"

#!/bin/sh

set -e

usage() {
    echo Usage:
    echo "release.sh <version>"
}

if [ -z "$1" ]; then
    usage
    exit 1
fi
version="$1"
git checkout master
sed --in-place \
    "s/\"version\": \".*\"/\"version\": \"$version\"/g" \
    package.json
gulp build-release
cd dist && zip -o dist.zip -r * && cd ..
git add .
git commit -m "Release $version."
git tag -a -m "v$version" v$version
git push origin master
git push origin v$version

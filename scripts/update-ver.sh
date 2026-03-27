#!/bin/bash
set -e

VERSION_FILE="VERSION"
TODAY_MONTH=$(date +%-m)
TODAY_DAY=$(date +%-d)
TODAY_VER="0.${TODAY_MONTH}.${TODAY_DAY}"

# 带参数：直接写入指定版本
if [ -n "$1" ]; then
  echo "$1" > "$VERSION_FILE"
  echo "Version set to $1"
  exit 0
fi

# 无参数：自动判断
CURRENT=$(cat "$VERSION_FILE" | tr -d '[:space:]')

# 取当前版本前三段（0.M.D）和第四段（如果有）
IFS='.' read -r V0 V1 V2 V3 <<< "$CURRENT"
CURRENT_BASE="${V0}.${V1}.${V2}"

if [ "$CURRENT_BASE" = "$TODAY_VER" ]; then
  # 今天已有版本，自增第四段
  if [ -n "$V3" ]; then
    NEXT=$((V3 + 1))
  else
    NEXT=1
  fi
  NEW_VER="${TODAY_VER}.${NEXT}"
else
  # 新的一天，重置为当天日期
  NEW_VER="$TODAY_VER"
fi

echo "$NEW_VER" > "$VERSION_FILE"
echo "Version: $CURRENT → $NEW_VER"

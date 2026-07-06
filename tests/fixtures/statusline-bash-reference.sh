#!/usr/bin/env bash
# ~/.claude/statusline-command.sh
# Claude Code status line — single line, truecolor RGB gradient
# repo · 🌿 branch · 20-block ctx bar · emoji · ctx% · 7d% · 5h% · velocity · 🤖 model

input=$(cat)

# ── ANSI / truecolor helpers ─────────────────────────────────────────────────
RESET='\033[0m'
DIM='\033[2m'
BOLD='\033[1m'
GRAY='\033[38;2;120;120;120m'

rgb_fg() { printf '\033[38;2;%d;%d;%dm' "$1" "$2" "$3"; }

# Linear interpolation between two RGB colors at t in [0,1]
lerp_rgb() {
  local t="$1" r1="$2" g1="$3" b1="$4" r2="$5" g2="$6" b2="$7"
  local r g b
  r=$(awk -v a="$r1" -v b="$r2" -v t="$t" 'BEGIN{printf "%d", a + (b-a)*t}')
  g=$(awk -v a="$g1" -v b="$g2" -v t="$t" 'BEGIN{printf "%d", a + (b-a)*t}')
  b=$(awk -v a="$b1" -v b="$b2" -v t="$t" 'BEGIN{printf "%d", a + (b-a)*t}')
  rgb_fg "$r" "$g" "$b"
}

# Color for a percentage (0-100) using green→yellow→red gradient
pct_rgb() {
  local pct="$1"
  [ -z "$pct" ] && pct=0
  if   [ "$pct" -le 50 ]; then
    local t
    t=$(awk -v p="$pct" 'BEGIN{printf "%.4f", p/50}')
    lerp_rgb "$t" 0 200 80   220 200 0
  else
    local t
    t=$(awk -v p="$pct" 'BEGIN{printf "%.4f", (p-50)/50}')
    [ "$pct" -ge 100 ] && t=1
    lerp_rgb "$t" 220 200 0   220 40 20
  fi
}

# Emoji that scales with context usage
ctx_emoji() {
  local pct="$1"
  if   [ "$pct" -ge 90 ]; then printf '🚨'
  elif [ "$pct" -ge 70 ]; then printf '🔥'
  elif [ "$pct" -ge 20 ]; then printf '⚡'
  else                         printf '🟢'
  fi
}

format_reset_time() {
  local epoch="$1"
  if [ -z "$epoch" ] || [ "$epoch" = "null" ]; then printf ''; return; fi
  local now
  now=$(date +%s)
  local diff=$(( epoch - now ))
  if   [ "$diff" -le 0 ];     then printf 'now'
  elif [ "$diff" -lt 3600 ];  then printf '%dm' $(( diff / 60 ))
  elif [ "$diff" -lt 86400 ]; then printf '%dh%dm' $(( diff / 3600 )) $(( (diff % 3600) / 60 ))
  else                             printf '%dd%dh' $(( diff / 86400 )) $(( (diff % 86400) / 3600 ))
  fi
}

# ── Extract fields ───────────────────────────────────────────────────────────
model_name=$(echo "$input"  | jq -r '.model.display_name // ""')
cwd=$(echo "$input"         | jq -r '.workspace.current_dir // .cwd // ""')
ctx_used=$(echo "$input"    | jq -r '.context_window.used_percentage // empty')
five_pct=$(echo "$input"    | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_reset=$(echo "$input"  | jq -r '.rate_limits.five_hour.resets_at       // empty')
week_pct=$(echo "$input"    | jq -r '.rate_limits.seven_day.used_percentage // empty')
week_reset=$(echo "$input"  | jq -r '.rate_limits.seven_day.resets_at       // empty')

# ── Git: repo, branch, code velocity ─────────────────────────────────────────
repo_name=""
git_branch=""
added=0
removed=0
if [ -n "$cwd" ]; then
  git_root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
  if [ -n "$git_root" ]; then
    repo_name=$(basename "$git_root")
    git_branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null)
    [ -z "$git_branch" ] && git_branch=$(git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
    diff_stats=$(git -C "$cwd" diff --shortstat HEAD 2>/dev/null)
    added=$(printf '%s' "$diff_stats"   | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || true)
    removed=$(printf '%s' "$diff_stats" | grep -oE '[0-9]+ deletion'  | grep -oE '[0-9]+' || true)
    [ -z "$added" ]   && added=0
    [ -z "$removed" ] && removed=0
  fi
fi

# ── Color anchors ────────────────────────────────────────────────────────────
BOLD_YELLOW=$(rgb_fg 230 200 50)
BOLD_CYAN=$(rgb_fg 80 220 230)
MAGENTA=$(rgb_fg 220 100 220)
GREEN_DELTA=$(rgb_fg 0 200 80)
RED_DELTA=$(rgb_fg 220 40 20)
EMPTY_BLOCK=$(rgb_fg 60 60 60)
SEP="${GRAY}|${RESET}"

out=""

# Repo
if [ -n "$repo_name" ]; then
  out="${out}${BOLD}${BOLD_YELLOW}${repo_name}${RESET}"
fi

# 🌿 branch
if [ -n "$git_branch" ]; then
  [ -n "$out" ] && out="${out} ${SEP} "
  out="${out}${BOLD}${BOLD_CYAN}🌿 (${git_branch})${RESET}"
fi

# 20-block context bar with RGB gradient
if [ -n "$ctx_used" ] && [ "$ctx_used" != "null" ]; then
  ctx_int=$(printf '%.0f' "$ctx_used")
  [ "$ctx_int" -gt 100 ] && ctx_int=100
  bar_total=20
  bar_filled=$(( ctx_int * bar_total / 100 ))
  [ "$bar_filled" -gt "$bar_total" ] && bar_filled=$bar_total

  bar=""
  if [ "$bar_filled" -gt 0 ]; then
    for i in $(seq 1 "$bar_filled"); do
      # Color each filled block by its position along the bar (0..100)
      block_pct=$(( (i - 1) * 100 / (bar_total - 1) ))
      bar="${bar}$(pct_rgb "$block_pct")█"
    done
  fi
  empty=$(( bar_total - bar_filled ))
  if [ "$empty" -gt 0 ]; then
    bar="${bar}${EMPTY_BLOCK}"
    for i in $(seq 1 "$empty"); do bar="${bar}░"; done
  fi
  bar="${bar}${RESET}"

  emoji=$(ctx_emoji "$ctx_int")
  pct_col=$(pct_rgb "$ctx_int")

  [ -n "$out" ] && out="${out} ${SEP} "
  out="${out}${bar} ${emoji} ${pct_col}${ctx_int}%${RESET}"
fi

# Weekly usage
if [ -n "$week_pct" ]; then
  week_int=$(printf '%.0f' "$week_pct")
  [ "$week_int" -gt 100 ] && week_int=100
  week_col=$(pct_rgb "$week_int")
  week_time=$(format_reset_time "$week_reset")
  [ -n "$out" ] && out="${out} ${SEP} "
  out="${out}${DIM}7d:${RESET}${week_col}${week_int}%${RESET}"
  [ -n "$week_time" ] && out="${out}${DIM}(${week_time})${RESET}"
fi

# 5-hour usage
if [ -n "$five_pct" ]; then
  five_int=$(printf '%.0f' "$five_pct")
  [ "$five_int" -gt 100 ] && five_int=100
  five_col=$(pct_rgb "$five_int")
  five_time=$(format_reset_time "$five_reset")
  [ -n "$out" ] && out="${out} ${SEP} "
  out="${out}${DIM}5h:${RESET}${five_col}${five_int}%${RESET}"
  [ -n "$five_time" ] && out="${out}${DIM}(${five_time})${RESET}"
fi

# Code velocity
if [ "$added" -gt 0 ] || [ "$removed" -gt 0 ]; then
  [ -n "$out" ] && out="${out} ${SEP} "
  out="${out}${GREEN_DELTA}+${added}${RESET} ${RED_DELTA}-${removed}${RESET}"
fi

# 🤖 model
if [ -n "$model_name" ]; then
  [ -n "$out" ] && out="${out} ${SEP} "
  out="${out}${MAGENTA}🤖 ${model_name}${RESET}"
fi

printf '%b' "$out"

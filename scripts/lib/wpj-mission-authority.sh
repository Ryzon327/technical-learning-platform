#!/usr/bin/env bash
# WP-J — the shared reader for the mission authority declaration.
#
# ## Why this exists
#
# Before DEC-061, six scripts each encoded their own assumption about the
# course's authoring state. `verify-wpj.sh` named the next unauthored mission
# in a variable, and `verify-wpj-m3.sh` through `verify-wpj-m7.sh` each asserted
# that variable was gone and that a LATER one existed. That worked, and it
# survived three boundary moves without going stale — but it meant five gates
# held an opinion about a mission that had not been authored yet, and all five
# would have broken at once on the move that has no successor.
#
# One reader, one declaration. A mission gate owns its mission. The top-level
# gate owns the course's authoring state.
#
# ## What a caller gets
#
#   wpj_mission_authority_load        reads and validates the declaration
#   WPJ_MISSION_ORDER                 approved stableIds, in approved order
#   WPJ_AUTHORED_MISSIONS             those declared authored, in order
#   WPJ_UNAUTHORED_MISSIONS           those declared unauthored, in order
#   WPJ_AUTHORING_STATE               STAGED or FULLY_AUTHORED
#   wpj_mission_is_authored <id>      exit 0 when that mission is declared authored
#
# ## No pipelines into grep
#
# Under `set -o pipefail`, `echo "$BIG" | grep -q` can return 141 when grep
# exits on an early match while echo is still writing. Every check here reads a
# FILE or iterates an array. The repository has fixed that race twice already
# and does not intend to reintroduce it here.

WPJ_MISSION_DECLARATION="${WPJ_MISSION_DECLARATION:-scripts/lib/wpj-missions.txt}"

WPJ_MISSION_ORDER=()
WPJ_AUTHORED_MISSIONS=()
WPJ_UNAUTHORED_MISSIONS=()
WPJ_AUTHORING_STATE=""

# Callers already define `fail`. Using theirs keeps one failure vocabulary and
# one exit path rather than a second convention that reports differently.
wpj_authority_fail() {
  if declare -F fail >/dev/null 2>&1; then
    fail "$1"
  else
    echo "GATE FAIL: $1" >&2
    exit 1
  fi
}

wpj_mission_authority_load() {
  [ -f "$WPJ_MISSION_DECLARATION" ] \
    || wpj_authority_fail "the mission authority declaration is missing: $WPJ_MISSION_DECLARATION"

  WPJ_MISSION_ORDER=()
  WPJ_AUTHORED_MISSIONS=()
  WPJ_UNAUTHORED_MISSIONS=()

  local previous=0
  local line position mission state

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '#'*|'') continue ;;
    esac

    IFS='|' read -r position mission state <<< "$line"

    [ -n "$position" ] && [ -n "$mission" ] && [ -n "$state" ] \
      || wpj_authority_fail "the mission declaration has a malformed row: $line"

    case "$position" in
      ''|*[!0-9]*) wpj_authority_fail "the mission declaration has a non-numeric position: $line" ;;
    esac

    # Ordering is an assertion, not a convention. A row that jumps or repeats
    # would let the declared order disagree with the document's order while
    # every individual row still looked correct.
    [ "$position" -gt "$previous" ] \
      || wpj_authority_fail "the mission declaration is out of order at position $position; positions must increase"
    previous="$position"

    case "$state" in
      authored) WPJ_AUTHORED_MISSIONS+=("$mission") ;;
      unauthored) WPJ_UNAUTHORED_MISSIONS+=("$mission") ;;
      *) wpj_authority_fail "the mission declaration has an unknown state \"$state\" for $mission; expected authored or unauthored" ;;
    esac

    WPJ_MISSION_ORDER+=("$mission")
  done < "$WPJ_MISSION_DECLARATION"

  [ "${#WPJ_MISSION_ORDER[@]}" -gt 0 ] \
    || wpj_authority_fail "the mission declaration lists no missions"

  # Derived, never declared. A separately declared state could disagree with
  # the rows it summarises, and then something would have to pick a winner.
  if [ "${#WPJ_UNAUTHORED_MISSIONS[@]}" -eq 0 ]; then
    WPJ_AUTHORING_STATE="FULLY_AUTHORED"
  else
    WPJ_AUTHORING_STATE="STAGED"
  fi
}

wpj_mission_is_authored() {
  local wanted="$1" mission
  for mission in "${WPJ_AUTHORED_MISSIONS[@]}"; do
    [ "$mission" = "$wanted" ] && return 0
  done
  return 1
}

# Assert a mission is declared authored, with a message a maintainer can act on.
#
# This is what a per-mission gate calls INSTEAD of asserting that some later
# mission's anchor exists. It is true in both authoring states and cannot go
# stale when a later slice lands, which is the whole reason it replaced the
# anchor assertions.
wpj_require_authored() {
  local mission="$1" gate="$2"
  wpj_mission_is_authored "$mission" \
    || wpj_authority_fail "the mission authority declaration does not list $mission as authored; $gate verifies a mission the course does not claim to have authored"
}

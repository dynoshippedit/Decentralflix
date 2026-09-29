#!/bin/bash
# checkup-df13-2026-09-29 / check-drift-refusal
# Proves the ABI-drift guard FAILS on a stale ABI.
# Exits 0 iff the guard refused (vitest nonzero) and the generated file was restored.
# The runner sets cwd to apps/frontend.
set -u
GEN="lib/contracts/abis.generated.ts"
BAK="/tmp/checkup_df13_abis.bak"
cp "$GEN" "$BAK"
python3 - << "PYEOF"
p = "lib/contracts/abis.generated.ts"
s = open(p).read()
i = s.find("TICKET_NFT_ABI_FULL")
assert i != -1, "TICKET_NFT_ABI_FULL const not found"
j = s.find("{", i)
assert j != -1
depth = 0
k = j
while True:
    c = s[k]
    if c == "{":
        depth += 1
    elif c == "}":
        depth -= 1
        if depth == 0:
            break
    k += 1
m = k + 1
while m < len(s) and s[m] in ", \n":
    m += 1
open(p, "w").write(s[:j] + s[m:])
print("tampered: removed first ABI entry of TICKET_NFT_ABI_FULL")
PYEOF
npx vitest run lib/contracts/abi-drift.test.ts > /tmp/checkup_df13_drift.log 2>&1
code=$?
cp "$BAK" "$GEN"
rm -f "$BAK"
if [ "$code" -ne 0 ]; then
  echo "REFUSAL OBSERVED: drift guard failed as expected (vitest exit $code)"
  grep -E "AssertionError|expected" /tmp/checkup_df13_drift.log | head -3
  exit 0
else
  echo "GUARD DID NOT FIRE: drift test passed on tampered ABI"
  exit 1
fi

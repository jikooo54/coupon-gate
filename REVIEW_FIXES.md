# Couponwell review fixes

Previous StudioNet contract, before the independent-authority hardening:
`0xC4aa3F6a75Cdc19c94d102Dc6bb3852e204430F9`

Previous deployment transaction:
`0x368314992a856a89d2cdedd4c64894b9bae604198fd1e8ffeb37ec7cbe3e8caa`

This repository state contains the current review fix and should be redeployed
before resubmission.

## Reviewer issue addressed

- A merchant posts stake and proves control of its HTTPS merchant origin through
  `/.well-known/couponwell-verification.txt`:

```text
operator=0xMerchantWallet
```

- Coupon usage and settlement evidence must be HTTPS resources from a separate
  contract-registered issuer/acquirer authority origin. The authority is
  verified through `/.well-known/couponwell-authority.txt`:

```text
couponwell-authority=true
origin=https://issuer.example
```

- Merchant-controlled coupon or payment record URLs are rejected even if their
  bytes match the submitted SHA-256 hashes.
- Coupon and payment records must match the submitted SHA-256 hashes before
  LLM reconciliation begins.
- Merchant stake cannot be withdrawn while any coupon has an unresolved slash
  liability.
- Every escrow has a 48-hour attestation deadline. If the merchant does not
  attest, the holder can call `timeout_refund`.
- A second 48-hour reconciliation deadline starts when the merchant attests.
  If consensus reconciliation stalls or never completes, the holder can call
  `reconcile_timeout_refund` and recover the escrow instead of staying locked.
- Finalization releases the liability exactly once and deterministically
  handles valid payout, invalid refund, and merchant slashing.
- The integrated client exposes both recovery paths and sends writes through
  the connected RainbowKit/wagmi signer, not only through a displayed address.
- The integrated client also exposes authority registration/verification and
  requires an authority origin when a coupon is escrowed.

## Verification

```bash
genvm-lint check backend/coupon-gate.py --json
pytest tests/direct -q
cd frontend && npm run build
```

Tests cover withdrawal locking, initial timeout refund and unlock,
post-attestation reconciliation-timeout recovery, authenticated evidence hash
checks, verified independent authority gating, rejection of merchant-controlled
records, valid payout, invalid refund, and slash behavior.

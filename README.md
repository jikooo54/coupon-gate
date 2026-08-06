# coupon-gate

GenLayer intelligent contract project.

## Links
- **App**: https://jikooo54.github.io/coupon-gate/
- **Contract**: `backend/coupon-gate.py`

## Tech Stack
- Frontend: React + TypeScript + Vite
- Backend: GenLayer Python Contract

## Review hardening
- Merchant stake remains bonded while any coupon can still create slash liability.
- Holders have two recovery paths: missed merchant attestation and stalled post-attestation reconciliation.
- Coupon and payment records are fetched by validators from a separately registered and verified issuer/acquirer authority origin, not from the merchant origin, and checked against submitted SHA-256 hashes before LLM reconciliation.
- Contract regression tests live in `tests/direct`.

## Reproducible validation

```bash
python -m pip install -r requirements.txt
genvm-lint check backend/coupon-gate.py --json
python -m pytest tests -v
cd frontend
npm ci
npm run build
```

On Windows:

```powershell
.\scripts\validate_all.ps1
```

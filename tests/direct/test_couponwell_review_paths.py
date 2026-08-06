import hashlib
import json


CONTRACT = "backend/coupon-gate.py"
GEN = 10**18
STAKE = 10 * GEN
ESCROW = 2 * GEN
ORIGIN = "https://merchant.example"
AUTHORITY_ORIGIN = "https://issuer.example"
USAGE_URL = AUTHORITY_ORIGIN + "/records/coupon.json"
PAYMENT_URL = AUTHORITY_ORIGIN + "/records/payment.json"
USAGE_BODY = json.dumps(
    {
        "coupon_id": "CPN-100",
        "holder": "shopper",
        "face_value": 100,
        "redeemed_at": "2026-07-03T09:15:00Z",
        "terminal": "POS-7",
    },
    sort_keys=True,
)
PAYMENT_BODY = json.dumps(
    {
        "coupon_id": "CPN-100",
        "settled_to_merchant": 100,
        "payment_ref": "pay-100",
        "settled_at": "2026-07-03T09:16:00Z",
    },
    sort_keys=True,
)


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def addr_hex(addr) -> str:
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + bytes(addr).hex()
    return str(addr)


def deploy(direct_vm, direct_deploy, owner):
    direct_vm.sender = owner
    return direct_deploy(CONTRACT)


def enrol_verified_merchant(direct_vm, contract, merchant):
    direct_vm.sender = merchant
    direct_vm.value = STAKE
    contract.enrol_merchant("Coupon Merchant", ORIGIN)
    direct_vm.value = 0
    direct_vm.mock_web(
        r".*merchant\.example/\.well-known/couponwell-verification\.txt.*",
        {"status": 200, "body": "operator=" + addr_hex(merchant).lower()},
    )
    contract.verify_merchant()


def register_verified_authority(direct_vm, contract, owner):
    direct_vm.sender = owner
    contract.register_authority("Independent issuer registry", AUTHORITY_ORIGIN)
    direct_vm.mock_web(
        r".*issuer\.example/\.well-known/couponwell-authority\.txt.*",
        {"status": 200, "body": "couponwell-authority=true\norigin=" + AUTHORITY_ORIGIN},
    )
    contract.verify_authority(AUTHORITY_ORIGIN)


def escrow_coupon(direct_vm, contract, holder, merchant):
    direct_vm.sender = holder
    direct_vm.value = ESCROW
    contract.escrow_coupon(addr_hex(merchant), 100, AUTHORITY_ORIGIN, USAGE_URL, sha256(USAGE_BODY))
    direct_vm.value = 0
    return 0


def attest_coupon(direct_vm, contract, merchant, coupon_id=0):
    direct_vm.sender = merchant
    contract.attest_settlement(coupon_id, PAYMENT_URL, sha256(PAYMENT_BODY))


def force_attestation_deadline_passed(contract, coupon_id=0):
    coupon = contract.coupons[coupon_id]
    coupon.attest_deadline = 1
    contract.coupons[coupon_id] = coupon


def force_reconciliation_deadline_passed(contract, coupon_id=0):
    coupon = contract.coupons[coupon_id]
    coupon.reconcile_deadline = 1
    contract.coupons[coupon_id] = coupon


def mock_authenticated_evidence(direct_vm):
    direct_vm.mock_web(
        r".*issuer\.example/records/coupon\.json.*",
        {"status": 200, "body": USAGE_BODY},
    )
    direct_vm.mock_web(
        r".*issuer\.example/records/payment\.json.*",
        {"status": 200, "body": PAYMENT_BODY},
    )


def mock_valid_reconciliation(direct_vm):
    mock_authenticated_evidence(direct_vm)
    direct_vm.mock_llm(
        r"[\s\S]*PASS 1 of 2[\s\S]*",
        json.dumps({"confidence": 92, "rationale": "Usage and payment records match."}),
    )
    direct_vm.mock_llm(
        r"[\s\S]*PASS 2 of 2[\s\S]*",
        json.dumps({"validated_units": 100, "rationale": "Full face value settled."}),
    )


def mock_false_reconciliation(direct_vm):
    mock_authenticated_evidence(direct_vm)
    direct_vm.mock_llm(
        r"[\s\S]*PASS 1 of 2[\s\S]*",
        json.dumps({"confidence": 10, "rationale": "Payment does not authenticate redemption."}),
    )
    direct_vm.mock_llm(
        r"[\s\S]*PASS 2 of 2[\s\S]*",
        json.dumps({"validated_units": 0, "rationale": "No matching settlement proven."}),
    )


def test_withdrawal_stays_locked_while_coupon_can_create_slash_liability(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp("2026-07-03T00:00:00Z")
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    register_verified_authority(direct_vm, contract, direct_owner)
    enrol_verified_merchant(direct_vm, contract, direct_bob)
    escrow_coupon(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("stake remains bonded"):
        contract.withdraw_stake()

    merchant = contract.get_merchant(addr_hex(direct_bob))
    assert int(merchant.open_liabilities) == 1
    assert int(contract.get_staked_balance()) == STAKE


def test_holder_timeout_refund_when_merchant_never_attests_unlocks_liability(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp("2026-07-03T00:00:00Z")
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    register_verified_authority(direct_vm, contract, direct_owner)
    enrol_verified_merchant(direct_vm, contract, direct_bob)
    escrow_coupon(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("deadline has not passed"):
        contract.timeout_refund(0)

    force_attestation_deadline_passed(contract)
    contract.timeout_refund(0)
    coupon = contract.get_coupon(0)
    merchant = contract.get_merchant(addr_hex(direct_bob))
    assert int(coupon.status) == 3
    assert coupon.outcome == "INVALID"
    assert int(coupon.escrow) == 0
    assert int(merchant.open_liabilities) == 0
    assert int(contract.get_pool_balance()) == 0


def test_holder_recovery_after_attested_coupon_stalls_before_reconciliation(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp("2026-07-03T00:00:00Z")
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    register_verified_authority(direct_vm, contract, direct_owner)
    enrol_verified_merchant(direct_vm, contract, direct_bob)
    escrow_coupon(direct_vm, contract, direct_alice, direct_bob)
    attest_coupon(direct_vm, contract, direct_bob)

    coupon = contract.get_coupon(0)
    assert int(coupon.status) == 1
    assert int(coupon.reconcile_deadline) > int(coupon.attest_deadline) - 1

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("reconciliation deadline has not passed"):
        contract.reconcile_timeout_refund(0)

    force_reconciliation_deadline_passed(contract)
    paths = contract.get_recovery_paths(0)
    assert paths["can_reconcile_timeout_refund"] is True
    contract.reconcile_timeout_refund(0)
    coupon = contract.get_coupon(0)
    merchant = contract.get_merchant(addr_hex(direct_bob))
    assert int(coupon.status) == 3
    assert coupon.outcome == "INVALID"
    assert int(coupon.escrow) == 0
    assert int(merchant.open_liabilities) == 0


def test_authenticated_evidence_is_required_before_reconciliation(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp("2026-07-03T00:00:00Z")
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    register_verified_authority(direct_vm, contract, direct_owner)
    enrol_verified_merchant(direct_vm, contract, direct_bob)
    escrow_coupon(direct_vm, contract, direct_alice, direct_bob)
    attest_coupon(direct_vm, contract, direct_bob)

    direct_vm.mock_web(
        r".*issuer\.example/records/coupon\.json.*",
        {"status": 200, "body": "tampered coupon record"},
    )
    direct_vm.mock_web(
        r".*issuer\.example/records/payment\.json.*",
        {"status": 200, "body": PAYMENT_BODY},
    )
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("coupon evidence hash mismatch"):
        contract.reconcile(0)


def test_valid_coupon_payout_finalises_and_unlocks_merchant(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp("2026-07-03T00:00:00Z")
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    register_verified_authority(direct_vm, contract, direct_owner)
    enrol_verified_merchant(direct_vm, contract, direct_bob)
    escrow_coupon(direct_vm, contract, direct_alice, direct_bob)
    attest_coupon(direct_vm, contract, direct_bob)
    mock_valid_reconciliation(direct_vm)

    direct_vm.sender = direct_alice
    contract.reconcile(0)
    contract.finalise(0)
    coupon = contract.get_coupon(0)
    merchant = contract.get_merchant(addr_hex(direct_bob))
    assert coupon.outcome == "VALID"
    assert int(coupon.status) == 3
    assert int(coupon.escrow) == 0
    assert int(merchant.honored) == 1
    assert int(merchant.open_liabilities) == 0
    assert int(contract.get_pool_balance()) == 0


def test_invalid_coupon_refund_and_false_attestation_slashes_stake(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp("2026-07-03T00:00:00Z")
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    register_verified_authority(direct_vm, contract, direct_owner)
    enrol_verified_merchant(direct_vm, contract, direct_bob)
    escrow_coupon(direct_vm, contract, direct_alice, direct_bob)
    attest_coupon(direct_vm, contract, direct_bob)
    mock_false_reconciliation(direct_vm)

    direct_vm.sender = direct_alice
    contract.reconcile(0)
    contract.finalise(0)
    coupon = contract.get_coupon(0)
    merchant = contract.get_merchant(addr_hex(direct_bob))
    expected_slash = STAKE * 1500 // 10000
    assert coupon.outcome == "INVALID"
    assert int(coupon.status) == 3
    assert int(coupon.slashed) == expected_slash
    assert int(merchant.stake) == STAKE - expected_slash
    assert int(merchant.dishonored) == 1
    assert int(merchant.open_liabilities) == 0
    assert int(contract.get_staked_balance()) == STAKE - expected_slash


def test_merchant_controlled_records_are_rejected_even_with_matching_hash(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp("2026-07-03T00:00:00Z")
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    register_verified_authority(direct_vm, contract, direct_owner)
    enrol_verified_merchant(direct_vm, contract, direct_bob)

    direct_vm.sender = direct_alice
    direct_vm.value = ESCROW
    with direct_vm.expect_revert("coupon evidence must come from the verified independent authority"):
        contract.escrow_coupon(
            addr_hex(direct_bob),
            100,
            AUTHORITY_ORIGIN,
            ORIGIN + "/records/coupon.json",
            sha256(USAGE_BODY),
        )
    direct_vm.value = 0


def test_authority_must_be_registered_and_verified_by_contract(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp("2026-07-03T00:00:00Z")
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    enrol_verified_merchant(direct_vm, contract, direct_bob)

    direct_vm.sender = direct_alice
    direct_vm.value = ESCROW
    with direct_vm.expect_revert("coupon evidence authority is not verified"):
        contract.escrow_coupon(addr_hex(direct_bob), 100, AUTHORITY_ORIGIN, USAGE_URL, sha256(USAGE_BODY))
    direct_vm.value = 0

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("owner only"):
        contract.register_authority("Fake", AUTHORITY_ORIGIN)

    register_verified_authority(direct_vm, contract, direct_owner)
    authority = contract.get_authority(AUTHORITY_ORIGIN)
    assert authority.label == "Independent issuer registry"
    assert authority.verified is True

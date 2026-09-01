import assert from "node:assert/strict";
import test from "node:test";

test("normalizes open banking transaction fields into the screen model", async () => {
  const { normalizeOpenBankingTransaction } = await import(
    "../app/admin/group-account-adapter.ts"
  );

  assert.deepEqual(
    normalizeOpenBankingTransaction(
      {
        fintech_use_num: "hidden",
        tran_date: "20260826",
        tran_time: "102030",
        print_content: "네키 운영비",
        tran_amt: "120000",
        after_balance_amt: "880000",
        inout_type: "입금",
      },
      0,
    ),
    {
      id: "20260826102030-0",
      occurredAt: "2026-08-26T10:20:30+09:00",
      description: "네키 운영비",
      direction: "in",
      amount: 120000,
      balanceAfter: 880000,
    },
  );
});

test("does not expose provider identifiers when optional fields are missing", async () => {
  const { normalizeOpenBankingTransaction } = await import(
    "../app/admin/group-account-adapter.ts"
  );
  const result = normalizeOpenBankingTransaction(
    { tran_date: "20260826", tran_amt: "500" },
    1,
  );

  assert.equal(result.description, "거래");
  assert.equal(result.direction, "out");
  assert.equal(result.balanceAfter, null);
  assert.doesNotMatch(JSON.stringify(result), /fintech|account|token/i);
});

test("normalizes the official transaction description field", async () => {
  const { normalizeOpenBankingTransaction } = await import(
    "../app/admin/group-account-adapter.ts"
  );

  assert.deepEqual(
    normalizeOpenBankingTransaction(
      {
        tran_date: "20260826",
        tran_time: "102030",
        printed_content: "공식 예시 거래",
        after_balance_amt: "-1000000",
        tran_amt: "450000",
        inout_type: "출금",
      },
      2,
    ),
    {
      id: "20260826102030-2",
      occurredAt: "2026-08-26T10:20:30+09:00",
      description: "공식 예시 거래",
      direction: "out",
      amount: 450000,
      balanceAfter: -1000000,
    },
  );
});

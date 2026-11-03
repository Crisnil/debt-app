import type { TabValues } from '../google/sheetsApi'

// Made-up data in the same shape as the sheet template (schema v2). Never put real data here.
export const fixtureTabs = [
  'Guide',
  'Settings',
  'Cards',
  'CC Alpha',
  'CC Beta',
  'CardSnapshots',
  'Installments',
  'Payments',
  'Accounts',
  'Transfers',
  'Income',
  'IncomeLog',
  'Categories',
  'Transactions',
]

export const fixtureValues: TabValues = {
  Settings: [
    ['key', 'value', 'note'],
    ['schema_version', 2, ''],
    ['currency', 'PHP', ''],
    ['savings_goal_monthly', 500, ''],
    ['savings_goal_change_month', '2030-03', ''],
    ['savings_goal_monthly_after', 2000, ''],
  ],
  Cards: [
    ['card_id', 'bank', 'name', 'sheet_tab', 'credit_limit', 'statement_day', 'due_day', 'monthly_rate', 'payment_mode', 'fixed_payment', 'daily_use', 'status'],
    ['alpha', 'Alpha Bank', 'Alpha', 'CC Alpha', '', 10, 30, 0.03, 'full', '', true, 'active'],
    ['beta', 'Beta Bank', 'Beta', 'CC Beta', '', 5, 25, 0.03, 'full', '', false, 'active'],
    ['gamma', 'Gamma Bank', 'Gamma', '', '', '', '', 0.03, 'full', '', false, 'closed'],
  ],
  'CC Alpha': [
    ['statement_date', 'post_date', 'txn_date', 'description', 'type', 'amount', 'term_no', 'total_terms', 'category', 'note', 'txn_id'],
    ['2030-01-10', '2030-01-02', '2029-11-02', 'SAMPLE TV', 'installment', 1000, 3, 6, 'Home', '', ''],
    ['2030-01-10', '2030-01-03', '2029-12-03', 'SAMPLE FRIDGE', 'installment', 500.5, 2, 2, 'Home', '', ''],
    ['2030-01-10', '2030-01-05', '2030-01-04', 'SAMPLE GROCER', 'straight', 2500.25, '', '', 'Grocery', '', ''],
    ['2030-01-10', '2030-01-06', '2030-01-06', 'PAYMENT THANK YOU', 'payment', -4000, '', '', '', '', ''],
    ['2029-12-10', '2029-12-02', '2029-11-02', 'SAMPLE TV', 'installment', 1000, 2, 6, 'Home', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
  ],
  'CC Beta': [
    ['statement_date', 'post_date', 'txn_date', 'description', 'type', 'amount', 'term_no', 'total_terms', 'category', 'note'],
    ['2030-01-05', '2030-01-01', '2030-01-01', 'SAMPLE FUEL', 'straight', 1200, '', '', 'Gasoline', ''],
  ],
  CardSnapshots: [
    ['snap_id', 'card_id', 'as_of', 'due_date', 'previous_balance', 'payments_credits', 'purchases_debits', 'outstanding_balance', 'current_due', 'minimum_due', 'interest_charged', 'note'],
    ['', 'alpha', '2029-12-10', '2029-12-30', '', '', '', 9000, 3000, 500, 0, ''],
    ['', 'alpha', '2030-01-10', '2030-01-30', '', '', '', 8000, 4000.75, 600, 0, ''],
    ['', 'beta', '2030-01-05', '2030-01-25', '', '', '', 1200, 1200, 300, 0, ''],
  ],
  Payments: [
    ['pay_id', 'date', 'card_id', 'amount', 'source', 'note', 'from_account', 'created_at'],
    ['p1', '2030-01-09', 'alpha', 999, 'salary', 'before statement, ignored', 'payroll', ''],
    ['p2', '2030-01-15', 'alpha', 1000.75, 'salary', '', 'payroll', ''],
    ['p3', '2030-01-20', 'beta', 1200, 'salary', '', 'payroll', ''],
  ],
  Accounts: [
    ['account_id', 'label', 'type', 'card_id', 'opening_balance', 'opening_date', 'is_savings', 'active'],
    ['payroll', 'Payroll', 'bank', '', 1000, '2030-01-01', false, true],
    ['piggy', 'Piggy Bank', 'bank', '', 5000, '2030-01-01', true, true],
    ['cash', 'Cash', 'cash', '', 200, '2030-01-01', false, true],
    ['alpha', 'Alpha', 'credit_card', 'alpha', '', '', false, true],
    ['beta', 'Beta', 'credit_card', 'beta', '', '', false, true],
  ],
  Transfers: [
    ['transfer_id', 'created_at', 'date', 'from_account', 'to_account', 'amount', 'note'],
    ['tr1', '', '2030-01-14', 'payroll', 'piggy', 300, ''],
    ['tr2', '', '2030-01-16', 'piggy', 'cash', 100, ''],
    ['tr3', '', '2029-12-20', 'payroll', 'piggy', 999, 'before opening date'],
  ],
  Income: [
    ['source_id', 'label', 'amount', 'frequency', 'days', 'to_account', 'in_plan', 'active'],
    ['salary', 'Salary', 20000, 'per_payday', '14,28', 'payroll', true, true],
  ],
  IncomeLog: [
    ['income_id', 'created_at', 'date', 'source_id', 'type', 'amount', 'to_account', 'note'],
    ['i1', '', '2030-01-14', 'salary', 'salary', 20000, 'payroll', ''],
  ],
  Categories: [
    ['category', 'weekly_budget', 'default_method'],
    ['Grocery', 3000, 'alpha'],
    ['Gasoline', '', 'beta'],
    ['Food', '', 'cash'],
  ],
  Transactions: [
    ['txn_id', 'created_at', 'date', 'amount', 'merchant', 'category', 'method_id', 'note', 'source'],
    ['t1', '', '2030-01-12', 150, 'Sample Cafe', 'Food', 'cash', '', 'app'],
    ['t2', '', '2030-01-03', 2500.25, 'Sample Grocer', 'Grocery', 'alpha', '', 'app'],
    ['t3', '', '2030-01-11', 800, 'Sample Pharmacy', 'Health', 'alpha', '', 'app'],
  ],
}

import type { TabValues } from '../google/sheetsApi'

// Made-up data in the same shape as the sheet template. Never put real data here.
export const fixtureTabs = [
  'Guide',
  'Settings',
  'Cards',
  'CC Alpha',
  'CC Beta',
  'CardSnapshots',
  'Installments',
  'Payments',
  'PaymentMethods',
  'Categories',
  'Transactions',
]

export const fixtureValues: TabValues = {
  Settings: [
    ['key', 'value', 'note'],
    ['currency', 'PHP', ''],
    ['salary_per_payday', 20000, ''],
  ],
  Cards: [
    ['card_id', 'bank', 'name', 'sheet_tab', 'credit_limit', 'statement_day', 'due_day', 'monthly_rate', 'payment_mode', 'fixed_payment', 'daily_use', 'status'],
    ['alpha', 'Alpha Bank', 'Alpha', 'CC Alpha', '', 10, 30, 0.03, 'full', '', true, 'active'],
    ['beta', 'Beta Bank', 'Beta', 'CC Beta', '', 5, 25, 0.03, 'full', '', false, 'active'],
    ['gamma', 'Gamma Bank', 'Gamma', '', '', '', '', 0.03, 'full', '', false, 'closed'],
  ],
  'CC Alpha': [
    ['statement_date', 'post_date', 'txn_date', 'description', 'type', 'amount', 'term_no', 'total_terms', 'category', 'note'],
    ['2030-01-10', '2030-01-02', '2029-11-02', 'SAMPLE TV', 'installment', 1000, 3, 6, 'Home', ''],
    ['2030-01-10', '2030-01-03', '2029-12-03', 'SAMPLE FRIDGE', 'installment', 500.5, 2, 2, 'Home', ''],
    ['2030-01-10', '2030-01-05', '2030-01-04', 'SAMPLE GROCER', 'straight', 2500.25, '', '', 'Grocery', ''],
    ['2030-01-10', '2030-01-06', '2030-01-06', 'PAYMENT THANK YOU', 'payment', -4000, '', '', '', ''],
    ['2029-12-10', '2029-12-02', '2029-11-02', 'SAMPLE TV', 'installment', 1000, 2, 6, 'Home', ''],
    ['', '', '', '', '', '', '', '', '', ''],
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
    ['pay_id', 'date', 'card_id', 'amount', 'source', 'note'],
    ['', '2030-01-09', 'alpha', 999, 'salary', 'before statement, ignored'],
    ['', '2030-01-15', 'alpha', 1000.75, 'salary', ''],
    ['', '2030-01-20', 'beta', 1200, 'salary', ''],
  ],
  PaymentMethods: [
    ['method_id', 'label', 'type', 'card_id', 'active'],
    ['alpha', 'Alpha', 'credit_card', 'alpha', true],
    ['cash', 'Cash', 'cash', '', true],
  ],
  Categories: [
    ['category', 'weekly_budget', 'default_method'],
    ['Grocery', 3000, 'alpha'],
    ['Gasoline', '', 'beta'],
  ],
  Transactions: [
    ['txn_id', 'created_at', 'date', 'amount', 'merchant', 'category', 'method_id', 'note', 'source'],
    ['t1', '', '2030-01-12', 150, 'Sample Cafe', 'Food', 'cash', '', 'app'],
  ],
}

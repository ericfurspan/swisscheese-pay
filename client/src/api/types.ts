export interface Account {
  id: number
  account_number: string
  type: string
  balance_cents: number
  created_at: string
}

export interface Transaction {
  id: number
  counterparty: string | null
  memo: string | null
  amount_cents: number
  created_at: string
}

export interface PaymentLink {
  id: number
  token: string
  amount_cents: number
  note: string | null
  created_at: string
}

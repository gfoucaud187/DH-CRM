// Singapore CPF rates effective 2024
// Source: CPF Board (https://www.cpf.gov.sg)

export const CPF_OW_CEILING = 6800  // Ordinary Wage ceiling SGD/month
export const SDL_RATE = 0.0025       // Skills Development Levy 0.25%
export const SDL_MIN = 2             // Minimum SDL SGD

const CPF_RATES: Record<string, { employee: number; employer: number }> = {
  le55:    { employee: 0.20,  employer: 0.17  },
  '55to60':{ employee: 0.15,  employer: 0.135 },
  '60to65':{ employee: 0.105, employer: 0.09  },
  ge65:    { employee: 0.05,  employer: 0.075 },
}

export function calculateCPF(grossSalary: number, ageBracket: string, nationality: string) {
  const sdl = Math.max(SDL_MIN, Math.round(grossSalary * SDL_RATE * 100) / 100)

  if (nationality === 'foreigner') {
    return { cpfEmployee: 0, cpfEmployer: 0, sdl, netSalary: grossSalary }
  }

  const rates = CPF_RATES[ageBracket] ?? CPF_RATES['le55']
  const cappedSalary = Math.min(grossSalary, CPF_OW_CEILING)
  const cpfEmployee = Math.round(cappedSalary * rates.employee * 100) / 100
  const cpfEmployer = Math.round(cappedSalary * rates.employer * 100) / 100
  const netSalary = Math.round((grossSalary - cpfEmployee) * 100) / 100

  return { cpfEmployee, cpfEmployer, sdl, netSalary }
}

export const CPF_BRACKET_LABELS: Record<string, string> = {
  le55:    '≤ 55 years',
  '55to60':'55 – 60 years',
  '60to65':'60 – 65 years',
  ge65:    '≥ 65 years',
}

export const EXPENSE_CATEGORY_ACCOUNTS: Record<string, { code: string; name: string }> = {
  office:       { code: '6300', name: 'Office & Administration' },
  travel:       { code: '6400', name: 'Travel & Entertainment' },
  meals:        { code: '6400', name: 'Travel & Entertainment' },
  utilities:    { code: '6800', name: 'Utilities' },
  professional: { code: '6600', name: 'Professional Fees' },
  marketing:    { code: '6500', name: 'Marketing & Events' },
  rent:         { code: '6200', name: 'Rent' },
  bank_charges: { code: '6700', name: 'Bank Charges' },
  freight:      { code: '5300', name: 'Freight & Logistics' },
  other:        { code: '6950', name: 'Miscellaneous Expenses' },
}

export const PAYMENT_CREDIT_ACCOUNTS: Record<string, { code: string; name: string }> = {
  bank_transfer: { code: '1100', name: 'Cash at Bank - DBS Current' },
  cheque:        { code: '1100', name: 'Cash at Bank - DBS Current' },
  card:          { code: '2100', name: 'Accounts Payable' },
  cash:          { code: '1120', name: 'Petty Cash' },
}

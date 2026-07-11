'use client'
import { Check, AlertCircle } from 'lucide-react'

export const DIAL_CODES = [
  // Preferred
  { code: 'FR', flag: '🇫🇷', name: 'France',           dial: '33'  },
  { code: 'BE', flag: '🇧🇪', name: 'Belgium',          dial: '32'  },
  { code: 'CH', flag: '🇨🇭', name: 'Switzerland',      dial: '41'  },
  { code: 'LU', flag: '🇱🇺', name: 'Luxembourg',       dial: '352' },
  { code: 'MC', flag: '🇲🇨', name: 'Monaco',           dial: '377' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom',   dial: '44'  },
  { code: 'DE', flag: '🇩🇪', name: 'Germany',          dial: '49'  },
  { code: 'ES', flag: '🇪🇸', name: 'Spain',            dial: '34'  },
  { code: 'IT', flag: '🇮🇹', name: 'Italy',            dial: '39'  },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands',      dial: '31'  },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal',         dial: '351' },
  { code: 'AT', flag: '🇦🇹', name: 'Austria',          dial: '43'  },
  { code: 'PL', flag: '🇵🇱', name: 'Poland',           dial: '48'  },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden',           dial: '46'  },
  { code: 'DK', flag: '🇩🇰', name: 'Denmark',          dial: '45'  },
  { code: 'NO', flag: '🇳🇴', name: 'Norway',           dial: '47'  },
  { code: 'FI', flag: '🇫🇮', name: 'Finland',          dial: '358' },
  { code: 'GR', flag: '🇬🇷', name: 'Greece',           dial: '30'  },
  { code: 'CZ', flag: '🇨🇿', name: 'Czech Republic',   dial: '420' },
  { code: 'SK', flag: '🇸🇰', name: 'Slovakia',         dial: '421' },
  { code: 'HU', flag: '🇭🇺', name: 'Hungary',          dial: '36'  },
  { code: 'RO', flag: '🇷🇴', name: 'Romania',          dial: '40'  },
  { code: 'BG', flag: '🇧🇬', name: 'Bulgaria',         dial: '359' },
  { code: 'HR', flag: '🇭🇷', name: 'Croatia',          dial: '385' },
  { code: 'RS', flag: '🇷🇸', name: 'Serbia',           dial: '381' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey',           dial: '90'  },
  { code: 'RU', flag: '🇷🇺', name: 'Russia',           dial: '7'   },
  { code: 'UA', flag: '🇺🇦', name: 'Ukraine',          dial: '380' },
  { code: 'IL', flag: '🇮🇱', name: 'Israel',           dial: '972' },
  { code: 'LB', flag: '🇱🇧', name: 'Lebanon',          dial: '961' },
  { code: 'AM', flag: '🇦🇲', name: 'Armenia',          dial: '374' },
  { code: 'GE', flag: '🇬🇪', name: 'Georgia',          dial: '995' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE',              dial: '971' },
  { code: 'SA', flag: '🇸🇦', name: 'Saudi Arabia',     dial: '966' },
  { code: 'MA', flag: '🇲🇦', name: 'Morocco',          dial: '212' },
  { code: 'DZ', flag: '🇩🇿', name: 'Algeria',          dial: '213' },
  { code: 'TN', flag: '🇹🇳', name: 'Tunisia',          dial: '216' },
  { code: 'SN', flag: '🇸🇳', name: 'Senegal',          dial: '221' },
  { code: 'CI', flag: '🇨🇮', name: "Côte d'Ivoire",    dial: '225' },
  { code: 'CM', flag: '🇨🇲', name: 'Cameroon',         dial: '237' },
  { code: 'CD', flag: '🇨🇩', name: 'DR Congo',         dial: '243' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria',          dial: '234' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya',            dial: '254' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa',     dial: '27'  },
  { code: 'IN', flag: '🇮🇳', name: 'India',            dial: '91'  },
  { code: 'CN', flag: '🇨🇳', name: 'China',            dial: '86'  },
  { code: 'JP', flag: '🇯🇵', name: 'Japan',            dial: '81'  },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore',        dial: '65'  },
  { code: 'HK', flag: '🇭🇰', name: 'Hong Kong',        dial: '852' },
  { code: 'US', flag: '🇺🇸', name: 'United States',    dial: '1'   },
  { code: 'CA', flag: '🇨🇦', name: 'Canada',           dial: '1'   },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil',           dial: '55'  },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico',           dial: '52'  },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina',        dial: '54'  },
  { code: 'PF', flag: '🇵🇫', name: 'French Polynesia', dial: '689' },
  { code: 'NC', flag: '🇳🇨', name: 'New Caledonia',    dial: '687' },
  { code: 'GP', flag: '🇬🇵', name: 'Guadeloupe',       dial: '590' },
  { code: 'MQ', flag: '🇲🇶', name: 'Martinique',       dial: '596' },
  { code: 'RE', flag: '🇷🇪', name: 'Réunion',          dial: '262' },
]

// Sorted longest first to avoid prefix conflicts (e.g. 352 before 35 before 3)
const DIAL_BY_LENGTH = [...DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length)

export function parseDialAndNumber(combined: string): { dial: string; number: string } {
  const digits = combined.replace(/\D/g, '')
  if (!digits) return { dial: '33', number: '' }
  for (const entry of DIAL_BY_LENGTH) {
    if (digits.startsWith(entry.dial)) {
      return { dial: entry.dial, number: digits.slice(entry.dial.length) }
    }
  }
  return { dial: '33', number: digits }
}

function isValid(dial: string, number: string): boolean {
  const digits = number.replace(/\D/g, '')
  const total = dial.length + digits.length
  return digits.length >= 5 && total >= 7 && total <= 15
}

interface Props {
  dialCode: string
  number: string
  onDialChange: (v: string) => void
  onNumberChange: (v: string) => void
  small?: boolean
  className?: string
}

export function PhoneField({
  dialCode, number, onDialChange, onNumberChange, small = false, className = '',
}: Props) {
  const digits = number.replace(/\D/g, '')
  const valid   = digits.length > 0 && isValid(dialCode, number)
  const invalid = digits.length > 0 && !isValid(dialCode, number)
  const h = small ? 'h-8' : 'h-9'

  return (
    <div className={`flex ${className}`}>
      <select
        value={dialCode}
        onChange={e => onDialChange(e.target.value)}
        className={`${h} flex-shrink-0 w-[88px] rounded-l-md border border-r-0 border-gray-200 bg-white px-1.5 text-sm focus:outline-none`}
      >
        {DIAL_CODES.map(d => (
          <option key={d.code} value={d.dial}>{d.flag} +{d.dial}</option>
        ))}
      </select>
      <div className="relative flex-1">
        <input
          type="tel"
          value={number}
          onChange={e => onNumberChange(e.target.value.replace(/[^\d\s\-\(\)]/g, ''))}
          placeholder={small ? '6 12 34 56 78' : '6 12 34 56 78'}
          className={`${h} w-full rounded-r-md border px-2 pr-7 text-sm focus:outline-none ${
            invalid ? 'border-red-300 focus:border-red-400'
            : valid  ? 'border-green-300 focus:border-green-400'
            : 'border-gray-200'
          }`}
        />
        {valid && (
          <Check className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500" />
        )}
        {invalid && (
          <AlertCircle className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-red-400" />
        )}
      </div>
    </div>
  )
}

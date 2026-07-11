'use client'
import ReactPhoneInput from 'react-phone-input-2'
import 'react-phone-input-2/lib/style.css'

interface Props {
  value: string
  onChange: (value: string) => void
  defaultCountry?: string
  small?: boolean
  className?: string
}

export function PhoneInput({ value, onChange, defaultCountry = 'fr', small = false, className = '' }: Props) {
  const height = small ? '32px' : '36px'
  return (
    <div className={className}>
      <ReactPhoneInput
        country={defaultCountry}
        value={value}
        onChange={onChange}
        enableSearch
        searchPlaceholder="Search country..."
        preferredCountries={['fr', 'us', 'gb', 'de', 'es', 'it', 'ch', 'be', 'nl', 'mc', 'lu']}
        containerStyle={{ width: '100%' }}
        inputStyle={{
          width: '100%',
          height,
          fontSize: '14px',
          borderColor: '#e5e7eb',
          borderRadius: '6px',
          fontFamily: 'inherit',
          color: '#111827',
        }}
        buttonStyle={{
          borderColor: '#e5e7eb',
          borderRadius: '6px 0 0 6px',
          backgroundColor: 'white',
        }}
        dropdownStyle={{ fontSize: '13px' }}
      />
    </div>
  )
}

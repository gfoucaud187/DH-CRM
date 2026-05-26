const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://soaemvmboawhjfzhhumi.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvYWVtdm1ib2F3aGpmemhodW1pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTMwMjYxNywiZXhwIjoyMDk0ODc4NjE3fQ.5o1Hh2ge1V6xXXAnh36f452RfzfifX_Bi-5BGEN4Nl4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function test() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'testxyz999@dh.com',
    password: 'Test12',
    email_confirm: true,
  })
  console.log('DATA:', JSON.stringify(data, null, 2))
  console.log('ERROR:', JSON.stringify(error, null, 2))
}

test()

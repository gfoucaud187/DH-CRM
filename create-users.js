const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://soaemvmboawhjfzhhumi.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvYWVtdm1ib2F3aGpmemhodW1pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTMwMjYxNywiZXhwIjoyMDk0ODc4NjE3fQ.5o1Hh2ge1V6xXXAnh36f452RfzfifX_Bi-5BGEN4Nl4'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const users = [
  { email: 'humidorproject@dh.com',  password: 'Hm7xP', customerId: '0d941a37-dc41-4cda-8a16-5a1a83ab5a20' },
  { email: 'alfoldatabak@dh.com',    password: 'Af2kR', customerId: 'e593b692-dd25-4aa8-8ace-c56ac7822f99' },
  { email: 'alphacigars@dh.com',     password: 'Al9nW', customerId: 'd875c857-0a99-4e7c-a9b1-e3985eb8c3da' },
  { email: 'amazonneurope@dh.com',   password: 'Am3vT', customerId: '79b92de1-905e-4ad8-8c76-a44f39b8f3ea' },
  { email: 'augustoint@dh.com',      password: 'Au6bL', customerId: '3aaed520-4c86-48d9-9cfe-8c0f73bef7bf' },
  { email: 'brandsint@dh.com',       password: 'Br5mJ', customerId: '9f07f83c-6977-488e-a71c-1b53c5a0b64a' },
  { email: 'cgptabacos@dh.com',      password: 'Cg8pN', customerId: '8cfe3139-717b-47cc-b070-b47ba49c7540' },
  { email: 'cheztanys@dh.com',       password: 'Ch4qZ', customerId: '2ac49675-2b24-4b4c-82bf-6a9b3283c9fb' },
  { email: 'cigarfamily@dh.com',     password: 'Ci7rX', customerId: '74f72387-4cfe-4ef2-9a9d-b1407a0bb3cf' },
  { email: 'cigarsitaly@dh.com',     password: 'Ct2wY', customerId: 'bc76e14f-73d1-41bb-86e7-2cbf3e14f4d1' },
  { email: 'cigarstrade@dh.com',     password: 'Ck5uV', customerId: '70cb7d07-69fb-461a-b6fe-0e48f9684f4b' },
  { email: 'daraeco@dh.com',         password: 'Da9hS', customerId: '6ac33936-7b57-4c50-8413-dbb11ed123c0' },
  { email: 'eurotabfrance@dh.com',   password: 'Eu3fM', customerId: '6f683339-eba1-4713-9bd2-ae7a6cc3b11c' },
  { email: 'fixmerbelgium@dh.com',   password: 'Fx6cQ', customerId: '878ba9a0-2575-47c0-8bbb-d20d23cb7a20' },
  { email: 'heikopoerz@dh.com',      password: 'Hk1dB', customerId: '38f32342-68a1-4427-889e-aef79c42356f' },
]

async function run() {
  console.log('Step 1: Deleting SQL-created users...\n')

  // Get all @dh.com users
  const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 100 })
  const dhUsers = allUsers.filter(u => u.email.endsWith('@dh.com') && u.email !== 'gf@dh.com' && u.email !== 'distributor@dh.com')

  for (const u of dhUsers) {
    const { error } = await supabase.auth.admin.deleteUser(u.id)
    if (error) console.log(`⚠️  Could not delete ${u.email}: ${error.message}`)
    else console.log(`🗑️  Deleted ${u.email}`)
  }

  console.log('\nStep 2: Creating users via Admin API...\n')
  await new Promise(r => setTimeout(r, 1000))

  for (const u of users) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { role: 'client' },
      })

      if (error) { console.log(`❌ ${u.email} — ${error.message}`); continue }

      const userId = data.user.id
      console.log(`✅ ${u.email} — UUID: ${userId}`)

      await new Promise(r => setTimeout(r, 300))

      // Update profile
      const { error: pErr } = await supabase.from('user_profiles')
        .update({ role: 'client', customer_id: u.customerId })
        .eq('id', userId)
      if (pErr) await supabase.from('user_profiles')
        .upsert({ id: userId, email: u.email, role: 'client', customer_id: u.customerId })

      // Update customer
      await supabase.from('customers').update({
        portal_status: 'active',
        portal_user_id: userId,
        portal_email: u.email,
        portal_password: u.password,
      }).eq('id', u.customerId)

      console.log(`   ✅ Linked to customer`)

    } catch (err) {
      console.log(`❌ ${u.email} — ${err.message}`)
    }
  }

  console.log('\nAll done!')
}

run()

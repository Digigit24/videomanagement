import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://pnltvuhlcapvniudcatn.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubHR2dWhsY2Fwdm5pdWRjYXRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzU3MzMxMywiZXhwIjoyMDczMTQ5MzEzfQ.b4L76xCXYvUJDP1NzLu27hA35NVVAFU0HZpbIzURefI";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function createAdmin() {
  const email = "admin@pulse.com";
  const password = "Letmegoin@007";

  try {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error && error.message.includes("email already registered")) {
      console.log("Admin already exists.");
      return null;
    }

    if (error) throw error;

    console.log("Admin created:", newUser.user.id);

    // Assign role in user_roles table
    const { error: roleErr } = await supabase
      .from('user_roles')
      .insert({ user_id: newUser.user.id, role: 'admin' });

    if (roleErr) throw roleErr;

    console.log("Admin role assigned successfully");

  } catch (err) {
    console.error("Error creating admin:", err);
  }
}

createAdmin();

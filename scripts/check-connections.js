const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function checkConnections() {
  try {
    // 1. Buscar el usuario
    console.log('\n1. Buscando usuario juansegundoferrari@gmail.com...');
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    const devUser = users.find(u => u.email === 'juansegundoferrari@gmail.com');

    if (!devUser) {
      console.error('❌ Usuario no encontrado');
      return;
    }

    console.log('✅ Usuario encontrado:');
    console.log('   ID:', devUser.id);
    console.log('   Email:', devUser.email);

    // 2. Buscar conexiones del usuario
    console.log('\n2. Buscando conexiones del usuario...');
    const { data: connections, error: connError } = await supabaseAdmin
      .from('connections')
      .select('*')
      .eq('user_id', devUser.id);

    if (connError) {
      console.error('❌ Error fetching connections:', connError);
      return;
    }

    if (!connections || connections.length === 0) {
      console.log('❌ No hay conexiones para este usuario');
      console.log('\n💡 Para crear una conexión de prueba, necesitas:');
      console.log('   1. Ir a http://localhost:3001');
      console.log('   2. Navegar a Configuración > Conexiones');
      console.log('   3. Conectar Mercado Pago');
      return;
    }

    console.log(`✅ Se encontraron ${connections.length} conexión(es):\n`);

    connections.forEach((conn, index) => {
      console.log(`Conexión ${index + 1}:`);
      console.log('   Provider:', conn.provider);
      console.log('   Status:', conn.status);
      console.log('   Created:', conn.created_at);
      console.log('   Last synced:', conn.last_synced_at || 'Nunca');
      console.log('   Metadata:', JSON.stringify(conn.metadata, null, 2));
      console.log('');
    });

    // 3. Verificar que el endpoint funcione
    console.log('3. Simulando llamada al endpoint /api/connections...');
    const connectionsService = require('../services/connections/connections.service');
    const userConnections = await connectionsService.getUserConnections(devUser.id);

    console.log(`✅ El servicio devolvió ${userConnections.length} conexión(es)`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkConnections();

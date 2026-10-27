# Sincronización entre dispositivos

La app puede mantener iguales el móvil, el PC y la tablet de forma automática. Para eso usa una cuenta gratuita de Supabase, un servicio de base de datos en la nube. La creas tú una sola vez y los datos quedan en tu cuenta.

- **Coste**: ninguno. El plan gratuito de Supabase no pide tarjeta y sobra para esta app (1 GB de archivos).
- **Qué se guarda**: tu copia de seguridad (partidas, análisis, problemas, ajustes y progreso), en un archivo privado que solo puede leer tu usuario.
- **Cómo funciona**: cada dispositivo descarga la copia de la nube, la fusiona con lo que tiene (sin borrar nada) y sube el resultado. Ocurre al abrir la app, al volver a ella y al pulsar *Sincronizar ahora*.

Tiempo estimado: 5 minutos, mejor desde el PC.

## 1. Crear la cuenta y el proyecto

1. Entra en https://supabase.com y pulsa *Start your project*. Puedes registrarte con tu cuenta de GitHub.
2. Pulsa *New project*.
   - *Name*: `ajedrez-app`.
   - *Database Password*: pulsa *Generate a password* (no la necesitarás en la app, pero guárdala).
   - *Region*: la más cercana, por ejemplo *West EU (Ireland)* o *Central EU (Frankfurt)*.
   - Plan: *Free*.
3. Pulsa *Create new project* y espera un par de minutos a que termine.

## 2. Permitir entrar sin confirmar el correo (recomendado)

Así puedes entrar desde la app instalada en el iPhone sin tener que abrir enlaces de correo.

1. En el menú izquierdo: *Authentication*, *Sign In / Providers* (o *Providers*), *Email*.
2. Desactiva *Confirm email* y guarda.

Si prefieres dejarlo activado, al crear la cuenta te llegará un correo: ábrelo, confirma y después pulsa *Entrar* en la app.

## 3. Crear el espacio para la copia

1. En el menú izquierdo: *SQL Editor*, *New query*.
2. Pega este texto y pulsa *Run*:

```sql
-- Carpeta privada para las copias de Ajedrez App
insert into storage.buckets (id, name, public) values ('ajedrez', 'ajedrez', false)
on conflict (id) do nothing;

-- Cada usuario solo puede leer y escribir su propia carpeta
create policy "Ajedrez: leer mi copia" on storage.objects for select to authenticated
  using (bucket_id = 'ajedrez' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Ajedrez: crear mi copia" on storage.objects for insert to authenticated
  with check (bucket_id = 'ajedrez' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Ajedrez: actualizar mi copia" on storage.objects for update to authenticated
  using (bucket_id = 'ajedrez' and (storage.foldername(name))[1] = auth.uid()::text);
```

Debe responder *Success. No rows returned*.

## 4. Copiar los dos datos del proyecto

1. En el menú izquierdo: *Project Settings* (rueda dentada), *API* (o *Data API* y *API Keys*).
2. Copia:
   - *Project URL*, por ejemplo `https://abcdefgh.supabase.co`.
   - La clave *anon* *public* (un texto largo que empieza por `eyJ`). Es pública por diseño: la protección la dan las reglas del paso 3. No copies la clave *service_role*.

Truco para pasarlos al móvil: envíatelos por correo o por una nota compartida.

## 5. Configurar la app en cada dispositivo

1. Abre la app, *Inicio*, tarjeta *Sincronización*.
2. Pega la dirección del proyecto y la clave pública y pulsa *Guardar*.
3. En el primer dispositivo, escribe un correo y una contraseña (mínimo 6 caracteres) y pulsa *Crear cuenta*. En los demás, usa el mismo correo y contraseña y pulsa *Entrar*.
4. La primera sincronización sube tus datos. En los demás dispositivos se descargan y se fusionan con lo que tuvieran.

## Preguntas frecuentes

- **¿Se borra algo al sincronizar?** No. La fusión solo añade: si borras algo en un dispositivo, puede volver desde otro.
- **¿Qué no se sincroniza?** La partida contra un bot que tengas a medias y la propia sesión de cada dispositivo.
- **El proyecto aparece en pausa.** En el plan gratuito, Supabase pausa los proyectos tras una semana sin uso. Entra en supabase.com y pulsa *Restore project*; los datos se conservan.
- **¿Y si no quiero usar Supabase?** La copia manual (Inicio, *Copia de seguridad*) sigue funcionando igual.

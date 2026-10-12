# Class Registration and Support Inbox

A browser-based registration page with a partner support inbox and help chat.

## Files

- `index.html` - registration page
- `support.html` - partner support inbox

## Run

Open `index.html` in a browser.

## Supabase setup

1. Run `supabase-setup.sql` in the Supabase SQL Editor.
2. In Supabase Authentication, create the partner Auth user and disable public sign-ups. Add that user's ID to `public.partner_users`:

	```sql
	insert into public.partner_users (user_id)
	select id from auth.users where lower(email) = lower('partner@example.com')
	on conflict (user_id) do nothing;
	```

3. Configure the shared code in the SQL Editor. Replace both placeholders; use a randomly generated code of at least 24 characters. The database stores a bcrypt hash, not the plaintext code.

	```sql
	insert into public.partner_access_config (singleton, user_id, access_code_hash)
	select true, id, extensions.crypt('REPLACE_WITH_RANDOM_CODE', extensions.gen_salt('bf'))
	from auth.users
	where lower(email) = lower('partner@example.com')
	on conflict (singleton) do update
	  set user_id = excluded.user_id,
			access_code_hash = excluded.access_code_hash,
			updated_at = now();
	```

4. Add `https://saps-bokaro.github.io/Report-Card/support.html` to **Authentication → URL Configuration → Redirect URLs**.
5. Deploy the login function from this repository:

	```sh
	supabase login
	supabase link --project-ref knjrhohyesqxsoessmnr
	supabase functions deploy partner-code-login --no-verify-jwt --use-api
	supabase functions deploy student-chat --no-verify-jwt --use-api
	```

	Both functions use Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY`; never put that key or the shared code in `index.html`.
6. Publish the latest `index.html` and `support.html` to GitHub Pages.

Partner PDF uploads are stored in the `student-documents` bucket, and links are saved in `registrations.url`. The bucket is public so students can open documents from the registration page. Anyone who gets a document URL can view it; do not use this setup for confidential records.

## Note

Chat messages are stored in Supabase and shared across devices. Existing local chats are imported by the support inbox when their registration number matches one registration. Visitors can chat using any registration number with a help-chat class from XII/A through XII/K; the number is only a chat label, not identity verification. Anyone who guesses a class and registration number can read and send messages in that chat. Do not use chat for sensitive information without adding a stronger verification method.
# Resend setup

The Commerce application uses Resend to send workflow emails. Verify a sending domain in Resend, then choose a sender address on that domain and create a sending API key.

Configure `RESEND_FROM` with the sender email address and `RESEND_TOKEN` with the API key in the `apps/web` and `apps/api` environments. Both applications currently validate these values. Keep the token server-only. Restart development or redeploy after changing the configuration, then verify delivery through the application's email workflow and Resend delivery logs.

Use your own sender and recipient configuration. Registration also requires `REGISTRATION_APPROVER_EMAIL` and `ADMIN_URL` in the API environment for its approval workflow.

See Resend's [verified-domain guide](https://resend.com/docs/dashboard/domains/introduction) and [API-key guide](https://resend.com/docs/dashboard/api-keys/introduction) for dashboard instructions.

Compose shows these steps when the Commerce API is selected. It does not verify a domain, create an API key or send email.

# Stripe setup

The Commerce API uses the existing Stripe card-payment integration. Its configuration requires `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY` in the `apps/api` environment. Use keys belonging to the same Stripe account and mode. Keep the secret key on the server; the API supplies the publishable configuration needed by checkout.

Start with a Stripe sandbox and its test credentials. Restart development or redeploy the API after changing its environment, then verify card checkout with Stripe's testing tools. Use live credentials only for the intended live deployment. Current key validation expects publishable (`pk_`) and secret (`sk_`) keys.

See Stripe's [API-key documentation](https://docs.stripe.com/keys) and [testing documentation](https://docs.stripe.com/testing) for account setup and testing details.

Compose shows these setup steps when the Commerce API is selected. It does not create Stripe resources, change credentials or make payments.

# Authentication

Nobody types a password in wishalia. The API runs [Better Auth](https://www.better-auth.com) and
offers three ways in:

| Who        | How                                                                              |
| ---------- | -------------------------------------------------------------------------------- |
| The owners | Their OIDC provider (Authelia, Authentik, Keycloak...), or a magic link.         |
| The family | A passkey (fingerprint, face, phone PIN), or a magic link sent by email.         |
| Guests     | Nothing: their nominative share link is enough to contribute, no account needed. |

## Invitation only

Only the owners can create their account by themselves: the emails of `auth.ownerEmails`
(`OWNER_EMAILS`). Everyone else joins through an invitation, which creates their account. A magic
link asked for an unknown address signs nobody up.

## Sessions

A session lasts 30 days and is renewed once a day while it is used. The cookie is
`__Secure-wishalia.session_token`: HttpOnly, Secure, SameSite=Lax, signed with `AUTH_SECRET`.

The management app and the public view share one session through `COOKIE_DOMAIN`, the parent
domain of the two hosts. A `__Host-` cookie cannot carry a Domain, so the shared cookie is
`__Secure-`; `__Host-` stays for the cookies of one host (CSRF). The chart sets the domain to
`hosts.public` when `hosts.app` is a subdomain of it.

## How a request flows

The API is internal. The management app proxies `/auth/*` to it, server side, so that the cookies
are set on the management host and the browser never talks to the API:

```
browser ──> app.<product>.<domain>/auth/* ──> web-app (proxy) ──> api /auth/*
```

The proxy passes on the cookie, the origin and the content type, and sets `X-Forwarded-For` to the
real client address, which the rate limit uses. `/manage/*` answers 401 to any request without a
valid session.

## OIDC

Create a client in your provider:

| Setting      | Value                                    |
| ------------ | ---------------------------------------- |
| Redirect URI | `https://<hosts.app>/auth/callback/oidc` |
| Scopes       | `openid email profile`                   |
| Grant        | Authorization code, with PKCE            |

Then set `auth.oidc.issuer` and `auth.oidc.clientId`, and put `OIDC_CLIENT_SECRET` in the Secret.
The email the provider returns must be in `auth.ownerEmails` for the first sign-in.

### With Authentik

In Authentik, under **Applications > Providers**, create an **OAuth2/OpenID Provider**:

| Setting                    | Value                                                     |
| -------------------------- | --------------------------------------------------------- |
| Name                       | `wishalia`                                                |
| Authorization flow         | `default-provider-authorization-implicit-consent`         |
| Client type                | Confidential                                              |
| Client ID                  | `wishalia` (or the one Authentik suggests)                |
| Client Secret              | the one Authentik suggests, kept for `OIDC_CLIENT_SECRET` |
| Redirect URIs              | Strict, `https://<hosts.app>/auth/callback/oidc`          |
| Scopes                     | `openid`, `email`, `profile` (the default mappings)       |
| Subject mode               | Based on the User's hashed ID                             |
| Include claims in id_token | on                                                        |

Then, under **Applications > Applications**, create an application with a slug, for example
`wishalia`, bound to that provider, and bind to it the group (or users) who may sign in. Only
the emails of `auth.ownerEmails` create their account this way; the others need an invitation
first, and Authentik must give the same email as the invitation.

The issuer is the provider's URL, with its trailing slash:

```yaml
auth:
  ownerEmails: you@example.com
  oidc:
    issuer: https://authentik.example.com/application/o/wishalia/
    clientId: wishalia
    name: Authentik
existingSecret: wishalia-secrets # holds OIDC_CLIENT_SECRET
```

The same with a blueprint, for an Authentik managed in git. `!Env` reads the client secret from
the environment of the Authentik worker, so that it stays out of the repository:

```yaml
version: 1
metadata:
  name: wishalia
  labels:
    blueprints.goauthentik.io/instantiate: "true"
entries:
  - model: authentik_providers_oauth2.oauth2provider
    identifiers:
      name: wishalia
    attrs:
      name: wishalia
      client_type: confidential
      # Must be explicit: an empty list makes Authentik refuse /authorize
      grant_types: [authorization_code, refresh_token]
      client_id: wishalia
      client_secret: !Env WISHALIA_clientSecret
      include_claims_in_id_token: true
      issuer_mode: per_provider
      sub_mode: hashed_user_id
      signing_key: !Find [authentik_crypto.certificatekeypair, [name, authentik Self-signed Certificate]]
      authorization_flow:
        !Find [authentik_flows.flow, [slug, default-provider-authorization-implicit-consent]]
      invalidation_flow: !Find [authentik_flows.flow, [slug, default-provider-invalidation-flow]]
      redirect_uris:
        - matching_mode: strict
          url: https://app.wishalia.example.com/auth/callback/oidc
      property_mappings:
        - !Find [
            authentik_providers_oauth2.scopemapping,
            [name, "authentik default OAuth Mapping: OpenID 'openid'"],
          ]
        - !Find [
            authentik_providers_oauth2.scopemapping,
            [name, "authentik default OAuth Mapping: OpenID 'email'"],
          ]
        - !Find [
            authentik_providers_oauth2.scopemapping,
            [name, "authentik default OAuth Mapping: OpenID 'profile'"],
          ]
  - model: authentik_core.application
    identifiers:
      slug: wishalia
    attrs:
      name: Wishalia
      slug: wishalia
      provider: !Find [authentik_providers_oauth2.oauth2provider, [name, wishalia]]
      policy_engine_mode: any
      meta_launch_url: https://app.wishalia.example.com
  - model: authentik_policies.policybinding
    identifiers:
      order: 0
      target: !Find [authentik_core.application, [slug, wishalia]]
    attrs:
      group: !Find [authentik_core.group, [name, family]]
      order: 0
      target: !Find [authentik_core.application, [slug, wishalia]]
```

Signing in with Authentik and with a passkey or a magic link leads to the same account when the
emails match.

## Magic links

Set `SMTP_URL` (Secret) and `auth.mailFrom`. A link works once, for 15 minutes, and only its hash
is stored. The email is short, in plain words, with a big button and the link written out, and says
nothing about any list. Without SMTP, magic links are off and passkeys and OIDC remain; in
development they are printed in the API log.

## Passkeys

A passkey is a key pair kept by the phone or computer, often synced by its password manager (iCloud
Keychain, Google Password Manager...). The person adds one in the management app's settings, then
signs in with the fingerprint, the face or the device's code.

- **Discoverable** (`residentKey: required`): the passkey holds the account, so signing in asks for
  no email. The sign-in page also offers it in the e-mail field's suggestions (conditional UI).
- **Recent sign-in to add one**: registering needs a session of less than a day (`freshAge`), so an
  old stolen session cannot add its own passkey.
- **Bound to the domain**: the relying party is `COOKIE_DOMAIN` (the parent domain of the two hosts),
  or the management host without it, and the API accepts only the origins of the two hosts. A
  passkey made for another site never signs in here.
- **No attestation** is asked: the device's make stays private.
- The challenge waits in a signed, HttpOnly cookie for five minutes and works once. The database
  keeps the public key and the signature counter, never anything secret.

The browser talks to `/auth/passkey/*` on the management host, which the app proxies to the API like
the rest of `/auth/*`.

## Protections

- Origin and CSRF checks on every state-changing request, in the tests too (Better Auth skips them
  under test by default; wishalia turns them back on).
- Redirects after sign-in only go to the two hosts.
- Rate limit: 30 requests a minute per client address on `/auth/*`.
- OAuth tokens are encrypted in the database; passkeys store only their public key.

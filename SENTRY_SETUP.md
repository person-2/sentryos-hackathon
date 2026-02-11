# Sentry Setup Guide

This project has been configured with Sentry for error tracking, performance monitoring, and session replay.

## Configuration Files Added

- `sentry.client.config.ts` - Client-side Sentry initialization
- `sentry.server.config.ts` - Server-side Sentry initialization
- `sentry.edge.config.ts` - Edge runtime Sentry initialization
- `src/instrumentation.ts` - Next.js instrumentation for Sentry
- `next.config.ts` - Updated with Sentry webpack plugin
- `.env.local.example` - Example environment variables
- `.env.sentry-build-plugin` - Sentry build plugin configuration

## Setup Steps

### 1. Create a Sentry Project

1. Go to [https://sentry.io](https://sentry.io) and sign up or log in
2. Create a new project and select "Next.js" as the platform
3. Copy your DSN from the project settings

### 2. Configure Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Update `.env.local` with your Sentry configuration:

```env
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id
SENTRY_DSN=https://your-dsn@sentry.io/your-project-id
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=your-auth-token
```

### 3. Get Your Sentry Auth Token

To upload source maps (for better error tracking):

1. Go to https://sentry.io/orgredirect/organizations/YOUR_ORG/settings/auth-tokens/
2. Create a new auth token with the following scopes:
   - `project:read`
   - `project:releases`
   - `org:read`
3. Copy the token and add it to your `.env.local` and `.env.sentry-build-plugin`

### 4. Test Your Setup

Test that Sentry is working by creating a test error:

```typescript
// In any component or page
<button onClick={() => {
  throw new Error("Test Sentry error!");
}}>
  Trigger Test Error
</button>
```

Click the button and check your Sentry dashboard to see if the error appears.

## Features Enabled

- ✅ Error tracking (client & server)
- ✅ Performance monitoring
- ✅ Session Replay (with privacy settings)
- ✅ Source map uploads for readable stack traces
- ✅ Automatic instrumentation
- ✅ Ad-blocker bypass via `/monitoring` tunnel route

## Adjusting Sample Rates

For production, you may want to adjust the sample rates in the Sentry config files:

- `tracesSampleRate`: Controls performance monitoring sampling (0.0 to 1.0)
- `replaysSessionSampleRate`: Controls session replay sampling (0.0 to 1.0)
- `replaysOnErrorSampleRate`: Controls replay capture when errors occur (0.0 to 1.0)

## Learn More

- [Sentry Next.js Documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Session Replay](https://docs.sentry.io/product/session-replay/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)

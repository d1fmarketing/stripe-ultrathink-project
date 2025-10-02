export function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.URL ||           // Netlify production
    process.env.DEPLOY_PRIME_URL || // Netlify previews
    'http://localhost:3000'
  )
}